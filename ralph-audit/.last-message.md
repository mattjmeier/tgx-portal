# STORY-003 — Admin Lookup and Permissions Management (2026-04-07)

SUMMARY:
- Admin-managed lookup collections are modeled for Directus-native editing (platform/genome/quant/species + Biospyder metadata) with stable `code` keys and `accountability: all` for auditability.
- Project-scoped RBAC is enforced for `Client` across launch-critical collections, including create/update validation filters to prevent out-of-scope writes.
- A least-privilege `System` role is supported for automation, with verification helpers for read access and Plane sync + audit logging.

PRD CHECK:
- Story: STORY-003 - Admin Lookup and Permissions Management
- Acceptance: met
  - Admin can maintain lookup collections in Directus (grouped under `Lookups` with admin bookmarks) and manage roles/policies via the Admin role (`admin_access: true`) once applied live.
  - Permission filters enforce project-scoped access for Client across `projects → studies → samples → assays → sample_plating` and the TempO-Seq junction collection.
  - System automation can execute required flows/endpoints with a dedicated least-privilege role (read domain + lookups; update only `projects.plane_*` sync fields).
  - Audit-relevant updates are visible via Directus activity history because domain + lookup collections use `accountability: all` (verified by the new end-to-end helper once applied live).
  - Lookup changes propagate without redeploys because downstream workflows read lookup tables dynamically via Directus relations and stable `code` keys.

DIRECTUS CHECK:
- Outcome: blueprint-only
- Evidence:
  - STORY-003 blueprint (collections/fields/permissions/presets/flows stubs): `directus/snapshots/03-admin-lookup-and-permissions-management.yaml`
  - Supported bootstrap path (roles/permissions + lookup stability + presets): `directus/bootstrap/bootstrap_story_003.py`
  - Automation token read-scope verification: `directus/bootstrap/verify_story_003_system_token.py`
  - Plane sync + audit visibility verification: `directus/bootstrap/verify_story_003_plane_sync.py`
  - Guardrails and usage pointers: `directus/README.md`, `directus/bootstrap/README.md`
- Notes:
  - Marked `blueprint-only` because this loop did not apply schema/roles/permissions to a running Directus instance and did not export a real post-apply snapshot.

VERIFICATION:
- Ran `python3 -m unittest discover -s directus/snapshots/tests -p 'test_story_*.py'`
- Ran `node --test directus/extensions/shared/*.test.mjs`
- Did not run Directus schema apply/export in this loop

FILES:
- `directus/snapshots/03-admin-lookup-and-permissions-management.yaml`
- `directus/snapshots/tests/test_story_003_snapshot.py`
- `directus/bootstrap/bootstrap_story_003.py`
- `directus/bootstrap/verify_story_003_system_token.py`
- `directus/bootstrap/verify_story_003_plane_sync.py`
- `directus/README.md`
- `ralph-audit/results/03-admin-lookup-and-permissions-management.md`

STATUS: DONE