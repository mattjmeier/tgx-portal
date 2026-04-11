import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Assay, MetadataFieldDefinition, Project, Sample, Study, StudyMetadataFieldSelection, UserProfile


User = get_user_model()


def _select_fields(study: Study, *keys: str) -> None:
    definitions = MetadataFieldDefinition.objects.in_bulk(keys, field_name="key")
    for order, key in enumerate(keys):
        StudyMetadataFieldSelection.objects.create(
            study=study,
            field_definition=definitions[key],
            required=True if key == "sample_ID" else definitions[key].is_core,
            sort_order=order,
        )


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
    study = Study.objects.create(project=project, title="Study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    _select_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "group")

    response = client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {"sample_ID": "sample-1", "technical_control": "F", "reference_rna": "F", "solvent_control": "T", "group": "control"},
                {"sample_ID": "sample-2", "technical_control": "F", "reference_rna": "F", "solvent_control": "F", "group": "treated"},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["columns"] == ["group", "reference_rna", "sample_ID", "solvent_control", "technical_control"]
    assert payload["suggested_contrasts"] == [{"reference_group": "control", "comparison_group": "treated"}]


@pytest.mark.django_db
def test_onboarding_state_persists_template_mappings_and_config_before_finalize() -> None:
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

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "optional_field_keys": ["group", "dose"],
            "mappings": {"treatment_level_1": "group", "batch": ""},
            "config": {
                "common": {"dose": "dose", "units": "uM"},
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {"dendro_color_by": "group"},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )
    assert patch_response.status_code == 200
    assert "group" in patch_response.json()["template_columns"]
    assert patch_response.json()["mappings"]["treatment_level_1"] == "group"

    client.post(
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
                },
            ],
        },
        format="json",
    )

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
    study = Study.objects.create(project=project, title="Config generation study", species=Study.Species.HUMAN, celltype="Hepatocyte")

    blocked = client.post(f"/api/projects/{project.id}/generate-config/")
    assert blocked.status_code == 400

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "optional_field_keys": ["group", "dose"],
            "mappings": {"treatment_level_1": "group"},
            "selected_contrasts": [{"reference_group": "control", "comparison_group": "treated"}],
            "config": {
                "common": {"dose": "dose", "units": "uM"},
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {"dendro_color_by": "group"},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )
    client.post(
        "/api/metadata-validation/",
        {
            "study_id": study.id,
            "rows": [
                {"sample_ID": "sample-1", "technical_control": False, "reference_rna": False, "solvent_control": True, "group": "control", "dose": 0},
                {"sample_ID": "sample-2", "technical_control": False, "reference_rna": False, "solvent_control": False, "group": "treated", "dose": 1},
            ],
        },
        format="json",
    )
    client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    Sample.objects.create(
        study=study,
        sample_ID="sample-1",
        sample_name="Control",
        solvent_control=True,
        metadata={"group": "control", "dose": 0},
    )
    Sample.objects.create(
        study=study,
        sample_ID="sample-2",
        sample_name="Treated",
        metadata={"group": "treated", "dose": 3.5},
    )
    Assay.objects.create(sample=study.samples.get(sample_ID="sample-1"), platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")
    Assay.objects.create(sample=study.samples.get(sample_ID="sample-2"), platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

    allowed = client.post(f"/api/projects/{project.id}/generate-config/")
    assert allowed.status_code == 200
