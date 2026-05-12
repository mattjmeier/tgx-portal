from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chemicals", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="chemicalsample",
            name="spid",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddConstraint(
            model_name="chemicalsample",
            constraint=models.UniqueConstraint(
                condition=models.Q(("spid__isnull", False), models.Q(("spid", ""), _negated=True)),
                fields=("spid",),
                name="unique_nonblank_chem_spid",
            ),
        ),
        migrations.AddConstraint(
            model_name="chemicalsample",
            constraint=models.UniqueConstraint(
                condition=models.Q(("roc_id", ""), _negated=True),
                fields=("roc_id",),
                name="unique_nonblank_chem_roc",
            ),
        ),
        migrations.AddConstraint(
            model_name="chemicalsample",
            constraint=models.UniqueConstraint(
                condition=models.Q(("dtxsid", ""), _negated=True),
                fields=("dtxsid",),
                name="unique_nonblank_chem_dtx",
            ),
        ),
    ]
