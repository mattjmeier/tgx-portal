# tgx-portal — AI Context Map

> **Stack:** django | none | unknown | python

> 4 routes | 0 models | 0 components | 22 lib files | 11 env vars | 1 middleware | 88 import links
> **Token savings:** this file is ~2,100 tokens. Without it, AI exploration would cost ~18,600 tokens. **Saves ~16,500 tokens per conversation.**

---

# Routes

- `ALL` `/admin/` params()
- `ALL` `/api/` params()
- `ALL` `/health/` params() [auth]
- `ALL` `/` params() [auth]

---

# Libraries

- `backend/core/apps.py` — class CoreConfig
- `backend/core/management/commands/bootstrap_dev_user.py` — class Command
- `backend/core/migrations/0001_initial.py` — class Migration
- `backend/core/migrations/0002_add_uniqueness_constraints.py` — class Migration
- `backend/core/migrations/0003_project_owner_userprofile.py` — class Migration
- `backend/core/models.py`
  - class Project
  - class Study
  - class Sample
  - class SequencingRun
  - class Assay
  - class SamplePlating
  - _...1 more_
- `backend/core/pagination.py` — class StandardResultsSetPagination
- `backend/core/serializers.py`
  - class ProjectSerializer
  - class StudySerializer
  - class SampleSerializer
  - class AssaySerializer
  - class UserProfileSerializer
  - class AuthUserSerializer
  - _...4 more_
- `backend/core/services.py`
  - function validate_sample_payload: (payload, Any]) -> dict[str, Any]
  - function validate_sample_import_rows: (rows, Any]]) -> list[dict[str, Any]]
  - function create_samples_from_validated_rows: (normalized_rows, Any]]) -> list[Sample]
  - function create_samples_from_rows: (rows, Any]]) -> list[Sample]
  - function build_project_config_bundle: (project) -> ConfigBundle
  - class ConfigGenerationError
  - _...3 more_
- `backend/core/signals.py` — function create_user_profile: (sender, instance, created, **kwargs)
- `backend/core/tasks.py` — function create_plane_ticket: (project_id) -> None
- `backend/core/tests.py`
  - class HealthcheckTests
  - class SampleModelTests
  - class ProjectApiTests
  - class StudyApiTests
  - class SampleApiTests
  - class AssayApiTests
  - _...3 more_
- `backend/core/views.py`
  - function healthcheck_view: (_request)
  - class ProjectViewSet
  - class StudyViewSet
  - class SampleViewSet
  - class AssayViewSet
  - class AuthViewSet
  - _...1 more_
- `backend/manage.py` — function main: () -> None
- `frontend/src/api/assays.ts`
  - function fetchAssays: (studyId) => Promise<PaginatedResponse<Assay>>
  - function createAssay: (payload) => Promise<Assay>
  - function deleteAssay: (assayId) => Promise<void>
  - type Assay
  - type CreateAssayPayload
- `frontend/src/api/auth.ts`
  - function loginUser: (username, password) => Promise<
  - function fetchCurrentUser: (token) => Promise<AuthenticatedUser>
  - function logoutUser: (token) => Promise<void>
  - type AuthenticatedUser
- `frontend/src/api/http.ts`
  - function getStoredAuthToken: () => string | null
  - function setStoredAuthToken: (token) => void
  - function apiFetch: (input, init) => Promise<Response>
  - function parseErrorMessage: (response, fallbackMessage) => Promise<string>
- `frontend/src/api/projects.ts`
  - function fetchProjects: () => Promise<PaginatedResponse<Project>>
  - function fetchProject: (projectId) => Promise<Project>
  - function createProject: (payload) => Promise<Project>
  - function deleteProject: (projectId) => Promise<void>
  - function downloadProjectConfig: (projectId) => Promise<Blob>
  - function assignProjectOwner: (projectId, ownerId) => Promise<Project>
  - _...3 more_
- `frontend/src/api/samples.ts`
  - function fetchSamples: (studyId, params) => Promise<PaginatedResponse<Sample>>
  - function createSample: (payload) => Promise<Sample>
  - function deleteSample: (sampleId) => Promise<void>
  - function createSamplesBulk: (payload) => Promise<Sample[]>
  - class BulkSampleImportError
  - type Sample
  - _...3 more_
- `frontend/src/api/studies.ts`
  - function fetchStudies: (projectId) => Promise<PaginatedResponse<Study>>
  - function createStudy: (payload) => Promise<Study>
  - function deleteStudy: (studyId) => Promise<void>
  - type Study
  - type CreateStudyPayload
