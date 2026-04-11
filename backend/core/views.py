from django.http import HttpResponse, JsonResponse
import logging
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils.text import slugify
from rest_framework import filters
from rest_framework.authtoken.models import Token
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from django.utils import timezone

from .models import (
    Assay,
    ControlledLookupValue,
    MetadataFieldDefinition,
    Project,
    Sample,
    Study,
    StudyConfig,
    StudyMetadataFieldSelection,
    StudyMetadataMapping,
    StudyOnboardingState,
    UserProfile,
    default_study_config,
)
from .serializers import (
    AssaySerializer,
    AuthUserSerializer,
    ProjectSerializer,
    ProjectOwnershipUpdateSerializer,
    SampleSerializer,
    StudySerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserRoleUpdateSerializer,
)
from .services import (
    ConfigGenerationError,
    SampleImportValidationError,
    build_project_config_bundle,
    create_samples_from_validated_rows,
    validate_metadata_upload,
    validate_sample_import_rows,
    get_study_template_columns,
)
from .tasks import create_plane_ticket
from .onboarding import (
    DEFAULT_MAPPINGS,
    normalize_contrast_pairs,
    normalize_mappings,
    suggest_contrasts_from_rows,
    validate_final_ready,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _get_user_role(user) -> str | None:
    return getattr(getattr(user, "profile", None), "role", None)


def _require_admin(user) -> None:
    if _get_user_role(user) != UserProfile.Role.ADMIN:
        raise PermissionDenied("Admin access is required for this action.")


def healthcheck_view(_request):
    return JsonResponse({"status": "ok"})


def _projects_accessible_to_user(user):
    role = _get_user_role(user)
    queryset = Project.objects.all()
    if role == UserProfile.Role.CLIENT:
        queryset = queryset.filter(owner=user)
    return queryset


def _require_study_access(user, study: Study) -> None:
    role = _get_user_role(user)
    if role == UserProfile.Role.CLIENT and study.project.owner_id != user.id:
        raise PermissionDenied("Clients may only access studies within their own projects.")


def _get_or_create_onboarding_state(study: Study) -> StudyOnboardingState:
    state, created = StudyOnboardingState.objects.get_or_create(
        study=study,
        defaults={"mappings": DEFAULT_MAPPINGS},
    )
    if created:
        return state

    if not isinstance(state.mappings, dict):
        state.mappings = DEFAULT_MAPPINGS
        state.save(update_fields=["mappings"])
        return state

    merged = {**DEFAULT_MAPPINGS, **{k: v for k, v in state.mappings.items() if isinstance(k, str)}}
    if merged != state.mappings:
        state.mappings = merged
        state.save(update_fields=["mappings"])
    return state


def _get_or_create_metadata_mapping(study: Study) -> StudyMetadataMapping:
    mapping, _ = StudyMetadataMapping.objects.get_or_create(study=study)
    return mapping


def _get_or_create_study_config(study: Study) -> StudyConfig:
    config, _ = StudyConfig.objects.get_or_create(
        study=study,
        defaults=default_study_config(),
    )
    return config


def _study_finalize_errors(study: Study) -> dict[str, list[str]]:
    errors: dict[str, list[str]] = {}
    if not study.title:
        errors["title"] = ["Provide a study title before finalizing onboarding."]
    if not study.species:
        errors["species"] = ["Select a species before finalizing onboarding."]
    if not study.celltype:
        errors["celltype"] = ["Provide a cell type before finalizing onboarding."]
    if not hasattr(study, "config"):
        errors["config"] = ["Persist study configuration before finalizing onboarding."]
    return errors


class LookupViewSet(viewsets.ViewSet):
    def list(self, request):
        projects = _projects_accessible_to_user(request.user)
        pi_values = sorted({value for value in projects.values_list("pi_name", flat=True) if value})
        researcher_values = sorted({value for value in projects.values_list("researcher_name", flat=True) if value})

        controlled_values: dict[str, list[str]] = {category: [] for category, _ in ControlledLookupValue.Category.choices}
        for item in ControlledLookupValue.objects.filter(is_active=True).order_by("category", "value"):
            controlled_values[item.category].append(item.value)

        field_definitions = MetadataFieldDefinition.objects.filter(is_active=True).order_by(
            "-required",
            "group",
            "key",
            "id",
        )
        serialized_fields = [
            {
                "key": field.key,
                "label": field.label,
                "group": field.group,
                "description": field.description,
                "scope": field.scope,
                "system_key": field.system_key,
                "data_type": field.data_type,
                "kind": field.kind,
                "required": field.required,
                "is_core": field.is_core,
                "allow_null": field.allow_null,
                "choices": field.choices,
                "regex": field.regex,
                "min_value": field.min_value,
                "max_value": field.max_value,
                "auto_include_keys": field.auto_include_keys,
            }
            for field in field_definitions
        ]

        payload = {
            "version": 1,
            "metadata_field_definitions": serialized_fields,
            "lookups": {
                "soft": {
                    "pi_name": {
                        "policy": "scoped_select_or_create",
                        "values": pi_values,
                    },
                    "researcher_name": {
                        "policy": "scoped_select_or_create",
                        "values": researcher_values,
                    },
                },
                "controlled": {
                    category: {
                        "policy": "admin_managed",
                        "values": values,
                    }
                    for category, values in controlled_values.items()
                },
            },
        }
        return Response(payload)


def _compute_project_code(project: Project) -> str:
    base = slugify(project.title) or "project"
    return f"{base}-{project.id}"


def _normalize_field_key(value: str) -> str:
    return value.strip().replace(" ", "_")


def _upsert_study_template(study: Study, optional_field_keys: list[str], custom_field_keys: list[str]):
    core_order = {
        "sample_ID": 0,
        "technical_control": 1,
        "reference_rna": 2,
        "solvent_control": 3,
    }
    core_defs = list(
        MetadataFieldDefinition.objects.filter(
            is_active=True,
            scope=MetadataFieldDefinition.Scope.SAMPLE,
            is_core=True,
        ).order_by("id")
    )
    core_defs.sort(key=lambda definition: core_order.get(definition.key, 100 + definition.id))
    known_defs = {
        item.key: item
        for item in MetadataFieldDefinition.objects.filter(scope=MetadataFieldDefinition.Scope.SAMPLE)
    }

    ordered_keys = [definition.key for definition in core_defs]
    auto_included: list[dict[str, str]] = []

    def add_key(key: str, reason: str | None = None) -> None:
        if key in ordered_keys:
            return
        ordered_keys.append(key)
        if reason is not None:
            auto_included.append({"key": key, "reason": reason})

    for raw_key in optional_field_keys:
        key = _normalize_field_key(raw_key)
        if key not in known_defs:
            raise ValueError(f"Unknown metadata field definitions: {key}")
        add_key(key)
        for included_key in known_defs[key].auto_include_keys or []:
            add_key(included_key, reason=f"{key} selected")

    for raw_key in custom_field_keys:
        key = _normalize_field_key(raw_key)
        definition = known_defs.get(key)
        if definition is None:
            definition = MetadataFieldDefinition.objects.create(
                key=key,
                label=raw_key.strip() or key,
                group="Custom",
                description="Study-specific custom metadata field.",
                scope=MetadataFieldDefinition.Scope.SAMPLE,
                system_key=key,
                data_type=MetadataFieldDefinition.DataType.STRING,
                kind=MetadataFieldDefinition.Kind.CUSTOM,
                required=False,
                is_core=False,
                allow_null=True,
            )
            known_defs[key] = definition
        add_key(key)

    active_defs = {item.key: item for item in MetadataFieldDefinition.objects.filter(key__in=ordered_keys)}
    existing = {
        selection.field_definition.key: selection
        for selection in study.metadata_field_selections.select_related("field_definition")
    }

    for order, key in enumerate(ordered_keys):
        definition = active_defs[key]
        selection = existing.get(key)
        if selection is None:
            StudyMetadataFieldSelection.objects.create(
                study=study,
                field_definition=definition,
                required=definition.is_core or definition.required,
                sort_order=order,
                is_active=True,
            )
        else:
            selection.required = definition.is_core or definition.required
            selection.sort_order = order
            selection.is_active = True
            selection.save(update_fields=["required", "sort_order", "is_active"])

    for key, selection in existing.items():
        if key not in ordered_keys and selection.is_active:
            selection.is_active = False
            selection.save(update_fields=["is_active"])

    columns = get_study_template_columns(study)
    deprecated = [key for key in columns if key in active_defs and not active_defs[key].is_active]
    return columns, auto_included, deprecated


class MetadataTemplateViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        study_id = request.data.get("study_id")
        optional_field_keys = request.data.get("optional_field_keys", [])
        custom_field_keys = request.data.get("custom_field_keys", [])

        if not study_id:
            return Response({"study_id": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(optional_field_keys, list) or not isinstance(custom_field_keys, list):
            return Response({"detail": "optional_field_keys and custom_field_keys must be lists."}, status=status.HTTP_400_BAD_REQUEST)

        study = Study.objects.select_related("project").filter(id=study_id).first()
        if study is None:
            return Response({"detail": "Study not found."}, status=status.HTTP_404_NOT_FOUND)
        _require_study_access(request.user, study)

        try:
            columns, auto_included, deprecated = _upsert_study_template(study, optional_field_keys, custom_field_keys)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        project_code = _compute_project_code(study.project)
        filename = f"{project_code}_metadata.csv"

        return Response(
            {
                "columns": columns,
                "auto_included": auto_included,
                "deprecated_fields": deprecated,
                "project_code": project_code,
                "filename": filename,
            }
        )

    @action(detail=False, methods=["post"], url_path="download")
    def download(self, request):
        preview_response = self.preview(request)
        if preview_response.status_code != 200:
            return preview_response

        preview_payload = preview_response.data
        filename = preview_payload["filename"]
        columns = preview_payload["columns"]

        content = ",".join(columns) + "\n"
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class MetadataValidationViewSet(viewsets.ViewSet):
    def create(self, request):
        study_id = request.data.get("study_id")
        rows = request.data.get("rows", [])
        expected_columns = request.data.get("expected_columns")

        if not study_id:
            return Response({"study_id": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(rows, list):
            return Response({"detail": "rows must be a list of objects."}, status=status.HTTP_400_BAD_REQUEST)
        if expected_columns is not None and not isinstance(expected_columns, list):
            return Response({"detail": "expected_columns must be a list of strings."}, status=status.HTTP_400_BAD_REQUEST)

        study = Study.objects.select_related("project").filter(id=study_id).first()
        if study is None:
            return Response({"detail": "Study not found."}, status=status.HTTP_404_NOT_FOUND)
        _require_study_access(request.user, study)

        normalized_rows: list[dict] = []
        for row in rows:
            if isinstance(row, dict):
                normalized_rows.append(row)

        columns = sorted(
            {
                key.strip()
                for row in normalized_rows
                for key in row.keys()
                if isinstance(key, str) and key.strip()
            }
        )
        suggested_contrasts = suggest_contrasts_from_rows(normalized_rows)

        valid, issues = validate_metadata_upload(
            study_id=study.id,
            rows=normalized_rows,
            expected_columns=expected_columns,
        )

        state = _get_or_create_onboarding_state(study)
        state.metadata_columns = columns
        state.suggested_contrasts = suggested_contrasts
        state.updated_at = timezone.now()
        state.save(update_fields=["metadata_columns", "suggested_contrasts", "updated_at"])

        return Response(
            {
                "valid": valid,
                "issues": issues,
                "columns": columns,
                "suggested_contrasts": suggested_contrasts,
            }
        )


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "title",
        "pi_name",
        "researcher_name",
        "bioinformatician_assigned",
        "description",
        "owner__username",
    ]
    ordering_fields = [
        "id",
        "created_at",
        "title",
        "pi_name",
        "researcher_name",
        "bioinformatician_assigned",
        "owner__username",
    ]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        role = _get_user_role(user)
        if role == UserProfile.Role.CLIENT:
            queryset = queryset.filter(owner=user)
        return queryset

    def perform_create(self, serializer) -> None:
        project = serializer.save(owner=self.request.user)
        try:
            create_plane_ticket.delay(project.id)
        except Exception:
            logger.warning("Unable to queue Plane ticket task for project %s.", project.id, exc_info=True)

    @action(detail=True, methods=["post"], url_path="generate-config")
    def generate_config(self, request, pk=None):
        project = self.get_object()
        studies = list(project.studies.all())
        blocking: list[dict[str, str]] = []
        for study in studies:
            state = getattr(study, "onboarding_state", None)
            if state is None:
                blocking.append({"study_id": str(study.id), "reason": "Onboarding mappings are not saved."})
                continue
            if state.status != StudyOnboardingState.Status.FINAL:
                blocking.append({"study_id": str(study.id), "reason": f"Onboarding is not final (status={state.status})."})
                continue
            mapping_model = getattr(study, "metadata_mapping", None)
            if mapping_model is None:
                blocking.append({"study_id": str(study.id), "reason": "Persisted metadata mappings are missing."})
                continue
            errors = validate_final_ready(
                metadata_columns=get_study_template_columns(study),
                mappings={**DEFAULT_MAPPINGS, **mapping_model.as_dict()},
            )
            if errors:
                blocking.append({"study_id": str(study.id), "reason": "Onboarding mappings are invalid."})

        if blocking:
            return Response(
                {
                    "detail": "Project onboarding is not final-ready; finalize study mappings before generating outputs.",
                    "blocking_studies": blocking,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            bundle = build_project_config_bundle(project)
        except ConfigGenerationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response = HttpResponse(bundle.content, content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{bundle.filename}"'
        return response

    @action(detail=True, methods=["patch"], url_path="assign-owner")
    def assign_owner(self, request, pk=None):
        _require_admin(request.user)
        project = self.get_object()
        serializer = ProjectOwnershipUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        owner_id = serializer.validated_data["owner_id"]
        project.owner = User.objects.filter(id=owner_id).first() if owner_id is not None else None
        project.save(update_fields=["owner"])
        return Response(ProjectSerializer(project).data)


class StudyViewSet(viewsets.ModelViewSet):
    queryset = Study.objects.select_related("project").all()
    serializer_class = StudySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "celltype", "project__title"]
    ordering_fields = ["id", "project__title", "title", "species", "celltype"]
    ordering = ["project__title", "title", "id"]

    def get_queryset(self):
        queryset = super().get_queryset().annotate(
            sample_count=Count("samples", distinct=True),
            assay_count=Count("samples__assays", distinct=True),
        )
        role = _get_user_role(self.request.user)
        if role == UserProfile.Role.CLIENT:
            queryset = queryset.filter(project__owner=self.request.user)
        project_id = self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    def perform_create(self, serializer) -> None:
        role = _get_user_role(self.request.user)
        project = serializer.validated_data["project"]
        if role == UserProfile.Role.CLIENT and project.owner_id != self.request.user.id:
            raise PermissionDenied("Clients may only create studies within their own projects.")
        study = serializer.save()
        _get_or_create_study_config(study)
        _get_or_create_metadata_mapping(study)

    @action(detail=True, methods=["get", "patch"], url_path="onboarding-state")
    def onboarding_state(self, request, pk=None):
        study = self.get_object()
        _require_study_access(request.user, study)
        state = _get_or_create_onboarding_state(study)

        if request.method.lower() == "patch":
            mappings_payload = request.data.get("mappings", None)
            selected_contrasts_payload = request.data.get("selected_contrasts", None)
            optional_field_keys = request.data.get("optional_field_keys", None)
            custom_field_keys = request.data.get("custom_field_keys", None)
            config_payload = request.data.get("config", None)

            mapping_model = _get_or_create_metadata_mapping(study)

            if mappings_payload is not None:
                normalized_mappings = normalize_mappings(mappings_payload)
                for key, value in normalized_mappings.items():
                    if hasattr(mapping_model, key):
                        setattr(mapping_model, key, value)
                state.mappings = normalized_mappings
            if selected_contrasts_payload is not None:
                normalized_contrasts = normalize_contrast_pairs(selected_contrasts_payload)
                mapping_model.selected_contrasts = normalized_contrasts
                state.selected_contrasts = normalized_contrasts
            if optional_field_keys is not None or custom_field_keys is not None:
                _upsert_study_template(study, optional_field_keys or [], custom_field_keys or [])
            if config_payload is not None:
                config = _get_or_create_study_config(study)
                for section in ("common", "pipeline", "qc", "deseq2"):
                    if section in config_payload:
                        setattr(config, section, config_payload[section])
                config.save()

            mapping_model.save()
            state.status = StudyOnboardingState.Status.DRAFT
            state.finalized_at = None
            state.updated_at = timezone.now()
            state.save(update_fields=["mappings", "selected_contrasts", "status", "finalized_at", "updated_at"])

        mapping_model = _get_or_create_metadata_mapping(study)
        config = _get_or_create_study_config(study)
        return Response(
            {
                "study_id": study.id,
                "status": state.status,
                "metadata_columns": state.metadata_columns,
                "mappings": {**DEFAULT_MAPPINGS, **mapping_model.as_dict()},
                "suggested_contrasts": state.suggested_contrasts,
                "selected_contrasts": mapping_model.selected_contrasts,
                "template_columns": get_study_template_columns(study),
                "config": {
                    "common": config.common,
                    "pipeline": config.pipeline,
                    "qc": config.qc,
                    "deseq2": config.deseq2,
                },
                "updated_at": state.updated_at.isoformat() if state.updated_at else None,
                "finalized_at": state.finalized_at.isoformat() if state.finalized_at else None,
            }
        )

    @action(detail=True, methods=["post"], url_path="onboarding-finalize")
    def onboarding_finalize(self, request, pk=None):
        study = self.get_object()
        _require_study_access(request.user, study)
        state = _get_or_create_onboarding_state(study)
        mapping_model = _get_or_create_metadata_mapping(study)
        mappings = {**DEFAULT_MAPPINGS, **mapping_model.as_dict()}

        errors = _study_finalize_errors(study)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        onboarding_errors = validate_final_ready(metadata_columns=get_study_template_columns(study), mappings=mappings)
        if onboarding_errors:
            return Response({"errors": onboarding_errors}, status=status.HTTP_400_BAD_REQUEST)

        state.status = StudyOnboardingState.Status.FINAL
        now = timezone.now()
        state.finalized_at = now
        state.updated_at = now
        state.save(update_fields=["status", "finalized_at", "updated_at"])
        study.status = Study.Status.ACTIVE
        study.save(update_fields=["status"])
        return Response(
            {
                "study_id": study.id,
                "status": state.status,
                "metadata_columns": state.metadata_columns,
                "mappings": mappings,
                "suggested_contrasts": state.suggested_contrasts,
                "selected_contrasts": mapping_model.selected_contrasts,
                "updated_at": state.updated_at.isoformat(),
                "finalized_at": state.finalized_at.isoformat(),
            }
        )


class SampleViewSet(viewsets.ModelViewSet):
    queryset = Sample.objects.select_related("study", "study__project").all()
    serializer_class = SampleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["sample_ID", "sample_name", "description"]
    ordering_fields = ["id", "sample_ID", "sample_name"]
    ordering = ["id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = _get_user_role(self.request.user)
        if role == UserProfile.Role.CLIENT:
            queryset = queryset.filter(study__project__owner=self.request.user)
        study_id = self.request.query_params.get("study_id")
        if study_id:
            queryset = queryset.filter(study_id=study_id)
        return queryset

    def create(self, request, *args, **kwargs):
        many = isinstance(request.data, list)
        if many:
            try:
                validated_rows = validate_sample_import_rows(request.data)
            except SampleImportValidationError as exc:
                return Response(exc.errors, status=status.HTTP_400_BAD_REQUEST)

            role = _get_user_role(request.user)
            if role == UserProfile.Role.CLIENT:
                for item in validated_rows:
                    if item["study"].project.owner_id != request.user.id:
                        raise PermissionDenied("Clients may only create samples within their own projects.")

            created_samples = create_samples_from_validated_rows(validated_rows)
            serializer = self.get_serializer(created_samples, many=True)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

        serializer = self.get_serializer(data=request.data, many=many)
        serializer.is_valid(raise_exception=True)
        role = _get_user_role(request.user)
        if role == UserProfile.Role.CLIENT:
            studies = serializer.validated_data if many else [serializer.validated_data]
            for item in studies:
                if item["study"].project.owner_id != request.user.id:
                    raise PermissionDenied("Clients may only create samples within their own projects.")
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class AssayViewSet(viewsets.ModelViewSet):
    queryset = Assay.objects.select_related("sample", "sample__study", "sample__study__project").all()
    serializer_class = AssaySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        role = _get_user_role(self.request.user)
        if role == UserProfile.Role.CLIENT:
            queryset = queryset.filter(sample__study__project__owner=self.request.user)
        sample_id = self.request.query_params.get("sample_id")
        study_id = self.request.query_params.get("study_id")
        if sample_id:
            queryset = queryset.filter(sample_id=sample_id)
        if study_id:
            queryset = queryset.filter(sample__study_id=study_id)
        return queryset

    def perform_create(self, serializer) -> None:
        role = _get_user_role(self.request.user)
        sample = serializer.validated_data["sample"]
        if role == UserProfile.Role.CLIENT and sample.study.project.owner_id != self.request.user.id:
            raise PermissionDenied("Clients may only create assays within their own projects.")
        serializer.save()


class AuthViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    @action(detail=False, methods=["post"], url_path="login")
    def login(self, request):
        user = authenticate(
            request,
            username=request.data.get("username", ""),
            password=request.data.get("password", ""),
        )
        if user is None:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_400_BAD_REQUEST)

        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": AuthUserSerializer(user).data})

    @action(detail=False, methods=["post"], url_path="logout")
    def logout(self, request):
        if request.user.is_authenticated:
            Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(AuthUserSerializer(request.user).data)


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("profile").all().order_by("username")

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in {"partial_update", "update"}:
            return UserRoleUpdateSerializer
        return UserAdminSerializer

    def get_queryset(self):
        _require_admin(self.request.user)
        return super().get_queryset()

    def create(self, request, *args, **kwargs):
        _require_admin(request.user)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        _require_admin(request.user)
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserAdminSerializer(user).data)
