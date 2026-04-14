from django.db import migrations, models


FEATURED_FIELD_ORDER = {
    "timepoint": 0,
    "chip_batch": 10,
    "animal_cohort": 20,
    "donor_batch": 30,
    "exposure_chamber": 40,
    "harvest_day": 50,
    "insert_batch": 60,
    "operator": 70,
    "prep_batch": 80,
    "run_day": 90,
}

EXCLUDED_TRANSIENT_KEYS = {"d", "do", "dos"}


def seed_wizard_featured_fields(apps, schema_editor) -> None:
    MetadataFieldDefinition = apps.get_model("core", "MetadataFieldDefinition")

    MetadataFieldDefinition.objects.filter(key__in=EXCLUDED_TRANSIENT_KEYS).update(
        wizard_featured=False,
        wizard_featured_order=0,
    )

    for key, order in FEATURED_FIELD_ORDER.items():
        MetadataFieldDefinition.objects.filter(key=key).update(
            wizard_featured=True,
            wizard_featured_order=order,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0012_add_concentration_metadata_field"),
    ]

    operations = [
        migrations.AddField(
            model_name="metadatafielddefinition",
            name="wizard_featured",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="metadatafielddefinition",
            name="wizard_featured_order",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(seed_wizard_featured_fields, migrations.RunPython.noop),
    ]
