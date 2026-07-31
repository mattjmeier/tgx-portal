from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db.models import Count, F, Q
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import UserProfile

from .archive_import import ArchiveImportError, apply_study_manifest, diff_study_manifest
from .data_exports import DataExportError, validate_export_selection
from .matrix_io import MatrixDataError, matrix_rows, resolve_resource_path
from .models import CountMatrixProfile, DataExport, ImportBatch, StudyWarehouseMetadata
from .services import commit_import, preview_contrasts, preview_metadata, register_count_resource, serialize_import_batch, update_import_draft
from .tasks import build_data_export_task


def _require_admin(user) -> None:
    if getattr(getattr(user, "profile", None), "role", None) != UserProfile.Role.ADMIN:
        raise PermissionDenied("Admin access is required for this action.")


FACET_PARAMS = {
    "chemical",
    "technology",
    "platform",
    "species",
    "cell_type",
    "study_type",
    "value_type",
    "curation",
    "availability",
    "ready",
}


def _data_browser_queryset(request, *, exclude_facet: str | None = None):
    queryset = (
        StudyWarehouseMetadata.objects.select_related(
            "study__project",
            "platform",
            "primary_count_resource__count_matrix_profile",
        )
        .prefetch_related(
            "series__chemical_sample",
            "data_resources__count_matrix_profile__columns__samples",
            "primary_count_resource__count_matrix_profile__columns__samples",
        )
        .annotate(
            sample_count=Count("study__samples", distinct=True),
            mapped_matrix_column_count=Count(
                "primary_count_resource__count_matrix_profile__columns",
                filter=Q(primary_count_resource__count_matrix_profile__columns__samples__isnull=False),
                distinct=True,
            ),
        )
    )
    values = {key: request.query_params.getlist(key) for key in FACET_PARAMS if key != exclude_facet}
    search = request.query_params.get("search", "").strip()
    if search:
        queryset = queryset.filter(
            Q(study_name__icontains=search)
            | Q(study__title__icontains=search)
            | Q(study__project__title__icontains=search)
            | Q(study__samples__sample_ID__icontains=search)
            | Q(series__chemical_sample__preferred_name__icontains=search)
            | Q(series__chemical_sample__chemical_sample_id__icontains=search)
            | Q(series__chemical_sample__spid__icontains=search)
            | Q(series__chemical_sample__roc_id__icontains=search)
            | Q(series__chemical_sample__dtxsid__icontains=search)
            | Q(series__chemical_sample__casrn__icontains=search)
        )
    if values.get("chemical"):
        chemical_values = values["chemical"]
        queryset = queryset.filter(
            Q(series__chemical_sample__id__in=[value for value in chemical_values if value.isdigit()])
            | Q(series__chemical_sample__preferred_name__in=chemical_values)
        )
    if values.get("technology"):
        queryset = queryset.filter(platform__technology_type__in=values["technology"])
    if values.get("platform"):
        queryset = queryset.filter(platform__platform_name__in=values["platform"])
    if values.get("species"):
        queryset = queryset.filter(study__species__in=values["species"])
    if values.get("cell_type"):
        queryset = queryset.filter(study__celltype__in=values["cell_type"])
    if values.get("study_type"):
        queryset = queryset.filter(study_type__in=values["study_type"])
    if values.get("value_type"):
        queryset = queryset.filter(primary_count_resource__count_matrix_profile__value_type__in=values["value_type"])
    if values.get("curation"):
        queryset = queryset.filter(curation_status__in=values["curation"])
    if values.get("availability"):
        queryset = queryset.filter(primary_count_resource__availability_status__in=values["availability"])
    ready_values = values.get("ready") or (["true"] if exclude_facet != "ready" else [])
    if ready_values == ["true"] or ("true" in ready_values and "false" not in ready_values):
        queryset = queryset.filter(
            primary_count_resource__availability_status="available",
            primary_count_resource__count_matrix_profile__validation_status="valid",
            platform__isnull=False,
            mapped_matrix_column_count=F("primary_count_resource__count_matrix_profile__matrix_column_count"),
        ).exclude(
            Q(study__species="")
            | Q(primary_count_resource__count_matrix_profile__value_type="")
            | Q(primary_count_resource__count_matrix_profile__feature_id_kind="")
            | Q(primary_count_resource__count_matrix_profile__annotation_source="")
            | Q(primary_count_resource__count_matrix_profile__annotation_version="")
        )
    elif ready_values == ["false"] or ("false" in ready_values and "true" not in ready_values):
        queryset = queryset.exclude(
            Q(primary_count_resource__availability_status="available")
            & Q(primary_count_resource__count_matrix_profile__validation_status="valid")
            & Q(platform__isnull=False)
            & ~Q(study__species="")
            & ~Q(primary_count_resource__count_matrix_profile__value_type="")
            & ~Q(primary_count_resource__count_matrix_profile__feature_id_kind="")
            & ~Q(primary_count_resource__count_matrix_profile__annotation_source="")
            & ~Q(primary_count_resource__count_matrix_profile__annotation_version="")
            & Q(mapped_matrix_column_count=F("primary_count_resource__count_matrix_profile__matrix_column_count"))
        )
    return queryset.distinct()


