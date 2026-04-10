from django.db import migrations, models


def normalize_existing_studies(apps, schema_editor):  # noqa: ARG001
    Study = apps.get_model("core", "Study")

    seen_titles: dict[str, int] = {}
    for study in Study.objects.order_by("id"):
        title = (study.title or "").strip() or f"Study {study.pk}"
        occurrence = seen_titles.get(title, 0)
        seen_titles[title] = occurrence + 1

        if occurrence:
            suffix = study.project_id or study.pk
            title = f"{title} ({suffix}-{occurrence + 1})"[:255]

        study.title = title
        study.status = "active"
        study.save(update_fields=["title", "status"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_study_onboarding_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="study",
            name="description",
            field=models.TextField(blank=True, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="study",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("active", "Active")],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.RunPython(normalize_existing_studies, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="study",
            name="batch_var",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name="study",
            name="celltype",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name="study",
            name="species",
            field=models.CharField(
                blank=True,
                choices=[("human", "Human"), ("mouse", "Mouse"), ("rat", "Rat"), ("hamster", "Hamster")],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="study",
            name="title",
            field=models.CharField(max_length=255, unique=True),
        ),
        migrations.AlterField(
            model_name="study",
            name="treatment_var",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
