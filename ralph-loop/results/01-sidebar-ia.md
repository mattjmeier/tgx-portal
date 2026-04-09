STATUS: DONE
SUMMARY:
- Refactored sidebar IA so `Collaborations` and `Studies` are the primary browse branches with route-target + expand/collapse + 5-item preview + `More...`.
- Removed duplicated navigation patterns (`Collaboration registry`, `Study directory`) and moved `Download config bundle` into the `Active collaboration` context (admin-only).
- Added `/studies` browse route (lightweight placeholder page) and updated shell copy to avoid “registry/directory” terminology.

PRD CHECK:
- Section: Story 1 (Browse collaborations from one obvious home); Story 2 (Browse studies preserving collaboration context); REQ-001; REQ-002
- Acceptance: partially met (Story 2’s full study index + title-first labeling is deferred; sidebar IA + preview/collapse + context-preserving study links are met)

VERIFICATION:
- Ran `docker compose run --rm frontend npm run test -- --run`

FILES:
- `frontend/src/components/AppSidebar.tsx#L1`
- `frontend/src/components/AppLayout.tsx#L1`
- `frontend/src/lib/routes.ts#L1`
- `frontend/src/App.tsx#L1`
- `frontend/src/api/projects.ts#L1`
- `frontend/src/api/studies.ts#L1`
- `frontend/src/components/AppLayout.test.tsx#L1`
- `frontend/src/App.routes.test.tsx#L1`
- `frontend/src/pages/StudiesPage.tsx#L1`
- `ralph-loop/results/01-sidebar-ia.md#L1`