def _serialize_matrix(profile: CountMatrixProfile | None) -> dict | None:
    if profile is None:
        return None
    return {
        "id": profile.id,
        "resource_id": profile.resource_id,
        "display_name": profile.resource.display_name,
        "value_type": profile.value_type,
        "feature_id_kind": profile.feature_id_kind,
        "annotation_source": profile.annotation_source,
        "annotation_version": profile.annotation_version,
        "feature_count": profile.feature_count,
        "matrix_column_count": profile.matrix_column_count,
        "validation_status": profile.validation_status,
        "validation_errors": profile.validation_errors,
        "compatibility_key": profile.compatibility_key,
        "browser_ready": profile.is_browser_ready,
    }


def _serialize_browser_study(warehouse: StudyWarehouseMetadata, *, include_resources: bool = False) -> dict:
    primary_resource = warehouse.primary_count_resource
    primary_profile = getattr(primary_resource, "count_matrix_profile", None) if primary_resource else None
    chemicals = []
    seen_chemical_ids = set()
    for series in warehouse.series.all():
        chemical = series.chemical_sample
        if chemical.id not in seen_chemical_ids:
            seen_chemical_ids.add(chemical.id)
            chemicals.append({
                "id": chemical.id,
                "label": chemical.preferred_name or chemical.chemical_sample_id,
                "chemical_sample_id": chemical.chemical_sample_id,
                "dtxsid": chemical.dtxsid,
                "casrn": chemical.casrn,
            })
    payload = {
        "id": warehouse.id,
        "study_id": warehouse.study_id,
        "study_name": warehouse.study_name,
        "title": warehouse.study.title,
        "collaboration": {"id": warehouse.study.project_id, "title": warehouse.study.project.title},
        "species": warehouse.study.species,
        "cell_type": warehouse.study.celltype,
        "study_type": warehouse.study_type,
        "curation_status": warehouse.curation_status,
        "lineage_status": warehouse.lineage_status,
        "sample_count": getattr(warehouse, "sample_count", warehouse.study.samples.count()),
        "platform": ({
            "id": warehouse.platform_id,
            "name": warehouse.platform.platform_name,
            "title": warehouse.platform.title,
            "technology_type": warehouse.platform.technology_type,
        } if warehouse.platform_id else None),
        "chemicals": chemicals,
        "primary_matrix": _serialize_matrix(primary_profile),
        "browser_ready": bool(primary_profile and primary_profile.is_browser_ready),
    }
    matrix_options = []
    for resource in warehouse.data_resources.all():
        profile = getattr(resource, "count_matrix_profile", None)
        if profile:
            option = _serialize_matrix(profile)
            option["is_primary"] = resource.id == warehouse.primary_count_resource_id
            matrix_options.append(option)
    payload["matrices"] = matrix_options
    if include_resources:
        matrices = []
        for resource in warehouse.data_resources.all():
            profile = getattr(resource, "count_matrix_profile", None)
            if profile:
                matrix = _serialize_matrix(profile)
                matrix.update({
                    "resource_key": resource.resource_key,
                    "checksum": resource.checksum,
                    "checksum_algorithm": resource.checksum_algorithm,
                    "version": resource.version,
                    "availability_status": resource.availability_status,
                    "size_bytes": resource.size_bytes,
                    "is_primary": resource.id == warehouse.primary_count_resource_id,
                    "mapped_column_count": profile.mapped_column_count,
                })
                matrices.append(matrix)
        payload["matrices"] = matrices
    return payload


