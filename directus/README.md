# Directus Workspace

This directory is reserved for Directus-specific assets.

## Intended Contents

* `extensions/`
  Custom endpoints, hooks, operations, or interfaces if native Directus features are not enough.
* `snapshots/`
  Exported Directus schema snapshots for versioning collections, fields, and permissions.
* `uploads/`
  Local development storage for uploaded files.
* `seed/`
  Optional future scripts or fixtures for bootstrapping collections and reference data.

## Initial Modeling Targets

The first collections to create in Directus should be:

* `projects`
* `studies`
* `samples`
* `assays`
* `sample_plating`
* lookup collections for genome versions, platforms, and Biospyder metadata

## Fresh Database Workflow

This branch now uses a dedicated named volume for the Directus/PostgreSQL stack:

- `directus_postgres_data`

That lets you start with a clean Directus database without destroying any older PostgreSQL volume that may have been used by the prior Django-backed app or earlier local experiments.

Recommended reset flow:

1. Stop the stack: `docker compose down`
2. Start fresh with the new named volume: `docker compose up --build`
3. If Docker reports orphaned containers from older services, rerun with: `docker compose up --build --remove-orphans`

If you intentionally want to delete the new Directus dev database and start over again:

1. Stop the stack: `docker compose down`
2. Remove the Directus volume: `docker volume rm tgx-portal_directus_postgres_data`
3. Start again: `docker compose up --build`

Note:

- The exact Docker volume name is usually `<project>_directus_postgres_data`, where `<project>` is the Compose project name. For this repo it is typically `tgx-portal_directus_postgres_data`.
- Keep any old Django-era volume around as a migration/reference source unless you are certain you no longer need it.

## Recommended Initial Schema Path

Do not treat the generated files in `directus/snapshots/` as authoritative first-run migrations unless they were exported from a real Directus instance.

For initial setup, prefer this sequence:

1. Start a clean Directus database.
2. Bootstrap the first-pass schema using supported Directus APIs or the Data Studio.
3. Confirm the collections exist in the running app.
4. Export a real snapshot from Directus and use that as the repeatable baseline.

The included API-backed bootstrap entry point is:

- `python3 directus/bootstrap/bootstrap_story_001.py`

This script uses the current STORY-001 snapshot as a blueprint, but creates the baseline schema through supported Directus REST endpoints instead of `schema apply`.

## Repeatable Baseline

The first real exported baseline for this branch is:

- `directus/snapshots/baseline-story-001.yaml`

Recommended repeatable workflow:

1. Start a clean Directus database.
2. If no real snapshot exists yet, bootstrap with `python3 directus/bootstrap/bootstrap_story_001.py`.
3. Export a real snapshot from the running instance.
4. On future fresh environments, apply the exported baseline snapshot instead of rerunning speculative story YAML.

Example replay flow:

```bash
docker compose cp ./directus/snapshots/baseline-story-001.yaml directus:/tmp/baseline-story-001.yaml
docker compose exec directus npx directus schema apply /tmp/baseline-story-001.yaml --yes
```

## Repeatable Sample Data

For local testing, UI checks, and workflow verification, use the canonical seeded sample project in:

- `directus/seed/sample_project.json`

Load it with:

```bash
DIRECTUS_URL=http://localhost:8055 \
DIRECTUS_ADMIN_EMAIL=admin@example.com \
DIRECTUS_ADMIN_PASSWORD=change-me-now \
python3 directus/seed/load_sample_project.py
```

Notes:

- This fixture is intentionally non-production and safe to rerun.
- It is separate from schema bootstrapping on purpose.
- If `DIRECTUS_SAMPLE_CLIENT_EMAIL` is set to an existing Directus user, the sample project will be assigned to that user; otherwise it is assigned to the admin user running the script.

## Story Snapshots

### STORY-001 (Collaborator Project Intake)

- Schema + RBAC + flow stubs: `directus/snapshots/01-collaborator-project-intake.yaml`
- Validation + client ownership enforcement hook: `directus/extensions/hooks/project-intake/index.js`
- Plane webhook endpoint (flow target): `directus/extensions/endpoints/plane-sync/index.js`

Blueprint-only artifacts:

- `directus/snapshots/01-collaborator-project-intake.yaml` is a design/reference artifact, not the recommended first-run migration source.
- Use `directus/bootstrap/bootstrap_story_001.py` to create the initial live schema.
- Then export and replay `directus/snapshots/baseline-story-001.yaml` as the repeatable baseline.
- Optional: run unit tests for shared validation logic (host machine): `node --test directus/extensions/shared/projectIntakeValidation.test.mjs`

Plane integration configuration:

- Set `PLANE_WEBHOOK_URL` in `.env` (see `.env.example` for optional workspace mapping env vars).
- Set `DIRECTUS_AUTOMATION_TOKEN` in `.env` so Directus Flows can authenticate when calling internal endpoints like `/plane-sync/sync`.

### STORY-002 (Bioinformatician Sample Intake)

- Schema + RBAC + presets: `directus/snapshots/02-bioinformatician-sample-intake.yaml`
- Validation + commit hook: `directus/extensions/hooks/sample-intake/index.js`
- Optional API endpoints (preview/commit): `directus/extensions/endpoints/sample-intake/index.js`
- Unit tests for parsing/validation (host machine): `node --test directus/extensions/shared/sampleIntakeValidation.test.mjs`

Current status:

- `directus/snapshots/02-bioinformatician-sample-intake.yaml` should be treated as a design/reference artifact until it is recreated from a real Directus instance or replaced by an API-backed/bootstrap path.
- API-backed bootstrap path (recommended for fresh local stacks): `python3 directus/bootstrap/bootstrap_story_002.py` (run after `bootstrap_story_001.py`).

Usage (inside Directus Data Studio):

1. Create an item in `sample_intake_uploads` and select a `study`.
2. (Optional) Set `write_mode` to `create_only` to fail when `sample_ID` already exists in the study (default: `upsert`).
3. Paste TSV/CSV into `source_text` (or upload a file in Files and select it via `source_file`).
4. Save to generate `preview_rows` and `validation_errors`.
5. Toggle `commit_requested` to commit validated rows into `samples` and `assays`.

### STORY-003 (Admin Lookup and Permissions Management)

- Schema + RBAC + admin presets: `directus/snapshots/03-admin-lookup-and-permissions-management.yaml`
- Supported bootstrap path (roles/permissions + lookup stability): `python3 directus/bootstrap/bootstrap_story_003.py`
- Automation token verification helper: `python3 directus/bootstrap/verify_story_003_system_token.py`
- Plane sync + audit visibility verification helper: `python3 directus/bootstrap/verify_story_003_plane_sync.py`

Current status:

- `directus/snapshots/03-admin-lookup-and-permissions-management.yaml` is not yet an approved repeatable baseline.

### STORY-004 (Workflow Configuration Export)

- Schema + export tracking + defaults: `directus/snapshots/04-workflow-configuration-export.yaml`
- Workflow export endpoint: `directus/extensions/endpoints/workflow-export/index.js`
- Shared artifact generation logic + golden-file tests: `directus/extensions/shared/workflowExport.mjs`

Current status:

- `directus/snapshots/04-workflow-configuration-export.yaml` is not yet an approved repeatable baseline.

Usage (authenticated; e.g., Admin or System automation token):

- Generate and store an export: `POST /workflow-export/projects/{projectId}/generate-config?include_content=false&store=true`
- Generate without storing: `POST /workflow-export/projects/{projectId}/generate-config?include_content=true&store=false`
