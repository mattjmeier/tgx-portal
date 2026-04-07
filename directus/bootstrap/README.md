# Directus Bootstrap

This directory contains practical bootstrapping utilities for initializing the Directus-first schema using supported Directus APIs.

## Why This Exists

The generated files under `directus/snapshots/` are useful as design blueprints, but they were not exported from a real Directus instance and should not be treated as authoritative migration artifacts for first-time setup.

The recommended flow is:

1. Start from a clean Directus database.
2. Use a supported initialization path to create the initial collections/fields/relations.
3. Verify the schema exists in a running Directus instance.
4. Export a real snapshot from that instance for future repeatable setup.

## Included Script

- `bootstrap_story_001.py`
- `bootstrap_story_002.py`
- `bootstrap_story_003.py`

This script uses the Directus REST API to create a first-pass schema for:

- `projects`
- `studies`
- `samples`
- `assays`
- `sample_plating`
- lookup collections required by STORY-001 (including stable `code` fields)
- the `projects_biospyder_databases` junction collection

`bootstrap_story_002.py` adds the minimum collection/fields/relations needed for the
in-Directus sample intake workflow:

- `sample_intake_uploads` (including relations to `studies` and `directus_files`)

It is intentionally conservative:

- it creates the baseline collections, fields, and relations
- it does not attempt to recreate every UI detail, permission rule, or flow stub from the generated YAML
- it is designed to give you a real applied schema that you can inspect in Directus and then export as a proper snapshot

`bootstrap_story_003.py` applies the admin-facing and access-control building blocks:

- adds missing lookup `code` fields (if you bootstrapped before this was introduced)
- groups lookup collections under `Lookups` and sample intake under `Workflows`
- creates the three primary roles: `Admin`, `Client`, `System`
- enforces project-scoped permissions for `Client` across core collections
- applies least-privilege permissions for `System` to support flows/endpoints

Optional verification helper:

- `verify_story_003_system_token.py` (non-destructive checks using `DIRECTUS_AUTOMATION_TOKEN`)

## Environment

The script reads these variables:

- `DIRECTUS_URL` or `DIRECTUS_PUBLIC_URL`
- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`

For local Docker Compose, `DIRECTUS_URL=http://localhost:8055` is the simplest choice.

## Usage

From the repo root:

```bash
python3 directus/bootstrap/bootstrap_story_001.py
python3 directus/bootstrap/bootstrap_story_002.py
python3 directus/bootstrap/bootstrap_story_003.py
```

Or explicitly:

```bash
DIRECTUS_URL=http://localhost:8055 \
DIRECTUS_ADMIN_EMAIL=admin@example.com \
DIRECTUS_ADMIN_PASSWORD=supersecret \
python3 directus/bootstrap/bootstrap_story_001.py
```

## After It Succeeds

1. Open Directus and confirm the collections exist.
2. Export a real snapshot:

```bash
docker compose exec directus npx directus schema snapshot /directus/snapshots/baseline-story-001.yaml --yes
```

3. Treat that exported file as the new repeatable baseline, not the speculative generated snapshot.

## Sources

This approach follows Directus-supported collection/field/relation APIs and the Directus schema workflow documented in the official docs:

- https://docs.directus.io/reference/system/fields
- https://docs.directus.io/reference/system/relations
- https://docs.directus.io/reference/system/schema
