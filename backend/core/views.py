from django.http import HttpResponse, JsonResponse
import logging
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils.text import slugify
from profiling.models import ProfilingPlatform
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
    build_geo_metadata_csv,
    summarize_geo_metadata_export,
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


def _profiling_platform_for_common_config(common: dict) -> ProfilingPlatform | None:
    platform_name = str(common.get("profiling_platform_name") or "").strip()
    technology_type = str(common.get("platform") or "").strip()
    if not platform_name:
        return None

    queryset = ProfilingPlatform.objects.filter(platform_name=platform_name)
    if technology_type:
        queryset = queryset.filter(technology_type=technology_type)
    return queryset.first()


def _normalize_config_sections_from_platform(config_payload: dict) -> dict:
    normalized = {
        section: dict(config_payload.get(section) or {})
        for section in ("common", "pipeline", "qc", "deseq2")
        if section in config_payload
    }
    common = normalized.get("common")
    if common is None:
        return normalized

    profiling_platform = _profiling_platform_for_common_config(common)
    if profiling_platform is None:
        return normalized

    common["platform"] = profiling_platform.technology_type
    common["profiling_platform_name"] = profiling_platform.platform_name
    if profiling_platform.technology_type == ProfilingPlatform.TechnologyType.TEMPO_SEQ:
        biospyder_kit = (profiling_platform.ext or {}).get("biospyder_kit")
        common["biospyder_kit"] = biospyder_kit if isinstance(biospyder_kit, str) and biospyder_kit else None
    else:
        common["biospyder_kit"] = None
    return normalized


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
        profiling_platform_name = str((config.common or {}).get("profiling_platform_name") or "").strip()
        matching_platforms = ProfilingPlatform.objects.filter(technology_type=platform) if platform else ProfilingPlatform.objects.none()
        profiling_platform = _profiling_platform_for_common_config(config.common or {})

        if not platform:
            errors.setdefault("config.common.platform", []).append("Select a platform before finalizing onboarding.")
        elif matching_platforms.exists():
            if not profiling_platform_name:
                errors.setdefault("config.common.profiling_platform_name", []).append(
                    "Select a canonical profiling platform before finalizing onboarding."
                )
            elif profiling_platform is None:
                errors.setdefault("config.common.profiling_platform_name", []).append(
                    "Selected profiling platform is not valid for the selected technology."
                )
            elif profiling_platform.species and study.species and profiling_platform.species != study.species:
                errors.setdefault("config.common.profiling_platform_name", []).append(
                    "Selected profiling platform species does not match the study species."
                )
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
        platform_biospyder_kit = (profiling_platform.ext or {}).get("biospyder_kit") if profiling_platform else None
        if platform == "TempO-Seq" and not biospyder_kit and not platform_biospyder_kit:
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


def _stringify_bucket_value(value) -> str:
    if value is None or value == "":
        return "None"
    return str(value)


def _top_metadata_buckets(samples, key: str, limit: int = 8) -> list[dict[str, object]]:
    buckets: dict[str, int] = {}
    for sample in samples:
        value = _stringify_bucket_value((sample.metadata or {}).get(key))
        buckets[value] = buckets.get(value, 0) + 1
    return [
        {"value": value, "count": count}
        for value, count in sorted(buckets.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def _metadata_filter_values(raw_value: str) -> list[object]:
    value = raw_value.strip()
    values: list[object] = [value]
    if value.lower() in {"true", "false"}:
        values.append(value.lower() == "true")
    try:
        int_value = int(value)
    except ValueError:
        int_value = None
    if int_value is not None:
        values.append(int_value)
    try:
        float_value = float(value)
    except ValueError:
        float_value = None
    if float_value is not None and float_value not in values:
        values.append(float_value)
    return values


def _metadata_exact_query(key: str, raw_value: str) -> Q:
    query = Q()
    for value in _metadata_filter_values(raw_value):
        query |= Q(**{f"metadata__{key}": value})
    return query


def _missing_metadata_query(key: str) -> Q:
    normalized = key.strip()
    return (
        Q(**{f"metadata__{normalized}__isnull": True})
        | Q(**{f"metadata__{normalized}": ""})
        | Q(**{f"metadata__{normalized}": None})
    )


def _profiling_platform_lookup_rows() -> list[dict[str, object]]:
    return [
        {
            "id": platform.id,
            "platform_name": platform.platform_name,
            "title": platform.title,
            "description": platform.description,
            "version": platform.version,
            "technology_type": platform.technology_type,
            "study_type": platform.study_type,
            "species": platform.species,
            "species_label": platform.get_species_display() if platform.species else None,
            "url": platform.url,
            "ext": platform.ext,
            "study_count": platform.study_count,
        }
        for platform in ProfilingPlatform.objects.annotate(study_count=Count("studies")).order_by("platform_name", "id")
    ]


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
            "profiling_platforms": _profiling_platform_lookup_rows(),
        }
        return Response(payload)


def _choice_payload(choices) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in choices]