- `frontend/src/api/users.ts`
  - function fetchUsers: () => Promise<PaginatedResponse<ManagedUser>>
  - function createManagedUser: (payload) => Promise<ManagedUser>
  - function updateManagedUserRole: (userId, role) => Promise<ManagedUser>
  - type ManagedUser
- `frontend/src/lib/utils.ts` — function cn: (...inputs) => void

---

# Config

## Environment Variables

- `CELERY_BROKER_URL` **required** — backend/config/settings.py
- `CELERY_TASK_ALWAYS_EAGER` **required** — backend/config/settings.py
- `DATABASE_HOST` **required** — backend/config/settings.py
- `DATABASE_NAME` **required** — backend/config/settings.py
- `DATABASE_PASSWORD` **required** — backend/config/settings.py
- `DATABASE_PORT` **required** — backend/config/settings.py
- `DATABASE_USER` **required** — backend/config/settings.py
- `DJANGO_ALLOWED_HOSTS` **required** — backend/config/settings.py
- `DJANGO_DEBUG` **required** — backend/config/settings.py
- `DJANGO_SECRET_KEY` **required** — backend/config/settings.py
- `VITE_API_BASE_URL` **required** — frontend/src/api/assays.ts

## Config Files

- `docker-compose.yml`
- `frontend/tailwind.config.ts`
- `frontend/vite.config.ts`

---

# Middleware

## auth
- auth — `frontend/src/api/auth.ts`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `frontend/src/api/projects.ts` — imported by **12** files
- `frontend/src/api/samples.ts` — imported by **9** files
- `/models.py` — imported by **7** files
- `frontend/src/auth/AuthProvider.tsx` — imported by **7** files
- `frontend/src/api/http.ts` — imported by **7** files
- `frontend/src/components/ui/button.tsx` — imported by **4** files
- `frontend/src/api/studies.ts` — imported by **3** files
- `/services.py` — imported by **2** files
- `frontend/src/App.tsx` — imported by **2** files
- `frontend/src/components/AppLayout.tsx` — imported by **2** files
- `frontend/src/api/users.ts` — imported by **2** files
- `frontend/src/api/assays.ts` — imported by **2** files
- `frontend/src/components/SampleUploadPanel.tsx` — imported by **2** files
- `/celery.py` — imported by **1** files
- `/views.py` — imported by **1** files
- `/serializers.py` — imported by **1** files
- `/tasks.py` — imported by **1** files
- `frontend/src/auth/RequireAuth.tsx` — imported by **1** files
- `frontend/src/auth/RequireRole.tsx` — imported by **1** files
- `frontend/src/pages/AdminUsersPage.tsx` — imported by **1** files

## Import Map (who imports what)

- `frontend/src/api/projects.ts` ← `frontend/src/api/assays.ts`, `frontend/src/api/samples.ts`, `frontend/src/api/studies.ts`, `frontend/src/api/users.ts`, `frontend/src/components/AdminProjectOwnershipPanel.tsx` +7 more
- `frontend/src/api/samples.ts` ← `frontend/src/api/samples.test.ts`, `frontend/src/components/ProjectWorkspace.tsx`, `frontend/src/components/SampleExplorerTable.tsx`, `frontend/src/components/SampleForm.tsx`, `frontend/src/components/SampleUploadPanel.test.tsx` +4 more
- `/models.py` ← `backend/core/admin.py`, `backend/core/serializers.py`, `backend/core/services.py`, `backend/core/signals.py`, `backend/core/tasks.py` +2 more
- `frontend/src/auth/AuthProvider.tsx` ← `frontend/src/App.test.tsx`, `frontend/src/auth/RequireAuth.tsx`, `frontend/src/auth/RequireRole.tsx`, `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/ProjectWorkspace.tsx` +2 more
- `frontend/src/api/http.ts` ← `frontend/src/api/assays.ts`, `frontend/src/api/auth.ts`, `frontend/src/api/projects.ts`, `frontend/src/api/samples.ts`, `frontend/src/api/studies.ts` +2 more
- `frontend/src/components/ui/button.tsx` ← `frontend/src/components/SampleUploadPanel.tsx`, `frontend/src/components/ui/button.test.tsx`, `frontend/src/components/ui/sidebar.tsx`, `frontend/src/pages/LoginPage.tsx`
- `frontend/src/api/studies.ts` ← `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/ProjectWorkspace.tsx`, `frontend/src/components/StudyForm.tsx`
- `/services.py` ← `backend/core/serializers.py`, `backend/core/views.py`
- `frontend/src/App.tsx` ← `frontend/src/App.test.tsx`, `frontend/src/main.tsx`
- `frontend/src/components/AppLayout.tsx` ← `frontend/src/App.tsx`, `frontend/src/components/AppLayout.test.tsx`

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_