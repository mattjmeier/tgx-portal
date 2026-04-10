from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


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


class StudyOnboardingState(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINAL = "final", "Final"

    study = models.OneToOneField(Study, on_delete=models.CASCADE, related_name="onboarding_state")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    metadata_columns = models.JSONField(default=list, blank=True)
    mappings = models.JSONField(default=dict, blank=True)
    suggested_contrasts = models.JSONField(default=list, blank=True)
    selected_contrasts = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["study_id"]

    def __str__(self) -> str:
        return f"Onboarding {self.study_id} ({self.status})"


class Sample(models.Model):
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name="samples")
    sample_ID = models.CharField(max_length=100, validators=[sample_id_validator])
    sample_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    group = models.CharField(max_length=255)
    chemical = models.CharField(max_length=255, blank=True)
    chemical_longname = models.CharField(max_length=255, blank=True)
    dose = models.FloatField(validators=[MinValueValidator(0)])
    technical_control = models.BooleanField(default=False)
    reference_rna = models.BooleanField(default=False)
    solvent_control = models.BooleanField(default=False)

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

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    group = models.CharField(max_length=100, default="General")
    description = models.TextField(blank=True)
    data_type = models.CharField(max_length=20, choices=DataType.choices, default=DataType.STRING)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.STANDARD)
    required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    auto_include_keys = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["required", "group", "key", "id"]

    def __str__(self) -> str:
        return self.key


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        CLIENT = "client", "Client"
        SYSTEM = "system", "System"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)

    def __str__(self) -> str:
        return f"{self.user.username} ({self.role})"
