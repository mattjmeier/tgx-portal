STATUS: DONE  
SUMMARY:  
- Added explicit study titles end-to-end: `Study.title` (model + migration), exposed via DRF, and required on study creation.  
- Implemented a real `/studies` index with collaboration-grouped sections and title-first labels (species/cell line as secondary).  
- Updated sidebar + workspace surfaces to use study title as the primary label everywhere studies are listed/navigated.  

PRD CHECK:  
- Section: Story 2 (Browse studies preserving collaboration context); REQ-004; D2  
- Acceptance: met (grouping rendered as collaboration headings; pagination can still split a collaboration across pages, but each page keeps collaboration context visible)  

VERIFICATION:  
- Ran `docker compose run --rm api pytest -q`  
- Ran `docker compose run --rm frontend npm test -- --run`  

FILES:  
- `ralph-loop/results/03-study-title-and-index.md#L1`  
- `backend/core/models.py#L1`  
- `backend/core/migrations/0004_study_title.py#L1`  
- `backend/core/serializers.py#L1`  
- `backend/core/views.py#L1`  
- `frontend/src/components/StudyIndexPanel.tsx#L1`  
- `frontend/src/pages/StudiesPage.tsx#L1`  
- `frontend/src/components/StudyForm.tsx#L1`  
- `frontend/src/components/AppSidebar.tsx#L1`  
- `frontend/src/components/AppLayout.tsx#L1`  
- `docs/01-DATABASE_SCHEMA.md#L1`