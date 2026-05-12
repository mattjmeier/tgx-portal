from __future__ import annotations

import re

from django.core.exceptions import ValidationError
from django.db import models


class ChemicalSample(models.Model):
    chemical_sample_id = models.CharField(max_length=255, unique=True)
    spid = models.CharField(max_length=255, null=True, blank=True)
    roc_id = models.CharField(max_length=255, blank=True)
    dtxsid = models.CharField(max_length=255, blank=True, db_index=True)
    casrn = models.CharField(max_length=255, blank=True, db_index=True)
    preferred_name = models.CharField(max_length=255, blank=True)
    is_environmental = models.BooleanField(default=False)
    is_mixture = models.BooleanField(default=False)
    ext = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["chemical_sample_id", "id"]
        indexes = [
            models.Index(fields=["preferred_name"], name="chem_sample_name_idx"),
            models.Index(fields=["roc_id"], name="chem_sample_roc_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["spid"],
                condition=models.Q(spid__isnull=False) & ~models.Q(spid=""),
                name="unique_nonblank_chem_spid",
            ),
            models.UniqueConstraint(
                fields=["roc_id"],
                condition=~models.Q(roc_id=""),
                name="unique_nonblank_chem_roc",
            ),
            models.UniqueConstraint(
                fields=["dtxsid"],
                condition=~models.Q(dtxsid=""),
                name="unique_nonblank_chem_dtx",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if self.dtxsid and not re.fullmatch(r"DTXSID\d+", self.dtxsid):
            raise ValidationError({"dtxsid": ["dtxsid must use the canonical DTXSID numeric format."]})
        if self.casrn and not re.fullmatch(r"\d{2,7}-\d{2}-\d", self.casrn):
            raise ValidationError({"casrn": ["casrn must use CAS Registry Number format, e.g. 50-00-0."]})

    def __str__(self) -> str:
        return self.chemical_sample_id
