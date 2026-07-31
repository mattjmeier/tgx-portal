from __future__ import annotations

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.backups import (
    DatabaseBackupError,
    create_database_backup,
    restore_database_backup,
    verify_database_backup,
)
from core.models import DatabaseBackup, UserProfile

User = get_user_model()


class DatabaseBackupServiceTests(TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.backup_root = Path(self.temporary_directory.name)

    def fake_subprocess(self, command, **_kwargs):
        for argument in command:
            if str(argument).startswith("--file="):
                Path(str(argument).split("=", 1)[1]).write_bytes(b"postgres-custom-dump")

        class Result:
            stdout = (
                ("0\n" if any("core_study" in str(part) for part in command) else "1\n")
                if command[0] == "psql"
                else "pg_restore output"
            )
            stderr = ""

        return Result()

    @override_settings(DATABASE_BACKUP_ROOT="/unused")
    @patch("core.backups.subprocess.run")
    def test_backup_creates_dump_and_sha256_sidecar(self, run_mock) -> None:
        run_mock.side_effect = self.fake_subprocess

        with override_settings(DATABASE_BACKUP_ROOT=str(self.backup_root)):
            backup = create_database_backup()

        artifact = Path(backup.path)
        sidecar = artifact.with_suffix(f"{artifact.suffix}.json")
        self.assertTrue(artifact.exists())
        self.assertTrue(sidecar.exists())
        self.assertEqual(backup.status, DatabaseBackup.Status.COMPLETED)
        self.assertEqual(backup.sha256, hashlib.sha256(artifact.read_bytes()).hexdigest())
        self.assertEqual(json.loads(sidecar.read_text(encoding="utf-8"))["sha256"], backup.sha256)

    @override_settings(DATABASE_BACKUP_ROOT="/unused")
    @patch("core.backups.subprocess.run")
    def test_verify_restores_to_disposable_database_and_records_result(self, run_mock) -> None:
        run_mock.side_effect = self.fake_subprocess
        with override_settings(DATABASE_BACKUP_ROOT=str(self.backup_root)):
            backup = create_database_backup()
            verified = verify_database_backup(backup.path)

        self.assertTrue(verified.verified_at)
        self.assertEqual(verified.verification_status, DatabaseBackup.VerificationStatus.PASSED)
        flattened_commands = [" ".join(str(part) for part in call.args[0]) for call in run_mock.call_args_list]
        self.assertTrue(any("pg_restore" in command for command in flattened_commands))
        self.assertTrue(
            any("django_migrations" in command for command in flattened_commands)
        )
        self.assertTrue(
            any("core_study" in command and "core_sample" in command for command in flattened_commands)
        )
        self.assertTrue(any("dropdb" in command for command in flattened_commands))

    @patch("core.management.commands.database_backup.create_database_backup")
    def test_database_backup_management_command_uses_shared_service(self, create_mock) -> None:
        create_mock.return_value = DatabaseBackup(
            status=DatabaseBackup.Status.COMPLETED,
            path="/backups/test.dump",
            sha256="abc",
        )

        call_command("database_backup")

        create_mock.assert_called_once()

    @override_settings(DATABASE_BACKUP_ROOT="/unused")
    @patch("core.backups.subprocess.run")
    def test_restore_rejects_corruption_and_live_target_without_confirmation(
        self,
        run_mock,
    ) -> None:
        run_mock.side_effect = self.fake_subprocess
        with override_settings(DATABASE_BACKUP_ROOT=str(self.backup_root)):
            backup = create_database_backup()
            with self.assertRaisesRegex(DatabaseBackupError, "exact database-name"):
                restore_database_backup(
                    backup.path,
                    target_database=str(connection.settings_dict["NAME"]),
                    replace_live=True,
                    confirmation="wrong-name",
                )
            Path(backup.path).write_bytes(b"corrupted")
            with self.assertRaisesRegex(DatabaseBackupError, "checksum"):
                restore_database_backup(
                    backup.path,
                    target_database="tgx_portal_recovery",
                )


class DatabaseBackupApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin_user = User.objects.create_user(username="backup-admin", password="password123")
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()
        self.client.force_authenticate(self.admin_user)

    @patch("core.views.create_database_backup_task.delay")
    def test_admin_can_create_and_list_backup_jobs(self, delay_mock) -> None:
        response = self.client.post("/api/admin/database-backups/", {}, format="json")

        self.assertEqual(response.status_code, 202)
        backup = DatabaseBackup.objects.get()
        delay_mock.assert_called_once_with(backup.id)
        list_response = self.client.get("/api/admin/database-backups/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["results"][0]["id"], backup.id)

    def test_clients_cannot_access_backup_jobs_and_no_live_restore_endpoint_exists(self) -> None:
        client_user = User.objects.create_user(username="backup-client", password="password123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        self.client.force_authenticate(client_user)

        self.assertEqual(self.client.get("/api/admin/database-backups/").status_code, 403)
        self.client.force_authenticate(self.admin_user)
        self.assertEqual(
            self.client.post("/api/admin/database-backups/restore/", {}).status_code,
            405,
        )
