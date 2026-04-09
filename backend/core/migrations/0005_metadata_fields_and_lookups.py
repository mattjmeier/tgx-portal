from django.db import migrations, models


def seed_metadata_field_definitions(apps, schema_editor) -> None:
    MetadataFieldDefinition = apps.get_model("core", "MetadataFieldDefinition")

    def upsert(**kwargs) -> None:
        key = kwargs["key"]
        defaults = {k: v for k, v in kwargs.items() if k != "key"}
        MetadataFieldDefinition.objects.update_or_create(key=key, defaults=defaults)

    upsert(
        key="sample_ID",
        label="Sample ID",
        group="Core",
        description="Unique sample identifier (no spaces).",
        data_type="string",
        kind="standard",
        required=True,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="sample_name",
        label="Sample name",
        group="Core",
        description="Human-readable sample name.",
        data_type="string",
        kind="standard",
        required=True,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="group",
        label="Group",
        group="Core",
        description="Experimental group label.",
        data_type="string",
        kind="standard",
        required=True,
        is_active=True,
        auto_include_keys=[],
    )

    upsert(
        key="chemical",
        label="Chemical",
        group="Toxicology",
        description="Chemical short name. Selecting this field auto-adds CASN.",
        data_type="string",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=["CASN"],
    )
    upsert(
        key="CASN",
        label="CAS Number",
        group="Toxicology",
        description="CAS registry number for the selected chemical.",
        data_type="string",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="dose",
        label="Dose",
        group="Toxicology",
        description="Dose amount (numeric).",
        data_type="float",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="technical_control",
        label="Technical control",
        group="Controls",
        description="True if this sample is a technical control.",
        data_type="boolean",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="solvent_control",
        label="Solvent control",
        group="Controls",
        description="True if this sample is a solvent control.",
        data_type="boolean",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="reference_rna",
        label="Reference RNA",
        group="Controls",
        description="True if this sample is reference RNA.",
        data_type="boolean",
        kind="standard",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )

    upsert(
        key="timepoint",
        label="Timepoint",
        group="Study design",
        description="Custom typed metadata column (admin-managed definition).",
        data_type="string",
        kind="custom",
        required=False,
        is_active=True,
        auto_include_keys=[],
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_study_title"),
    ]

    operations = [
        migrations.CreateModel(
            name="ControlledLookupValue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("genome_version", "Genome version"),
                            ("biospyder_kit", "Biospyder kit"),
                            ("instrument_model", "Instrument model"),
                            ("sequenced_by", "Sequenced by"),
                            ("platform", "Platform"),
                            ("quantification_method", "Quantification method"),
                        ],
                        max_length=64,
                    ),
                ),
                ("value", models.CharField(max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["category", "value", "id"],
            },
        ),
        migrations.CreateModel(
            name="MetadataFieldDefinition",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=100, unique=True)),
                ("label", models.CharField(max_length=255)),
                ("group", models.CharField(default="General", max_length=100)),
                ("description", models.TextField(blank=True)),
                (
                    "data_type",
                    models.CharField(
                        choices=[
                            ("string", "String"),
                            ("integer", "Integer"),
                            ("float", "Float"),
                            ("boolean", "Boolean"),
                        ],
                        default="string",
                        max_length=20,
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("standard", "Standard"),
                            ("custom", "Custom (typed)"),
                        ],
                        default="standard",
                        max_length=20,
                    ),
                ),
                ("required", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("auto_include_keys", models.JSONField(blank=True, default=list)),
            ],
            options={
                "ordering": ["required", "group", "key", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="controlledlookupvalue",
            constraint=models.UniqueConstraint(
                fields=("category", "value"),
                name="unique_controlled_lookup_value_per_category",
            ),
        ),
        migrations.RunPython(seed_metadata_field_definitions, migrations.RunPython.noop),
    ]

