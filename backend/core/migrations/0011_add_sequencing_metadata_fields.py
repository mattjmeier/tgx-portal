from django.db import migrations


def add_sequencing_metadata_fields(apps, schema_editor):  # noqa: ARG001
    MetadataFieldDefinition = apps.get_model("core", "MetadataFieldDefinition")

    def upsert(**kwargs) -> None:
        key = kwargs["key"]
        defaults = {k: v for k, v in kwargs.items() if k != "key"}
        MetadataFieldDefinition.objects.update_or_create(key=key, defaults=defaults)

    upsert(
        key="i5_index",
        label="i5 index",
        group="Sequencing",
        description="i5 sample index.",
        scope="sample",
        system_key="i5_index",
        data_type="string",
        kind="standard",
        required=False,
        is_core=False,
        allow_null=True,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="i7_index",
        label="i7 index",
        group="Sequencing",
        description="i7 sample index.",
        scope="sample",
        system_key="i7_index",
        data_type="string",
        kind="standard",
        required=False,
        is_core=False,
        allow_null=True,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="well_id",
        label="Well ID",
        group="Sequencing",
        description="Plate well identifier.",
        scope="sample",
        system_key="well_id",
        data_type="string",
        kind="standard",
        required=False,
        is_core=False,
        allow_null=True,
        is_active=True,
        auto_include_keys=[],
    )
    upsert(
        key="sequencing_mode",
        label="Sequencing mode",
        group="Sequencing",
        description="Single-end or paired-end sequencing mode.",
        scope="sample",
        system_key="sequencing_mode",
        data_type="string",
        kind="standard",
        required=False,
        is_core=False,
        allow_null=True,
        is_active=True,
        auto_include_keys=[],
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_studyonboardingstate_template_context"),
    ]

    operations = [
        migrations.RunPython(add_sequencing_metadata_fields, migrations.RunPython.noop),
    ]
