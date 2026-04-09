from django.db import migrations, models


def populate_study_titles(apps, schema_editor) -> None:
    Study = apps.get_model("core", "Study")

    for study in Study.objects.filter(title=""):
        candidate = f"{study.species} {study.celltype}".strip()
        study.title = candidate if candidate else f"Study {study.id}"
        study.save(update_fields=["title"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_project_owner_userprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="study",
            name="title",
            field=models.CharField(default="", max_length=255),
            preserve_default=False,
        ),
        migrations.RunPython(populate_study_titles, migrations.RunPython.noop),
    ]

