from django.core.management.base import BaseCommand, CommandError

from core.backups import DatabaseBackupError, restore_database_backup


class Command(BaseCommand):
    help = "Restore a backup into a named database. Live replacement requires explicit safeguards."

    def add_arguments(self, parser) -> None:
        parser.add_argument("artifact")
        parser.add_argument("--target-database", required=True)
        parser.add_argument("--replace-live", action="store_true")
        parser.add_argument("--confirm-database", default="")

    def handle(self, *args, **options):
        try:
            restore_database_backup(
                options["artifact"],
                target_database=options["target_database"],
                replace_live=options["replace_live"],
                confirmation=options["confirm_database"],
            )
        except DatabaseBackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(f"Restored backup into {options['target_database']}")
        )
