#!/usr/bin/env python3
"""Verify STORY-004 export generation against a running Directus instance.

This helper expects the STORY-004 endpoint extension to be mounted and the
repeatable seeded sample project to be available. It:

1. logs in as Directus admin
2. finds the seeded project
3. calls the workflow export endpoint
4. verifies project/export tracking fields were updated
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
PROJECT_TITLE = os.environ.get("DIRECTUS_SAMPLE_PROJECT_TITLE")


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


def request_json_allow_error(
    method: str,
    path: str,
    *,
    token: str | None = None,
    payload: dict | None = None,
) -> tuple[int, dict]:
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
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"raw": body}
        return exc.code, parsed


def login() -> str:
    result = request_json(
        "POST",
        "/auth/login",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    return result["data"]["access_token"]


def encode_filter(filter_obj: dict) -> str:
    return urllib.parse.quote(json.dumps(filter_obj, separators=(",", ":")))


def read_items(token: str, collection: str, *, filter_obj: dict | None = None, fields: list[str] | None = None) -> list[dict]:
    query = ["limit=-1"]
    if fields:
        query.append(f"fields={urllib.parse.quote(','.join(fields))}")
    if filter_obj:
        query.append(f"filter={encode_filter(filter_obj)}")
    result = request_json("GET", f"/items/{collection}?{'&'.join(query)}", token=token)
    return result.get("data", []) or []


def load_project_title() -> str:
    if PROJECT_TITLE:
        return PROJECT_TITLE
    if not FIXTURE_PATH.exists():
        fail(f"Sample fixture not found: {FIXTURE_PATH}")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return str(fixture["project"]["title"])


def main() -> int:
    token = login()
    project_title = load_project_title()

    matches = read_items(
        token,
        "projects",
        filter_obj={"title": {"_eq": project_title}},
        fields=[
            "id",
            "title",
            "workflow_export_status",
            "workflow_export_last_generated_at",
            "workflow_export_last_error_code",
            "workflow_export_last_error_message",
            "latest_workflow_export",
        ],
    )
    if not matches:
        fail(
            f"No project found for title '{project_title}'. "
            "Load the seeded sample project first with directus/seed/load_sample_project.py."
        )

    project = matches[0]
    project_id = project["id"]

    status, body = request_json_allow_error(
        "POST",
        f"/workflow-export/projects/{project_id}/generate-config?include_content=true&store=true",
        token=token,
        payload={},
    )
    if status != 200:
        fail(f"Workflow export endpoint returned HTTP {status}: {body}")

    if not body.get("ok"):
        fail(f"Workflow export endpoint returned ok=false: {body}")

    artifacts = body.get("artifacts") or {}
    for name in ["config.yaml", "metadata.tsv", "contrasts.tsv"]:
        if name not in artifacts or not artifacts[name]:
            fail(f"Missing artifact content for {name}")

    updated = request_json(
        "GET",
        f"/items/projects/{project_id}?fields=id,title,workflow_export_status,workflow_export_last_generated_at,workflow_export_last_error_code,workflow_export_last_error_message,latest_workflow_export",
        token=token,
    ).get("data") or {}

    if updated.get("workflow_export_status") != "ready":
        fail(f"Expected workflow_export_status=ready, got: {updated}")
    if not updated.get("workflow_export_last_generated_at"):
        fail(f"Expected workflow_export_last_generated_at to be set, got: {updated}")
    if updated.get("workflow_export_last_error_code") is not None:
        fail(f"Expected workflow_export_last_error_code to be cleared, got: {updated}")
    if not updated.get("latest_workflow_export"):
        fail(f"Expected latest_workflow_export to be set, got: {updated}")

    export_id = body.get("export_id") or updated.get("latest_workflow_export")
    export_row = request_json(
        "GET",
        f"/items/workflow_exports/{export_id}?fields=id,project,status,schema_version,platform,genome_version,quantification_method,read_mode,created_at",
        token=token,
    ).get("data") or {}

    if export_row.get("status") != "ready":
        fail(f"Stored workflow export row is not ready: {export_row}")

    print("Workflow export verification passed.")
    print(f"Project: {updated.get('title')} ({project_id})")
    print(f"Export row: {export_row.get('id')}")
    print(f"Schema version: {body.get('schema_version')}")
    if body.get("warnings"):
        print(f"Warnings: {body['warnings']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
