from django.http import HttpResponse, JsonResponse
import logging
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.db import transaction
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
    _build_metadata_upload_row,
    _flatten_metadata_upload_row,
    build_project_config_bundle,
    create_samples_from_validated_rows,
    validate_metadata_upload,
    validate_sample_import_rows,
    get_study_template_columns,
)
from .tasks import create_plane_ticket
from .onboarding import (
    DEFAULT_GROUP_BUILDER,
    DEFAULT_MAPPINGS,
    DEFAULT_TEMPLATE_CONTEXT,
    build_group_preview_rows,
    build_compatibility_summary,
    get_effective_metadata_columns,
    get_design_selected_field_keys,
    normalize_contrast_pairs,
    normalize_group_builder,
    normalize_mappings,
    normalize_template_context,
    suggest_contrasts_from_rows,
    validate_final_ready,
    validate_group_builder_for_finalize,
    validate_template_context_for_finalize,
)
from .onboarding_options import (
    ALL_INSTRUMENT_MODELS,
    BIOSPYDER_KIT_LABELS,
    BIOSPYDER_KIT_VALUES,
    PLATFORM_VALUES,
    SEQUENCED_BY_VALUES,
)

logger = logging.getLogger(__name__)
User = get_user_model()

EXCLUDED_TEMPLATE_FIELD_KEYS = {"sequencing_mode"}


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
        defaults={
            "mappings": DEFAULT_MAPPINGS,
            "template_context": DEFAULT_TEMPLATE_CONTEXT,
            "group_builder": DEFAULT_GROUP_BUILDER,
        },
    )
    if created:
        return state

    if not isinstance(state.mappings, dict):
        state.mappings = DEFAULT_MAPPINGS
        state.save(update_fields=["mappings"])
        return state

    if not isinstance(state.template_context, dict):
        state.template_context = DEFAULT_TEMPLATE_CONTEXT
        state.save(update_fields=["template_context"])
        return state

    if not isinstance(state.group_builder, dict):
        state.group_builder = DEFAULT_GROUP_BUILDER
        state.save(update_fields=["group_builder"])
        return state

    merged = {**DEFAULT_MAPPINGS, **{k: v for k, v in state.mappings.items() if isinstance(k, str)}}
    merged_template = normalize_template_context({**DEFAULT_TEMPLATE_CONTEXT, **state.template_context})
    merged_group_builder = normalize_group_builder({**DEFAULT_GROUP_BUILDER, **state.group_builder})
    if (
        merged != state.mappings
        or merged_template != state.template_context
        or merged_group_builder != state.group_builder
    ):
        state.mappings = merged
        state.template_context = merged_template
        state.group_builder = merged_group_builder
        state.save(update_fields=["mappings", "template_context", "group_builder"])
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


def _study_finalize_errors(study: Study) -> list[dict[str, str]]:
    config = getattr(study, "config", None)
    errors: dict[str, list[str]] = {}
    if not study.title:
        errors["title"] = ["Provide a study title before finalizing onboarding."]
    if not study.species:
        errors["species"] = ["Select a species before finalizing onboarding."]
    if not study.celltype:
        errors["celltype"] = ["Provide a cell type before finalizing onboarding."]
    if config is None:
        errors["config"] = ["Persist study configuration before finalizing onboarding."]
    else:
        platform = str((config.common or {}).get("platform") or "").strip()
        instrument_model = str((config.common or {}).get("instrument_model") or "").strip()
        sequenced_by = str((config.common or {}).get("sequenced_by") or "").strip()
        biospyder_kit = (config.common or {}).get("biospyder_kit")
        mode = str((config.pipeline or {}).get("mode") or "").strip()

        if not platform:
            errors.setdefault("config.common.platform", []).append("Select a platform before finalizing onboarding.")
        if not instrument_model:
            errors.setdefault("config.common.instrument_model", []).append(
                "Provide an instrument model before finalizing onboarding."
            )
        if not sequenced_by:
            errors.setdefault("config.common.sequenced_by", []).append(
                "Provide where the study was sequenced before finalizing onboarding."
            )
        if not mode:
            errors.setdefault("config.pipeline.mode", []).append("Choose a sequencing mode before finalizing onboarding.")
        if platform == "TempO-Seq" and not biospyder_kit:
            errors.setdefault("config.common.biospyder_kit", []).append(
                "Select a Biospyder kit before finalizing onboarding."
            )
        if platform in {"TempO-Seq", "DrugSeq"} and mode and mode != "se":
            errors.setdefault("config.pipeline.mode", []).append(
                f"{platform} studies must use single-end sequencing mode."
            )

    flattened: list[dict[str, str]] = []
    for field, messages in errors.items():
        for message in messages:
            flattened.append({"field": field, "message": message})
    return flattened


