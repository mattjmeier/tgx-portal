from django.db import migrations


def add_concentration_metadata_field(apps, schema_editor):  # noqa: ARG001
    MetadataFieldDefinition = apps.get_model("core", "MetadataFieldDefinition")

    MetadataFieldDefinition.objects.update_or_create(
        key="concentration",
        defaults={
            "label": "Concentration",
            "group": "Toxicology",
            "description": "Select for in vitro experiments.",
            "scope": "sample",
            "system_key": "concentration",
            "data_type": "float",
            "kind": "standard",
            "required": False,
            "is_core": False,
            "allow_null": True,
            "is_active": True,
            "auto_include_keys": [],
        },
    )

    MetadataFieldDefinition.objects.filter(key="dose").update(
        description="Select for in vivo experiments.",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_add_sequencing_metadata_fields"),
    ]

    operations = [
        migrations.RunPython(add_concentration_metadata_field, migrations.RunPython.noop),
    ]
