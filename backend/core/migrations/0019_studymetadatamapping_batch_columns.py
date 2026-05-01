from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0018_studyonboardingstate_analysis_notes"),
    ]

    operations = [
        migrations.AddField(
            model_name="studymetadatamapping",
            name="batch_columns",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
