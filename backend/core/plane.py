from __future__ import annotations

import html
import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

from .models import Study


class PlaneConfigurationError(RuntimeError):
    pass


class PlaneRequestError(RuntimeError):
    def __init__(self, message: str, response_payload: dict | list | str | None = None) -> None:
        super().__init__(message)
        self.response_payload = response_payload


@dataclass(frozen=True)
class PlaneWorkItemResult:
    work_item_id: str
    work_item_url: str
    response_payload: dict


def _required_setting(name: str) -> str:
    value = str(getattr(settings, name, "") or "").strip()
    if not value:
        raise PlaneConfigurationError(f"{name} is required for Plane work item sync.")
    return value


def build_plane_work_item_payload(study: Study) -> dict[str, str]:
    project = study.project
    finalized_at = getattr(getattr(study, "onboarding_state", None), "finalized_at", None)
    portal_url = f"{settings.TGX_PORTAL_BASE_URL}/studies/{study.id}/onboarding"
    description = "\n".join(
        [
            f"<p><strong>TGx project:</strong> {html.escape(project.title)}</p>",
            f"<p><strong>PI:</strong> {html.escape(project.pi_name)}</p>",
            f"<p><strong>Researcher:</strong> {html.escape(project.researcher_name)}</p>",
            f"<p><strong>Bioinformatician:</strong> {html.escape(project.bioinformatician_assigned)}</p>",
            f"<p><strong>Study:</strong> {html.escape(study.title)}</p>",
            f"<p><strong>Species:</strong> {html.escape(study.get_species_display() if study.species else '')}</p>",
            f"<p><strong>Cell type:</strong> {html.escape(study.celltype or '')}</p>",
            f"<p><strong>Finalized:</strong> {html.escape(finalized_at.isoformat() if finalized_at else '')}</p>",
            f'<p><a href="{html.escape(portal_url)}">TGx portal onboarding record</a></p>',
        ]
    )
    return {
        "name": f"Onboard TGx study: {study.title}",
        "description_html": description,
        "priority": "medium",
    }


def create_plane_work_item(study: Study, payload: dict[str, str]) -> PlaneWorkItemResult:
    api_base_url = _required_setting("PLANE_API_BASE_URL")
    api_key = _required_setting("PLANE_API_KEY")
    workspace_slug = _required_setting("PLANE_WORKSPACE_SLUG")
    project_id = _required_setting("PLANE_PROJECT_ID")
    web_base_url = str(getattr(settings, "PLANE_WEB_BASE_URL", "") or api_base_url).rstrip("/")
    endpoint = f"{api_base_url}/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/"
    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8")
    except HTTPError as exc:
        response_payload = _decode_response_payload(exc.read().decode("utf-8", errors="replace"))
        raise PlaneRequestError(f"Plane API returned HTTP {exc.code}: {response_payload}", response_payload) from exc
    except URLError as exc:
        raise PlaneRequestError(f"Plane API request failed: {exc.reason}") from exc

    response_payload = _decode_response_payload(raw_body)
    if not isinstance(response_payload, dict):
        raise PlaneRequestError("Plane API returned a non-object response.", response_payload)
    work_item_id = str(response_payload.get("id") or "")
    if not work_item_id:
        raise PlaneRequestError("Plane API response did not include a work item id.", response_payload)

    work_item_url = f"{web_base_url}/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}"
    return PlaneWorkItemResult(
        work_item_id=work_item_id,
        work_item_url=work_item_url,
        response_payload=response_payload,
    )


def _decode_response_payload(raw_body: str) -> dict | list | str:
    if not raw_body:
        return {}
    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body
