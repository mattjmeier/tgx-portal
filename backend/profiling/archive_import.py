from __future__ import annotations

import csv
import gzip
import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

import yaml
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from core.models import (
    Project,
    Sample,
    SequencingRun,
    Study,
    StudyConfig,
    StudyMetadataMapping,
    StudyOnboardingState,
    default_study_config,
)
from core.services import normalize_spreadsheet_boolean, validate_sample_payload

from .matrix_io import upsert_count_matrix_profile
from .models import (
    ImportBatch,
    ProfilingPlatform,
    ResourceLineage,
    SequencingFile,
    SequencingLibrary,
    StudyDataResource,
    StudyWarehouseMetadata,
)

ARCHIVE_IMPORT_TOOL_VERSION = "1.0"
CONVENTIONAL_ARTIFACTS = {
    "metadata": ("metadata.tsv", "metadata.csv"),
    "contrasts": ("contrasts.tsv", "contrasts.txt", "contrasts.csv"),
    "config": ("config.yaml", "config.yml"),
    "counts": ("counts.tsv.gz", "counts.tsv", "counts.csv.gz", "counts.csv"),
    "fastq_manifest": ("fastq-manifest.tsv",),
}
RESOURCE_TYPES = {
    "metadata": StudyDataResource.ResourceType.METADATA,
    "contrasts": StudyDataResource.ResourceType.MANIFEST,
    "config": StudyDataResource.ResourceType.SUPPORTING,
    "counts": StudyDataResource.ResourceType.FEATURE,
    "fastq_manifest": StudyDataResource.ResourceType.MANIFEST,
    "publication": StudyDataResource.ResourceType.PUBLICATION,
    "supporting": StudyDataResource.ResourceType.SUPPORTING,
    "other": StudyDataResource.ResourceType.OTHER,
}
BOOLEAN_SAMPLE_FIELDS = {"technical_control", "reference_rna", "solvent_control"}
CORE_SAMPLE_FIELDS = {
    "sample_ID",
    "sample_name",
    "description",
    "technical_control",
    "reference_rna",
    "solvent_control",
}


class ArchiveImportError(ValueError):
    pass


class CollaborationManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    pi_name: str = Field(min_length=1, max_length=255)
    researcher_name: str = Field(min_length=1, max_length=255)
    bioinformatician_assigned: str = Field(min_length=1, max_length=255)
    description: str = ""


class StudyManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    study_type: Literal["unknown", "HTTr", "HTPP", "TGx"] = "unknown"
    species: Literal["", "human", "mouse", "rat", "hamster"] = ""
    celltype: str = ""
    in_vitro: bool | None = None
    platform: str | None = None


class MetadataMappingManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_column: str = Field(min_length=1)
    target_field: str = Field(min_length=1)
    transforms: list[
        Literal["trim", "lowercase", "uppercase", "replace_whitespace_with_underscore"]
    ] = Field(default_factory=lambda: ["trim"])


class CountMatrixManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value_type: Literal["raw_counts", "normalized_counts", "abundance", "other"]
    feature_id_kind: str = Field(min_length=1, max_length=100)
    annotation_source: str = Field(min_length=1, max_length=255)
    annotation_version: str = Field(min_length=1, max_length=100)


class ArtifactManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=255)
    role: Literal[
        "metadata",
        "contrasts",
        "config",
        "counts",
        "fastq_manifest",
        "publication",
        "supporting",
        "other",
    ]
    path: str = Field(min_length=1)
    checksum_algorithm: Literal["md5", "sha256"] | None = None
    checksum: str | None = None
    description: str = ""
    version: str = ""
    input_resource_keys: list[str] = Field(default_factory=list)
    sample_column_map: dict[str, str | list[str]] = Field(default_factory=dict)
    matrix: CountMatrixManifest | None = None

    @field_validator("checksum")
    @classmethod
    def normalize_checksum(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else None


class StudyImportManifestV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1, 2]
    study_key: str = Field(min_length=1, max_length=255)
    curation_status: Literal["inventory", "metadata_curated", "lineage_curated"] = "inventory"
    lineage_status: Literal["unknown", "partial", "complete"] = "unknown"
    collaboration: CollaborationManifest
    study: StudyManifest
    artifacts: list[ArtifactManifest] = Field(default_factory=list)
    metadata_mappings: list[MetadataMappingManifest] = Field(default_factory=list)
    notes: str = ""

    @field_validator("artifacts")
    @classmethod
    def ensure_unique_artifact_keys(cls, artifacts: list[ArtifactManifest]) -> list[ArtifactManifest]:
        keys = [artifact.key for artifact in artifacts]
        if len(keys) != len(set(keys)):
            raise ValueError("Artifact keys must be unique within a study manifest.")
        return artifacts

    @field_validator("metadata_mappings")
    @classmethod
    def ensure_unique_metadata_mappings(
        cls,
        mappings: list[MetadataMappingManifest],
    ) -> list[MetadataMappingManifest]:
        sources = [mapping.source_column for mapping in mappings]
        targets = [mapping.target_field for mapping in mappings]
        if len(sources) != len(set(sources)):
            raise ValueError("Metadata mapping source columns must be unique.")
        if len(targets) != len(set(targets)):
            raise ValueError("Metadata mapping target fields must be unique.")
        return mappings

    @model_validator(mode="after")
    def require_v2_count_metadata(self):
        if self.schema_version == 2:
            missing = [artifact.key for artifact in self.artifacts if artifact.role == "counts" and artifact.matrix is None]
            if missing:
                raise ValueError(f"Schema v2 count artifacts require matrix metadata: {', '.join(missing)}")
        return self


