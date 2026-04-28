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


class StudyGroupBuilderSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    primary_column: str = ""
    additional_columns: list[str] = Field(default_factory=list)
    batch_column: str = ""

    def normalized(self) -> dict[str, Any]:
        primary_column = (self.primary_column or "").strip()
        additional_columns = [
            value for value in _normalize_list(self.additional_columns)
            if value != primary_column
        ]
        return {
            "primary_column": primary_column,
            "additional_columns": additional_columns,
            "batch_column": (self.batch_column or "").strip(),
        }

EXPOSURE_LABEL_MODES = {"dose", "concentration", "both", "custom"}

STUDY_DESIGN_FIELD_MAP: dict[str, list[str]] = {
    "chemical": ["chemical"],
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


DEFAULT_GROUP_BUILDER: dict[str, Any] = StudyGroupBuilderSchema().normalized()


class StudyTemplateContextSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    study_design_elements: list[str] = Field(default_factory=list)
    exposure_label_mode: str | None = None
    exposure_custom_label: str = ""
    treatment_vars: list[str] = Field(default_factory=list)
    batch_vars: list[str] = Field(default_factory=list)
    optional_field_keys: list[str] = Field(default_factory=list)
    custom_field_keys: list[str] = Field(default_factory=list)

    def normalized(self) -> dict[str, Any]:
        study_design_elements = _normalize_list(self.study_design_elements)
        exposure_label_mode = (self.exposure_label_mode or "").strip().lower() or None
        exposure_custom_label = (self.exposure_custom_label or "").strip()

        if "dose" in study_design_elements:
            study_design_elements = ["exposure" if value == "dose" else value for value in study_design_elements]
            exposure_label_mode = exposure_label_mode or "dose"

        if "concentration" in study_design_elements:
            study_design_elements = ["exposure" if value == "concentration" else value for value in study_design_elements]
            exposure_label_mode = exposure_label_mode or "concentration"

        study_design_elements = _normalize_list(study_design_elements)

        if "exposure" not in study_design_elements:
            exposure_label_mode = None
            exposure_custom_label = ""
        else:
            if exposure_label_mode not in EXPOSURE_LABEL_MODES:
                exposure_label_mode = "dose"
            if exposure_label_mode != "custom":
                exposure_custom_label = ""

        return {
            "study_design_elements": study_design_elements,
            "exposure_label_mode": exposure_label_mode,
            "exposure_custom_label": exposure_custom_label,
            "treatment_vars": _normalize_list(self.treatment_vars),
            "batch_vars": _normalize_list(self.batch_vars),
            "optional_field_keys": _normalize_list(self.optional_field_keys),
            "custom_field_keys": _normalize_list(self.custom_field_keys),
        }


DEFAULT_TEMPLATE_CONTEXT: dict[str, Any] = StudyTemplateContextSchema().normalized()


def normalize_mappings(payload: Any) -> dict[str, str]:
    schema = StudyOnboardingMappingsSchema.model_validate(payload or {})
    return schema.normalized()


def normalize_template_context(payload: Any) -> dict[str, Any]:
    schema = StudyTemplateContextSchema.model_validate(payload or {})
    return schema.normalized()


def normalize_group_builder(payload: Any) -> dict[str, Any]:
    schema = StudyGroupBuilderSchema.model_validate(payload or {})
    return schema.normalized()


def get_group_builder_columns(group_builder: dict[str, Any]) -> list[str]:
    primary_column = str(group_builder.get("primary_column") or "").strip()
    additional_columns = [
        value.strip()
        for value in group_builder.get("additional_columns", [])
        if isinstance(value, str) and value.strip()
    ]
    return [value for value in [primary_column, *additional_columns] if value]


def _normalize_group_part(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().replace(" ", "_")


def build_group_preview_rows(rows: list[dict[str, Any]], group_builder: dict[str, Any]) -> list[dict[str, Any]]:
    normalized_builder = normalize_group_builder(group_builder)
    primary_column = normalized_builder["primary_column"]
    additional_columns = normalized_builder["additional_columns"]

    preview_rows: list[dict[str, Any]] = []
    for row in rows:
        normalized_row = dict(row)
        if primary_column:
            group_parts = [
                _normalize_group_part(row.get(column))
                for column in [primary_column, *additional_columns]
            ]
            group_parts = [value for value in group_parts if value]
            if group_parts:
                normalized_row["group"] = "_".join(group_parts)
            context_parts = [
                _normalize_group_part(row.get(column))
                for column in additional_columns
            ]
            normalized_row["__group_context"] = "_".join([value for value in context_parts if value])
        preview_rows.append(normalized_row)
    return preview_rows


def get_effective_metadata_columns(
    metadata_columns: list[str] | None,
    *,
    group_builder: dict[str, Any] | None = None,
    validated_rows: list[dict[str, Any]] | None = None,
) -> list[str]:
    normalized = [
        value.strip()
        for value in (metadata_columns or [])
        if isinstance(value, str) and value.strip()
    ]
    if "group" in normalized:
        return normalized

    if group_builder and validated_rows:
        preview_rows = build_group_preview_rows(validated_rows, group_builder)
        if any(str(row.get("group") or "").strip() for row in preview_rows):
            return [*normalized, "group"]
    return normalized


def get_exposure_field_keys(template_context: dict[str, Any]) -> list[str]:
    if "exposure" not in template_context.get("study_design_elements", []):
        return []

    exposure_label_mode = template_context.get("exposure_label_mode")
    exposure_custom_label = str(template_context.get("exposure_custom_label") or "").strip()

    if exposure_label_mode == "concentration":
        return ["concentration"]
    if exposure_label_mode == "both":
        return ["dose", "concentration"]
    if exposure_label_mode == "custom" and exposure_custom_label:
        return [_normalize_list([exposure_custom_label])[0]]

    return ["dose"]


def build_compatibility_summary(values: list[str]) -> str | None:
    normalized = _normalize_list(values)
    if not normalized:
        return None
    return ", ".join(normalized)


def get_design_selected_field_keys(
    template_context: dict[str, Any],
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

    exposure_label_mode = template_context.get("exposure_label_mode")
    for key in get_exposure_field_keys(template_context):
        if (
            available_field_keys is not None
            and key not in available_field_keys
            and exposure_label_mode != "custom"
        ):
            continue
        if key in seen:
            continue
        seen.add(key)
        selected.append(key)
        reasons.append({"key": key, "reason": "exposure level selected"})

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


def validate_template_context_for_finalize(
    template_context: dict[str, Any],
    *,
    metadata_columns: list[str] | None = None,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    study_design_elements = template_context.get("study_design_elements", [])
    exposure_label_mode = template_context.get("exposure_label_mode")
    exposure_custom_label = str(template_context.get("exposure_custom_label") or "").strip()
    treatment_vars = template_context.get("treatment_vars", [])
    batch_vars = template_context.get("batch_vars", [])
    normalized_columns = {
        value.strip()
        for value in (metadata_columns or [])
        if isinstance(value, str) and value.strip()
    }

    if not study_design_elements:
        errors.append(
            {
                "field": "template_context.study_design_elements",
                "message": "Select at least one study design element before finalizing onboarding.",
            }
        )
    if "chemical" in study_design_elements and "exposure" not in study_design_elements:
        errors.append(
            {
                "field": "template_context.study_design_elements",
                "message": "Select exposure level for chemical studies before finalizing onboarding.",
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
    if "exposure" in study_design_elements and exposure_label_mode == "custom" and not exposure_custom_label:
        errors.append(
            {
                "field": "template_context.exposure_custom_label",
                "message": "Provide a custom exposure label before finalizing onboarding.",
            }
        )
    if normalized_columns:
        for value in get_exposure_field_keys(template_context):
            if value not in normalized_columns:
                errors.append(
                    {
                        "field": "template_context.study_design_elements",
                        "message": f"Exposure field '{value}' is not present in the last uploaded metadata.",
                    }
                )
        for value in treatment_vars:
            if value not in normalized_columns:
                errors.append(
                    {
                        "field": "template_context.treatment_vars",
                        "message": f"Primary experimental variable '{value}' is not present in the last uploaded metadata.",
                    }
                )
        for value in batch_vars:
            if value not in normalized_columns:
                errors.append(
                    {
                        "field": "template_context.batch_vars",
                        "message": f"Primary batch variable '{value}' is not present in the last uploaded metadata.",
                    }
                )

    return errors


def validate_group_builder_for_finalize(
    group_builder: dict[str, Any],
    *,
    metadata_columns: list[str] | None = None,
    validated_rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    normalized_builder = normalize_group_builder(group_builder)
    normalized_columns = {
        value.strip()
        for value in (metadata_columns or [])
        if isinstance(value, str) and value.strip()
    }

    if "group" in normalized_columns and not normalized_builder["primary_column"]:
        return errors

    if not normalized_builder["primary_column"]:
        errors.append(
            {
                "field": "group_builder.primary_column",
                "message": "Choose at least one grouping variable to generate analysis groups.",
            }
        )
        return errors

    for column in get_group_builder_columns(normalized_builder):
        if column not in normalized_columns:
            errors.append(
                {
                    "field": "group_builder",
                    "message": f"Grouping column '{column}' is not present in the last uploaded metadata.",
                }
            )

    if errors or not validated_rows:
        return errors

    preview_rows = build_group_preview_rows(validated_rows, normalized_builder)
    if not any(str(row.get("group") or "").strip() for row in preview_rows):
        errors.append(
            {
                "field": "group_builder.primary_column",
                "message": "Choose at least one grouping variable to generate analysis groups.",
            }
        )
    return errors


def suggest_contrasts_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    control_groups_by_context: dict[str, set[str]] = {}
    all_control_groups: set[str] = set()
    experimental_groups: set[tuple[str, str]] = set()

    for row in rows:
        group_value = row.get("group")
        if group_value is None:
            continue
        group = str(group_value).strip()
        if not group:
            continue

        context = str(row.get("__group_context") or "").strip()
        solvent_value = row.get("solvent_control", False)
        is_control = normalize_spreadsheet_boolean(solvent_value) is True
        if is_control:
            control_groups_by_context.setdefault(context, set()).add(group)
            all_control_groups.add(group)
        else:
            experimental_groups.add((group, context))

    suggestions: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for experimental, context in sorted(experimental_groups, key=lambda item: (item[1], item[0])):
        controls = control_groups_by_context.get(context) or all_control_groups
        for control in sorted(controls):
            if control == experimental:
                continue
            key = (control, experimental)
            if key in seen:
                continue
            seen.add(key)
            suggestions.append({"reference_group": control, "comparison_group": experimental})
    return suggestions
