from django.db import migrations


def require_control_metadata_fields(apps, schema_editor):  # noqa: ARG001
    MetadataFieldDefinition = apps.get_model("core", "MetadataFieldDefinition")
    MetadataFieldDefinition.objects.filter(
        key__in=["technical_control", "reference_rna", "solvent_control"]
    ).update(required=True, allow_null=False, is_core=True, scope="sample")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_remove_sample_chemical_and_more"),
    ]

    operations = [
        migrations.RunPython(require_control_metadata_fields, migrations.RunPython.noop),
    ]
