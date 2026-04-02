from django.contrib import admin

from .models import Assay, Project, Sample, SamplePlating, SequencingRun, Study

admin.site.register(Project)
admin.site.register(Study)
admin.site.register(Sample)
admin.site.register(Assay)
admin.site.register(SamplePlating)
admin.site.register(SequencingRun)
