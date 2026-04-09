STATUS: DONE
SUMMARY:
- Added a route-level flash success banner (`FlashBanner`) and mounted it in `AppLayout` for post-redirect messaging.
- Updated collaboration create to redirect to `/collaborations/:id` with a forward CTA to `/collaborations/:id/studies/new`.
- Updated study create to redirect to `/studies/:id?intake=open` (collaboration selection remains required first for the global flow) with clear success messaging.
- Added Vitest coverage for redirect destinations + flash messaging.

PRD CHECK:
- Section: Story 4 (Create collaboration and study records with forward momentum); REQ-006; D1
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm frontend npm test -- --run`

FILES:
- `ralph-loop/results/05-create-flows.md#L1`
- `frontend/src/components/FlashBanner.tsx#L1`
- `frontend/src/components/AppLayout.tsx#L1`
- `frontend/src/components/ProjectForm.tsx#L1`
- `frontend/src/components/StudyForm.tsx#L1`
- `frontend/src/pages/StudyCreatePage.tsx#L1`
- `frontend/src/components/FlashBanner.test.tsx#L1`
- `frontend/src/components/ProjectForm.test.tsx#L1`
- `frontend/src/components/StudyForm.test.tsx#L1`