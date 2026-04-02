# Backend API & Integrations

## RESTful Endpoints (Django REST Framework)
All endpoints must support DRF `PageNumberPagination` to integrate seamlessly with the frontend TanStack tables.

* `GET/POST /api/projects/` (Filtered by `request.user` role)
* `GET/POST /api/studies/`
* `GET/POST /api/samples/`
  * Requires support for bulk creation (for spreadsheet ingestion).
  * `GET` must support query params for exporting data: `?study_id=X&has_raw_data=true`.
* `GET /api/exports/labels/` (Returns PDF/CSV for printing shipping/tube labels).

## External Integrations

### 1. Plane Project Management (Triggered on Project Creation)
When a `Project` is successfully saved, trigger a Celery task `create_plane_ticket`.
* **Action**: Make a POST request to the Plane API.
* **Payload mappings**:
  * Allocate to Workspace based on `PI Name`.
  * Issue Name = `Project.title`
  * Issue Description = `Project.description` + Link to portal project page.
  * Assignee = `Project.bioinformatician_assigned`.

### 2. Config YAML Generation & Notifications
* Provide an endpoint: `POST /api/projects/{id}/generate-config/`
* **Action**: Queries the DB for the Project, Studies, and Samples. Passes the data through a serializer that matches the Snakemake schema (See `04-PIPELINE_CONFIG_MAPPING.md`).
* **Output**: Writes `config.yaml`, `metadata.tsv`, and `contrasts.tsv` to a secure temporary volume, or returns them as downloadable blobs.
* **Notification**: Triggers a Celery task to email the `bioinformatician_assigned` with the generated configurations and a link to the parsed sample database.