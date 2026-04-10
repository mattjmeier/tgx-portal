import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Assay, Project, Study, UserProfile


User = get_user_model()


@pytest.mark.django_db
def test_metadata_validation_returns_columns_and_contrast_suggestions() -> None:
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
            "expected_columns": ["sample_ID", "sample_name", "group", "dose", "solvent_control"],
            "rows": [
                {"sample_ID": "sample-1", "sample_name": "A", "group": "control", "dose": "0", "solvent_control": "T"},
                {"sample_ID": "sample-2", "sample_name": "B", "group": "treated", "dose": "1", "solvent_control": "F"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["columns"] == ["dose", "group", "sample_ID", "sample_name", "solvent_control"]
    assert payload["suggested_contrasts"] == [
        {"reference_group": "control", "comparison_group": "treated"},
    ]


@pytest.mark.django_db
def test_onboarding_state_supports_draft_save_and_finalize_gating() -> None:
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
    )

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "mappings": {
                "treatment_level_1": "",
                "batch": "",
            }
        },
        format="json",
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "draft"

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert finalize_response.status_code == 400
    assert "errors" in finalize_response.json()

    update_response = client.patch(
        f"/api/studies/{study.id}/",
        {
            "description": "Draft description",
            "species": Study.Species.HUMAN,
            "celltype": "Hepatocyte",
            "treatment_var": "group",
            "batch_var": "plate",
        },
        format="json",
    )
    assert update_response.status_code == 200

    client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "expected_columns": ["sample_ID", "sample_name", "group", "plate", "solvent_control"],
            "rows": [
                {
                    "sample_ID": "sample-1",
                    "sample_name": "A",
                    "group": "control",
                    "plate": "plate-1",
                    "solvent_control": True,
                },
            ],
        },
        format="json",
    )

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "mappings": {"treatment_level_1": "group", "batch": "plate"},
            "selected_contrasts": [{"reference_group": "control", "comparison_group": "treated"}],
        },
        format="json",
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["mappings"]["treatment_level_1"] == "group"

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert finalize_response.status_code == 200
    assert finalize_response.json()["status"] == "final"


@pytest.mark.django_db
def test_generate_config_is_blocked_until_onboarding_is_final() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    project = Project.objects.create(
        owner=user,
        pi_name="Dr. Curie",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo A",
        title="Project Alpha",
        description="A test project",
    )
    study = Study.objects.create(
        project=project,
        title="Config generation study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
        treatment_var="dose",
        batch_var="plate",
    )

    # Minimal sample/assay setup so config generation would otherwise succeed.
    sample_control = study.samples.create(
        sample_ID="sample-1",
        sample_name="Sample 1",
        description="Control sample",
        group="control",
        chemical="",
        chemical_longname="",
        dose=0,
        solvent_control=True,
    )
    sample_treated = study.samples.create(
        sample_ID="sample-2",
        sample_name="Sample 2",
        description="Treated sample",
        group="treated",
        chemical="cmpd",
        chemical_longname="Compound",
        dose=3.5,
    )
    Assay.objects.create(
        sample=sample_control,
        platform=Assay.Platform.RNA_SEQ,
        genome_version="hg38",
        quantification_method="raw_counts",
    )
    Assay.objects.create(
        sample=sample_treated,
        platform=Assay.Platform.RNA_SEQ,
        genome_version="hg38",
        quantification_method="raw_counts",
    )

    blocked = client.post(f"/api/projects/{project.id}/generate-config/")
    assert blocked.status_code == 400
    assert "onboarding" in blocked.json().get("detail", "").lower()

    client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {"sample_ID": "sample-1", "sample_name": "A", "group": "control", "solvent_control": True},
                {"sample_ID": "sample-2", "sample_name": "B", "group": "treated", "solvent_control": False},
            ],
        },
        format="json",
    )
    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {"mappings": {"treatment_level_1": "group", "batch": ""}},
        format="json",
    )
    client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    allowed = client.post(f"/api/projects/{project.id}/generate-config/")
    assert allowed.status_code == 200
