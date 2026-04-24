from __future__ import annotations

from django.db import models


class ChemicalSample(models.Model):
    chemical_sample_id = models.CharField(max_length=255, unique=True)
    spid = models.CharField(max_length=255, unique=True, null=True, blank=True)
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

    def __str__(self) -> str:
        return self.chemical_sample_id
