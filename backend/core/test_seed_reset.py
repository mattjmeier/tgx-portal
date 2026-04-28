from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from chemicals.models import ChemicalSample
from core.models import Assay, Project, Sample, Study, StudyConfig, StudyMetadataFieldSelection, StudyMetadataMapping, StudyOnboardingState
from core.onboarding_options import BIOSPYDER_KIT_VALUES
from core.services import build_project_config_bundle
from profiling.models import (
    HTTrSeriesWell,
    HTTrWell,
    ImportBatch,
    ImportBatchResource,
    Metric,
    Pod,
    ProfilingPlatform,
    Series,
    StudyDataResource,
    StudyWarehouseMetadata,
)

User = get_user_model()


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
        self.assertEqual(Sample.objects.count(), 108)
        self.assertEqual(Assay.objects.count(), 108)
        self.assertEqual(StudyOnboardingState.objects.count(), 12)
        self.assertEqual(StudyConfig.objects.count(), 12)
        self.assertEqual(StudyMetadataMapping.objects.count(), 12)
        self.assertGreater(StudyMetadataFieldSelection.objects.count(), 12)
        self.assertFalse(Project.objects.filter(title="Existing collaboration").exists())

    def test_command_seeds_linked_warehouse_demo_records(self) -> None:
        call_command("reset_seed_data")

        self.assertEqual(ChemicalSample.objects.count(), 1)
        self.assertEqual(ProfilingPlatform.objects.count(), 11)
        self.assertEqual(StudyWarehouseMetadata.objects.count(), 1)
        self.assertEqual(Series.objects.count(), 1)
        self.assertEqual(Metric.objects.count(), 1)
        self.assertEqual(Pod.objects.count(), 1)
        self.assertEqual(HTTrWell.objects.count(), 1)
        self.assertEqual(HTTrSeriesWell.objects.count(), 1)
        self.assertEqual(StudyDataResource.objects.count(), 2)
        self.assertEqual(ImportBatch.objects.count(), 1)
        self.assertEqual(ImportBatchResource.objects.count(), 2)

        self.assertEqual(
            set(ProfilingPlatform.objects.values_list("technology_type", flat=True)),
            {
                ProfilingPlatform.TechnologyType.RNA_SEQ,
                ProfilingPlatform.TechnologyType.TEMPO_SEQ,
                ProfilingPlatform.TechnologyType.DRUG_SEQ,
            },
        )
        seeded_biospyder_kits = {
            platform.ext["biospyder_kit"]
            for platform in ProfilingPlatform.objects.filter(technology_type=ProfilingPlatform.TechnologyType.TEMPO_SEQ)
        }
        self.assertEqual(seeded_biospyder_kits, set(BIOSPYDER_KIT_VALUES))

        metadata = StudyWarehouseMetadata.objects.select_related("study", "platform").get()
        self.assertEqual(metadata.study.title, "MCF-7 estrogen pulse")
        self.assertEqual(metadata.study_name, "hc_afb1_warehouse_demo")
        self.assertEqual(metadata.platform.platform_name, "rnaseq_hg38_demo")
        self.assertEqual(metadata.series.get().chemical_sample.chemical_sample_id, "HC-AFB1-DEMO-001")
        self.assertEqual(
            set(metadata.data_resources.values_list("resource_type", flat=True)),
            {StudyDataResource.ResourceType.MANIFEST, StudyDataResource.ResourceType.FEATURE},
        )
        import_batch = metadata.import_batches.get()
        self.assertEqual(import_batch.status, ImportBatch.Status.COMPLETED)
        self.assertEqual(import_batch.resource_links.count(), 2)

    def test_seeded_reference_library_has_no_platform_drift_warnings(self) -> None:
        admin = User.objects.create_user(username="reference-admin", password="admin123")
        admin.profile.role = "admin"
        admin.profile.save()
        client = APIClient()
        client.force_authenticate(user=admin)

        call_command("reset_seed_data")

        response = client.get("/api/reference-library/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["drift_warnings"], [])
        self.assertEqual(payload["summary"]["technology_type_count"], 3)
        self.assertEqual(payload["summary"]["profiling_platform_count"], 11)

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

    def test_seeded_ready_studies_include_required_config_fields(self) -> None:
        call_command("reset_seed_data")

        configs = StudyConfig.objects.select_related("study").exclude(study__title="AFB1 format comparison bridge").order_by("study__title")

        self.assertEqual(configs.count(), 11)
        for config in configs:
            self.assertTrue(config.common["instrument_model"])
            self.assertTrue(config.common["sequenced_by"])
            self.assertEqual(config.common["platform"], "RNA-Seq")
            self.assertEqual(config.pipeline["mode"], "se")

    def test_seeded_study_groups_have_three_samples_each(self) -> None:
        call_command("reset_seed_data")

        for study in Study.objects.order_by("title"):
            group_counts: dict[str, int] = {}
            for sample in study.samples.all():
                group = str((sample.metadata or {}).get("group") or "")
                self.assertTrue(group, msg=f"Study {study.title} has a sample without a group.")
                group_counts[group] = group_counts.get(group, 0) + 1

            self.assertTrue(group_counts, msg=f"Study {study.title} has no seeded groups.")
            self.assertTrue(all(count == 3 for count in group_counts.values()), msg=f"Study {study.title} group counts were {group_counts}.")

    def test_seeded_ready_study_explorer_summary_is_not_blocked(self) -> None:
        admin = User.objects.create_user(username="seed-admin", password="admin123")
        admin.profile.role = "admin"
        admin.profile.save()
        client = APIClient()
        client.force_authenticate(user=admin)

        call_command("reset_seed_data")

        study = Study.objects.get(title="MCF-7 estrogen pulse")
        response = client.get(f"/api/studies/{study.id}/explorer-summary/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["readiness"]["status"], "ready")
        self.assertEqual(payload["readiness"]["label"], "Ready")
        self.assertEqual(payload["sample_summary"]["total"], 9)
        self.assertEqual(payload["sample_summary"]["solvent_controls"], 3)
        self.assertEqual(payload["assay_summary"]["samples_with_assays"], 9)
        self.assertEqual(payload["assay_summary"]["samples_missing_assays"], 0)
        self.assertEqual(payload["config_summary"]["instrument_model"], "Illumina NovaSeq 6000")
        self.assertEqual(payload["config_summary"]["sequenced_by"], "HC Genomics lab")

    def test_seeded_edge_case_study_is_warning_not_invalid_blocked(self) -> None:
        admin = User.objects.create_user(username="seed-admin", password="admin123")
        admin.profile.role = "admin"
        admin.profile.save()
        client = APIClient()
        client.force_authenticate(user=admin)

        call_command("reset_seed_data")

        study = Study.objects.get(title="AFB1 format comparison bridge")
        state = StudyOnboardingState.objects.get(study=study)
        config = StudyConfig.objects.get(study=study)
        response = client.get(f"/api/studies/{study.id}/explorer-summary/")

        self.assertEqual(state.status, StudyOnboardingState.Status.DRAFT)
        self.assertTrue(config.common["instrument_model"])
        self.assertTrue(config.common["sequenced_by"])
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["readiness"]["status"], "warning")
        self.assertEqual(payload["readiness"]["label"], "Needs attention")
        self.assertTrue(any(issue["code"] == "onboarding_draft" for issue in payload["blocking_issues"]))
        self.assertFalse(any(issue["code"] == "config.common.instrument_model" for issue in payload["blocking_issues"]))
        self.assertFalse(any(issue["code"] == "config.common.sequenced_by" for issue in payload["blocking_issues"]))