class LookupViewSet(viewsets.ViewSet):
    def list(self, request):
        projects = _projects_accessible_to_user(request.user)
        studies = Study.objects.filter(project__in=projects)
        pi_values = sorted({value for value in projects.values_list("pi_name", flat=True) if value})
        researcher_values = sorted({value for value in projects.values_list("researcher_name", flat=True) if value})
        celltype_values = sorted({value for value in studies.values_list("celltype", flat=True) if value})

        sequenced_by_values = set()
        for config in StudyConfig.objects.filter(study__in=studies).only("common"):
            value = (config.common or {}).get("sequenced_by")
            if isinstance(value, str) and value.strip():
                sequenced_by_values.add(value.strip())

        controlled_values: dict[str, list[str]] = {category: [] for category, _ in ControlledLookupValue.Category.choices}
        for item in ControlledLookupValue.objects.filter(is_active=True).order_by("category", "value"):
            controlled_values[item.category].append(item.value)
            if item.category == ControlledLookupValue.Category.SEQUENCED_BY and item.value:
                sequenced_by_values.add(item.value)

        if not controlled_values[ControlledLookupValue.Category.PLATFORM]:
            controlled_values[ControlledLookupValue.Category.PLATFORM] = PLATFORM_VALUES.copy()
        if not controlled_values[ControlledLookupValue.Category.INSTRUMENT_MODEL]:
            controlled_values[ControlledLookupValue.Category.INSTRUMENT_MODEL] = ALL_INSTRUMENT_MODELS.copy()
        if not controlled_values[ControlledLookupValue.Category.BIOSPYDER_KIT]:
            controlled_values[ControlledLookupValue.Category.BIOSPYDER_KIT] = BIOSPYDER_KIT_VALUES.copy()
        if not sequenced_by_values:
            sequenced_by_values.update(SEQUENCED_BY_VALUES)

        field_definitions = MetadataFieldDefinition.objects.filter(
            is_active=True,
            scope=MetadataFieldDefinition.Scope.SAMPLE,
        ).exclude(key__in=EXCLUDED_TEMPLATE_FIELD_KEYS).order_by(
            "-required",
            "wizard_featured_order",
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
                "wizard_featured": field.wizard_featured,
                "wizard_featured_order": field.wizard_featured_order,
            }
            for field in field_definitions
        ]

        payload = {
            "version": 2,
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
                    "celltype": {
                        "policy": "scoped_select_or_create",
                        "values": celltype_values,
                    },
                    "sequenced_by": {
                        "policy": "scoped_select_or_create",
                        "values": sorted(sequenced_by_values),
                    },
                },
                "controlled": {
                    category: {
                        "policy": "admin_managed",
                        "values": (
                            [
                                {
                                    "label": BIOSPYDER_KIT_LABELS.get(value, value),
                                    "value": value,
                                }
                                for value in values
                            ]
                            if category == ControlledLookupValue.Category.BIOSPYDER_KIT
                            else values
                        ),
                    }
                    for category, values in controlled_values.items()
                },
                "featured": {
                    "instrument_model": ALL_INSTRUMENT_MODELS[:7],
                },
            },
        }
        return Response(payload)