@dataclass(frozen=True)
class ResolvedArtifact:
    manifest: ArtifactManifest
    path: Path
    uri: str
    size_bytes: int
    checksum_algorithm: str
    checksum: str


@dataclass(frozen=True)
class ManifestInspection:
    manifest_path: Path
    manifest: StudyImportManifestV1
    artifacts: tuple[ResolvedArtifact, ...]
    source_digest: str
    valid: bool
    warnings: tuple[str, ...] = ()
    missing_artifacts: tuple[str, ...] = ()


@dataclass(frozen=True)
class ArchiveImportResult:
    study_key: str
    outcome: Literal["completed", "no_changes", "failed"]
    import_batch_id: int | None
    created: int = 0
    updated: int = 0
    stale: dict[str, list[str]] = field(default_factory=dict)
    warnings: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "study_key": self.study_key,
            "outcome": self.outcome,
            "import_batch_id": self.import_batch_id,
            "created": self.created,
            "updated": self.updated,
            "stale": self.stale,
            "warnings": list(self.warnings),
        }


def _archive_root() -> Path:
    root = Path(getattr(settings, "STUDY_ARCHIVE_ROOT", "/data"))
    return root.resolve()


def _ensure_within_archive(path: Path, *, must_exist: bool = True) -> Path:
    resolved = path.resolve(strict=False)
    try:
        resolved.relative_to(_archive_root())
    except ValueError as exc:
        raise ArchiveImportError(
            f"Archive path resolves outside the configured archive root: {path}"
        ) from exc
    if must_exist and not resolved.exists():
        raise ArchiveImportError(f"Archive path does not exist: {path}")
    return resolved


def _resolve_artifact_path(manifest_path: Path, artifact_path: str) -> Path:
    candidate = Path(artifact_path)
    if not candidate.is_absolute():
        beside_descriptor = manifest_path.parent / candidate
        candidate = (
            beside_descriptor
            if beside_descriptor.exists()
            else _archive_root() / candidate
        )
    return _ensure_within_archive(candidate)


def _resolve_data_path(data_path: str) -> Path:
    candidate = Path(data_path)
    if not candidate.is_absolute():
        candidate = _archive_root() / candidate
    return _ensure_within_archive(candidate)


def _data_uri(path: Path) -> str:
    relative = path.relative_to(_archive_root())
    return f"data://{relative.as_posix()}"


