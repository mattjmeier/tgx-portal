from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AssayViewSet, AuthViewSet, ProjectViewSet, SampleViewSet, StudyViewSet, UserManagementViewSet, healthcheck_view

router = DefaultRouter()
router.register("auth", AuthViewSet, basename="auth")
router.register("users", UserManagementViewSet, basename="user")
router.register("projects", ProjectViewSet, basename="project")
router.register("studies", StudyViewSet, basename="study")
router.register("samples", SampleViewSet, basename="sample")
router.register("assays", AssayViewSet, basename="assay")

urlpatterns = [
    path("health/", healthcheck_view, name="healthcheck"),
    path("", include(router.urls)),
]
