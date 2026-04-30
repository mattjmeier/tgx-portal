import json
from unittest import mock
from urllib.error import HTTPError

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import PlaneWorkItemSync, Project, Study, UserProfile
from .tasks import sync_study_to_plane


User = get_user_model()


def _create_admin_client() -> tuple[APIClient, User]:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)
    return client, user


def _create_finalizable_study(user: User, title: str = "Plane sync study") -> Study:
    project = Project.objects.create(
        owner=user,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title=f"{title} project",
        description="A project ready for Plane sync.",
    )
    return Study.objects.create(project=project, title=title, species=Study.Species.HUMAN, celltype="Hepatocyte")


def _prepare_onboarding(client: APIClient, study: Study) -> None:
    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "group",
                "additional_columns": [],
                "batch_column": "plate",
            },
            "template_context": {
                "study_design_elements": ["exposure", "treatment"],
                "exposure_label_mode": "both",
                "exposure_custom_label": "",
                "treatment_vars": ["group"],
                "batch_vars": ["plate"],
                "optional_field_keys": ["group"],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group", "batch": "plate"},
            "config": {
                "common": {
                    "dose": "dose",
                    "units": "uM",
                    "platform": "RNA-Seq",
                    "instrument_model": "Illumina NovaSeq 6000",
                    "sequenced_by": "HC Genomics lab",
                },
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {"dendro_color_by": "group"},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )
    assert patch_response.status_code == 200

    validation_response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {
                    "sample_ID": "sample-1",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": True,
                    "group": "control",
                    "dose": 0,
                    "concentration": 0,
                    "plate": "plate-1",
                },
            ],
        },
        format="json",
    )
    assert validation_response.status_code == 200


@pytest.mark.django_db(transaction=True)
def test_onboarding_finalize_enqueues_plane_sync_after_commit() -> None:
    client, user = _create_admin_client()
    study = _create_finalizable_study(user)
    _prepare_onboarding(client, study)

    with mock.patch("core.views.sync_study_to_plane.delay") as delay:
        response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 200
    delay.assert_called_once_with(study.id)


@pytest.mark.django_db(transaction=True)
def test_repeated_onboarding_finalize_does_not_enqueue_duplicate_plane_sync() -> None:
    client, user = _create_admin_client()
    study = _create_finalizable_study(user)
    _prepare_onboarding(client, study)

    with mock.patch("core.views.sync_study_to_plane.delay") as delay:
        first_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
        second_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    delay.assert_called_once_with(study.id)


@pytest.mark.django_db
def test_successful_plane_sync_stores_work_item_metadata(settings) -> None:
    settings.PLANE_API_BASE_URL = "http://plane.test"
    settings.PLANE_API_KEY = "plane_api_test"
    settings.PLANE_WORKSPACE_SLUG = "hc"
    settings.PLANE_PROJECT_ID = "plane-project-id"
    settings.PLANE_WEB_BASE_URL = "http://plane.local"
    settings.TGX_PORTAL_BASE_URL = "http://tgx.local"
    _, user = _create_admin_client()
    study = _create_finalizable_study(user)
    response_body = {"id": "work-item-id", "sequence_id": 42}
    mock_response = mock.Mock()
    mock_response.status = 201
    mock_response.read.return_value = json.dumps(response_body).encode("utf-8")
    mock_response.__enter__ = mock.Mock(return_value=mock_response)
    mock_response.__exit__ = mock.Mock(return_value=None)

    with mock.patch("core.plane.urlopen", return_value=mock_response) as urlopen:
        sync_study_to_plane(study.id)

    sync = PlaneWorkItemSync.objects.get(study=study)
    assert sync.status == PlaneWorkItemSync.Status.SUCCEEDED
    assert sync.attempt_count == 1
    assert sync.plane_work_item_id == "work-item-id"
    assert sync.plane_work_item_url == "http://plane.local/hc/projects/plane-project-id/work-items/work-item-id"
    assert sync.response_payload == response_body
    assert sync.last_error == ""
    request_payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
    assert request_payload["name"] == f"Onboard TGx study: {study.title}"
    assert request_payload["priority"] == "medium"
    assert "TGx portal" in request_payload["description_html"]


@pytest.mark.django_db
def test_failed_plane_sync_stores_error(settings) -> None:
    settings.PLANE_API_BASE_URL = "http://plane.test"
    settings.PLANE_API_KEY = "plane_api_test"
    settings.PLANE_WORKSPACE_SLUG = "hc"
    settings.PLANE_PROJECT_ID = "plane-project-id"
    _, user = _create_admin_client()
    study = _create_finalizable_study(user)
    error_response = mock.Mock()
    error_response.read.return_value = b'{"detail":"bad request"}'
    error = HTTPError(
        url="http://plane.test/api/v1/workspaces/hc/projects/plane-project-id/work-items/",
        code=400,
        msg="Bad Request",
        hdrs=None,
        fp=error_response,
    )

    with mock.patch("core.plane.urlopen", side_effect=error):
        sync_study_to_plane(study.id)

    sync = PlaneWorkItemSync.objects.get(study=study)
    assert sync.status == PlaneWorkItemSync.Status.FAILED
    assert sync.attempt_count == 1
    assert "bad request" in sync.last_error


@pytest.mark.django_db(transaction=True)
def test_missing_plane_configuration_does_not_break_onboarding_finalize(settings) -> None:
    settings.PLANE_API_KEY = ""
    client, user = _create_admin_client()
    study = _create_finalizable_study(user)
    _prepare_onboarding(client, study)

    with mock.patch("core.views.sync_study_to_plane.delay", side_effect=RuntimeError("queue unavailable")):
        response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 200
    study.refresh_from_db()
    assert study.onboarding_state.status == "final"


@pytest.mark.django_db
def test_missing_plane_configuration_stores_failed_sync(settings) -> None:
    settings.PLANE_API_KEY = ""
    _, user = _create_admin_client()
    study = _create_finalizable_study(user)

    sync_study_to_plane(study.id)

    sync = PlaneWorkItemSync.objects.get(study=study)
    assert sync.status == PlaneWorkItemSync.Status.FAILED
    assert sync.attempt_count == 1
    assert "PLANE_API_KEY" in sync.last_error
