import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from profiling.models import ProfilingPlatform

from .onboarding import build_group_preview_rows, suggest_contrasts_from_rows
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
def test_build_group_preview_rows_joins_primary_and_additional_columns_in_order() -> None:
    rows = [
        {"sample_ID": "sample-1", "dose": "1uM", "culture": "2D", "solvent_control": False},
        {"sample_ID": "sample-2", "dose": "C", "culture": "2D", "solvent_control": True},
        {"sample_ID": "sample-3", "dose": "2uM", "culture": "3D", "solvent_control": False},
    ]

    preview = build_group_preview_rows(
        rows,
        {
            "primary_column": "dose",
            "additional_columns": ["culture"],
            "batch_column": "plate",
        },
    )

    assert [row["group"] for row in preview] == ["1uM_2D", "C_2D", "2uM_3D"]
    assert [row["__group_context"] for row in preview] == ["2D", "2D", "3D"]


@pytest.mark.django_db
def test_suggest_contrasts_from_rows_matches_controls_with_shared_context() -> None:
    rows = [
        {"group": "C_2D", "__group_context": "2D", "solvent_control": True},
        {"group": "1uM_2D", "__group_context": "2D", "solvent_control": False},
        {"group": "2uM_2D", "__group_context": "2D", "solvent_control": False},
        {"group": "C_3D", "__group_context": "3D", "solvent_control": True},
        {"group": "1uM_3D", "__group_context": "3D", "solvent_control": False},
        {"group": "2uM_3D", "__group_context": "3D", "solvent_control": False},
    ]

    assert suggest_contrasts_from_rows(rows) == [
        {"reference_group": "C_2D", "comparison_group": "1uM_2D"},
        {"reference_group": "C_2D", "comparison_group": "2uM_2D"},
        {"reference_group": "C_3D", "comparison_group": "1uM_3D"},
        {"reference_group": "C_3D", "comparison_group": "2uM_3D"},
    ]


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
            "mappings": {"treatment_level_1": "group", "batch": ""},
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
    assert "group" in patch_response.json()["template_columns"]
    assert "plate" in patch_response.json()["template_columns"]
    assert "dose" in patch_response.json()["template_columns"]
    assert "concentration" in patch_response.json()["template_columns"]
    assert patch_response.json()["mappings"]["treatment_level_1"] == "group"
    assert patch_response.json()["template_context"]["study_design_elements"] == ["exposure", "treatment"]
    assert patch_response.json()["template_context"]["exposure_label_mode"] == "both"
    assert patch_response.json()["group_builder"]["primary_column"] == "group"
    assert patch_response.json()["config"]["common"]["platform"] == "RNA-Seq"
    assert patch_response.json()["config"]["common"]["instrument_model"] == "Illumina NovaSeq 6000"
    assert patch_response.json()["config"]["common"]["sequenced_by"] == "HC Genomics lab"
    assert patch_response.json()["config"]["pipeline"]["mode"] == "se"

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
                    "concentration": 0,
                    "plate": "plate-1",
                },
            ],
        },
        format="json",
    )

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert finalize_response.status_code == 200
    assert finalize_response.json()["status"] == "final"
    study.refresh_from_db()
    assert study.treatment_var == "group"
    assert study.batch_var == "plate"
    assert study.samples.count() == 1
    created_sample = study.samples.get(sample_ID="sample-1")
    assert created_sample.solvent_control is True
    assert created_sample.metadata["group"] == "control"
    assert created_sample.metadata["dose"] == 0
    assert created_sample.metadata["concentration"] == 0


@pytest.mark.django_db
def test_onboarding_finalize_persists_derived_group_metadata() -> None:
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
    study = Study.objects.create(project=project, title="Concentration study", species=Study.Species.HUMAN, celltype="Hepatocyte")

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "concentration",
                "additional_columns": [],
                "batch_column": "",
            },
            "template_context": {
                "study_design_elements": ["exposure", "treatment"],
                "exposure_label_mode": "concentration",
                "exposure_custom_label": "",
                "treatment_vars": ["concentration"],
                "batch_vars": [],
                "optional_field_keys": [],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
            "config": {
                "common": {
                    "dose": "concentration",
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
                    "concentration": "0",
                },
                {
                    "sample_ID": "sample-2",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": False,
                    "concentration": "5",
                },
            ],
        },
        format="json",
    )
    assert validation_response.status_code == 200
    assert validation_response.json()["valid"] is True

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert finalize_response.status_code == 200
    assert list(study.samples.order_by("sample_ID").values_list("sample_ID", "metadata")) == [
        ("sample-1", {"concentration": 0.0, "group": "0"}),
        ("sample-2", {"concentration": 5.0, "group": "5"}),
    ]


