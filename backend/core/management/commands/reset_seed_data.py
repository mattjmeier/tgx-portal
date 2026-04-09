from django.core.management.base import BaseCommand

from core.seed_data import reset_seed_data


class Command(BaseCommand):
    help = "Clears current collaboration/study data and loads deterministic mock records for local QA."

    def handle(self, *args, **options):  # noqa: ARG002
        counts = reset_seed_data()
        self.stdout.write(
            self.style.SUCCESS(
                "Seed reset complete: "
                f"{counts['projects']} collaborations, "
                f"{counts['studies']} studies, "
                f"{counts['samples']} samples, "
                f"{counts['assays']} assays."
            )
        )
