STATUS: DONE
SUMMARY:
- Implemented a collaboration index page at `/collaborations` with server-side pagination, search, and sorting (TanStack Query + TanStack Table).
- Added clear create + click-through actions (`New collaboration`, title link, and `Open`).
- Updated `GET /api/projects/` to support DRF `search` + `ordering` so the table stays fully server-side.

PRD CHECK:
- Section: Story 1 (Browse collaborations from one obvious home); REQ-003; REQ-011
- Acceptance: met

VERIFICATION:
- Ran `docker compose run --rm api pytest -q`
- Ran `docker compose run --rm frontend npm test -- --run`

FILES:
- `frontend/src/components/CollaborationIndexPanel.tsx#L1`
- `frontend/src/pages/ProjectsPage.tsx#L1`
- `frontend/src/pages/ProjectsPage.test.tsx#L1`
- `frontend/src/api/projects.ts#L1`
- `backend/core/views.py#L1`
- `backend/core/tests.py#L1`
- `ralph-loop/results/02-collaboration-index.md#L1`