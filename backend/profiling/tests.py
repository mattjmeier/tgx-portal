import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Project, Sample, Study, UserProfile
from profiling.models import ImportBatch, ProfilingPlatform, StudyDataResource, StudyWarehouseMetadata

User = get_user_model()


class StudyImportApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin_user = User.objects.create_user(username="admin", password="admin123")
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()
        self.client.force_authenticate(user=self.admin_user)
        self.project = Project.objects.create(
            owner=self.admin_user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.platform = ProfilingPlatform.objects.create(
            platform_name="tgx-rnaseq-v1",
            title="TGx RNA-Seq",
            technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
            study_type=ProfilingPlatform.StudyType.TGX,
            species=Study.Species.HUMAN,
        )

    def create_import(self) -> int:
        response = self.client.post(
            "/api/profiling/study-imports/",
            {
                "project_id": self.project.id,
                "title": "Curated Mercury Study",
                "description": "Historical profiling import",
                "species": Study.Species.HUMAN,
                "celltype": "Hepatocyte",
                "study_name": "UL-2026-001",
                "source": "UL warehouse",
                "study_type": StudyWarehouseMetadata.StudyType.TGX,
                "in_vitro": True,
                "platform_id": self.platform.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["id"]

    def test_admin_only_access_is_enforced(self) -> None:
        client_user = User.objects.create_user(username="client", password="client123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        self.client.force_authenticate(user=client_user)

        response = self.client.post(
            "/api/profiling/study-imports/",
            {
                "project_id": self.project.id,
                "title": "Blocked",
                "study_name": "BLOCKED-001",
                "study_type": StudyWarehouseMetadata.StudyType.TGX,
                "platform_id": self.platform.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_metadata_preview_applies_transforms_and_reports_duplicates(self) -> None:
        import_id = self.create_import()

        response = self.client.post(
            f"/api/profiling/study-imports/{import_id}/metadata-preview/",
            {
                "filename": "metadata.csv",
                "content": "Sample ID,Group,technical_control\n CTRL 1 , Control , true\nctrl 1, Treated , false\n",
                "mappings": [
                    {
                        "source_column": "Sample ID",
                        "target_field": "sample_ID",
                        "transforms": ["trim", "lowercase", "replace_whitespace_with_underscore"],
                    },
                    {
                        "source_column": "Group",
                        "target_field": "group",
                        "transforms": ["trim", "lowercase"],
                    },
                    {
                        "source_column": "technical_control",
                        "target_field": "technical_control",
                        "transforms": ["trim", "lowercase"],
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["normalized_rows"][0]["sample_ID"], "ctrl_1")
        self.assertIn(
            {
                "row_index": 1,
                "column_key": "sample_ID",
                "message": "This sample_ID is duplicated within the upload.",
                "severity": "error",
            },
            payload["issues"],
        )

    def test_contrasts_preview_rejects_unknown_self_and_duplicate_pairs(self) -> None:
        import_id = self.create_import()
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/metadata-preview/",
            {
                "filename": "metadata.tsv",
                "content": "sample_ID\tgroup\nctrl_1\tcontrol\ntrt_1\ttreated\n",
                "mappings": [
                    {"source_column": "sample_ID", "target_field": "sample_ID", "transforms": ["trim"]},
                    {"source_column": "group", "target_field": "group", "transforms": ["trim", "lowercase"]},
                ],
            },
            format="json",
        )

        response = self.client.post(
            f"/api/profiling/study-imports/{import_id}/contrasts-preview/",
            {
                "filename": "contrasts.tsv",
                "content": "reference_group\tcomparison_group\ncontrol\tcontrol\ncontrol\tmissing\ncontrol\ttreated\ncontrol\ttreated\n",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        messages = {(issue["row_index"], issue["message"]) for issue in payload["issues"]}
        self.assertIn((0, "Reference and comparison groups must differ."), messages)
        self.assertIn((1, "Comparison group is not present in the normalized metadata groups."), messages)
        self.assertIn((3, "This contrast pair is duplicated within the upload."), messages)

    def test_count_resource_and_commit_create_canonical_records(self) -> None:
        import_id = self.create_import()
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/metadata-preview/",
            {
                "filename": "metadata.tsv",
                "content": "sample_ID\tgroup\tsample_name\nctrl_1\tcontrol\tControl 1\ntrt_1\ttreated\tTreated 1\n",
                "mappings": [
                    {"source_column": "sample_ID", "target_field": "sample_ID", "transforms": ["trim"]},
                    {"source_column": "group", "target_field": "group", "transforms": ["trim", "lowercase"]},
                    {"source_column": "sample_name", "target_field": "sample_name", "transforms": ["trim"]},
                ],
            },
            format="json",
        )
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/contrasts-preview/",
            {
                "filename": "contrasts.tsv",
                "content": "reference_group\tcomparison_group\ncontrol\ttreated\n",
            },
            format="json",
        )

        count_content = "feature_id\tctrl_1\ttrt_1\nGENE1\t10\t12\n"
        with TemporaryDirectory() as archive_root:
            count_path = Path(archive_root) / "studies" / "counts.tsv"
            count_path.parent.mkdir()
            count_path.write_text(count_content, encoding="utf-8")
            with override_settings(STUDY_ARCHIVE_ROOT=archive_root):
                count_response = self.client.post(
                    f"/api/profiling/study-imports/{import_id}/count-resource/",
                    {
                        "path": str(count_path),
                        "feature_id_kind": "gene_symbol",
                        "annotation_source": "Ensembl",
                        "annotation_version": "110",
                    },
                    format="json",
                )
        self.assertEqual(count_response.status_code, 200)
        self.assertEqual(count_response.json()["resource"]["checksum"], hashlib.sha256(count_content.encode("utf-8")).hexdigest())

        commit_response = self.client.post(f"/api/profiling/study-imports/{import_id}/commit/", {}, format="json")

        self.assertEqual(commit_response.status_code, 201)
        study = Study.objects.get(title="Curated Mercury Study")
        self.assertEqual(study.project, self.project)
        self.assertEqual(Sample.objects.filter(study=study).count(), 2)
        warehouse = StudyWarehouseMetadata.objects.get(study=study)
        self.assertEqual(warehouse.study_name, "UL-2026-001")
        batch = ImportBatch.objects.get(id=import_id)
        self.assertEqual(batch.status, ImportBatch.Status.COMPLETED)
        count_resource = StudyDataResource.objects.get(display_name="counts.tsv")
        self.assertEqual(count_resource.study_metadata, warehouse)
        self.assertEqual(count_resource.ext["feature_id_kind"], "gene_symbol")

    def test_commit_requires_valid_metadata_and_contrasts(self) -> None:
        import_id = self.create_import()
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/metadata-preview/",
            {
                "filename": "metadata.tsv",
                "content": "sample_ID\tgroup\nctrl_1\tcontrol\n",
                "mappings": [
                    {"source_column": "sample_ID", "target_field": "sample_ID", "transforms": ["trim"]},
                    {"source_column": "group", "target_field": "group", "transforms": ["trim", "lowercase"]},
                ],
            },
            format="json",
        )

        response = self.client.post(f"/api/profiling/study-imports/{import_id}/commit/", {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Study.objects.filter(title="Curated Mercury Study").exists())

    def test_commit_rejects_invalid_sample_ids_from_historical_import(self) -> None:
        import_id = self.create_import()
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/metadata-preview/",
            {
                "filename": "metadata.tsv",
                "content": "sample_ID\tgroup\nbad sample\tcontrol\ntrt_1\ttreated\n",
                "mappings": [
                    {"source_column": "sample_ID", "target_field": "sample_ID", "transforms": ["trim"]},
                    {"source_column": "group", "target_field": "group", "transforms": ["trim", "lowercase"]},
                ],
            },
            format="json",
        )
        self.client.post(
            f"/api/profiling/study-imports/{import_id}/contrasts-preview/",
            {
                "filename": "contrasts.tsv",
                "content": "reference_group\tcomparison_group\ncontrol\ttreated\n",
            },
            format="json",
        )

        response = self.client.post(f"/api/profiling/study-imports/{import_id}/commit/", {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("sample_ID", response.json()["detail"])
        self.assertFalse(Study.objects.filter(title="Curated Mercury Study").exists())
