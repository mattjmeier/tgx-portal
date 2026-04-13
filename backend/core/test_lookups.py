import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import ControlledLookupValue, MetadataFieldDefinition, Project, Study, UserProfile


User = get_user_model()


@pytest.mark.django_db
def test_lookups_returns_enriched_metadata_field_definitions_and_controlled_values() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    ControlledLookupValue.objects.create(
        category=ControlledLookupValue.Category.GENOME_VERSION,
        value="hg38",
        is_active=True,
    )

    response = client.get("/api/lookups/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == 1
    sample_id_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "sample_ID")
    technical_control_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "technical_control")
    reference_rna_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "reference_rna")
    solvent_control_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "solvent_control")
    concentration_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "concentration")
    i5_index_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "i5_index")
    i7_index_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "i7_index")
    well_id_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "well_id")
    sequencing_mode_field = next(item for item in payload["metadata_field_definitions"] if item["key"] == "sequencing_mode")
    assert sample_id_field["is_core"] is True
    assert sample_id_field["scope"] == "sample"
    assert "regex" in sample_id_field
    assert technical_control_field["required"] is True
    assert reference_rna_field["required"] is True
    assert solvent_control_field["required"] is True
    assert concentration_field["group"] == "Toxicology"
    assert i5_index_field["group"] == "Sequencing"
    assert i7_index_field["group"] == "Sequencing"
    assert well_id_field["group"] == "Sequencing"
    assert sequencing_mode_field["group"] == "Sequencing"
    genome_versions = payload["lookups"]["controlled"]["genome_version"]["values"]
    assert genome_versions == ["hg38"]


@pytest.mark.django_db
def test_lookups_filters_people_values_by_rbac() -> None:
    client = APIClient()
    user_a = User.objects.create_user(username="client_a", password="client123")
    user_a.profile.role = UserProfile.Role.CLIENT
    user_a.profile.save()
    user_b = User.objects.create_user(username="client_b", password="client123")
    user_b.profile.role = UserProfile.Role.CLIENT
    user_b.profile.save()

    Project.objects.create(
        owner=user_a,
        pi_name="Dr. Alpha",
        researcher_name="Researcher A",
        bioinformatician_assigned="Bioinfo",
        title="Project A",
        description="",
    )
    Project.objects.create(
        owner=user_b,
        pi_name="Dr. Beta",
        researcher_name="Researcher B",
        bioinformatician_assigned="Bioinfo",
        title="Project B",
        description="",
    )

    client.force_authenticate(user=user_a)
    response = client.get("/api/lookups/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["lookups"]["soft"]["pi_name"]["values"] == ["Dr. Alpha"]
    assert payload["lookups"]["soft"]["researcher_name"]["values"] == ["Researcher A"]


@pytest.mark.django_db
def test_metadata_template_preview_persists_minimal_core_and_optional_fields() -> None:
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
        "/api/metadata-templates/preview/",
        {
            "study_id": study.id,
            "template_context": {
                "study_design_elements": ["dose", "timepoint"],
                "treatment_vars": [],
                "batch_vars": [],
                "optional_field_keys": ["sample_name", "i5_index", "concentration"],
                "custom_field_keys": ["timepoint"],
            },
            "optional_field_keys": ["sample_name", "i5_index", "concentration"],
            "custom_field_keys": ["timepoint"],
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"][:4] == ["sample_ID", "technical_control", "reference_rna", "solvent_control"]
    assert "sample_name" in payload["columns"]
    assert "i5_index" in payload["columns"]
    assert "concentration" in payload["columns"]
    assert "dose" in payload["columns"]
    assert "timepoint" in payload["columns"]
    assert {"key": "dose", "reason": "dose study design selected"} in payload["auto_included"]
    assert study.metadata_field_selections.filter(is_active=True).count() == len(payload["columns"])


@pytest.mark.django_db
def test_metadata_template_download_returns_csv_attachment_for_persisted_selection() -> None:
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
    client.post(
        "/api/metadata-templates/preview/",
        {"study_id": study.id, "optional_field_keys": ["sample_name"], "custom_field_keys": []},
        format="json",
    )

    response = client.post(
        "/api/metadata-templates/download/",
        {"study_id": study.id, "optional_field_keys": ["sample_name"], "custom_field_keys": []},
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert "attachment" in response["Content-Disposition"]
    assert response.content.decode("utf-8").strip() == "sample_ID,technical_control,reference_rna,solvent_control,sample_name"
