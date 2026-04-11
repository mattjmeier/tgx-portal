from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

import yaml
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import RegexValidator
from django.db import transaction
from django.utils.text import slugify
from pydantic import BaseModel, ConfigDict, Field, ValidationError as PydanticValidationError

from .models import (
    Assay,
    MetadataFieldDefinition,
    Project,
    Sample,
    Study,
    StudyConfig,
    StudyMetadataFieldSelection,
    default_study_config,
    sample_id_validator,
)


class ConfigGenerationError(Exception):
    pass


@dataclass
class ConfigBundle:
    filename: str
    content: bytes


class SampleImportValidationError(Exception):
    def __init__(self, errors: list[dict[str, list[str]]]):
        super().__init__("One or more sample rows failed validation.")
        self.errors = errors


class SampleCoreSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    study: int
    sample_ID: str = Field(min_length=1)
    sample_name: str = ""
    description: str = ""
    technical_control: bool = False
    reference_rna: bool = False
    solvent_control: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


_TRUE_STRINGS = {"true", "t", "1", "yes", "y"}
_FALSE_STRINGS = {"false", "f", "0", "no", "n"}
CORE_SAMPLE_FIELDS = {
    "sample_ID",
    "sample_name",
    "description",
    "technical_control",
    "reference_rna",
    "solvent_control",
}


