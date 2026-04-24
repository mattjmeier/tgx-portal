from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_studyonboardingstate_group_builder_and_rows"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="metadatafielddefinition",
            options={"ordering": ["required", "wizard_featured_order", "group", "key", "id"]},
        ),
    ]
