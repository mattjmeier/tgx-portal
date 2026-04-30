from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, User
from unfold.admin import ModelAdmin

from .models import (
    Assay,
    ControlledLookupValue,
    MetadataFieldDefinition,
    PlaneWorkItemSync,
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


@admin.register(Project)
class ProjectAdmin(ModelAdmin):
    list_display = ("title", "owner", "pi_name", "researcher_name", "bioinformatician_assigned", "created_at")
    search_fields = ("title", "pi_name", "researcher_name", "bioinformatician_assigned", "owner__username")
    list_filter = ("created_at",)
    autocomplete_fields = ("owner",)
    readonly_fields = ("created_at",)


@admin.register(Study)
class StudyAdmin(ModelAdmin):
    list_display = ("title", "project", "status", "species", "celltype")
    search_fields = ("title", "project__title", "celltype")
    list_filter = ("status", "species")
    autocomplete_fields = ("project",)


@admin.register(Sample)
class SampleAdmin(ModelAdmin):
    list_display = ("sample_ID", "study", "sample_name", "technical_control", "reference_rna", "solvent_control")
    search_fields = ("sample_ID", "sample_name", "study__title")
    list_filter = ("technical_control", "reference_rna", "solvent_control")
    autocomplete_fields = ("study",)


@admin.register(Assay)
class AssayAdmin(ModelAdmin):
    list_display = ("sample", "platform", "genome_version", "quantification_method")
    search_fields = ("sample__sample_ID", "genome_version", "quantification_method")
    list_filter = ("platform", "genome_version", "quantification_method")
    autocomplete_fields = ("sample", "sequencing_runs")


@admin.register(SamplePlating)
class SamplePlatingAdmin(ModelAdmin):
    list_display = ("sample", "plate_number", "batch", "plate_well", "row", "column")
    search_fields = ("sample__sample_ID", "plate_number", "batch", "plate_well")
    list_filter = ("batch", "plate_number", "row")
    autocomplete_fields = ("sample",)


@admin.register(SequencingRun)
class SequencingRunAdmin(ModelAdmin):
    list_display = ("run_id", "flowcell_id", "instrument_name", "date_run")
    search_fields = ("run_id", "flowcell_id", "instrument_name")
    list_filter = ("instrument_name", "date_run")


@admin.register(ControlledLookupValue)
class ControlledLookupValueAdmin(ModelAdmin):
    list_display = ("category", "value", "is_active", "created_at")
    search_fields = ("category", "value")
    list_filter = ("category", "is_active")
    readonly_fields = ("created_at",)


@admin.register(MetadataFieldDefinition)
class MetadataFieldDefinitionAdmin(ModelAdmin):
    list_display = (
        "key",
        "label",
        "group",
        "scope",
        "data_type",
        "kind",
        "required",
        "is_active",
    )
    search_fields = ("key", "label", "group", "description", "system_key")
    list_filter = ("scope", "data_type", "kind", "required", "is_core", "is_active", "wizard_featured")


@admin.register(StudyMetadataFieldSelection)
class StudyMetadataFieldSelectionAdmin(ModelAdmin):
    list_display = ("study", "field_definition", "required", "sort_order", "is_active")
    search_fields = ("study__title", "field_definition__key", "column_label_override")
    list_filter = ("required", "is_active")
    autocomplete_fields = ("study", "field_definition")


@admin.register(StudyMetadataMapping)
class StudyMetadataMappingAdmin(ModelAdmin):
    list_display = ("study", "treatment_level_1", "batch", "report_faceting_group")
    search_fields = ("study__title", "treatment_level_1", "batch", "report_faceting_group")
    autocomplete_fields = ("study",)


@admin.register(StudyConfig)
class StudyConfigAdmin(ModelAdmin):
    list_display = ("study",)
    search_fields = ("study__title",)
    autocomplete_fields = ("study",)


@admin.register(StudyOnboardingState)
class StudyOnboardingStateAdmin(ModelAdmin):
    list_display = ("study", "status", "updated_at", "finalized_at")
    search_fields = ("study__title",)
    list_filter = ("status", "updated_at", "finalized_at")
    autocomplete_fields = ("study",)
    readonly_fields = ("updated_at", "finalized_at")


@admin.register(PlaneWorkItemSync)
class PlaneWorkItemSyncAdmin(ModelAdmin):
    list_display = (
        "study",
        "status",
        "plane_workspace_slug",
        "plane_project_id",
        "plane_work_item_id",
        "attempt_count",
        "updated_at",
    )
    search_fields = (
        "study__title",
        "study__project__title",
        "plane_workspace_slug",
        "plane_project_id",
        "plane_work_item_id",
    )
    list_filter = ("status", "plane_workspace_slug", "created_at", "updated_at")
    autocomplete_fields = ("study",)
    readonly_fields = (
        "created_at",
        "updated_at",
        "attempt_count",
        "request_payload",
        "response_payload",
        "last_error",
        "plane_work_item_url",
    )


admin.site.unregister(User)
admin.site.unregister(Group)


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    pass


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass
