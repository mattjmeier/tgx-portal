from __future__ import annotations

from django.db import models

from core.models import Study


class StudyType(models.TextChoices):
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
    StudyType = StudyType

    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="warehouse_metadata")
    study_name = models.CharField(max_length=255, unique=True)
    source = models.CharField(max_length=255, blank=True)
    study_type = models.CharField(max_length=20, choices=StudyType.choices)
    in_vitro = models.BooleanField(null=True, blank=True)
    platform = models.ForeignKey(ProfilingPlatform, on_delete=models.PROTECT, related_name="studies")
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


class Series(models.Model):
    study_metadata = models.ForeignKey(StudyWarehouseMetadata, on_delete=models.CASCADE, related_name="series")
    chemical_sample = models.ForeignKey("chemicals.ChemicalSample", on_delete=models.PROTECT, related_name="series")
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

    def __str__(self) -> str:
        condition = f" ({self.treatment_condition})" if self.treatment_condition else ""
        return f"{self.study_metadata.study_name}: {self.chemical_sample.chemical_sample_id}{condition}"


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
        ]

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
                check=models.Q(well_column__gte=1) & models.Q(well_column__lte=24),
                name="httr_well_column_between_1_and_24",
            ),
        ]

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

    def __str__(self) -> str:
        return f"{self.series_id} -> {self.well_id}"
