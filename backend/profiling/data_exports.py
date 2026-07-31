from __future__ import annotations

import csv
import gzip
import json
import shutil
import sqlite3
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile

from django.conf import settings
from django.utils import timezone

from .matrix_io import MatrixDataError, matrix_rows, resolve_resource_path, sha256_file, validate_numeric_row
from .models import CountMatrixProfile, DataExport


MAX_EXPORT_MATRICES = 25
MAX_EXPORT_SOURCE_BYTES = 10 * 1024 * 1024 * 1024


class DataExportError(ValueError):
    pass


def _profiles(matrix_ids: list[int]) -> list[CountMatrixProfile]:
    profiles = list(
        CountMatrixProfile.objects.filter(id__in=matrix_ids)
        .select_related("resource__study_metadata__study__project", "resource__study_metadata__platform")
        .prefetch_related("columns__samples")
    )
    by_id = {profile.id: profile for profile in profiles}
    if len(profiles) != len(set(matrix_ids)):
        raise DataExportError("One or more selected matrices were not found.")
    return [by_id[matrix_id] for matrix_id in matrix_ids]


def validate_export_selection(matrix_ids: list[int]) -> tuple[list[CountMatrixProfile], list[object]]:
    if not matrix_ids:
        raise DataExportError("Select at least one count matrix.")
    if len(matrix_ids) > MAX_EXPORT_MATRICES:
        raise DataExportError(f"A maximum of {MAX_EXPORT_MATRICES} matrices may be exported at once.")
    profiles = _profiles(matrix_ids)
    if any(not profile.is_browser_ready for profile in profiles):
        raise DataExportError("Every selected matrix must be browser-ready.")
    key = profiles[0].compatibility_key
    if any(profile.compatibility_key != key for profile in profiles[1:]):
        raise DataExportError("Selected matrices have incompatible platform, species, value type, or annotation metadata.")
    total_bytes = sum(profile.resource.size_bytes or 0 for profile in profiles)
    if total_bytes > MAX_EXPORT_SOURCE_BYTES:
        raise DataExportError("Selected source matrices exceed the 10 GiB export limit.")
    return profiles, key


