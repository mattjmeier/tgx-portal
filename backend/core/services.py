from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

import yaml
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.text import slugify
from pydantic import BaseModel, ConfigDict, Field, ValidationError as PydanticValidationError

from .models import Assay, Project, Sample, Study, sample_id_validator


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


class SampleInputSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    study: int
    sample_ID: str = Field(min_length=1)
    sample_name: str = Field(min_length=1)
    description: str = ""
    group: str = Field(min_length=1)
    chemical: str = ""
    chemical_longname: str = ""
    dose: float = Field(ge=0)
    technical_control: bool = False
    reference_rna: bool = False
    solvent_control: bool = False


_TRUE_STRINGS = {"true", "t", "1", "yes", "y"}
_FALSE_STRINGS = {"false", "f", "0", "no", "n"}


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


def validate_sample_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = SampleInputSchema.model_validate(payload).model_dump()
    sample_id_validator(normalized["sample_ID"])
    return normalized


def _append_error(row_errors: dict[str, list[str]], field: str, message: str) -> None:
    row_errors.setdefault(field, [])
    if message not in row_errors[field]:
        row_errors[field].append(message)


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
            sample_id = row.get("sample_ID", "")
            if isinstance(sample_id, str) and sample_id.strip():
                try:
                    sample_id_validator(sample_id.strip())
                except DjangoValidationError as validator_exc:
                    messages = getattr(validator_exc, "messages", [str(validator_exc)])
                    for message in messages:
                        _append_error(row_errors[index], "sample_ID", message)
        except DjangoValidationError as exc:
            messages = getattr(exc, "messages", [str(exc)])
            for message in messages:
                _append_error(row_errors[index], "sample_ID", message)

    study_ids = sorted(
        {
            row["study"]
            for row in normalized_rows
            if row is not None
        }
    )
    studies_by_id = Study.objects.in_bulk(study_ids)

    seen_keys: set[tuple[int, str]] = set()
    existing_keys = {
        (sample.study_id, sample.sample_ID)
        for sample in Sample.objects.filter(study_id__in=study_ids)
    }

    for index, normalized_row in enumerate(normalized_rows):
        if normalized_row is None:
            continue

        study = studies_by_id.get(normalized_row["study"])
        if study is None:
            _append_error(row_errors[index], "study", "Selected study was not found.")
            continue

        row_key = (study.id, normalized_row["sample_ID"])
        if row_key in seen_keys:
            _append_error(row_errors[index], "sample_ID", "This sample_ID is duplicated within the upload.")
        else:
            seen_keys.add(row_key)

        if row_key in existing_keys:
            _append_error(row_errors[index], "sample_ID", "This sample_ID already exists within the selected study.")

        normalized_row["study"] = study

    if any(row_error for row_error in row_errors):
        raise SampleImportValidationError(row_errors)

    return [row for row in normalized_rows if row is not None]


def create_samples_from_validated_rows(normalized_rows: list[dict[str, Any]]) -> list[Sample]:
    samples = [
        Sample(**normalized_row)
        for normalized_row in normalized_rows
    ]

    with transaction.atomic():
        created_samples = Sample.objects.bulk_create(samples)

    return created_samples


def create_samples_from_rows(rows: list[dict[str, Any]]) -> list[Sample]:
    normalized_rows = validate_sample_import_rows(rows)
    return create_samples_from_validated_rows(normalized_rows)


def _build_metadata_upload_row(row: dict[str, Any], *, study_id: int) -> dict[str, Any]:
    normalized: dict[str, Any] = {"study": study_id}
    for raw_key, value in row.items():
        if not isinstance(raw_key, str):
            continue
        key = raw_key.strip()
        if not key:
            continue
        normalized[key] = value

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


