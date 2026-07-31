from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import (
    HTTrSeriesWell,
    HTTrWell,
    ImportAliasMap,
    ImportBatch,
    ImportBatchResource,
    ImportStagedRow,
    Metric,
    Pod,
    ProfilingPlatform,
    ResourceLineage,
    SequencingFile,
    SequencingLibrary,
    Series,
    StudyDataResource,
    StudyWarehouseMetadata,
)


class SeriesInline(admin.TabularInline):
    model = Series
    extra = 0
    fields = ("chemical_sample", "treatment_condition", "exposure_lower", "exposure_upper", "exposure_unit")
    autocomplete_fields = ("chemical_sample",)
    show_change_link = True


class StudyDataResourceInline(admin.TabularInline):
    model = StudyDataResource
    extra = 0
    fields = ("resource_key", "display_name", "resource_type", "availability_status", "file_format", "uri")
    show_change_link = True


class ImportBatchInline(admin.TabularInline):
    model = ImportBatch
    extra = 0
    fields = ("source_name", "source_system", "status", "records_seen", "records_created", "records_updated", "records_rejected")
    show_change_link = True


class PodInline(admin.TabularInline):
    model = Pod
    extra = 0
    fields = ("metric", "pod", "active")
    autocomplete_fields = ("metric",)
    show_change_link = True


class HTTrSeriesWellInline(admin.TabularInline):
    model = HTTrSeriesWell
    extra = 0
    fields = ("well", "is_control", "dose_level")
    autocomplete_fields = ("well",)
    show_change_link = True


class ImportBatchResourceInline(admin.TabularInline):
    model = ImportBatchResource
    extra = 0
    fields = ("data_resource", "role", "notes")
    autocomplete_fields = ("data_resource",)
    show_change_link = True


@admin.register(ProfilingPlatform)
class ProfilingPlatformAdmin(ModelAdmin):
    list_display = ("platform_name", "technology_type", "study_type", "species", "version")
    search_fields = ("platform_name", "title", "technology_type", "species")
    list_filter = ("technology_type", "study_type", "species")
    readonly_fields = ("created_at", "updated_at")