def _write_supporting_files(root: Path, profiles: list[CountMatrixProfile], export: DataExport) -> None:
    with (root / "sample_metadata.tsv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["export_column", "study_name", "matrix_column", "sample_ID", "pooled"])
        for profile in profiles:
            study_name = profile.resource.study_metadata.study_name
            for column in profile.columns.all().order_by("ordinal"):
                samples = list(column.samples.all().order_by("sample_ID"))
                for sample in samples:
                    writer.writerow([f"{study_name}::{column.original_name}", study_name, column.original_name, sample.sample_ID, len(samples) > 1])
    with (root / "studies.tsv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["study_name", "study_title", "collaboration", "species", "platform", "technology"])
        for profile in profiles:
            warehouse = profile.resource.study_metadata
            writer.writerow([
                warehouse.study_name,
                warehouse.study.title,
                warehouse.study.project.title,
                warehouse.study.species,
                warehouse.platform.platform_name,
                warehouse.platform.technology_type,
            ])
    resources = [
        {
            "matrix_id": profile.id,
            "resource_id": profile.resource_id,
            "resource_key": profile.resource.resource_key,
            "display_name": profile.resource.display_name,
            "checksum": profile.resource.checksum,
            "compatibility_key": profile.compatibility_key,
        }
        for profile in profiles
    ]
    (root / "resources.json").write_text(json.dumps(resources, indent=2), encoding="utf-8")
    selection = {
        "matrix_ids": export.matrix_ids,
        "filters": export.request_snapshot.get("filters", {}),
        "feature_join": "intersection",
        "compatibility_key": profiles[0].compatibility_key,
        "source_checksums": {str(profile.id): profile.resource.checksum for profile in profiles},
    }
    (root / "selection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
    (root / "README.txt").write_text(
        "TGx Portal cross-study count export\n\n"
        "Only features present in every selected matrix are included. Values are copied without normalization, "
        "translation, or missing-value replacement. Output columns are prefixed with the stable warehouse study name.\n",
        encoding="utf-8",
    )


def _stage_and_write_counts(root: Path, profiles: list[CountMatrixProfile]) -> int:
    database_path = root / "matrix-stage.sqlite3"
    connection = sqlite3.connect(database_path)
    connection.execute(
        "CREATE TABLE matrix_rows (matrix_id INTEGER NOT NULL, feature_id TEXT NOT NULL, ordinal INTEGER NOT NULL, values_json TEXT NOT NULL, PRIMARY KEY(matrix_id, feature_id))"
    )
    try:
        for profile in profiles:
            path = resolve_resource_path(profile.resource.uri)
            if profile.resource.checksum and sha256_file(path) != profile.resource.checksum:
                raise DataExportError(f"Source checksum changed for {profile.resource.display_name}.")
            header, rows = matrix_rows(path)
            expected_columns = profile.matrix_column_count + 1
            if len(header) != expected_columns or header[0] != profile.feature_column:
                raise DataExportError(f"Matrix header changed for {profile.resource.display_name}.")
            expected_names = list(profile.columns.order_by("ordinal").values_list("original_name", flat=True))
            if header[1:] != expected_names:
                raise DataExportError(f"Matrix sample columns changed for {profile.resource.display_name}.")
            batch: list[tuple[int, str, int, str]] = []
            for ordinal, row in enumerate(rows):
                validate_numeric_row(row, expected_columns, ordinal + 2)
                batch.append((profile.id, row[0], ordinal, json.dumps(row[1:], separators=(",", ":"))))
                if len(batch) == 1000:
                    try:
                        connection.executemany("INSERT INTO matrix_rows VALUES (?, ?, ?, ?)", batch)
                    except sqlite3.IntegrityError as exc:
                        raise DataExportError(f"Duplicate feature identifier in {profile.resource.display_name}.") from exc
                    batch.clear()
            if batch:
                try:
                    connection.executemany("INSERT INTO matrix_rows VALUES (?, ?, ?, ?)", batch)
                except sqlite3.IntegrityError as exc:
                    raise DataExportError(f"Duplicate feature identifier in {profile.resource.display_name}.") from exc
            connection.commit()

        placeholders = ",".join("?" for _ in profiles)
        connection.execute("CREATE TABLE common_features (feature_id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL)")
        connection.execute(
            f"""
            INSERT INTO common_features(feature_id, ordinal)
            SELECT first.feature_id, first.ordinal
            FROM matrix_rows AS first
            WHERE first.matrix_id = ?
              AND first.feature_id IN (
                SELECT feature_id FROM matrix_rows WHERE matrix_id IN ({placeholders})
                GROUP BY feature_id HAVING COUNT(DISTINCT matrix_id) = ?
              )
            """,
            [profiles[0].id, *[profile.id for profile in profiles], len(profiles)],
        )
        feature_count = connection.execute("SELECT COUNT(*) FROM common_features").fetchone()[0]
        with gzip.open(root / "counts.tsv.gz", "wt", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            output_header = [profiles[0].feature_column]
            for profile in profiles:
                study_name = profile.resource.study_metadata.study_name
                output_header.extend(f"{study_name}::{name}" for name in profile.columns.order_by("ordinal").values_list("original_name", flat=True))
            writer.writerow(output_header)
            current_feature: str | None = None
            values_by_matrix: dict[int, list[str]] = {}
            cursor = connection.execute(
                f"""
                SELECT common.feature_id, rows.matrix_id, rows.values_json
                FROM common_features AS common
                JOIN matrix_rows AS rows ON rows.feature_id = common.feature_id
                WHERE rows.matrix_id IN ({placeholders})
                ORDER BY common.ordinal, rows.matrix_id
                """,
                [profile.id for profile in profiles],
            )
            for feature_id, matrix_id, values_json in cursor:
                if current_feature is not None and feature_id != current_feature:
                    output = [current_feature]
                    for profile in profiles:
                        output.extend(values_by_matrix[profile.id])
                    writer.writerow(output)
                    values_by_matrix = {}
                current_feature = feature_id
                values_by_matrix[matrix_id] = json.loads(values_json)
            if current_feature is not None:
                output = [current_feature]
                for profile in profiles:
                    output.extend(values_by_matrix[profile.id])
                writer.writerow(output)
        return feature_count
    finally:
        connection.close()


def build_data_export(export_id: int) -> None:
    export = DataExport.objects.select_related("requested_by").get(id=export_id)
    export.status = DataExport.Status.RUNNING
    export.started_at = timezone.now()
    export.failure_detail = ""
    export.save(update_fields=["status", "started_at", "failure_detail", "updated_at"])
    try:
        profiles, compatibility_key = validate_export_selection([int(value) for value in export.matrix_ids])
        export_root = Path(getattr(settings, "DATA_EXPORT_ROOT", "/exports")).resolve()
        export_root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=export_root) as temporary_directory:
            temporary_root = Path(temporary_directory)
            feature_count = _stage_and_write_counts(temporary_root, profiles)
            _write_supporting_files(temporary_root, profiles, export)
            filename = f"tgx-data-export-{export.id}.zip"
            pending = temporary_root / filename
            with ZipFile(pending, "w", compression=ZIP_DEFLATED) as archive:
                for name in ["counts.tsv.gz", "sample_metadata.tsv", "studies.tsv", "resources.json", "selection.json", "README.txt"]:
                    archive.write(temporary_root / name, arcname=name)
            destination = export_root / filename
            shutil.move(str(pending), destination)
        export.status = DataExport.Status.COMPLETED
        export.compatibility_key = compatibility_key
        export.source_checksums = {str(profile.id): profile.resource.checksum for profile in profiles}
        export.output_path = str(destination)
        export.output_filename = filename
        export.output_size_bytes = destination.stat().st_size
        export.output_checksum = sha256_file(destination)
        export.feature_count = feature_count
        export.finished_at = timezone.now()
        export.expires_at = timezone.now() + timedelta(days=7)
        export.save()
    except (DataExportError, MatrixDataError, OSError, sqlite3.Error, ValueError) as exc:
        export.status = DataExport.Status.FAILED
        export.failure_detail = str(exc)
        export.finished_at = timezone.now()
        export.save(update_fields=["status", "failure_detail", "finished_at", "updated_at"])
        raise