def _hash_file(path: Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_manifest(path: Path) -> StudyImportManifestV1:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ArchiveImportError(f"Could not read study manifest {path}: {exc}") from exc
    try:
        return StudyImportManifestV1.model_validate(raw)
    except ValidationError as exc:
        raise ArchiveImportError(f"Invalid study manifest {path}: {exc}") from exc


def _with_conventional_artifacts(
    manifest: StudyImportManifestV1,
    manifest_path: Path,
) -> StudyImportManifestV1:
    discovered = list(manifest.artifacts)
    declared_roles = {artifact.role for artifact in discovered}
    declared_keys = {artifact.key for artifact in discovered}
    for role, candidates in CONVENTIONAL_ARTIFACTS.items():
        if role in declared_roles:
            continue
        for filename in candidates:
            if (manifest_path.parent / filename).is_file():
                resource_key = f"study-{role}"
                if resource_key in declared_keys:
                    resource_key = f"auto-{role}"
                discovered.append(
                    ArtifactManifest(key=resource_key, role=role, path=filename)
                )
                break
    return manifest.model_copy(update={"artifacts": discovered})


def inspect_study_manifest(path: str | Path) -> ManifestInspection:
    manifest_path = _ensure_within_archive(Path(path))
    if manifest_path.name != "portal-study.yaml":
        raise ArchiveImportError("Study descriptors must be named portal-study.yaml.")
    manifest = _with_conventional_artifacts(_load_manifest(manifest_path), manifest_path)
    resolved_artifacts: list[ResolvedArtifact] = []
    warnings: list[str] = []
    roles: set[str] = set()
    digest_payload: list[dict[str, Any]] = []

    for artifact in manifest.artifacts:
        artifact_path = _resolve_artifact_path(manifest_path, artifact.path)
        if not artifact_path.is_file():
            raise ArchiveImportError(
                f"Archive artifact is not a file: {artifact.path}"
            )
        algorithm = artifact.checksum_algorithm or "sha256"
        checksum = artifact.checksum or _hash_file(artifact_path, algorithm)
        if artifact.checksum and _hash_file(artifact_path, algorithm) != artifact.checksum:
            raise ArchiveImportError(
                f"Checksum mismatch for artifact {artifact.key}: {artifact.path}"
            )
        resolved = ResolvedArtifact(
            manifest=artifact,
            path=artifact_path,
            uri=_data_uri(artifact_path),
            size_bytes=artifact_path.stat().st_size,
            checksum_algorithm=algorithm,
            checksum=checksum,
        )
        resolved_artifacts.append(resolved)
        roles.add(artifact.role)
        digest_payload.append(
            {
                "key": artifact.key,
                "uri": resolved.uri,
                "size_bytes": resolved.size_bytes,
                "checksum_algorithm": algorithm,
                "checksum": checksum,
            }
        )

    missing = tuple(role for role in CONVENTIONAL_ARTIFACTS if role not in roles)
    if manifest.curation_status != "inventory" and "metadata" not in roles:
        raise ArchiveImportError(
            f"{manifest.curation_status} studies require a metadata artifact."
        )
    if manifest.curation_status == "lineage_curated" and "fastq_manifest" not in roles:
        warnings.append("Lineage is marked curated but no FASTQ manifest is present.")

    canonical_payload = {
        "manifest": manifest.model_dump(mode="json"),
        "artifacts": sorted(digest_payload, key=lambda item: item["key"]),
    }
    source_digest = hashlib.sha256(
        json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    fastq_artifact = next(
        (
            artifact
            for artifact in resolved_artifacts
            if artifact.manifest.role == "fastq_manifest"
        ),
        None,
    )
    if fastq_artifact is not None:
        _, rows = _read_delimited_rows(fastq_artifact.path)
        seen_file_keys: set[str] = set()
        for row_number, row in enumerate(rows, start=2):
            file_key = str(row.get("file_key") or "").strip()
            raw_path = str(row.get("path") or "").strip()
            if not file_key or not raw_path:
                raise ArchiveImportError(
                    f"FASTQ manifest row {row_number} requires file_key and path."
                )
            if file_key in seen_file_keys:
                raise ArchiveImportError(
                    f"FASTQ manifest contains duplicate file_key: {file_key}"
                )
            seen_file_keys.add(file_key)
            resolved_path = _resolve_data_path(raw_path)
            if not resolved_path.is_file():
                raise ArchiveImportError(f"FASTQ path is not a file: {raw_path}")
            declared_size = str(row.get("size_bytes") or "").strip()
            if declared_size:
                try:
                    size_bytes = int(declared_size)
                except ValueError as exc:
                    raise ArchiveImportError(
                        f"FASTQ {file_key} size_bytes must be an integer."
                    ) from exc
                if size_bytes != resolved_path.stat().st_size:
                    raise ArchiveImportError(f"Size mismatch for FASTQ {file_key}.")
            algorithm = str(row.get("checksum_algorithm") or "").strip().lower()
            checksum = str(row.get("checksum") or "").strip().lower()
            if checksum and algorithm not in {"md5", "sha256"}:
                raise ArchiveImportError(
                    f"FASTQ {file_key} checksum_algorithm must be md5 or sha256."
                )
            if checksum and _hash_file(resolved_path, algorithm) != checksum:
                raise ArchiveImportError(f"Checksum mismatch for FASTQ {file_key}.")
    return ManifestInspection(
        manifest_path=manifest_path,
        manifest=manifest,
        artifacts=tuple(resolved_artifacts),
        source_digest=source_digest,
        valid=True,
        warnings=tuple(warnings),
        missing_artifacts=missing,
    )


def _detect_delimiter(path: Path) -> str:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(8192)
    try:
        return csv.Sniffer().sniff(sample, delimiters=",\t").delimiter
    except csv.Error:
        return "\t" if "\t" in sample else ","


def _read_delimited_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=_detect_delimiter(path))
        columns = [str(column).strip() for column in (reader.fieldnames or [])]
        rows = [
            {
                str(key).strip(): "" if value is None else str(value)
                for key, value in row.items()
                if key is not None and str(key).strip()
            }
            for row in reader
            if any(str(value or "").strip() for value in row.values())
        ]
    return columns, rows


def _read_delimited_header(path: Path) -> list[str]:
    """Read only the first record so count matrices never enter application memory."""
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter=_detect_delimiter(path))
        try:
            return [str(column).strip() for column in next(reader)]
        except StopIteration as exc:
            raise ArchiveImportError(f"Delimited artifact is empty: {path}") from exc


def _transform(value: Any, transforms: list[str]) -> Any:
    current = "" if value is None else str(value)
    for transform in transforms:
        if transform == "trim":
            current = current.strip()
        elif transform == "lowercase":
            current = current.lower()
        elif transform == "uppercase":
            current = current.upper()
        elif transform == "replace_whitespace_with_underscore":
            current = "_".join(current.split())
    return current