@pytest.mark.django_db
def test_onboarding_finalize_backfills_missing_derived_group_metadata() -> None:
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
    study = Study.objects.create(project=project, title="Existing samples study", species=Study.Species.HUMAN, celltype="Hepatocyte")
    Sample.objects.create(study=study, sample_ID="sample-1", metadata={"concentration": 0.0})
    Sample.objects.create(study=study, sample_ID="sample-2", metadata={"concentration": 5.0})

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "concentration",
                "additional_columns": [],
                "batch_column": "",
            },
            "template_context": {
                "study_design_elements": ["exposure", "treatment"],
                "exposure_label_mode": "concentration",
                "exposure_custom_label": "",
                "treatment_vars": ["concentration"],
                "batch_vars": [],
                "optional_field_keys": [],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
            "config": {
                "common": {
                    "dose": "concentration",
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
                    "concentration": "0",
                },
                {
                    "sample_ID": "sample-2",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": False,
                    "concentration": "5",
                },
            ],
        },
        format="json",
    )

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert finalize_response.status_code == 200
    assert list(study.samples.order_by("sample_ID").values_list("sample_ID", "metadata")) == [
        ("sample-1", {"concentration": 0.0, "group": "0"}),
        ("sample-2", {"concentration": 5.0, "group": "5"}),
    ]


@pytest.mark.django_db
def test_onboarding_finalize_rejects_missing_required_template_context_choices() -> None:
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

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "",
                "additional_columns": [],
                "batch_column": "",
            },
            "template_context": {
                "study_design_elements": ["treatment", "batch"],
                "treatment_vars": [],
                "batch_vars": [],
                "optional_field_keys": ["group"],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
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

    response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 400


@pytest.mark.django_db
def test_onboarding_finalize_rejects_chemical_without_exposure() -> None:
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
    study = Study.objects.create(project=project, title="Chemical only study", species=Study.Species.HUMAN, celltype="Hepatocyte")

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "template_context": {
                "study_design_elements": ["chemical"],
                "exposure_label_mode": None,
                "exposure_custom_label": "",
                "treatment_vars": [],
                "batch_vars": [],
                "optional_field_keys": ["chemical"],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
            "group_builder": {"primary_column": "chemical", "additional_columns": [], "batch_column": ""},
            "config": {
                "common": {
                    "platform": "RNA-Seq",
                    "instrument_model": "Illumina NovaSeq 6000",
                    "sequenced_by": "HC Genomics lab",
                },
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )

    response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 400
    assert any(
        issue["message"] == "Select exposure level for chemical studies before finalizing onboarding."
        for issue in response.json()["errors"]
    )


@pytest.mark.django_db
def test_onboarding_finalize_imports_uploaded_samples_only_once() -> None:
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
    study = Study.objects.create(project=project, title="Study finalize import", species=Study.Species.HUMAN, celltype="Hepatocyte")

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "group",
                "additional_columns": [],
                "batch_column": "plate",
            },
            "template_context": {
                "study_design_elements": ["treatment", "batch"],
                "treatment_vars": ["group"],
                "batch_vars": ["plate"],
                "optional_field_keys": ["group", "plate"],
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
                    "sample_name": "Control",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": True,
                    "group": "control",
                    "plate": "plate-1",
                },
                {
                    "sample_ID": "sample-2",
                    "sample_name": "Dose",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": False,
                    "group": "treated",
                    "plate": "plate-1",
                },
            ],
        },
        format="json",
    )
    assert validation_response.status_code == 200

    first_finalize = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert first_finalize.status_code == 200
    assert list(study.samples.order_by("sample_ID").values_list("sample_ID", flat=True)) == ["sample-1", "sample-2"]

    second_finalize = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert second_finalize.status_code == 200
    assert study.samples.count() == 2


@pytest.mark.django_db
def test_onboarding_finalize_requires_custom_exposure_label_when_custom_mode_is_selected() -> None:
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

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "group",
                "additional_columns": [],
                "batch_column": "",
            },
            "template_context": {
                "study_design_elements": ["exposure", "treatment"],
                "exposure_label_mode": "custom",
                "exposure_custom_label": "",
                "treatment_vars": ["group"],
                "batch_vars": [],
                "optional_field_keys": [],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
            "config": {
                "common": {
                    "platform": "RNA-Seq",
                    "instrument_model": "Illumina NovaSeq 6000",
                    "sequenced_by": "HC Genomics lab",
                },
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )

    response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 400
    assert {
        "field": "template_context.exposure_custom_label",
        "message": "Provide a custom exposure label before finalizing onboarding.",
    } in response.json()["errors"]


@pytest.mark.django_db
def test_onboarding_finalize_rejects_missing_config_choices_and_missing_uploaded_primary_vars() -> None:
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

    client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "dose",
                "additional_columns": ["culture"],
                "batch_column": "plate",
            },
            "template_context": {
                "study_design_elements": ["treatment", "batch"],
                "treatment_vars": ["group"],
                "batch_vars": ["plate"],
                "optional_field_keys": [],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group", "batch": "plate"},
            "config": {
                "common": {
                    "platform": "RNA-Seq",
                    "instrument_model": "",
                    "sequenced_by": "",
                },
                "pipeline": {"mode": "pe", "threads": 8},
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
                {
                    "sample_ID": "sample-1",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": True,
                    "sample_name": "Control",
                },
            ],
        },
        format="json",
    )

    response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")

    assert response.status_code == 400
    messages = [item["message"] for item in response.json()["errors"]]
    assert "Provide an instrument model before finalizing onboarding." in messages
    assert "Provide where the study was sequenced before finalizing onboarding." in messages
    assert "Choose at least one grouping variable to generate analysis groups." not in messages
    assert "Primary batch variable 'plate' is not present in the last uploaded metadata." in messages


