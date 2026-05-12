from __future__ import annotations

import django.contrib.postgres.indexes
import django.core.validators
import django.utils.timezone
from django.db import migrations, models


def normalize_study_nullable_metadata(apps, schema_editor):
    Study = apps.get_model("core", "Study")
    Study.objects.filter(species__isnull=True).update(species="")
    Study.objects.filter(celltype__isnull=True).update(celltype="")
    Study.objects.filter(treatment_var__isnull=True).update(treatment_var="")
    Study.objects.filter(batch_var__isnull=True).update(batch_var="")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_studymetadatamapping_batch_columns"),
    ]

    operations = [
        migrations.RunPython(normalize_study_nullable_metadata, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="study",
            name="unique_study_per_project_metadata",
        ),
        migrations.AlterField(
            model_name="study",
            name="title",
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name="study",
            name="species",
            field=models.CharField(blank=True, choices=[("human", "Human"), ("mouse", "Mouse"), ("rat", "Rat"), ("hamster", "Hamster")], default="", max_length=20),
        ),
        migrations.AlterField(
            model_name="study",
            name="celltype",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="study",
            name="treatment_var",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="study",
            name="batch_var",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="project",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="study",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="sample",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="sequencingrun",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="assay",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="sampleplating",
            name="column",
            field=models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(24)]),
        ),
        migrations.AlterField(
            model_name="sampleplating",
            name="row",
            field=models.CharField(max_length=1),
        ),
        migrations.AddField(
            model_name="sampleplating",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddIndex(
            model_name="project",
            index=models.Index(fields=["owner", "-created_at"], name="project_owner_created_idx"),
        ),
        migrations.AddIndex(
            model_name="study",
            index=models.Index(fields=["project", "title"], name="study_project_title_idx"),
        ),
        migrations.AddIndex(
            model_name="sample",
            index=models.Index(fields=["study", "sample_ID"], name="sample_study_sample_id_idx"),
        ),
        migrations.AddIndex(
            model_name="sample",
            index=django.contrib.postgres.indexes.GinIndex(fields=["metadata"], name="sample_metadata_gin_idx"),
        ),
        migrations.AddIndex(
            model_name="assay",
            index=models.Index(fields=["sample", "platform"], name="assay_sample_platform_idx"),
        ),
        migrations.AddConstraint(
            model_name="study",
            constraint=models.UniqueConstraint(fields=("project", "title"), name="unique_study_title_per_project"),
        ),
        migrations.AddConstraint(
            model_name="study",
            constraint=models.UniqueConstraint(fields=("project", "species", "celltype", "treatment_var", "batch_var"), name="unique_study_per_project_metadata"),
        ),
        migrations.AddConstraint(
            model_name="assay",
            constraint=models.UniqueConstraint(fields=("sample", "platform", "genome_version", "quantification_method"), name="unique_assay_per_sample_config"),
        ),
        migrations.AddConstraint(
            model_name="sampleplating",
            constraint=models.UniqueConstraint(fields=("batch", "plate_number", "plate_well"), name="unique_sample_plating_position"),
        ),
        migrations.AddConstraint(
            model_name="sampleplating",
            constraint=models.CheckConstraint(condition=models.Q(("column__gte", 1), ("column__lte", 24)), name="sample_plating_column_1_24"),
        ),
    ]
