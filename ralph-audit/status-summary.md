# Ralph Build Status Summary
Generated: 2026-04-07T20:26:13Z
PRD: /home/mmeier/shared2/projects/tgx-portal/.taskmaster/docs/prd.md

## Story Mapping
### STORY-001: Collaborator Project Intake
- Status: done
- Directus Sensitive: yes
- Dependencies: REQ-001, REQ-002, REQ-004
- Result File: ralph-audit/results/01-collaborator-project-intake.md
- Acceptance Criteria:
  - The intake workflow captures project title, PI name, researcher name, assigned bioinformatician, description, and status.
  - The form adapts based on selected assay or platform choices, including TempO-Seq-specific options only when relevant.
  - Client users can only view and edit projects assigned to them.
  - Validation errors are shown before invalid project data is saved.
  - Project creation or promotion can trigger downstream automation such as Plane integration.
- Note: Accepted as complete after live Directus bootstrap, exported baseline-story-001.yaml, and successful replay of that baseline on a fresh database.

### STORY-002: Bioinformatician Sample Intake
- Status: skipped
- Directus Sensitive: yes
- Dependencies: REQ-001, REQ-003, REQ-005
- Result File: ralph-audit/results/02-bioinformatician-sample-intake.md
- Acceptance Criteria:
  - The upload workflow accepts CSV or TSV input and shows a preview before commit.
  - Invalid rows return row-level and field-level messages, including duplicate `sample_ID` and pattern failures.
  - Valid rows create or update records in the correct related collections.
  - The workflow supports study-scoped validation rules and lookup-backed value checks.
  - The workflow remains inside Directus unless a documented limitation requires a fallback frontend route.
- Note: Skipped: exceeded 5 attempts without passing

### STORY-003: Admin Lookup and Permissions Management
- Status: skipped
- Directus Sensitive: yes
- Dependencies: REQ-001, REQ-002
- Result File: ralph-audit/results/03-admin-lookup-and-permissions-management.md
- Acceptance Criteria:
  - Admin users can maintain lookup collections such as genome versions, quantification methods, species options, and Biospyder metadata.
  - Permission filters enforce project-scoped access for client users across launch-critical collections.
  - System automation can execute required flows and endpoint calls using a dedicated least-privilege role.
  - Audit-relevant updates are visible in Directus activity history or equivalent logging.
  - Lookup changes take effect in downstream forms and config generation without application redeploys.
- Note: Skipped: exceeded 5 attempts without passing

### STORY-004: Workflow Configuration Export
- Status: pending
- Directus Sensitive: yes
- Dependencies: REQ-001, REQ-006
- Result File: ralph-audit/results/04-workflow-configuration-export.md
- Acceptance Criteria:
  - A supported action can generate `config.yaml`, `metadata.tsv`, and `contrasts.tsv` for an eligible project.
  - Artifact generation reads from Directus collections and lookup tables only.
  - Mixed incompatible assay platforms fail with a descriptive error instead of producing invalid output.
  - TempO-Seq exports fail with a descriptive error when required Biospyder metadata is missing.
  - The assigned bioinformatician is notified or shown artifact readiness after successful generation.
- Note: Reset to pending after loop hardening; previous result predated Directus live-validation gating.
