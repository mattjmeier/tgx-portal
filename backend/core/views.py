from django.http import HttpResponse, JsonResponse
import logging
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from rest_framework import filters
from rest_framework.authtoken.models import Token
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Assay, Project, Sample, Study, UserProfile
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
from .services import ConfigGenerationError, build_project_config_bundle
from .tasks import create_plane_ticket

logger = logging.getLogger(__name__)
User = get_user_model()


def _get_user_role(user) -> str | None:
    return getattr(getattr(user, "profile", None), "role", None)


def _require_admin(user) -> None:
    if _get_user_role(user) != UserProfile.Role.ADMIN:
        raise PermissionDenied("Admin access is required for this action.")


def healthcheck_view(_request):
    return JsonResponse({"status": "ok"})


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

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

    def get_queryset(self):
        queryset = super().get_queryset()
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
        serializer.save()


class SampleViewSet(viewsets.ModelViewSet):
    queryset = Sample.objects.select_related("study", "study__project").all()
    serializer_class = SampleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["sample_ID", "sample_name", "group", "chemical", "chemical_longname"]
    ordering_fields = ["id", "sample_ID", "sample_name", "group", "dose"]
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
