# Project R-ODAF Portal: Directus Exploration Context

## System Purpose
This branch explores rebuilding `tgx-portal` around **Directus** as the system of record for Health Canada's genomics laboratory metadata. The portal still supports R-ODAF project intake, sample metadata management, and workflow configuration generation, but the implementation assumption changes from a custom Django application to a Directus-first platform with a custom front end layered on top.

The goal remains the same:
replace PDF intake forms and scattered spreadsheets with a centralized authority for Projects, Studies, Samples, Assays, lookup tables, and downstream workflow artifacts.

## Target Architecture
* **Data Platform**: Directus backed by PostgreSQL.
* **Frontend**: Custom React application consuming the Directus API/SDK.
* **Automation**: Directus Flows, webhooks, and custom extensions where necessary.
* **Config Generation**: A separate service or Directus extension that builds Snakemake config artifacts from Directus data.
* **Containerization**: Docker Compose for local development and production-like environments.
* **Testing**: API contract tests, frontend tests, and E2E tests against a running Directus stack.

## Core Directives For The AI
1. **Directus First**: Default to Directus collections, relationships, permissions, and flows before proposing custom backend code.
2. **Custom Frontend Still Required**: Do not assume the Directus admin UI replaces the client-facing portal. External collaborators should use a tailored front end.
3. **RBAC**: Keep three primary roles: `Admin`, `Client`, and `System`. Clients must only see projects assigned to them.
4. **Minimize Custom Code**: Add custom services only when Directus collections, permissions, flows, hooks, or extensions are not sufficient.
5. **Context Routing**: Use the docs in `docs/` as the current source of truth for the Directus-based design:

### Knowledge Base Routing
When working on specific features, read the corresponding document:
* **Collections & Data Model**: Read `docs/01-DATABASE_SCHEMA.md`
* **API, Directus Flows & Integrations**: Read `docs/02-API_AND_INTEGRATIONS.md`
* **Custom Frontend Requirements**: Read `docs/03-UI_UX_REQUIREMENTS.md`
* **Snakemake Mapping Strategy**: Read `docs/04-PIPELINE_CONFIG_MAPPING.md`
* **DevOps & Testing**: Read `docs/05-DEVOPS_AND_TESTING.md`

6. **Container First**: Assume Directus, PostgreSQL, and the custom frontend run in containers.
7. **Prefer Requirements Over Premature Code**: This branch is for architectural exploration. Favor clear requirements and implementation notes before rebuilding.
