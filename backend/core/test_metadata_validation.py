import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Project, Sample, Study, UserProfile


User = get_user_model()


@pytest.mark.django_db
def test_metadata_validation_aggregates_row_and_cell_issues() -> None:
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
    study = Study.objects.create(
        project=project,
        title="Study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
        treatment_var="dose",
        batch_var="plate",
    )

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "expected_columns": ["sample_ID", "sample_name", "group", "dose"],
            "rows": [
                {"sample_ID": "", "sample_name": "A", "group": "control", "dose": "0"},
                {"sample_ID": "sample-2", "sample_name": "B", "group": "control", "dose": "-1"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert isinstance(payload["issues"], list)

    issues = payload["issues"]
    assert any(
        issue["row_index"] == 0 and issue["column_key"] == "sample_ID" and issue["severity"] == "error"
        for issue in issues
    )
    assert any(
        issue["row_index"] == 1 and issue["column_key"] == "dose" and issue["severity"] == "error"
        for issue in issues
    )


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
    study = Study.objects.create(
        project=project,
        title="Study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
        treatment_var="dose",
        batch_var="plate",
    )

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "expected_columns": ["sample_ID", "sample_name", "group", "dose", "technical_control", "reference_rna"],
            "rows": [
                {
                    "sample_ID": "sample-1",
                    "sample_name": "A",
                    "group": "control",
                    "dose": "0",
                    "technical_control": "T",
                    "reference_rna": "F",
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
def test_metadata_validation_checks_duplicates_against_database_and_upload() -> None:
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
    study = Study.objects.create(
        project=project,
        title="Study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
        treatment_var="dose",
        batch_var="plate",
    )
    Sample.objects.create(
        study=study,
        sample_ID="sample-1",
        sample_name="Existing",
        description="",
        group="control",
        chemical="",
        chemical_longname="",
        dose=0,
        technical_control=False,
        reference_rna=False,
        solvent_control=False,
    )

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "expected_columns": ["sample_ID", "sample_name", "group", "dose"],
            "rows": [
                {"sample_ID": "sample-1", "sample_name": "A", "group": "control", "dose": "0"},
                {"sample_ID": "sample-2", "sample_name": "B", "group": "control", "dose": "0"},
                {"sample_ID": "sample-2", "sample_name": "C", "group": "control", "dose": "0"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    issues = payload["issues"]
    assert any(
        issue["row_index"] == 0 and issue["column_key"] == "sample_ID" and "already exists" in issue["message"]
        for issue in issues
    )
    assert any(
        issue["row_index"] == 2 and issue["column_key"] == "sample_ID" and "duplicated" in issue["message"]
        for issue in issues
    )


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
    study = Study.objects.create(
        project=project,
        title="Study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
        treatment_var="dose",
        batch_var="plate",
    )

    client.force_authenticate(user=other)
    response = client.post(
        "/api/metadata-validation/",
        {"study_id": study.id, "rows": [{"sample_ID": "sample-1", "sample_name": "A", "group": "control", "dose": "0"}]},
        format="json",
    )

    assert response.status_code == 403

