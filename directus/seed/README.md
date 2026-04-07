# Directus Seed Data

This directory contains repeatable non-production content fixtures for local development and verification.

## Why Keep Seed Data Separate

- Schema bootstrap and snapshots define structure.
- Seed scripts define demo/test content.
- Keeping them separate makes it easier to reset the database, replay the schema, and then reload the same known-good records.

## Included Fixture

- `sample_project.json`
  A canonical "golden sample project" that exercises:
  - lookup collections
  - `projects`
  - `studies`
  - `samples`
  - `assays`
  - `sample_plating`
  - `projects_biospyder_databases`
  - `sample_intake_uploads`

## Loader

- `load_sample_project.py`

This loader is designed for local dev cycles and is safe to rerun:

- lookups are upserted by `code`
- the project is upserted by `title`
- the study is upserted by project + defining fields
- samples are upserted by study + `sample_ID`
- assays are upserted by sample
- plating rows are upserted by sample
- one sample intake upload is upserted by study + `source_text`

## Environment

Required:

- `DIRECTUS_URL` or `DIRECTUS_PUBLIC_URL`
- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`

Optional:

- `DIRECTUS_SAMPLE_CLIENT_EMAIL`
  If set, the loader will assign the sample project to this existing Directus user.
  If omitted or not found, it assigns the project to the admin user running the seed.

- `DIRECTUS_SAMPLE_FIXTURE`
  Override the default fixture path.

## Usage

From the repo root:

```bash
DIRECTUS_URL=http://localhost:8055 \
DIRECTUS_ADMIN_EMAIL=admin@example.com \
DIRECTUS_ADMIN_PASSWORD=change-me-now \
python3 directus/seed/load_sample_project.py
```

## Recommended Workflow

1. Bootstrap/apply the schema.
2. Apply STORY-003 RBAC bootstrap.
3. Load the sample project fixture.
4. Verify the UI, intake flow, and export flow against the same seeded records.
