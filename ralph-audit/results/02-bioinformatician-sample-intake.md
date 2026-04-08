SUMMARY:
- Directus-first sample intake supports CSV/TSV preview + row/field validation and commit into `samples` + `assays` via `sample_intake_uploads` and the sample-intake hook.
- Added `write_mode` (`upsert` | `create_only`) support in the in-Directus workflow so bioinformaticians can optionally fail when a `sample_ID` already exists in the study.
- Lookup-backed columns now accept either human-friendly `name`/`code` values or Directus-style numeric IDs (baseline snapshot pattern).

PRD CHECK:
- Story: STORY-002 - Bioinformatician Sample Intake
- Acceptance: met
  - Upload accepts CSV/TSV with preview-before-commit via `sample_intake_uploads` (`preview_rows`, `validation_errors`, `validation_summary`) and optional API endpoints.
  - Validation returns row-level + field-level errors (e.g., `pattern`, `duplicate_within_file`, and (when `create_only`) `duplicate_within_study`).
  - Commit upserts into related collections (`samples` scoped to `study`, plus `assays` per sample).
  - Study-scoped rules (e.g., `group` required when `studies.treatment_var` is set) and lookup-backed checks (platform/genome/quant) are enforced.
  - Workflow remains inside Directus Data Studio (no custom portal UI required).

DIRECTUS CHECK:
- Outcome: applied-live
- Evidence:
  - Hook-based workflow: `directus/extensions/hooks/sample-intake/index.js`
  - Optional endpoints: `directus/extensions/endpoints/sample-intake/index.js`
  - Validation + commit logic: `directus/extensions/shared/sampleIntakeValidation.mjs`, `directus/extensions/shared/sampleIntakeDirectus.mjs`
  - Supported bootstrap path (Directus REST APIs): `directus/bootstrap/bootstrap_story_002.py`
  - Live verification on April 7, 2026:
    - `POST /sample-intake/preview` returned `200`
    - `POST /sample-intake/commit` returned `200`
    - seeded study `1` updated 3 existing sample/assay rows successfully
  - Contract docs: `docs/02-API_AND_INTEGRATIONS.md`, `directus/README.md`
  - Snapshot blueprint header updated to match guardrails: `directus/snapshots/02-bioinformatician-sample-intake.yaml`
- Notes:
  - The original loop run was `blueprint-only`, but the story was later bootstrapped and verified live against the running Directus stack.
  - `source_file` validation currently supports only Directus `local` storage (by design); otherwise use `source_text` or switch storage strategy.

VERIFICATION:
- Ran `node --test directus/extensions/shared/sampleIntakeValidation.test.mjs directus/extensions/shared/sampleIntakeDirectus.test.mjs`
- Ran live endpoint verification against the running Directus stack:
  - `POST /sample-intake/preview`
  - `POST /sample-intake/commit`
- Did not export a dedicated post-STORY-002 baseline snapshot

FILES:
- directus/extensions/shared/sampleIntakeValidation.mjs
- directus/extensions/shared/sampleIntakeValidation.test.mjs
- directus/extensions/shared/sampleIntakeDirectus.test.mjs
- directus/extensions/hooks/sample-intake/index.js
- directus/bootstrap/bootstrap_story_002.py
- docs/02-API_AND_INTEGRATIONS.md
- directus/README.md
- directus/snapshots/02-bioinformatician-sample-intake.yaml
- ralph-audit/results/02-bioinformatician-sample-intake.md

STATUS: DONE
