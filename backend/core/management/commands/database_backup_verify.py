from django.core.management.base import BaseCommand, CommandError

from core.backups import DatabaseBackupError, verify_database_backup


class Command(BaseCommand):
    help = "Restore a registered backup into a disposable database and verify it."

    def add_arguments(self, parser) -> None:
        parser.add_argument("artifact")

    def handle(self, *args, **options):
        try:
            backup = verify_database_backup(options["artifact"])
        except DatabaseBackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Verified {backup.path}"))
