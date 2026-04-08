# Dependency Graph

## Most Imported Files (change these carefully)

- `frontend/src/api/projects.ts` — imported by **12** files
- `frontend/src/api/samples.ts` — imported by **9** files
- `/models.py` — imported by **7** files
- `frontend/src/auth/AuthProvider.tsx` — imported by **7** files
- `frontend/src/api/http.ts` — imported by **7** files
- `frontend/src/components/ui/button.tsx` — imported by **4** files
- `frontend/src/api/studies.ts` — imported by **3** files
- `/services.py` — imported by **2** files
- `frontend/src/App.tsx` — imported by **2** files
- `frontend/src/components/AppLayout.tsx` — imported by **2** files
- `frontend/src/api/users.ts` — imported by **2** files
- `frontend/src/api/assays.ts` — imported by **2** files
- `frontend/src/components/SampleUploadPanel.tsx` — imported by **2** files
- `/celery.py` — imported by **1** files
- `/views.py` — imported by **1** files
- `/serializers.py` — imported by **1** files
- `/tasks.py` — imported by **1** files
- `frontend/src/auth/RequireAuth.tsx` — imported by **1** files
- `frontend/src/auth/RequireRole.tsx` — imported by **1** files
- `frontend/src/pages/AdminUsersPage.tsx` — imported by **1** files

## Import Map (who imports what)

- `frontend/src/api/projects.ts` ← `frontend/src/api/assays.ts`, `frontend/src/api/samples.ts`, `frontend/src/api/studies.ts`, `frontend/src/api/users.ts`, `frontend/src/components/AdminProjectOwnershipPanel.tsx` +7 more
- `frontend/src/api/samples.ts` ← `frontend/src/api/samples.test.ts`, `frontend/src/components/ProjectWorkspace.tsx`, `frontend/src/components/SampleExplorerTable.tsx`, `frontend/src/components/SampleForm.tsx`, `frontend/src/components/SampleUploadPanel.test.tsx` +4 more
- `/models.py` ← `backend/core/admin.py`, `backend/core/serializers.py`, `backend/core/services.py`, `backend/core/signals.py`, `backend/core/tasks.py` +2 more
- `frontend/src/auth/AuthProvider.tsx` ← `frontend/src/App.test.tsx`, `frontend/src/auth/RequireAuth.tsx`, `frontend/src/auth/RequireRole.tsx`, `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/ProjectWorkspace.tsx` +2 more
- `frontend/src/api/http.ts` ← `frontend/src/api/assays.ts`, `frontend/src/api/auth.ts`, `frontend/src/api/projects.ts`, `frontend/src/api/samples.ts`, `frontend/src/api/studies.ts` +2 more
- `frontend/src/components/ui/button.tsx` ← `frontend/src/components/SampleUploadPanel.tsx`, `frontend/src/components/ui/button.test.tsx`, `frontend/src/components/ui/sidebar.tsx`, `frontend/src/pages/LoginPage.tsx`
- `frontend/src/api/studies.ts` ← `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/ProjectWorkspace.tsx`, `frontend/src/components/StudyForm.tsx`
- `/services.py` ← `backend/core/serializers.py`, `backend/core/views.py`
- `frontend/src/App.tsx` ← `frontend/src/App.test.tsx`, `frontend/src/main.tsx`
- `frontend/src/components/AppLayout.tsx` ← `frontend/src/App.tsx`, `frontend/src/components/AppLayout.test.tsx`
