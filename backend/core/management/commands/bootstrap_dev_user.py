from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import UserProfile

User = get_user_model()


class Command(BaseCommand):
    help = "Ensures a default development admin user exists."

    def handle(self, *args, **options):  # noqa: ARG002
        username = "admin"
        password = "admin123"
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"is_staff": True, "is_superuser": True},
        )
        if created or not user.check_password(password):
            user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.ADMIN
        profile.save()

        client_user, client_created = User.objects.get_or_create(username="client", defaults={"is_staff": False})
        client_password = "client123"
        if client_created or not client_user.check_password(client_password):
            client_user.set_password(client_password)
        client_user.is_staff = False
        client_user.is_superuser = False
        client_user.save()

        client_profile, _ = UserProfile.objects.get_or_create(user=client_user)
        client_profile.role = UserProfile.Role.CLIENT
        client_profile.save()

        self.stdout.write(self.style.SUCCESS(f"Development admin user ready: {username}"))
        self.stdout.write(self.style.SUCCESS("Development client user ready: client"))