def _metadata_rows(
    inspection: ManifestInspection,
) -> tuple[list[dict[str, Any]], ResolvedArtifact | None]:
    metadata_artifact = next(
        (artifact for artifact in inspection.artifacts if artifact.manifest.role == "metadata"),
        None,
    )
    if metadata_artifact is None:
        return [], None
    columns, rows = _read_delimited_rows(metadata_artifact.path)
    mappings = inspection.manifest.metadata_mappings or [
        MetadataMappingManifest(source_column=column, target_field=column)
        for column in columns
    ]
    normalized_rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for row_number, row in enumerate(rows, start=2):
        normalized: dict[str, Any] = {}
        for mapping in mappings:
            if mapping.source_column not in row:
                raise ArchiveImportError(
                    f"Metadata mapping source column is missing: {mapping.source_column}"
                )
            value = _transform(row[mapping.source_column], list(mapping.transforms))
            if mapping.target_field in BOOLEAN_SAMPLE_FIELDS:
                value = normalize_spreadsheet_boolean(value)
                if not isinstance(value, bool):
                    raise ArchiveImportError(
                        f"Metadata row {row_number} field {mapping.target_field} is not a boolean."
                    )
            normalized[mapping.target_field] = value
        sample_id = str(normalized.get("sample_ID") or "").strip()
        if not sample_id:
            raise ArchiveImportError(f"Metadata row {row_number} is missing sample_ID.")
        if sample_id in seen_ids:
            raise ArchiveImportError(f"Metadata contains duplicate sample_ID: {sample_id}")
        seen_ids.add(sample_id)
        normalized_rows.append(normalized)
    return normalized_rows, metadata_artifact


def _validate_count_headers(
    inspection: ManifestInspection,
    sample_ids: set[str],
) -> list[str]:
    warnings: list[str] = []
    for artifact in inspection.artifacts:
        if artifact.manifest.role != "counts":
            continue
        columns = _read_delimited_header(artifact.path)
        if len(columns) < 2:
            raise ArchiveImportError(
                f"Count resource {artifact.manifest.key} must contain a feature column "
                "and at least one sample column."
            )
        if any(not column for column in columns) or len(columns) != len(set(columns)):
            raise ArchiveImportError(
                f"Count resource {artifact.manifest.key} has blank or duplicate header columns."
            )
        mapping = artifact.manifest.sample_column_map
        missing_mapping_columns = sorted(set(mapping) - set(columns[1:]))
        if missing_mapping_columns:
            raise ArchiveImportError(
                f"Count resource {artifact.manifest.key} maps columns not present in its "
                f"header: {', '.join(missing_mapping_columns)}"
            )
        if not sample_ids:
            warnings.append(
                f"Count resource {artifact.manifest.key} sample columns could not be "
                "validated because the study has no curated metadata."
            )
            continue
        unknown: list[str] = []
        for column in columns[1:]:
            target = mapping.get(column, column)
            targets = target if isinstance(target, list) else [target]
            if not targets or any(str(sample_id).strip() not in sample_ids for sample_id in targets):
                unknown.append(column)
        if unknown:
            raise ArchiveImportError(
                f"Count resource {artifact.manifest.key} has unknown sample columns: "
                f"{', '.join(unknown)}"
            )
    return warnings


def _changed_fields(instance: Any, defaults: dict[str, Any]) -> list[str]:
    changed = []
    for field_name, value in defaults.items():
        if getattr(instance, field_name) != value:
            setattr(instance, field_name, value)
            changed.append(field_name)
    if changed:
        instance.save(update_fields=[*changed, "updated_at"] if hasattr(instance, "updated_at") else changed)
    return changed


def _upsert_resource(
    *,
    warehouse: StudyWarehouseMetadata,
    resource_key: str,
    resource_type: str,
    display_name: str,
    uri: str,
    file_format: str,
    checksum_algorithm: str,
    checksum: str,
    size_bytes: int,
    description: str = "",
    version: str = "",
    ext: dict[str, Any] | None = None,
) -> tuple[StudyDataResource, bool, bool]:
    resource = StudyDataResource.objects.filter(
        study_metadata=warehouse,
        resource_key=resource_key,
    ).first()
    if resource is None:
        resource = StudyDataResource.objects.filter(
            study_metadata=warehouse,
            uri=uri,
        ).first()
    defaults = {
        "study_metadata": warehouse,
        "resource_key": resource_key,
        "resource_type": resource_type,
        "storage_kind": StudyDataResource.StorageKind.NETWORK_PATH,
        "display_name": display_name,
        "uri": uri,
        "description": description,
        "file_format": file_format,
        "checksum_algorithm": checksum_algorithm,
        "checksum": checksum,
        "size_bytes": size_bytes,
        "version": version,
        "availability_status": StudyDataResource.AvailabilityStatus.AVAILABLE,
        "ext": ext or {},
    }
    if resource is None:
        return StudyDataResource.objects.create(**defaults), True, False
    changed = bool(_changed_fields(resource, defaults))
    return resource, False, changed


