from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase

from core.models import Project, Sample, Study, default_study_config


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

    def test_study_warehouse_metadata_links_study_to_platform(self) -> None:
        self.assertEqual(self.study.warehouse_metadata.platform.platform_name, "humanWT2_1_brAtten")
        self.assertEqual(self.platform.studies.get(), self.study_metadata)

    def test_series_pod_and_httr_well_constraints(self) -> None:
        from profiling.models import HTTrSeriesWell, HTTrWell, Metric, Pod, Series

        series = Series.objects.create(
            study_metadata=self.study_metadata,
            chemical_sample=self.chemical_sample,
            treatment_condition="AIME+",
            exposure_lower=Decimal("0.1"),
            exposure_upper=Decimal("10.0"),
            exposure_unit="uM",
            exposure_group_count=4,
            exposure_values=[0.1, 1.0, 3.0, 10.0],
            control_type="DMSO",
            factors=["plate_id"],
        )
        metric = Metric.objects.create(
            metric_name="httr_sig_perc5",
            title="5th Percentile of Signature BMCs",
        )
        Pod.objects.create(series=series, metric=metric, pod=Decimal("1.5"), active=True)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Pod.objects.create(series=series, metric=metric, pod=Decimal("2.0"), active=False)

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
