from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from core.models import Assay, Project, Sample, SamplePlating, Study, default_study_config


class CoreModelsPackageCompatibilityTests(TestCase):
    def test_core_models_re_exports_existing_model_names(self) -> None:
        project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="Compatibility check",
        )
        study = Study.objects.create(project=project, title="Warehouse compatibility study")
        sample = Sample.objects.create(study=study, sample_ID="sample-1")

        self.assertEqual(str(sample), "sample-1")
        self.assertEqual(default_study_config()["pipeline"]["sample_id"], "sample_ID")


class CoreSchemaHardeningTests(TestCase):
    def setUp(self) -> None:
        self.project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="Core schema hardening",
        )
        self.other_project = Project.objects.create(
            pi_name="Dr. Franklin",
            researcher_name="Researcher B",
            bioinformatician_assigned="Bioinfo B",
            title="Project Beta",
        )

    def test_study_title_is_unique_within_project_only(self) -> None:
        Study.objects.create(project=self.project, title="Shared study title")
        Study.objects.create(project=self.other_project, title="Shared study title")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Study.objects.create(project=self.project, title="Shared study title")

    def test_study_metadata_uniqueness_treats_missing_values_deterministically(self) -> None:
        Study.objects.create(project=self.project, title="Draft study A")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Study.objects.create(project=self.project, title="Draft study B")

    def test_sample_plating_prevents_duplicate_plate_positions_and_invalid_columns(self) -> None:
        study = Study.objects.create(project=self.project, title="Plating study")
        sample_a = Sample.objects.create(study=study, sample_ID="sample_a")
        sample_b = Sample.objects.create(study=study, sample_ID="sample_b")
        SamplePlating.objects.create(
            sample=sample_a,
            plate_number="plate-1",
            batch="batch-1",
            plate_well="A01",
            row="A",
            column=1,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            SamplePlating.objects.create(
                sample=sample_b,
                plate_number="plate-1",
                batch="batch-1",
                plate_well="A01",
                row="A",
                column=1,
            )

        invalid_plating = SamplePlating(
            sample=sample_b,
            plate_number="plate-1",
            batch="batch-1",
            plate_well="Z99",
            row="Z",
            column=99,
        )
        with self.assertRaises(ValidationError):
            invalid_plating.full_clean()

    def test_duplicate_equivalent_assays_are_rejected(self) -> None:
        study = Study.objects.create(project=self.project, title="Assay study")
        sample = Sample.objects.create(study=study, sample_ID="sample_1")
        Assay.objects.create(
            sample=sample,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="GRCh38",
            quantification_method="raw_counts",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Assay.objects.create(
                sample=sample,
                platform=Assay.Platform.RNA_SEQ,
                genome_version="GRCh38",
                quantification_method="raw_counts",
            )


class WarehouseModelContractTests(TestCase):
    def setUp(self) -> None:
        from chemicals.models import ChemicalSample
        from profiling.models import ProfilingPlatform, StudyWarehouseMetadata

        self.project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="Warehouse model checks",
        )
        self.study = Study.objects.create(
            project=self.project,
            title="HTTr screen",
            species=Study.Species.HUMAN,
            celltype="U-2 OS",
        )
        self.chemical_sample = ChemicalSample.objects.create(
            chemical_sample_id="HC-AFB1-001",
            dtxsid="DTXSID7020005",
            casrn="1162-65-8",
            preferred_name="Aflatoxin B1",
        )
        self.platform = ProfilingPlatform.objects.create(
            platform_name="humanWT2_1_brAtten",
            title="TempO-seq Human WT v2.1 Broad Attenuation",
            technology_type=ProfilingPlatform.TechnologyType.TEMPO_SEQ,
            study_type=ProfilingPlatform.StudyType.HTTR,
            species=Study.Species.HUMAN,
        )
        self.study_metadata = StudyWarehouseMetadata.objects.create(
            study=self.study,
            study_name="epa_httr_u2os_screen",
            source="Health Canada",
            study_type=StudyWarehouseMetadata.StudyType.HTTR,
            in_vitro=True,
            platform=self.platform,
            cell_types=["U-2 OS"],
            culture_conditions=["standard"],
            exposure_conditions=["24h"],
            references=["10.1234/example"],
        )

    def test_chemical_sample_ids_are_unique(self) -> None:
        from chemicals.models import ChemicalSample

        with self.assertRaises(IntegrityError), transaction.atomic():
            ChemicalSample.objects.create(
                chemical_sample_id="HC-AFB1-001",
                preferred_name="Duplicate AFB1",
            )

    def test_chemical_identifier_constraints_and_validation(self) -> None:
        from chemicals.models import ChemicalSample

        ChemicalSample.objects.create(
            chemical_sample_id="HC-DTX-001",
            spid="SPID-001",
            roc_id="ROC-001",
            dtxsid="DTXSID001234567",
            casrn="50-00-0",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            ChemicalSample.objects.create(
                chemical_sample_id="HC-DTX-002",
                spid="SPID-001",
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            ChemicalSample.objects.create(
                chemical_sample_id="HC-DTX-003",
                roc_id="ROC-001",
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            ChemicalSample.objects.create(
                chemical_sample_id="HC-DTX-004",
                dtxsid="DTXSID001234567",
            )

        ChemicalSample.objects.create(chemical_sample_id="HC-BLANK-001")
        ChemicalSample.objects.create(chemical_sample_id="HC-BLANK-002")

        for field, value in {"dtxsid": "BAD001", "casrn": "not-a-cas"}.items():
            sample = ChemicalSample(chemical_sample_id=f"invalid-{field}", **{field: value})
            with self.assertRaises(ValidationError):
                sample.full_clean()

    def test_study_warehouse_metadata_links_study_to_platform(self) -> None:
        self.assertEqual(self.study.warehouse_metadata.platform.platform_name, "humanWT2_1_brAtten")
        self.assertEqual(self.platform.studies.get(), self.study_metadata)

    def test_series_pod_and_httr_well_constraints(self) -> None:
        from profiling.models import HTTrSeriesWell, HTTrWell, Metric, Pod, Series

        series = Series.objects.create(
            study_metadata=self.study_metadata,
            chemical_sample=self.chemical_sample,
            series_name="AIME_AFB1",
            treatment_condition="AIME+",
            exposure_lower=Decimal("0.1"),
            exposure_upper=Decimal("10.0"),
            exposure_unit="uM",
            exposure_group_count=4,
            exposure_values=[0.1, 1.0, 3.0, 10.0],
            control_type="DMSO",
            factors=["plate_id"],
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Series.objects.create(
                study_metadata=self.study_metadata,
                chemical_sample=self.chemical_sample,
                series_name="AIME_AFB1",
            )

        invalid_series = Series(
            study_metadata=self.study_metadata,
            chemical_sample=self.chemical_sample,
            series_name="invalid_range",
            exposure_lower=Decimal("10.0"),
            exposure_upper=Decimal("1.0"),
            exposure_unit="uM",
        )
        with self.assertRaises(ValidationError):
            invalid_series.full_clean()
        metric = Metric.objects.create(
            metric_name="httr_sig_perc5",
            title="5th Percentile of Signature BMCs",
        )
        Pod.objects.create(series=series, metric=metric, pod=Decimal("1.5"), active=True)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Pod.objects.create(series=series, metric=metric, pod=Decimal("2.0"), active=False)

        inactive_null_pod = Pod(series=series, metric=Metric.objects.create(metric_name="inactive_null", title="Inactive Null"))
        inactive_null_pod.full_clean()

        active_null_pod = Pod(series=series, metric=Metric.objects.create(metric_name="active_null", title="Active Null"), active=True)
        with self.assertRaises(ValidationError):
            active_null_pod.full_clean()

        negative_pod = Pod(
            series=series,
            metric=Metric.objects.create(metric_name="negative", title="Negative"),
            pod=Decimal("-1.0"),
        )
        with self.assertRaises(ValidationError):
            negative_pod.full_clean()

        well = HTTrWell.objects.create(
            study_metadata=self.study_metadata,
            biosample_name="plate1_A01",
            plate_id="plate1",
            well_row=HTTrWell.WellRow.A,
            well_column=1,
            cell_type="U-2 OS",
            treatment_name="AFB1_0.1uM",
            chemical_sample=self.chemical_sample,
            exposure_time_h=24,
            exposure_concentration=Decimal("0.1"),
            exposure_vehicle="DMSO",
        )
        HTTrSeriesWell.objects.create(series=series, well=well, is_control=False, dose_level=1)

        with self.assertRaises(IntegrityError), transaction.atomic():
            HTTrSeriesWell.objects.create(series=series, well=well, is_control=False, dose_level=1)

        invalid_well = HTTrWell(
            study_metadata=self.study_metadata,
            biosample_name="blank_treated",
            plate_id="plate1",
            well_row=HTTrWell.WellRow.B,
            well_column=1,
            cell_type="U-2 OS",
            treatment_name="blank",
            is_blank=True,
            is_treated=True,
        )
        with self.assertRaises(ValidationError):
            invalid_well.full_clean()

    def test_study_data_resource_and_import_batch_constraints(self) -> None:
        from django.core.exceptions import ValidationError

        from profiling.models import ImportBatch, ImportBatchResource, StudyDataResource

        resource = StudyDataResource.objects.create(
            study_metadata=self.study_metadata,
            resource_type=StudyDataResource.ResourceType.MANIFEST,
            storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
            display_name="Original manifest",
            uri="/historical/epa_httr_u2os_screen/manifest.csv",
            file_format="csv",
            availability_status=StudyDataResource.AvailabilityStatus.AVAILABLE,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            StudyDataResource.objects.create(
                study_metadata=self.study_metadata,
                resource_type=StudyDataResource.ResourceType.MANIFEST,
                storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
                display_name="Duplicate manifest pointer",
                uri="/historical/epa_httr_u2os_screen/manifest.csv",
            )

        draft_resource = StudyDataResource.objects.create(
            study_metadata=None,
            resource_type=StudyDataResource.ResourceType.METADATA,
            storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
            display_name="Draft manifest",
            uri="/tmp/imports/draft-manifest.csv",
        )
        self.assertIn("Draft manifest", str(draft_resource))
        with self.assertRaises(IntegrityError), transaction.atomic():
            StudyDataResource.objects.create(
                study_metadata=None,
                resource_type=StudyDataResource.ResourceType.METADATA,
                storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
                display_name="Duplicate draft manifest",
                uri="/tmp/imports/draft-manifest.csv",
            )

        invalid_resource = StudyDataResource(
            study_metadata=self.study_metadata,
            resource_type="unsupported",
            storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
            display_name="Invalid resource",
            uri="/historical/invalid.csv",
        )
        with self.assertRaises(ValidationError):
            invalid_resource.full_clean()

        batch = ImportBatch.objects.create(
            study_metadata=self.study_metadata,
            source_system="UL export",
            source_name="EPA HTTr U-2 OS import",
            status=ImportBatch.Status.COMPLETED,
            records_seen=1,
            records_created=1,
        )
        ImportBatchResource.objects.create(
            import_batch=batch,
            data_resource=resource,
            role=ImportBatchResource.ResourceRole.INPUT,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            ImportBatchResource.objects.create(
                import_batch=batch,
                data_resource=resource,
                role=ImportBatchResource.ResourceRole.OUTPUT,
            )

    def test_alias_maps_reject_duplicate_canonical_targets(self) -> None:
        from profiling.models import ImportAliasMap, ImportBatch

        batch = ImportBatch.objects.create(
            study_metadata=self.study_metadata,
            source_name="Alias import",
        )
        ImportAliasMap.objects.create(
            import_batch=batch,
            file_role=ImportAliasMap.FileRole.METADATA,
            canonical_target="sample_ID",
            source_column="Sample ID",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            ImportAliasMap.objects.create(
                import_batch=batch,
                file_role=ImportAliasMap.FileRole.METADATA,
                canonical_target="sample_ID",
                source_column="Sample Identifier",
            )

    def test_httr_series_well_must_match_series_study(self) -> None:
        from profiling.models import HTTrSeriesWell, HTTrWell, Series

        other_study = Study.objects.create(project=self.project, title="Other warehouse study")
        other_metadata = self.study_metadata.__class__.objects.create(
            study=other_study,
            study_name="other_httr_study",
            study_type=self.study_metadata.StudyType.HTTR,
            platform=self.platform,
        )
        series = Series.objects.create(
            study_metadata=self.study_metadata,
            chemical_sample=self.chemical_sample,
            series_name="series_one",
        )
        other_well = HTTrWell.objects.create(
            study_metadata=other_metadata,
            biosample_name="plate2_A01",
            plate_id="plate2",
            well_row=HTTrWell.WellRow.A,
            well_column=1,
            cell_type="U-2 OS",
            treatment_name="AFB1",
        )
        link = HTTrSeriesWell(series=series, well=other_well)

        with self.assertRaises(ValidationError):
            link.full_clean()
