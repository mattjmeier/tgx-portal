#!/usr/bin/env python3
"""Verify the STORY-003 automation token (System role) can perform required reads.

This script is meant to be run *after* you have:
- created a Directus user with role `System`
- set a static token for that user
- set that token as `DIRECTUS_AUTOMATION_TOKEN` in your environment/.env

It performs non-destructive checks only.
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
AUTOMATION_TOKEN = os.environ.get("DIRECTUS_AUTOMATION_TOKEN")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not AUTOMATION_TOKEN:
    fail("DIRECTUS_AUTOMATION_TOKEN must be set.")


def request_json(method: str, path: str, *, token: str) -> dict:
    url = f"{BASE_URL}{path}"
    headers = {"content-type": "application/json", "authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, data=None, method=method, headers=headers)

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


def request_json_fallback(method: str, paths: list[str], *, token: str) -> dict:
    last: Exception | None = None
    for path in paths:
        try:
            return request_json(method, path, token=token)
        except RuntimeError as exc:
            last = exc
            message = str(exc)
            if " 404 " in message or " 405 " in message:
                continue
            raise
    raise last or RuntimeError(f"{method} failed for all paths: {paths}")


def main() -> int:
    me = request_json("GET", "/users/me", token=AUTOMATION_TOKEN).get("data") or {}
    user_id = me.get("id")
    email = me.get("email")
    role_id = me.get("role")

    print(f"Token user: id={user_id} email={email} role={role_id}")

    if not role_id:
        fail("Could not determine role for automation token user.")

    role = request_json_fallback(
        "GET",
        [f"/roles/{role_id}", f"/items/directus_roles/{role_id}"],
        token=AUTOMATION_TOKEN,
    ).get("data") or {}
    print(f"Role: name={role.get('name')} admin_access={role.get('admin_access')} app_access={role.get('app_access')}")

    # Core read access (should work even with empty datasets).
    request_json("GET", "/items/projects?limit=1&fields=id", token=AUTOMATION_TOKEN)
    request_json("GET", "/items/studies?limit=1&fields=id", token=AUTOMATION_TOKEN)
    request_json("GET", "/items/samples?limit=1&fields=id", token=AUTOMATION_TOKEN)
    request_json("GET", "/items/assays?limit=1&fields=id", token=AUTOMATION_TOKEN)
    request_json("GET", "/items/sample_plating?limit=1&fields=id", token=AUTOMATION_TOKEN)

    # Lookup read access
    for lookup in [
        "platform_options",
        "genome_versions",
        "quantification_methods",
        "species_options",
        "biospyder_databases",
        "biospyder_manifests",
    ]:
        request_json("GET", f"/items/{lookup}?limit=1&fields=id,name,code", token=AUTOMATION_TOKEN)

    # Integrations: System role must be able to read user email (limited fields).
    request_json_fallback(
        "GET",
        [
            "/users?limit=1&fields=id,email",
            "/items/directus_users?limit=1&fields=id,email",
        ],
        token=AUTOMATION_TOKEN,
    )

    print("OK: automation token can perform required reads.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

