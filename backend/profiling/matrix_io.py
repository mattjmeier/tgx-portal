from __future__ import annotations

import csv
import gzip
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterator, TextIO

from django.conf import settings
from django.db import transaction
from django.utils import timezone


class MatrixDataError(ValueError):
    pass


def resolve_resource_path(uri: str) -> Path:
    root = Path(settings.STUDY_ARCHIVE_ROOT).resolve()
    raw = uri.removeprefix("data://") if uri.startswith("data://") else uri
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = root / candidate
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise MatrixDataError("Matrix resource must be inside the configured study archive root.") from exc
    if not resolved.is_file():
        raise MatrixDataError("Matrix resource is unavailable.")
    return resolved


def open_matrix_text(path: Path) -> TextIO:
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", newline="")
    return path.open("r", encoding="utf-8", newline="")


def matrix_delimiter(path: Path) -> str:
    suffixes = path.suffixes
    data_suffix = suffixes[-2] if suffixes and suffixes[-1] == ".gz" and len(suffixes) > 1 else path.suffix
    return "," if data_suffix == ".csv" else "\t"


def matrix_rows(path: Path) -> tuple[list[str], Iterator[list[str]]]:
    handle = open_matrix_text(path)
    reader = csv.reader(handle, delimiter=matrix_delimiter(path))
    try:
        header = next(reader)
    except StopIteration:
        handle.close()
        raise MatrixDataError("Count matrix is empty.")

    def rows() -> Iterator[list[str]]:
        try:
            yield from reader
        finally:
            handle.close()

    return header, rows()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_numeric_row(row: list[str], expected_columns: int, row_number: int) -> None:
    if len(row) != expected_columns:
        raise MatrixDataError(f"Matrix row {row_number} has {len(row)} columns; expected {expected_columns}.")
    if not row[0].strip():
        raise MatrixDataError(f"Matrix row {row_number} has a blank feature identifier.")
    for value in row[1:]:
        try:
            Decimal(value)
        except InvalidOperation as exc:
            raise MatrixDataError(f"Matrix row {row_number} contains a non-numeric value.") from exc


@transaction.atomic
def upsert_count_matrix_profile(
    *,
    resource,
    value_type: str,
    feature_id_kind: str,
    annotation_source: str,
    annotation_version: str,
    sample_column_map: dict[str, str | list[str]] | None = None,
    samples_by_id: dict[str, object] | None = None,
    allowed_sample_ids: set[str] | None = None,
):
    from .models import CountMatrixColumn, CountMatrixProfile

    path = resolve_resource_path(resource.uri)
    header, rows = matrix_rows(path)
    if len(header) < 2 or any(not value for value in header) or len(header) != len(set(header)):
        raise MatrixDataError("Count matrix requires a unique feature column and unique sample columns.")
    seen_features: set[str] = set()
    feature_count = 0
    for row_number, row in enumerate(rows, start=2):
        validate_numeric_row(row, len(header), row_number)
        if row[0] in seen_features:
            raise MatrixDataError(f"Count matrix contains duplicate feature identifier {row[0]}.")
        seen_features.add(row[0])
        feature_count += 1

    mapping = sample_column_map or {}
    resolved_targets: dict[str, list[str]] = {}
    unknown: list[str] = []
    for column_name in header[1:]:
        target = mapping.get(column_name, column_name)
        targets = [str(item).strip() for item in (target if isinstance(target, list) else [target]) if str(item).strip()]
        resolved_targets[column_name] = targets
        if allowed_sample_ids is not None and (not targets or any(item not in allowed_sample_ids for item in targets)):
            unknown.append(column_name)
    if unknown:
        raise MatrixDataError(f"Count matrix has unknown sample columns: {', '.join(unknown)}")

    metadata_complete = all([value_type, feature_id_kind, annotation_source, annotation_version])
    mappings_complete = bool(samples_by_id) and all(
        targets and all(target in samples_by_id for target in targets)
        for targets in resolved_targets.values()
    )
    errors = []
    if not metadata_complete:
        errors.append("Count matrix compatibility metadata is incomplete.")
    if not mappings_complete:
        errors.append("Count matrix columns are not linked to committed samples.")
    fingerprint_payload = [value_type, feature_id_kind, annotation_source, annotation_version, header]
    fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, separators=(",", ":")).encode()).hexdigest()
    profile, _ = CountMatrixProfile.objects.update_or_create(
        resource=resource,
        defaults={
            "value_type": value_type or CountMatrixProfile.ValueType.OTHER,
            "feature_id_kind": feature_id_kind or "",
            "annotation_source": annotation_source or "",
            "annotation_version": annotation_version or "",
            "feature_column": header[0],
            "feature_count": feature_count,
            "matrix_column_count": len(header) - 1,
            "validation_status": (
                CountMatrixProfile.ValidationStatus.VALID
                if metadata_complete and mappings_complete
                else CountMatrixProfile.ValidationStatus.PENDING
            ),
            "validation_errors": errors,
            "schema_fingerprint": fingerprint,
            "validated_at": timezone.now(),
        },
    )
    profile.columns.all().delete()
    for ordinal, column_name in enumerate(header[1:]):
        column = CountMatrixColumn.objects.create(matrix=profile, original_name=column_name, ordinal=ordinal)
        if samples_by_id:
            column.samples.add(*(samples_by_id[target] for target in resolved_targets[column_name] if target in samples_by_id))
    return profile


@transaction.atomic
def link_count_matrix_samples(*, profile, samples_by_id: dict[str, object], sample_column_map=None):
    mapping = sample_column_map or {}
    complete = True
    for column in profile.columns.all():
        target = mapping.get(column.original_name, column.original_name)
        targets = target if isinstance(target, list) else [target]
        samples = [samples_by_id[str(value)] for value in targets if str(value) in samples_by_id]
        column.samples.set(samples)
        complete = complete and bool(samples) and len(samples) == len(targets)
    metadata_complete = all([
        profile.value_type,
        profile.feature_id_kind,
        profile.annotation_source,
        profile.annotation_version,
    ])
    profile.validation_status = (
        profile.ValidationStatus.VALID
        if complete and metadata_complete
        else profile.ValidationStatus.PENDING
    )
    profile.validation_errors = [] if profile.validation_status == profile.ValidationStatus.VALID else [
        "Count matrix compatibility metadata or sample mappings are incomplete."
    ]
    profile.validated_at = timezone.now()
    profile.save(update_fields=["validation_status", "validation_errors", "validated_at", "updated_at"])
    return profile
