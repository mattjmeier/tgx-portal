#!/usr/bin/env python3
"""Bootstrap a first-pass STORY-001 schema in Directus via supported REST APIs."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


BASE_URL = (os.environ.get("DIRECTUS_URL") or os.environ.get("DIRECTUS_PUBLIC_URL") or "http://localhost:8055").rstrip("/")
ADMIN_EMAIL = os.environ.get("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("DIRECTUS_ADMIN_PASSWORD")

collection_cache: set[str] = set()
field_cache: dict[str, set[str]] = {}
relation_cache: set[tuple[str, str]] = set()


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")


def request_json(method: str, path: str, token: str | None = None, payload: dict | None = None) -> dict:
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


def compact(value):
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [compact(item) for item in value]
    return value


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

    payload = compact({
        "collection": collection,
        "meta": meta,
        "schema": {"name": collection},
    })
    request_json("POST", "/collections", token=token, payload=payload)
    collection_cache.add(collection)
    print(f"CREATE collection {collection}")


def create_field(token: str, collection: str, field: str, field_type: str, *, meta: dict | None = None, schema: dict | None = None) -> None:
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


def create_relation(token: str, *, collection: str, field: str, related_collection: str, meta: dict | None = None, schema: dict | None = None) -> None:
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


def main() -> int:
    token = login()
    refresh_collections(token)
    refresh_relations(token)

    create_collection(
        token,
        "projects",
        {
            "icon": "assignment",
            "note": "Collaborator-facing project intake and lifecycle.",
            "display_template": "{{title}}",
            "accountability": "all",
            "sort": 10,
            "hidden": False,
            "singleton": False,
        },
    )
    create_collection(
        token,
        "studies",
        {
            "icon": "science",
            "note": "Study definitions scoped to a project.",
            "display_template": "{{species}} {{celltype}}",
            "accountability": "all",
            "sort": 20,
            "hidden": False,
            "singleton": False,
        },
    )
    create_collection(
        token,
        "samples",
        {
            "icon": "biotech",
            "note": "Samples scoped to a study.",
            "display_template": "{{sample_ID}}",
            "accountability": "all",
            "sort": 30,
            "hidden": False,
            "singleton": False,
        },
    )
    create_collection(
        token,
        "assays",
        {
            "icon": "analytics",
            "note": "Assays scoped to a sample.",
            "display_template": "{{platform}}",
            "accountability": "all",
            "sort": 40,
            "hidden": False,
            "singleton": False,
        },
    )
    create_collection(
        token,
        "sample_plating",
        {
            "icon": "grid_on",
            "note": "Optional plating metadata per sample.",
            "display_template": "Plate {{plate_number}} {{plate_well}}",
            "accountability": "all",
            "sort": 50,
            "hidden": False,
            "singleton": False,
        },
    )

    for sort, name, note in [
        (110, "platform_options", "Supported assay platforms."),
        (120, "genome_versions", "Genome / annotation bundle choices."),
        (130, "quantification_methods", "Quantification methods."),
        (140, "species_options", "Species lookup."),
        (150, "biospyder_databases", "TempO-Seq Biospyder database selections."),
        (160, "biospyder_manifests", "TempO-Seq Biospyder manifest selections."),
        (170, "projects_biospyder_databases", "Junction for projects and biospyder databases."),
    ]:
        is_lookup = name in {
            "platform_options",
            "genome_versions",
            "quantification_methods",
            "species_options",
            "biospyder_databases",
            "biospyder_manifests",
        }
        create_collection(
            token,
            name,
            {
                "icon": "list" if "projects_biospyder" not in name else "link",
                "note": note,
                "display_template": "{{name}}" if "projects_biospyder" not in name else None,
                "accountability": "all",
                "sort": sort,
                "group": "Lookups" if is_lookup else None,
                "hidden": name == "projects_biospyder_databases",
                "singleton": False,
            },
        )

    for lookup in [
        "platform_options",
        "genome_versions",
        "quantification_methods",
        "species_options",
        "biospyder_databases",
        "biospyder_manifests",
    ]:
        create_field(
            token,
            lookup,
            "name",
            "string",
            meta={"interface": "input", "required": True},
            schema={"is_nullable": False, "max_length": 255},
        )
        create_field(
            token,
            lookup,
            "code",
            "string",
            meta={"interface": "input", "required": True},
            schema={"is_nullable": False, "max_length": 64, "is_unique": True},
        )

    project_fields = [
        ("title", "string", {"interface": "input", "required": True}, {"is_nullable": False, "max_length": 255}),
        ("pi_name", "string", {"interface": "input", "required": True}, {"is_nullable": False, "max_length": 255}),
        ("researcher_name", "string", {"interface": "input", "required": True}, {"is_nullable": False, "max_length": 255}),
        ("description", "text", {"interface": "input-multiline", "required": False}, {"is_nullable": True}),
        (
            "status",
            "string",
            {
                "interface": "select-dropdown",
                "required": True,
                "options": {
                    "choices": [
                        {"text": "Draft", "value": "draft"},
                        {"text": "Submitted", "value": "submitted"},
                        {"text": "Intake Ready", "value": "intake_ready"},
                        {"text": "Active", "value": "active"},
                        {"text": "Archived", "value": "archived"},
                    ]
                },
            },
            {"is_nullable": False, "max_length": 50, "default_value": "draft"},
        ),
        (
            "intake_platform",
            "string",
            {
                "interface": "select-dropdown",
                "required": True,
                "options": {
                    "choices": [
                        {"text": "TempO-Seq", "value": "TempO-Seq"},
                        {"text": "RNA-Seq", "value": "RNA-Seq"},
                        {"text": "Other", "value": "Other"},
                    ]
                },
            },
            {"is_nullable": False, "max_length": 50},
        ),
        ("client_user", "uuid", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
        ("bioinformatician_assigned", "uuid", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
        ("biospyder_manifest", "integer", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
        ("plane_sync_status", "string", {"interface": "select-dropdown", "required": False}, {"is_nullable": True, "max_length": 50}),
        ("plane_last_error", "text", {"interface": "input-multiline", "readonly": True}, {"is_nullable": True}),
        ("plane_external_ref", "string", {"interface": "input", "readonly": True}, {"is_nullable": True, "max_length": 255}),
    ]

    for field, field_type, meta, schema in project_fields:
        create_field(token, "projects", field, field_type, meta=meta, schema=schema)

    create_field(
        token,
        "projects",
        "biospyder_databases",
        "alias",
        meta={
            "interface": "list-m2m",
            "special": ["m2m"],
            "required": False,
            "options": {
                "junctionCollection": "projects_biospyder_databases",
                "junctionField": "projects_id",
                "relatedCollection": "biospyder_databases",
                "relatedField": "biospyder_databases_id",
            },
        },
    )

    for collection, definitions in {
        "studies": [
            ("project", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
            ("species", "integer", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
            ("celltype", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("treatment_var", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("batch_var", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("units", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
        ],
        "samples": [
            ("study", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
            ("sample_ID", "string", {"interface": "input", "required": True}, {"is_nullable": False, "max_length": 255}),
            ("sample_name", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("description", "text", {"interface": "input-multiline", "required": False}, {"is_nullable": True}),
            ("group", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("chemical", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("chemical_longname", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
            ("dose", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 255}),
        ],
        "assays": [
            ("sample", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
            ("platform", "integer", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
            ("genome_version", "integer", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
            ("quantification_method", "integer", {"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]}, {"is_nullable": True}),
            ("read_mode", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 50}),
        ],
        "sample_plating": [
            ("sample", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
            ("plate_number", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 50}),
            ("batch", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 50}),
            ("plate_well", "string", {"interface": "input", "required": False}, {"is_nullable": True, "max_length": 20}),
            ("row", "integer", {"interface": "input", "required": False}, {"is_nullable": True}),
            ("column", "integer", {"interface": "input", "required": False}, {"is_nullable": True}),
        ],
        "projects_biospyder_databases": [
            ("projects_id", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
            ("biospyder_databases_id", "integer", {"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]}, {"is_nullable": False}),
        ],
    }.items():
        for field, field_type, meta, schema in definitions:
            create_field(token, collection, field, field_type, meta=meta, schema=schema)

    create_relation(
        token,
        collection="projects",
        field="client_user",
        related_collection="directus_users",
        meta={"many_collection": "projects", "many_field": "client_user", "one_collection": "directus_users"},
        schema={"table": "projects", "column": "client_user", "foreign_key_table": "directus_users", "foreign_key_column": "id", "on_delete": "NO ACTION"},
    )
    create_relation(
        token,
        collection="projects",
        field="bioinformatician_assigned",
        related_collection="directus_users",
        meta={"many_collection": "projects", "many_field": "bioinformatician_assigned", "one_collection": "directus_users"},
        schema={"table": "projects", "column": "bioinformatician_assigned", "foreign_key_table": "directus_users", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="projects",
        field="biospyder_manifest",
        related_collection="biospyder_manifests",
        meta={"many_collection": "projects", "many_field": "biospyder_manifest", "one_collection": "biospyder_manifests"},
        schema={"table": "projects", "column": "biospyder_manifest", "foreign_key_table": "biospyder_manifests", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="studies",
        field="project",
        related_collection="projects",
        meta={"many_collection": "studies", "many_field": "project", "one_collection": "projects"},
        schema={"table": "studies", "column": "project", "foreign_key_table": "projects", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="studies",
        field="species",
        related_collection="species_options",
        meta={"many_collection": "studies", "many_field": "species", "one_collection": "species_options"},
        schema={"table": "studies", "column": "species", "foreign_key_table": "species_options", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="samples",
        field="study",
        related_collection="studies",
        meta={"many_collection": "samples", "many_field": "study", "one_collection": "studies"},
        schema={"table": "samples", "column": "study", "foreign_key_table": "studies", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="assays",
        field="sample",
        related_collection="samples",
        meta={"many_collection": "assays", "many_field": "sample", "one_collection": "samples"},
        schema={"table": "assays", "column": "sample", "foreign_key_table": "samples", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="assays",
        field="platform",
        related_collection="platform_options",
        meta={"many_collection": "assays", "many_field": "platform", "one_collection": "platform_options"},
        schema={"table": "assays", "column": "platform", "foreign_key_table": "platform_options", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="assays",
        field="genome_version",
        related_collection="genome_versions",
        meta={"many_collection": "assays", "many_field": "genome_version", "one_collection": "genome_versions"},
        schema={"table": "assays", "column": "genome_version", "foreign_key_table": "genome_versions", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="assays",
        field="quantification_method",
        related_collection="quantification_methods",
        meta={"many_collection": "assays", "many_field": "quantification_method", "one_collection": "quantification_methods"},
        schema={"table": "assays", "column": "quantification_method", "foreign_key_table": "quantification_methods", "foreign_key_column": "id", "on_delete": "SET NULL"},
    )
    create_relation(
        token,
        collection="sample_plating",
        field="sample",
        related_collection="samples",
        meta={"many_collection": "sample_plating", "many_field": "sample", "one_collection": "samples"},
        schema={"table": "sample_plating", "column": "sample", "foreign_key_table": "samples", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="projects_biospyder_databases",
        field="projects_id",
        related_collection="projects",
        meta={"many_collection": "projects_biospyder_databases", "many_field": "projects_id", "one_collection": "projects"},
        schema={"table": "projects_biospyder_databases", "column": "projects_id", "foreign_key_table": "projects", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )
    create_relation(
        token,
        collection="projects_biospyder_databases",
        field="biospyder_databases_id",
        related_collection="biospyder_databases",
        meta={"many_collection": "projects_biospyder_databases", "many_field": "biospyder_databases_id", "one_collection": "biospyder_databases", "junction_field": "projects_id"},
        schema={"table": "projects_biospyder_databases", "column": "biospyder_databases_id", "foreign_key_table": "biospyder_databases", "foreign_key_column": "id", "on_delete": "CASCADE"},
    )

    print("")
    print("Bootstrap complete.")
    print("Next steps:")
    print("1. Open Directus and confirm the collections appear.")
    print("2. Refine UI metadata/permissions in the app.")
    print("3. Export a real snapshot from the running instance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
