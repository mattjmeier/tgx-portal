from __future__ import annotations

import csv
import hashlib
import json
from io import StringIO
from pathlib import Path
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from pydantic import ValidationError as PydanticValidationError

from core.models import Project, Sample, Study, StudyConfig, StudyMetadataMapping, StudyOnboardingState, default_study_config
from core.services import normalize_spreadsheet_boolean, validate_sample_payload

from .models import ImportAliasMap, ImportBatch, ImportBatchResource, ImportStagedRow, ProfilingPlatform, StudyDataResource, StudyWarehouseMetadata

IMPORT_STORAGE_ROOT = Path("/tmp/tgx_portal_study_imports")
CORE_SAMPLE_FIELDS = {
    "sample_ID",
    "sample_name",
    "description",
    "technical_control",
    "reference_rna",
    "solvent_control",
}
BOOLEAN_FIELDS = {"technical_control", "reference_rna", "solvent_control"}
REQUIRED_METADATA_FIELDS = {"sample_ID", "group"}
REQUIRED_IMPORT_FIELDS = {"project_id", "title", "study_name", "study_type", "platform_id"}
TRANSFORM_TRIM = "trim"
TRANSFORM_LOWERCASE = "lowercase"
TRANSFORM_UPPERCASE = "uppercase"
TRANSFORM_REPLACE_WHITESPACE = "replace_whitespace_with_underscore"


def _ensure_storage_root() -> Path:
    IMPORT_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    return IMPORT_STORAGE_ROOT


def _draft_ext(import_batch: ImportBatch) -> dict[str, Any]:
    ext = import_batch.ext if isinstance(import_batch.ext, dict) else {}
    ext.setdefault("draft", {})
    ext.setdefault("previews", {})
    ext.setdefault("resource_ids", {})
    return ext


def get_import_draft(import_batch: ImportBatch) -> dict[str, Any]:
    return dict(_draft_ext(import_batch).get("draft") or {})


def update_import_draft(import_batch: ImportBatch, updates: dict[str, Any]) -> ImportBatch:
    ext = _draft_ext(import_batch)
    draft = dict(ext.get("draft") or {})
    draft.update({key: value for key, value in updates.items() if value is not None})
    ext["draft"] = draft
    import_batch.ext = ext
    import_batch.save(update_fields=["ext", "updated_at"])
    return import_batch


