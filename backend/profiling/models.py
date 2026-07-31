from __future__ import annotations

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models import Study


def default_resource_key() -> str:
    return f"resource-{uuid.uuid4().hex}"


class StudyType(models.TextChoices):
    UNKNOWN = "unknown", "Unknown"
    HTTR = "HTTr", "High-throughput transcriptomics"
    HTPP = "HTPP", "High-throughput phenotypic profiling"
    TGX = "TGx", "Toxicogenomics"


class ProfilingPlatform(models.Model):
    class TechnologyType(models.TextChoices):
        TEMPO_SEQ = "TempO-Seq", "TempO-Seq"
        RNA_SEQ = "RNA-Seq", "RNA-Seq"
        DRUG_SEQ = "DrugSeq", "DrugSeq"
        CELL_PAINTING = "Cell Painting", "Cell Painting"
        METABOLOMICS = "Metabolomics", "Metabolomics"
        PROTEOMICS = "Proteomics", "Proteomics"
        OTHER = "Other", "Other"

    StudyType = StudyType

    platform_name = models.CharField(max_length=255, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    version = models.CharField(max_length=100, blank=True)
    technology_type = models.CharField(max_length=50, choices=TechnologyType.choices)
    study_type = models.CharField(max_length=20, choices=StudyType.choices)
    species = models.CharField(max_length=20, choices=Study.Species.choices, null=True, blank=True)
    url = models.URLField(blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["platform_name", "id"]

    def __str__(self) -> str:
        return self.platform_name


class StudyWarehouseMetadata(models.Model):
    class CurationStatus(models.TextChoices):
        INVENTORY = "inventory", "Inventory only"
        METADATA_CURATED = "metadata_curated", "Metadata curated"
        LINEAGE_CURATED = "lineage_curated", "Lineage curated"

    class LineageStatus(models.TextChoices):
        UNKNOWN = "unknown", "Unknown"
        PARTIAL = "partial", "Partial"
        COMPLETE = "complete", "Complete"

    StudyType = StudyType

    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="warehouse_metadata")
    study_name = models.CharField(max_length=255, unique=True)
    source = models.CharField(max_length=255, blank=True)
    study_type = models.CharField(max_length=20, choices=StudyType.choices)
    in_vitro = models.BooleanField(null=True, blank=True)
    platform = models.ForeignKey(
        ProfilingPlatform,
        on_delete=models.PROTECT,
        related_name="studies",
        null=True,
        blank=True,
    )
    curation_status = models.CharField(
        max_length=30,
        choices=CurationStatus.choices,
        default=CurationStatus.INVENTORY,
    )
    lineage_status = models.CharField(
        max_length=20,
        choices=LineageStatus.choices,
        default=LineageStatus.UNKNOWN,
    )
    cell_types = models.JSONField(default=list, blank=True)
    culture_conditions = models.JSONField(default=list, blank=True)
    exposure_conditions = models.JSONField(default=list, blank=True)
    references = models.JSONField(default=list, blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["study_name", "id"]
        verbose_name = "study warehouse metadata"
        verbose_name_plural = "study warehouse metadata"

    def __str__(self) -> str:
        return self.study_name

    def clean(self) -> None:
        super().clean()
        if self.platform_id and self.study_id:
            platform_species = self.platform.species
            study_species = self.study.species
            if platform_species and study_species and platform_species != study_species:
                raise ValidationError(
                    {"platform": ["Platform species must match the linked study species when both are set."]}
                )


class StudyDataResource(models.Model):
    class ResourceType(models.TextChoices):
        RAW = "raw", "Raw data"
        INTERMEDIATE = "intermediate", "Intermediate data"
        FEATURE = "feature", "Feature data"
        SIGNATURE = "signature", "Signature data"
        METADATA = "metadata", "Metadata"
        MANIFEST = "manifest", "Manifest"
        PUBLICATION = "publication", "Publication"
        SUPPORTING = "supporting", "Supporting data"
        OTHER = "other", "Other"

    class StorageKind(models.TextChoices):
        LOCAL_PATH = "local_path", "Local path"
        NETWORK_PATH = "network_path", "Network path"
        OBJECT_URI = "object_uri", "Object URI"
        URL = "url", "URL"
        ACCESSION = "accession", "Accession"
        OTHER = "other", "Other"

    class AvailabilityStatus(models.TextChoices):
        AVAILABLE = "available", "Available"
        PENDING = "pending", "Pending"
        ARCHIVED = "archived", "Archived"
        MISSING = "missing", "Missing"
        UNKNOWN = "unknown", "Unknown"

    study_metadata = models.ForeignKey(
        StudyWarehouseMetadata,
        on_delete=models.CASCADE,
        related_name="data_resources",
        null=True,
        blank=True,
    )
    resource_key = models.CharField(max_length=255, default=default_resource_key)
    resource_type = models.CharField(max_length=30, choices=ResourceType.choices)
    storage_kind = models.CharField(max_length=30, choices=StorageKind.choices)
    display_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField(blank=True)
    file_format = models.CharField(max_length=100, blank=True)
    checksum_algorithm = models.CharField(max_length=50, blank=True)
    checksum = models.CharField(max_length=255, blank=True)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    version = models.CharField(max_length=100, blank=True)
    availability_status = models.CharField(
        max_length=30,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.UNKNOWN,
    )
    notes = models.TextField(blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["study_metadata_id", "resource_type", "display_name", "id"]
        indexes = [
            models.Index(fields=["study_metadata", "resource_type"], name="resource_study_type_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["study_metadata", "resource_key"],
                condition=models.Q(study_metadata__isnull=False),
                name="unique_resource_key_per_study",
            ),
            models.UniqueConstraint(
                fields=["resource_key"],
                condition=models.Q(study_metadata__isnull=True),
                name="unique_draft_resource_key",
            ),
            models.UniqueConstraint(
                fields=["study_metadata", "uri"],
                condition=models.Q(study_metadata__isnull=False),
                name="unique_resource_uri_per_study",
            ),
            models.UniqueConstraint(
                fields=["uri"],
                condition=models.Q(study_metadata__isnull=True),
                name="unique_draft_resource_uri",
            ),
            models.CheckConstraint(
                condition=models.Q(size_bytes__isnull=True) | models.Q(size_bytes__gte=0),
                name="study_resource_size_non_negative",
            ),
        ]

    def __str__(self) -> str:
        study_name = self.study_metadata.study_name if self.study_metadata_id else "Draft resource"
        return f"{study_name}: {self.display_name}"


class ImportBatch(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        NO_CHANGES = "no_changes", "No changes"
        FAILED = "failed", "Failed"
        SUPERSEDED = "superseded", "Superseded"

    study_metadata = models.ForeignKey(
        StudyWarehouseMetadata,
        on_delete=models.CASCADE,
        related_name="import_batches",
        null=True,
        blank=True,
    )
    source_system = models.CharField(max_length=255, blank=True)
    source_name = models.CharField(max_length=255)
    source_directory = models.TextField(blank=True)
    source_digest = models.CharField(max_length=64, blank=True, db_index=True)
    manifest_schema_version = models.PositiveSmallIntegerField(null=True, blank=True)
    tool_version = models.CharField(max_length=100, blank=True)
    applied_manifest = models.JSONField(default=dict, blank=True)
    diff_summary = models.JSONField(default=dict, blank=True)
    previous_import = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="replays",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PLANNED)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="profiling_import_batches",
        null=True,
        blank=True,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    records_seen = models.PositiveIntegerField(default=0)
    records_created = models.PositiveIntegerField(default=0)
    records_updated = models.PositiveIntegerField(default=0)
    records_rejected = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "import batch"
        verbose_name_plural = "import batches"
        indexes = [
            models.Index(fields=["study_metadata", "status"], name="import_batch_study_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.source_name} ({self.status})"


class SequencingLibrary(models.Model):
    sample = models.ForeignKey("core.Sample", on_delete=models.CASCADE, related_name="sequencing_libraries")
    assay = models.ForeignKey(
        "core.Assay",
        on_delete=models.SET_NULL,
        related_name="sequencing_libraries",
        null=True,
        blank=True,
    )
    library_key = models.CharField(max_length=255)
    preparation_method = models.CharField(max_length=255, blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sample_id", "library_key", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["sample", "library_key"],
                name="unique_sequencing_library_per_sample",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sample.sample_ID}: {self.library_key}"


class SequencingFile(models.Model):
    class ReadRole(models.TextChoices):
        R1 = "R1", "Read 1"
        R2 = "R2", "Read 2"
        I1 = "I1", "Index 1"
        I2 = "I2", "Index 2"
        UNKNOWN = "unknown", "Unknown"

    class MappingEvidence(models.TextChoices):
        DECLARED = "declared", "Declared"
        INFERRED = "inferred", "Inferred"
        UNKNOWN = "unknown", "Unknown"

    resource = models.OneToOneField(
        StudyDataResource,
        on_delete=models.CASCADE,
        related_name="sequencing_file",
    )
    sample = models.ForeignKey(
        "core.Sample",
        on_delete=models.SET_NULL,
        related_name="sequencing_files",
        null=True,
        blank=True,
    )
    library = models.ForeignKey(
        SequencingLibrary,
        on_delete=models.SET_NULL,
        related_name="files",
        null=True,
        blank=True,
    )
    sequencing_run = models.ForeignKey(
        "core.SequencingRun",
        on_delete=models.SET_NULL,
        related_name="sequencing_files",
        null=True,
        blank=True,
    )
    lane = models.CharField(max_length=50, blank=True)
    read_role = models.CharField(max_length=20, choices=ReadRole.choices, default=ReadRole.UNKNOWN)
    chunk = models.CharField(max_length=50, blank=True)
    mapping_evidence = models.CharField(
        max_length=20,
        choices=MappingEvidence.choices,
        default=MappingEvidence.UNKNOWN,
    )
    notes = models.TextField(blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["resource_id"]
        indexes = [
            models.Index(fields=["sample", "read_role"], name="seq_file_sample_read_idx"),
            models.Index(fields=["sequencing_run", "lane"], name="seq_file_run_lane_idx"),
        ]

    def __str__(self) -> str:
        return self.resource.display_name


class ResourceLineage(models.Model):
    class Evidence(models.TextChoices):
        DECLARED = "declared", "Declared"
        INFERRED = "inferred", "Inferred"
        UNKNOWN = "unknown", "Unknown"

    parent_resource = models.ForeignKey(
        StudyDataResource,
        on_delete=models.CASCADE,
        related_name="lineage_outputs",
    )
    child_resource = models.ForeignKey(
        StudyDataResource,
        on_delete=models.CASCADE,
        related_name="lineage_inputs",
    )
    evidence = models.CharField(max_length=20, choices=Evidence.choices, default=Evidence.UNKNOWN)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["child_resource_id", "parent_resource_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["parent_resource", "child_resource"],
                name="unique_resource_lineage_edge",
            ),
            models.CheckConstraint(
                condition=~models.Q(parent_resource=models.F("child_resource")),
                name="resource_lineage_not_self",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.parent_resource_id} -> {self.child_resource_id}"


class ImportAliasMap(models.Model):
    class FileRole(models.TextChoices):
        METADATA = "metadata", "Metadata"
        CONTRASTS = "contrasts", "Contrasts"
        COUNT = "count", "Count data"

    class Scope(models.TextChoices):
        STUDY = "study", "Study"
        SAMPLE = "sample", "Sample"
        RESOURCE = "resource", "Resource"

    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="alias_maps")
    file_role = models.CharField(max_length=30, choices=FileRole.choices)
    scope = models.CharField(max_length=30, choices=Scope.choices, default=Scope.SAMPLE)
    canonical_target = models.CharField(max_length=255)
    source_column = models.CharField(max_length=255)
    transforms = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["import_batch_id", "file_role", "canonical_target", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["import_batch", "file_role", "source_column"],
                name="unique_alias_source_per_batch_role",
            ),
            models.UniqueConstraint(
                fields=["import_batch", "file_role", "canonical_target"],
                name="unique_alias_target_per_batch",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.import_batch_id}:{self.file_role}:{self.source_column}->{self.canonical_target}"


class ImportStagedRow(models.Model):
    class FileRole(models.TextChoices):
        METADATA = "metadata", "Metadata"
        CONTRASTS = "contrasts", "Contrasts"

    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="staged_rows")
    file_role = models.CharField(max_length=30, choices=FileRole.choices)
    source_row_index = models.PositiveIntegerField()
    source_payload = models.JSONField(default=dict, blank=True)
    normalized_payload = models.JSONField(default=dict, blank=True)
    validation_errors = models.JSONField(default=list, blank=True)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["import_batch_id", "file_role", "source_row_index", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["import_batch", "file_role", "source_row_index"],
                name="unique_staged_row_per_batch_role_index",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.import_batch_id}:{self.file_role}:row-{self.source_row_index}"


class ImportBatchResource(models.Model):
    class ResourceRole(models.TextChoices):
        INPUT = "input", "Input"
        OUTPUT = "output", "Output"
        REFERENCE = "reference", "Reference"
        QA = "qa", "QA"
        OTHER = "other", "Other"

    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="resource_links")
    data_resource = models.ForeignKey(StudyDataResource, on_delete=models.CASCADE, related_name="import_links")
    role = models.CharField(max_length=30, choices=ResourceRole.choices, default=ResourceRole.INPUT)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["import_batch_id", "role", "data_resource_id"]
        verbose_name = "import batch resource"
        verbose_name_plural = "import batch resources"
        constraints = [
            models.UniqueConstraint(fields=["import_batch", "data_resource"], name="unique_resource_per_import_batch"),
        ]

    def __str__(self) -> str:
        return f"{self.import_batch_id}: {self.data_resource_id} ({self.role})"


class Series(models.Model):
    study_metadata = models.ForeignKey(StudyWarehouseMetadata, on_delete=models.CASCADE, related_name="series")
    chemical_sample = models.ForeignKey("chemicals.ChemicalSample", on_delete=models.PROTECT, related_name="series")
    series_name = models.CharField(max_length=255)
    treatment_condition = models.CharField(max_length=255, blank=True)
    exposure_lower = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    exposure_upper = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    exposure_unit = models.CharField(max_length=50, blank=True)
    exposure_group_count = models.PositiveSmallIntegerField(null=True, blank=True)
    exposure_values = models.JSONField(default=list, blank=True)
    control_type = models.CharField(max_length=255, blank=True)
    factors = models.JSONField(default=list, blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["study_metadata_id", "chemical_sample_id", "id"]
        verbose_name = "series"
        verbose_name_plural = "series"
        indexes = [
            models.Index(fields=["study_metadata", "chemical_sample"], name="series_study_chem_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["study_metadata", "series_name"], name="unique_series_name_per_study"),
            models.CheckConstraint(
                condition=(
                    models.Q(exposure_lower__isnull=True)
                    | models.Q(exposure_upper__isnull=True)
                    | models.Q(exposure_lower__lte=models.F("exposure_upper"))
                ),
                name="series_exposure_bounds_order",
            ),
            models.CheckConstraint(
                condition=models.Q(exposure_group_count__isnull=True) | models.Q(exposure_group_count__gte=1),
                name="series_exposure_group_count",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(exposure_lower__isnull=True, exposure_upper__isnull=True)
                    | ~models.Q(exposure_unit="")
                ),
                name="series_exposure_unit_required",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if (
            self.exposure_lower is not None
            and self.exposure_upper is not None
            and self.exposure_lower > self.exposure_upper
        ):
            raise ValidationError({"exposure_upper": ["exposure_upper must be greater than or equal to exposure_lower."]})
        if self.exposure_group_count is not None and self.exposure_group_count < 1:
            raise ValidationError({"exposure_group_count": ["exposure_group_count must be at least 1 when set."]})
        if (self.exposure_lower is not None or self.exposure_upper is not None) and not self.exposure_unit:
            raise ValidationError({"exposure_unit": ["exposure_unit is required when exposure bounds are set."]})

    def __str__(self) -> str:
        return f"{self.study_metadata.study_name}: {self.series_name}"


class Metric(models.Model):
    metric_name = models.CharField(max_length=255, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    references = models.JSONField(default=list, blank=True)
    software_name = models.CharField(max_length=255, blank=True)
    software_version = models.CharField(max_length=100, blank=True)
    software_url = models.URLField(blank=True)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["metric_name", "id"]

    def __str__(self) -> str:
        return self.metric_name


class Pod(models.Model):
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name="pods")
    metric = models.ForeignKey(Metric, on_delete=models.PROTECT, related_name="pods")
    pod = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    active = models.BooleanField(default=False)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["series_id", "metric_id"]
        verbose_name = "POD"
        verbose_name_plural = "PODs"
        constraints = [
            models.UniqueConstraint(fields=["series", "metric"], name="unique_pod_per_series_metric"),
            models.CheckConstraint(
                condition=models.Q(pod__isnull=True) | models.Q(pod__gte=0),
                name="pod_value_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(active=False) | models.Q(pod__isnull=False),
                name="active_pod_requires_value",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if self.pod is not None and self.pod < 0:
            raise ValidationError({"pod": ["pod must be non-negative when set."]})
        if self.active and self.pod is None:
            raise ValidationError({"pod": ["pod is required when active is true."]})

    def __str__(self) -> str:
        return f"{self.series_id}: {self.metric.metric_name}"


class HTTrWell(models.Model):
    class WellRow(models.TextChoices):
        A = "A", "A"
        B = "B", "B"
        C = "C", "C"
        D = "D", "D"
        E = "E", "E"
        F = "F", "F"
        G = "G", "G"
        H = "H", "H"
        I = "I", "I"
        J = "J", "J"
        K = "K", "K"
        L = "L", "L"
        M = "M", "M"
        N = "N", "N"
        O = "O", "O"
        P = "P", "P"

    class QcFlag(models.TextChoices):
        OK = "ok", "OK"
        WARN = "warn", "Warning"
        FAIL = "fail", "Fail"
        EXCLUDE = "exclude", "Exclude"

    study_metadata = models.ForeignKey(StudyWarehouseMetadata, on_delete=models.CASCADE, related_name="httr_wells")
    biosample_name = models.CharField(max_length=255)
    plate_id = models.CharField(max_length=255)
    well_row = models.CharField(max_length=1, choices=WellRow.choices)
    well_column = models.PositiveSmallIntegerField()
    plate_group_id = models.CharField(max_length=255, blank=True)
    block_id = models.CharField(max_length=255, blank=True)
    cell_type = models.CharField(max_length=255)
    treatment_name = models.CharField(max_length=255)
    treatment_condition = models.CharField(max_length=255, blank=True)
    culture_batch = models.CharField(max_length=255, blank=True)
    chemical_sample = models.ForeignKey(
        "chemicals.ChemicalSample",
        on_delete=models.PROTECT,
        related_name="httr_wells",
        null=True,
        blank=True,
    )
    exposure_time_h = models.PositiveSmallIntegerField(null=True, blank=True)
    exposure_concentration = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    exposure_vehicle = models.CharField(max_length=255, blank=True)
    qc_flag = models.CharField(max_length=20, choices=QcFlag.choices, default=QcFlag.OK)
    is_reference = models.BooleanField(default=False)
    is_control = models.BooleanField(default=False)
    is_treated = models.BooleanField(default=True)
    is_blank = models.BooleanField(default=False)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["study_metadata_id", "plate_id", "well_row", "well_column"]
        verbose_name = "HTTr well"
        verbose_name_plural = "HTTr wells"
        constraints = [
            models.UniqueConstraint(
                fields=["study_metadata", "plate_id", "well_row", "well_column"],
                name="unique_httr_well_position_per_study",
            ),
            models.CheckConstraint(
                condition=models.Q(well_column__gte=1) & models.Q(well_column__lte=24),
                name="httr_well_column_between_1_and_24",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(is_blank=False)
                    | (
                        models.Q(is_reference=False)
                        & models.Q(is_control=False)
                        & models.Q(is_treated=False)
                    )
                ),
                name="httr_blank_well_state",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if self.is_blank and (self.is_reference or self.is_control or self.is_treated):
            raise ValidationError({"is_blank": ["Blank wells cannot also be reference, control, or treated wells."]})
        if self.is_blank and (self.chemical_sample_id or self.exposure_concentration is not None):
            raise ValidationError({"is_blank": ["Blank wells cannot have chemical sample or exposure concentration."]})

    def __str__(self) -> str:
        return f"{self.plate_id}:{self.well_row}{self.well_column:02d}"


class HTTrSeriesWell(models.Model):
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name="httr_wells")
    well = models.ForeignKey(HTTrWell, on_delete=models.CASCADE, related_name="series_links")
    is_control = models.BooleanField(default=False)
    dose_level = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["series_id", "dose_level", "well_id"]
        verbose_name = "HTTr series well"
        verbose_name_plural = "HTTr series wells"
        constraints = [
            models.UniqueConstraint(fields=["series", "well"], name="unique_httr_series_well"),
        ]

    def clean(self) -> None:
        super().clean()
        if self.series_id and self.well_id and self.series.study_metadata_id != self.well.study_metadata_id:
            raise ValidationError({"well": ["Series and well must belong to the same warehouse study."]})
        if self.is_control and self.dose_level != 0:
            raise ValidationError({"dose_level": ["Control wells must use dose_level 0."]})
        if not self.is_control and self.dose_level == 0:
            raise ValidationError({"dose_level": ["Non-control wells must use a positive dose_level."]})

    def __str__(self) -> str:
        return f"{self.series_id} -> {self.well_id}"
