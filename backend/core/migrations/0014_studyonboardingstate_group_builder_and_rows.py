from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_metadata_field_wizard_curation"),
    ]

    operations = [
        migrations.AddField(
            model_name="studyonboardingstate",
            name="group_builder",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="studyonboardingstate",
            name="validated_rows",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
