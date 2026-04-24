import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("chemicals", "0001_initial"),
        ("core", "0014_studyonboardingstate_group_builder_and_rows"),
    ]

    operations = [
        migrations.CreateModel(
            name="Metric",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("metric_name", models.CharField(max_length=255, unique=True)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("references", models.JSONField(blank=True, default=list)),
                ("software_name", models.CharField(blank=True, max_length=255)),
                ("software_version", models.CharField(blank=True, max_length=100)),
                ("software_url", models.URLField(blank=True)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["metric_name", "id"]},
        ),
        migrations.CreateModel(
            name="ProfilingPlatform",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("platform_name", models.CharField(max_length=255, unique=True)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("version", models.CharField(blank=True, max_length=100)),
                (
                    "technology_type",
                    models.CharField(
                        choices=[
                            ("TempO-Seq", "TempO-Seq"),
                            ("RNA-Seq", "RNA-Seq"),
                            ("DrugSeq", "DrugSeq"),
                            ("Cell Painting", "Cell Painting"),
                            ("Metabolomics", "Metabolomics"),
                            ("Proteomics", "Proteomics"),
                            ("Other", "Other"),
                        ],
                        max_length=50,
                    ),
                ),
                (
                    "study_type",
                    models.CharField(
                        choices=[
                            ("HTTr", "High-throughput transcriptomics"),
                            ("HTPP", "High-throughput phenotypic profiling"),
                            ("TGx", "Toxicogenomics"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "species",
                    models.CharField(
                        blank=True,
                        choices=[("human", "Human"), ("mouse", "Mouse"), ("rat", "Rat"), ("hamster", "Hamster")],
                        max_length=20,
                        null=True,
                    ),
                ),
                ("url", models.URLField(blank=True)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["platform_name", "id"]},
        ),
        migrations.CreateModel(
            name="StudyWarehouseMetadata",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("study_name", models.CharField(max_length=255, unique=True)),
                ("source", models.CharField(blank=True, max_length=255)),
                (
                    "study_type",
                    models.CharField(
                        choices=[
                            ("HTTr", "High-throughput transcriptomics"),
                            ("HTPP", "High-throughput phenotypic profiling"),
                            ("TGx", "Toxicogenomics"),
                        ],
                        max_length=20,
                    ),
                ),
                ("in_vitro", models.BooleanField(blank=True, null=True)),
                ("cell_types", models.JSONField(blank=True, default=list)),
                ("culture_conditions", models.JSONField(blank=True, default=list)),
                ("exposure_conditions", models.JSONField(blank=True, default=list)),
                ("references", models.JSONField(blank=True, default=list)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "platform",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="studies",
                        to="profiling.profilingplatform",
                    ),
                ),
                (
                    "study",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="warehouse_metadata",
                        to="core.study",
                    ),
                ),
            ],
            options={"ordering": ["study_name", "id"]},
        ),
        migrations.CreateModel(
            name="Series",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("treatment_condition", models.CharField(blank=True, max_length=255)),
                ("exposure_lower", models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ("exposure_upper", models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ("exposure_unit", models.CharField(blank=True, max_length=50)),
                ("exposure_group_count", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("exposure_values", models.JSONField(blank=True, default=list)),
                ("control_type", models.CharField(blank=True, max_length=255)),
                ("factors", models.JSONField(blank=True, default=list)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "chemical_sample",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="series",
                        to="chemicals.chemicalsample",
                    ),
                ),
                (
                    "study_metadata",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="series",
                        to="profiling.studywarehousemetadata",
                    ),
                ),
            ],
            options={
                "ordering": ["study_metadata_id", "chemical_sample_id", "id"],
                "indexes": [models.Index(fields=["study_metadata", "chemical_sample"], name="series_study_chem_idx")],
            },
        ),
        migrations.CreateModel(
            name="Pod",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pod", models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ("active", models.BooleanField(default=False)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "metric",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="pods",
                        to="profiling.metric",
                    ),
                ),
                (
                    "series",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pods",
                        to="profiling.series",
                    ),
                ),
            ],
            options={
                "ordering": ["series_id", "metric_id"],
                "constraints": [
                    models.UniqueConstraint(fields=("series", "metric"), name="unique_pod_per_series_metric"),
                ],
            },
        ),
        migrations.CreateModel(
            name="HTTrWell",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("biosample_name", models.CharField(max_length=255)),
                ("plate_id", models.CharField(max_length=255)),
                (
                    "well_row",
                    models.CharField(
                        choices=[
                            ("A", "A"),
                            ("B", "B"),
                            ("C", "C"),
                            ("D", "D"),
                            ("E", "E"),
                            ("F", "F"),
                            ("G", "G"),
                            ("H", "H"),
                            ("I", "I"),
                            ("J", "J"),
                            ("K", "K"),
                            ("L", "L"),
                            ("M", "M"),
                            ("N", "N"),
                            ("O", "O"),
                            ("P", "P"),
                        ],
                        max_length=1,
                    ),
                ),
                ("well_column", models.PositiveSmallIntegerField()),
                ("plate_group_id", models.CharField(blank=True, max_length=255)),
                ("block_id", models.CharField(blank=True, max_length=255)),
                ("cell_type", models.CharField(max_length=255)),
                ("treatment_name", models.CharField(max_length=255)),
                ("treatment_condition", models.CharField(blank=True, max_length=255)),
                ("culture_batch", models.CharField(blank=True, max_length=255)),
                ("exposure_time_h", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("exposure_concentration", models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ("exposure_vehicle", models.CharField(blank=True, max_length=255)),
                (
                    "qc_flag",
                    models.CharField(
                        choices=[("ok", "OK"), ("warn", "Warning"), ("fail", "Fail"), ("exclude", "Exclude")],
                        default="ok",
                        max_length=20,
                    ),
                ),
                ("is_reference", models.BooleanField(default=False)),
                ("is_control", models.BooleanField(default=False)),
                ("is_treated", models.BooleanField(default=True)),
                ("is_blank", models.BooleanField(default=False)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "chemical_sample",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="httr_wells",
                        to="chemicals.chemicalsample",
                    ),
                ),
                (
                    "study_metadata",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="httr_wells",
                        to="profiling.studywarehousemetadata",
                    ),
                ),
            ],
            options={
                "ordering": ["study_metadata_id", "plate_id", "well_row", "well_column"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("study_metadata", "plate_id", "well_row", "well_column"),
                        name="unique_httr_well_position_per_study",
                    ),
                    models.CheckConstraint(
                        check=models.Q(("well_column__gte", 1), ("well_column__lte", 24)),
                        name="httr_well_column_between_1_and_24",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="HTTrSeriesWell",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_control", models.BooleanField(default=False)),
                ("dose_level", models.PositiveSmallIntegerField(default=0)),
                (
                    "series",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="httr_wells",
                        to="profiling.series",
                    ),
                ),
                (
                    "well",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="series_links",
                        to="profiling.httrwell",
                    ),
                ),
            ],
            options={
                "ordering": ["series_id", "dose_level", "well_id"],
                "constraints": [models.UniqueConstraint(fields=("series", "well"), name="unique_httr_series_well")],
            },
        ),
    ]
