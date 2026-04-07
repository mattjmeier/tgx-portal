# PRD: R-ODAF Portal Directus-First Rebuild

**Author:** Codex
**Date:** 2026-04-07
**Status:** Draft
**Version:** 1.0
**Taskmaster Optimized:** Yes

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Goals & Success Metrics](#goals--success-metrics)
4. [User Stories](#user-stories)
5. [Functional Requirements](#functional-requirements)
6. [Non-Functional Requirements](#non-functional-requirements)
7. [Technical Considerations](#technical-considerations)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Out of Scope](#out-of-scope)
10. [Open Questions & Risks](#open-questions--risks)
11. [Validation Checkpoints](#validation-checkpoints)
12. [Appendix: Task Breakdown Hints](#appendix-task-breakdown-hints)

---

## Executive Summary

The R-ODAF portal currently depends on PDF intake forms, spreadsheets, and a custom-application mindset that makes metadata management, permissions, and downstream configuration generation harder than they need to be. This project will rebuild the portal around Directus and PostgreSQL so that Projects, Studies, Samples, Assays, lookup data, and workflow artifacts are managed in a single governed platform with Directus Data Studio as the primary application shell. The expected outcome is a containerized, Directus-first system that supports project intake, role-scoped metadata management, spreadsheet-assisted sample import, and reproducible Snakemake configuration generation while minimizing custom code and reserving a standalone React frontend for only the cases Directus cannot safely or cleanly support.

---

## Problem Statement

### Current Situation

The current operating model spreads intake and metadata capture across static PDF forms, spreadsheets, and legacy assumptions from a custom Django portal. That creates duplication, manual re-entry, inconsistent validation, weaker traceability, and friction when translating project metadata into workflow-ready artifacts such as `config.yaml`, `metadata.tsv`, and `contrasts.tsv`.

This branch already contains the initial scaffold for a Directus-first stack, including Docker Compose, Directus volume mounts, and a fallback React shell, but the system still needs a product-level definition for what the rebuilt portal must do, what must stay inside Directus, and where custom extensions are justified.

### User Impact

- **Who is affected:** Health Canada collaborators submitting projects, bioinformaticians managing study/sample metadata, and administrators maintaining permissions, lookup data, and platform behavior.
- **How they're affected:** Collaborators rely on brittle intake artifacts, bioinformaticians spend time cleaning and re-validating metadata, and admins lack a single governed interface for enforcing project-scoped access and configuration rules.
- **Severity:** High. The current process increases manual effort, makes auditability harder, and slows the path from intake to valid pipeline configuration.

### Business Impact

- **Cost of problem:** Repeated manual review, spreadsheet cleanup, and rework add operational overhead to every project intake and metadata update cycle.
- **Opportunity cost:** The team cannot fully benefit from Directus-native RBAC, admin-managed lookup tables, reusable flows, or faster delivery of domain workflows if it keeps defaulting to custom backend/frontend patterns.
- **Strategic importance:** Centralizing genomic project metadata in a governed platform directly supports standardization, traceability, and maintainable workflow automation for the lab.

### Why Solve This Now?

The branch already reflects a strategic shift toward Directus, and the architecture documents define the intended collections, flows, UI patterns, and DevOps approach. Converting those notes into a single PRD now allows the team to align scope before rebuilding the portal, keeps the project requirements-first as directed in `AGENTS.md`, and creates an artifact ready for future TaskMaster breakdown once TaskMaster is installed.

---

## Goals & Success Metrics

### Goal 1: Establish Directus as the System of Record

- **Description:** Move core portal data management into Directus collections, permissions, and flows instead of a custom Django-style backend.
- **Metric:** Percentage of launch-critical domain entities managed through Directus collections with documented relations and validation rules.
- **Baseline:** 0 of 5 launch-critical entity groups implemented in Directus in this branch (`projects`, `studies`, `samples`, `assays`, `sample_plating`).
- **Target:** 5 of 5 launch-critical entity groups implemented with required relations, lookup collections, and validation rules before launch.
- **Timeframe:** Before first staging-ready release of the rebuilt portal.
- **Measurement Method:** Schema snapshot review plus integration tests covering CRUD and relation behavior.

### Goal 2: Reduce Manual Metadata Intake and Validation Work

- **Description:** Replace PDF/spreadsheet-heavy intake handling with governed Directus workflows and row-specific validation for bulk sample imports.
- **Metric:** Percentage of sample import validation errors returned with row-level and field-level feedback in the supported upload workflow.
- **Baseline:** 0% in the current scaffold because upload validation workflow is not implemented.
- **Target:** 100% of rejected rows return row-level and field-level errors in the supported CSV/TSV intake flow.
- **Timeframe:** By completion of the sample intake module or equivalent Directus-hosted upload workflow.
- **Measurement Method:** Automated validation tests using representative invalid upload fixtures.

### Goal 3: Generate Reproducible Pipeline Artifacts from Stored Metadata

- **Description:** Produce Snakemake-compatible artifacts directly from Directus data and lookup tables without relying on manually assembled frontend state.
- **Metric:** Percentage of eligible projects that can generate `config.yaml`, `metadata.tsv`, and `contrasts.tsv` from stored metadata alone.
- **Baseline:** 0% in the current scaffold because no config-generation endpoint or flow exists.
- **Target:** 100% of eligible projects can generate all 3 artifacts, and 100% of unsupported mixed-platform projects fail with descriptive errors.
- **Timeframe:** Before launch of the first workflow-config-capable release.
- **Measurement Method:** Contract tests for artifact generation plus golden-file validation of output.

### Goal 4: Enforce Role-Scoped Access for Collaborators

- **Description:** Ensure clients only see projects assigned to them while admins retain full management access and system automations have the least privilege they need.
- **Metric:** Percentage of permission test scenarios that correctly allow or deny access for `Admin`, `Client`, and `System` roles.
- **Baseline:** 0 permission scenarios currently automated in this branch.
- **Target:** 100% pass rate across defined RBAC integration tests for launch-critical collections and actions.
- **Timeframe:** Before staging release.
- **Measurement Method:** Automated permissions test suite against a running Directus stack.

---

## User Stories

### Story 1: Collaborator Project Intake

**As a** collaborator or client,
**I want to** create and update project intake information through a guided Directus-based workflow,
**So that I can** submit accurate project details without relying on static PDF forms.

**Acceptance Criteria:**
- [ ] The intake workflow captures project title, PI name, researcher name, assigned bioinformatician, description, and status.
- [ ] The form adapts based on selected assay or platform choices, including TempO-Seq-specific options only when relevant.
- [ ] Client users can only view and edit projects assigned to them.
- [ ] Validation errors are shown before invalid project data is saved.
- [ ] Project creation or promotion can trigger downstream automation such as Plane integration.

**Task Breakdown Hint:**
- Task 1.1: Model `projects` collection and required relations (~4 hours)
- Task 1.2: Configure Directus roles, policies, and field presentation (~6 hours)
- Task 1.3: Add intake-specific interface logic and automation triggers (~6 hours)
- Task 1.4: Write role and validation tests (~4 hours)

**Dependencies:** REQ-001, REQ-002, REQ-004

---

### Story 2: Bioinformatician Sample Intake

**As a** bioinformatician,
**I want to** upload and validate tabular sample metadata inside Directus,
**So that I can** correct issues quickly and create valid sample and assay records without manual re-entry.

**Acceptance Criteria:**
- [ ] The upload workflow accepts CSV or TSV input and shows a preview before commit.
- [ ] Invalid rows return row-level and field-level messages, including duplicate `sample_ID` and pattern failures.
- [ ] Valid rows create or update records in the correct related collections.
- [ ] The workflow supports study-scoped validation rules and lookup-backed value checks.
- [ ] The workflow remains inside Directus unless a documented limitation requires a fallback frontend route.

**Task Breakdown Hint:**
- Task 2.1: Define import payload and validation contract (~4 hours)
- Task 2.2: Build Directus module, endpoint, or operation for preview and validation (~8 hours)
- Task 2.3: Persist validated rows into collections (~6 hours)
- Task 2.4: Add upload and validation integration tests (~4 hours)

**Dependencies:** REQ-001, REQ-003, REQ-005

---

### Story 3: Admin Lookup and Permissions Management

**As an** administrator,
**I want to** manage lookup tables, roles, and policies in Directus,
**So that I can** maintain reference data and access control without code deployments for routine changes.

**Acceptance Criteria:**
- [ ] Admin users can maintain lookup collections such as genome versions, quantification methods, species options, and Biospyder metadata.
- [ ] Permission filters enforce project-scoped access for client users across launch-critical collections.
- [ ] System automation can execute required flows and endpoint calls using a dedicated least-privilege role.
- [ ] Audit-relevant updates are visible in Directus activity history or equivalent logging.
- [ ] Lookup changes take effect in downstream forms and config generation without application redeploys.

**Task Breakdown Hint:**
- Task 3.1: Create lookup collections and admin views (~4 hours)
- Task 3.2: Implement role and policy rules (~6 hours)
- Task 3.3: Verify automation role capabilities (~3 hours)
- Task 3.4: Add admin-focused test coverage (~3 hours)

**Dependencies:** REQ-001, REQ-002

---

### Story 4: Workflow Configuration Export

**As a** bioinformatician,
**I want to** generate Snakemake-ready configuration artifacts from a project in Directus,
**So that I can** start downstream analysis using reproducible metadata-driven files.

**Acceptance Criteria:**
- [ ] A supported action can generate `config.yaml`, `metadata.tsv`, and `contrasts.tsv` for an eligible project.
- [ ] Artifact generation reads from Directus collections and lookup tables only.
- [ ] Mixed incompatible assay platforms fail with a descriptive error instead of producing invalid output.
- [ ] TempO-Seq exports fail with a descriptive error when required Biospyder metadata is missing.
- [ ] The assigned bioinformatician is notified or shown artifact readiness after successful generation.

**Task Breakdown Hint:**
- Task 4.1: Define export mapping and error contract (~4 hours)
- Task 4.2: Build Directus endpoint or flow-backed operation (~8 hours)
- Task 4.3: Add artifact storage or return behavior (~4 hours)
- Task 4.4: Create golden-file tests for output artifacts (~6 hours)

**Dependencies:** REQ-001, REQ-006

---

## Functional Requirements

### Must Have (P0) - Critical for Launch

#### REQ-001: Core Directus Collections and Relationships

**Description:** The system must implement the R-ODAF domain model in Directus using collections, relations, and lookup tables with the hierarchy `projects -> studies -> samples -> assays`, plus `sample_plating`, `sequencing_runs`, and supporting lookup collections where defined.

**Acceptance Criteria:**
- [ ] Directus collections exist for `projects`, `studies`, `samples`, `assays`, and `sample_plating`.
- [ ] Relations enforce the hierarchy `project -> study -> sample -> assay`.
- [ ] Admin-editable lookup collections exist for genome versions, Biospyder metadata, species, platform, and quantification method options.
- [ ] Duplicate study definitions within the same project are prevented by validation logic.
- [ ] `sample_ID` uniqueness within a study is enforced by validation logic.

**Technical Specification:**
```yaml
collections:
  projects:
    fields: [id, pi_name, researcher_name, bioinformatician_assigned, title, description, owner, status, created_at, updated_at]
  studies:
    fields: [id, project, species, celltype, treatment_var, batch_var, units]
  samples:
    fields: [id, study, sample_ID, sample_name, description, group, chemical, chemical_longname, dose, technical_control, reference_rna, solvent_control]
  assays:
    fields: [id, sample, platform, genome_version, quantification_method, read_mode]
  sample_plating:
    fields: [id, sample, plate_number, batch, plate_well, row, column, index_I7, I7_Index_ID, index2, I5_Index_ID]
validation:
  sample_ID_pattern: "^[a-zA-Z0-9-_]*$"
```

**Task Breakdown:**
- Create collection schemas and relations: Medium (4-8h)
- Add lookup collections and labels: Small (2-4h)
- Implement uniqueness and duplicate guards: Medium (4-8h)
- Test CRUD and relation integrity: Medium (4-8h)

**Dependencies:** None

---

#### REQ-002: Role-Based Access Control in Directus

**Description:** The system must use Directus roles and permission filters to enforce three primary roles: `Admin`, `Client`, and `System`, with clients restricted to assigned projects and their related records.

**Acceptance Criteria:**
- [ ] `Admin`, `Client`, and `System` roles are defined in Directus.
- [ ] Client users can only read or mutate records associated with their assigned projects.
- [ ] Admin users can manage launch-critical collections, lookups, and permissions.
- [ ] System role permissions are limited to automation and integration responsibilities.
- [ ] Permission behavior is covered by automated tests for list, read, create, update, and export actions where applicable.

**Technical Specification:**
```json
{
  "roles": ["Admin", "Client", "System"],
  "client_scope_rule": {
    "projects": { "_eq": "$CURRENT_USER.project_owner_or_assignment" }
  },
  "enforcement_targets": [
    "projects",
    "studies",
    "samples",
    "assays",
    "sample_plating"
  ]
}
```

**Task Breakdown:**
- Configure roles and policies: Medium (4-8h)
- Add collection-level permission filters: Medium (4-8h)
- Validate cross-collection scoping: Medium (4-8h)
- Add RBAC regression tests: Small (2-4h)

**Dependencies:** REQ-001

---

#### REQ-003: Directus-Native Intake and Editing Experience

**Description:** The primary user experience for intake and metadata management must live inside Directus Data Studio using collection editing, custom interfaces, dashboards, displays, layouts, and modules before any standalone frontend is introduced.

**Acceptance Criteria:**
- [ ] Project intake can be completed within Directus using configured collections and interfaces.
- [ ] Platform-specific form behavior supports TempO-Seq-specific options only when the selected platform requires them.
- [ ] Large record exploration supports server-side filtering, sorting, pagination, and search.
- [ ] Custom Directus modules or interfaces are used for domain workflows that cannot be expressed cleanly with native collection views alone.
- [ ] Any decision to use the fallback React frontend is documented with a Directus limitation and approved exception scope.

**Technical Specification:**
```ts
type PreferredUiPath =
  | "Directus collection editor"
  | "Directus custom interface"
  | "Directus dashboard/module"
  | "Fallback React route only by exception";

interface ExplorerTableCapabilities {
  search: true;
  serverSideSort: true;
  pagination: true;
  rowSelection: true;
  exportActions: true;
}
```

**Task Breakdown:**
- Configure collection views and interfaces: Medium (4-8h)
- Implement conditional platform UX: Medium (4-8h)
- Add explorer table customization: Medium (4-8h)
- Document fallback frontend criteria: Small (2-4h)

**Dependencies:** REQ-001, REQ-002

---

#### REQ-004: Project Lifecycle Automation and Plane Integration

**Description:** Project create or status transitions must support automation through Directus Flows or custom operations, including optional synchronization with Plane when a project is created or promoted to an intake-ready state.

**Acceptance Criteria:**
- [ ] Project lifecycle events can trigger a Directus Flow or operation.
- [ ] Plane payload maps workspace from `pi_name`, issue title from project `title`, description from project `description`, and assignee from `bioinformatician_assigned`.
- [ ] Failed Plane requests return a clear error or retry state without corrupting local project data.
- [ ] Automation execution is limited to the appropriate system role or service account.
- [ ] Integration behavior is covered by contract or mocked integration tests.

**Technical Specification:**
```json
{
  "event": "project.created|project.intake_ready",
  "plane_payload": {
    "workspace": "derived_from_pi_name",
    "issue_name": "projects.title",
    "issue_description": "projects.description + portal_link",
    "assignee": "projects.bioinformatician_assigned"
  },
  "failure_mode": "retry_or_surface_error_without_partial_external_state_assumption"
}
```

**Task Breakdown:**
- Define flow trigger and payload mapping: Small (2-4h)
- Implement flow or custom operation: Medium (4-8h)
- Add retry/error handling behavior: Medium (4-8h)
- Test integration contract: Small (2-4h)

**Dependencies:** REQ-001, REQ-002

---

#### REQ-005: Spreadsheet Upload with Row-Level Validation

**Description:** The system must support CSV/TSV-based sample intake through a Directus-hosted upload workflow that previews rows, validates domain rules, and returns row-specific feedback before writing valid records.

**Acceptance Criteria:**
- [ ] The upload workflow accepts CSV and TSV files.
- [ ] The system returns row-level and field-level errors for invalid rows, including pattern violations, duplicates, and lookup mismatches.
- [ ] Successful rows are written into the correct related collections without creating invalid partial state.
- [ ] The upload experience supports copy/paste-friendly workflows where practical.
- [ ] A separate frontend route is used only if a documented Directus extension path proves insufficient.

**Technical Specification:**
```json
{
  "input": {
    "study_id": "string",
    "file_type": "csv|tsv"
  },
  "error_example": {
    "row": 14,
    "field": "sample_ID",
    "code": "duplicate_within_study",
    "message": "sample_ID must be unique within the selected study"
  },
  "write_rule": "all invalid rows blocked from commit; valid rows committed only after confirmation"
}
```

**Task Breakdown:**
- Define validation contract and fixtures: Small (2-4h)
- Build import preview and validation module: Large (8-16h)
- Implement persistence and confirmation flow: Medium (4-8h)
- Add import integration tests: Medium (4-8h)

**Dependencies:** REQ-001, REQ-003

---

#### REQ-006: Config Artifact Generation from Directus Data

**Description:** The system must provide a supported action to generate `config.yaml`, `metadata.tsv`, and `contrasts.tsv` for a project by reading Directus relational data and lookup collections according to the documented Snakemake mapping strategy.

**Acceptance Criteria:**
- [ ] A supported action exists, such as `POST /api/projects/{id}/generate-config` or equivalent Directus endpoint/operation.
- [ ] The generator derives `common`, `pipeline`, `QC`, and `DESeq2` values from Directus collections, lookup collections, and documented defaults.
- [ ] Mixed incompatible assay platforms in one project fail with a descriptive error.
- [ ] Missing required TempO-Seq lookup values fail with a descriptive error.
- [ ] Successful generation returns or stores all 3 required artifacts and indicates readiness to the assigned bioinformatician.

**Technical Specification:**
```http
POST /api/projects/{id}/generate-config
```

```json
{
  "success_response": {
    "project_id": "123",
    "artifacts": ["config.yaml", "metadata.tsv", "contrasts.tsv"],
    "status": "ready"
  },
  "error_response": {
    "status": 422,
    "code": "mixed_platforms_not_supported",
    "message": "Project contains incompatible assay platforms for a single export"
  }
}
```

**Task Breakdown:**
- Implement mapping layer from collections to artifact model: Medium (4-8h)
- Build Directus endpoint or operation: Medium (4-8h)
- Add artifact output handling and notifications: Medium (4-8h)
- Add golden-file and error-path tests: Medium (4-8h)

**Dependencies:** REQ-001

---

### Should Have (P1) - Important but Not Blocking

#### REQ-007: Sequencing Run Traceability

**Description:** The platform should support future-proofed sequencing run tracking using `sequencing_runs` and `assay_sequencing_runs` so assay records can be linked to raw data provenance.

**Acceptance Criteria:**
- [ ] Collections exist for sequencing runs and assay-to-run relationships.
- [ ] An assay can link to one or more sequencing runs.
- [ ] Export-oriented filters can include whether raw data exists or is linked.
- [ ] Admins can manage sequencing metadata without code changes.

**Technical Specification:**
```sql
sequencing_runs(id, run_id, flowcell_id, instrument_name, date_run, raw_data_path)
assay_sequencing_runs(id, assay_id, sequencing_run_id)
```

**Task Breakdown:**
- Add sequencing collections and relations: Small (2-4h)
- Expose filterable views: Small (2-4h)
- Test relation integrity: Small (2-4h)

**Dependencies:** REQ-001

---

#### REQ-008: Admin-Managed Defaults and Overrides for Pipeline Parameters

**Description:** The platform should store default QC and DESeq2 settings in a maintainable Directus-managed configuration source with optional project-level or study-level overrides.

**Acceptance Criteria:**
- [ ] Global defaults are stored in a Directus singleton or equivalent managed collection.
- [ ] Project- or study-level overrides can be defined for supported parameters.
- [ ] Artifact generation resolves defaults and overrides deterministically.
- [ ] Changes to defaults are covered by configuration tests.

**Technical Specification:**
```yaml
defaults_source:
  type: "Directus singleton"
override_priority:
  - study_override
  - project_override
  - global_default
```

**Task Breakdown:**
- Model defaults source: Small (2-4h)
- Implement override resolution: Medium (4-8h)
- Add tests for precedence behavior: Small (2-4h)

**Dependencies:** REQ-006

---

### Nice to Have (P2) - Future Enhancement

#### REQ-009: Highly Tailored External Collaborator Frontend

**Description:** A separate React/Vite application may be introduced for specific collaborator workflows only when Directus-native approaches are proven too awkward or unsafe.

**Acceptance Criteria:**
- [ ] The need for a separate route is documented with a failed or insufficient Directus option.
- [ ] The frontend uses Directus APIs or SDK for data access and authentication.
- [ ] The route covers only the approved exception workflow and does not become the default shell.

**Technical Specification:**
```ts
interface FallbackFrontendConstraint {
  primaryShell: "Directus";
  allowedUse: "approved exception workflows only";
  dataAccess: "@directus/sdk";
}
```

**Task Breakdown:**
- Document exception criteria: Small (2-4h)
- Build only approved route: Medium (4-8h)
- Add focused tests: Small (2-4h)

**Dependencies:** REQ-003

---

## Non-Functional Requirements

### Performance

**Response Time:**
- Directus-backed list and detail queries for launch-critical collections: < 500ms p95 in local/staging environments with representative test data.
- Config-generation request initiation: < 2 seconds to return accepted, ready, or descriptive validation error response for typical project sizes.
- Spreadsheet validation preview for files up to 2,000 rows: < 10 seconds p95.

**Throughput:**
- Support at least 25 concurrent authenticated users performing routine browse/edit actions without critical errors in staging validation.
- Support at least 3 concurrent config-generation jobs or validation jobs without queue corruption or data integrity issues.

**Resource Usage:**
- Directus container memory target: < 1.5 GB during normal local development workload.
- PostgreSQL container memory target: < 1 GB during normal local development workload.
- Frontend fallback container remains optional and may be disabled when not needed.

---

### Security

**Authentication and Authorization:**
- Authentication is handled by Directus.
- Role enforcement must follow least privilege for `Admin`, `Client`, and `System`.
- Clients must never be able to query unrelated projects through collection endpoints, filters, exports, or custom actions.

**Auditability:**
- Create, update, import, and config-generation actions must be traceable through Directus activity logs or equivalent structured logs.
- Permission-sensitive custom endpoints or flows must log actor, action, target project, and outcome.

**Secrets and External Integrations:**
- Directus secrets, admin bootstrap credentials, database credentials, and Plane credentials must come from environment configuration, not hard-coded source files.
- Generated artifacts must only be stored in approved configured storage locations.

---

### Reliability

- Containerized local setup via `docker compose up --build` must complete successfully from a documented clean-start path.
- Launch-critical workflows must fail with descriptive user-facing errors instead of silent partial writes.
- Import and config-generation actions must be idempotent or guarded against duplicate writes for accidental retries.

---

### Maintainability

- Lookup values and pipeline defaults should be editable by admins without redeploying application code.
- Custom code should be limited to Directus extensions, flows, or narrow companion services only when Directus-native features are insufficient.
- Directus schema, permissions, and extension behavior must be versioned through snapshots, code, or documented reproducible setup steps.

---

### Testing

- All launch-critical requirements must have automated integration coverage.
- Custom Directus modules, hooks, endpoints, and operations must have targeted tests.
- End-to-end tests must exercise at least the intake-to-config-generation happy path before launch.
- Fallback frontend tests are required only for approved exception workflows that remain outside Directus.

---

## Technical Considerations

### Architecture Overview

The target architecture is a Directus-first platform running in containers:

```text
Users
  -> Directus Data Studio (primary shell)
    -> Directus collections, roles, permissions, flows
    -> Directus app extensions (interfaces/modules/layouts/displays)
    -> Directus endpoint or operation extensions
      -> PostgreSQL
      -> Plane API
      -> Artifact storage / notification path

Fallback path by exception:
  React + Vite frontend -> Directus SDK / APIs
```

Current branch assets already include:
- PostgreSQL 15 container
- Directus 11 container with mounted `extensions`, `uploads`, and `snapshots`
- Optional Node 20 React/Vite frontend container using `@directus/sdk`

### Integration Preference Order

1. Native Directus collections and permissions
2. Directus flows and operations
3. Directus app extensions
4. External companion service
5. Separate frontend route

Implementation decisions must document why a lower-preference option was chosen.

### Data Model Notes

- `projects.owner` should reference the Directus user or a collaborator record used for client visibility rules.
- Duplicate study definitions within a project require cross-record validation.
- `sample_ID` requires both pattern validation and study-scoped uniqueness.
- Lookup collections must remain admin-editable and non-code-managed wherever feasible.

### API and Extension Strategy

Default data access should use Directus REST endpoints and Directus SDK queries.

Custom behaviors are limited to:
- Spreadsheet preview and validation
- Plane integration wrapper behavior
- Config artifact generation

Recommended custom action signature:

```http
POST /api/projects/{id}/generate-config
```

Recommended upload validation response shape:

```json
{
  "summary": {
    "rows_total": 200,
    "rows_valid": 188,
    "rows_invalid": 12
  },
  "errors": [
    {
      "row": 7,
      "field": "sample_ID",
      "code": "invalid_pattern",
      "message": "sample_ID must match ^[a-zA-Z0-9-_]*$"
    }
  ]
}
```

### DevOps and Environment

- Containers are the default execution model for local and production-like environments.
- Required environment configuration includes Directus bootstrap secrets, PostgreSQL credentials, Plane credentials, notification settings, and artifact storage settings.
- Redis is optional and should only be introduced if justified by companion-service or queue needs.

### Testing Strategy

- Schema and integration tests validate collections, relations, permissions, and flows.
- Extension tests validate custom modules, hooks, endpoints, and operations.
- End-to-end tests run against the containerized stack and exercise project intake, sample upload, and config generation.
- Golden-file tests validate generated `config.yaml`, `metadata.tsv`, and `contrasts.tsv`.

### Error Handling Expectations

- Invalid imports must surface row-specific errors and avoid hidden partial failure.
- Config-generation errors must distinguish incompatible platforms, missing lookup data, authorization failure, and unexpected internal errors.
- External integration failures must surface retryable vs non-retryable outcomes.

---

## Implementation Roadmap

### Phase 1: Foundation and Schema

- Model launch-critical Directus collections and relations.
- Create lookup collections and initial defaults strategy.
- Configure Directus roles, policies, and project-scoped access.
- Capture schema snapshots or reproducible setup artifacts.

**Validation Checkpoint:** Core schema exists, roles configured, CRUD/RBAC integration tests green.

---

### Phase 2: Directus User Experience

- Configure project intake views, field help text, presets, and conditional platform behavior.
- Build server-side explorer views for projects, studies, samples, and assays.
- Confirm which workflows can remain native Directus and document any exceptions.

**Validation Checkpoint:** Directus-only path supports project and metadata management for primary users.

---

### Phase 3: Automation and Import Workflow

- Implement project lifecycle flow(s) and Plane integration behavior.
- Build spreadsheet validation/upload workflow inside Directus.
- Add row-level validation fixtures and persistence rules.

**Validation Checkpoint:** Sample intake preview and validation work end to end with invalid-row feedback.

---

### Phase 4: Config Generation

- Implement Directus endpoint or operation for artifact generation.
- Add lookup/default resolution and platform guardrails.
- Validate artifact outputs with golden files and failure-path tests.

**Validation Checkpoint:** Eligible projects generate all required artifacts reproducibly.

---

### Phase 5: Hardening and Release Readiness

- Add E2E tests across intake, import, and config generation.
- Validate containerized setup and CI checks.
- Review whether any fallback frontend route is still needed.

**Validation Checkpoint:** Staging-ready system passes end-to-end validation and documented launch criteria.

---

## Out of Scope

Explicitly not included in the initial Directus-first rebuild unless separately approved:

1. Rebuilding a large custom backend that duplicates Directus collection, auth, and RBAC responsibilities.
2. Making the React/Vite frontend the default application shell.
3. Implementing every possible downstream workflow in the first release beyond intake, metadata management, and config generation.
4. Replacing Directus admin capabilities with bespoke admin screens where Directus is sufficient.
5. Advanced public-facing portal experiences that have not been justified by Directus UX limitations.

---

## Open Questions & Risks

### Open Questions

#### Q1: What exact Directus permission pattern should represent client assignment?
- **Current Status:** Docs allow either Directus user linkage or a collaborator record.
- **Options:** Direct user ownership, join table for collaborators, or hybrid ownership plus membership.
- **Owner:** Architecture/product team.
- **Deadline:** Before REQ-002 implementation.
- **Impact:** High. This determines how RBAC filters cascade through related collections.

#### Q2: Where should generated artifacts be stored and surfaced?
- **Current Status:** The docs allow return or store behavior, but storage policy is not finalized.
- **Options:** Direct file response, Directus file storage, mounted artifact volume, or external object storage.
- **Owner:** DevOps and bioinformatics stakeholders.
- **Deadline:** Before REQ-006 implementation.
- **Impact:** Medium. Affects notification behavior, retention, and auditing.

#### Q3: Is the spreadsheet upload workflow achievable entirely inside Directus for the expected user experience?
- **Current Status:** Directus-first is preferred, but the boundary for acceptable UX is not yet proven.
- **Options:** Native collection editing plus interfaces, custom Directus module, or approved standalone route.
- **Owner:** Product and implementation team.
- **Deadline:** After Phase 2 UX exploration and before locking Phase 3 scope.
- **Impact:** High. This affects extension complexity and fallback frontend scope.

### Risks & Mitigation

| Risk | Likelihood | Impact | Severity | Mitigation | Contingency |
|------|------------|--------|----------|------------|-------------|
| Directus-native UX proves awkward for a key workflow | Medium | High | High | Prototype inside Directus first with interfaces/modules before committing to external UI | Approve narrowly scoped fallback React route |
| RBAC filters leak related records across project boundaries | Medium | Critical | Critical | Add explicit cross-collection permission tests for all roles | Block release until RBAC suite passes |
| Spreadsheet validation is too weak or too opaque for users | Medium | High | High | Design row/field error contract early and test with invalid fixtures | Move validation into a narrower custom endpoint or companion service |
| Config generation produces inconsistent outputs | Medium | High | High | Use deterministic mapping rules and golden-file tests | Disable export for failing scenarios until corrected |
| Plane integration causes partial or duplicate external side effects | Low | Medium | Medium | Use idempotent payload design, retries, and logged failure states | Allow manual retry from Directus without duplicating local records |

---

## Validation Checkpoints

### Checkpoint 1: Schema and RBAC

**Criteria:**
- [ ] Launch-critical collections and relations exist.
- [ ] Lookup collections exist and are admin-manageable.
- [ ] `Admin`, `Client`, and `System` roles are configured.
- [ ] Permission tests confirm clients cannot access unrelated projects.

**If Failed:** Do not proceed to workflow implementation until data model or access controls are corrected.

---

### Checkpoint 2: Directus UX Readiness

**Criteria:**
- [ ] Project intake can be completed in Directus.
- [ ] Explorer tables support required server-side capabilities.
- [ ] Platform-specific UI rules behave correctly.
- [ ] Any fallback frontend need is explicitly documented and approved.

**If Failed:** Refine Directus interfaces or narrow exception scope before building external UI.

---

### Checkpoint 3: Import and Automation

**Criteria:**
- [ ] Project lifecycle automation triggers successfully.
- [ ] Upload preview and row-level validation work with representative invalid files.
- [ ] Valid sample rows persist without invalid partial writes.
- [ ] Integration tests cover failure and retry paths.

**If Failed:** Fix validation contract and automation behavior before adding config export.

---

### Checkpoint 4: Config Generation

**Criteria:**
- [ ] Eligible projects generate `config.yaml`, `metadata.tsv`, and `contrasts.tsv`.
- [ ] Mixed-platform and missing-lookup guardrails return descriptive errors.
- [ ] Generated artifacts match golden-file expectations.
- [ ] Assigned bioinformatician can access artifact status or output.

**If Failed:** Rework mapping logic and error handling before release hardening.

---

### Checkpoint 5: Release Readiness

**Criteria:**
- [ ] Containerized stack starts successfully from documented setup steps.
- [ ] Integration, extension, and E2E tests pass in CI or equivalent validation environment.
- [ ] Security, logging, and environment configuration requirements are satisfied.
- [ ] Remaining open questions are either resolved or explicitly accepted as launch risks.

**If Failed:** Do not treat the rebuild as staging-ready.

---

## Appendix: Task Breakdown Hints

### Suggested TaskMaster Task Structure

**Foundation (5 tasks, ~24-36 hours)**
1. Model Directus collections and relations
2. Add lookup collections and defaults source
3. Configure roles and permission filters
4. Capture schema snapshots and reproducible setup
5. Write schema/RBAC integration tests

**Directus UX (4 tasks, ~18-28 hours)**
6. Configure project intake editing experience
7. Implement platform-conditional interface behavior
8. Build explorer table views and filters
9. Document fallback frontend exception criteria

**Automation and Import (5 tasks, ~24-36 hours)**
10. Implement project lifecycle flow(s)
11. Add Plane integration wrapper behavior
12. Build sample upload preview and validation module
13. Persist validated rows into collections
14. Add import and automation tests

**Config Generation (4 tasks, ~18-28 hours)**
15. Implement project-to-artifact mapping layer
16. Build config-generation endpoint or operation
17. Add artifact storage/notification behavior
18. Add golden-file and failure-path tests

**Release Hardening (4 tasks, ~16-24 hours)**
19. Add end-to-end tests for intake through export
20. Validate containerized setup and CI workflow
21. Review observability, logging, and secrets handling
22. Finalize release-readiness documentation

**Total:** 22 tasks, ~100-152 hours

### Parallelizable Work

- Schema modeling and test fixture authoring can overlap after the core data model is agreed.
- Directus UX work can proceed in parallel with Plane integration once RBAC and collections exist.
- Config-generation implementation can begin once the data model and mapping rules are stable, even while import UX is being polished.

### Sequential Dependencies

1. REQ-001 must precede most implementation work.
2. REQ-002 should be completed before validating client-facing workflows.
3. REQ-005 and REQ-006 depend on the core schema and Directus access model.
4. Release hardening depends on all launch-critical requirements being implemented.

### Critical Path

1. Core collections and validation
2. RBAC and project scoping
3. Directus intake UX
4. Spreadsheet validation workflow
5. Config generation
6. End-to-end validation

---

**End of PRD**

*This PRD is optimized for future TaskMaster parsing. It reflects the repository’s current Directus-first architecture documents and uses explicit requirements, measurable launch criteria, and dependency-aware implementation hints to support task breakdown later.*
