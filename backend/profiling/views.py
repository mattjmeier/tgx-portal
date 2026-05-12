from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.models import UserProfile

from .models import ImportBatch
from .services import commit_import, preview_contrasts, preview_metadata, register_count_resource, serialize_import_batch, update_import_draft


def _require_admin(user) -> None:
    if getattr(getattr(user, "profile", None), "role", None) != UserProfile.Role.ADMIN:
        raise PermissionDenied("Admin access is required for this action.")


class StudyImportViewSet(viewsets.ViewSet):
    def get_queryset(self):
        return ImportBatch.objects.select_related("study_metadata").prefetch_related("staged_rows").all()

    def create(self, request):
        _require_admin(request.user)
        payload = request.data if isinstance(request.data, dict) else {}
        import_batch = ImportBatch.objects.create(
            source_name=str(payload.get("study_name") or payload.get("title") or "study-import").strip() or "study-import",
            source_system=str(payload.get("source") or "admin-import").strip(),
            status=ImportBatch.Status.PLANNED,
            initiated_by=request.user,
            ext={},
        )
        update_import_draft(
            import_batch,
            {
                "project_id": payload.get("project_id"),
                "title": payload.get("title"),
                "description": payload.get("description", ""),
                "species": payload.get("species"),
                "celltype": payload.get("celltype", ""),
                "study_name": payload.get("study_name"),
                "source": payload.get("source", ""),
                "study_type": payload.get("study_type"),
                "in_vitro": payload.get("in_vitro"),
                "platform_id": payload.get("platform_id"),
            },
        )
        import_batch.refresh_from_db()
        return Response(serialize_import_batch(import_batch), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        return Response(serialize_import_batch(import_batch))

    def partial_update(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        update_import_draft(import_batch, dict(request.data))
        import_batch.refresh_from_db()
        return Response(serialize_import_batch(import_batch))

    @action(detail=True, methods=["post"], url_path="metadata-preview")
    def metadata_preview(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        result = preview_metadata(
            import_batch=import_batch,
            filename=str(request.data.get("filename") or "metadata.tsv"),
            content=str(request.data.get("content") or ""),
            mappings=list(request.data.get("mappings") or []),
        )
        return Response(result)

    @action(detail=True, methods=["post"], url_path="contrasts-preview")
    def contrasts_preview(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        result = preview_contrasts(
            import_batch=import_batch,
            filename=str(request.data.get("filename") or "contrasts.tsv"),
            content=str(request.data.get("content") or ""),
        )
        return Response(result)

    @action(detail=True, methods=["post"], url_path="count-resource")
    def count_resource(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        result = register_count_resource(
            import_batch=import_batch,
            filename=str(request.data.get("filename") or "counts.tsv"),
            content=str(request.data.get("content") or ""),
            feature_id_kind=request.data.get("feature_id_kind"),
            annotation_source=request.data.get("annotation_source"),
            annotation_version=request.data.get("annotation_version"),
        )
        return Response(result)

    @action(detail=True, methods=["post"], url_path="commit")
    def commit(self, request, pk=None):
        _require_admin(request.user)
        import_batch = self.get_queryset().get(pk=pk)
        try:
            result = commit_import(import_batch)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)
