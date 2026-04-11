import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import MetadataFieldDefinition, Project, Study, StudyMetadataFieldSelection, UserProfile


User = get_user_model()


def _select_fields(study: Study, *keys: str) -> None:
    definitions = MetadataFieldDefinition.objects.in_bulk(keys, field_name="key")
    for order, key in enumerate(keys):
        StudyMetadataFieldSelection.objects.create(
            study=study,
            field_definition=definitions[key],
            required=True if key in {"sample_ID", "dose", "timepoint"} else definitions[key].is_core,
            sort_order=order,
        )


@pytest.mark.django_db
def test_metadata_validation_aggregates_row_and_cell_issues_for_dynamic_numeric_field() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    project = Project.objects.create(
        owner=user,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title="Mercury tox study",
        description="",
    )
    study = Study.objects.create(project=project, title="Study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    _select_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "dose")

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {"sample_ID": "", "technical_control": "F", "reference_rna": "F", "solvent_control": "F", "dose": "0"},
                {"sample_ID": "sample-2", "technical_control": "F", "reference_rna": "F", "solvent_control": "F", "dose": "-1"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    issues = payload["issues"]
    assert any(issue["row_index"] == 0 and issue["column_key"] == "sample_ID" for issue in issues)
    assert any(issue["row_index"] == 1 and issue["column_key"] == "dose" for issue in issues)


@pytest.mark.django_db
def test_metadata_validation_normalizes_spreadsheet_booleans_t_and_f() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    project = Project.objects.create(
        owner=user,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title="Mercury tox study",
        description="",
    )
    study = Study.objects.create(project=project, title="Study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    _select_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control")

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {
                    "sample_ID": "sample-1",
                    "technical_control": "T",
                    "reference_rna": "F",
                    "solvent_control": "F",
                }
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["issues"] == []


@pytest.mark.django_db
def test_metadata_validation_supports_nondose_design_fields() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    project = Project.objects.create(
        owner=user,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title="Mercury tox study",
        description="",
    )
    study = Study.objects.create(project=project, title="Study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    _select_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "timepoint")

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {
                    "sample_ID": "sample-1",
                    "technical_control": "F",
                    "reference_rna": "F",
                    "solvent_control": "T",
                    "timepoint": "24h",
                }
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["columns"] == ["reference_rna", "sample_ID", "solvent_control", "technical_control", "timepoint"]


@pytest.mark.django_db
def test_metadata_validation_enforces_study_rbac() -> None:
    client = APIClient()
    owner = User.objects.create_user(username="owner", password="owner123")
    owner.profile.role = UserProfile.Role.CLIENT
    owner.profile.save()

    other = User.objects.create_user(username="other", password="other123")
    other.profile.role = UserProfile.Role.CLIENT
    other.profile.save()

    project = Project.objects.create(
        owner=owner,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title="Mercury tox study",
        description="",
    )
    study = Study.objects.create(project=project, title="Study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    _select_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control")

    client.force_authenticate(user=other)
    response = client.post(
        "/api/metadata-validation/",
        {"study_id": study.id, "rows": [{"sample_ID": "sample-1", "technical_control": "F", "reference_rna": "F", "solvent_control": "F"}]},
        format="json",
    )

    assert response.status_code == 403
