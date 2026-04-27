import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from profiling.models import ProfilingPlatform, StudyWarehouseMetadata

from .models import ControlledLookupValue, Project, Study, UserProfile


User = get_user_model()


@pytest.mark.django_db
def test_reference_library_returns_operational_and_warehouse_taxonomy() -> None:
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
        title="Human TempO-Seq study",
        species=Study.Species.HUMAN,
        celltype="Hepatocyte",
    )
    platform = ProfilingPlatform.objects.create(
        platform_name="humanWT2_1_brAtten",
        title="TempO-seq Human WT v2.1, Broad Attenuation",
        description="BioSpyder human whole-transcriptome probe set with broad attenuation.",
        version="2.1",
        technology_type=ProfilingPlatform.TechnologyType.TEMPO_SEQ,
        study_type=ProfilingPlatform.StudyType.HTTR,
        species=Study.Species.HUMAN,
        ext={"biospyder_kit": "hwt2-1", "attenuation": "broad"},
    )
    StudyWarehouseMetadata.objects.create(
        study=study,
        study_name="human_tempo_seq_study",
        source="demo",
        study_type=StudyWarehouseMetadata.StudyType.HTTR,
        in_vitro=True,
        platform=platform,
        cell_types=["Hepatocyte"],
    )
    ControlledLookupValue.objects.create(
        category=ControlledLookupValue.Category.PLATFORM,
        value="TempO-Seq",
        is_active=True,
    )
    ControlledLookupValue.objects.create(
        category=ControlledLookupValue.Category.BIOSPYDER_KIT,
        value="hwt2-1",
        is_active=True,
    )

    response = client.get("/api/reference-library/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == 1
    assert payload["summary"]["species_count"] == 4
    assert payload["summary"]["profiling_platform_count"] == 1
    assert payload["summary"]["technology_type_count"] == 1
    assert payload["summary"]["controlled_lookup_count"] >= 2
    assert payload["species"][0] == {"value": "human", "label": "Human"}
    assert payload["assay_platforms"] == [
        {"value": "tempo_seq", "label": "TempO-Seq"},
        {"value": "rna_seq", "label": "RNA-Seq"},
    ]
    assert payload["technology_types"] == [{"value": "TempO-Seq", "label": "TempO-Seq", "platform_count": 1}]
    assert payload["profiling_platforms"] == [
        {
            "id": platform.id,
            "platform_name": "humanWT2_1_brAtten",
            "title": "TempO-seq Human WT v2.1, Broad Attenuation",
            "description": "BioSpyder human whole-transcriptome probe set with broad attenuation.",
            "version": "2.1",
            "technology_type": "TempO-Seq",
            "study_type": "HTTr",
            "species": "human",
            "species_label": "Human",
            "url": "",
            "ext": {"biospyder_kit": "hwt2-1", "attenuation": "broad"},
            "study_count": 1,
        }
    ]
    assert payload["controlled_lookups"]["platform"]["values"] == ["TempO-Seq"]
    assert payload["controlled_lookups"]["biospyder_kit"]["values"] == [
        {"label": "Human Whole Transcriptome 2.1", "value": "hwt2-1"}
    ]


@pytest.mark.django_db
def test_reference_library_reports_lookup_drift() -> None:
    client = APIClient()
    user = User.objects.create_user(username="admin", password="admin123")
    user.profile.role = UserProfile.Role.ADMIN
    user.profile.save()
    client.force_authenticate(user=user)

    ControlledLookupValue.objects.create(
        category=ControlledLookupValue.Category.PLATFORM,
        value="DrugSeq",
        is_active=True,
    )
    ProfilingPlatform.objects.create(
        platform_name="rnaseq_hg38_demo",
        title="RNA-seq hg38 demo",
        version="hg38",
        technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
        study_type=ProfilingPlatform.StudyType.TGX,
        species=Study.Species.HUMAN,
    )

    response = client.get("/api/reference-library/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["drift_warnings"] == [
        {
            "category": "platform",
            "value": "DrugSeq",
            "message": "Operational platform lookup has no matching profiling platform technology type.",
        }
    ]