def _controlled_lookup_values() -> dict[str, list[str]]:
    controlled_values: dict[str, list[str]] = {category: [] for category, _ in ControlledLookupValue.Category.choices}
    for item in ControlledLookupValue.objects.filter(is_active=True).order_by("category", "value"):
        controlled_values[item.category].append(item.value)

    if not controlled_values[ControlledLookupValue.Category.PLATFORM]:
        controlled_values[ControlledLookupValue.Category.PLATFORM] = PLATFORM_VALUES.copy()
    if not controlled_values[ControlledLookupValue.Category.INSTRUMENT_MODEL]:
        controlled_values[ControlledLookupValue.Category.INSTRUMENT_MODEL] = ALL_INSTRUMENT_MODELS.copy()
    if not controlled_values[ControlledLookupValue.Category.BIOSPYDER_KIT]:
        controlled_values[ControlledLookupValue.Category.BIOSPYDER_KIT] = BIOSPYDER_KIT_VALUES.copy()

    return controlled_values


class ReferenceLibraryViewSet(viewsets.ViewSet):
    def list(self, request):
        controlled_values = _controlled_lookup_values()
        platform_rows = _profiling_platform_lookup_rows()
        technology_counts = {}
        for row in platform_rows:
            technology_counts[row["technology_type"]] = technology_counts.get(row["technology_type"], 0) + 1

        controlled_platforms = set(controlled_values[ControlledLookupValue.Category.PLATFORM])
        known_technology_types = set(technology_counts)
        drift_warnings = [
            {
                "category": ControlledLookupValue.Category.PLATFORM,
                "value": value,
                "message": "Operational platform lookup has no matching profiling platform technology type.",
            }
            for value in sorted(controlled_platforms - known_technology_types)
        ]

        controlled_lookup_payload = {
            category: {
                "label": label,
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
            for category, label in ControlledLookupValue.Category.choices
            for values in [controlled_values[category]]
        }

        payload = {
            "version": 1,
            "summary": {
                "species_count": len(Study.Species.choices),
                "assay_platform_count": len(Assay.Platform.choices),
                "profiling_platform_count": len(platform_rows),
                "technology_type_count": len(technology_counts),
                "controlled_lookup_count": sum(len(values) for values in controlled_values.values()),
                "drift_warning_count": len(drift_warnings),
            },
            "hierarchy": [
                {
                    "name": "Collaboration",
                    "description": "Top-level container used for ownership, intake, and reporting.",
                    "app_boundary": "core.Project",
                },
                {
                    "name": "Study",
                    "description": "Distinct experiment inside a collaboration, defined by species, cell type, or treatment design.",
                    "app_boundary": "core.Study",
                },
                {
                    "name": "Sample",
                    "description": "Operational biological record for intake, assay attachment, and R-ODAF metadata upload.",
                    "app_boundary": "core.Sample",
                },
                {
                    "name": "Assay",
                    "description": "Operational analytical run applied to a sample for downstream configuration generation.",
                    "app_boundary": "core.Assay",
                },
                {
                    "name": "Profiling platform",
                    "description": "Canonical reusable platform or feature-set registry aligned with UL tgx_platforms.",
                    "app_boundary": "profiling.ProfilingPlatform",
                },
            ],
            "species": _choice_payload(Study.Species.choices),
            "assay_platforms": _choice_payload(Assay.Platform.choices),
            "technology_types": [
                {"value": value, "label": value, "platform_count": count}
                for value, count in sorted(technology_counts.items())
            ],
            "controlled_lookups": controlled_lookup_payload,
            "profiling_platforms": platform_rows,
            "drift_warnings": drift_warnings,
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

    @action(detail=True, methods=["get"], url_path="explorer-summary")
    def explorer_summary(self, request, pk=None):
        study = self.get_object()
        _require_study_access(request.user, study)
        samples = list(study.samples.prefetch_related("assays").all())
        total_samples = len(samples)
        assay_total = sum(sample.assays.count() for sample in samples)
        samples_with_assays = sum(1 for sample in samples if sample.assays.count() > 0)
        samples_missing_assays = max(total_samples - samples_with_assays, 0)
        platform_counts: dict[str, int] = {}
        for sample in samples:
            for assay in sample.assays.all():
                platform_counts[assay.platform] = platform_counts.get(assay.platform, 0) + 1

        try:
            state = study.onboarding_state
        except StudyOnboardingState.DoesNotExist:
            state = None
        try:
            mapping_model = study.metadata_mapping
        except StudyMetadataMapping.DoesNotExist:
            mapping_model = None
        try:
            config = study.config
        except StudyConfig.DoesNotExist:
            config = None

        selected_contrasts = mapping_model.selected_contrasts if mapping_model is not None else []
        suggested_contrasts = state.suggested_contrasts if state is not None else []
        metadata_columns = state.metadata_columns if state is not None else get_study_template_columns(study)
        template_context = normalize_template_context(state.template_context) if state is not None else DEFAULT_TEMPLATE_CONTEXT
        group_builder = normalize_group_builder(state.group_builder) if state is not None else DEFAULT_GROUP_BUILDER
        common_config = config.common if config is not None else {}
        pipeline_config = config.pipeline if config is not None else {}

        issues: list[dict[str, object]] = []
        if total_samples == 0:
            issues.append(
                {
                    "code": "no_samples",
                    "severity": "error",
                    "message": "No samples have been added to this study.",
                    "action_label": "Add samples",
                    "filter": {},
                }
            )
        if samples_missing_assays > 0:
            noun = "sample is" if samples_missing_assays == 1 else "samples are"
            issues.append(
                {
                    "code": "missing_assays",
                    "severity": "warning",
                    "message": f"{samples_missing_assays} {noun} missing assay metadata.",
                    "action_label": "Filter missing assays",
                    "filter": {"assay_status": "missing"},
                }
            )
        if total_samples > 0 and not any(sample.solvent_control for sample in samples):
            issues.append(
                {
                    "code": "no_solvent_controls",
                    "severity": "warning",
                    "message": "No solvent control samples are flagged.",
                    "action_label": "Filter controls",
                    "filter": {"control_flag": "solvent_control"},
                }
            )
        if state is None:
            issues.append(
                {
                    "code": "onboarding_missing",
                    "severity": "error",
                    "message": "Onboarding state has not been created for this study.",
                    "action_label": "Continue onboarding",
                    "filter": {},
                }
            )
        elif state.status != StudyOnboardingState.Status.FINAL:
            issues.append(
                {
                    "code": "onboarding_draft",
                    "severity": "warning",
                    "message": "Onboarding mappings are still in draft.",
                    "action_label": "Continue onboarding",
                    "filter": {},
                }
            )
        if total_samples > 0 and len(selected_contrasts) == 0:
            issues.append(
                {
                    "code": "no_selected_contrasts",
                    "severity": "warning",
                    "message": "No contrasts are selected for config handoff.",
                    "action_label": "Review contrasts",
                    "filter": {},
                }
            )

        for error in _study_finalize_errors(study):
            issues.append(
                {
                    "code": error["field"],
                    "severity": "error",
                    "message": error["message"],
                    "action_label": "Review config",
                    "filter": {},
                }
            )

        if state is not None and mapping_model is not None:
            effective_metadata_columns = get_effective_metadata_columns(
                state.metadata_columns,
                group_builder=group_builder,
                validated_rows=state.validated_rows,
            )
            mappings = {**DEFAULT_MAPPINGS, **mapping_model.as_dict()}
            for error in validate_final_ready(metadata_columns=effective_metadata_columns, mappings=mappings):
                issues.append(
                    {
                        "code": error["field"],
                        "severity": "error",
                        "message": error["message"],
                        "action_label": "Review mappings",
                        "filter": {},
                    }
                )

        readiness_status = "ready"
        readiness_label = "Ready"
        if any(issue["severity"] == "error" for issue in issues):
            readiness_status = "error"
            readiness_label = "Blocked"
        elif issues:
            readiness_status = "warning"
            readiness_label = "Needs attention"

        geo_summary = summarize_geo_metadata_export(study)
        return Response(
            {
                "study_id": study.id,
                "readiness": {
                    "status": readiness_status,
                    "label": readiness_label,
                    "updated_at": state.updated_at.isoformat() if state and state.updated_at else None,
                    "finalized_at": state.finalized_at.isoformat() if state and state.finalized_at else None,
                },
                "sample_summary": {
                    "total": total_samples,
                    "technical_controls": sum(1 for sample in samples if sample.technical_control),
                    "reference_rna_controls": sum(1 for sample in samples if sample.reference_rna),
                    "solvent_controls": sum(1 for sample in samples if sample.solvent_control),
                },
                "assay_summary": {
                    "total": assay_total,
                    "samples_with_assays": samples_with_assays,
                    "samples_missing_assays": samples_missing_assays,
                    "platforms": [
                        {"value": value, "count": count}
                        for value, count in sorted(platform_counts.items(), key=lambda item: (-item[1], item[0]))
                    ],
                },
                "design_summary": {
                    "groups": _top_metadata_buckets(samples, "group"),
                    "doses": _top_metadata_buckets(samples, "dose"),
                    "chemicals": _top_metadata_buckets(samples, "chemical"),
                    "metadata_columns": metadata_columns,
                    "treatment_vars": template_context.get("treatment_vars", []),
                    "batch_vars": template_context.get("batch_vars", []),
                },
                "contrast_summary": {
                    "selected_count": len(selected_contrasts),
                    "suggested_count": len(suggested_contrasts),
                    "selected": selected_contrasts,
                    "suggested": suggested_contrasts,
                },
                "config_summary": {
                    "platform": common_config.get("platform") or "Not selected",
                    "sequencing_mode": pipeline_config.get("mode") or "",
                    "instrument_model": common_config.get("instrument_model") or "",
                    "sequenced_by": common_config.get("sequenced_by") or "",
                    "biospyder_kit": common_config.get("biospyder_kit"),
                    "can_download_config": _get_user_role(request.user) == UserProfile.Role.ADMIN
                    and state is not None
                    and state.status == StudyOnboardingState.Status.FINAL
                    and not any(issue["severity"] == "error" for issue in issues),
                },
                "geo_summary": {
                    "can_download_csv": geo_summary.can_download_csv,
                    "populated_field_count": geo_summary.populated_field_count,
                    "total_field_count": geo_summary.total_field_count,
                    "manual_field_labels": geo_summary.manual_field_labels,
                },
                "blocking_issues": issues,
            }
        )

    @action(detail=True, methods=["get"], url_path="geo-metadata-csv")
    def geo_metadata_csv(self, request, pk=None):
        study = self.get_object()
        _require_study_access(request.user, study)
        bundle = build_geo_metadata_csv(study)
        response = HttpResponse(bundle.content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{bundle.filename}"'
        return response

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
                normalized_config_payload = _normalize_config_sections_from_platform(config_payload)
                config = _get_or_create_study_config(study)
                for section in ("common", "pipeline", "qc", "deseq2"):
                    if section in normalized_config_payload:
                        setattr(config, section, normalized_config_payload[section])
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
        for metadata_key in ("group", "dose", "chemical"):
            raw_value = self.request.query_params.get(metadata_key)
            if raw_value:
                queryset = queryset.filter(_metadata_exact_query(metadata_key, raw_value))
        control_flag = self.request.query_params.get("control_flag")
        if control_flag in {"technical_control", "reference_rna", "solvent_control"}:
            queryset = queryset.filter(**{control_flag: True})
        elif control_flag == "any":
            queryset = queryset.filter(
                Q(technical_control=True)
                | Q(reference_rna=True)
                | Q(solvent_control=True)
            )
        assay_status = self.request.query_params.get("assay_status")
        if assay_status in {"present", "missing"}:
            assay_exists = Assay.objects.filter(sample_id=OuterRef("pk"))
            queryset = queryset.annotate(has_assay=Exists(assay_exists))
            queryset = queryset.filter(has_assay=assay_status == "present")
        missing_metadata = self.request.query_params.get("missing_metadata")
        if missing_metadata:
            missing_query = Q()
            for key in [item.strip() for item in missing_metadata.split(",") if item.strip()]:
                missing_query |= _missing_metadata_query(key)
            if missing_query:
                queryset = queryset.filter(missing_query)
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
