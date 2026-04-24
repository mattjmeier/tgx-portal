from django.contrib import admin

from .models import ChemicalSample


@admin.register(ChemicalSample)
class ChemicalSampleAdmin(admin.ModelAdmin):
    list_display = (
        "chemical_sample_id",
        "spid",
        "preferred_name",
        "roc_id",
        "dtxsid",
        "casrn",
        "is_environmental",
        "is_mixture",
    )
    search_fields = ("chemical_sample_id", "spid", "roc_id", "dtxsid", "casrn", "preferred_name")
    list_filter = ("is_environmental", "is_mixture")
    readonly_fields = ("created_at", "updated_at")
