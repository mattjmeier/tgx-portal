from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from pydantic import BaseModel, ConfigDict, ValidationError as PydanticValidationError


sample_id_validator = RegexValidator(
    regex=r"^[a-zA-Z0-9-_]*$",
    message="sample_ID may only contain letters, numbers, hyphens, and underscores.",
)


class Project(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="owned_projects",
        null=True,
        blank=True,
    )
    pi_name = models.CharField(max_length=255)
    researcher_name = models.CharField(max_length=255)
    bioinformatician_assigned = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return self.title


class Study(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"

    class Species(models.TextChoices):
        HUMAN = "human", "Human"
        MOUSE = "mouse", "Mouse"
        RAT = "rat", "Rat"
        HAMSTER = "hamster", "Hamster"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="studies")
    title = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    species = models.CharField(max_length=20, choices=Species.choices, null=True, blank=True)
    celltype = models.CharField(max_length=255, null=True, blank=True)
    treatment_var = models.CharField(max_length=255, null=True, blank=True)
    batch_var = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "species", "celltype", "treatment_var", "batch_var"],
                name="unique_study_per_project_metadata",
            )
        ]

    def __str__(self) -> str:
        return self.title


class StudyConfigSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    common: dict[str, Any]
    pipeline: dict[str, Any]
    qc: dict[str, Any]
    deseq2: dict[str, Any]


def default_study_config() -> dict[str, dict[str, Any]]:
    return {
        "common": {
            "projectdir": None,
            "metadata_file": "metadata.tsv",
            "contrasts_file": "contrasts.tsv",
            "project_description": None,
            "batch_var": None,
            "dose": None,
            "platform": "RNA-Seq",
            "instrument_model": "",
            "sequenced_by": "",
            "biospyder_kit": None,
            "nmr_threshold": 1000000,
            "write_additional_output": True,
            "celltype": "",
            "units": "",
            "biospyder_dbs": None,
            "biospyder_manifest_file": None,
            "solvent_control": "solvent_control",
        },
        "pipeline": {
            "genomedir": "/refs/genomes",
            "genome_filename": "",
            "annotation_filename": "",
            "genome_name": "",
            "sample_id": "sample_ID",
            "mode": "se",
            "threads": 8,
        },
        "qc": {
            "clust_method": "spearman",
            "studywide_tree_height_cutoff": 0.1,
            "group_tree_height_cutoff": None,
            "dendro_color_by": "",
            "align_threshold": 0.95,
            "gini_cutoff": 0.99,
            "exp_groups": {},
            "treatment_var": "",
            "collapse_replicates": False,
            "technical_control": "technical_control",
            "reference_rna": "reference_rna",
            "solvent_control": "solvent_control",
        },
        "deseq2": {
            "analysis_name": None,
            "species": None,
            "design": "",
            "intgroup_to_plot": [],
            "formula_override": None,
            "deseq_facet": None,
            "deseq_filter": None,
            "reports_facet": None,
            "reports_filter": None,
            "sortcol": None,
            "lenient_contrasts": False,
            "strict_contrasts": False,
            "exclude_samples": None,
            "exclude_groups": None,
            "include_only_column": None,
            "include_only_group": None,
            "cpus": 4,
            "run_pathway_analysis": True,
            "wikipathways_directory": None,
            "wikipathways_filename": None,
            "linear_fc_filter_DEGs": 1.5,
            "linear_fc_filter_biosets": 1.2,
            "nBestFeatures": 20,
            "nBest": 100,
            "nHeatmap": 50,
            "nHeatmapDEGs": 50,
            "cooks": False,
            "filter_gene_counts": False,
            "generate_main_report": True,
            "generate_stats_report": True,
            "generate_data_explorer_report": True,
            "generate_go_pathway_report": True,
            "generate_summary_report": True,
            "generate_runningfisher_report": False,
            "output_digits": 5,
            "parallel": False,
        },
    }


