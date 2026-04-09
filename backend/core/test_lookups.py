import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import ControlledLookupValue, MetadataFieldDefinition, Project, Study, UserProfile


User = get_user_model()


@pytest.mark.django_db
def test_lookups_returns_metadata_field_definitions_and_controlled_values() -> None:
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
    ControlledLookupValue.objects.create(
        category=ControlledLookupValue.Category.GENOME_VERSION,
        value="hg19",
        is_active=False,
    )

    response = client.get("/api/lookups/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == 1
    assert any(item["key"] == "sample_ID" and item["required"] is True for item in payload["metadata_field_definitions"])
    assert any(item["key"] == "chemical" for item in payload["metadata_field_definitions"])
    assert "controlled" in payload["lookups"]
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
def test_metadata_template_preview_includes_required_and_auto_includes() -> None:
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
        {"study_id": study.id, "optional_field_keys": ["chemical"], "custom_field_keys": []},
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"][:3] == ["sample_ID", "sample_name", "group"]
    assert "chemical" in payload["columns"]
    assert "CASN" in payload["columns"]
    assert any(item["key"] == "CASN" for item in payload["auto_included"])
    assert payload["filename"].endswith("_metadata.csv")


@pytest.mark.django_db
def test_metadata_template_download_returns_csv_attachment() -> None:
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
        "/api/metadata-templates/download/",
        {"study_id": study.id, "optional_field_keys": [], "custom_field_keys": []},
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert "attachment" in response["Content-Disposition"]
    assert response.content.decode("utf-8").strip() == "sample_ID,sample_name,group"
