#!/usr/bin/env python3
"""Load a repeatable non-production sample project into Directus.

This script is idempotent enough for local development:
- it upserts lookup rows by `code` (or `name` if `code` isn't available)
- it upserts the sample project by title
- it upserts the study by project + defining fields
- it upserts samples by study + sample_ID
- it upserts assays by sample
- it upserts plating rows by sample
- it upserts one sample_intake_upload row by study + source_text

The goal is a stable fixture for UI checks, RBAC checks, sample intake testing,
and workflow export validation without mixing demo data into schema snapshots.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE = ROOT / "directus" / "seed" / "sample_project.json"

BASE_URL = (
    os.environ.get("DIRECTUS_URL")
    or os.environ.get("DIRECTUS_PUBLIC_URL")
    or "http://localhost:8055"
).rstrip("/")
ADMIN_EMAIL = os.environ.get("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("DIRECTUS_ADMIN_PASSWORD")
SAMPLE_CLIENT_EMAIL = os.environ.get("DIRECTUS_SAMPLE_CLIENT_EMAIL")
FIXTURE_PATH = pathlib.Path(os.environ.get("DIRECTUS_SAMPLE_FIXTURE", DEFAULT_FIXTURE))


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")


def request_json(method: str, path: str, *, token: str | None = None, payload: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    data = None
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"raw": body}
        raise RuntimeError(f"{method} {path} failed: {exc.code} {parsed}") from exc


def login() -> str:
    result = request_json(
        "POST",
        "/auth/login",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    return result["data"]["access_token"]


def encode_filter(filter_obj: dict) -> str:
    return urllib.parse.quote(json.dumps(filter_obj, separators=(",", ":")))


def read_items(token: str, collection: str, *, filter_obj: dict | None = None, limit: int = -1, fields: list[str] | None = None) -> list[dict]:
    query = [f"limit={limit}"]
    if fields:
        query.append(f"fields={urllib.parse.quote(','.join(fields))}")
    if filter_obj:
        query.append(f"filter={encode_filter(filter_obj)}")
    path = f"/items/{collection}?{'&'.join(query)}"
    result = request_json("GET", path, token=token)
    return result.get("data", []) or []


def create_item(token: str, collection: str, payload: dict) -> dict:
    return (request_json("POST", f"/items/{collection}?fields=id", token=token, payload=payload).get("data") or {})


def update_item(token: str, collection: str, item_id: str | int, payload: dict) -> dict:
    return (
        request_json("PATCH", f"/items/{collection}/{item_id}?fields=id", token=token, payload=payload).get("data")
        or {}
    )


def get_current_user(token: str) -> dict:
    return request_json("GET", "/users/me?fields=id,email,role", token=token).get("data") or {}


def resolve_client_user_id(token: str, default_user_id: str) -> str:
    if not SAMPLE_CLIENT_EMAIL:
        return default_user_id
    matches = read_items(
        token,
        "directus_users",
        filter_obj={"email": {"_eq": SAMPLE_CLIENT_EMAIL}},
        limit=1,
        fields=["id", "email"],
    )
    if not matches:
        print(f"WARN: no Directus user found for DIRECTUS_SAMPLE_CLIENT_EMAIL={SAMPLE_CLIENT_EMAIL}; using admin user instead")
        return default_user_id
    return str(matches[0]["id"])


def upsert_lookup(token: str, collection: str, row: dict) -> dict:
    key_field = "code" if "code" in row else "name"
    filter_obj = {key_field: {"_eq": row[key_field]}}
    existing = read_items(token, collection, filter_obj=filter_obj, limit=1, fields=["id", "name", "code"])
    if existing:
        item_id = existing[0]["id"]
        update_item(token, collection, item_id, row)
        print(f"UPDATE lookup {collection}.{row[key_field]}")
        return {**existing[0], **row, "id": item_id}
    created = create_item(token, collection, row)
    print(f"CREATE lookup {collection}.{row[key_field]}")
    return created


def ensure_project(token: str, project_payload: dict) -> dict:
    project_filter = {"title": {"_eq": project_payload["title"]}}
    existing = read_items(
        token,
        "projects",
        filter_obj=project_filter,
        limit=1,
        fields=["id", "title"],
    )
    if existing:
        item_id = existing[0]["id"]
        try:
            update_item(token, "projects", item_id, project_payload)
        except RuntimeError as exc:
            if "biospyder_databases does not exist" not in str(exc):
                raise
            fallback = read_items(token, "projects", filter_obj=project_filter, limit=1, fields=["id", "title"])
            if not fallback:
                raise
        print(f"UPDATE project {project_payload['title']}")
        return {**existing[0], **project_payload, "id": item_id}
    try:
        created = create_item(token, "projects", project_payload)
    except RuntimeError as exc:
        if "biospyder_databases does not exist" not in str(exc):
            raise
        fallback = read_items(token, "projects", filter_obj=project_filter, limit=1, fields=["id", "title"])
        if not fallback:
            raise
        created = fallback[0]
    print(f"CREATE project {project_payload['title']}")
    return created


def ensure_study(token: str, project_id: int | str, payload: dict) -> dict:
    filter_obj = {
        "_and": [
            {"project": {"_eq": project_id}},
            {"species": {"_eq": payload["species"]}},
            {"celltype": {"_eq": payload["celltype"]}},
            {"treatment_var": {"_eq": payload["treatment_var"]}},
            {"batch_var": {"_eq": payload["batch_var"]}},
            {"units": {"_eq": payload["units"]}},
        ]
    }
    existing = read_items(token, "studies", filter_obj=filter_obj, limit=1, fields=["id"])
    record = {"project": project_id, **payload}
    if existing:
        item_id = existing[0]["id"]
        update_item(token, "studies", item_id, record)
        print(f"UPDATE study {payload['species']} / {payload['celltype']}")
        return {"id": item_id, **record}
    created = create_item(token, "studies", record)
    print(f"CREATE study {payload['species']} / {payload['celltype']}")
    return created


def ensure_sample(token: str, study_id: int | str, payload: dict) -> dict:
    existing = read_items(
        token,
        "samples",
        filter_obj={"_and": [{"study": {"_eq": study_id}}, {"sample_ID": {"_eq": payload["sample_ID"]}}]},
        limit=1,
        fields=["id", "sample_ID"],
    )
    record = {"study": study_id, **payload}
    if existing:
        item_id = existing[0]["id"]
        update_item(token, "samples", item_id, record)
        print(f"UPDATE sample {payload['sample_ID']}")
        return {"id": item_id, **record}
    created = create_item(token, "samples", record)
    print(f"CREATE sample {payload['sample_ID']}")
    return created


def ensure_assay(token: str, sample_id: int | str, payload: dict) -> dict:
    existing = read_items(
        token,
        "assays",
        filter_obj={"sample": {"_eq": sample_id}},
        limit=1,
        fields=["id", "sample"],
    )
    record = {"sample": sample_id, **payload}
    if existing:
        item_id = existing[0]["id"]
        update_item(token, "assays", item_id, record)
        print(f"UPDATE assay sample={sample_id}")
        return {"id": item_id, **record}
    created = create_item(token, "assays", record)
    print(f"CREATE assay sample={sample_id}")
    return created


def ensure_plating(token: str, sample_id: int | str, payload: dict) -> dict:
    existing = read_items(
        token,
        "sample_plating",
        filter_obj={"sample": {"_eq": sample_id}},
        limit=1,
        fields=["id", "sample"],
    )
    record = {"sample": sample_id, **payload}
    if existing:
        item_id = existing[0]["id"]
        update_item(token, "sample_plating", item_id, record)
        print(f"UPDATE plating sample={sample_id}")
        return {"id": item_id, **record}
    created = create_item(token, "sample_plating", record)
    print(f"CREATE plating sample={sample_id}")
    return created


def ensure_project_database_link(token: str, project_id: int | str, database_id: int | str) -> dict:
    existing = read_items(
        token,
        "projects_biospyder_databases",
        filter_obj={
            "_and": [
                {"projects_id": {"_eq": project_id}},
                {"biospyder_databases_id": {"_eq": database_id}},
            ]
        },
        limit=1,
        fields=["id", "projects_id", "biospyder_databases_id"],
    )
    if existing:
        print(f"SKIP project database link project={project_id} db={database_id}")
        return existing[0]
    created = create_item(
        token,
        "projects_biospyder_databases",
        {"projects_id": project_id, "biospyder_databases_id": database_id},
    )
    print(f"CREATE project database link project={project_id} db={database_id}")
    return created


def ensure_sample_intake_upload(token: str, study_id: int | str, payload: dict) -> dict:
    source_text = payload["source_text"]
    existing = read_items(
        token,
        "sample_intake_uploads",
        filter_obj={"_and": [{"study": {"_eq": study_id}}, {"source_text": {"_eq": source_text}}]},
        limit=1,
        fields=["id", "study"],
    )
    record = {"study": study_id, **payload}
    if existing:
        item_id = existing[0]["id"]
        update_item(token, "sample_intake_uploads", item_id, record)
        print(f"UPDATE sample intake upload study={study_id}")
        return {"id": item_id, **record}
    created = create_item(token, "sample_intake_uploads", record)
    print(f"CREATE sample intake upload study={study_id}")
    return created


def main() -> int:
    if not FIXTURE_PATH.exists():
        fail(f"Fixture file does not exist: {FIXTURE_PATH}")

    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    token = login()
    me = get_current_user(token)
    admin_user_id = str(me["id"])
    client_user_id = resolve_client_user_id(token, admin_user_id)

    lookup_ids: dict[str, dict[str, int | str]] = {}
    for collection, rows in fixture["lookups"].items():
        lookup_ids[collection] = {}
        for row in rows:
            record = upsert_lookup(token, collection, row)
            lookup_ids[collection][row.get("code") or row["name"]] = record["id"]

    project_payload = {
        **fixture["project"],
        "client_user": client_user_id,
        "bioinformatician_assigned": admin_user_id,
        "biospyder_manifest": lookup_ids["biospyder_manifests"][fixture["project_biospyder_manifest_code"]],
    }
    project = ensure_project(token, project_payload)

    for code in fixture.get("project_biospyder_database_codes", []):
        ensure_project_database_link(token, project["id"], lookup_ids["biospyder_databases"][code])

    for study_fixture in fixture.get("studies", []):
        study_payload = {
            "species": study_fixture["species"],
            "celltype": study_fixture["celltype"],
            "treatment_var": study_fixture["treatment_var"],
            "batch_var": study_fixture["batch_var"],
            "units": study_fixture["units"],
        }
        study = ensure_study(token, project["id"], study_payload)

        for sample_fixture in study_fixture.get("samples", []):
            assay_fixture = dict(sample_fixture["assay"])
            plating_fixture = dict(sample_fixture["plating"])
            sample_payload = {k: v for k, v in sample_fixture.items() if k not in {"assay", "plating"}}
            sample = ensure_sample(token, study["id"], sample_payload)
            ensure_assay(
                token,
                sample["id"],
                {
                    "platform": lookup_ids["platform_options"][assay_fixture["platform_code"]],
                    "genome_version": lookup_ids["genome_versions"][assay_fixture["genome_version_code"]],
                    "quantification_method": lookup_ids["quantification_methods"][assay_fixture["quantification_method_code"]],
                    "read_mode": assay_fixture["read_mode"],
                },
            )
            ensure_plating(token, sample["id"], plating_fixture)

        if study_fixture.get("sample_intake_upload"):
            ensure_sample_intake_upload(token, study["id"], study_fixture["sample_intake_upload"])

    print("")
    print("Seed load complete.")
    print(f"Fixture: {fixture.get('fixture_name')}")
    print(f"Project title: {fixture['project']['title']}")
    print("Next steps:")
    print("1. Open Directus and verify the Golden Sample Project graph appears under Content.")
    print("2. Use the seeded sample_intake_uploads row to test the intake workflow.")
    print("3. Use the seeded project to validate export/generation flows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
