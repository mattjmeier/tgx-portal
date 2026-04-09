from django.contrib import admin

from .models import (
    Assay,
    ControlledLookupValue,
    MetadataFieldDefinition,
    Project,
    Sample,
    SamplePlating,
    SequencingRun,
    Study,
    StudyOnboardingState,
)

admin.site.register(Project)
admin.site.register(Study)
admin.site.register(Sample)
admin.site.register(Assay)
admin.site.register(SamplePlating)
admin.site.register(SequencingRun)
admin.site.register(ControlledLookupValue)
admin.site.register(MetadataFieldDefinition)
admin.site.register(StudyOnboardingState)