def _compute_project_code(project: Project) -> str:
    base = slugify(project.title) or "project"
    return f"{base}-{project.id}"


def _normalize_field_key(value: str) -> str:
    return value.strip().replace(" ", "_")


def _upsert_study_template(study: Study, template_context: dict[str, object]):
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
        for item in MetadataFieldDefinition.objects.filter(scope=MetadataFieldDefinition.Scope.SAMPLE).exclude(
            key__in=EXCLUDED_TEMPLATE_FIELD_KEYS
        )
    }

    ordered_keys = [definition.key for definition in core_defs]
    auto_included: list[dict[str, str]] = []
    derived_optional_keys, derived_reasons = get_design_selected_field_keys(
        template_context,
        available_field_keys=set(known_defs.keys()),
    )
    auto_included.extend(derived_reasons)

    def add_key(key: str, reason: str | None = None) -> None:
        if key in ordered_keys:
            return
        ordered_keys.append(key)
        if reason is not None:
            auto_included.append({"key": key, "reason": reason})

    exposure_custom_label = str(template_context.get("exposure_custom_label") or "").strip()
    for key in derived_optional_keys:
        if key not in known_defs and exposure_custom_label and key == _normalize_field_key(exposure_custom_label):
            definition = MetadataFieldDefinition.objects.create(
                key=key,
                label=exposure_custom_label,
                group="Toxicology",
                description="Exposure metadata field selected during onboarding.",
                scope=MetadataFieldDefinition.Scope.SAMPLE,
                system_key=key,
                data_type=MetadataFieldDefinition.DataType.STRING,
                kind=MetadataFieldDefinition.Kind.CUSTOM,
                required=False,
                is_core=False,
                allow_null=True,
                wizard_featured=False,
                wizard_featured_order=0,
            )
            known_defs[key] = definition
        add_key(key)

    for raw_key in template_context.get("treatment_vars", []):
        key = _normalize_field_key(raw_key)
        if key in EXCLUDED_TEMPLATE_FIELD_KEYS:
            continue
        if key not in known_defs:
            definition = MetadataFieldDefinition.objects.create(
                key=key,
                label=raw_key.strip() or key,
                group="Study design",
                description="Primary experimental variable selected during onboarding.",
                scope=MetadataFieldDefinition.Scope.SAMPLE,
                system_key=key,
                data_type=MetadataFieldDefinition.DataType.STRING,
                kind=MetadataFieldDefinition.Kind.CUSTOM,
                required=False,
                is_core=False,
                allow_null=True,
                wizard_featured=False,
                wizard_featured_order=0,
            )
            known_defs[key] = definition
        add_key(key, reason="primary experimental variable selected")

    for raw_key in template_context.get("batch_vars", []):
        key = _normalize_field_key(raw_key)
        if key in EXCLUDED_TEMPLATE_FIELD_KEYS:
            continue
        if key not in known_defs:
            definition = MetadataFieldDefinition.objects.create(
                key=key,
                label=raw_key.strip() or key,
                group="Study design",
                description="Primary batch variable selected during onboarding.",
                scope=MetadataFieldDefinition.Scope.SAMPLE,
                system_key=key,
                data_type=MetadataFieldDefinition.DataType.STRING,
                kind=MetadataFieldDefinition.Kind.CUSTOM,
                required=False,
                is_core=False,
                allow_null=True,
                wizard_featured=False,
                wizard_featured_order=0,
            )
            known_defs[key] = definition
        add_key(key, reason="primary batch variable selected")

    for raw_key in template_context.get("optional_field_keys", []):
        key = _normalize_field_key(raw_key)
        if key in EXCLUDED_TEMPLATE_FIELD_KEYS:
            continue
        if key not in known_defs:
            raise ValueError(f"Unknown metadata field definitions: {key}")
        add_key(key)
        for included_key in known_defs[key].auto_include_keys or []:
            add_key(included_key, reason=f"{key} selected")

    for raw_key in template_context.get("custom_field_keys", []):
        key = _normalize_field_key(raw_key)
        if key in EXCLUDED_TEMPLATE_FIELD_KEYS:
            continue
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
                wizard_featured=False,
                wizard_featured_order=0,
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
        template_context_payload = request.data.get("template_context")

        if not study_id:
            return Response({"study_id": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(optional_field_keys, list) or not isinstance(custom_field_keys, list):
            return Response({"detail": "optional_field_keys and custom_field_keys must be lists."}, status=status.HTTP_400_BAD_REQUEST)

        study = Study.objects.select_related("project").filter(id=study_id).first()
        if study is None:
            return Response({"detail": "Study not found."}, status=status.HTTP_404_NOT_FOUND)
        _require_study_access(request.user, study)

        try:
            template_context = normalize_template_context(
                template_context_payload
                or {
                    "optional_field_keys": optional_field_keys,
                    "custom_field_keys": custom_field_keys,
                }
            )
            columns, auto_included, deprecated = _upsert_study_template(study, template_context)
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
        is_valid, issues = validate_metadata_upload(
            study_id=study.id,
            rows=normalized_rows,
            expected_columns=expected_columns,
        )

        prepared_rows = [
            _build_metadata_upload_row(row, study_id=study.id)
            for row in normalized_rows
        ]
        preview_rows = [
            _flatten_metadata_upload_row(row)
            for row in prepared_rows
        ]

        state = _get_or_create_onboarding_state(study)
        derived_preview_rows = build_group_preview_rows(preview_rows, state.group_builder)
        suggested_contrasts = suggest_contrasts_from_rows(derived_preview_rows)
        state.metadata_columns = columns
        state.validated_rows = preview_rows
        state.suggested_contrasts = suggested_contrasts
        state.updated_at = timezone.now()
        state.save(update_fields=["metadata_columns", "validated_rows", "suggested_contrasts", "updated_at"])

        return Response(
            {
                "valid": is_valid,
                "issues": issues,
                "columns": columns,
                "validated_rows": preview_rows,
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
            effective_columns = get_effective_metadata_columns(
                state.metadata_columns,
                group_builder=state.group_builder,
                validated_rows=state.validated_rows,
            )
            errors = validate_final_ready(
                metadata_columns=effective_columns,
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
            template_context_payload = request.data.get("template_context", None)
            config_payload = request.data.get("config", None)
            group_builder_payload = request.data.get("group_builder", None)

            mapping_model = _get_or_create_metadata_mapping(study)
            normalized_template_context = normalize_template_context(state.template_context)
            normalized_group_builder = normalize_group_builder(state.group_builder)

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
            if template_context_payload is not None:
                normalized_template_context = normalize_template_context(template_context_payload)
            elif optional_field_keys is not None or custom_field_keys is not None:
                normalized_template_context = normalize_template_context(
                    {
                        **normalized_template_context,
                        "optional_field_keys": optional_field_keys
                        if optional_field_keys is not None
                        else normalized_template_context.get("optional_field_keys", []),
                        "custom_field_keys": custom_field_keys
                        if custom_field_keys is not None
                        else normalized_template_context.get("custom_field_keys", []),
                    }
                )
            if template_context_payload is not None or optional_field_keys is not None or custom_field_keys is not None:
                state.template_context = normalized_template_context
                _upsert_study_template(study, normalized_template_context)
            if group_builder_payload is not None:
                normalized_group_builder = normalize_group_builder(group_builder_payload)
                state.group_builder = normalized_group_builder
            if config_payload is not None:
                config = _get_or_create_study_config(study)
                for section in ("common", "pipeline", "qc", "deseq2"):
                    if section in config_payload:
                        setattr(config, section, config_payload[section])
                config.save()

            if state.validated_rows:
                preview_rows = build_group_preview_rows(state.validated_rows, normalized_group_builder)
                state.suggested_contrasts = suggest_contrasts_from_rows(preview_rows)

            mapping_model.save()
            state.status = StudyOnboardingState.Status.DRAFT
            state.finalized_at = None
            state.updated_at = timezone.now()
            state.save(
                update_fields=[
                    "mappings",
                    "group_builder",
                    "template_context",
                    "selected_contrasts",
                    "suggested_contrasts",
                    "validated_rows",
                    "status",
                    "finalized_at",
                    "updated_at",
                ]
            )

        mapping_model = _get_or_create_metadata_mapping(study)
        config = _get_or_create_study_config(study)
        return Response(
            {
                "study_id": study.id,
                "status": state.status,
                "metadata_columns": state.metadata_columns,
                "validated_rows": state.validated_rows,
                "mappings": {**DEFAULT_MAPPINGS, **mapping_model.as_dict()},
                "group_builder": normalize_group_builder(state.group_builder),
                "template_context": normalize_template_context(state.template_context),
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
        group_builder = normalize_group_builder(state.group_builder)
        template_context = normalize_template_context(state.template_context)
        effective_metadata_columns = get_effective_metadata_columns(
            state.metadata_columns,
            group_builder=group_builder,
            validated_rows=state.validated_rows,
        )

        errors = _study_finalize_errors(study)
        group_builder_errors = validate_group_builder_for_finalize(
            group_builder,
            metadata_columns=state.metadata_columns,
            validated_rows=state.validated_rows,
        )
        template_context_errors = validate_template_context_for_finalize(
            template_context,
            metadata_columns=effective_metadata_columns,
        )
        onboarding_errors = validate_final_ready(metadata_columns=effective_metadata_columns, mappings=mappings)
        all_errors = errors + group_builder_errors + template_context_errors + onboarding_errors
        if all_errors:
            return Response({"errors": all_errors}, status=status.HTTP_400_BAD_REQUEST)

        if state.validated_rows and not study.samples.exists():
            try:
                validated_rows = validate_sample_import_rows(
                    [
                        _build_metadata_upload_row(
                            _flatten_metadata_upload_row(row) if isinstance(row, dict) else row,
                            study_id=study.id,
                        )
                        for row in state.validated_rows
                    ]
                )
            except SampleImportValidationError as exc:
                validated_rows = []

            if validated_rows:
                create_samples_from_validated_rows(validated_rows)

        with transaction.atomic():
            state.status = StudyOnboardingState.Status.FINAL
            now = timezone.now()
            state.finalized_at = now
            state.updated_at = now
            state.save(update_fields=["status", "finalized_at", "updated_at"])
            study.status = Study.Status.ACTIVE
            study.treatment_var = build_compatibility_summary(template_context.get("treatment_vars", []))
            study.batch_var = build_compatibility_summary(template_context.get("batch_vars", []))
            study.save(update_fields=["status", "treatment_var", "batch_var"])
        return Response(
            {
                "study_id": study.id,
                "status": state.status,
                "metadata_columns": state.metadata_columns,
                "validated_rows": state.validated_rows,
                "mappings": mappings,
                "group_builder": group_builder,
                "template_context": template_context,
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
    queryset = User.objects.select_related("profile").annotate(
        owned_project_count=Count("owned_projects", distinct=True),
    )
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["username", "email"]
    ordering_fields = ["username", "email", "profile__role", "owned_project_count"]
    ordering = ["username"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in {"partial_update", "update"}:
            return UserRoleUpdateSerializer
        return UserAdminSerializer

    def get_queryset(self):
        _require_admin(self.request.user)
        queryset = super().get_queryset()
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(profile__role=role)
        return queryset

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
