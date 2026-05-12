from __future__ import annotations

from django.db import migrations, models


def backfill_series_names(apps, schema_editor):
    Series = apps.get_model("profiling", "Series")
    for series in Series.objects.filter(models.Q(series_name__isnull=True) | models.Q(series_name="")):
        series.series_name = f"series_{series.pk}"
        series.save(update_fields=["series_name"])


class Migration(migrations.Migration):
    dependencies = [
        ("profiling", "0004_studyimport_staging_models"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="studydataresource",
            name="unique_resource_uri_per_study",
        ),
        migrations.AddField(
            model_name="series",
            name="series_name",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.RunPython(backfill_series_names, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="series",
            name="series_name",
            field=models.CharField(max_length=255),
        ),
        migrations.AddConstraint(
            model_name="studydataresource",
            constraint=models.UniqueConstraint(
                condition=models.Q(("study_metadata__isnull", False)),
                fields=("study_metadata", "uri"),
                name="unique_resource_uri_per_study",
            ),
        ),
        migrations.AddConstraint(
            model_name="studydataresource",
            constraint=models.UniqueConstraint(
                condition=models.Q(("study_metadata__isnull", True)),
                fields=("uri",),
                name="unique_draft_resource_uri",
            ),
        ),
        migrations.AddConstraint(
            model_name="importaliasmap",
            constraint=models.UniqueConstraint(
                fields=("import_batch", "file_role", "canonical_target"),
                name="unique_alias_target_per_batch",
            ),
        ),
        migrations.AddConstraint(
            model_name="series",
            constraint=models.UniqueConstraint(
                fields=("study_metadata", "series_name"),
                name="unique_series_name_per_study",
            ),
        ),
        migrations.AddConstraint(
            model_name="series",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("exposure_lower__isnull", True))
                    | models.Q(("exposure_upper__isnull", True))
                    | models.Q(("exposure_lower__lte", models.F("exposure_upper")))
                ),
                name="series_exposure_bounds_order",
            ),
        ),
        migrations.AddConstraint(
            model_name="series",
            constraint=models.CheckConstraint(
                condition=models.Q(("exposure_group_count__isnull", True)) | models.Q(("exposure_group_count__gte", 1)),
                name="series_exposure_group_count",
            ),
        ),
        migrations.AddConstraint(
            model_name="series",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("exposure_lower__isnull", True), ("exposure_upper__isnull", True))
                    | models.Q(("exposure_unit", ""), _negated=True)
                ),
                name="series_exposure_unit_required",
            ),
        ),
        migrations.AddConstraint(
            model_name="pod",
            constraint=models.CheckConstraint(
                condition=models.Q(("pod__isnull", True)) | models.Q(("pod__gte", 0)),
                name="pod_value_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="pod",
            constraint=models.CheckConstraint(
                condition=models.Q(("active", False)) | models.Q(("pod__isnull", False)),
                name="active_pod_requires_value",
            ),
        ),
        migrations.AddConstraint(
            model_name="httrwell",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("is_blank", False))
                    | (
                        models.Q(("is_reference", False))
                        & models.Q(("is_control", False))
                        & models.Q(("is_treated", False))
                    )
                ),
                name="httr_blank_well_state",
            ),
        ),
    ]
