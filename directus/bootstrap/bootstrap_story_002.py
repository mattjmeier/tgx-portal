#!/usr/bin/env python3
"""Bootstrap a first-pass STORY-002 schema in Directus via supported REST APIs.

This script intentionally focuses on the minimum viable pieces required for the
in-Directus sample intake workflow:

- `sample_intake_uploads` collection
- fields required by the validate/commit hook
- relations to `studies` and `directus_files`
- presets for `write_mode` defaults

It does NOT attempt to recreate full UI metadata, RBAC, or flows from the
generated snapshot YAML. After applying, export a real Directus snapshot and
use that as the repeatable baseline.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
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


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")


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
    field_cache[collection] = {
        item["field"] for item in result.get("data", []) if item.get("field")
    }


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


def main() -> int:
    token = login()
    refresh_collections(token)
    refresh_relations(token)

    if not collection_exists(token, "studies"):
        fail("Missing required collection 'studies'. Apply STORY-001 bootstrap first.")

    create_collection(
        token,
        "sample_intake_uploads",
        {
            "icon": "upload_file",
            "note": "Bioinformatician workflow for CSV/TSV preview, validation, and commit.",
            "display_template": "Intake {{status}}",
            "accountability": "all",
            "sort": 60,
            "hidden": False,
            "singleton": False,
        },
    )

    # Core intake inputs
    create_field(
        token,
        "sample_intake_uploads",
        "study",
        "integer",
        meta={"interface": "select-dropdown-m2o", "required": True, "special": ["m2o"]},
        schema={"is_nullable": False},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "file_type",
        "string",
        meta={"interface": "input", "required": True},
        schema={"is_nullable": False, "max_length": 10, "default_value": "tsv"},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "write_mode",
        "string",
        meta={
            "interface": "select-dropdown",
            "required": True,
            "options": {
                "choices": [
                    {"text": "Upsert (create/update)", "value": "upsert"},
                    {"text": "Create only (fail if exists)", "value": "create_only"},
                ]
            },
        },
        schema={"is_nullable": False, "max_length": 20, "default_value": "upsert"},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "source_type",
        "string",
        meta={"interface": "input", "required": True},
        schema={"is_nullable": False, "max_length": 10, "default_value": "text"},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "source_text",
        "text",
        meta={"interface": "input-multiline", "required": False},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "source_file",
        "uuid",
        meta={"interface": "select-dropdown-m2o", "required": False, "special": ["m2o"]},
        schema={"is_nullable": True},
    )

    # Workflow control + results (written by hook)
    create_field(
        token,
        "sample_intake_uploads",
        "status",
        "string",
        meta={"interface": "input", "required": True},
        schema={"is_nullable": False, "max_length": 20, "default_value": "draft"},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "validate_requested",
        "boolean",
        meta={"interface": "boolean", "required": True},
        schema={"is_nullable": False, "default_value": False},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "commit_requested",
        "boolean",
        meta={"interface": "boolean", "required": True},
        schema={"is_nullable": False, "default_value": False},
    )

    for name in ["row_count", "valid_row_count", "invalid_row_count"]:
        create_field(
            token,
            "sample_intake_uploads",
            name,
            "integer",
            meta={"interface": "numeric", "required": False, "readonly": True},
            schema={"is_nullable": True},
        )

    for name in ["preview_rows", "validation_errors", "validation_summary", "commit_result"]:
        create_field(
            token,
            "sample_intake_uploads",
            name,
            "json",
            meta={"interface": "input-code", "required": False},
            schema={"is_nullable": True},
        )

    create_field(
        token,
        "sample_intake_uploads",
        "validated_hash",
        "string",
        meta={"interface": "input", "required": False, "hidden": True},
        schema={"is_nullable": True, "max_length": 128},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "validated_at",
        "timestamp",
        meta={"interface": "datetime", "required": False, "readonly": True},
        schema={"is_nullable": True},
    )
    create_field(
        token,
        "sample_intake_uploads",
        "committed_at",
        "timestamp",
        meta={"interface": "datetime", "required": False, "readonly": True},
        schema={"is_nullable": True},
    )

    create_relation(
        token,
        collection="sample_intake_uploads",
        field="study",
        related_collection="studies",
        meta={
            "many_collection": "sample_intake_uploads",
            "many_field": "study",
            "one_collection": "studies",
        },
        schema={
            "table": "sample_intake_uploads",
            "column": "study",
            "foreign_key_table": "studies",
            "foreign_key_column": "id",
            "on_delete": "CASCADE",
        },
    )
    create_relation(
        token,
        collection="sample_intake_uploads",
        field="source_file",
        related_collection="directus_files",
        meta={
            "many_collection": "sample_intake_uploads",
            "many_field": "source_file",
            "one_collection": "directus_files",
        },
        schema={
            "table": "sample_intake_uploads",
            "column": "source_file",
            "foreign_key_table": "directus_files",
            "foreign_key_column": "id",
            "on_delete": "SET NULL",
        },
    )

    print("")
    print("Bootstrap complete.")
    print("Next steps:")
    print("1. Open Directus and confirm `sample_intake_uploads` appears.")
    print("2. Export a real snapshot from the running instance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