def _upsert_fastq_rows(
    *,
    inspection: ManifestInspection,
    warehouse: StudyWarehouseMetadata,
    samples_by_id: dict[str, Sample],
) -> tuple[int, int, list[str], list[str]]:
    fastq_artifact = next(
        (artifact for artifact in inspection.artifacts if artifact.manifest.role == "fastq_manifest"),
        None,
    )
    if fastq_artifact is None:
        return 0, 0, [], []
    _, rows = _read_delimited_rows(fastq_artifact.path)
    created = 0
    updated = 0
    declared_file_keys: list[str] = []
    warnings: list[str] = []
    seen_file_keys: set[str] = set()
    for row_number, row in enumerate(rows, start=2):
        file_key = str(row.get("file_key") or "").strip()
        raw_path = str(row.get("path") or "").strip()
        if not file_key or not raw_path:
            raise ArchiveImportError(
                f"FASTQ manifest row {row_number} requires file_key and path."
            )
        if file_key in seen_file_keys:
            raise ArchiveImportError(f"FASTQ manifest contains duplicate file_key: {file_key}")
        seen_file_keys.add(file_key)
        declared_file_keys.append(file_key)
        resolved_path = _resolve_data_path(raw_path)
        algorithm = str(row.get("checksum_algorithm") or "").strip().lower()
        checksum = str(row.get("checksum") or "").strip().lower()
        if checksum and algorithm in {"md5", "sha256"}:
            if _hash_file(resolved_path, algorithm) != checksum:
                raise ArchiveImportError(f"Checksum mismatch for FASTQ {file_key}.")
        if not checksum:
            algorithm = ""
        sample_id = str(row.get("sample_ID") or "").strip()
        sample = samples_by_id.get(sample_id) if sample_id else None
        if sample_id and sample is None:
            warnings.append(f"FASTQ {file_key} references unknown sample_ID {sample_id}.")
        library = None
        library_key = str(row.get("library_key") or "").strip()
        if library_key and sample is not None:
            library, library_created = SequencingLibrary.objects.update_or_create(
                sample=sample,
                library_key=library_key,
                defaults={},
            )
            created += int(library_created)
        run = None
        run_id = str(row.get("run_id") or "").strip()
        if run_id:
            run, run_created = SequencingRun.objects.update_or_create(
                run_id=run_id,
                defaults={
                    "flowcell_id": str(row.get("flowcell_id") or "").strip(),
                    "instrument_name": str(row.get("instrument_name") or "").strip(),
                    "date_run": _parse_optional_date(row.get("date_run")),
                    "raw_data_path": "",
                },
            )
            created += int(run_created)
        resource, resource_created, resource_updated = _upsert_resource(
            warehouse=warehouse,
            resource_key=file_key,
            resource_type=StudyDataResource.ResourceType.RAW,
            display_name=resolved_path.name,
            uri=_data_uri(resolved_path),
            file_format="fastq.gz" if resolved_path.name.endswith(".fastq.gz") else resolved_path.suffix.lstrip("."),
            checksum_algorithm=algorithm,
            checksum=checksum,
            size_bytes=resolved_path.stat().st_size,
            ext={"source": "fastq_manifest"},
        )
        created += int(resource_created)
        updated += int(resource_updated)
        file_defaults = {
            "sample": sample,
            "library": library,
            "sequencing_run": run,
            "lane": str(row.get("lane") or "").strip(),
            "read_role": str(row.get("read_role") or "").strip()
            or SequencingFile.ReadRole.UNKNOWN,
            "chunk": str(row.get("chunk") or "").strip(),
            "mapping_evidence": str(row.get("evidence") or "").strip()
            or SequencingFile.MappingEvidence.UNKNOWN,
            "notes": str(row.get("notes") or "").strip(),
        }
        sequencing_file = SequencingFile.objects.filter(resource=resource).first()
        if sequencing_file is None:
            sequencing_file = SequencingFile.objects.create(
                resource=resource,
                **file_defaults,
            )
            created += 1
        else:
            updated += int(bool(_changed_fields(sequencing_file, file_defaults)))
        if sequencing_file.library_id and sequencing_file.sequencing_run_id:
            assays = sequencing_file.library.assay
            if assays is not None:
                assays.sequencing_runs.add(sequencing_file.sequencing_run)
    return created, updated, declared_file_keys, warnings


def _parse_optional_date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ArchiveImportError(f"Sequencing date must use YYYY-MM-DD: {text}") from exc


