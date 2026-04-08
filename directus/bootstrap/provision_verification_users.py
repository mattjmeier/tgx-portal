#!/usr/bin/env python3
"""Provision reusable local verification users for Client/System role checks.

This helper:
- logs in as the Directus admin
- finds the `Client` and `System` roles
- creates or updates one verification user per role
- assigns a static token to the System verification user
- reassigns the seeded sample project to the Client verification user

It is intended for local development only.
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
FIXTURE_PATH = pathlib.Path(os.environ.get("DIRECTUS_SAMPLE_FIXTURE", DEFAULT_FIXTURE))

CLIENT_EMAIL = os.environ.get("DIRECTUS_VERIFY_CLIENT_EMAIL", "client.verify@example.com")
CLIENT_PASSWORD = os.environ.get("DIRECTUS_VERIFY_CLIENT_PASSWORD", "client-verify-pass")
SYSTEM_EMAIL = os.environ.get("DIRECTUS_VERIFY_SYSTEM_EMAIL", "system.verify@example.com")
SYSTEM_PASSWORD = os.environ.get("DIRECTUS_VERIFY_SYSTEM_PASSWORD", "system-verify-pass")
SYSTEM_TOKEN = os.environ.get("DIRECTUS_VERIFY_SYSTEM_TOKEN", "system-verify-static-token")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")


def request_json(method: str, path: str, *, token: str | None = None, payload: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    headers = {"content-type": "application/json"}
    data = None
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
    result = request_json("GET", f"/items/{collection}?{'&'.join(query)}", token=token)
    return result.get("data", []) or []


def read_users(token: str, *, filter_obj: dict | None = None, limit: int = -1, fields: list[str] | None = None) -> list[dict]:
    query = [f"limit={limit}"]
    if fields:
        query.append(f"fields={urllib.parse.quote(','.join(fields))}")
    if filter_obj:
        query.append(f"filter={encode_filter(filter_obj)}")
    result = request_json("GET", f"/users?{'&'.join(query)}", token=token)
    return result.get("data", []) or []


def load_project_title() -> str:
    if not FIXTURE_PATH.exists():
        fail(f"Sample fixture not found: {FIXTURE_PATH}")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return str(fixture["project"]["title"])


def list_roles(token: str) -> list[dict]:
    result = request_json("GET", "/roles", token=token)
    return result.get("data", []) or []


def upsert_user(
    token: str,
    *,
    email: str,
    password: str,
    role_id: str,
    first_name: str,
    last_name: str,
    static_token: str | None = None,
) -> dict:
    existing = read_users(
        token,
        filter_obj={"email": {"_eq": email}},
        limit=1,
        fields=["id", "email", "role", "token"],
    )
    payload = {
        "email": email,
        "password": password,
        "role": role_id,
        "status": "active",
        "first_name": first_name,
        "last_name": last_name,
    }
    if static_token is not None:
        payload["token"] = static_token

    if existing:
        user_id = existing[0]["id"]
        request_json("PATCH", f"/users/{user_id}?fields=id,email,role,token", token=token, payload=payload)
        print(f"UPDATE user {email}")
        return {"id": user_id, **payload}

    created = request_json("POST", "/users?fields=id,email,role,token", token=token, payload=payload).get("data") or {}
    print(f"CREATE user {email}")
    return created


def assign_project_to_client(token: str, *, project_title: str, client_user_id: str) -> None:
    matches = read_items(
        token,
        "projects",
        filter_obj={"title": {"_eq": project_title}},
        limit=1,
        fields=["id", "title", "client_user"],
    )
    if not matches:
        fail(f"No project found for title '{project_title}'. Load the seeded project first.")

    project = matches[0]
    project_id = project["id"]
    try:
        request_json(
            "PATCH",
            f"/items/projects/{project_id}?fields=id,title,client_user",
            token=token,
            payload={"client_user": client_user_id},
        )
    except RuntimeError as exc:
        if "biospyder_databases does not exist" not in str(exc):
            raise
        fallback = read_items(
            token,
            "projects",
            filter_obj={"title": {"_eq": project_title}},
            limit=1,
            fields=["id", "title", "client_user"],
        )
        if not fallback:
            raise
    print(f"ASSIGN project '{project_title}' -> client user {client_user_id}")


def main() -> int:
    token = login()
    roles = list_roles(token)
    role_by_name = {row["name"]: row["id"] for row in roles if row.get("name")}

    if "Client" not in role_by_name or "System" not in role_by_name:
        fail("Expected Client and System roles to exist. Apply STORY-003 bootstrap first.")

    client_user = upsert_user(
        token,
        email=CLIENT_EMAIL,
        password=CLIENT_PASSWORD,
        role_id=str(role_by_name["Client"]),
        first_name="Client",
        last_name="Verifier",
    )
    system_user = upsert_user(
        token,
        email=SYSTEM_EMAIL,
        password=SYSTEM_PASSWORD,
        role_id=str(role_by_name["System"]),
        first_name="System",
        last_name="Verifier",
        static_token=SYSTEM_TOKEN,
    )

    assign_project_to_client(token, project_title=load_project_title(), client_user_id=str(client_user["id"]))

    print("")
    print("Verification users ready.")
    print(f"Client email: {CLIENT_EMAIL}")
    print(f"Client password: {CLIENT_PASSWORD}")
    print(f"System email: {SYSTEM_EMAIL}")
    print(f"System password: {SYSTEM_PASSWORD}")
    print(f"System token: {SYSTEM_TOKEN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
