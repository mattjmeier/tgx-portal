from __future__ import annotations

import hashlib
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import yaml
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Project, Sample, SequencingRun, Study, UserProfile
from profiling.archive_import import (
    ArchiveImportError,
    apply_study_manifest,
    diff_study_manifest,
    inspect_study_manifest,
)
from profiling.models import (
    CountMatrixProfile,
    ImportBatch,
    ResourceLineage,
    SequencingFile,
    SequencingLibrary,
    StudyDataResource,
    StudyWarehouseMetadata,
)

User = get_user_model()


class ArchiveStudyImportTests(TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.archive_root = Path(self.temporary_directory.name)
        self.study_directory = self.archive_root / "studies" / "pilot-study"
        self.study_directory.mkdir(parents=True)

    def write_manifest(
        self,
        *,
        title: str = "Pilot study",
        curation_status: str = "metadata_curated",
        artifacts: list[dict] | None = None,
        schema_version: int = 1,
    ) -> Path:
        payload = {
            "schema_version": schema_version,
            "study_key": "pilot-study",
            "curation_status": curation_status,
            "lineage_status": "unknown",
            "collaboration": {
                "key": "historical-program",
                "title": "Historical program",
                "pi_name": "Dr. Curie",
                "researcher_name": "Researcher A",
                "bioinformatician_assigned": "Bioinfo A",
            },
            "study": {
                "title": title,
                "description": "Archive pilot",
                "study_type": "TGx",
                "species": "human",
                "celltype": "Hepatocyte",
            },
            "metadata_mappings": [
                {"source_column": "sample", "target_field": "sample_ID", "transforms": ["trim"]},
                {"source_column": "group", "target_field": "group", "transforms": ["trim", "lowercase"]},
            ],
            "artifacts": artifacts
            if artifacts is not None
            else [
                {
                    "key": "sample-metadata",
                    "role": "metadata",
                    "path": "metadata.tsv",
                }
            ],
        }
        manifest_path = self.study_directory / "portal-study.yaml"
        manifest_path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
        return manifest_path

    @override_settings(STUDY_ARCHIVE_ROOT="/unused")
    def test_manifest_paths_cannot_escape_archive_root(self) -> None:
        manifest_path = self.write_manifest(
            artifacts=[{"key": "outside", "role": "metadata", "path": "../../../outside.tsv"}]
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            with self.assertRaisesRegex(ArchiveImportError, "outside the configured archive root"):
                inspect_study_manifest(manifest_path)

    def test_inventory_manifest_allows_missing_optional_artifacts(self) -> None:
        manifest_path = self.write_manifest(curation_status="inventory", artifacts=[])

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            inspection = inspect_study_manifest(manifest_path)

        self.assertTrue(inspection.valid)
        self.assertEqual(inspection.manifest.study_key, "pilot-study")
        self.assertIn("metadata", inspection.missing_artifacts)

    def test_apply_is_replay_safe_updates_declared_records_and_never_deletes(self) -> None:
        metadata_path = self.study_directory / "metadata.tsv"
        metadata_path.write_text("sample\tgroup\nsample_1\tControl\nsample_2\tTreated\n", encoding="utf-8")
        manifest_path = self.write_manifest()

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            first = apply_study_manifest(manifest_path)
            replay = apply_study_manifest(manifest_path)

        self.assertEqual(first.outcome, "completed")
        self.assertEqual(replay.outcome, "no_changes")
        self.assertEqual(Project.objects.get().collaboration_key, "historical-program")
        self.assertEqual(StudyWarehouseMetadata.objects.get().study_name, "pilot-study")
        self.assertEqual(Sample.objects.count(), 2)
        self.assertEqual(ImportBatch.objects.count(), 2)

        metadata_path.write_text("sample\tgroup\nsample_1\tControl\n", encoding="utf-8")
        self.write_manifest(title="Pilot study revised")
        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            revised = apply_study_manifest(manifest_path)

        self.assertEqual(revised.outcome, "completed")
        self.assertGreaterEqual(revised.updated, 1)
        self.assertEqual(revised.stale["samples"], ["sample_2"])
        self.assertEqual(Sample.objects.count(), 2)
        self.assertEqual(Study.objects.get().title, "Pilot study revised")
        self.assertEqual(
            ImportBatch.objects.filter(status=ImportBatch.Status.SUPERSEDED).count(),
            2,
        )
        self.assertEqual(
            ImportBatch.objects.filter(status=ImportBatch.Status.COMPLETED).count(),
            1,
        )

    def test_read_only_study_directory_is_never_modified(self) -> None:
        metadata_path = self.study_directory / "metadata.tsv"
        metadata_path.write_text("sample\tgroup\nsample_1\tControl\n", encoding="utf-8")
        manifest_path = self.write_manifest()
        before = {
            path.relative_to(self.study_directory): (
                path.stat().st_size,
                path.stat().st_mtime_ns,
                hashlib.sha256(path.read_bytes()).hexdigest(),
            )
            for path in self.study_directory.iterdir()
        }
        os.chmod(self.study_directory, 0o555)
        self.addCleanup(os.chmod, self.study_directory, 0o755)

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            apply_study_manifest(manifest_path)

        after = {
            path.relative_to(self.study_directory): (
                path.stat().st_size,
                path.stat().st_mtime_ns,
                hashlib.sha256(path.read_bytes()).hexdigest(),
            )
            for path in self.study_directory.iterdir()
        }
        self.assertEqual(before, after)

    def test_fastq_manifest_models_multiple_runs_and_unknown_lineage(self) -> None:
        (self.study_directory / "metadata.tsv").write_text(
            "sample\tgroup\nsample_1\tControl\n",
            encoding="utf-8",
        )
        raw_directory = self.archive_root / "raw_data" / "2023" / "flowcells"
        raw_directory.mkdir(parents=True)
        for filename in ("sample_1_L001_R1.fastq.gz", "sample_1_L001_R2.fastq.gz", "unmapped.fastq.gz"):
            (raw_directory / filename).write_bytes(b"FASTQ")
        (self.study_directory / "fastq-manifest.tsv").write_text(
            "file_key\tpath\tsample_ID\tlibrary_key\trun_id\tflowcell_id\tlane\tread_role\tchunk\tevidence\tnotes\n"
            "fq-r1\traw_data/2023/flowcells/sample_1_L001_R1.fastq.gz\tsample_1\tlib-1\trun-1\tFC1\t1\tR1\t1\tdeclared\t\n"
            "fq-r2\traw_data/2023/flowcells/sample_1_L001_R2.fastq.gz\tsample_1\tlib-1\trun-2\tFC2\t1\tR2\t1\tdeclared\tResequenced\n"
            "fq-unknown\traw_data/2023/flowcells/unmapped.fastq.gz\t\t\t\t\t\t\t\tunknown\tLegacy mapping missing\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest(
            curation_status="lineage_curated",
            artifacts=[
                {"key": "sample-metadata", "role": "metadata", "path": "metadata.tsv"},
                {"key": "fastq-index", "role": "fastq_manifest", "path": "fastq-manifest.tsv"},
            ],
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            apply_study_manifest(manifest_path)

        self.assertEqual(SequencingLibrary.objects.count(), 1)
        self.assertEqual(SequencingRun.objects.count(), 2)
        self.assertEqual(SequencingFile.objects.count(), 3)
        self.assertEqual(
            SequencingFile.objects.get(resource__resource_key="fq-unknown").mapping_evidence,
            SequencingFile.MappingEvidence.UNKNOWN,
        )
        self.assertIsNone(SequencingFile.objects.get(resource__resource_key="fq-unknown").library)
        self.assertEqual(StudyDataResource.objects.filter(resource_type="raw").count(), 3)

    def test_management_command_defaults_to_dry_run(self) -> None:
        (self.study_directory / "metadata.tsv").write_text(
            "sample\tgroup\nsample_1\tControl\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest()

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            call_command("import_study_catalog", str(manifest_path))

        self.assertFalse(Project.objects.exists())

    def test_dry_run_reports_no_change_and_stale_records_without_writes(self) -> None:
        metadata_path = self.study_directory / "metadata.tsv"
        metadata_path.write_text(
            "sample\tgroup\nsample_1\tControl\nsample_2\tTreated\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest()
        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            apply_study_manifest(manifest_path)
            no_change = diff_study_manifest(manifest_path)
            metadata_path.write_text(
                "sample\tgroup\nsample_1\tControl\n",
                encoding="utf-8",
            )
            changed = diff_study_manifest(manifest_path)

        self.assertEqual(no_change["outcome"], "no_changes")
        self.assertEqual(changed["outcome"], "changes")
        self.assertEqual(changed["stale"]["samples"], ["sample_2"])
        self.assertEqual(ImportBatch.objects.count(), 1)

    def test_count_headers_are_streamed_mapped_and_linked_to_declared_inputs(self) -> None:
        (self.study_directory / "metadata.tsv").write_text(
            "sample\tgroup\nsample_1\tControl\nsample_2\tTreated\n",
            encoding="utf-8",
        )
        (self.study_directory / "counts.tsv").write_text(
            "gene\tcontrol_pool\tsample_2\nENSG1\t10\t20\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest(
            artifacts=[
                {"key": "sample-metadata", "role": "metadata", "path": "metadata.tsv"},
                {
                    "key": "gene-counts",
                    "role": "counts",
                    "path": "counts.tsv",
                    "sample_column_map": {"control_pool": ["sample_1"]},
                    "input_resource_keys": ["sample-metadata"],
                },
            ],
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            apply_study_manifest(manifest_path)

        lineage = ResourceLineage.objects.get()
        self.assertEqual(lineage.parent_resource.resource_key, "sample-metadata")
        self.assertEqual(lineage.child_resource.resource_key, "gene-counts")
        self.assertEqual(lineage.evidence, ResourceLineage.Evidence.DECLARED)
        self.assertEqual(CountMatrixProfile.objects.get().validation_status, CountMatrixProfile.ValidationStatus.PENDING)

    def test_schema_v2_count_metadata_creates_valid_primary_matrix_profile(self) -> None:
        (self.study_directory / "metadata.tsv").write_text(
            "sample\tgroup\nsample_1\tControl\nsample_2\tTreated\n",
            encoding="utf-8",
        )
        (self.study_directory / "counts.tsv").write_text(
            "gene\tsample_1\tsample_2\nENSG1\t10\t20\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest(
            schema_version=2,
            artifacts=[
                {"key": "sample-metadata", "role": "metadata", "path": "metadata.tsv"},
                {
                    "key": "gene-counts",
                    "role": "counts",
                    "path": "counts.tsv",
                    "matrix": {
                        "value_type": "raw_counts",
                        "feature_id_kind": "ensembl_gene_id",
                        "annotation_source": "Ensembl",
                        "annotation_version": "110",
                    },
                },
            ],
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            apply_study_manifest(manifest_path)

        profile = CountMatrixProfile.objects.get()
        warehouse = StudyWarehouseMetadata.objects.get()
        self.assertEqual(profile.validation_status, CountMatrixProfile.ValidationStatus.VALID)
        self.assertEqual(profile.feature_count, 1)
        self.assertEqual(profile.columns.count(), 2)
        self.assertEqual(warehouse.primary_count_resource_id, profile.resource_id)

    def test_count_header_rejects_unknown_sample_columns(self) -> None:
        (self.study_directory / "metadata.tsv").write_text(
            "sample\tgroup\nsample_1\tControl\n",
            encoding="utf-8",
        )
        (self.study_directory / "counts.tsv").write_text(
            "gene\tnot_a_sample\nENSG1\t10\n",
            encoding="utf-8",
        )
        manifest_path = self.write_manifest(
            artifacts=[
                {"key": "sample-metadata", "role": "metadata", "path": "metadata.tsv"},
                {"key": "gene-counts", "role": "counts", "path": "counts.tsv"},
            ],
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            with self.assertRaisesRegex(ArchiveImportError, "unknown sample columns"):
                apply_study_manifest(manifest_path)

        self.assertEqual(ImportBatch.objects.get().status, ImportBatch.Status.FAILED)
        self.assertFalse(StudyWarehouseMetadata.objects.exists())

    def test_validation_failure_before_apply_is_retained_as_failed_audit(self) -> None:
        manifest_path = self.write_manifest(
            artifacts=[
                {"key": "missing-metadata", "role": "metadata", "path": "missing.tsv"}
            ],
        )

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            with self.assertRaisesRegex(ArchiveImportError, "does not exist"):
                apply_study_manifest(manifest_path)

        batch = ImportBatch.objects.get()
        self.assertEqual(batch.status, ImportBatch.Status.FAILED)
        self.assertEqual(batch.source_name, "pilot-study")
        self.assertFalse(Project.objects.exists())


class ArchiveStudyImportApiTests(TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.archive_root = Path(self.temporary_directory.name)
        self.study_directory = self.archive_root / "studies" / "api-pilot"
        self.study_directory.mkdir(parents=True)
        (self.study_directory / "portal-study.yaml").write_text(
            yaml.safe_dump(
                {
                    "schema_version": 1,
                    "study_key": "api-pilot",
                    "curation_status": "inventory",
                    "collaboration": {
                        "key": "api-program",
                        "title": "API program",
                        "pi_name": "Dr. Curie",
                        "researcher_name": "Researcher",
                        "bioinformatician_assigned": "Bioinfo",
                    },
                    "study": {"title": "API pilot", "study_type": "TGx"},
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        self.manifest_path = self.study_directory / "portal-study.yaml"
        self.client = APIClient()
        self.admin = User.objects.create_user(username="archive-admin", password="password123")
        self.admin.profile.role = UserProfile.Role.ADMIN
        self.admin.profile.save()
        self.client.force_authenticate(self.admin)

    def test_admin_can_preview_and_apply_read_only_archive_manifest(self) -> None:
        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            preview = self.client.post(
                "/api/profiling/study-imports/archive-preview/",
                {"manifest_path": str(self.manifest_path)},
                format="json",
            )
            applied = self.client.post(
                "/api/profiling/study-imports/archive-apply/",
                {"manifest_path": str(self.manifest_path)},
                format="json",
            )

        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["study_key"], "api-pilot")
        self.assertEqual(applied.status_code, 201)
        self.assertEqual(applied.json()["outcome"], "completed")
        self.assertTrue(StudyWarehouseMetadata.objects.filter(study_name="api-pilot").exists())

    def test_client_cannot_preview_archive_paths(self) -> None:
        client_user = User.objects.create_user(username="archive-client", password="password123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        self.client.force_authenticate(client_user)

        with override_settings(STUDY_ARCHIVE_ROOT=str(self.archive_root)):
            response = self.client.post(
                "/api/profiling/study-imports/archive-preview/",
                {"manifest_path": str(self.manifest_path)},
                format="json",
            )

        self.assertEqual(response.status_code, 403)
