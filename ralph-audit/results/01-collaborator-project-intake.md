# STORY-001 — Collaborator Project Intake (2026-04-07)

SUMMARY:
- Added Directus schema snapshot for `projects` intake plus core relations (`projects → studies → samples → assays`) and lookups.
- Implemented client scoping (`projects.client_user`) with role/permission filters and a defense-in-depth ownership/validation hook.
- Added TempO-Seq conditional intake behavior (`biospyder_*` fields hidden unless relevant) and pre-save validation errors.
- Added Plane automation scaffolding: flow stubs calling a Directus endpoint (`/plane-sync/sync`) that posts a webhook and updates `projects.plane_*` status fields.

VERIFICATION:
- Ran `node --test directus/extensions/shared/projectIntakeValidation.test.mjs`
- Ran `python -m unittest directus/snapshots/tests/test_story_001_snapshot.py`

FILES:
- `directus/snapshots/01-collaborator-project-intake.yaml`
- `directus/snapshots/tests/test_story_001_snapshot.py`
- `directus/extensions/hooks/project-intake/index.js`
- `directus/extensions/endpoints/plane-sync/index.js`
- `directus/extensions/shared/projectIntakeValidation.mjs`
- `directus/extensions/shared/projectIntakeValidation.test.mjs`
- `directus/README.md`
- `.env.example`
- `ralph-audit/results/01-collaborator-project-intake.md`

STATUS: DONE