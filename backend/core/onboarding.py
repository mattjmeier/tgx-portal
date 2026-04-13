from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .services import normalize_spreadsheet_boolean


class ContrastPairSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reference_group: str = Field(min_length=1)
    comparison_group: str = Field(min_length=1)


class StudyOnboardingMappingsSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    treatment_level_1: str = ""
    treatment_level_2: str = ""
    treatment_level_3: str = ""
    treatment_level_4: str = ""
    treatment_level_5: str = ""
    batch: str = ""
    pca_color: str = ""
    pca_shape: str = ""
    pca_alpha: str = ""
    clustering_group: str = ""
    report_faceting_group: str = ""

    def normalized(self) -> dict[str, str]:
        dumped = self.model_dump()
        return {key: value.strip() for key, value in dumped.items() if isinstance(value, str)}


DEFAULT_MAPPINGS: dict[str, str] = StudyOnboardingMappingsSchema().model_dump()

STUDY_DESIGN_FIELD_MAP: dict[str, list[str]] = {
    "chemical": ["chemical"],
    "dose": ["dose"],
    "timepoint": ["timepoint"],
    "treatment": [],
    "batch": [],
}


def _normalize_list(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        candidate = value.strip().replace(" ", "_")
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized


class StudyTemplateContextSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    study_design_elements: list[str] = Field(default_factory=list)
    treatment_vars: list[str] = Field(default_factory=list)
    batch_vars: list[str] = Field(default_factory=list)
    optional_field_keys: list[str] = Field(default_factory=list)
    custom_field_keys: list[str] = Field(default_factory=list)

    def normalized(self) -> dict[str, list[str]]:
        return {
            "study_design_elements": _normalize_list(self.study_design_elements),
            "treatment_vars": _normalize_list(self.treatment_vars),
            "batch_vars": _normalize_list(self.batch_vars),
            "optional_field_keys": _normalize_list(self.optional_field_keys),
            "custom_field_keys": _normalize_list(self.custom_field_keys),
        }


DEFAULT_TEMPLATE_CONTEXT: dict[str, list[str]] = StudyTemplateContextSchema().model_dump()


def normalize_mappings(payload: Any) -> dict[str, str]:
    schema = StudyOnboardingMappingsSchema.model_validate(payload or {})
    return schema.normalized()


def normalize_template_context(payload: Any) -> dict[str, list[str]]:
    schema = StudyTemplateContextSchema.model_validate(payload or {})
    return schema.normalized()


def build_compatibility_summary(values: list[str]) -> str | None:
    normalized = _normalize_list(values)
    if not normalized:
        return None
    return ", ".join(normalized)


def get_design_selected_field_keys(
    template_context: dict[str, list[str]],
    *,
    available_field_keys: set[str] | None = None,
) -> tuple[list[str], list[dict[str, str]]]:
    selected: list[str] = []
    reasons: list[dict[str, str]] = []
    seen: set[str] = set()

    for element in template_context.get("study_design_elements", []):
        for key in STUDY_DESIGN_FIELD_MAP.get(element, []):
            if available_field_keys is not None and key not in available_field_keys:
                continue
            if key in seen:
                continue
            seen.add(key)
            selected.append(key)
            reasons.append({"key": key, "reason": f"{element} study design selected"})

    return selected, reasons


def normalize_contrast_pairs(payload: Any) -> list[dict[str, str]]:
    if payload in (None, ""):
        return []
    pairs = [ContrastPairSchema.model_validate(item).model_dump() for item in payload]
    # De-dupe while preserving order.
    seen: set[tuple[str, str]] = set()
    normalized: list[dict[str, str]] = []
    for pair in pairs:
        key = (pair["reference_group"], pair["comparison_group"])
        if key in seen:
            continue
        seen.add(key)
        normalized.append(pair)
    return normalized


def validate_final_ready(*, metadata_columns: list[str], mappings: dict[str, str]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []

    normalized_columns = [value.strip() for value in metadata_columns if isinstance(value, str) and value.strip()]
    column_set = set(normalized_columns)
    if not normalized_columns:
        errors.append({"field": "metadata_columns", "message": "Upload and validate metadata before finalizing mappings."})

    treatment_level_1 = (mappings.get("treatment_level_1") or "").strip()
    if not treatment_level_1:
        errors.append({"field": "mappings.treatment_level_1", "message": "Treatment level 1 is required."})

    selected_columns = [
        (mappings.get(key) or "").strip()
        for key in (
            "treatment_level_1",
            "treatment_level_2",
            "treatment_level_3",
            "treatment_level_4",
            "treatment_level_5",
            "batch",
            "pca_color",
            "pca_shape",
            "pca_alpha",
            "clustering_group",
            "report_faceting_group",
        )
        if (mappings.get(key) or "").strip()
    ]

    duplicates: set[str] = {col for col in selected_columns if selected_columns.count(col) > 1}
    for value in sorted(duplicates):
        errors.append({"field": "mappings", "message": f"Mapping column '{value}' is selected more than once."})

    for value in sorted(set(selected_columns) - column_set):
        errors.append({"field": "mappings", "message": f"Mapping column '{value}' is not present in the last uploaded metadata."})

    return errors


def validate_template_context_for_finalize(template_context: dict[str, list[str]]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    study_design_elements = template_context.get("study_design_elements", [])
    treatment_vars = template_context.get("treatment_vars", [])
    batch_vars = template_context.get("batch_vars", [])

    if not study_design_elements:
        errors.append(
            {
                "field": "template_context.study_design_elements",
                "message": "Select at least one study design element before finalizing onboarding.",
            }
        )
    if "treatment" in study_design_elements and not treatment_vars:
        errors.append(
            {
                "field": "template_context.treatment_vars",
                "message": "Add at least one treatment variable before finalizing onboarding.",
            }
        )
    if "batch" in study_design_elements and not batch_vars:
        errors.append(
            {
                "field": "template_context.batch_vars",
                "message": "Add at least one batch variable before finalizing onboarding.",
            }
        )

    return errors


def suggest_contrasts_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    control_groups: set[str] = set()
    experimental_groups: set[str] = set()

    for row in rows:
        group_value = row.get("group")
        if group_value is None:
            continue
        group = str(group_value).strip()
        if not group:
            continue

        solvent_value = row.get("solvent_control", False)
        is_control = normalize_spreadsheet_boolean(solvent_value) is True
        if is_control:
            control_groups.add(group)
        else:
            experimental_groups.add(group)

    suggestions: list[dict[str, str]] = []
    for control in sorted(control_groups):
        for experimental in sorted(experimental_groups):
            if control == experimental:
                continue
            suggestions.append({"reference_group": control, "comparison_group": experimental})
    return suggestions
