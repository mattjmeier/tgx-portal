from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

from django.core.management import call_command
from django.test import TestCase

from chemicals.models import ChemicalSample
from core.models import Assay, Project, Sample, Study, StudyConfig, StudyMetadataFieldSelection, StudyMetadataMapping, StudyOnboardingState
from core.services import build_project_config_bundle
from profiling.models import HTTrSeriesWell, HTTrWell, Metric, Pod, ProfilingPlatform, Series, StudyWarehouseMetadata


class ResetSeedDataCommandTests(TestCase):
    def test_command_replaces_existing_records_with_deterministic_seed_data(self) -> None:
        project = Project.objects.create(
            pi_name="Existing PI",
            researcher_name="Existing Researcher",
            bioinformatician_assigned="Existing Bioinfo",
            title="Existing collaboration",
            description="Should be removed by the reset flow.",
        )
        study = Study.objects.create(project=project, title="Existing study")
        sample = Sample.objects.create(study=study, sample_ID="existing-sample", metadata={})
        Assay.objects.create(sample=sample, platform=Assay.Platform.RNA_SEQ, genome_version="hg38", quantification_method="raw_counts")

        call_command("reset_seed_data")

        self.assertEqual(Project.objects.count(), 4)
        self.assertEqual(Study.objects.count(), 12)
        self.assertEqual(Sample.objects.count(), 36)
        self.assertEqual(Assay.objects.count(), 36)
        self.assertEqual(StudyOnboardingState.objects.count(), 12)
        self.assertEqual(StudyConfig.objects.count(), 12)
        self.assertEqual(StudyMetadataMapping.objects.count(), 12)
        self.assertGreater(StudyMetadataFieldSelection.objects.count(), 12)
        self.assertFalse(Project.objects.filter(title="Existing collaboration").exists())

    def test_command_seeds_linked_warehouse_demo_records(self) -> None:
        call_command("reset_seed_data")

        self.assertEqual(ChemicalSample.objects.count(), 1)
        self.assertEqual(ProfilingPlatform.objects.count(), 1)
        self.assertEqual(StudyWarehouseMetadata.objects.count(), 1)
        self.assertEqual(Series.objects.count(), 1)
        self.assertEqual(Metric.objects.count(), 1)
        self.assertEqual(Pod.objects.count(), 1)
        self.assertEqual(HTTrWell.objects.count(), 1)
        self.assertEqual(HTTrSeriesWell.objects.count(), 1)

        metadata = StudyWarehouseMetadata.objects.select_related("study", "platform").get()
        self.assertEqual(metadata.study.title, "MCF-7 estrogen pulse")
        self.assertEqual(metadata.study_name, "hc_afb1_warehouse_demo")
        self.assertEqual(metadata.platform.platform_name, "rnaseq_hg38_demo")
        self.assertEqual(metadata.series.get().chemical_sample.chemical_sample_id, "HC-AFB1-DEMO-001")

    def test_seeded_project_can_generate_a_config_bundle(self) -> None:
        call_command("reset_seed_data")

        project = Project.objects.get(title="Aflatoxin Response Study")
        bundle = build_project_config_bundle(project)

        self.assertEqual(bundle.filename, "config_bundle_aflatoxin_response_study.zip")

        with ZipFile(BytesIO(bundle.content)) as archive:
            names = sorted(archive.namelist())
            config_yaml = archive.read("afb1_2d_dose_response/config.yaml").decode("utf-8")
            metadata_tsv = archive.read("afb1_2d_dose_response/metadata.tsv").decode("utf-8")
            contrasts_tsv = archive.read("afb1_2d_dose_response/contrasts.tsv").decode("utf-8")

        self.assertIn("afb1_2d_dose_response/config.yaml", names)
        self.assertIn("project_title: Aflatoxin Response Study", config_yaml)
        self.assertTrue(metadata_tsv.startswith("sample_ID\tsample_name\tgroup\tdose\tplate\tsolvent_control"))
        self.assertIn("C_2D\t1uM_2D", contrasts_tsv)

    def test_seeded_onboarding_state_includes_current_template_context(self) -> None:
        call_command("reset_seed_data")

        state = StudyOnboardingState.objects.select_related("study").get(study__title="AFB1 2D dose response")

        self.assertEqual(state.status, StudyOnboardingState.Status.FINAL)
        self.assertEqual(state.template_context["study_design_elements"], ["exposure", "treatment", "batch"])
        self.assertEqual(state.template_context["exposure_label_mode"], "dose")
        self.assertEqual(state.template_context["treatment_vars"], ["group"])
        self.assertEqual(state.template_context["batch_vars"], ["plate"])
