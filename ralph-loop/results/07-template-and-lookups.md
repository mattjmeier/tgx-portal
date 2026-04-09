STATUS: DONE  
SUMMARY:
- Added backend lookup + metadata template contract: `GET /api/lookups/`, `POST /api/metadata-templates/preview/`, `POST /api/metadata-templates/download/` with RBAC-scoped soft lookups (PI/researcher), admin-managed controlled vocab buckets, and chemical → CASN auto-inclusion.
- Introduced admin-managed models `MetadataFieldDefinition` (required/optional, standard/custom typed, auto-include rules) and `ControlledLookupValue` (active/inactive), plus a seeded baseline definition set for onboarding.
- Updated the onboarding wizard template step to be lookup-driven: required fields locked, optional fields grouped, custom typed fields bounded to admin definitions, server-backed preview, and backend filename on download.

PRD CHECK:
- Section: Story 5 (Template-selection stage); Story 6 (Lookup-backed select-or-create); REQ-008; REQ-013; D3
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm api pytest -q`
- Ran `docker compose run --rm frontend npm test -- --run`

FILES:
- `backend/core/models.py:1`
- `backend/core/migrations/0005_metadata_fields_and_lookups.py:1`
- `backend/core/views.py:1`
- `backend/core/urls.py:1`
- `backend/core/admin.py:1`
- `backend/core/test_lookups.py:1`
- `frontend/src/api/lookups.ts:1`
- `frontend/src/api/metadataTemplates.ts:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.tsx:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.test.tsx:1`
- `ralph-loop/results/07-template-and-lookups.md:1`