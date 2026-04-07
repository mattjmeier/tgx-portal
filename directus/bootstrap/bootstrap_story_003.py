#!/usr/bin/env python3
"""Bootstrap STORY-003 (Admin lookup + RBAC) in Directus via supported REST APIs.

This script is intentionally conservative:
- It assumes the base schema exists (run STORY-001/002 bootstrap first).
- It adds missing lookup `code` fields (for stable, human-friendly keys).
- It sets collection grouping for admin UX (Lookups / Workflows).
- It creates/updates the three primary roles: Admin, Client, System.
- It applies project-scoped permissions for Client across core collections.
- It applies least-privilege permissions for System to support automation.

After applying, export a real Directus snapshot from the running instance and
use that as the repeatable baseline (do not treat story YAML as migrations).
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


LOOKUP_COLLECTIONS = [
    "platform_options",
    "genome_versions",
    "quantification_methods",
    "species_options",
    "biospyder_databases",
    "biospyder_manifests",
]

CORE_COLLECTIONS = [
    "projects",
    "studies",
    "samples",
    "assays",
    "sample_plating",
    "projects_biospyder_databases",
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
            message = str(exc)
            if " 404 " in message or " 405 " in message:
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


def collection_exists(token: str, name: str) -> bool:
    if not collection_cache:
        refresh_collections(token)
    return name in collection_cache


def field_exists(token: str, collection: str, field: str) -> bool:
    if collection not in field_cache:
        refresh_fields(token, collection)
    return field in field_cache[collection]


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

    payload: dict = {"field": field, "type": field_type}
    if meta is not None:
        payload["meta"] = meta
    if schema is not None:
        payload["schema"] = schema

    request_json("POST", f"/fields/{collection}", token=token, payload=compact(payload))
    field_cache.setdefault(collection, set()).add(field)
    print(f"CREATE field {collection}.{field}")


def patch_collection_meta(token: str, collection: str, meta_patch: dict) -> None:
    try:
        request_json("PATCH", f"/collections/{collection}", token=token, payload={"meta": meta_patch})
        print(f"PATCH collection meta {collection}")
    except RuntimeError as exc:
        # Directus collection grouping expects a valid collection key in
        # `meta.group`, not an arbitrary UI label. On a fresh instance the
        # friendly labels from the blueprint ("Lookups", "Workflows") won't
        # exist, so keep the bootstrap focused on the live-critical bits:
        # accountability, roles, and permissions.
        if "Invalid foreign key" in str(exc) and "group" in meta_patch:
            fallback_patch = {k: v for k, v in meta_patch.items() if k != "group"}
            if fallback_patch:
                request_json(
                    "PATCH",
                    f"/collections/{collection}",
                    token=token,
                    payload={"meta": fallback_patch},
                )
                print(f"PATCH collection meta {collection} (without group)")
                return
            print(f"SKIP collection group {collection}")
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
    payload = {
        "name": name,
        "icon": icon,
        "description": description,
    }

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


def main() -> int:
    token = login()
    refresh_collections(token)

    required = set(LOOKUP_COLLECTIONS + CORE_COLLECTIONS + ["sample_intake_uploads"])
    missing = [name for name in sorted(required) if not collection_exists(token, name)]
    if missing:
        fail(
            "Missing required collections (run STORY-001/002 bootstrap first): "
            + ", ".join(missing)
        )

    # Ensure lookup collections are admin-friendly and stable.
    for lookup in LOOKUP_COLLECTIONS:
        patch_collection_meta(token, lookup, {"group": "Lookups", "accountability": "all"})
        create_field(
            token,
            lookup,
            "code",
            "string",
            meta={"interface": "input", "required": True},
            schema={"is_nullable": False, "max_length": 64, "is_unique": True},
        )

    patch_collection_meta(token, "sample_intake_uploads", {"group": "Workflows", "accountability": "all"})

    # Roles
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

    # Permissions
    perms = list_system_items(token, "permissions")
    index: dict[tuple[str, str, str], dict] = {}
    for p in perms:
        if not p.get("policy") or not p.get("collection") or not p.get("action"):
            continue
        index[(str(p["policy"]), str(p["collection"]), str(p["action"]))] = p

    # Admin: explicit domain/lookup access (avoid granting system tables by wildcard).
    for collection in CORE_COLLECTIONS + ["sample_intake_uploads"] + LOOKUP_COLLECTIONS:
        upsert_permission(
            token,
            index,
            {"policy": admin_policy, "collection": collection, "action": "create", "fields": ["*"], "permissions": {}},
        )
        upsert_permission(
            token,
            index,
            {"policy": admin_policy, "collection": collection, "action": "read", "fields": ["*"], "permissions": {}},
        )
        upsert_permission(
            token,
            index,
            {"policy": admin_policy, "collection": collection, "action": "update", "fields": ["*"], "permissions": {}},
        )
        upsert_permission(
            token,
            index,
            {"policy": admin_policy, "collection": collection, "action": "delete", "fields": ["*"], "permissions": {}},
        )

    # Client: project-scoped core access.
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects",
            "action": "read",
            "fields": ["*"],
            "permissions": {"client_user": {"_eq": "$CURRENT_USER"}},
        },
    )
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects",
            "action": "create",
            "fields": [
                "title",
                "pi_name",
                "researcher_name",
                "description",
                "status",
                "intake_platform",
                "biospyder_manifest",
                "biospyder_databases",
                "bioinformatician_assigned",
                "client_user",
            ],
            "permissions": {},
            "validation": {"client_user": {"_eq": "$CURRENT_USER"}},
        },
    )
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects",
            "action": "update",
            "fields": [
                "title",
                "pi_name",
                "researcher_name",
                "description",
                "status",
                "intake_platform",
                "biospyder_manifest",
                "biospyder_databases",
                "bioinformatician_assigned",
            ],
            "permissions": {"client_user": {"_eq": "$CURRENT_USER"}},
            "validation": {},
        },
    )

    scoped_collections = [
        ("studies", {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}),
        ("samples", {"study": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}}),
        ("assays", {"sample": {"study": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}}}),
        ("sample_plating", {"sample": {"study": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}}}),
    ]
    for collection, filter_ in scoped_collections:
        upsert_permission(
            token,
            index,
            {
                "policy": client_policy,
                "collection": collection,
                "action": "read",
                "fields": ["*"],
                "permissions": filter_,
            },
        )
        upsert_permission(
            token,
            index,
            {
                "policy": client_policy,
                "collection": collection,
                "action": "create",
                "fields": ["*"],
                "permissions": {},
                "validation": filter_,
            },
        )
        upsert_permission(
            token,
            index,
            {
                "policy": client_policy,
                "collection": collection,
                "action": "update",
                "fields": ["*"],
                "permissions": filter_,
                "validation": filter_,
            },
        )
        upsert_permission(
            token,
            index,
            {
                "policy": client_policy,
                "collection": collection,
                "action": "delete",
                "fields": ["*"],
                "permissions": filter_,
            },
        )

    # Client: lookup read-only.
    for lookup in LOOKUP_COLLECTIONS:
        upsert_permission(
            token,
            index,
            {
                "policy": client_policy,
                "collection": lookup,
                "action": "read",
                "fields": ["*"],
                "permissions": {},
            },
        )

    # Client: allow maintaining m2m links for their own projects (TempO-Seq databases).
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects_biospyder_databases",
            "action": "read",
            "fields": ["*"],
            "permissions": {"projects_id": {"client_user": {"_eq": "$CURRENT_USER"}}},
        },
    )
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects_biospyder_databases",
            "action": "create",
            "fields": ["projects_id", "biospyder_databases_id"],
            "permissions": {},
            "validation": {"projects_id": {"client_user": {"_eq": "$CURRENT_USER"}}},
        },
    )
    upsert_permission(
        token,
        index,
        {
            "policy": client_policy,
            "collection": "projects_biospyder_databases",
            "action": "delete",
            "fields": ["*"],
            "permissions": {"projects_id": {"client_user": {"_eq": "$CURRENT_USER"}}},
        },
    )

    # System: read domain + lookups, update Plane sync metadata only.
    upsert_permission(
        token,
        index,
        {"policy": system_policy, "collection": "projects", "action": "read", "fields": ["*"], "permissions": {}},
    )
    upsert_permission(
        token,
        index,
        {
            "policy": system_policy,
            "collection": "projects",
            "action": "update",
            "fields": ["plane_sync_status", "plane_last_error", "plane_external_ref"],
            "permissions": {},
        },
    )
    for collection in ["studies", "samples", "assays", "sample_plating", "projects_biospyder_databases"]:
        upsert_permission(
            token,
            index,
            {"policy": system_policy, "collection": collection, "action": "read", "fields": ["*"], "permissions": {}},
        )
    for lookup in LOOKUP_COLLECTIONS:
        upsert_permission(
            token,
            index,
            {"policy": system_policy, "collection": lookup, "action": "read", "fields": ["*"], "permissions": {}},
        )
    upsert_permission(
        token,
        index,
        {
            "policy": system_policy,
            "collection": "directus_users",
            "action": "read",
            "fields": ["id", "email"],
            "permissions": {},
        },
    )

    # Presets (admin + client convenience views)
    presets = list_system_items(token, "presets")
    preset_index: dict[tuple[str, str, str], dict] = {}
    for p in presets:
        if p.get("role") and p.get("collection") and p.get("bookmark"):
            preset_index[(str(p["role"]), str(p["collection"]), str(p["bookmark"]))] = p

    for payload in [
        {
            "role": client_role,
            "collection": "projects",
            "bookmark": "My Projects",
            "layout": "tabular",
            "layout_query": {"sort": ["-updated_at"]},
            "filter": {"client_user": {"_eq": "$CURRENT_USER"}},
        },
        {
            "role": client_role,
            "collection": "studies",
            "bookmark": "My Studies",
            "layout": "tabular",
            "layout_query": {"sort": ["-id"]},
            "filter": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}},
        },
        {
            "role": client_role,
            "collection": "samples",
            "bookmark": "My Samples",
            "layout": "tabular",
            "layout_query": {"sort": ["sample_ID"]},
            "filter": {"study": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}},
        },
        {
            "role": client_role,
            "collection": "assays",
            "bookmark": "My Assays",
            "layout": "tabular",
            "layout_query": {"sort": ["-id"]},
            "filter": {"sample": {"study": {"project": {"client_user": {"_eq": "$CURRENT_USER"}}}}},
        },
        {
            "role": admin_role,
            "collection": "sample_intake_uploads",
            "bookmark": "Sample Intake Uploads",
            "layout": "tabular",
            "layout_query": {"sort": ["-validated_at"]},
        },
        {
            "role": admin_role,
            "collection": "genome_versions",
            "bookmark": "Lookups: Genome Versions",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
        {
            "role": admin_role,
            "collection": "quantification_methods",
            "bookmark": "Lookups: Quantification Methods",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
        {
            "role": admin_role,
            "collection": "species_options",
            "bookmark": "Lookups: Species Options",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
        {
            "role": admin_role,
            "collection": "platform_options",
            "bookmark": "Lookups: Platform Options",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
        {
            "role": admin_role,
            "collection": "biospyder_databases",
            "bookmark": "Lookups: Biospyder Databases",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
        {
            "role": admin_role,
            "collection": "biospyder_manifests",
            "bookmark": "Lookups: Biospyder Manifests",
            "layout": "tabular",
            "layout_query": {"sort": ["name"]},
        },
    ]:
        upsert_preset(token, preset_index, payload)

    print("")
    print("Bootstrap complete.")
    print("Next steps:")
    print("1. Create a Directus user with the 'System' role and set a static token (for DIRECTUS_AUTOMATION_TOKEN).")
    print("2. Confirm Client users only see their own projects in the Directus app.")
    print("3. Export a real snapshot from the running instance for replay.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