class DataBrowserStudyListView(APIView):
    def get(self, request):
        _require_admin(request.user)
        queryset = _data_browser_queryset(request)
        ordering = request.query_params.get("ordering", "study_name")
        allowed = {"study_name", "-study_name", "study__title", "-study__title", "-updated_at", "updated_at"}
        queryset = queryset.order_by(ordering if ordering in allowed else "study_name", "id")
        paginator = PageNumberPagination()
        paginator.page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response([_serialize_browser_study(item) for item in page])


class DataBrowserStudyDetailView(APIView):
    def get(self, request, pk: int):
        _require_admin(request.user)
        warehouse = _data_browser_queryset(request, exclude_facet="ready").filter(id=pk).first()
        if warehouse is None:
            return Response({"detail": "Study dataset was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_browser_study(warehouse, include_resources=True))


class DataBrowserFacetView(APIView):
    facet_specs = {
        "technology": ("platform__technology_type", "platform__technology_type"),
        "platform": ("platform__platform_name", "platform__platform_name"),
        "species": ("study__species", "study__species"),
        "cell_type": ("study__celltype", "study__celltype"),
        "study_type": ("study_type", "study_type"),
        "value_type": ("primary_count_resource__count_matrix_profile__value_type", "primary_count_resource__count_matrix_profile__value_type"),
        "curation": ("curation_status", "curation_status"),
        "availability": ("primary_count_resource__availability_status", "primary_count_resource__availability_status"),
    }

    def get(self, request):
        _require_admin(request.user)
        buckets: dict[str, list[dict]] = {}
        for facet, (value_field, label_field) in self.facet_specs.items():
            rows = (
                _data_browser_queryset(request, exclude_facet=facet)
                .exclude(**{value_field: ""})
                .exclude(**{f"{value_field}__isnull": True})
                .values(value=F(value_field), label=F(label_field))
                .annotate(count=Count("id", distinct=True))
                .order_by("label")[:100]
            )
            buckets[facet] = list(rows)
        chemical_search = request.query_params.get("chemical_search", "").strip()
        chemical_queryset = _data_browser_queryset(request, exclude_facet="chemical")
        if chemical_search:
            chemical_queryset = chemical_queryset.filter(
                Q(series__chemical_sample__preferred_name__icontains=chemical_search)
                | Q(series__chemical_sample__chemical_sample_id__icontains=chemical_search)
                | Q(series__chemical_sample__dtxsid__icontains=chemical_search)
                | Q(series__chemical_sample__casrn__icontains=chemical_search)
            )
        buckets["chemical"] = list(
            chemical_queryset.values(
                value=F("series__chemical_sample__id"),
                label=F("series__chemical_sample__preferred_name"),
            )
            .exclude(value__isnull=True)
            .annotate(count=Count("id", distinct=True))
            .order_by("label")[:50]
        )
        ready_studies = list(_data_browser_queryset(request, exclude_facet="ready"))
        ready_count = sum(1 for item in ready_studies if _serialize_browser_study(item)["browser_ready"])
        total = len(ready_studies)
        buckets["ready"] = [
            {"value": "true", "label": "Ready", "count": ready_count},
            {"value": "false", "label": "Needs curation", "count": total - ready_count},
        ]
        return Response({"facets": buckets})


class CountMatrixPreviewView(APIView):
    def get(self, request, pk: int):
        _require_admin(request.user)
        profile = CountMatrixProfile.objects.select_related("resource__study_metadata__study").filter(id=pk).first()
        if profile is None:
            return Response({"detail": "Count matrix was not found."}, status=status.HTTP_404_NOT_FOUND)
        feature_limit = min(max(int(request.query_params.get("features", 20)), 1), 20)
        sample_limit = min(max(int(request.query_params.get("samples", 10)), 1), 10)
        try:
            header, iterator = matrix_rows(resolve_resource_path(profile.resource.uri))
            columns = header[: sample_limit + 1]
            rows = [row[: sample_limit + 1] for _, row in zip(range(feature_limit), iterator)]
        except MatrixDataError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response({"columns": columns, "rows": rows, "truncated": profile.feature_count > len(rows) or profile.matrix_column_count > sample_limit})


def _serialize_export(export: DataExport) -> dict:
    export.mark_expired_if_needed()
    return {
        "id": export.id,
        "status": export.status,
        "matrix_ids": export.matrix_ids,
        "request_snapshot": export.request_snapshot,
        "compatibility_key": export.compatibility_key,
        "source_checksums": export.source_checksums,
        "output_filename": export.output_filename,
        "output_size_bytes": export.output_size_bytes,
        "output_checksum": export.output_checksum,
        "feature_count": export.feature_count,
        "failure_detail": export.failure_detail,
        "expires_at": export.expires_at,
        "created_at": export.created_at,
    }


class DataExportViewSet(viewsets.ViewSet):
    def list(self, request):
        _require_admin(request.user)
        exports = DataExport.objects.filter(requested_by=request.user)[:50]
        return Response([_serialize_export(item) for item in exports])

    def create(self, request):
        _require_admin(request.user)
        try:
            matrix_ids = [int(value) for value in request.data.get("matrix_ids", [])]
            profiles, compatibility_key = validate_export_selection(matrix_ids)
        except (TypeError, ValueError, DataExportError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        export = DataExport.objects.create(
            requested_by=request.user,
            matrix_ids=matrix_ids,
            compatibility_key=compatibility_key,
            source_checksums={str(profile.id): profile.resource.checksum for profile in profiles},
            request_snapshot={"filters": request.data.get("filters", {})},
        )
        build_data_export_task.delay(export.id)
        return Response(_serialize_export(export), status=status.HTTP_202_ACCEPTED)

    def retrieve(self, request, pk=None):
        _require_admin(request.user)
        export = DataExport.objects.filter(id=pk, requested_by=request.user).first()
        if export is None:
            return Response({"detail": "Export was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_export(export))

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        _require_admin(request.user)
        export = DataExport.objects.filter(id=pk, requested_by=request.user).first()
        if export is None:
            return Response({"detail": "Export was not found."}, status=status.HTTP_404_NOT_FOUND)
        export.mark_expired_if_needed()
        path = Path(export.output_path) if export.output_path else None
        is_safe_path = False
        if path is not None:
            try:
                path.resolve().relative_to(Path(getattr(settings, "DATA_EXPORT_ROOT", "/exports")).resolve())
                is_safe_path = True
            except ValueError:
                pass
        if export.status != DataExport.Status.COMPLETED or path is None or not is_safe_path or not path.is_file():
            return Response({"detail": "Export artifact is unavailable."}, status=status.HTTP_409_CONFLICT)
        return FileResponse(path.open("rb"), as_attachment=True, filename=export.output_filename)


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

    @action(detail=False, methods=["post"], url_path="archive-preview")
    def archive_preview(self, request):
        _require_admin(request.user)
        manifest_path = str(request.data.get("manifest_path") or "").strip()
        if not manifest_path:
            return Response(
                {"detail": "manifest_path is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            report = diff_study_manifest(manifest_path)
        except ArchiveImportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(report)

    @action(detail=False, methods=["post"], url_path="archive-apply")
    def archive_apply(self, request):
        _require_admin(request.user)
        manifest_path = str(request.data.get("manifest_path") or "").strip()
        if not manifest_path:
            return Response(
                {"detail": "manifest_path is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = apply_study_manifest(
                manifest_path,
                initiated_by=request.user,
            )
        except ArchiveImportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response_status = (
            status.HTTP_200_OK
            if result.outcome == "no_changes"
            else status.HTTP_201_CREATED
        )
        return Response(result.as_dict(), status=response_status)

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
        try:
            result = register_count_resource(
                import_batch=import_batch,
                path=str(request.data.get("path") or ""),
                feature_id_kind=request.data.get("feature_id_kind"),
                annotation_source=request.data.get("annotation_source"),
                annotation_version=request.data.get("annotation_version"),
            )
        except ArchiveImportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
