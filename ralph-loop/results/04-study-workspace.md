STATUS: DONE  
SUMMARY:  
- Added a dedicated study workspace route at `/studies/:studyId` with `Samples` (default), `Contrasts`, and `Collaboration info` tabs.  
- Implemented a focused, samples-first `StudyWorkspace` with sample onboarding moved behind progressive disclosure (`Metadata onboarding`).  
- Updated the sidebar to show a study-specific submenu on study routes, including metadata onboarding, config download (admin), and study info access.  
- Updated study browse links (study index + sidebar previews) to open the new study workspace route.  

PRD CHECK:  
- Section: Story 3 (Open a study into a focused workspace); REQ-005  
- Acceptance: met  

VERIFICATION:  
- Ran `docker compose run --rm frontend npm test -- --run`  

FILES:  
- `ralph-loop/results/04-study-workspace.md#L1`  
- `frontend/src/App.tsx#L1`  
- `frontend/src/lib/routes.ts#L1`  
- `frontend/src/api/studies.ts#L1`  
- `frontend/src/pages/StudyWorkspacePage.tsx#L1`  
- `frontend/src/components/StudyWorkspace.tsx#L1`  
- `frontend/src/components/ui/tabs.tsx#L1`  
- `frontend/src/components/StudyIndexPanel.tsx#L1`  
- `frontend/src/components/AppSidebar.tsx#L1`  
- `frontend/src/pages/StudyWorkspacePage.test.tsx#L1`  
- `frontend/src/components/AppSidebar.studyWorkspace.test.tsx#L1`  
- `frontend/src/App.routes.test.tsx#L1`  
- `frontend/src/components/AppLayout.test.tsx#L1`