def _detect_delimiter(content: str) -> str:
    sample = "\n".join(content.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t")
        return dialect.delimiter
    except csv.Error:
        return "\t" if "\t" in sample else ","


def _parse_delimited_content(content: str) -> tuple[list[str], list[dict[str, str]]]:
    delimiter = _detect_delimiter(content)
    reader = csv.DictReader(StringIO(content), delimiter=delimiter)
    fieldnames = [str(name).strip() for name in (reader.fieldnames or []) if str(name).strip()]
    rows: list[dict[str, str]] = []
    for row in reader:
        normalized_row: dict[str, str] = {}
        for key, value in row.items():
            if key is None:
                continue
            normalized_key = str(key).strip()
            if not normalized_key:
                continue
            normalized_row[normalized_key] = "" if value is None else str(value)
        if any(str(value).strip() for value in normalized_row.values()):
            rows.append(normalized_row)
    return fieldnames, rows


def _apply_transform(value: Any, transform: str) -> Any:
    if value is None:
        return None
    text = str(value)
    if transform == TRANSFORM_TRIM:
        return text.strip()
    if transform == TRANSFORM_LOWERCASE:
        return text.lower()
    if transform == TRANSFORM_UPPERCASE:
        return text.upper()
    if transform == TRANSFORM_REPLACE_WHITESPACE:
        return "_".join(text.split())
    return text


def _apply_transforms(value: Any, transforms: list[str]) -> Any:
    current = value
    for transform in transforms:
        current = _apply_transform(current, str(transform))
    return current


def _metadata_mappings(columns: list[str], mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if mappings:
        return mappings
    return [
        {
            "source_column": column,
            "target_field": column,
            "transforms": [TRANSFORM_TRIM],
        }
        for column in columns
    ]


def _save_import_file(*, import_batch: ImportBatch, file_role: str, filename: str, content: str) -> StudyDataResource:
    storage_root = _ensure_storage_root()
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    file_path = storage_root / f"{import_batch.id}_{file_role}_{filename}"
    file_path.write_text(content, encoding="utf-8")

    ext = _draft_ext(import_batch)
    resource_id = (ext.get("resource_ids") or {}).get(file_role)
    resource = StudyDataResource.objects.filter(id=resource_id).first() if resource_id else None
    resource_type = StudyDataResource.ResourceType.FEATURE if file_role == "count" else StudyDataResource.ResourceType.METADATA
    if file_role == "contrasts":
        resource_type = StudyDataResource.ResourceType.MANIFEST
    if resource is None:
        resource = StudyDataResource.objects.create(
            study_metadata=import_batch.study_metadata,
            resource_type=resource_type,
            storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
            display_name=filename,
            uri=str(file_path),
            file_format=Path(filename).suffix.lstrip(".").lower(),
            checksum_algorithm="sha256",
            checksum=digest,
            availability_status=StudyDataResource.AvailabilityStatus.AVAILABLE,
            ext={"file_role": file_role},
        )
        ImportBatchResource.objects.update_or_create(
            import_batch=import_batch,
            data_resource=resource,
            defaults={"role": ImportBatchResource.ResourceRole.INPUT},
        )
    else:
        resource.display_name = filename
        resource.uri = str(file_path)
        resource.file_format = Path(filename).suffix.lstrip(".").lower()
        resource.checksum_algorithm = "sha256"
        resource.checksum = digest
        resource.availability_status = StudyDataResource.AvailabilityStatus.AVAILABLE
        resource.ext = {**(resource.ext or {}), "file_role": file_role}
        resource.save()
    resource_ids = dict(ext.get("resource_ids") or {})
    resource_ids[file_role] = resource.id
    ext["resource_ids"] = resource_ids
    import_batch.ext = ext
    import_batch.save(update_fields=["ext", "updated_at"])
    return resource


def preview_metadata(
    *,
    import_batch: ImportBatch,
    filename: str,
    content: str,
    mappings: list[dict[str, Any]],
) -> dict[str, Any]:
    columns, rows = _parse_delimited_content(content)
    resolved_mappings = _metadata_mappings(columns, mappings)
    issues: list[dict[str, Any]] = []
    normalized_rows: list[dict[str, Any]] = []
    mapped_targets: dict[str, int] = {}

    for mapping in resolved_mappings:
        source_column = str(mapping.get("source_column") or "").strip()
        target_field = str(mapping.get("target_field") or "").strip()
        transforms = [str(value) for value in (mapping.get("transforms") or []) if str(value).strip()]
        if not source_column or not target_field:
            continue
        mapped_targets[target_field] = mapped_targets.get(target_field, 0) + 1
        if source_column not in columns:
            issues.append(
                {
                    "row_index": -1,
                    "column_key": source_column,
                    "message": "Mapped source column is not present in the uploaded file.",
                    "severity": "error",
                }
            )
        mapping["transforms"] = transforms

    for target_field, count in mapped_targets.items():
        if count > 1:
            issues.append(
                {
                    "row_index": -1,
                    "column_key": target_field,
                    "message": "This canonical field is mapped from more than one source column.",
                    "severity": "error",
                }
            )

    mapped_target_fields = {str(mapping.get("target_field") or "").strip() for mapping in resolved_mappings}
    for required_field in sorted(REQUIRED_METADATA_FIELDS - mapped_target_fields):
        issues.append(
            {
                "row_index": -1,
                "column_key": required_field,
                "message": "This required field is not mapped from the uploaded file.",
                "severity": "error",
            }
        )

    seen_sample_ids: set[str] = set()
    row_records: list[ImportStagedRow] = []
    for row_index, row in enumerate(rows):
        normalized: dict[str, Any] = {}
        row_errors: list[dict[str, str]] = []
        for mapping in resolved_mappings:
            source_column = str(mapping.get("source_column") or "").strip()
            target_field = str(mapping.get("target_field") or "").strip()
            if not source_column or not target_field or source_column not in row:
                continue
            transformed_value = _apply_transforms(row.get(source_column, ""), mapping.get("transforms") or [])
            if target_field in BOOLEAN_FIELDS:
                transformed_value = normalize_spreadsheet_boolean(transformed_value)
                if not isinstance(transformed_value, bool):
                    row_errors.append({"column_key": target_field, "message": "Must be a boolean value."})
                    continue
            normalized[target_field] = transformed_value

        sample_id = str(normalized.get("sample_ID") or "").strip()
        group_value = str(normalized.get("group") or "").strip()
        if not sample_id:
            row_errors.append({"column_key": "sample_ID", "message": "sample_ID is required."})
        elif sample_id in seen_sample_ids:
            row_errors.append({"column_key": "sample_ID", "message": "This sample_ID is duplicated within the upload."})
        else:
            seen_sample_ids.add(sample_id)

        if not group_value:
            row_errors.append({"column_key": "group", "message": "group is required."})

        normalized_rows.append(normalized)
        for error in row_errors:
            issues.append(
                {
                    "row_index": row_index,
                    "column_key": error["column_key"],
                    "message": error["message"],
                    "severity": "error",
                }
            )
        row_records.append(
            ImportStagedRow(
                import_batch=import_batch,
                file_role=ImportStagedRow.FileRole.METADATA,
                source_row_index=row_index,
                source_payload=row,
                normalized_payload=normalized,
                validation_errors=row_errors,
                is_valid=not row_errors,
            )
        )

    with transaction.atomic():
        ImportAliasMap.objects.filter(import_batch=import_batch, file_role=ImportAliasMap.FileRole.METADATA).delete()
        ImportStagedRow.objects.filter(import_batch=import_batch, file_role=ImportStagedRow.FileRole.METADATA).delete()
        ImportAliasMap.objects.bulk_create(
            [
                ImportAliasMap(
                    import_batch=import_batch,
                    file_role=ImportAliasMap.FileRole.METADATA,
                    scope=ImportAliasMap.Scope.SAMPLE,
                    canonical_target=str(mapping.get("target_field") or "").strip(),
                    source_column=str(mapping.get("source_column") or "").strip(),
                    transforms=list(mapping.get("transforms") or []),
                )
                for mapping in resolved_mappings
                if str(mapping.get("source_column") or "").strip() and str(mapping.get("target_field") or "").strip()
            ]
        )
        ImportStagedRow.objects.bulk_create(row_records)
        resource = _save_import_file(import_batch=import_batch, file_role="metadata", filename=filename, content=content)
        ext = _draft_ext(import_batch)
        ext["previews"]["metadata"] = {
            "valid": not issues,
            "issue_count": len(issues),
            "columns": columns,
            "filename": filename,
            "resource_id": resource.id,
            "group_values": sorted(
                {
                    str(row.get("group") or "").strip()
                    for row in normalized_rows
                    if str(row.get("group") or "").strip()
                }
            ),
        }
        import_batch.ext = ext
        import_batch.records_seen = len(rows)
        import_batch.save(update_fields=["ext", "records_seen", "updated_at"])

    return {
        "valid": not issues,
        "issues": issues,
        "normalized_rows": normalized_rows,
        "columns": columns,
    }


def preview_contrasts(*, import_batch: ImportBatch, filename: str, content: str) -> dict[str, Any]:
    columns, rows = _parse_delimited_content(content)
    issues: list[dict[str, Any]] = []
    normalized_rows: list[dict[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    metadata_group_values = set((_draft_ext(import_batch).get("previews") or {}).get("metadata", {}).get("group_values") or [])

    expected_columns = {"reference_group", "comparison_group"}
    missing_columns = expected_columns - set(columns)
    for column in sorted(missing_columns):
        issues.append(
            {
                "row_index": -1,
                "column_key": column,
                "message": "This required contrast column is missing from the uploaded file.",
                "severity": "error",
            }
        )

    row_records: list[ImportStagedRow] = []
    for row_index, row in enumerate(rows):
        reference_group = str(row.get("reference_group") or "").strip().lower()
        comparison_group = str(row.get("comparison_group") or "").strip().lower()
        normalized = {
            "reference_group": reference_group,
            "comparison_group": comparison_group,
        }
        row_errors: list[dict[str, str]] = []
        if not reference_group or not comparison_group:
            row_errors.append({"column_key": "comparison_group", "message": "Both contrast columns are required."})
        elif reference_group == comparison_group:
            row_errors.append({"column_key": "comparison_group", "message": "Reference and comparison groups must differ."})
        elif comparison_group not in metadata_group_values:
            row_errors.append(
                {
                    "column_key": "comparison_group",
                    "message": "Comparison group is not present in the normalized metadata groups.",
                }
            )
        elif reference_group not in metadata_group_values:
            row_errors.append(
                {
                    "column_key": "reference_group",
                    "message": "Reference group is not present in the normalized metadata groups.",
                }
            )

        pair = (reference_group, comparison_group)
        if reference_group and comparison_group and pair in seen_pairs:
            row_errors.append({"column_key": "comparison_group", "message": "This contrast pair is duplicated within the upload."})
        else:
            seen_pairs.add(pair)

        normalized_rows.append(normalized)
        for error in row_errors:
            issues.append(
                {
                    "row_index": row_index,
                    "column_key": error["column_key"],
                    "message": error["message"],
                    "severity": "error",
                }
            )
        row_records.append(
            ImportStagedRow(
                import_batch=import_batch,
                file_role=ImportStagedRow.FileRole.CONTRASTS,
                source_row_index=row_index,
                source_payload=row,
                normalized_payload=normalized,
                validation_errors=row_errors,
                is_valid=not row_errors,
            )
        )

    with transaction.atomic():
        ImportStagedRow.objects.filter(import_batch=import_batch, file_role=ImportStagedRow.FileRole.CONTRASTS).delete()
        ImportStagedRow.objects.bulk_create(row_records)
        resource = _save_import_file(import_batch=import_batch, file_role="contrasts", filename=filename, content=content)
        ext = _draft_ext(import_batch)
        ext["previews"]["contrasts"] = {
            "valid": not issues,
            "issue_count": len(issues),
            "filename": filename,
            "resource_id": resource.id,
        }
        import_batch.ext = ext
        import_batch.save(update_fields=["ext", "updated_at"])

    return {
        "valid": not issues,
        "issues": issues,
        "contrasts": normalized_rows,
        "columns": columns,
    }


def register_count_resource(
    *,
    import_batch: ImportBatch,
    path: str,
    feature_id_kind: str | None,
    annotation_source: str | None,
    annotation_version: str | None,
) -> dict[str, Any]:
    from .archive_import import (
        ArchiveImportError,
        _data_uri,
        _hash_file,
        _read_delimited_header,
        _resolve_data_path,
    )

    if not path.strip():
        raise ArchiveImportError("A count resource path beneath /data is required.")
    resolved_path = _resolve_data_path(path)
    if not resolved_path.is_file():
        raise ArchiveImportError(f"Count resource is not a file: {resolved_path}")
    header_columns = _read_delimited_header(resolved_path)
    if len(header_columns) < 2:
        raise ArchiveImportError(
            "Count resources require a feature column and at least one sample column."
        )
    curated_sample_ids = {
        str(sample_id)
        for sample_id in import_batch.staged_rows.filter(
            file_role=ImportStagedRow.FileRole.METADATA,
            is_valid=True,
        ).values_list("normalized_payload__sample_ID", flat=True)
        if sample_id
    }
    unknown_columns = sorted(set(header_columns[1:]) - curated_sample_ids)
    if curated_sample_ids and unknown_columns:
        raise ArchiveImportError(
            "Count resource has unknown sample columns: "
            f"{', '.join(unknown_columns)}"
        )
    digest = _hash_file(resolved_path)
    ext = _draft_ext(import_batch)
    resource_id = (ext.get("resource_ids") or {}).get("count")
    resource = (
        StudyDataResource.objects.filter(id=resource_id).first()
        if resource_id
        else None
    )
    resource_defaults = {
        "study_metadata": import_batch.study_metadata,
        "resource_key": f"import-{import_batch.id}-counts",
        "resource_type": StudyDataResource.ResourceType.FEATURE,
        "storage_kind": StudyDataResource.StorageKind.NETWORK_PATH,
        "display_name": resolved_path.name,
        "uri": _data_uri(resolved_path),
        "file_format": "".join(resolved_path.suffixes).lstrip("."),
        "checksum_algorithm": "sha256",
        "checksum": digest,
        "size_bytes": resolved_path.stat().st_size,
        "availability_status": StudyDataResource.AvailabilityStatus.AVAILABLE,
        "ext": {
            **((resource.ext if resource else {}) or {}),
            "file_role": "count",
            "feature_id_kind": feature_id_kind,
            "annotation_source": annotation_source,
            "annotation_version": annotation_version,
            "header_column_count": len(header_columns),
            "feature_identifier_column": header_columns[0] if header_columns else None,
            "sample_column_count": max(len(header_columns) - 1, 0),
        },
    }
    if resource is None:
        resource = StudyDataResource.objects.create(**resource_defaults)
        ImportBatchResource.objects.update_or_create(
            import_batch=import_batch,
            data_resource=resource,
            defaults={"role": ImportBatchResource.ResourceRole.INPUT},
        )
    else:
        for field_name, value in resource_defaults.items():
            setattr(resource, field_name, value)
        resource.save()
    resource_ids = dict(ext.get("resource_ids") or {})
    resource_ids["count"] = resource.id
    ext["resource_ids"] = resource_ids
    import_batch.ext = ext
    import_batch.save(update_fields=["ext", "updated_at"])
    return {
        "resource": {
            "id": resource.id,
            "display_name": resource.display_name,
            "file_format": resource.file_format,
            "checksum": resource.checksum,
            "ext": resource.ext,
        }
    }


def serialize_import_batch(import_batch: ImportBatch) -> dict[str, Any]:
    draft = get_import_draft(import_batch)
    ext = _draft_ext(import_batch)
    metadata_preview = dict(ext.get("previews", {}).get("metadata") or {})
    contrasts_preview = dict(ext.get("previews", {}).get("contrasts") or {})
    count_resource_id = (ext.get("resource_ids") or {}).get("count")
    count_resource = None
    if count_resource_id:
        resource = StudyDataResource.objects.filter(id=count_resource_id).first()
        if resource is not None:
            count_resource = {
                "id": resource.id,
                "display_name": resource.display_name,
                "file_format": resource.file_format,
                "checksum": resource.checksum,
                "ext": resource.ext or {},
            }
    return {
        "id": import_batch.id,
        "status": import_batch.status,
        "project_id": draft.get("project_id"),
        "title": draft.get("title", ""),
        "description": draft.get("description", ""),
        "species": draft.get("species"),
        "celltype": draft.get("celltype", ""),
        "study_name": draft.get("study_name", ""),
        "source": draft.get("source", ""),
        "study_type": draft.get("study_type"),
        "in_vitro": draft.get("in_vitro"),
        "platform_id": draft.get("platform_id"),
        "metadata_preview": {
            "valid": bool(metadata_preview.get("valid")),
            "issues": [],
            "normalized_rows": [
                staged_row.normalized_payload
                for staged_row in import_batch.staged_rows.filter(file_role=ImportStagedRow.FileRole.METADATA).order_by("source_row_index")
            ],
            "columns": metadata_preview.get("columns", []),
        },
        "contrasts_preview": {
            "valid": bool(contrasts_preview.get("valid")),
            "issues": [],
            "contrasts": [
                staged_row.normalized_payload
                for staged_row in import_batch.staged_rows.filter(file_role=ImportStagedRow.FileRole.CONTRASTS).order_by("source_row_index")
            ],
        },
        "count_resource": count_resource,
    }


def commit_import(import_batch: ImportBatch) -> dict[str, Any]:
    draft = get_import_draft(import_batch)
    missing_fields = [field for field in sorted(REQUIRED_IMPORT_FIELDS) if not draft.get(field)]
    if missing_fields:
        raise ValueError(f"Import draft is missing required fields: {', '.join(missing_fields)}.")

    ext = _draft_ext(import_batch)
    metadata_preview = ext.get("previews", {}).get("metadata") or {}
    contrasts_preview = ext.get("previews", {}).get("contrasts") or {}
    if not metadata_preview.get("valid"):
        raise ValueError("Metadata preview must pass validation before commit.")
    if not contrasts_preview.get("valid"):
        raise ValueError("Contrast preview must pass validation before commit.")

    metadata_rows = list(
        import_batch.staged_rows.filter(file_role=ImportStagedRow.FileRole.METADATA).order_by("source_row_index")
    )
    contrast_rows = list(
        import_batch.staged_rows.filter(file_role=ImportStagedRow.FileRole.CONTRASTS).order_by("source_row_index")
    )
    if not metadata_rows or not contrast_rows:
        raise ValueError("Metadata and contrast previews are required before commit.")

    project = Project.objects.filter(id=draft["project_id"]).first()
    platform = ProfilingPlatform.objects.filter(id=draft["platform_id"]).first()
    if project is None:
        raise ValueError("Selected project no longer exists.")
    if platform is None:
        raise ValueError("Selected profiling platform no longer exists.")

    with transaction.atomic():
        study = Study.objects.create(
            project=project,
            title=draft["title"],
            description=draft.get("description") or "",
            species=draft.get("species") or "",
            celltype=draft.get("celltype") or "",
            treatment_var="group" if any("group" in row.normalized_payload for row in metadata_rows) else "",
        )
        StudyConfig.objects.create(study=study, **default_study_config())
        StudyMetadataMapping.objects.create(
            study=study,
            treatment_level_1="group" if any("group" in row.normalized_payload for row in metadata_rows) else "",
            selected_contrasts=[row.normalized_payload for row in contrast_rows],
        )
        StudyOnboardingState.objects.create(
            study=study,
            metadata_columns=sorted(
                {
                    key
                    for row in metadata_rows
                    for key in row.normalized_payload.keys()
                }
            ),
            validated_rows=[row.normalized_payload for row in metadata_rows],
            suggested_contrasts=[row.normalized_payload for row in contrast_rows],
            selected_contrasts=[row.normalized_payload for row in contrast_rows],
        )
        warehouse = StudyWarehouseMetadata.objects.create(
            study=study,
            study_name=draft["study_name"],
            source=draft.get("source") or "",
            study_type=draft["study_type"],
            in_vitro=draft.get("in_vitro"),
            platform=platform,
        )
        samples = []
        for row in metadata_rows:
            payload = dict(row.normalized_payload)
            metadata = {
                key: value
                for key, value in payload.items()
                if key not in CORE_SAMPLE_FIELDS and key != "sample_ID"
            }
            validation_payload = {
                "study": study.id,
                "sample_ID": str(payload.get("sample_ID") or ""),
                "sample_name": str(payload.get("sample_name") or ""),
                "description": str(payload.get("description") or ""),
                "technical_control": bool(payload.get("technical_control") or False),
                "reference_rna": bool(payload.get("reference_rna") or False),
                "solvent_control": bool(payload.get("solvent_control") or False),
                "metadata": {},
            }
            try:
                validated = validate_sample_payload(validation_payload)
            except (DjangoValidationError, PydanticValidationError) as exc:
                message_dict = getattr(exc, "message_dict", None)
                if message_dict:
                    details = "; ".join(
                        f"{field}: {', '.join(str(message) for message in messages)}"
                        for field, messages in message_dict.items()
                    )
                else:
                    details = str(exc)
                raise ValueError(f"Sample row {row.source_row_index + 1} failed validation: {details}") from exc
            samples.append(
                Sample(
                    study=study,
                    sample_ID=validated["sample_ID"],
                    sample_name=validated["sample_name"],
                    description=validated["description"],
                    technical_control=validated["technical_control"],
                    reference_rna=validated["reference_rna"],
                    solvent_control=validated["solvent_control"],
                    metadata=metadata,
                )
            )
        Sample.objects.bulk_create(samples)

        resource_ids = (ext.get("resource_ids") or {}).values()
        StudyDataResource.objects.filter(id__in=list(resource_ids)).update(study_metadata=warehouse)
        import_batch.study_metadata = warehouse
        import_batch.status = ImportBatch.Status.COMPLETED
        import_batch.started_at = import_batch.started_at or timezone.now()
        import_batch.finished_at = timezone.now()
        import_batch.records_seen = len(metadata_rows)
        import_batch.records_created = len(samples)
        import_batch.records_rejected = 0
        import_batch.save(
            update_fields=[
                "study_metadata",
                "status",
                "started_at",
                "finished_at",
                "records_seen",
                "records_created",
                "records_rejected",
                "updated_at",
            ]
        )

    return {
        "study_id": study.id,
        "study_title": study.title,
    }
