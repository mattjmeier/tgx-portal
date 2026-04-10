from django.contrib.auth import get_user_model
from typing import Any

from pydantic import ValidationError as PydanticValidationError
from rest_framework import serializers

from .models import Assay, Project, Sample, Study, UserProfile
from .services import validate_sample_payload

User = get_user_model()


class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    owner_id = serializers.IntegerField(source="owner.id", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "owner",
            "owner_id",
            "pi_name",
            "researcher_name",
            "bioinformatician_assigned",
            "title",
            "description",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


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

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = getattr(self, "instance", None)
        project = attrs.get("project", getattr(instance, "project", None))
        species = attrs.get("species", getattr(instance, "species", None))
        celltype = attrs.get("celltype", getattr(instance, "celltype", None))
        treatment_var = attrs.get("treatment_var", getattr(instance, "treatment_var", None))
        batch_var = attrs.get("batch_var", getattr(instance, "batch_var", None))

        if all([project, species, celltype, treatment_var, batch_var]):
            duplicate_queryset = Study.objects.filter(
                project=project,
                species=species,
                celltype=celltype,
                treatment_var=treatment_var,
                batch_var=batch_var,
            )
            if instance is not None:
                duplicate_queryset = duplicate_queryset.exclude(pk=instance.pk)
            if duplicate_queryset.exists():
                raise serializers.ValidationError(
                    {"non_field_errors": ["An identical study already exists for this project."]}
                )

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
            "sample_count",
            "assay_count",
        ]
        read_only_fields = ["id", "status"]
        validators = []


class SampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sample
        fields = [
            "id",
            "study",
            "sample_ID",
            "sample_name",
            "description",
            "group",
            "chemical",
            "chemical_longname",
            "dose",
            "technical_control",
            "reference_rna",
            "solvent_control",
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
            validate_sample_payload(payload)
        except PydanticValidationError as exc:
            raise serializers.ValidationError(exc.errors()) from exc

        return attrs


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

    class Meta:
        model = User
        fields = ["id", "username", "email", "is_staff", "profile"]


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
