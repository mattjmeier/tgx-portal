from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from core.backups import DatabaseBackupError, create_database_backup
from profiling.archive_import import (
    ArchiveImportError,
    apply_study_manifest,
    diff_study_manifest,
    discover_study_manifests,
)


class Command(BaseCommand):
    help = "Validate or apply one portal-study.yaml descriptor or a directory of descriptors."

    def add_arguments(self, parser) -> None:
        parser.add_argument("path")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply validated manifests. The default is a read-only dry run.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            dest="as_json",
            help="Emit a machine-readable JSON report.",
        )
        parser.add_argument(
            "--continue-on-error",
            action="store_true",
            help="Continue applying remaining studies if one fails.",
        )
        parser.add_argument(
            "--skip-backup",
            action="store_true",
            help="Skip the automatic pre-import backup when applying more than one study.",
        )

    def handle(self, *args, **options):
        try:
            manifests = discover_study_manifests(options["path"])
        except ArchiveImportError as exc:
            raise CommandError(str(exc)) from exc
        if not manifests:
            raise CommandError("No portal-study.yaml descriptors were found.")
        if options["apply"] and len(manifests) > 1 and not options["skip_backup"]:
            try:
                backup = create_database_backup()
            except DatabaseBackupError as exc:
                raise CommandError(f"Pre-import database backup failed: {exc}") from exc
            self.stdout.write(f"Pre-import backup: {backup.path}")

        reports: list[dict] = []
        failures: list[str] = []
        for manifest_path in manifests:
            try:
                if options["apply"]:
                    report = apply_study_manifest(manifest_path).as_dict()
                else:
                    report = diff_study_manifest(manifest_path)
                reports.append(report)
            except ArchiveImportError as exc:
                failures.append(f"{manifest_path}: {exc}")
                reports.append(
                    {
                        "manifest": str(manifest_path),
                        "outcome": "failed",
                        "error": str(exc),
                    }
                )
                if not options["continue_on_error"]:
                    break

        payload = {
            "mode": "apply" if options["apply"] else "dry-run",
            "manifests": reports,
            "failure_count": len(failures),
        }
        if options["as_json"]:
            self.stdout.write(json.dumps(payload, indent=2, sort_keys=True))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{payload['mode']}: {len(reports) - len(failures)} succeeded, "
                    f"{len(failures)} failed"
                )
            )
            for report in reports:
                self.stdout.write(f"- {report.get('study_key') or report.get('manifest')}: {report['outcome']}")
        if failures:
            raise CommandError("; ".join(failures))