class StudyOnboardingState(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINAL = "final", "Final"

    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="onboarding_state")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    metadata_columns = models.JSONField(default=list, blank=True)
    validated_rows = models.JSONField(default=list, blank=True)
    mappings = models.JSONField(default=dict, blank=True)
    group_builder = models.JSONField(default=dict, blank=True)
    template_context = models.JSONField(default=dict, blank=True)
    suggested_contrasts = models.JSONField(default=list, blank=True)
    selected_contrasts = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["study_id"]

    def __str__(self) -> str:
        return f"Onboarding {self.study_id} ({self.status})"


class StudyMetadataMapping(models.Model):
    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="metadata_mapping")
    treatment_level_1 = models.CharField(max_length=100, blank=True)
    treatment_level_2 = models.CharField(max_length=100, blank=True)
    treatment_level_3 = models.CharField(max_length=100, blank=True)
    treatment_level_4 = models.CharField(max_length=100, blank=True)
    treatment_level_5 = models.CharField(max_length=100, blank=True)
    batch = models.CharField(max_length=100, blank=True)
    pca_color = models.CharField(max_length=100, blank=True)
    pca_shape = models.CharField(max_length=100, blank=True)
    pca_alpha = models.CharField(max_length=100, blank=True)
    clustering_group = models.CharField(max_length=100, blank=True)
    report_faceting_group = models.CharField(max_length=100, blank=True)
    selected_contrasts = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["study_id"]

    def as_dict(self) -> dict[str, Any]:
        return {
            "treatment_level_1": self.treatment_level_1,
            "treatment_level_2": self.treatment_level_2,
            "treatment_level_3": self.treatment_level_3,
            "treatment_level_4": self.treatment_level_4,
            "treatment_level_5": self.treatment_level_5,
            "batch": self.batch,
            "pca_color": self.pca_color,
            "pca_shape": self.pca_shape,
            "pca_alpha": self.pca_alpha,
            "clustering_group": self.clustering_group,
            "report_faceting_group": self.report_faceting_group,
        }

    def __str__(self) -> str:
        return f"Mappings for study {self.study_id}"


class StudyConfig(models.Model):
    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="config")
    common = models.JSONField(default=dict, blank=True)
    pipeline = models.JSONField(default=dict, blank=True)
    qc = models.JSONField(default=dict, blank=True)
    deseq2 = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["study_id"]

    def clean(self) -> None:
        try:
            StudyConfigSchema.model_validate(
                {
                    "common": self.common,
                    "pipeline": self.pipeline,
                    "qc": self.qc,
                    "deseq2": self.deseq2,
                }
            )
        except PydanticValidationError as exc:
            raise ValidationError({"config": exc.errors()}) from exc

        if self.pipeline.get("mode") not in {"se", "pe"}:
            raise ValidationError({"pipeline": ["mode must be 'se' or 'pe'."]})
        threads = self.pipeline.get("threads")
        if not isinstance(threads, int) or threads < 1:
            raise ValidationError({"pipeline": ["threads must be an integer greater than or equal to 1."]})
        cpus = self.deseq2.get("cpus")
        if not isinstance(cpus, int) or cpus < 1:
            raise ValidationError({"deseq2": ["cpus must be an integer greater than or equal to 1."]})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Config for study {self.study_id}"


class Sample(models.Model):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="samples")
    sample_ID = models.CharField(max_length=100, validators=[sample_id_validator])
    sample_name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    technical_control = models.BooleanField(default=False)
    reference_rna = models.BooleanField(default=False)
    solvent_control = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["study", "sample_ID"],
                name="unique_sample_id_per_study",
            )
        ]

    def __str__(self) -> str:
        return self.sample_ID


class SequencingRun(models.Model):
    run_id = models.CharField(max_length=255, unique=True)
    flowcell_id = models.CharField(max_length=255)
    instrument_name = models.CharField(max_length=255)
    date_run = models.DateField()
    raw_data_path = models.CharField(max_length=1024)

    class Meta:
        ordering = ["-date_run", "run_id"]

    def __str__(self) -> str:
        return self.run_id


