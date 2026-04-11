from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

from django.core.management import call_command
from django.test import TestCase

from core.models import Assay, Project, Sample, Study, StudyConfig, StudyMetadataFieldSelection, StudyMetadataMapping, StudyOnboardingState
from core.services import build_project_config_bundle


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