def normalize_spreadsheet_boolean(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "":
            return False
        if normalized in _TRUE_STRINGS:
            return True
        if normalized in _FALSE_STRINGS:
            return False
    return value


def _append_error(row_errors: dict[str, list[str]], field: str, message: str) -> None:
    row_errors.setdefault(field, [])
    if message not in row_errors[field]:
        row_errors[field].append(message)


def _study_from_payload(payload: dict[str, Any]) -> Study | None:
    study = payload.get("study")
    if isinstance(study, Study):
        return study
    if isinstance(study, int):
        return Study.objects.filter(id=study).first()
    return None


def _get_active_field_selections(study: Study) -> list[StudyMetadataFieldSelection]:
    return list(
        study.metadata_field_selections.select_related("field_definition")
        .filter(is_active=True, field_definition__is_active=True, field_definition__scope=MetadataFieldDefinition.Scope.SAMPLE)
        .order_by("sort_order", "id")
    )


def _normalize_metadata_value(definition: MetadataFieldDefinition, value: Any) -> Any:
    if value == "":
        value = None
    if value is None:
        if definition.allow_null or not definition.required:
            return None
        raise ValueError("This field is required.")

    if definition.data_type == MetadataFieldDefinition.DataType.BOOLEAN:
        normalized = normalize_spreadsheet_boolean(value)
        if isinstance(normalized, bool):
            return normalized
        raise ValueError("Must be a boolean value.")

    if definition.data_type == MetadataFieldDefinition.DataType.INTEGER:
        try:
            normalized = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Must be an integer.") from exc
        if definition.min_value is not None and normalized < definition.min_value:
            raise ValueError(f"Must be greater than or equal to {definition.min_value:g}.")
        if definition.max_value is not None and normalized > definition.max_value:
            raise ValueError(f"Must be less than or equal to {definition.max_value:g}.")
        return normalized

    if definition.data_type == MetadataFieldDefinition.DataType.FLOAT:
        try:
            normalized = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Must be a number.") from exc
        if definition.min_value is not None and normalized < definition.min_value:
            raise ValueError(f"Must be greater than or equal to {definition.min_value:g}.")
        if definition.max_value is not None and normalized > definition.max_value:
            raise ValueError(f"Must be less than or equal to {definition.max_value:g}.")
        return normalized

    normalized = str(value).strip()
    if definition.regex:
        RegexValidator(regex=definition.regex, message="Value does not match the required pattern.")(normalized)
    if definition.choices and normalized not in definition.choices:
        raise ValueError(f"Must be one of: {', '.join(str(choice) for choice in definition.choices)}.")
    return normalized


def _normalize_sample_metadata(study: Study, metadata: dict[str, Any]) -> tuple[dict[str, Any], dict[str, list[str]]]:
    normalized: dict[str, Any] = {}
    errors: dict[str, list[str]] = {}
    selections = _get_active_field_selections(study)
    definitions = {
        selection.field_definition.key: selection.field_definition
        for selection in selections
        if selection.field_definition.key not in CORE_SAMPLE_FIELDS
    }
    required_keys = {
        selection.field_definition.key
        for selection in selections
        if selection.field_definition.key not in CORE_SAMPLE_FIELDS
        and (selection.required or selection.field_definition.required)
    }

    for key in required_keys:
        if key not in metadata:
            _append_error(errors, key, "This field is required.")

    unexpected = sorted(set(metadata) - set(definitions))
    for key in unexpected:
        _append_error(errors, key, "Unexpected column not in selected template.")

    for key, value in metadata.items():
        definition = definitions.get(key)
        if definition is None:
            continue
        try:
            normalized[key] = _normalize_metadata_value(definition, value)
        except (ValueError, DjangoValidationError) as exc:
            messages = getattr(exc, "messages", [str(exc)])
            for message in messages:
                _append_error(errors, key, message)

    return normalized, errors


def validate_sample_payload(payload: dict[str, Any]) -> dict[str, Any]:
    study = _study_from_payload(payload)
    normalized = SampleCoreSchema.model_validate(payload).model_dump()
    sample_id_validator(normalized["sample_ID"])

    if study is None:
        raise DjangoValidationError({"study": ["Selected study was not found."]})

    normalized_metadata, metadata_errors = _normalize_sample_metadata(study, normalized.get("metadata") or {})
    if metadata_errors:
        raise DjangoValidationError(metadata_errors)

    normalized["study"] = study
    normalized["metadata"] = normalized_metadata
    return normalized


def _build_sample_row_errors(exc: PydanticValidationError) -> dict[str, list[str]]:
    row_errors: dict[str, list[str]] = {}
    for error in exc.errors():
        location = error.get("loc", [])
        field = str(location[-1]) if location else "non_field_errors"
        _append_error(row_errors, field, error.get("msg", "Invalid value."))
    return row_errors


def validate_sample_import_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any] | None] = [None] * len(rows)
    row_errors: list[dict[str, list[str]]] = [{} for _ in rows]

    for index, row in enumerate(rows):
        try:
            normalized_rows[index] = validate_sample_payload(row)
        except PydanticValidationError as exc:
            row_errors[index] = _build_sample_row_errors(exc)
        except DjangoValidationError as exc:
            for field, messages in getattr(exc, "message_dict", {}).items():
                for message in messages:
                    _append_error(row_errors[index], field, message)
            if not getattr(exc, "message_dict", None):
                for message in getattr(exc, "messages", [str(exc)]):
                    _append_error(row_errors[index], "non_field_errors", message)

    study_ids = sorted({row["study"].id for row in normalized_rows if row is not None})
    seen_keys: set[tuple[int, str]] = set()
    existing_keys = {
        (sample.study_id, sample.sample_ID)
        for sample in Sample.objects.filter(study_id__in=study_ids)
    }

    for index, normalized_row in enumerate(normalized_rows):
        if normalized_row is None:
            continue

        row_key = (normalized_row["study"].id, normalized_row["sample_ID"])
        if row_key in seen_keys:
            _append_error(row_errors[index], "sample_ID", "This sample_ID is duplicated within the upload.")
        else:
            seen_keys.add(row_key)

        if row_key in existing_keys:
            _append_error(row_errors[index], "sample_ID", "This sample_ID already exists within the selected study.")

    if any(row_error for row_error in row_errors):
        raise SampleImportValidationError(row_errors)

    return [row for row in normalized_rows if row is not None]


def create_samples_from_validated_rows(normalized_rows: list[dict[str, Any]]) -> list[Sample]:
    samples = [Sample(**normalized_row) for normalized_row in normalized_rows]
    with transaction.atomic():
        return Sample.objects.bulk_create(samples)