@admin.register(StudyWarehouseMetadata)
class StudyWarehouseMetadataAdmin(ModelAdmin):
    list_display = (
        "study_name",
        "study",
        "source",
        "study_type",
        "curation_status",
        "lineage_status",
        "platform",
    )
    search_fields = ("study_name", "study__title", "source")
    list_filter = ("study_type", "curation_status", "lineage_status", "in_vitro", "platform")
    autocomplete_fields = ("platform",)
    raw_id_fields = ("study",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (StudyDataResourceInline, ImportBatchInline, SeriesInline)


@admin.register(StudyDataResource)
class StudyDataResourceAdmin(ModelAdmin):
    list_display = (
        "resource_key",
        "display_name",
        "study_metadata",
        "resource_type",
        "storage_kind",
        "availability_status",
        "file_format",
        "version",
    )
    search_fields = ("resource_key", "display_name", "uri", "description", "study_metadata__study_name")
    list_filter = ("resource_type", "storage_kind", "availability_status", "file_format")
    autocomplete_fields = ("study_metadata",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(ImportBatch)
class ImportBatchAdmin(ModelAdmin):
    list_display = (
        "source_name",
        "study_metadata",
        "source_system",
        "status",
        "source_digest",
        "records_seen",
        "records_created",
        "records_updated",
        "records_rejected",
        "created_at",
    )
    search_fields = ("source_name", "source_system", "source_digest", "source_directory", "notes", "study_metadata__study_name", "resource_links__data_resource__uri")
    list_filter = ("status", "source_system", "created_at")
    autocomplete_fields = ("study_metadata", "initiated_by")
    readonly_fields = (
        "source_digest",
        "manifest_schema_version",
        "tool_version",
        "applied_manifest",
        "diff_summary",
        "started_at",
        "finished_at",
        "created_at",
        "updated_at",
    )
    inlines = (ImportBatchResourceInline,)


@admin.register(ImportBatchResource)
class ImportBatchResourceAdmin(ModelAdmin):
    list_display = ("import_batch", "data_resource", "role")
    search_fields = ("import_batch__source_name", "data_resource__display_name", "data_resource__uri")
    list_filter = ("role",)
    autocomplete_fields = ("import_batch", "data_resource")


@admin.register(ImportAliasMap)
class ImportAliasMapAdmin(ModelAdmin):
    list_display = ("import_batch", "file_role", "scope", "source_column", "canonical_target")
    search_fields = ("import_batch__source_name", "source_column", "canonical_target")
    list_filter = ("file_role", "scope")
    autocomplete_fields = ("import_batch",)


@admin.register(ImportStagedRow)
class ImportStagedRowAdmin(ModelAdmin):
    list_display = ("import_batch", "file_role", "source_row_index", "is_valid")
    search_fields = ("import_batch__source_name",)
    list_filter = ("file_role", "is_valid")
    autocomplete_fields = ("import_batch",)


@admin.register(SequencingLibrary)
class SequencingLibraryAdmin(ModelAdmin):
    list_display = ("library_key", "sample", "assay", "preparation_method", "updated_at")
    search_fields = ("library_key", "sample__sample_ID", "sample__study__title")
    autocomplete_fields = ("sample", "assay")
    readonly_fields = ("created_at", "updated_at")


@admin.register(SequencingFile)
class SequencingFileAdmin(ModelAdmin):
    list_display = (
        "resource",
        "sample",
        "library",
        "sequencing_run",
        "lane",
        "read_role",
        "mapping_evidence",
    )
    search_fields = (
        "resource__resource_key",
        "resource__uri",
        "sample__sample_ID",
        "library__library_key",
        "sequencing_run__run_id",
    )
    list_filter = ("read_role", "mapping_evidence")
    autocomplete_fields = ("resource", "sample", "library", "sequencing_run")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ResourceLineage)
class ResourceLineageAdmin(ModelAdmin):
    list_display = ("parent_resource", "child_resource", "evidence", "created_at")
    search_fields = (
        "parent_resource__resource_key",
        "child_resource__resource_key",
        "parent_resource__study_metadata__study_name",
    )
    list_filter = ("evidence",)
    autocomplete_fields = ("parent_resource", "child_resource")
    readonly_fields = ("created_at",)


@admin.register(Series)
class SeriesAdmin(ModelAdmin):
    list_display = (
        "id",
        "study_metadata",
        "chemical_sample",
        "treatment_condition",
        "exposure_lower",
        "exposure_upper",
        "exposure_unit",
    )
    search_fields = ("study_metadata__study_name", "chemical_sample__chemical_sample_id", "treatment_condition")
    list_filter = ("exposure_unit", "study_metadata__study_type")
    autocomplete_fields = ("study_metadata", "chemical_sample")
    readonly_fields = ("created_at", "updated_at")
    inlines = (PodInline, HTTrSeriesWellInline)


@admin.register(Metric)
class MetricAdmin(ModelAdmin):
    list_display = ("metric_name", "title", "software_name", "software_version")
    search_fields = ("metric_name", "title", "software_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Pod)
class PodAdmin(ModelAdmin):
    list_display = ("series", "metric", "pod", "active")
    search_fields = ("series__study_metadata__study_name", "metric__metric_name")
    list_filter = ("active", "metric")
    autocomplete_fields = ("series", "metric")
    readonly_fields = ("created_at", "updated_at")


@admin.register(HTTrWell)
class HTTrWellAdmin(ModelAdmin):
    list_display = (
        "study_metadata",
        "plate_id",
        "well_row",
        "well_column",
        "biosample_name",
        "treatment_name",
        "chemical_sample",
    )
    search_fields = (
        "study_metadata__study_name",
        "plate_id",
        "biosample_name",
        "treatment_name",
        "chemical_sample__chemical_sample_id",
    )
    list_filter = ("well_row", "qc_flag", "is_control", "is_reference", "is_blank")
    autocomplete_fields = ("study_metadata", "chemical_sample")
    readonly_fields = ("created_at", "updated_at")


@admin.register(HTTrSeriesWell)
class HTTrSeriesWellAdmin(ModelAdmin):
    list_display = ("series", "well", "is_control", "dose_level")
    search_fields = ("series__study_metadata__study_name", "well__plate_id", "well__biosample_name")
    list_filter = ("is_control",)
    autocomplete_fields = ("series", "well")
