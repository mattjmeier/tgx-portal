#!/usr/bin/env python3
"""Bootstrap STORY-004 (Workflow Configuration Export) via Directus REST APIs.

This script extends the STORY-001/002/003 bootstrap path with the export-side
collections, fields, relations, and permission deltas needed for workflow
artifact generation:

- `workflow_exports`
- `pipeline_defaults`
- export tracking fields on `projects`
- genome bundle mapping fields on `genome_versions`
- System-role permissions for export creation and project export metadata

It is intentionally conservative and only adds the live-critical pieces. After
applying to a running Directus instance, export a real snapshot and treat that
as authoritative.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = (
    os.environ.get("DIRECTUS_URL")
    or os.environ.get("DIRECTUS_PUBLIC_URL")
    or "http://localhost:8055"
).rstrip("/")
ADMIN_EMAIL = os.environ.get("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("DIRECTUS_ADMIN_PASSWORD")

collection_cache: set[str] = set()
field_cache: dict[str, set[str]] = {}
relation_cache: set[tuple[str, str]] = set()


LOOKUP_COLLECTIONS = [
    "platform_options",
    "genome_versions",
    "quantification_methods",
    "species_options",
    "biospyder_databases",
    "biospyder_manifests",
]

REQUIRED_COLLECTIONS = [
    "projects",
    "studies",
    "samples",
    "assays",
    "sample_plating",
    "projects_biospyder_databases",
    "sample_intake_uploads",
    *LOOKUP_COLLECTIONS,
]

PROJECT_EXPORT_FIELDS = [
    "workflow_export_status",
    "workflow_export_last_generated_at",
    "workflow_export_last_error_code",
    "workflow_export_last_error_message",
    "latest_workflow_export",
]

GENOME_EXPORT_FIELDS = [
    "genomedir",
    "genome_filename",
    "annotation_filename",
    "genome_name",
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")


def compact(value):
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [compact(item) for item in value]
    return value


def request_json(
    method: str,
    path: str,
    *,
    token: str | None = None,
    payload: dict | None = None,
) -> dict:
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


def request_json_fallback(
    method: str,
    paths: list[str],
    *,
    token: str,
    payload: dict | None = None,
) -> dict:
    last: Exception | None = None
    for path in paths:
        try:
            return request_json(method, path, token=token, payload=payload)
        except RuntimeError as exc:
            last = exc
            if " 404 " in str(exc) or " 405 " in str(exc):
                continue
            raise
    raise last or RuntimeError(f"{method} failed for all paths: {paths}")


def login() -> str:
    result = request_json(
        "POST",
        "/auth/login",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    return result["data"]["access_token"]


def refresh_collections(token: str) -> None:
    result = request_json("GET", "/collections", token=token)
    collection_cache.clear()
    for item in result.get("data", []):
        name = item.get("collection")
        if name:
            collection_cache.add(name)


def refresh_fields(token: str, collection: str) -> None:
    result = request_json("GET", f"/fields/{collection}", token=token)
    field_cache[collection] = {item["field"] for item in result.get("data", []) if item.get("field")}


def refresh_relations(token: str) -> None:
    result = request_json("GET", "/relations", token=token)
    relation_cache.clear()
    for item in result.get("data", []):
        collection = item.get("collection")
        field = item.get("field")
        if collection and field:
            relation_cache.add((collection, field))


def collection_exists(token: str, name: str) -> bool:
    if not collection_cache:
        refresh_collections(token)
    return name in collection_cache


def field_exists(token: str, collection: str, field: str) -> bool:
    if collection not in field_cache:
        refresh_fields(token, collection)
    return field in field_cache[collection]


def relation_exists(token: str, collection: str, field: str) -> bool:
    if not relation_cache:
        refresh_relations(token)
    return (collection, field) in relation_cache


def create_collection(token: str, collection: str, meta: dict) -> None:
    if collection_exists(token, collection):
        print(f"SKIP collection {collection}")
        return

    payload = compact(
        {
            "collection": collection,
            "meta": meta,
            "schema": {"name": collection},
        }
    )
    request_json("POST", "/collections", token=token, payload=payload)
    collection_cache.add(collection)
    print(f"CREATE collection {collection}")


def create_field(
    token: str,
    collection: str,
    field: str,
    field_type: str,
    *,
    meta: dict | None = None,
    schema: dict | None = None,
) -> None:
    if field_exists(token, collection, field):
        print(f"SKIP field {collection}.{field}")
        return

    payload = {"field": field, "type": field_type}
    if meta is not None:
        payload["meta"] = meta
    if schema is not None:
        payload["schema"] = schema

    request_json("POST", f"/fields/{collection}", token=token, payload=compact(payload))
    field_cache.setdefault(collection, set()).add(field)
    print(f"CREATE field {collection}.{field}")


def create_relation(
    token: str,
    *,
    collection: str,
    field: str,
    related_collection: str,
    meta: dict | None = None,
    schema: dict | None = None,
) -> None:
    if relation_exists(token, collection, field):
        print(f"SKIP relation {collection}.{field} -> {related_collection}")
        return

    payload = {
        "collection": collection,
        "field": field,
        "related_collection": related_collection,
    }
    if meta is not None:
        payload["meta"] = meta
    if schema is not None:
        payload["schema"] = schema

    request_json("POST", "/relations", token=token, payload=compact(payload))
    relation_cache.add((collection, field))
    print(f"CREATE relation {collection}.{field} -> {related_collection}")


def patch_collection_meta(token: str, collection: str, meta_patch: dict) -> None:
    try:
        request_json("PATCH", f"/collections/{collection}", token=token, payload={"meta": meta_patch})
        print(f"PATCH collection meta {collection}")
    except RuntimeError as exc:
        if "Invalid foreign key" in str(exc) and "group" in meta_patch:
            fallback_patch = {k: v for k, v in meta_patch.items() if k != "group"}
            if fallback_patch:
                request_json("PATCH", f"/collections/{collection}", token=token, payload={"meta": fallback_patch})
                print(f"PATCH collection meta {collection} (without group)")
                return
        raise


def list_system_items(token: str, name: str) -> list[dict]:
    paths = [f"/{name}", f"/items/directus_{name}"]
    result = request_json_fallback("GET", paths, token=token)
    return result.get("data", []) or []


def create_system_item(token: str, name: str, payload: dict) -> dict:
    paths = [f"/{name}", f"/items/directus_{name}"]
    result = request_json_fallback("POST", paths, token=token, payload=payload)
    return result.get("data", result) or {}


def patch_system_item(token: str, name: str, item_id: str, payload: dict) -> dict:
    paths = [f"/{name}/{item_id}", f"/items/directus_{name}/{item_id}"]
    result = request_json_fallback("PATCH", paths, token=token, payload=payload)
    return result.get("data", result) or {}


def ensure_role(token: str, *, name: str, icon: str, description: str) -> str:
    roles = list_system_items(token, "roles")
    existing = next((r for r in roles if r.get("name") == name), None)
    payload = {"name": name, "icon": icon, "description": description}

    if not existing:
        created = create_system_item(token, "roles", payload)
        role_id = created.get("id")
        if not role_id:
            fail(f"Role create did not return an id for {name}")
        print(f"CREATE role {name} ({role_id})")
        return str(role_id)

    role_id = str(existing.get("id"))
    patch = {k: v for k, v in payload.items() if existing.get(k) != v}
    if patch:
        patch_system_item(token, "roles", role_id, patch)
        print(f"PATCH role {name} ({role_id})")
    else:
        print(f"SKIP role {name} ({role_id})")
    return role_id


def ensure_policy(
    token: str,
    *,
    name: str,
    icon: str,
    description: str,
    admin_access: bool,
    app_access: bool,
) -> str:
    policies = list_system_items(token, "policies")
    existing = next((p for p in policies if p.get("name") == name), None)
    payload = {
        "name": name,
        "icon": icon,
        "description": description,
        "admin_access": admin_access,
        "app_access": app_access,
        "enforce_tfa": False,
    }

    if not existing:
        created = create_system_item(token, "policies", payload)
        policy_id = created.get("id")
        if not policy_id:
            fail(f"Policy create did not return an id for {name}")
        print(f"CREATE policy {name} ({policy_id})")
        return str(policy_id)

    policy_id = str(existing.get("id"))
    patch = {k: v for k, v in payload.items() if existing.get(k) != v}
    if patch:
        patch_system_item(token, "policies", policy_id, patch)
        print(f"PATCH policy {name} ({policy_id})")
    else:
        print(f"SKIP policy {name} ({policy_id})")
    return policy_id


def attach_policy_to_role(token: str, role_id: str, policy_id: str) -> None:
    access_rows = list_system_items(token, "access")
    existing = next(
        (
            row
            for row in access_rows
            if str(row.get("role")) == role_id and str(row.get("policy")) == policy_id
        ),
        None,
    )
    if existing:
        print(f"SKIP role-policy {role_id} -> {policy_id}")
        return

    create_system_item(token, "access", {"role": role_id, "policy": policy_id})
    print(f"CREATE role-policy {role_id} -> {policy_id}")


def upsert_permission(token: str, existing_index: dict[tuple[str, str, str], dict], payload: dict) -> None:
    key = (str(payload["policy"]), str(payload["collection"]), str(payload["action"]))
    existing = existing_index.get(key)
    if not existing:
        create_system_item(token, "permissions", payload)
        print(f"CREATE permission {key}")
        return

    permission_id = str(existing.get("id"))
    patch: dict = {}
    for field in ["fields", "permissions", "validation"]:
        if payload.get(field, None) != existing.get(field, None):
            patch[field] = payload.get(field, None)
    if patch:
        patch_system_item(token, "permissions", permission_id, patch)
        print(f"PATCH permission {key}")
    else:
        print(f"SKIP permission {key}")


def upsert_preset(token: str, existing_index: dict[tuple[str, str, str], dict], payload: dict) -> None:
    key = (str(payload.get("role")), str(payload.get("collection")), str(payload.get("bookmark")))
    existing = existing_index.get(key)
    if not existing:
        create_system_item(token, "presets", payload)
        print(f"CREATE preset {key}")
        return

    preset_id = str(existing.get("id"))
    patch: dict = {}
    for field in ["layout", "layout_query", "filter"]:
        if payload.get(field, None) != existing.get(field, None):
            patch[field] = payload.get(field, None)
    if patch:
        patch_system_item(token, "presets", preset_id, patch)
        print(f"PATCH preset {key}")
    else:
        print(f"SKIP preset {key}")


def encode_filter(filter_obj: dict) -> str:
    return urllib.parse.quote(json.dumps(filter_obj, separators=(",", ":")))


def read_items(
    token: str,
    collection: str,
    *,
    filter_obj: dict | None = None,
    limit: int = -1,
    fields: list[str] | None = None,
) -> list[dict]:
    query = [f"limit={limit}"]
    if fields:
        query.append(f"fields={urllib.parse.quote(','.join(fields))}")
    if filter_obj:
        query.append(f"filter={encode_filter(filter_obj)}")
    path = f"/items/{collection}?{'&'.join(query)}"
    result = request_json("GET", path, token=token)
    return result.get("data", []) or []


def create_item(token: str, collection: str, payload: dict) -> dict:
    result = request_json("POST", f"/items/{collection}", token=token, payload=payload)
    return result.get("data") or {}


def ensure_pipeline_defaults_row(token: str) -> None:
    rows = read_items(token, "pipeline_defaults", limit=1, fields=["id"])
    if rows:
        print("SKIP pipeline_defaults singleton row")
        return

    create_item(
        token,
        "pipeline_defaults",
        {
            "qc_defaults": {"min_counts": 10},
            "deseq2_defaults": {"lfc_threshold": 1},
        },
    )
    print("CREATE pipeline_defaults singleton row")


def main() -> int:
    token = login()
    refresh_collections(token)
    refresh_relations(token)

    missing = [name for name in REQUIRED_COLLECTIONS if not collection_exists(token, name)]
    if missing:
        fail(
            "Missing required collections (run STORY-001/002/003 bootstrap first): "
            + ", ".join(missing)
        )

    create_collection(
        token,
        "workflow_exports",
        {
            "icon": "output",
            "note": "Generated Snakemake config artifacts for a project.",
            "display_template": "{{status}} {{platform}}",
            "accountability": "all",
            "sort": 70,
            "hidden": False,
            "singleton": False,
        },
    )
    create_collection(
        token,
        "pipeline_defaults",
        {
            "icon": "tune",
            "note": "Global QC/DESeq2 defaults used during workflow export generation.",
            "display_template": "Pipeline Defaults",
            "accountability": "all",
            "sort": 80,
            "hidden": False,
            "singleton": True,
        },
    )

    patch_collection_meta(token, "workflow_exports", {"accountability": "all"})
    patch_collection_meta(token, "pipeline_defaults", {"accountability": "all"})

    create_field(
        token,
        "projects",
        "workflow_export_status",
        "string",
        meta={"interface": "select-dropdown", "required": False, "readonly": True},
        schema={"is_nullable": True, "max_length": 50},
    )
    create_field(
        token,
        "projects",
        "workflow_export_last_generated_at",
        "timestamp",
        meta={"interface": "datetime", "readonly": True},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "projects",
        "workflow_export_last_error_code",
        "string",
        meta={"interface": "input", "readonly": True},
        schema={"is_nullable": True, "max_length": 100},
    )
    create_field(
        token,
        "projects",
        "workflow_export_last_error_message",
        "text",
        meta={"interface": "input-multiline", "readonly": True},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "projects",
        "latest_workflow_export",
        "integer",
        meta={"interface": "select-dropdown-m2o", "required": False, "readonly": True, "special": ["m2o"]},
        schema={"is_nullable": True},
    )

    create_field(
        token,
        "genome_versions",
        "genomedir",
        "string",
        meta={"interface": "input", "required": False},
        schema={"is_nullable": True, "max_length": 255},
    )
    create_field(
        token,
        "genome_versions",
        "genome_filename",
        "string",
        meta={"interface": "input", "required": False},
        schema={"is_nullable": True, "max_length": 255},
    )
    create_field(
        token,
        "genome_versions",
        "annotation_filename",
        "string",
        meta={"interface": "input", "required": False},
        schema={"is_nullable": True, "max_length": 255},
    )
    create_field(
        token,
        "genome_versions",
        "genome_name",
        "string",
        meta={"interface": "input", "required": False},
        schema={"is_nullable": True, "max_length": 255},
    )

    create_field(
        token,
        "workflow_exports",
        "project",
        "integer",
        meta={"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]},
        schema={"is_nullable": False},
    )
    create_field(
        token,
        "workflow_exports",
        "status",
        "string",
        meta={"interface": "select-dropdown", "required": True},
        schema={"is_nullable": False, "max_length": 20, "default_value": "ready"},
    )
    create_field(
        token,
        "workflow_exports",
        "schema_version",
        "string",
        meta={"interface": "input", "required": True, "readonly": True},
        schema={"is_nullable": False, "max_length": 32},
    )
    create_field(
        token,
        "workflow_exports",
        "platform",
        "string",
        meta={"interface": "input", "required": True, "readonly": True},
        schema={"is_nullable": False, "max_length": 64},
    )
    create_field(
        token,
        "workflow_exports",
        "genome_version",
        "string",
        meta={"interface": "input", "readonly": True},
        schema={"is_nullable": True, "max_length": 64},
    )
    create_field(
        token,
        "workflow_exports",
        "quantification_method",
        "string",
        meta={"interface": "input", "readonly": True},
        schema={"is_nullable": True, "max_length": 64},
    )
    create_field(
        token,
        "workflow_exports",
        "read_mode",
        "string",
        meta={"interface": "input", "readonly": True},
        schema={"is_nullable": True, "max_length": 10},
    )
    create_field(
        token,
        "workflow_exports",
        "config_yaml",
        "text",
        meta={"interface": "input-multiline", "required": True, "readonly": True},
        schema={"is_nullable": False},
    )
    create_field(
        token,
        "workflow_exports",
        "metadata_tsv",
        "text",
        meta={"interface": "input-multiline", "required": True, "readonly": True},
        schema={"is_nullable": False},
    )
    create_field(
        token,
        "workflow_exports",
        "contrasts_tsv",
        "text",
        meta={"interface": "input-multiline", "required": True, "readonly": True},
        schema={"is_nullable": False},
    )
    create_field(
        token,
        "workflow_exports",
        "warnings",
        "json",
        meta={"interface": "input-code", "required": False, "readonly": True, "options": {"language": "json"}},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "workflow_exports",
        "created_at",
        "timestamp",
        meta={"special": ["date-created"], "readonly": True, "interface": "datetime"},
        schema={"is_nullable": False},
    )

    create_field(
        token,
        "pipeline_defaults",
        "qc_defaults",
        "json",
        meta={"interface": "input-code", "required": False, "options": {"language": "json"}},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "pipeline_defaults",
        "deseq2_defaults",
        "json",
        meta={"interface": "input-code", "required": False, "options": {"language": "json"}},
        schema={"is_nullable": True},
    )

    create_relation(
        token,
        collection="workflow_exports",
        field="project",
        related_collection="projects",
        meta={
            "many_collection": "workflow_exports",
            "many_field": "project",
            "one_collection": "projects",
            "one_field": "workflow_exports",
        },
        schema={"table": "workflow_exports", "column": "project", "foreign_key_table": "projects", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="projects",
        field="latest_workflow_export",
        related_collection="workflow_exports",
        meta={
            "many_collection": "projects",
            "many_field": "latest_workflow_export",
            "one_collection": "workflow_exports",
            "one_field": "latest_for_projects",
        },
        schema={"table": "projects", "column": "latest_workflow_export", "foreign_key_table": "workflow_exports", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )

    ensure_pipeline_defaults_row(token)

    admin_role = ensure_role(
        token,
        name="Admin",
        icon="admin_panel_settings",
        description="Full access for administrators and bioinformatics staff.",
    )
    client_role = ensure_role(
        token,
        name="Client",
        icon="account_circle",
        description="Collaborator/client role scoped to assigned projects only.",
    )
    system_role = ensure_role(
        token,
        name="System",
        icon="smart_toy",
        description="Least-privilege automation/integration role for flows/endpoints.",
    )

    admin_policy = ensure_policy(
        token,
        name="Admin",
        icon="admin_panel_settings",
        description="Full access for administrators and bioinformatics staff.",
        admin_access=True,
        app_access=True,
    )
    client_policy = ensure_policy(
        token,
        name="Client",
        icon="account_circle",
        description="Collaborator/client role scoped to assigned projects only.",
        admin_access=False,
        app_access=True,
    )
    system_policy = ensure_policy(
        token,
        name="System",
        icon="smart_toy",
        description="Least-privilege automation/integration role for flows/endpoints.",
        admin_access=False,
        app_access=False,
    )

    attach_policy_to_role(token, admin_role, admin_policy)
    attach_policy_to_role(token, client_role, client_policy)
    attach_policy_to_role(token, system_role, system_policy)

    perms = list_system_items(token, "permissions")
    permission_index: dict[tuple[str, str, str], dict] = {}
    for row in perms:
        if not row.get("policy") or not row.get("collection") or not row.get("action"):
            continue
        permission_index[(str(row["policy"]), str(row["collection"]), str(row["action"]))] = row

    for collection in ["workflow_exports", "pipeline_defaults"]:
        for action in ["create", "read", "update", "delete"]:
            upsert_permission(
                token,
                permission_index,
                {
                    "policy": admin_policy,
                    "collection": collection,
                    "action": action,
                    "fields": ["*"],
                    "permissions": {},
                },
            )

    upsert_permission(
        token,
        permission_index,
        {
            "policy": system_policy,
            "collection": "projects",
            "action": "update",
            "fields": [
                "plane_sync_status",
                "plane_last_error",
                "plane_external_ref",
                *PROJECT_EXPORT_FIELDS,
            ],
            "permissions": {},
        },
    )
    upsert_permission(
        token,
        permission_index,
        {
            "policy": system_policy,
            "collection": "workflow_exports",
            "action": "create",
            "fields": ["*"],
            "permissions": {},
        },
    )
    upsert_permission(
        token,
        permission_index,
        {
            "policy": system_policy,
            "collection": "workflow_exports",
            "action": "read",
            "fields": ["*"],
            "permissions": {},
        },
    )
    upsert_permission(
        token,
        permission_index,
        {
            "policy": system_policy,
            "collection": "pipeline_defaults",
            "action": "read",
            "fields": ["*"],
            "permissions": {},
        },
    )

    presets = list_system_items(token, "presets")
    preset_index: dict[tuple[str, str, str], dict] = {}
    for row in presets:
        if row.get("role") and row.get("collection") and row.get("bookmark"):
            preset_index[(str(row["role"]), str(row["collection"]), str(row["bookmark"]))] = row

    upsert_preset(
        token,
        preset_index,
        {
            "role": admin_role,
            "collection": "workflow_exports",
            "bookmark": "Workflow Exports",
            "layout": "tabular",
            "layout_query": {"sort": ["-created_at"]},
        },
    )
    upsert_preset(
        token,
        preset_index,
        {
            "role": admin_role,
            "collection": "pipeline_defaults",
            "bookmark": "Pipeline Defaults",
            "layout": "raw",
        },
    )

    print("")
    print("Bootstrap complete.")
    print("Next steps:")
    print("1. Load the seeded project if needed: python3 directus/seed/load_sample_project.py")
    print("2. Verify export generation live: python3 directus/bootstrap/verify_story_004_export.py")
    print("3. Export a real Directus snapshot after validation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
