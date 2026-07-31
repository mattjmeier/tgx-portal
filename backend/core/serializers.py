from django.contrib.auth import get_user_model
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from pydantic import ValidationError as PydanticValidationError
from rest_framework import serializers

from .models import Assay, DatabaseBackup, PlaneWorkItemSync, Project, Sample, Study, StudyConfig, UserProfile
from .services import validate_sample_payload

User = get_user_model()


class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    owner_id = serializers.IntegerField(source="owner.id", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "collaboration_key",
            "owner",
            "owner_id",
            "pi_name",
            "researcher_name",
            "bioinformatician_assigned",
            "title",
            "description",
            "created_at",
        ]
        read_only_fields = ["id", "collaboration_key", "created_at"]


class StudySerializer(serializers.ModelSerializer):
    project_title = serializers.CharField(source="project.title", read_only=True)
    sample_count = serializers.IntegerField(read_only=True)
    assay_count = serializers.IntegerField(read_only=True)
    description = serializers.CharField(required=False, allow_blank=True)
    species = serializers.ChoiceField(
        choices=Study.Species.choices,
        required=False,
        allow_null=True,
    )
    celltype = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    treatment_var = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    batch_var = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    config = serializers.SerializerMethodField()
    metadata_mapping = serializers.SerializerMethodField()
    metadata_template = serializers.SerializerMethodField()
    plane_sync = serializers.SerializerMethodField()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        for field in ("species", "celltype", "treatment_var", "batch_var"):
            if attrs.get(field) is None:
                attrs[field] = ""

        return attrs

    class Meta:
        model = Study
        fields = [
            "id",
            "project",
            "project_title",
            "title",
            "description",
            "status",
            "species",
            "celltype",
            "treatment_var",
            "batch_var",
            "updated_at",
            "config",
            "metadata_mapping",
            "metadata_template",
            "plane_sync",
            "sample_count",
            "assay_count",
        ]
        read_only_fields = ["id", "status", "updated_at"]
        validators = []

    def get_config(self, obj: Study) -> dict[str, Any] | None:
        config = getattr(obj, "config", None)
        if config is None:
            return None
        return {
            "common": config.common,
            "pipeline": config.pipeline,
            "qc": config.qc,
            "deseq2": config.deseq2,
        }

    def get_metadata_mapping(self, obj: Study) -> dict[str, Any] | None:
        mapping = getattr(obj, "metadata_mapping", None)
        if mapping is None:
            return None
        return {**mapping.as_dict(), "selected_contrasts": mapping.selected_contrasts}

    def get_metadata_template(self, obj: Study) -> list[dict[str, Any]]:
        return [
            {
                "key": selection.field_definition.key,
                "label": selection.column_label_override or selection.field_definition.label,
                "required": selection.required,
                "sort_order": selection.sort_order,
                "data_type": selection.field_definition.data_type,
            }
            for selection in obj.metadata_field_selections.select_related("field_definition").filter(is_active=True).order_by("sort_order", "id")
        ]

    def get_plane_sync(self, obj: Study) -> dict[str, Any] | None:
        request = self.context.get("request")
        role = getattr(getattr(getattr(request, "user", None), "profile", None), "role", None)
        if role != UserProfile.Role.ADMIN:
            return None

        sync: PlaneWorkItemSync | None = getattr(obj, "plane_work_item_sync", None)
        if sync is None:
            return None
        return {
            "status": sync.status,
            "attempt_count": sync.attempt_count,
            "last_error": sync.last_error,
            "plane_work_item_id": sync.plane_work_item_id,
            "plane_work_item_url": sync.plane_work_item_url,
            "updated_at": sync.updated_at.isoformat() if sync.updated_at else None,
        }


class SampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sample
        fields = [
            "id",
            "study",
            "sample_ID",
            "sample_name",
            "description",
            "technical_control",
            "reference_rna",
            "solvent_control",
            "metadata",
        ]
        read_only_fields = ["id"]
        validators = [
            serializers.UniqueTogetherValidator(
                queryset=Sample.objects.all(),
                fields=["study", "sample_ID"],
                message="This sample_ID already exists within the selected study.",
            )
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        study = attrs.get("study")
        payload = {
            **attrs,
            "study": study.id if hasattr(study, "id") else study,
        }

        try:
            normalized = validate_sample_payload(payload)
        except PydanticValidationError as exc:
            raise serializers.ValidationError(exc.errors()) from exc
        except DjangoValidationError as exc:
            raise serializers.ValidationError(getattr(exc, "message_dict", {"non_field_errors": exc.messages})) from exc

        attrs["metadata"] = normalized["metadata"]
        return attrs


class StudyConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyConfig
        fields = ["common", "pipeline", "qc", "deseq2"]


class AssaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Assay
        fields = [
            "id",
            "sample",
            "platform",
            "genome_version",
            "quantification_method",
        ]
        read_only_fields = ["id"]


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["role"]


class AuthUserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "profile"]


class UserAdminSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    owned_project_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "is_staff", "profile", "owned_project_count"]


class UserCreateSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=UserProfile.Role.choices, write_only=True)
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "role"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        user.profile.role = role
        user.profile.save()
        return user


class UserRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)

    def update(self, instance, validated_data):
        instance.profile.role = validated_data["role"]
        instance.profile.save()
        return instance

    def create(self, validated_data):
        raise NotImplementedError


class DatabaseBackupSerializer(serializers.ModelSerializer):
    initiated_by = serializers.CharField(source="initiated_by.username", read_only=True)

    class Meta:
        model = DatabaseBackup
        fields = [
            "id",
            "status",
            "verification_status",
            "filename",
            "size_bytes",
            "sha256",
            "postgres_version",
            "error_message",
            "initiated_by",
            "created_at",
            "started_at",
            "completed_at",
            "verified_at",
        ]
        read_only_fields = fields


class ProjectOwnershipUpdateSerializer(serializers.Serializer):
    owner_id = serializers.IntegerField(allow_null=True)

    def validate_owner_id(self, value):
        if value is None:
            return value

        try:
            user = User.objects.get(id=value)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("Selected owner was not found.") from exc

        if user.profile.role != UserProfile.Role.CLIENT:
            raise serializers.ValidationError("Projects may only be assigned to client users.")

        return value