def create_samples_from_rows(rows: list[dict[str, Any]]) -> list[Sample]:
    normalized_rows = validate_sample_import_rows(rows)
    return create_samples_from_validated_rows(normalized_rows)


def _build_metadata_upload_row(row: dict[str, Any], *, study_id: int) -> dict[str, Any]:
    normalized: dict[str, Any] = {"study": study_id, "metadata": {}}
    for raw_key, value in row.items():
        if not isinstance(raw_key, str):
            continue
        key = raw_key.strip()
        if not key:
            continue
        if key in CORE_SAMPLE_FIELDS:
            normalized[key] = value
        else:
            normalized["metadata"][key] = value

    for bool_key in ("technical_control", "reference_rna", "solvent_control"):
        if bool_key in normalized:
            normalized[bool_key] = normalize_spreadsheet_boolean(normalized[bool_key])

    return normalized


def _row_errors_to_validation_issues(row_errors: list[dict[str, list[str]]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for row_index, field_errors in enumerate(row_errors):
        for column_key, messages in field_errors.items():
            for message in messages:
                issues.append(
                    {
                        "row_index": row_index,
                        "column_key": column_key,
                        "message": message,
                        "severity": "error",
                    }
                )
    return issues


def get_study_template_columns(study: Study) -> list[str]:
    selections = _get_active_field_selections(study)
    columns: list[str] = []
    for selection in selections:
        key = selection.field_definition.key
        if key not in columns:
            columns.append(key)
        for included_key in selection.field_definition.auto_include_keys or []:
            if included_key not in columns:
                columns.append(included_key)
    return columns


def validate_metadata_upload(
    *,
    study_id: int,
    rows: list[dict[str, Any]],
    expected_columns: list[str] | None = None,
) -> tuple[bool, list[dict[str, Any]]]:
    study = Study.objects.filter(id=study_id).first()
    if study is None:
        return False, [{"row_index": -1, "column_key": "study", "message": "Study not found.", "severity": "error"}]

    issues: list[dict[str, Any]] = []
    template_columns = expected_columns or get_study_template_columns(study)
    column_keys = {
        key.strip()
        for row in rows
        for key in row.keys()
        if isinstance(key, str) and key.strip()
    }
    expected_set = {key.strip() for key in template_columns if isinstance(key, str) and key.strip()}

    missing = sorted(expected_set - column_keys)
    for key in missing:
        issues.append(
            {
                "row_index": -1,
                "column_key": key,
                "message": f"Missing required column: {key}",
                "severity": "error",
            }
        )

    unexpected = sorted(column_keys - expected_set)
    for key in unexpected:
        issues.append(
            {
                "row_index": -1,
                "column_key": key,
                "message": f"Unexpected column not in selected template: {key}",
                "severity": "warning",
            }
        )

    prepared_rows = [_build_metadata_upload_row(row, study_id=study_id) for row in rows]

    try:
        validate_sample_import_rows(prepared_rows)
    except SampleImportValidationError as exc:
        issues.extend(_row_errors_to_validation_issues(exc.errors))

    is_valid = not any(issue["severity"] == "error" for issue in issues)
    return is_valid, issues


def _resolve_sample_value(sample: Sample, key: str) -> Any:
    if key in CORE_SAMPLE_FIELDS:
        return getattr(sample, key)
    return (sample.metadata or {}).get(key)


def _build_study_config_payload(project: Project, study: Study, assays: list[Assay], mapping: dict[str, str]) -> dict[str, Any]:
    config = getattr(study, "config", None)
    if config is None:
        raise ConfigGenerationError(f"Study {study.id} is missing persisted study config.")
    payload = default_study_config()
    payload["common"].update(config.common or {})
    payload["pipeline"].update(config.pipeline or {})
    payload["qc"].update(config.qc or {})
    payload["deseq2"].update(config.deseq2 or {})

    platforms = sorted({assay.platform for assay in assays})
    if not platforms:
        raise ConfigGenerationError(f"Study {study.id} requires at least one assay before generating configuration files.")
    if len(platforms) > 1:
        raise ConfigGenerationError(f"Study {study.id} mixes assay platforms and cannot generate a single config.")

    payload["common"].update(
        {
            "projectdir": payload["common"].get("projectdir"),
            "project_title": project.title,
            "researcher_name": project.researcher_name,
            "bioinformatician_name": project.bioinformatician_assigned,
            "project_description": project.description or None,
            "platform": assays[0].get_platform_display(),
            "batch_var": mapping.get("batch") or None,
            "celltype": study.celltype or "",
        }
    )
    payload["pipeline"].setdefault("sample_id", "sample_ID")
    payload["qc"]["treatment_var"] = mapping.get("treatment_level_1") or payload["qc"].get("treatment_var") or ""
    payload["deseq2"]["species"] = study.species or payload["deseq2"].get("species")
    payload["deseq2"]["design"] = mapping.get("treatment_level_1") or payload["deseq2"].get("design") or ""
    return payload


def _build_metadata_tsv(study: Study, samples: list[Sample]) -> str:
    columns = get_study_template_columns(study)
    rows = ["\t".join(columns)]
    for sample in samples:
        row = []
        for column in columns:
            value = _resolve_sample_value(sample, column)
            if value is None:
                row.append("")
            elif isinstance(value, bool):
                row.append("true" if value else "false")
            else:
                row.append(str(value))
        rows.append("\t".join(row))
    return "\n".join(rows) + "\n"


def _build_contrasts_tsv(study) -> str:
    mapping = getattr(study, "metadata_mapping", None)
    header = ["reference_group", "comparison_group"]
    rows = ["\t".join(header)]
    if mapping is None:
        return "\n".join(rows) + "\n"
    for item in mapping.selected_contrasts or []:
        rows.append(f"{item['reference_group']}\t{item['comparison_group']}")
    return "\n".join(rows) + "\n"


def build_project_config_bundle(project: Project) -> ConfigBundle:
    studies = list(project.studies.order_by("id"))
    if not studies:
        raise ConfigGenerationError("At least one study is required before generating configuration files.")

    all_assays = list(
        Assay.objects.select_related("sample", "sample__study")
        .filter(sample__study__project=project)
        .order_by("id")
    )
    project_platforms = sorted({assay.platform for assay in all_assays})
    if not all_assays:
        raise ConfigGenerationError("At least one assay is required before generating configuration files.")
    if len(project_platforms) > 1:
        raise ConfigGenerationError("All assays within a project must use the same platform for config generation.")

    file_buffer = BytesIO()
    with ZipFile(file_buffer, "w", compression=ZIP_DEFLATED) as archive:
        for study in studies:
            samples = list(study.samples.order_by("id"))
            if not samples:
                raise ConfigGenerationError(f"Study {study.id} requires at least one sample before generating configuration files.")
            assays = [assay for assay in all_assays if assay.sample.study_id == study.id]
            mapping_model = getattr(study, "metadata_mapping", None)
            if mapping_model is None:
                raise ConfigGenerationError(f"Study {study.id} is missing persisted metadata mappings.")
            payload = _build_study_config_payload(project, study, assays, mapping_model.as_dict())
            config_yaml = yaml.safe_dump(payload, sort_keys=False)
            metadata_tsv = _build_metadata_tsv(study, samples)
            contrasts_tsv = _build_contrasts_tsv(study)

            study_slug = slugify(study.title).replace("-", "_")
            archive.writestr(f"{study_slug}/config.yaml", config_yaml)
            archive.writestr(f"{study_slug}/metadata.tsv", metadata_tsv)
            archive.writestr(f"{study_slug}/contrasts.tsv", contrasts_tsv)

    filename = f"config_bundle_{slugify(project.title).replace('-', '_')}.zip"
    return ConfigBundle(filename=filename, content=file_buffer.getvalue())
