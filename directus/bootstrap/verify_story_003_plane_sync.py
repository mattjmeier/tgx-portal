#!/usr/bin/env python3
"""Verify System automation can call /plane-sync/sync and that updates are auditable.

This script performs a safe end-to-end check of STORY-003 assumptions:
- Uses Admin credentials to create a temporary `projects` item
- Uses `DIRECTUS_AUTOMATION_TOKEN` (System role) to call `/plane-sync/sync`
- Confirms the endpoint can update the allowed Plane sync fields
- Confirms an activity log entry exists for the update (audit visibility)
- Deletes the temporary project

It does not require a real Plane webhook. With the default `.env.example`,
`PLANE_WEBHOOK_URL` is unset and the endpoint should return 501 after writing
`plane_sync_status='failed'` + `plane_last_error`.
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
AUTOMATION_TOKEN = os.environ.get("DIRECTUS_AUTOMATION_TOKEN")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    fail("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set.")
if not AUTOMATION_TOKEN:
    fail("DIRECTUS_AUTOMATION_TOKEN must be set.")


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


def request_json_allow_error(
    method: str, path: str, *, token: str | None = None, payload: dict | None = None
) -> tuple[int, dict]:
    """Return (status_code, parsed_json_or_raw)."""
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
            parsed = json.loads(body) if body else {}
            return response.getcode(), parsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"raw": body}
        return exc.code, parsed


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


def login_admin() -> str:
    result = request_json(
        "POST",
        "/auth/login",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    return result["data"]["access_token"]


def main() -> int:
    admin_token = login_admin()

    admin_me = request_json("GET", "/users/me", token=admin_token).get("data") or {}
    admin_user_id = admin_me.get("id")
    if not admin_user_id:
        fail("Could not determine admin user id from /users/me.")

    system_me = request_json("GET", "/users/me", token=AUTOMATION_TOKEN).get("data") or {}
    system_user_id = system_me.get("id")
    system_email = system_me.get("email")
    system_role = system_me.get("role")
    if not system_user_id or not system_role:
        fail("Could not determine System user id/role from automation token.")

    print(f"Admin user id: {admin_user_id}")
    print(f"System token user: id={system_user_id} email={system_email} role={system_role}")

    project_id = None
    try:
        # Create a temporary project as Admin (must satisfy project-intake required fields).
        created = request_json(
            "POST",
            "/items/projects",
            token=admin_token,
            payload={
                "title": "STORY-003 System Token Verify (TEMP)",
                "pi_name": "Test PI",
                "researcher_name": "Test Researcher",
                "description": "Temporary project created by verify_story_003_plane_sync.py",
                "status": "draft",
                "intake_platform": "RNA-Seq",
                "client_user": admin_user_id,
            },
        ).get("data") or {}
        project_id = created.get("id")
        if not project_id:
            fail("Project create did not return an id.")

        print(f"Created temporary project: {project_id}")

        # Call plane-sync as System automation user.
        status, body = request_json_allow_error(
            "POST",
            "/plane-sync/sync",
            token=AUTOMATION_TOKEN,
            payload={"project_id": project_id, "event": "created"},
        )
        print(f"/plane-sync/sync response: status={status} body_keys={list((body or {}).keys())}")

        if status not in {200, 501, 502}:
            fail(f"Unexpected /plane-sync/sync status {status}.")

        # Confirm the endpoint was able to update the permitted plane_* fields.
        project = request_json(
            "GET",
            f"/items/projects/{project_id}?fields=id,plane_sync_status,plane_last_error,plane_external_ref",
            token=admin_token,
        ).get("data") or {}

        status_value = project.get("plane_sync_status")
        if status_value not in {"pending", "success", "failed", None}:
            fail(f"Unexpected plane_sync_status value: {status_value!r}")
        if status == 501 and status_value != "failed":
            fail("Expected plane_sync_status='failed' when PLANE_WEBHOOK_URL is not configured.")

        # Audit visibility: activity log should include an update by the System user.
        activity = request_json_fallback(
            "GET",
            [
                f"/activity?limit=50&sort=-timestamp&filter[collection][_eq]=projects&filter[item][_eq]={project_id}",
                f"/items/directus_activity?limit=50&sort=-timestamp&filter[collection][_eq]=projects&filter[item][_eq]={project_id}",
            ],
            token=admin_token,
        ).get("data") or []

        matching = [
            a
            for a in activity
            if str(a.get("collection")) == "projects"
            and str(a.get("item")) == str(project_id)
            and str(a.get("action")) in {"update", "items.update"}
            and str(a.get("user")) == str(system_user_id)
        ]
        if not matching:
            fail("No matching Directus activity entry found for the System-driven project update.")

        print("OK: System automation can call /plane-sync/sync and update is visible in activity history.")
        return 0
    finally:
        if project_id:
            try:
                request_json("DELETE", f"/items/projects/{project_id}", token=admin_token)
                print(f"Deleted temporary project: {project_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: could not delete temporary project {project_id}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())

