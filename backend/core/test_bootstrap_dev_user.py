from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from core.models import UserProfile

User = get_user_model()


class BootstrapDevUserCommandTests(TestCase):
    def test_command_creates_django_superuser_admin_for_local_admin_explorer(self) -> None:
        call_command("bootstrap_dev_user")

        admin = User.objects.get(username="admin")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.check_password("admin123"))
        self.assertEqual(admin.profile.role, UserProfile.Role.ADMIN)

    def test_command_keeps_client_out_of_django_admin(self) -> None:
        call_command("bootstrap_dev_user")

        client = User.objects.get(username="client")
        self.assertFalse(client.is_staff)
        self.assertFalse(client.is_superuser)
        self.assertTrue(client.check_password("client123"))
        self.assertEqual(client.profile.role, UserProfile.Role.CLIENT)
