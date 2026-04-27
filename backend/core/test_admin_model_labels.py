from django.test import SimpleTestCase

from chemicals.models import ChemicalSample
from core.models import (
    Assay,
    ControlledLookupValue,
    MetadataFieldDefinition,
    Project,
    Sample,
    SamplePlating,
    SequencingRun,
    Study,
    StudyConfig,
    StudyMetadataFieldSelection,
    StudyMetadataMapping,
    StudyOnboardingState,
)
from profiling.models import HTTrSeriesWell, HTTrWell, Metric, Pod, ProfilingPlatform, Series, StudyWarehouseMetadata


class AdminModelLabelTests(SimpleTestCase):
    def test_admin_sidebar_model_labels_use_domain_names(self) -> None:
        expected_labels = {
            ChemicalSample: ("chemical sample", "chemical samples"),
            Project: ("project", "projects"),
            Study: ("study", "studies"),
            Sample: ("sample", "samples"),
            Assay: ("assay", "assays"),
            SamplePlating: ("sample plating", "sample plating records"),
            SequencingRun: ("sequencing run", "sequencing runs"),
            StudyConfig: ("study configuration", "study configurations"),
            StudyMetadataMapping: ("study metadata mapping", "study metadata mappings"),
            StudyOnboardingState: ("study onboarding state", "study onboarding states"),
            ControlledLookupValue: ("controlled lookup value", "controlled lookup values"),
            MetadataFieldDefinition: ("metadata field definition", "metadata field definitions"),
            StudyMetadataFieldSelection: ("study metadata field selection", "study metadata field selections"),
            ProfilingPlatform: ("profiling platform", "profiling platforms"),
            StudyWarehouseMetadata: ("study warehouse metadata", "study warehouse metadata"),
            Series: ("series", "series"),
            Metric: ("metric", "metrics"),
            Pod: ("POD", "PODs"),
            HTTrWell: ("HTTr well", "HTTr wells"),
            HTTrSeriesWell: ("HTTr series well", "HTTr series wells"),
        }

        for model, labels in expected_labels.items():
            with self.subTest(model=model.__name__):
                self.assertEqual(model._meta.verbose_name, labels[0])
                self.assertEqual(model._meta.verbose_name_plural, labels[1])
