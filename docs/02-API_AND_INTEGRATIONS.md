# Backend API & Integrations

## RESTful Endpoints (Django REST Framework)
All endpoints must support DRF `PageNumberPagination` to integrate seamlessly with the frontend TanStack tables.

* `GET/POST /api/projects/` (Filtered by `request.user` role)
* `GET/POST /api/studies/`
  * `GET/PATCH /api/studies/{id}/onboarding-state/` includes final-review `analysis_notes` alongside mappings, group builder, selected contrasts, template context, and config sections.
* `GET/POST /api/samples/`
  * Requires support for bulk creation (for spreadsheet ingestion).
  * `GET` must support query params for exporting data: `?study_id=X&has_raw_data=true`.
* `GET /api/exports/labels/` (Returns PDF/CSV for printing shipping/tube labels).

## Warehouse API Status
The `chemicals` Django app still exposes its models through Django admin only. There are no public REST endpoints yet for:

* `/api/chemicals/`
* POD/series/well browser views

When those APIs are added, they must be additive and must not change the existing project/study/sample/config endpoints. Use `docs/06-SCHEMA_HARMONIZATION.md` as the source of truth for warehouse terminology and UL schema mapping.

The `profiling` app now exposes admin-only study import staging endpoints:

* `POST /api/profiling/study-imports/`
* `GET/PATCH /api/profiling/study-imports/{id}/`
* `POST /api/profiling/study-imports/{id}/metadata-preview/`
* `POST /api/profiling/study-imports/{id}/contrasts-preview/`
* `POST /api/profiling/study-imports/{id}/count-resource/`
* `POST /api/profiling/study-imports/{id}/commit/`

These endpoints support a metadata-first import workflow:
* metadata and contrasts are parsed and validated into staging rows
* count matrices are registered as provenance-backed resources only
* commit creates the portal study, warehouse metadata, samples, and resource links transactionally

## External Integrations

### 1. Plane Project Management (Triggered on Study Onboarding Finalization)
When a `Study` successfully transitions to final onboarding state through `POST /api/studies/{id}/onboarding-finalize/`, trigger the Celery task `sync_study_to_plane`.
* **Action**: Make a POST request to the Plane `/work-items/` API for the configured workspace and project.
* **Payload mappings**:
  * Work item name = `Onboard TGx study: {Study.title}`.
  * Work item description = TGx project title, PI, researcher, assigned bioinformatician, study species/cell type, finalized timestamp, and portal onboarding link.
  * Priority = `medium`.
* **Visibility**: Store sync attempts in `PlaneWorkItemSync` and inspect them in Django admin.
* **Idempotency**: Re-finalizing an already-final study must not create duplicate Plane work items.

### 2. Config YAML Generation & Notifications
* Provide an endpoint: `POST /api/projects/{id}/generate-config/`
* **Action**: Queries the DB for the Project, Studies, and Samples. Passes the data through a serializer that matches the Snakemake schema (See `04-PIPELINE_CONFIG_MAPPING.md`).
* **Output**: Writes `config.yaml`, `metadata.tsv`, and `contrasts.tsv` to a secure temporary volume, or returns them as downloadable blobs.
* **Notification**: Triggers a Celery task to email the `bioinformatician_assigned` with the generated configurations and a link to the parsed sample database.
