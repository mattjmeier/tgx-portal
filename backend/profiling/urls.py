from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CountMatrixPreviewView,
    DataBrowserFacetView,
    DataBrowserStudyDetailView,
    DataBrowserStudyListView,
    DataExportViewSet,
    StudyImportViewSet,
)

router = DefaultRouter()
router.register("study-imports", StudyImportViewSet, basename="profiling-study-import")
router.register("data-exports", DataExportViewSet, basename="profiling-data-export")

urlpatterns = [
    path("data-browser/studies/", DataBrowserStudyListView.as_view(), name="data-browser-studies"),
    path("data-browser/studies/<int:pk>/", DataBrowserStudyDetailView.as_view(), name="data-browser-study-detail"),
    path("data-browser/facets/", DataBrowserFacetView.as_view(), name="data-browser-facets"),
    path("count-matrices/<int:pk>/preview/", CountMatrixPreviewView.as_view(), name="count-matrix-preview"),
    path("", include(router.urls)),
]
