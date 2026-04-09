from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_metadata_fields_and_lookups"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudyOnboardingState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("final", "Final")],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("metadata_columns", models.JSONField(blank=True, default=list)),
                ("mappings", models.JSONField(blank=True, default=dict)),
                ("suggested_contrasts", models.JSONField(blank=True, default=list)),
                ("selected_contrasts", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("finalized_at", models.DateTimeField(blank=True, null=True)),
                (
                    "study",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="onboarding_state",
                        to="core.study",
                    ),
                ),
            ],
            options={
                "ordering": ["study_id"],
            },
        ),
    ]

