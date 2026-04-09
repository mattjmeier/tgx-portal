STATUS: DONE  
SUMMARY:
- Added staged onboarding wizard shell at `/studies/:studyId/onboarding` with 5 PRD-aligned stages (details → template → upload/validation → mappings → review) and clear progression UI.
- Implemented route-safe step handling via `?step=...` plus per-study draft persistence in `localStorage` (`tgx:onboarding:v1:study:{studyId}`); added an entry button from the study workspace.
- Added Vitest coverage for step routing, URL updates, and persistence; documented the work in the Ralph loop result.

PRD CHECK:
- Section: Story 5: Complete metadata onboarding through a staged wizard; REQ-007
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm frontend npm test -- --run`

FILES:
- `frontend/src/App.tsx:1`
- `frontend/src/lib/routes.ts:1`
- `frontend/src/pages/StudyOnboardingPage.tsx:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.tsx:1`
- `frontend/src/components/onboarding/StudyOnboardingWizard.test.tsx:1`
- `frontend/src/App.routes.test.tsx:1`
- `frontend/src/components/StudyWorkspace.tsx:1`
- `ralph-loop/results/06-onboarding-shell.md:1`