class Assay(models.Model):
    class Platform(models.TextChoices):
        TEMPO_SEQ = "tempo_seq", "TempO-Seq"
        RNA_SEQ = "rna_seq", "RNA-Seq"

    sample = models.ForeignKey(Sample, on_delete=models.CASCADE, related_name="assays")
    platform = models.CharField(max_length=20, choices=Platform.choices)
    genome_version = models.CharField(max_length=255)
    quantification_method = models.CharField(max_length=255)
    sequencing_runs = models.ManyToManyField(SequencingRun, blank=True, related_name="assays")

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.sample.sample_ID} - {self.get_platform_display()}"


class SamplePlating(models.Model):
    sample = models.OneToOneField(Sample, on_delete=models.CASCADE, related_name="plating")
    plate_number = models.CharField(max_length=100)
    batch = models.CharField(max_length=100)
    plate_well = models.CharField(max_length=20)
    row = models.CharField(max_length=5)
    column = models.PositiveIntegerField()
    index_I7 = models.CharField(max_length=100, blank=True)
    I7_Index_ID = models.CharField(max_length=100, blank=True)
    index2 = models.CharField(max_length=100, blank=True)
    I5_Index_ID = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["sample_id"]

    def __str__(self) -> str:
        return f"{self.sample.sample_ID} @ {self.plate_well}"


class ControlledLookupValue(models.Model):
    class Category(models.TextChoices):
        GENOME_VERSION = "genome_version", "Genome version"
        BIOSPYDER_KIT = "biospyder_kit", "Biospyder kit"
        INSTRUMENT_MODEL = "instrument_model", "Instrument model"
        SEQUENCED_BY = "sequenced_by", "Sequenced by"
        PLATFORM = "platform", "Platform"
        QUANTIFICATION_METHOD = "quantification_method", "Quantification method"

    category = models.CharField(max_length=64, choices=Category.choices)
    value = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category", "value", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "value"],
                name="unique_controlled_lookup_value_per_category",
            )
        ]

    def __str__(self) -> str:
        return f"{self.category}: {self.value}"


class MetadataFieldDefinition(models.Model):
    class DataType(models.TextChoices):
        STRING = "string", "String"
        INTEGER = "integer", "Integer"
        FLOAT = "float", "Float"
        BOOLEAN = "boolean", "Boolean"

    class Kind(models.TextChoices):
        STANDARD = "standard", "Standard"
        CUSTOM = "custom", "Custom (typed)"

    class Scope(models.TextChoices):
        SAMPLE = "sample", "Sample"
        CONFIG = "config", "Config"

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    group = models.CharField(max_length=100, default="General")
    description = models.TextField(blank=True)
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.SAMPLE)
    system_key = models.CharField(max_length=100, blank=True)
    data_type = models.CharField(max_length=20, choices=DataType.choices, default=DataType.STRING)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.STANDARD)
    required = models.BooleanField(default=False)
    is_core = models.BooleanField(default=False)
    allow_null = models.BooleanField(default=True)
    choices = models.JSONField(default=list, blank=True)
    regex = models.CharField(max_length=255, blank=True)
    min_value = models.FloatField(null=True, blank=True)
    max_value = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    auto_include_keys = models.JSONField(default=list, blank=True)
    wizard_featured = models.BooleanField(default=False)
    wizard_featured_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["required", "wizard_featured_order", "group", "key", "id"]

    def __str__(self) -> str:
        return self.key


class StudyMetadataFieldSelection(models.Model):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="metadata_field_selections")
    field_definition = models.ForeignKey(
        MetadataFieldDefinition,
        on_delete=models.CASCADE,
        related_name="study_selections",
    )
    required = models.BooleanField(default=False)
    column_label_override = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["study_id", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["study", "field_definition"],
                name="unique_field_selection_per_study",
            )
        ]

    def __str__(self) -> str:
        return f"{self.study_id}: {self.field_definition.key}"


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        CLIENT = "client", "Client"
        SYSTEM = "system", "System"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)

    def __str__(self) -> str:
        return f"{self.user.username} ({self.role})"
