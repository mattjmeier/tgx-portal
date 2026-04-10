from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

from django.core.management import call_command
from django.test import TestCase

from core.models import Assay, Project, Sample, Study, StudyOnboardingState
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
        study = Study.objects.create(
            project=project,
            title="Existing study",
            species=Study.Species.HUMAN,
            celltype="HepaRG",
            treatment_var="dose",
            batch_var="plate",
        )
        sample = Sample.objects.create(
            study=study,
            sample_ID="existing-sample",
            sample_name="Existing sample",
            description="Should be removed by the reset flow.",
            group="control",
            dose=0,
            solvent_control=True,
        )
        Assay.objects.create(
            sample=sample,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="hg38",
            quantification_method="raw_counts",
        )

        call_command("reset_seed_data")

        self.assertEqual(Project.objects.count(), 4)
        self.assertEqual(Study.objects.count(), 12)
        self.assertEqual(Sample.objects.count(), 36)
        self.assertEqual(Assay.objects.count(), 36)
        self.assertEqual(StudyOnboardingState.objects.count(), 12)
        self.assertFalse(Project.objects.filter(title="Existing collaboration").exists())

        project_titles = list(Project.objects.order_by("title").values_list("title", flat=True))
        self.assertEqual(
            project_titles,
            [
                "Aflatoxin Response Atlas",
                "Endocrine Resilience Screen",
                "Neuroinflammation Reference Panel",
                "Pulmonary Stress Sentinel",
            ],
        )

    def test_seeded_project_can_generate_a_config_bundle(self) -> None:
        call_command("reset_seed_data")

        project = Project.objects.get(title="Aflatoxin Response Atlas")

        bundle = build_project_config_bundle(project)

        self.assertEqual(bundle.filename, "config_bundle_aflatoxin_response_atlas.zip")

        with ZipFile(BytesIO(bundle.content)) as archive:
            names = sorted(archive.namelist())
            self.assertEqual(names, ["config.yaml", "contrasts.tsv", "metadata.tsv"])

            config_yaml = archive.read("config.yaml").decode("utf-8")
            metadata_tsv = archive.read("metadata.tsv").decode("utf-8")
            contrasts_tsv = archive.read("contrasts.tsv").decode("utf-8")

        self.assertIn("project_title: Aflatoxin Response Atlas", config_yaml)
        self.assertIn("platform: rna_seq", config_yaml)
        self.assertIn("sample_ID\tsample_name\tgroup\tdose", metadata_tsv)
        self.assertIn("C_2D\t1uM_2D", contrasts_tsv)
