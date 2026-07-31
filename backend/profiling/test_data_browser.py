from __future__ import annotations

import csv
import gzip
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Project, Sample, Study, UserProfile
from chemicals.models import ChemicalSample
from profiling.data_exports import build_data_export
from profiling.models import (
    CountMatrixColumn,
    CountMatrixProfile,
    DataExport,
    ProfilingPlatform,
    Series,
    StudyDataResource,
    StudyWarehouseMetadata,
)


User = get_user_model()


class DataBrowserTests(TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.override = override_settings(
            STUDY_ARCHIVE_ROOT=str(self.root),
            DATA_EXPORT_ROOT=str(self.root / "exports"),
            CELERY_TASK_ALWAYS_EAGER=True,
        )
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.addCleanup(self.temporary_directory.cleanup)

        self.admin = User.objects.create_user(username="admin", password="admin123")
        self.admin.profile.role = UserProfile.Role.ADMIN
        self.admin.profile.save()
        self.client_user = User.objects.create_user(username="client", password="client123")
        self.client_user.profile.role = UserProfile.Role.CLIENT
        self.client_user.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.project = Project.objects.create(
            owner=self.admin,
            pi_name="PI",
            researcher_name="Researcher",
            bioinformatician_assigned="Bioinfo",
            title="Regulatory program",
        )
        self.platform = ProfilingPlatform.objects.create(
            platform_name="rna-v1",
            title="RNA v1",
            technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
            study_type=ProfilingPlatform.StudyType.TGX,
            species=Study.Species.HUMAN,
        )

    def create_matrix(self, key: str, rows: list[tuple[str, str, str]]) -> CountMatrixProfile:
        study = Study.objects.create(
            project=self.project,
            title=f"Study {key}",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            status=Study.Status.ACTIVE,
        )
        samples = [
            Sample.objects.create(study=study, sample_ID=f"{key}_control"),
            Sample.objects.create(study=study, sample_ID=f"{key}_treated"),
        ]
        warehouse = StudyWarehouseMetadata.objects.create(
            study=study,
            study_name=key,
            study_type=StudyWarehouseMetadata.StudyType.TGX,
            platform=self.platform,
            curation_status=StudyWarehouseMetadata.CurationStatus.METADATA_CURATED,
        )
        path = self.root / f"{key}.tsv"
        with path.open("w", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t")
            writer.writerow(["gene", samples[0].sample_ID, samples[1].sample_ID])
            writer.writerows(rows)
        resource = StudyDataResource.objects.create(
            study_metadata=warehouse,
            resource_key=f"{key}-counts",
            resource_type=StudyDataResource.ResourceType.FEATURE,
            storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
            display_name=path.name,
            uri=str(path),
            file_format="tsv",
            checksum_algorithm="sha256",
            checksum=hashlib.sha256(path.read_bytes()).hexdigest(),
            size_bytes=path.stat().st_size,
            availability_status=StudyDataResource.AvailabilityStatus.AVAILABLE,
        )
        profile = CountMatrixProfile.objects.create(
            resource=resource,
            value_type=CountMatrixProfile.ValueType.RAW_COUNTS,
            feature_id_kind="ensembl_gene_id",
            annotation_source="Ensembl",
            annotation_version="110",
            feature_column="gene",
            feature_count=len(rows),
            matrix_column_count=2,
            validation_status=CountMatrixProfile.ValidationStatus.VALID,
        )
        for ordinal, sample in enumerate(samples):
            column = CountMatrixColumn.objects.create(
                matrix=profile,
                original_name=sample.sample_ID,
                ordinal=ordinal,
            )
            column.samples.add(sample)
        warehouse.primary_count_resource = resource
        warehouse.full_clean()
        warehouse.save(update_fields=["primary_count_resource"])
        return profile

    def test_readiness_and_compatibility_key_are_derived_from_canonical_fields(self) -> None:
        matrix = self.create_matrix("study-a", [("g1", "1", "2")])

        self.assertTrue(matrix.is_browser_ready)
        self.assertEqual(
            matrix.compatibility_key,
            [self.platform.id, "human", "raw_counts", "ensembl_gene_id", "Ensembl", "110"],
        )

    def test_data_browser_is_admin_only_and_returns_ready_studies(self) -> None:
        self.create_matrix("study-a", [("g1", "1", "2")])

        response = self.api.get("/api/profiling/data-browser/studies/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertTrue(response.json()["results"][0]["browser_ready"])

        self.api.force_authenticate(self.client_user)
        self.assertEqual(self.api.get("/api/profiling/data-browser/studies/").status_code, 403)

    def test_default_view_excludes_incompletely_mapped_matrices(self) -> None:
        matrix = self.create_matrix("study-a", [("g1", "1", "2")])
        matrix.columns.order_by("ordinal").last().samples.clear()

        self.assertEqual(self.api.get("/api/profiling/data-browser/studies/").json()["count"], 0)
        self.assertEqual(self.api.get("/api/profiling/data-browser/studies/?ready=false").json()["count"], 1)

    def test_preview_is_bounded(self) -> None:
        matrix = self.create_matrix("study-a", [(f"g{i}", str(i), str(i + 1)) for i in range(30)])
        response = self.api.get(f"/api/profiling/count-matrices/{matrix.id}/preview/?features=999&samples=999")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["rows"]), 20)
        self.assertEqual(len(response.json()["columns"]), 3)

    def test_facets_include_canonical_chemical_and_technology_counts(self) -> None:
        matrix = self.create_matrix("study-a", [("g1", "1", "2")])
        chemical = ChemicalSample.objects.create(
            chemical_sample_id="BPA",
            preferred_name="Bisphenol A",
            dtxsid="DTXSID7020182",
            casrn="80-05-7",
        )
        Series.objects.create(
            study_metadata=matrix.resource.study_metadata,
            chemical_sample=chemical,
            series_name="bpa-series",
        )

        response = self.api.get("/api/profiling/data-browser/facets/?ready=true")

        self.assertEqual(response.status_code, 200)
        self.assertIn({"value": "RNA-Seq", "label": "RNA-Seq", "count": 1}, response.json()["facets"]["technology"])
        self.assertIn({"value": chemical.id, "label": "Bisphenol A", "count": 1}, response.json()["facets"]["chemical"])

    def test_export_api_queues_and_completes_job(self) -> None:
        matrix = self.create_matrix("study-a", [("g1", "1", "2")])

        response = self.api.post(
            "/api/profiling/data-exports/",
            {"matrix_ids": [matrix.id], "filters": {"technology": ["RNA-Seq"]}},
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        export = DataExport.objects.get(id=response.json()["id"])
        self.assertEqual(export.status, DataExport.Status.COMPLETED)
        self.assertTrue(Path(export.output_path).is_file())

    def test_combined_export_uses_feature_intersection_and_prefixes_columns(self) -> None:
        first = self.create_matrix("study-a", [("g1", "1", "2"), ("g2", "3", "4")])
        second = self.create_matrix("study-b", [("g2", "5", "6"), ("g3", "7", "8")])
        export = DataExport.objects.create(
            requested_by=self.admin,
            matrix_ids=[first.id, second.id],
            request_snapshot={"filters": {"technology": ["RNA-Seq"]}},
        )

        build_data_export(export.id)
        export.refresh_from_db()

        self.assertEqual(export.status, DataExport.Status.COMPLETED)
        with ZipFile(export.output_path) as archive:
            with gzip.open(archive.open("counts.tsv.gz"), "rt") as handle:
                rows = list(csv.reader(handle, delimiter="\t"))
            self.assertEqual(rows[0], ["gene", "study-a::study-a_control", "study-a::study-a_treated", "study-b::study-b_control", "study-b::study-b_treated"])
            self.assertEqual(rows[1], ["g2", "3", "4", "5", "6"])
            selection = json.loads(archive.read("selection.json"))
            self.assertEqual(selection["feature_join"], "intersection")
