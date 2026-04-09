STATUS: DONE

SUMMARY:
- Backend: added `POST /api/metadata-validation/` with Pydantic-driven aggregate validation returning `issues: Array<{row_index, column_key, message, severity}>` (includes file-level issues via `row_index: -1`) and spreadsheet boolean normalization (`T/F`, `true/false`, `1/0`, `yes/no`).
- Frontend: implemented the onboarding wizard Upload step with drag-and-drop + file picker, local CSV/TSV preview, and row/cell highlighting + summary list driven by the aggregate issues response.

PRD CHECK:
- Section: Story 5; REQ-009
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm api pytest -q core/test_metadata_validation.py`
- Ran `docker compose run --rm frontend npm test`

FILES:
- `ralph-loop/results/08-upload-validation.md:1`
- `backend/core/services.py:1`
- `backend/core/views.py:1`
- `backend/core/urls.py:1`
- `backend/core/test_metadata_validation.py:1`
- `frontend/src/api/metadataValidation.ts:1`
- `frontend/src/components/onboarding/MetadataUploadStep.tsx:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.tsx:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.test.tsx:1`