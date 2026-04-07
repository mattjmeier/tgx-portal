# API & Integrations

## API Approach
Directus should act as the primary API surface for collection CRUD and filtering.

The custom frontend should consume:
* Directus REST endpoints for standard collection access
* Directus SDK where it simplifies authentication and typed queries
* Custom endpoints only for behaviors that do not fit well into native Directus collections or flows

## Required Data Access Patterns
The frontend must support server-side filtering, sorting, pagination, and search for large tables.

At minimum, the solution must support:
* project listing scoped by current user permissions
* study listing scoped by selected project
* sample listing scoped by selected study
* assay listing scoped by selected sample or study
* export-oriented filters such as `study_id` and `has_raw_data`

## Directus Responsibilities
Use Directus for:
* authentication and user management
* role and policy enforcement
* CRUD for projects, studies, samples, assays, and lookup collections
* flows triggered on item create or update
* admin-facing data management UI

## Custom Service Responsibilities
Keep custom services narrow and explicit:

### 1. Spreadsheet Import Validation
Directus alone may not provide the exact row-by-row spreadsheet validation UX required by the portal.

Preferred approach:
* the custom frontend parses CSV/TSV uploads locally for preview
* a custom import endpoint or Directus extension validates rows against domain rules
* the response includes row and field level errors
* successful rows are written into Directus collections

### 2. Plane Project Management
When a project is created or promoted to an intake-ready state, trigger a Directus Flow or custom operation that sends a request to Plane.

Payload mapping:
* workspace selection derived from `pi_name`
* issue name = project `title`
* issue description = `description` plus link to the portal
* assignee = `bioinformatician_assigned`

### 3. Config YAML Generation
Provide a custom action such as:
* `POST /api/projects/{id}/generate-config`

This may be implemented as:
* a Directus custom endpoint
* a separate microservice reading from Directus
* a Directus flow invoking an external worker

The action must:
* fetch the project hierarchy from Directus
* serialize it into the Snakemake-compatible structures described in `04-PIPELINE_CONFIG_MAPPING.md`
* return or store `config.yaml`, `metadata.tsv`, and `contrasts.tsv`
* notify the assigned bioinformatician when artifacts are ready

## Integration Preference Order
1. Native Directus collections and permissions
2. Directus flows and operations
3. Directus custom extensions
4. External companion service

Only move down the list when the previous option cannot support the requirement cleanly.
