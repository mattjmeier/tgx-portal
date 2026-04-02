from django.core.validators import MinValueValidator, RegexValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Project",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pi_name", models.CharField(max_length=255)),
                ("researcher_name", models.CharField(max_length=255)),
                ("bioinformatician_assigned", models.CharField(max_length=255)),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="SequencingRun",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("run_id", models.CharField(max_length=255, unique=True)),
                ("flowcell_id", models.CharField(max_length=255)),
                ("instrument_name", models.CharField(max_length=255)),
                ("date_run", models.DateField()),
                ("raw_data_path", models.CharField(max_length=1024)),
            ],
            options={"ordering": ["-date_run", "run_id"]},
        ),
        migrations.CreateModel(
            name="Study",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("species", models.CharField(choices=[("human", "Human"), ("mouse", "Mouse"), ("rat", "Rat"), ("hamster", "Hamster")], max_length=20)),
                ("celltype", models.CharField(max_length=255)),
                ("treatment_var", models.CharField(max_length=255)),
                ("batch_var", models.CharField(max_length=255)),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="studies", to="core.project")),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="Sample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sample_ID", models.CharField(max_length=100, validators=[RegexValidator(message="sample_ID may only contain letters, numbers, hyphens, and underscores.", regex="^[a-zA-Z0-9-_]*$")])),
                ("sample_name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("group", models.CharField(max_length=255)),
                ("chemical", models.CharField(blank=True, max_length=255)),
                ("chemical_longname", models.CharField(blank=True, max_length=255)),
                ("dose", models.FloatField(validators=[MinValueValidator(0)])),
                ("technical_control", models.BooleanField(default=False)),
                ("reference_rna", models.BooleanField(default=False)),
                ("solvent_control", models.BooleanField(default=False)),
                ("study", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="samples", to="core.study")),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="SamplePlating",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("plate_number", models.CharField(max_length=100)),
                ("batch", models.CharField(max_length=100)),
                ("plate_well", models.CharField(max_length=20)),
                ("row", models.CharField(max_length=5)),
                ("column", models.PositiveIntegerField()),
                ("index_I7", models.CharField(blank=True, max_length=100)),
                ("I7_Index_ID", models.CharField(blank=True, max_length=100)),
                ("index2", models.CharField(blank=True, max_length=100)),
                ("I5_Index_ID", models.CharField(blank=True, max_length=100)),
                ("sample", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="plating", to="core.sample")),
            ],
            options={"ordering": ["sample_id"]},
        ),
        migrations.CreateModel(
            name="Assay",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("platform", models.CharField(choices=[("tempo_seq", "TempO-Seq"), ("rna_seq", "RNA-Seq")], max_length=20)),
                ("genome_version", models.CharField(max_length=255)),
                ("quantification_method", models.CharField(max_length=255)),
                ("sample", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assays", to="core.sample")),
                ("sequencing_runs", models.ManyToManyField(blank=True, related_name="assays", to="core.sequencingrun")),
            ],
            options={"ordering": ["id"]},
        ),
    ]