def diff_study_manifest(path: str | Path) -> dict[str, Any]:
    """Validate a descriptor and report its canonical impact without writing."""
    inspection = inspect_study_manifest(path)
    metadata_rows, _ = _metadata_rows(inspection)
    warnings = [
        *inspection.warnings,
        *_validate_count_headers(
            inspection,
            {str(row["sample_ID"]) for row in metadata_rows},
        ),
    ]
    warehouse = StudyWarehouseMetadata.objects.select_related(
        "study",
        "study__project",
    ).filter(study_name=inspection.manifest.study_key).first()
    previous = (
        ImportBatch.objects.filter(
            study_metadata=warehouse,
            source_system="archive-manifest",
            status__in=[ImportBatch.Status.COMPLETED, ImportBatch.Status.NO_CHANGES],
        )
        .order_by("-created_at", "-id")
        .first()
        if warehouse is not None
        else None
    )
    outcome = (
        "no_changes"
        if previous and previous.source_digest == inspection.source_digest
        else "changes"
    )
    declared_samples = {str(row["sample_ID"]) for row in metadata_rows}
    existing_samples = (
        set(
            Sample.objects.filter(study=warehouse.study).values_list(
                "sample_ID",
                flat=True,
            )
        )
        if warehouse is not None
        else set()
    )
    declared_resources = {
        artifact.manifest.key for artifact in inspection.artifacts
    }
    fastq_artifact = next(
        (
            artifact
            for artifact in inspection.artifacts
            if artifact.manifest.role == "fastq_manifest"
        ),
        None,
    )
    if fastq_artifact is not None:
        _, fastq_rows = _read_delimited_rows(fastq_artifact.path)
        declared_resources.update(
            str(row.get("file_key") or "").strip()
            for row in fastq_rows
            if str(row.get("file_key") or "").strip()
        )
    existing_resources = (
        set(
            StudyDataResource.objects.filter(study_metadata=warehouse).values_list(
                "resource_key",
                flat=True,
            )
        )
        if warehouse is not None
        else set()
    )
    return {
        "study_key": inspection.manifest.study_key,
        "outcome": outcome,
        "source_digest": inspection.source_digest,
        "curation_status": inspection.manifest.curation_status,
        "artifact_count": len(inspection.artifacts),
        "created": {
            "study": [] if warehouse else [inspection.manifest.study_key],
            "samples": sorted(declared_samples - existing_samples),
            "resources": sorted(declared_resources - existing_resources),
        },
        "updated": {
            "study": [inspection.manifest.study_key]
            if warehouse is not None and outcome == "changes"
            else [],
            "samples": sorted(declared_samples & existing_samples)
            if outcome == "changes"
            else [],
            "resources": sorted(declared_resources & existing_resources)
            if outcome == "changes"
            else [],
        },
        "stale": {
            "samples": sorted(existing_samples - declared_samples)
            if metadata_rows
            else [],
            "resources": sorted(existing_resources - declared_resources),
        },
        "missing_artifacts": list(inspection.missing_artifacts),
        "warnings": warnings,
    }


