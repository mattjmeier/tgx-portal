from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ChemicalSample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chemical_sample_id", models.CharField(max_length=255, unique=True)),
                ("spid", models.CharField(blank=True, max_length=255, null=True, unique=True)),
                ("roc_id", models.CharField(blank=True, max_length=255)),
                ("dtxsid", models.CharField(blank=True, db_index=True, max_length=255)),
                ("casrn", models.CharField(blank=True, db_index=True, max_length=255)),
                ("preferred_name", models.CharField(blank=True, max_length=255)),
                ("is_environmental", models.BooleanField(default=False)),
                ("is_mixture", models.BooleanField(default=False)),
                ("ext", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["chemical_sample_id", "id"],
                "indexes": [
                    models.Index(fields=["preferred_name"], name="chem_sample_name_idx"),
                    models.Index(fields=["roc_id"], name="chem_sample_roc_idx"),
                ],
            },
        ),
    ]
