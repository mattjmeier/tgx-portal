from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="study",
            constraint=models.UniqueConstraint(
                fields=("project", "species", "celltype", "treatment_var", "batch_var"),
                name="unique_study_per_project_metadata",
            ),
        ),
        migrations.AddConstraint(
            model_name="sample",
            constraint=models.UniqueConstraint(
                fields=("study", "sample_ID"),
                name="unique_sample_id_per_study",
            ),
        ),
    ]