def apply_study_manifest(
    path: str | Path,
    *,
    initiated_by=None,
) -> ArchiveImportResult:
    try:
        inspection = inspect_study_manifest(path)
    except ArchiveImportError as exc:
        requested_path = Path(path)
        source_name = requested_path.parent.name or requested_path.stem or "unknown-study"
        ImportBatch.objects.create(
            source_system="archive-manifest",
            source_name=source_name,
            source_directory=str(requested_path.parent),
            initiated_by=initiated_by,
            status=ImportBatch.Status.FAILED,
            started_at=timezone.now(),
            finished_at=timezone.now(),
            records_rejected=1,
            notes=str(exc),
        )
        raise
    manifest = inspection.manifest
    warehouse = StudyWarehouseMetadata.objects.select_related("study").filter(
        study_name=manifest.study_key
    ).first()
    previous = (
        ImportBatch.objects.filter(
            study_metadata=warehouse,
            source_system="archive-manifest",
        )
        .order_by("-created_at", "-id")
        .first()
        if warehouse is not None
        else None
    )
    batch = ImportBatch.objects.create(
        study_metadata=warehouse,
        source_system="archive-manifest",
        source_name=manifest.study_key,
        source_directory=str(inspection.manifest_path.parent),
        source_digest=inspection.source_digest,
        manifest_schema_version=manifest.schema_version,
        tool_version=ARCHIVE_IMPORT_TOOL_VERSION,
        applied_manifest=manifest.model_dump(mode="json"),
        previous_import=previous,
        initiated_by=initiated_by,
        status=ImportBatch.Status.RUNNING,
        started_at=timezone.now(),
    )
    if previous and previous.source_digest == inspection.source_digest and previous.status in {
        ImportBatch.Status.COMPLETED,
        ImportBatch.Status.NO_CHANGES,
    }:
        batch.status = ImportBatch.Status.NO_CHANGES
        batch.finished_at = timezone.now()
        batch.diff_summary = {"created": 0, "updated": 0, "stale": {}}
        batch.save(update_fields=["status", "finished_at", "diff_summary", "updated_at"])
        return ArchiveImportResult(
            study_key=manifest.study_key,
            outcome="no_changes",
            import_batch_id=batch.id,
            warnings=inspection.warnings,
        )

    created = 0
    updated = 0
    warnings = list(inspection.warnings)
    stale: dict[str, list[str]] = {}
    try:
        metadata_rows, _ = _metadata_rows(inspection)
        warnings.extend(
            _validate_count_headers(
                inspection,
                {str(row["sample_ID"]) for row in metadata_rows},
            )
        )
        with transaction.atomic():
            project_defaults = {
                "title": manifest.collaboration.title,
                "pi_name": manifest.collaboration.pi_name,
                "researcher_name": manifest.collaboration.researcher_name,
                "bioinformatician_assigned": manifest.collaboration.bioinformatician_assigned,
                "description": manifest.collaboration.description,
            }
            project = Project.objects.filter(
                collaboration_key=manifest.collaboration.key,
            ).first()
            if project is None:
                project = Project.objects.create(
                    collaboration_key=manifest.collaboration.key,
                    **project_defaults,
                )
                created += 1
            else:
                updated += int(bool(_changed_fields(project, project_defaults)))

            if warehouse is not None:
                study = Study.objects.select_for_update().get(pk=warehouse.study_id)
                study_changes = _changed_fields(
                    study,
                    {
                        "project": project,
                        "title": manifest.study.title,
                        "description": manifest.study.description,
                        "species": manifest.study.species,
                        "celltype": manifest.study.celltype,
                    },
                )
                updated += int(bool(study_changes))
            else:
                study = Study.objects.filter(
                    project=project,
                    title=manifest.study.title,
                ).first()
                if study is None:
                    study = Study.objects.create(
                        project=project,
                        title=manifest.study.title,
                        description=manifest.study.description,
                        species=manifest.study.species,
                        celltype=manifest.study.celltype,
                    )
                    created += 1
                else:
                    updated += int(
                        bool(
                            _changed_fields(
                                study,
                                {
                                    "description": manifest.study.description,
                                    "species": manifest.study.species,
                                    "celltype": manifest.study.celltype,
                                },
                            )
                        )
                    )
            StudyConfig.objects.get_or_create(study=study, defaults=default_study_config())
            mapping, _ = StudyMetadataMapping.objects.get_or_create(study=study)
            onboarding, _ = StudyOnboardingState.objects.get_or_create(study=study)

            platform = None
            if manifest.study.platform:
                platform = ProfilingPlatform.objects.filter(
                    platform_name=manifest.study.platform
                ).first()
                if platform is None:
                    raise ArchiveImportError(
                        f"Profiling platform does not exist: {manifest.study.platform}"
                    )
            if warehouse is None:
                warehouse = StudyWarehouseMetadata.objects.create(
                    study=study,
                    study_name=manifest.study_key,
                    source="archive-manifest",
                    study_type=manifest.study.study_type,
                    in_vitro=manifest.study.in_vitro,
                    platform=platform,
                    curation_status=manifest.curation_status,
                    lineage_status=manifest.lineage_status,
                    ext={"import_notes": manifest.notes},
                )
                created += 1
            else:
                updated += int(
                    bool(
                        _changed_fields(
                            warehouse,
                            {
                                "source": "archive-manifest",
                                "study_type": manifest.study.study_type,
                                "in_vitro": manifest.study.in_vitro,
                                "platform": platform,
                                "curation_status": manifest.curation_status,
                                "lineage_status": manifest.lineage_status,
                                "ext": {
                                    **(warehouse.ext or {}),
                                    "import_notes": manifest.notes,
                                },
                            },
                        )
                    )
                )

            declared_sample_ids: set[str] = set()
            samples_by_id: dict[str, Sample] = {}
            for row in metadata_rows:
                sample_id = str(row["sample_ID"])
                declared_sample_ids.add(sample_id)
                metadata = {
                    key: value
                    for key, value in row.items()
                    if key not in CORE_SAMPLE_FIELDS
                }
                validated = validate_sample_payload(
                    {
                        "study": study.id,
                        "sample_ID": sample_id,
                        "sample_name": str(row.get("sample_name") or ""),
                        "description": str(row.get("description") or ""),
                        "technical_control": bool(row.get("technical_control") or False),
                        "reference_rna": bool(row.get("reference_rna") or False),
                        "solvent_control": bool(row.get("solvent_control") or False),
                        "metadata": {},
                    }
                )
                sample_defaults = {
                    "sample_name": validated["sample_name"],
                    "description": validated["description"],
                    "technical_control": validated["technical_control"],
                    "reference_rna": validated["reference_rna"],
                    "solvent_control": validated["solvent_control"],
                    "metadata": metadata,
                }
                sample = Sample.objects.filter(
                    study=study,
                    sample_ID=sample_id,
                ).first()
                if sample is None:
                    sample = Sample.objects.create(
                        study=study,
                        sample_ID=sample_id,
                        **sample_defaults,
                    )
                    created += 1
                else:
                    updated += int(bool(_changed_fields(sample, sample_defaults)))
                samples_by_id[sample_id] = sample
            if metadata_rows:
                existing_sample_ids = set(
                    Sample.objects.filter(study=study).values_list("sample_ID", flat=True)
                )
                stale["samples"] = sorted(existing_sample_ids - declared_sample_ids)
                treatment_field = "group" if any("group" in row for row in metadata_rows) else ""
                mapping.treatment_level_1 = treatment_field
                mapping.save(update_fields=["treatment_level_1"])
                onboarding.metadata_columns = sorted(
                    {key for row in metadata_rows for key in row}
                )
                onboarding.validated_rows = metadata_rows
                onboarding.save(update_fields=["metadata_columns", "validated_rows", "updated_at"])
                if study.treatment_var != treatment_field:
                    study.treatment_var = treatment_field
                    study.save(update_fields=["treatment_var", "updated_at"])
            else:
                samples_by_id = {
                    sample.sample_ID: sample
                    for sample in Sample.objects.filter(study=study)
                }

            declared_resource_keys: set[str] = set()
            resources_by_key: dict[str, StudyDataResource] = {}
            for artifact in inspection.artifacts:
                declared_resource_keys.add(artifact.manifest.key)
                resource, resource_created, resource_updated = _upsert_resource(
                    warehouse=warehouse,
                    resource_key=artifact.manifest.key,
                    resource_type=RESOURCE_TYPES[artifact.manifest.role],
                    display_name=artifact.path.name,
                    uri=artifact.uri,
                    file_format="".join(artifact.path.suffixes).lstrip("."),
                    checksum_algorithm=artifact.checksum_algorithm,
                    checksum=artifact.checksum,
                    size_bytes=artifact.size_bytes,
                    description=artifact.manifest.description,
                    version=artifact.manifest.version,
                    ext={
                        "artifact_role": artifact.manifest.role,
                        "input_resource_keys": artifact.manifest.input_resource_keys,
                    },
                )
                resources_by_key[artifact.manifest.key] = resource
                created += int(resource_created)
                updated += int(resource_updated)
                if artifact.manifest.role == "counts":
                    matrix_metadata = artifact.manifest.matrix
                    profile = upsert_count_matrix_profile(
                        resource=resource,
                        value_type=matrix_metadata.value_type if matrix_metadata else "other",
                        feature_id_kind=matrix_metadata.feature_id_kind if matrix_metadata else "",
                        annotation_source=matrix_metadata.annotation_source if matrix_metadata else "",
                        annotation_version=matrix_metadata.annotation_version if matrix_metadata else "",
                        sample_column_map=artifact.manifest.sample_column_map,
                        samples_by_id=samples_by_id,
                        allowed_sample_ids=set(samples_by_id),
                    )
                    if profile.validation_status == profile.ValidationStatus.VALID and warehouse.primary_count_resource_id is None:
                        warehouse.primary_count_resource = resource
                        warehouse.save(update_fields=["primary_count_resource", "updated_at"])
            fastq_created, fastq_updated, fastq_keys, fastq_warnings = _upsert_fastq_rows(
                inspection=inspection,
                warehouse=warehouse,
                samples_by_id=samples_by_id,
            )
            created += fastq_created
            updated += fastq_updated
            warnings.extend(fastq_warnings)
            declared_resource_keys.update(fastq_keys)
            resources_by_key.update(
                {
                    resource.resource_key: resource
                    for resource in StudyDataResource.objects.filter(
                        study_metadata=warehouse,
                        resource_key__in=fastq_keys,
                    )
                }
            )

            declared_lineage: set[tuple[str, str]] = set()
            for artifact in inspection.artifacts:
                child = resources_by_key[artifact.manifest.key]
                for parent_key in artifact.manifest.input_resource_keys:
                    parent = resources_by_key.get(parent_key)
                    if parent is None:
                        warnings.append(
                            f"Resource {artifact.manifest.key} declares unknown input "
                            f"resource {parent_key}; no lineage edge was created."
                        )
                        continue
                    _, lineage_created = ResourceLineage.objects.update_or_create(
                        parent_resource=parent,
                        child_resource=child,
                        defaults={"evidence": ResourceLineage.Evidence.DECLARED},
                    )
                    created += int(lineage_created)
                    declared_lineage.add((parent_key, artifact.manifest.key))
            existing_lineage = {
                (
                    edge.parent_resource.resource_key,
                    edge.child_resource.resource_key,
                )
                for edge in ResourceLineage.objects.filter(
                    child_resource__study_metadata=warehouse,
                ).select_related("parent_resource", "child_resource")
            }
            stale["lineage"] = sorted(
                f"{parent}->{child}"
                for parent, child in existing_lineage - declared_lineage
            )
            stale["resources"] = sorted(
                set(
                    StudyDataResource.objects.filter(
                        study_metadata=warehouse
                    ).values_list("resource_key", flat=True)
                )
                - declared_resource_keys
            )

            batch.study_metadata = warehouse
            batch.status = ImportBatch.Status.COMPLETED
            batch.finished_at = timezone.now()
            batch.records_seen = len(metadata_rows)
            batch.records_created = created
            batch.records_updated = updated
            batch.records_rejected = 0
            batch.diff_summary = {
                "created": created,
                "updated": updated,
                "stale": stale,
                "warnings": warnings,
            }
            batch.save(
                update_fields=[
                    "study_metadata",
                    "status",
                    "finished_at",
                    "records_seen",
                    "records_created",
                    "records_updated",
                    "records_rejected",
                    "diff_summary",
                    "updated_at",
                ]
            )
            ImportBatch.objects.filter(
                study_metadata=warehouse,
                source_system="archive-manifest",
                status__in=[
                    ImportBatch.Status.COMPLETED,
                    ImportBatch.Status.NO_CHANGES,
                ],
            ).exclude(pk=batch.pk).update(status=ImportBatch.Status.SUPERSEDED)
    except Exception as exc:
        batch.status = ImportBatch.Status.FAILED
        batch.finished_at = timezone.now()
        batch.records_rejected = 1
        batch.notes = str(exc)
        batch.save(
            update_fields=[
                "status",
                "finished_at",
                "records_rejected",
                "notes",
                "updated_at",
            ]
        )
        if isinstance(exc, ArchiveImportError):
            raise
        raise ArchiveImportError(f"Archive import failed for {manifest.study_key}: {exc}") from exc

    return ArchiveImportResult(
        study_key=manifest.study_key,
        outcome="completed",
        import_batch_id=batch.id,
        created=created,
        updated=updated,
        stale=stale,
        warnings=tuple(warnings),
    )


def discover_study_manifests(path: str | Path) -> list[Path]:
    candidate = _ensure_within_archive(Path(path))
    if candidate.is_file():
        return [candidate]
    return sorted(candidate.rglob("portal-study.yaml"))
