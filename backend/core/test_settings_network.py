import importlib


def test_settings_include_devtunnels_hosts_and_csrf_origins_by_env(monkeypatch) -> None:
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,api,.devtunnels.ms")
    monkeypatch.setenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "https://*.devtunnels.ms,https://portal.example.test",
    )

    settings_module = importlib.import_module("config.settings")
    settings_module = importlib.reload(settings_module)

    assert ".devtunnels.ms" in settings_module.ALLOWED_HOSTS
    assert "https://*.devtunnels.ms" in settings_module.CSRF_TRUSTED_ORIGINS
    assert "https://portal.example.test" in settings_module.CSRF_TRUSTED_ORIGINS


def test_settings_enable_unfold_admin(monkeypatch) -> None:
    monkeypatch.delenv("DJANGO_CSRF_TRUSTED_ORIGINS", raising=False)

    settings_module = importlib.import_module("config.settings")
    settings_module = importlib.reload(settings_module)

    assert settings_module.INSTALLED_APPS[0] == "unfold"
    assert "django.contrib.admin" in settings_module.INSTALLED_APPS
    assert settings_module.UNFOLD["SITE_TITLE"] == "R-ODAF Portal Admin"
