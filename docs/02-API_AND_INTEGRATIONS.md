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

Preferred approach (Directus-first, internal workflow):
* Bioinformaticians validate and commit sample metadata *inside Directus* via the `sample_intake_uploads` collection.
* A Directus hook performs parsing + study-scoped validation on create/update, and can commit validated rows into `samples` and `assays`.

Optional approach (custom frontend / automation):
* A Directus custom endpoint can be used by the frontend to preview/validate and then commit rows after user confirmation.

#### Sample Intake Contract (STORY-002)

**Directus Data Studio workflow (no custom UI required):**
* Create an item in `sample_intake_uploads` with:
  * `study` (required)
  * `file_type`: `tsv` | `csv`
  * `write_mode`: `upsert` | `create_only` (optional; default `upsert`)
  * `source_type`: `text` | `file`
  * `source_text` (when `source_type=text`) or `source_file` (when `source_type=file`)
* Save to populate:
  * `preview_rows` (preview of normalized rows + create/update action)
  * `validation_errors` (row+field level issues)
  * `validation_summary` (counts and invalid row numbers)
* Toggle `commit_requested=true` and save to upsert into `samples` and `assays`.

**Endpoint contract (preview/commit):**

`POST /sample-intake/preview`
```json
{
  "study_id": "string | number",
  "file_type": "csv | tsv",
  "content": "string",
  "write_mode": "upsert | create_only (optional)"
}
```

Response (HTTP 200; `ok` may be `false` to return row-level errors without committing):
```json
{
  "ok": true,
  "schema_version": "2026-04-07.1",
  "file_type": "csv | tsv",
  "header": ["..."],
  "content_hash": "sha256",
  "preview_rows": [
    {
      "row": 2,
      "sample_ID": "S1",
      "action": "create | update",
      "valid": true,
      "sample_patch": { "group": "A" },
      "assay_patch": { "platform": "uuid", "read_mode": "se" }
    }
  ],
  "errors": [
    { "row": 3, "field": "sample_ID", "code": "pattern", "message": "..." }
  ],
  "warnings": [
    { "code": "unknown_columns", "message": "...", "columns": ["..."] }
  ],
  "summary": {
    "total_rows": 10,
    "valid_rows": 9,
    "invalid_rows": 1,
    "creates": 5,
    "updates": 4,
    "invalid_row_numbers": [3]
  }
}
```

`POST /sample-intake/commit` (same request body as preview)
* Success: HTTP 200 with `{ ok: true, summary, commit, warnings }`
* Validation failure: HTTP 422 with `{ ok: false, errors, summary, warnings }`

**Validation message shape:**
* Errors are row-level and field-level: `{ row: number, field: string, code: string, message: string }`
* Common codes: `required`, `pattern`, `duplicate_within_file`, `duplicate_within_study`, `required_by_study`,
  `lookup_mismatch`, `invalid_boolean`, `invalid_read_mode`, `invalid_write_mode`, `required_by_platform`, `multiple_assays_existing`

**Lookup value inputs:**
* For lookup-backed fields like `platform`, `genome_version`, and `quantification_method`, the upload content may supply:
  * the lookup `id` (integer or uuid-style), or
  * a human-friendly `name`/`code` value (case-insensitive).

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