@pytest.mark.django_db
def test_onboarding_config_derives_biospyder_kit_from_selected_profiling_platform() -> None:
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
    ProfilingPlatform.objects.create(
        platform_name="humanWT2_1_brAtten",
        title="TempO-seq Human WT v2.1, Broad Attenuation",
        version="2.1",
        technology_type=ProfilingPlatform.TechnologyType.TEMPO_SEQ,
        study_type=ProfilingPlatform.StudyType.HTTR,
        species=Study.Species.HUMAN,
        ext={"biospyder_kit": "hwt2-1", "attenuation": "broad"},
    )

    response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "config": {
                "common": {
                    "platform": "TempO-Seq",
                    "profiling_platform_name": "humanWT2_1_brAtten",
                    "instrument_model": "Illumina NovaSeq 6000",
                    "sequenced_by": "HC Genomics lab",
                    "biospyder_kit": None,
                },
                "pipeline": {"mode": "se", "threads": 8},
                "qc": {},
                "deseq2": {"cpus": 4},
            },
        },
        format="json",
    )

    assert response.status_code == 200
    common = response.json()["config"]["common"]
    assert common["platform"] == "TempO-Seq"
    assert common["profiling_platform_name"] == "humanWT2_1_brAtten"
    assert common["biospyder_kit"] == "hwt2-1"


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
            "template_context": {
                "study_design_elements": ["exposure", "treatment", "batch"],
                "exposure_label_mode": "dose",
                "exposure_custom_label": "",
                "treatment_vars": ["group"],
                "batch_vars": ["plate"],
                "optional_field_keys": ["group"],
                "custom_field_keys": [],
            },
            "mappings": {"treatment_level_1": "group"},
            "selected_contrasts": [{"reference_group": "control", "comparison_group": "treated"}],
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
                    "plate": "plate-1",
                },
                {
                    "sample_ID": "sample-2",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": False,
                    "group": "treated",
                    "dose": 1,
                    "plate": "plate-1",
                },
            ],
        },
        format="json",
    )
    client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    study.refresh_from_db()
    assert study.treatment_var == "group"
    assert study.batch_var == "plate"
    assert list(study.samples.order_by("sample_ID").values_list("sample_ID", flat=True)) == ["sample-1", "sample-2"]
    Assay.objects.create(sample=study.samples.get(sample_ID="sample-1"), platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")
    Assay.objects.create(sample=study.samples.get(sample_ID="sample-2"), platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

    allowed = client.post(f"/api/projects/{project.id}/generate-config/")
    assert allowed.status_code == 200


@pytest.mark.django_db
def test_onboarding_finalize_accepts_derived_group_builder_when_uploaded_group_column_is_missing() -> None:
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

    patch_response = client.patch(
        f"/api/studies/{study.id}/onboarding-state/",
        {
            "group_builder": {
                "primary_column": "dose",
                "additional_columns": ["culture"],
                "batch_column": "plate",
            },
            "template_context": {
                "study_design_elements": ["exposure", "treatment", "batch"],
                "exposure_label_mode": "dose",
                "exposure_custom_label": "",
                "treatment_vars": ["group"],
                "batch_vars": ["plate"],
                "optional_field_keys": [],
                "custom_field_keys": ["culture"],
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
                    "dose": "C",
                    "culture": "2D",
                    "plate": "plate-1",
                },
                {
                    "sample_ID": "sample-2",
                    "technical_control": False,
                    "reference_rna": False,
                    "solvent_control": False,
                    "dose": "1uM",
                    "culture": "2D",
                    "plate": "plate-1",
                },
            ],
        },
        format="json",
    )

    assert validation_response.status_code == 200
    assert validation_response.json()["suggested_contrasts"] == [
        {"reference_group": "C_2D", "comparison_group": "1uM_2D"},
    ]

    finalize_response = client.post(f"/api/studies/{study.id}/onboarding-finalize/", format="json")
    assert finalize_response.status_code == 200
