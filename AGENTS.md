# Project R-ODAF Portal: AI Agent Core Context

## System Purpose
This project is to build `tgx-portal`, a web application for Health Canada's genomics laboratory. This portal manages metadata, project intake, and configuration generation for **R-ODAF** (a regulatory toxicology transcriptomics Snakemake pipeline).

The goal is to replace manual PDF intake forms and scattered metadata with a centralized, modular database that tracks Projects, Studies, Samples, and Assays, while automatically generating workflow configurations and triggering project management tasks.

It is meant to be a single point of authority on project metadata. The backend is also beginning to support a separate broad-profiling analysis warehouse for historical HTTr/HTPP/TGx data, harmonized with the collaborator schema in `UL_schema.txt`.

## Tech Stack
* **Backend**: Django, Django REST Framework (DRF), PostgreSQL, Pydantic (for strict data validation).
* **Frontend**: React (TypeScript), Vite, TailwindCSS, `shadcn/ui`.
* **Data Grids**: TanStack Table v8 (fully server-side paginated/sorted/filtered).
* **Task Queue / Integrations**: Celery + Redis (for emails and webhook triggers).
* **Containerization**: Docker, Docker Compose (Dev & Prod parity).
* **Testing**: Pytest (Backend), Vitest (Frontend), Playwright (E2E), GitHub Actions (CI/CD).

## Core Directives for the AI
1. **Strict Typing**: Use TypeScript for all React code. Use Python Type Hints and Pydantic for validation before data hits the Django ORM.
2. **Modular Architecture**: Keep React components small. Separate API fetching logic from UI components (use React Query / TanStack Query).
   * Treat `shadcn/ui` as the default component foundation for frontend work.
   * Store `shadcn/ui`-managed primitives in `frontend/src/components/ui`.
   * Keep application-specific composites, page sections, and feature workflows outside the `ui` subfolder so generated primitives remain easy to manage and upgrade.
3. **Backend App Boundaries**:
   * `core`: Operational intake, Projects, Studies, Samples, Assays, onboarding, R-ODAF config generation, RBAC, and existing public APIs.
   * `chemicals`: Canonical chemical/environmental sample identity. Do not overload `core.Sample` for UL `tgx_samples` concepts.
   * `profiling`: Broad-profiling warehouse models such as platforms, study warehouse metadata, concentration/dose-response series, POD metrics/values, and domain well tables.
4. **RBAC**: Always assume three roles: `Admin` (Bioinformatics Staff), `Client` (Collaborators), `System` (Automated tasks). Clients can only view/edit their own assigned projects. Django admin is an internal schema/data explorer for staff, not the collaborator UI.
5. **Context Routing**: Do not guess implementation details. Refer to the specific markdown files in the `docs/` folder for exact structural requirements:

### Knowledge Base Routing
When working on specific features, read the corresponding document:
* **Database & Models**: Read `docs/01-DATABASE_SCHEMA.md`
* **Backend APIs & Plane Integrations**: Read `docs/02-API_AND_INTEGRATIONS.md`
* **React Frontend & TanStack Tables**: Read `docs/03-UI_UX_REQUIREMENTS.md`
* **Snakemake YAML Config Generation**: Read `docs/04-PIPELINE_CONFIG_MAPPING.md`
* **Schema Harmonization & Warehouse Roadmap**: Read `docs/06-SCHEMA_HARMONIZATION.md` before changing `chemicals`, `profiling`, historical import, or UL schema alignment.

To locate specific parts of the code, begin with `.codesight/CODESIGHT.md`, a wiki which should help guide you to elements of interest.

6. **Test-Driven Development (TDD)**: You must write tests *before* writing the implementation logic. Follow the Red-Green-Refactor loop.
7. **Container-First**: All development, testing, and production execution must occur within Docker containers. Do not assume local system dependencies exist other than Docker.
8. **DevOps & Testing**: Read `docs/05-DEVOPS_AND_TESTING.md` for exact Docker service definitions and CI/CD pipeline steps.

## Development Notes
* The local `api` container already runs `migrate` and `bootstrap_dev_user` on startup before `runserver`.
* Default development credentials are `admin / admin123` and `client / client123`. The `admin` user is a Django superuser in local development so staff can inspect warehouse models at `http://localhost:8003/admin/`.
* After any model or migration change, update the schema in Docker before doing manual QA. Preferred flow:
  * `docker compose run --rm api python manage.py makemigrations`
  * `docker compose run --rm api python manage.py migrate`
  * `docker compose run --rm api python manage.py reset_seed_data`
* When a deterministic workspace is needed, prefer `reset_seed_data` over preserving ad hoc local records.
  * `reset_seed_data` now seeds one linked warehouse demo set across `chemicals` and `profiling` in addition to the core project/study/sample fixtures.
* If `docker compose exec api ...` fails because the service is not running, use `docker compose run --rm api ...` instead.
