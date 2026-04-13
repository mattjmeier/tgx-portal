from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0009_require_control_metadata_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="studyonboardingstate",
            name="template_context",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
