from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from .models import DatabaseBackup

DATABASE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")


class DatabaseBackupError(RuntimeError):
    pass


def _backup_root() -> Path:
    root = Path(getattr(settings, "DATABASE_BACKUP_ROOT", "/backups")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _database_configuration() -> dict[str, str]:
    config = settings.DATABASES["default"]
    return {
        "name": str(config["NAME"]),
        "user": str(config["USER"]),
        "password": str(config["PASSWORD"]),
        "host": str(config["HOST"]),
        "port": str(config["PORT"]),
    }


def _postgres_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment["PGPASSWORD"] = _database_configuration()["password"]
    return environment


def _connection_arguments(*, database_name: str | None = None) -> list[str]:
    config = _database_configuration()
    return [
        f"--host={config['host']}",
        f"--port={config['port']}",
        f"--username={config['user']}",
        f"--dbname={database_name or config['name']}",
    ]


def _cluster_arguments() -> list[str]:
    config = _database_configuration()
    return [
        f"--host={config['host']}",
        f"--port={config['port']}",
        f"--username={config['user']}",
    ]


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            env=_postgres_environment(),
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        stderr = getattr(exc, "stderr", "") or ""
        raise DatabaseBackupError(
            f"Database backup command failed ({command[0]}): {stderr or exc}"
        ) from exc


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _migration_snapshot() -> list[str]:
    return [
        f"{app}.{name}"
        for app, name in MigrationRecorder.Migration.objects.order_by("app", "name").values_list(
            "app", "name"
        )
    ]


def _sidecar_path(artifact: Path) -> Path:
    return artifact.with_suffix(f"{artifact.suffix}.json")


def _write_sidecar(backup: DatabaseBackup, artifact: Path) -> None:
    payload: dict[str, Any] = {
        "filename": artifact.name,
        "created_at": backup.completed_at.isoformat() if backup.completed_at else None,
        "size_bytes": backup.size_bytes,
        "sha256": backup.sha256,
        "postgres_version": backup.postgres_version,
        "migrations": backup.migration_snapshot,
        "format": "postgres-custom",
        "encrypted": artifact.suffix == ".age",
    }
    _sidecar_path(artifact).write_text(
        json.dumps(payload, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def create_database_backup(
    *,
    initiated_by=None,
    backup: DatabaseBackup | None = None,
) -> DatabaseBackup:
    backup = backup or DatabaseBackup.objects.create(initiated_by=initiated_by)
    backup.status = DatabaseBackup.Status.RUNNING
    backup.started_at = timezone.now()
    backup.error_message = ""
    backup.save(update_fields=["status", "started_at", "error_message"])

    timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    dump_path = _backup_root() / f"tgx_portal_{timestamp}_{backup.pk}.dump"
    try:
        _run(
            [
                "pg_dump",
                "--format=custom",
                "--compress=6",
                "--no-owner",
                "--no-privileges",
                f"--file={dump_path}",
                *_connection_arguments(),
            ]
        )
        artifact = dump_path
        age_recipient = str(
            getattr(settings, "DATABASE_BACKUP_AGE_RECIPIENT", "") or ""
        ).strip()
        if age_recipient:
            encrypted_path = dump_path.with_suffix(".dump.age")
            _run(
                [
                    "age",
                    "--recipient",
                    age_recipient,
                    "--output",
                    str(encrypted_path),
                    str(dump_path),
                ]
            )
            dump_path.unlink()
            artifact = encrypted_path

        backup.path = str(artifact)
        backup.filename = artifact.name
        backup.size_bytes = artifact.stat().st_size
        backup.sha256 = _sha256(artifact)
        backup.postgres_version = str(getattr(connection, "pg_version", ""))
        backup.migration_snapshot = _migration_snapshot()
        backup.status = DatabaseBackup.Status.COMPLETED
        backup.completed_at = timezone.now()
        backup.save(
            update_fields=[
                "path",
                "filename",
                "size_bytes",
                "sha256",
                "postgres_version",
                "migration_snapshot",
                "status",
                "completed_at",
            ]
        )
        _write_sidecar(backup, artifact)
        apply_backup_retention()
        return backup
    except Exception as exc:
        backup.status = DatabaseBackup.Status.FAILED
        backup.error_message = str(exc)
        backup.completed_at = timezone.now()
        backup.save(
            update_fields=["status", "error_message", "completed_at"]
        )
        if isinstance(exc, DatabaseBackupError):
            raise
        raise DatabaseBackupError(f"Database backup failed: {exc}") from exc


def _artifact_for_restore(path: str | Path) -> tuple[Path, Path | None]:
    artifact = Path(path).resolve()
    try:
        artifact.relative_to(_backup_root())
    except ValueError as exc:
        raise DatabaseBackupError("Backup artifact must be inside the configured backup root.") from exc
    if not artifact.is_file():
        raise DatabaseBackupError(f"Backup artifact does not exist: {artifact}")
    if artifact.suffix != ".age":
        return artifact, None
    identity = str(getattr(settings, "DATABASE_BACKUP_AGE_IDENTITY", "") or "").strip()
    if not identity:
        raise DatabaseBackupError("Encrypted backup verification requires DATABASE_BACKUP_AGE_IDENTITY.")
    decrypted = _backup_root() / f".restore-{uuid.uuid4().hex}.dump"
    _run(["age", "--decrypt", "--identity", identity, "--output", str(decrypted), str(artifact)])
    return decrypted, decrypted


def _validate_artifact_checksum(backup: DatabaseBackup, artifact: Path) -> None:
    if backup.sha256 and _sha256(artifact) != backup.sha256:
        raise DatabaseBackupError("Backup artifact checksum does not match its database record.")


def _validate_restore_checksum(artifact: Path) -> None:
    backup = DatabaseBackup.objects.filter(path=str(artifact.resolve())).first()
    if backup is not None:
        _validate_artifact_checksum(backup, artifact)
        return
    sidecar = _sidecar_path(artifact)
    if not sidecar.is_file():
        raise DatabaseBackupError(
            "Backup restore requires a registered artifact or its JSON checksum sidecar."
        )
    try:
        expected = str(
            json.loads(sidecar.read_text(encoding="utf-8")).get("sha256") or ""
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise DatabaseBackupError("Backup checksum sidecar is invalid.") from exc
    if not expected or _sha256(artifact) != expected:
        raise DatabaseBackupError("Backup artifact checksum does not match its sidecar.")


def _restore_to_database(artifact: Path, database_name: str) -> None:
    _run(["createdb", *_cluster_arguments(), database_name])
    _run(
        [
            "pg_restore",
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            f"--dbname={database_name}",
            *_cluster_arguments(),
            str(artifact),
        ]
    )


def _query_scalar(database_name: str, sql: str, *, check_name: str) -> int:
    result = _run(
        [
            "psql",
            *_connection_arguments(database_name=database_name),
            "--tuples-only",
            "--no-align",
            f"--command={sql}",
        ]
    )
    try:
        return int(result.stdout.strip())
    except ValueError as exc:
        raise DatabaseBackupError(
            f"Backup verification returned an invalid result for {check_name}."
        ) from exc


def _verify_restored_catalog(database_name: str) -> None:
    if _query_scalar(
        database_name,
        "SELECT COUNT(*) FROM django_migrations;",
        check_name="Django migrations",
    ) < 1:
        raise DatabaseBackupError("Restored backup has no Django migration history.")

    broken_relationships = _query_scalar(
        database_name,
        """
        SELECT
          (SELECT COUNT(*) FROM core_study s
             LEFT JOIN core_project p ON p.id = s.project_id
             WHERE p.id IS NULL)
          +
          (SELECT COUNT(*) FROM core_sample sa
             LEFT JOIN core_study s ON s.id = sa.study_id
             WHERE s.id IS NULL);
        """,
        check_name="core relationships",
    )
    if broken_relationships:
        raise DatabaseBackupError(
            f"Restored backup contains {broken_relationships} broken core relationships."
        )


def verify_database_backup(path: str | Path) -> DatabaseBackup:
    backup = DatabaseBackup.objects.filter(path=str(Path(path).resolve())).first()
    if backup is None:
        raise DatabaseBackupError("Backup artifact is not registered in the portal.")
    backup.verification_status = DatabaseBackup.VerificationStatus.RUNNING
    backup.error_message = ""
    backup.save(update_fields=["verification_status", "error_message"])

    restore_artifact: Path | None = None
    verification_database = f"tgx_verify_{uuid.uuid4().hex[:20]}"
    try:
        source_artifact = Path(backup.path).resolve()
        _validate_artifact_checksum(backup, source_artifact)
        artifact, restore_artifact = _artifact_for_restore(source_artifact)
        _restore_to_database(artifact, verification_database)
        _verify_restored_catalog(verification_database)
        backup.verification_status = DatabaseBackup.VerificationStatus.PASSED
        backup.verified_at = timezone.now()
        backup.save(update_fields=["verification_status", "verified_at"])
        return backup
    except Exception as exc:
        backup.verification_status = DatabaseBackup.VerificationStatus.FAILED
        backup.error_message = str(exc)
        backup.save(update_fields=["verification_status", "error_message"])
        if isinstance(exc, DatabaseBackupError):
            raise
        raise DatabaseBackupError(f"Backup verification failed: {exc}") from exc
    finally:
        try:
            _run(["dropdb", "--if-exists", *_cluster_arguments(), verification_database])
        finally:
            if restore_artifact is not None:
                restore_artifact.unlink(missing_ok=True)


def restore_database_backup(
    path: str | Path,
    *,
    target_database: str,
    replace_live: bool = False,
    confirmation: str = "",
) -> None:
    if not DATABASE_NAME_PATTERN.fullmatch(target_database):
        raise DatabaseBackupError("Target database name is invalid.")
    current_database = _database_configuration()["name"]
    if target_database == current_database:
        if not replace_live or confirmation != current_database:
            raise DatabaseBackupError(
                "Replacing the live database requires --replace-live and an exact database-name confirmation."
            )
    source_artifact = Path(path).resolve()
    _validate_restore_checksum(source_artifact)
    artifact, temporary = _artifact_for_restore(path)
    try:
        if target_database == current_database:
            _run(["dropdb", "--if-exists", "--force", *_cluster_arguments(), target_database])
        else:
            _run(["dropdb", "--if-exists", *_cluster_arguments(), target_database])
        _restore_to_database(artifact, target_database)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def apply_backup_retention() -> None:
    completed = list(
        DatabaseBackup.objects.filter(
            status=DatabaseBackup.Status.COMPLETED,
        ).order_by("-created_at")
    )
    keep_ids: set[int] = set()
    daily: set[str] = set()
    weekly: set[str] = set()
    monthly: set[str] = set()
    for backup in completed:
        local_date = timezone.localtime(backup.created_at)
        day_key = local_date.strftime("%Y-%m-%d")
        week_key = local_date.strftime("%G-W%V")
        month_key = local_date.strftime("%Y-%m")
        keep = False
        if len(daily) < 14 and day_key not in daily:
            daily.add(day_key)
            keep = True
        if len(weekly) < 8 and week_key not in weekly:
            weekly.add(week_key)
            keep = True
        if len(monthly) < 12 and month_key not in monthly:
            monthly.add(month_key)
            keep = True
        if keep and backup.pk is not None:
            keep_ids.add(backup.pk)

    for backup in completed:
        if backup.pk in keep_ids:
            continue
        artifact = Path(backup.path)
        artifact.unlink(missing_ok=True)
        _sidecar_path(artifact).unlink(missing_ok=True)
        backup.delete()
