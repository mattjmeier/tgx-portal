from django.core.management.base import BaseCommand, CommandError

from core.backups import DatabaseBackupError, create_database_backup


class Command(BaseCommand):
    help = "Create a compressed PostgreSQL backup in DATABASE_BACKUP_ROOT."

    def handle(self, *args, **options):
        try:
            backup = create_database_backup()
        except DatabaseBackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Created {backup.path} ({backup.sha256})"))