def validate_metadata_upload(
    *,
    study_id: int,
    rows: list[dict[str, Any]],
    expected_columns: list[str] | None = None,
) -> tuple[bool, list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []

    column_keys = {
        key.strip()
        for row in rows
        for key in row.keys()
        if isinstance(key, str) and key.strip()
    }

    expected_set = {key.strip() for key in (expected_columns or []) if isinstance(key, str) and key.strip()}
    if expected_columns:
        missing = sorted(expected_set - column_keys)
        if missing:
            for key in missing:
                issues.append(
                    {
                        "row_index": -1,
                        "column_key": key,
                        "message": f"Missing required column: {key}",
                        "severity": "error",
                    }
                )
            return False, issues

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


def _build_config_payload(project: Project, assays: list[Assay], samples: list[Sample]) -> dict:
    platforms = sorted({assay.platform for assay in assays})
    if not platforms:
        raise ConfigGenerationError("At least one assay is required before generating configuration files.")
    if len(platforms) > 1:
        raise ConfigGenerationError("All assays within a project must use the same platform for config generation.")

    genome_versions = sorted({assay.genome_version for assay in assays})
    quant_methods = sorted({assay.quantification_method for assay in assays})
    studies = list(project.studies.all())

    first_study = studies[0] if studies else None
    return {
        "common": {
            "projectdir": f"/secure/projects/{slugify(project.title)}",
            "project_title": project.title,
            "researcher_name": project.researcher_name,
            "bioinformatician_name": project.bioinformatician_assigned,
            "platform": platforms[0],
            "dose": [sample.dose for sample in samples],
            "batch_var": first_study.batch_var if first_study else "",
            "celltype": first_study.celltype if first_study else "",
            "units": "dose",
            "biospyder_dbs": [],
            "biospyder_manifest_file": "",
        },
        "pipeline": {
            "genomedir": "/refs/genomes",
            "genome_filename": f"{genome_versions[0]}.fa" if genome_versions else "",
            "annotation_filename": f"{genome_versions[0]}.gtf" if genome_versions else "",
            "genome_name": genome_versions[0] if genome_versions else "",
            "mode": "se",
            "quantification_method": quant_methods[0] if quant_methods else "",
        },
        "QC": {
            "clust_method": "ward.D2",
            "align_threshold": 0.95,
        },
        "DESeq2": {
            "cooks": True,
            "filter_gene_counts": 10,
        },
    }


def _build_metadata_tsv(samples: list[Sample]) -> str:
    header = [
        "sample_ID",
        "sample_name",
        "group",
        "dose",
        "chemical",
        "chemical_longname",
        "technical_control",
        "reference_rna",
        "solvent_control",
    ]
    rows = ["\t".join(header)]
    for sample in samples:
        rows.append(
            "\t".join(
                [
                    sample.sample_ID,
                    sample.sample_name,
                    sample.group,
                    str(sample.dose),
                    sample.chemical,
                    sample.chemical_longname,
                    str(sample.technical_control).lower(),
                    str(sample.reference_rna).lower(),
                    str(sample.solvent_control).lower(),
                ]
            )
        )
    return "\n".join(rows) + "\n"


def _build_contrasts_tsv(samples: list[Sample]) -> str:
    header = ["reference_group", "comparison_group"]
    rows = ["\t".join(header)]
    control_groups = sorted({sample.group for sample in samples if sample.solvent_control})
    experimental_groups = sorted({sample.group for sample in samples if not sample.solvent_control})
    for control_group in control_groups:
        for comparison_group in experimental_groups:
            if control_group != comparison_group:
                rows.append(f"{control_group}\t{comparison_group}")
    return "\n".join(rows) + "\n"


def build_project_config_bundle(project: Project) -> ConfigBundle:
    samples = list(
        Sample.objects.select_related("study")
        .filter(study__project=project)
        .order_by("id")
    )
    if not samples:
        raise ConfigGenerationError("At least one sample is required before generating configuration files.")

    assays = list(
        Assay.objects.select_related("sample", "sample__study")
        .filter(sample__study__project=project)
        .order_by("id")
    )

    config_yaml = yaml.safe_dump(_build_config_payload(project, assays, samples), sort_keys=False)
    metadata_tsv = _build_metadata_tsv(samples)
    contrasts_tsv = _build_contrasts_tsv(samples)

    file_buffer = BytesIO()
    with ZipFile(file_buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("config.yaml", config_yaml)
        archive.writestr("metadata.tsv", metadata_tsv)
        archive.writestr("contrasts.tsv", contrasts_tsv)

    filename = f"config_bundle_{slugify(project.title).replace('-', '_')}.zip"
    return ConfigBundle(filename=filename, content=file_buffer.getvalue())
