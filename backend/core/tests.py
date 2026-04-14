from io import BytesIO
from zipfile import ZipFile

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import (
    Assay,
    MetadataFieldDefinition,
    Project,
    Sample,
    Study,
    StudyConfig,
    StudyMetadataFieldSelection,
    StudyMetadataMapping,
    StudyOnboardingState,
    UserProfile,
    default_study_config,
)

User = get_user_model()


def add_template_fields(study: Study, *keys: str) -> None:
    definitions = MetadataFieldDefinition.objects.in_bulk(keys, field_name="key")
    for order, key in enumerate(keys):
        StudyMetadataFieldSelection.objects.create(
            study=study,
            field_definition=definitions[key],
            required=True if key == "sample_ID" else definitions[key].is_core,
            sort_order=order,
        )


class HealthcheckTests(TestCase):
    def test_healthcheck_returns_ok(self) -> None:
        response = self.client.get(reverse("healthcheck"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class SampleModelTests(TestCase):
    def test_invalid_sample_id_raises_validation_error(self) -> None:
        project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        study = Study.objects.create(project=project, title="Hepatocyte study")
        sample = Sample(study=study, sample_ID="bad sample")

        with self.assertRaises(ValidationError):
            sample.full_clean()

    def test_study_config_rejects_invalid_pipeline_threads(self) -> None:
        project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        study = Study.objects.create(project=project, title="Hepatocyte study")
        config = default_study_config()
        config["pipeline"]["threads"] = 0

        with self.assertRaises(ValidationError):
            StudyConfig(study=study, **config).full_clean()


class ProjectApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)

    def test_list_projects_uses_paginated_payload(self) -> None:
        Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.get("/api/projects/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.json())
        self.assertEqual(response.json()["count"], 1)

    def test_admin_can_assign_project_owner(self) -> None:
        client_user = User.objects.create_user(username="clientuser", password="client123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.patch(
            f"/api/projects/{project.id}/assign-owner/",
            {"owner_id": client_user.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        project.refresh_from_db()
        self.assertEqual(project.owner_id, client_user.id)


class StudyApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project_alpha = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

    def test_create_study_creates_default_mapping_and_config(self) -> None:
        response = self.client.post("/api/studies/", {"project": self.project_alpha.id, "title": "Hepatocyte study"}, format="json")

        self.assertEqual(response.status_code, 201)
        study = Study.objects.get()
        self.assertTrue(hasattr(study, "metadata_mapping"))
        self.assertTrue(hasattr(study, "config"))


class SampleApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.study = Study.objects.create(project=self.project, title="Sample validation study")
        add_template_fields(self.study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "group", "dose")

    def test_sample_bulk_create_accepts_metadata_payload(self) -> None:
        payload = [
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "sample_name": "Sample 1",
                "metadata": {"group": "control", "dose": 0},
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": True,
            },
            {
                "study": self.study.id,
                "sample_ID": "sample-2",
                "sample_name": "Sample 2",
                "metadata": {"group": "treated", "dose": 3.5},
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
        ]

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Sample.objects.count(), 2)
        self.assertEqual(Sample.objects.get(sample_ID="sample-2").metadata["dose"], 3.5)

    def test_invalid_sample_payload_returns_bad_request(self) -> None:
        payload = {
            "study": self.study.id,
            "sample_ID": "bad sample",
            "metadata": {"group": "control", "dose": -1},
            "technical_control": False,
            "reference_rna": False,
            "solvent_control": False,
        }

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("sample_ID", response.json())

    def test_bulk_import_duplicate_sample_ids_are_rejected_atomically(self) -> None:
        payload = [
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "metadata": {"group": "control", "dose": 0},
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": True,
            },
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "metadata": {"group": "treated", "dose": 2},
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
        ]

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sample.objects.count(), 0)


class ConfigGenerationApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.study = Study.objects.create(project=self.project, title="Config generation study", species=Study.Species.HUMAN, celltype="Hepatocyte")
        add_template_fields(self.study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "group", "dose")
        StudyMetadataMapping.objects.create(
            study=self.study,
            treatment_level_1="group",
            batch="",
            selected_contrasts=[{"reference_group": "control", "comparison_group": "treated"}],
        )
        config = default_study_config()
        config["common"]["dose"] = "dose"
        config["common"]["units"] = "uM"
        config["pipeline"]["threads"] = 8
        config["deseq2"]["cpus"] = 4
        StudyConfig.objects.create(study=self.study, **config)
        StudyOnboardingState.objects.create(
            study=self.study,
            status=StudyOnboardingState.Status.FINAL,
            metadata_columns=["sample_ID", "technical_control", "reference_rna", "solvent_control", "group", "dose"],
            mappings={"treatment_level_1": "group"},
        )
        self.sample_control = Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            solvent_control=True,
            metadata={"group": "control", "dose": 0},
        )
        self.sample_treated = Sample.objects.create(
            study=self.study,
            sample_ID="sample-2",
            sample_name="Sample 2",
            metadata={"group": "treated", "dose": 3.5},
        )
        Assay.objects.create(sample=self.sample_control, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")
        Assay.objects.create(sample=self.sample_treated, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

    def test_generate_config_returns_zip_file(self) -> None:
        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("config_bundle_project_alpha.zip", response["Content-Disposition"])

        with ZipFile(BytesIO(response.content)) as archive:
            names = sorted(archive.namelist())
        self.assertEqual(
            names,
            [
                "config_generation_study/config.yaml",
                "config_generation_study/contrasts.tsv",
                "config_generation_study/metadata.tsv",
            ],
        )

    def test_generate_config_returns_zip_file_without_assays(self) -> None:
        Assay.objects.all().delete()

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")

        with ZipFile(BytesIO(response.content)) as archive:
            config_yaml = archive.read("config_generation_study/config.yaml").decode("utf-8")
            metadata_tsv = archive.read("config_generation_study/metadata.tsv").decode("utf-8")
            contrasts_tsv = archive.read("config_generation_study/contrasts.tsv").decode("utf-8")

        self.assertIn("platform: RNA-Seq", config_yaml)
        self.assertIn("sample_ID", metadata_tsv)
        self.assertIn("reference_group\tcomparison_group", contrasts_tsv)

    def test_generate_config_accepts_legacy_list_selected_contrasts(self) -> None:
        mapping = self.study.metadata_mapping
        mapping.selected_contrasts = [["treated", "control"]]
        mapping.save(update_fields=["selected_contrasts"])

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 200)

        with ZipFile(BytesIO(response.content)) as archive:
            contrasts_tsv = archive.read("config_generation_study/contrasts.tsv").decode("utf-8")

        self.assertIn("reference_group\tcomparison_group", contrasts_tsv)
        self.assertIn("control\ttreated", contrasts_tsv)

    def test_generate_config_rejects_invalid_selected_contrasts_shape(self) -> None:
        mapping = self.study.metadata_mapping
        mapping.selected_contrasts = [["treated"]]
        mapping.save(update_fields=["selected_contrasts"])

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            f"Study {self.study.id} has invalid selected contrasts data. Re-save the contrasts and retry.",
        )

    def test_generate_config_rejects_mixed_platforms(self) -> None:
        Assay.objects.create(
            sample=self.sample_control,
            platform=Assay.Platform.TEMPO_SEQ,
            genome_version="hg38",
            quantification_method="normalized_transcripts",
        )

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())


class AuthApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()

    def test_login_returns_token_and_user(self) -> None:
        response = self.client.post(
            "/api/auth/login/",
            {"username": "admin", "password": "admin123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.json())
        self.assertEqual(response.json()["user"]["profile"]["role"], UserProfile.Role.ADMIN)
