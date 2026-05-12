from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StudyImportViewSet

router = DefaultRouter()
router.register("study-imports", StudyImportViewSet, basename="profiling-study-import")

urlpatterns = [
    path("", include(router.urls)),
]
