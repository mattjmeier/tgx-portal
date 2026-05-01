from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0017_planeworkitemsync"),
    ]

    operations = [
        migrations.AddField(
            model_name="studyonboardingstate",
            name="analysis_notes",
            field=models.TextField(blank=True),
        ),
    ]
