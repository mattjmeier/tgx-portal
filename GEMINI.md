# Project R-ODAF Portal: AI Agent Core Context

## System Purpose
This project is to build `tgx-portal`, a web application for Health Canada's genomics laboratory. This portal manages metadata, project intake, and configuration generation for **R-ODAF** (a regulatory toxicology transcriptomics Snakemake pipeline).

The goal is to replace manual PDF intake forms and scattered metadata with a centralized, modular database that tracks Projects, Studies, Samples, and Assays, while automatically generating workflow configurations and triggering project management tasks.

It is meant to be a single point of authority on project metadata

## Tech Stack
* **Backend**: Django, Django REST Framework (DRF), PostgreSQL, Pydantic (for strict data validation).
* **Frontend**: React (TypeScript), Vite, TailwindCSS.
* **Data Grids**: TanStack Table v8 (fully server-side paginated/sorted/filtered).
* **Task Queue / Integrations**: Celery + Redis (for emails and webhook triggers).
* **Containerization**: Docker, Docker Compose (Dev & Prod parity).
* **Testing**: Pytest (Backend), Vitest (Frontend), Playwright (E2E), GitHub Actions (CI/CD).

## Core Directives for the AI
1. **Strict Typing**: Use TypeScript for all React code. Use Python Type Hints and Pydantic for validation before data hits the Django ORM.
2. **Modular Architecture**: Keep React components small. Separate API fetching logic from UI components (use React Query / TanStack Query).
3. **RBAC**: Always assume three roles: `Admin` (Bioinformatics Staff), `Client` (Collaborators), `System` (Automated tasks). Clients can only view/edit their own assigned projects.
4. **Context Routing**: Do not guess implementation details. Refer to the specific markdown files in the `docs/` folder for exact structural requirements:

### Knowledge Base Routing
When working on specific features, read the corresponding document:
* **Database & Models**: Read `docs/01-DATABASE_SCHEMA.md`
* **Backend APIs & Plane Integrations**: Read `docs/02-API_AND_INTEGRATIONS.md`
* **React Frontend & TanStack Tables**: Read `docs/03-UI_UX_REQUIREMENTS.md`
* **Snakemake YAML Config Generation**: Read `docs/04-PIPELINE_CONFIG_MAPPING.md`

5. **Test-Driven Development (TDD)**: You must write tests *before* writing the implementation logic. Follow the Red-Green-Refactor loop. 
6. **Container-First**: All development, testing, and production execution must occur within Docker containers. Do not assume local system dependencies exist other than Docker.
7. **DevOps & Testing**: Read `docs/05-DEVOPS_AND_TESTING.md` for exact Docker service definitions and CI/CD pipeline steps.