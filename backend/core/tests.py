import csv
from io import BytesIO, StringIO
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
from .services import GEO_REQUIRED_COLUMNS
from .onboarding import normalize_group_builder

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

    def test_admin_cannot_assign_non_client_owner(self) -> None:
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
            {"owner_id": self.user.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"owner_id": ["Projects may only be assigned to client users."]})


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

    def test_explorer_summary_returns_operational_readiness(self) -> None:
        study = Study.objects.create(
            project=self.project_alpha,
            title="Mercury dose response",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
        )
        add_template_fields(study, "sample_ID", "technical_control", "reference_rna", "solvent_control", "group", "dose", "chemical")
        config = default_study_config()
        config["common"]["platform"] = "RNA-Seq"
        config["common"]["sequenced_by"] = "HC Genomics lab"
        config["common"]["instrument_model"] = "NextSeq 2000"
        config["common"]["dose"] = "dose"
        config["pipeline"]["mode"] = "se"
        StudyConfig.objects.create(study=study, **config)
        StudyMetadataMapping.objects.create(
            study=study,
            treatment_level_1="group",
            batch="plate",
            selected_contrasts=[{"reference_group": "control", "comparison_group": "treated"}],
        )
        StudyOnboardingState.objects.create(
            study=study,
            status=StudyOnboardingState.Status.FINAL,
            metadata_columns=["sample_ID", "group", "dose", "chemical", "plate"],
            suggested_contrasts=[{"reference_group": "control", "comparison_group": "treated"}],
            selected_contrasts=[{"reference_group": "control", "comparison_group": "treated"}],
        )
        control = Sample.objects.create(
            study=study,
            sample_ID="S-001",
            sample_name="Control",
            solvent_control=True,
            metadata={"group": "control", "dose": 0, "chemical": "vehicle", "plate": "P1"},
        )
        treated = Sample.objects.create(
            study=study,
            sample_ID="S-002",
            sample_name="Treated",
            metadata={"group": "treated", "dose": 3.5, "chemical": "mercury", "plate": "P1"},
        )
        Sample.objects.create(
            study=study,
            sample_ID="S-003",
            sample_name="Missing assay",
            metadata={"group": "treated", "dose": 10, "chemical": "mercury", "plate": "P2"},
        )
        Assay.objects.create(sample=control, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")
        Assay.objects.create(sample=treated, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

        response = self.client.get(f"/api/studies/{study.id}/explorer-summary/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["study_id"], study.id)
        self.assertEqual(payload["readiness"]["status"], "ready")
        self.assertEqual(payload["readiness"]["label"], "Ready for handoff")
        self.assertEqual(payload["sample_summary"]["total"], 3)
        self.assertEqual(payload["sample_summary"]["solvent_controls"], 1)
        self.assertEqual(payload["assay_summary"]["samples_with_assays"], 2)
        self.assertEqual(payload["assay_summary"]["samples_missing_assays"], 1)
        self.assertEqual(payload["design_summary"]["groups"][0], {"value": "treated", "count": 2})
        self.assertIn("dose", payload["design_summary"]["metadata_columns"])
        self.assertEqual(payload["contrast_summary"]["selected_count"], 1)
        self.assertEqual(payload["config_summary"]["platform"], "RNA-Seq")
        missing_assay_issue = next(issue for issue in payload["blocking_issues"] if issue["code"] == "missing_assays")
        self.assertEqual(missing_assay_issue["message"], "1 sample is awaiting assay setup.")
        self.assertEqual(missing_assay_issue["action_label"], "Show awaiting assays")

    def test_client_cannot_read_other_project_explorer_summary(self) -> None:
        owner = User.objects.create_user(username="owner", password="client123")
        owner.profile.role = UserProfile.Role.CLIENT
        owner.profile.save()
        other_client = User.objects.create_user(username="other", password="client123")
        other_client.profile.role = UserProfile.Role.CLIENT
        other_client.profile.save()
        project = Project.objects.create(
            owner=owner,
            pi_name="PI",
            researcher_name="Researcher",
            bioinformatician_assigned="Bioinfo",
            title="Owned Project",
            description="Client-owned",
        )
        study = Study.objects.create(project=project, title="Private client study")

        self.client.force_authenticate(user=other_client)
        response = self.client.get(f"/api/studies/{study.id}/explorer-summary/")

        self.assertEqual(response.status_code, 404)


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

    def test_list_samples_supports_study_explorer_filters(self) -> None:
        control = Sample.objects.create(
            study=self.study,
            sample_ID="control-1",
            sample_name="Control 1",
            solvent_control=True,
            metadata={"group": "control", "dose": 0, "chemical": "vehicle"},
        )
        treated = Sample.objects.create(
            study=self.study,
            sample_ID="treated-1",
            sample_name="Treated 1",
            metadata={"group": "treated", "dose": 2.5, "chemical": "mercury"},
        )
        Sample.objects.create(
            study=self.study,
            sample_ID="treated-2",
            sample_name="Treated 2",
            metadata={"group": "treated", "chemical": "mercury"},
        )
        Assay.objects.create(sample=control, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

        treated_response = self.client.get(f"/api/samples/?study_id={self.study.id}&group=treated&page_size=100")
        self.assertEqual(treated_response.status_code, 200)
        self.assertEqual([item["sample_ID"] for item in treated_response.json()["results"]], ["treated-1", "treated-2"])

        missing_assay_response = self.client.get(f"/api/samples/?study_id={self.study.id}&assay_status=missing&page_size=100")
        self.assertEqual(missing_assay_response.status_code, 200)
        self.assertEqual([item["sample_ID"] for item in missing_assay_response.json()["results"]], ["treated-1", "treated-2"])

        control_response = self.client.get(f"/api/samples/?study_id={self.study.id}&control_flag=solvent_control&page_size=100")
        self.assertEqual(control_response.status_code, 200)
        self.assertEqual([item["sample_ID"] for item in control_response.json()["results"]], ["control-1"])

        missing_metadata_response = self.client.get(f"/api/samples/?study_id={self.study.id}&missing_metadata=dose&page_size=100")
        self.assertEqual(missing_metadata_response.status_code, 200)
        self.assertEqual([item["sample_ID"] for item in missing_metadata_response.json()["results"]], ["treated-2"])


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

    def test_generate_config_uses_derived_group_from_onboarding_rows(self) -> None:
        state = self.study.onboarding_state
        state.validated_rows = [
            {
                "sample_ID": "sample-1",
                "sample_name": "Sample 1",
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": True,
                "dose": "C",
                "culture": "2D",
            },
            {
                "sample_ID": "sample-2",
                "sample_name": "Sample 2",
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
                "dose": "1uM",
                "culture": "2D",
            },
        ]
        state.group_builder = normalize_group_builder(
            {"primary_column": "dose", "additional_columns": ["culture"], "batch_column": ""}
        )
        state.metadata_columns = [
            "sample_ID",
            "sample_name",
            "technical_control",
            "reference_rna",
            "solvent_control",
            "dose",
            "culture",
        ]
        state.suggested_contrasts = [{"reference_group": "C_2D", "comparison_group": "1uM_2D"}]
        state.save(update_fields=["validated_rows", "group_builder", "metadata_columns", "suggested_contrasts"])

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 200)

        with ZipFile(BytesIO(response.content)) as archive:
            metadata_tsv = archive.read("config_generation_study/metadata.tsv").decode("utf-8")

        self.assertIn("group", metadata_tsv.splitlines()[0].split("\t"))
        self.assertIn("C_2D", metadata_tsv)
        self.assertIn("1uM_2D", metadata_tsv)

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


class GeoMetadataCsvApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin = User.objects.create_user(username="admin", password="admin123")
        self.admin.profile.role = UserProfile.Role.ADMIN
        self.admin.profile.save()
        self.client.force_authenticate(user=self.admin)
        self.project = Project.objects.create(
            owner=self.admin,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="Project summary",
        )
        self.study = Study.objects.create(
            project=self.project,
            title="GEO export study",
            description="Study abstract",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
        )
        add_template_fields(
            self.study,
            "sample_ID",
            "technical_control",
            "reference_rna",
            "solvent_control",
            "group",
            "dose",
            "chemical",
            "chemical_longname",
            "CASN",
        )
        config = default_study_config()
        config["common"]["instrument_model"] = "Illumina NovaSeq 6000"
        config["common"]["units"] = "uM"
        config["pipeline"]["mode"] = "se"
        config["pipeline"]["genome_name"] = "GRCh38"
        StudyConfig.objects.create(study=self.study, **config)
        StudyOnboardingState.objects.create(
            study=self.study,
            status=StudyOnboardingState.Status.FINAL,
            metadata_columns=["sample_ID", "sample_name", "group", "dose", "chemical", "chemical_longname"],
            validated_rows=[
                {
                    "sample_ID": "draft-1",
                    "sample_name": "Draft row",
                    "group": "draft",
                    "dose": 1,
                    "chemical": "cadmium",
                    "chemical_longname": "Cadmium chloride",
                }
            ],
        )

    def _csv_rows(self, response) -> list[dict[str, str]]:
        return list(csv.DictReader(StringIO(response.content.decode("utf-8"))))

    def test_geo_metadata_csv_returns_exact_required_header(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Control sample",
            metadata={"group": "control", "dose": 0, "chemical": "vehicle"},
        )

        response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("geo_metadata_geo_export_study.csv", response["Content-Disposition"])
        header = response.content.decode("utf-8").splitlines()[0].split(",")
        self.assertEqual(header, GEO_REQUIRED_COLUMNS)

    def test_geo_metadata_csv_uses_persisted_samples_before_onboarding_rows(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Control sample",
            metadata={"group": "control", "dose": 0, "chemical": "vehicle"},
        )

        response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")

        rows = self._csv_rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["library name"], "sample-1")
        self.assertNotIn("draft-1", response.content.decode("utf-8"))

    def test_geo_metadata_csv_falls_back_to_onboarding_validated_rows(self) -> None:
        response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")

        rows = self._csv_rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["library name"], "draft-1")
        self.assertEqual(rows[0]["title"], "Draft row")
        self.assertEqual(rows[0]["organism"], "Homo sapiens")
        self.assertEqual(rows[0]["cell type"], "Hepatocyte")
        self.assertEqual(rows[0]["single or paired-end"], "single")
        self.assertEqual(rows[0]["instrument model"], "Illumina NovaSeq 6000")
        self.assertEqual(rows[0]["library strategy"], "RNA-Seq")
        self.assertEqual(rows[0]["treatment"], "Cadmium chloride; cadmium; 1 uM; draft")

    def test_geo_metadata_csv_uses_csv_escaping_and_does_not_guess_files(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name='Sample, "quoted"',
            description="Line 1\nLine 2",
            metadata={"group": "treated", "raw_file": "/path/to/sample_1.fastq.gz"},
        )

        response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")

        rows = self._csv_rows(response)
        self.assertEqual(rows[0]["title"], 'Sample, "quoted"')
        self.assertEqual(rows[0]["description"], "Line 1\nLine 2")
        self.assertEqual(rows[0]["raw file"], "sample_1.fastq.gz")
        self.assertEqual(rows[0]["processed data file"], "")
        self.assertEqual(rows[0]["extract protocol"], "")

    def test_geo_metadata_csv_respects_client_project_access(self) -> None:
        owner = User.objects.create_user(username="owner", password="client123")
        owner.profile.role = UserProfile.Role.CLIENT
        owner.profile.save()
        other_client = User.objects.create_user(username="other", password="client123")
        other_client.profile.role = UserProfile.Role.CLIENT
        other_client.profile.save()
        self.project.owner = owner
        self.project.save(update_fields=["owner"])

        self.client.force_authenticate(user=owner)
        allowed_response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")
        self.assertEqual(allowed_response.status_code, 200)

        self.client.force_authenticate(user=other_client)
        denied_response = self.client.get(f"/api/studies/{self.study.id}/geo-metadata-csv/")
        self.assertEqual(denied_response.status_code, 404)


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


class UserManagementApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin = User.objects.create_user(username="admin", password="admin123", email="admin@example.com")
        self.admin.profile.role = UserProfile.Role.ADMIN
        self.admin.profile.save()
        self.client.force_authenticate(user=self.admin)

    def test_list_users_supports_role_filter_search_and_owned_project_count(self) -> None:
        alpha = User.objects.create_user(username="alpha-client", password="client123", email="alpha@example.com")
        alpha.profile.role = UserProfile.Role.CLIENT
        alpha.profile.save()

        beta = User.objects.create_user(username="beta-client", password="client123", email="beta@example.com")
        beta.profile.role = UserProfile.Role.CLIENT
        beta.profile.save()

        system = User.objects.create_user(username="daemon", password="system123", email="daemon@example.com")
        system.profile.role = UserProfile.Role.SYSTEM
        system.profile.save()

        Project.objects.create(
            owner=alpha,
            pi_name="PI 1",
            researcher_name="Researcher 1",
            bioinformatician_assigned="Bioinfo 1",
            title="Alpha Project One",
            description="First owned project",
        )
        Project.objects.create(
            owner=alpha,
            pi_name="PI 2",
            researcher_name="Researcher 2",
            bioinformatician_assigned="Bioinfo 2",
            title="Alpha Project Two",
            description="Second owned project",
        )
        Project.objects.create(
            owner=beta,
            pi_name="PI 3",
            researcher_name="Researcher 3",
            bioinformatician_assigned="Bioinfo 3",
            title="Beta Project",
            description="Owned by beta",
        )

        response = self.client.get("/api/users/?role=client&search=alpha&page_size=100")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["results"][0]["username"], "alpha-client")
        self.assertEqual(payload["results"][0]["profile"]["role"], UserProfile.Role.CLIENT)
        self.assertEqual(payload["results"][0]["owned_project_count"], 2)

    def test_list_users_supports_ordering(self) -> None:
        for username in ("zoe", "amy"):
            user = User.objects.create_user(username=username, password="client123", email=f"{username}@example.com")
            user.profile.role = UserProfile.Role.CLIENT
            user.profile.save()

        response = self.client.get("/api/users/?ordering=-username&page_size=100")

        self.assertEqual(response.status_code, 200)
        usernames = [user["username"] for user in response.json()["results"]]
        self.assertEqual(usernames[:3], ["zoe", "amy", "admin"])
