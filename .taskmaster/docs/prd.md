# PRD: TGX Portal UX Reorientation and Intake Workflow Refactor

**Author:** Codex
**Date:** 2026-04-08
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

TGX Portal already has the beginnings of a collaboration, study, sample, and assay management system, but the current navigation and intake experience are confusing enough that they add extra navigation steps and obscure the portal's core purpose. We will refactor the information architecture, redesign the sidebar and study workspace, and replace fragmented study/sample intake with a staged onboarding workflow built from `shadcn/ui` primitives and backed by lookup-driven, schema-validated metadata flows.

This effort will align the user-facing product with the documented R-ODAF data model and derived artifact contracts, reduce friction for collaborators and bioinformatics staff, and create a cleaner foundation for future status tracking and downstream automation.

---

## Problem Statement

### Current Situation

The current application exposes the right broad concepts but packages them in a way that is difficult to understand:

- The sidebar contains overlapping concepts such as top-level browse sections, registry/directory links, and active workspace shortcuts that compete with each other.
- User-facing terminology is inconsistent. The backend centers on `Project`, but the desired UX centers on `Collaboration`.
- Study navigation is hard to scan, and the current study labels emphasize species and cell type in a way that helps only after the user already knows the study.
- Creating a collaboration or study does not reliably move the user into the next meaningful step.
- Individual pages often show too much at once, with hints and secondary actions competing for attention.
- The intended metadata intake flow described in the docs is not yet represented as a coherent wizard.
- Lookup-driven constrained values, pre-populated known values, metadata template download, validation, and contrast generation are all part of the desired product direction but not yet unified in one experience.

### User Impact

- **Who is affected:** Admin users, bioinformatics staff, collaborators, and future system automation paths.
- **How they're affected:** Users struggle to find collaborations and studies, cannot predict what a page will do before opening it, and have to mentally translate between portal structure and their real-world submission workflow.
- **Severity:** High. The core product promise is "single point of authority on project metadata," and unclear navigation plus fragmented intake directly undermines that promise.

### Business Impact

- **Cost of problem:** Increased onboarding and support effort, slower submission completion, higher risk of incorrect metadata entry, and reduced confidence in the portal as the source of truth.
- **Opportunity cost:** Delayed rollout of downstream automation such as config generation, contrast management, validation workflows, and future status tracking.
- **Strategic importance:** This portal is meant to replace manual PDF intake and scattered metadata management for a regulated genomics workflow. Clear IA and deterministic intake are essential, not cosmetic enhancements.

### Why Solve This Now?

- The codebase already has enough collaboration, study, and sample infrastructure to support a cleaner experience.
- The current UI has gone through multiple iterations and still feels confusing, which suggests a structural issue rather than a styling issue.
- The docs now define enough target behavior around data models, APIs, intake validation, exports, and testing to support a disciplined re-orientation.
- A PRD-driven reset now will reduce rework before additional features such as project status tracking are layered on top.

---

## Goals & Success Metrics

### Goal 1: Make collaboration and study navigation obvious

- **Description:** Users should be able to understand where collaborations live, where studies live, and how to move between overview pages and active workspaces without duplicated links.
- **Metric:** Task completion rate for finding a target collaboration or study in moderated testing.
- **Baseline:** Not formally measured; current qualitative feedback indicates the sidebar is "hugely problematic."
- **Target:** At least 90% of test users can locate a target collaboration and a target study without assistance in a seeded test environment.
- **Timeframe:** By the first usability validation checkpoint after navigation redesign.
- **Measurement Method:** Manual usability testing using seeded data and Playwright-assisted scripted flows.

### Goal 2: Turn intake into a clear staged workflow

- **Description:** Replace disconnected create/import actions with a wizard-like onboarding flow that matches the documented metadata lifecycle.
- **Metric:** Successful completion rate for metadata template download, upload validation, and contrast setup.
- **Baseline:** No complete staged workflow exists today.
- **Target:** End-to-end completion succeeds for seeded happy-path data in automated E2E tests and moderated manual testing, with users able to recover from validation errors in one pass.
- **Timeframe:** By the onboarding validation checkpoint.
- **Measurement Method:** Playwright E2E coverage, backend integration tests, and guided manual walkthroughs.

### Goal 3: Align the UI with documented data contracts and constraints

- **Description:** Ensure the UX, backend, and derived outputs all reflect the documented collaboration-study-sample-assay model, lookup tables, validation rules, and export requirements.
- **Metric:** Requirement coverage across docs and tests.
- **Baseline:** Partial implementation with gaps in lookup administration, metadata-template flow, seeded validation data, and workspace organization.
- **Target:** 100% of P0 requirements in this PRD represented by tests, with documented endpoints and UI flows mapped to source docs.
- **Timeframe:** Before merge of the main UX reorientation milestone.
- **Measurement Method:** Requirement-to-test traceability and PR review against this PRD.

### Goal 4: Keep the redesign grounded in existing architecture constraints

- **Description:** Implement the redesign without abandoning the project's documented stack or architectural rules.
- **Metric:** Compliance with hard constraints.
- **Baseline:** Docs already define container-first execution, strict typing, `shadcn/ui`, TanStack Query, TanStack Table, RBAC, and TDD expectations.
- **Target:** All new frontend UI uses `shadcn/ui` primitives and data table patterns; all new development and tests run through Docker-based flows; all implementation follows red-green-refactor.
- **Timeframe:** Throughout delivery.
- **Measurement Method:** Code review, test commands, and CI behavior.

---

## User Stories

### Story 1: Browse collaborations from one obvious home

**As a** collaborator or admin user,  
**I want to** click `Collaborations` in the sidebar and land on a single table page showing collaborations I can access,  
**So that I can** browse, search, and create collaborations without deciphering duplicate registry links.

**Acceptance Criteria:**
- [ ] Clicking `Collaborations` navigates to a collaboration index page.
- [ ] The collaboration index page uses a server-side data table built with `shadcn/ui`-adjacent table patterns.
- [ ] The sidebar can expand a collaboration submenu showing a small preview list plus a `More...` path when additional results exist.
- [ ] Users only see collaborations they are authorized to access.
- [ ] The separate `Collaboration registry` link is removed from the primary navigation model.

**Task Breakdown Hint:**
- Task 1.1: Redesign sidebar collaboration branch behavior (~6h)
- Task 1.2: Build collaboration index page/table (~8h)
- Task 1.3: Add query, pagination, and top-five preview logic (~6h)
- Task 1.4: Add tests for access and navigation behavior (~4h)

**Dependencies:** Existing project list API and RBAC behavior

---

### Story 2: Browse studies in a way that preserves collaboration context

**As a** collaborator or admin user,  
**I want to** click `Studies` and see all studies I can access, grouped in a way that still helps me find them by collaboration,  
**So that I can** locate the right study without first opening every collaboration.

**Acceptance Criteria:**
- [ ] Clicking `Studies` navigates to a study index page rather than a directory link inside another page.
- [ ] The study index is grouped or segmented by collaboration for easier scanning.
- [ ] Each study has an explicit study title/name used as the primary label in lists and navigation.
- [ ] Study list rows show species and cell line as secondary metadata beneath or beside the study title.
- [ ] The sidebar study branch can expand to show the first few accessible studies plus a `More...` affordance.
- [ ] The separate `Study directory` link is removed from the top-level browse model.

**Task Breakdown Hint:**
- Task 2.1: Define study index IA and grouping rules (~4h)
- Task 2.2: Implement server-side study table/page (~8h)
- Task 2.3: Update sidebar study preview labels and collapse behavior (~5h)
- Task 2.4: Add tests for grouping, labels, and navigation (~4h)

**Dependencies:** Story 1 navigation model and existing studies API

---

### Story 3: Open a study into a focused workspace

**As a** collaborator or admin user,  
**I want to** select a study and immediately arrive at the study page while also seeing study-specific actions in the sidebar,  
**So that I can** work from a stable, predictable workspace.

**Acceptance Criteria:**
- [ ] Selecting a study loads the study workspace immediately.
- [ ] Opening a study also expands a study-specific submenu in the sidebar.
- [ ] The primary study view is a samples table.
- [ ] The study workspace includes tabs for `Samples`, `Contrasts`, and `Collaboration info`.
- [ ] Secondary hints are converted to tooltips or progressive disclosure where appropriate.

**Task Breakdown Hint:**
- Task 3.1: Define study workspace tabs and route state (~5h)
- Task 3.2: Rebuild samples-first workspace layout (~8h)
- Task 3.3: Add study submenu actions and active-state handling (~5h)
- Task 3.4: Add tests for route/tab synchronization (~4h)

**Dependencies:** Study index and sidebar redesign

---

### Story 4: Create collaboration and study records with forward momentum

**As a** user creating new work,  
**I want to** be redirected to the next meaningful page after creating a collaboration or study,  
**So that I can** continue onboarding instead of landing back in an ambiguous state.

**Acceptance Criteria:**
- [ ] Creating a collaboration redirects the user into the new collaboration workspace or next-step flow.
- [ ] The global `New study` entry remains available, but the first step requires collaboration selection before any study-specific fields.
- [ ] Creating a study redirects the user into the created study workspace or intake flow.
- [ ] Redirect behavior respects permissions and preserves context when creation starts from within a collaboration.
- [ ] Success messaging clearly explains the next action.
- [ ] Tests verify redirect destinations and state handoff.

**Task Breakdown Hint:**
- Task 4.1: Decide canonical post-create destinations (~2h)
- Task 4.2: Update create page mutations and route transitions (~4h)
- Task 4.3: Add context-aware success UI (~3h)
- Task 4.4: Add redirect tests (~3h)

**Dependencies:** Stable collaboration and study routes

---

### Story 5: Complete metadata onboarding through a staged wizard

**As a** collaborator submitting study data,  
**I want to** move through a guided onboarding flow for project details, template selection, metadata upload, and contrasts,  
**So that I can** provide the right information once and generate the artifacts the bioinformatics workflow needs.

**Acceptance Criteria:**
- [ ] The onboarding flow is a staged wizard built from `shadcn/ui` primitives.
- [ ] The first stage captures high-level details such as PI, researcher, description, and collaboration/study context.
- [ ] A template-selection stage lets users choose mandatory and optional metadata columns, including constrained custom fields.
- [ ] Users can download a template named `{project_code}_metadata.csv`.
- [ ] Users can drag and drop a metadata file for local preview and server validation.
- [ ] Validation errors are aggregated and shown at summary plus row/cell level.
- [ ] A contrasts/mapping stage lets users define DESeq2 mappings with multiple treatment and batch variables supported in metadata.
- [ ] Users can save a draft onboarding state before contrast generation is fully valid.
- [ ] The UI can suggest contrasts from the uploaded metadata, but final output generation remains blocked until required mappings are complete.

**Task Breakdown Hint:**
- Task 5.1: Define wizard stages and state model (~6h)
- Task 5.2: Build template-selection UI and download flow (~8h)
- Task 5.3: Build upload/preview/validation stage (~10h)
- Task 5.4: Build contrast and mapping stage (~8h)
- Task 5.5: Add E2E coverage for happy path and validation recovery (~6h)

**Dependencies:** Lookup APIs, metadata validation contract, and study workspace structure

---

### Story 6: Reuse controlled values without losing flexibility

**As a** collaborator or admin user,  
**I want to** select from constrained database-backed values and reuse known names where possible, while still being able to add new values when allowed,  
**So that I can** submit consistent metadata without being blocked by one-off gaps.

**Acceptance Criteria:**
- [ ] Lookup-backed fields are served from the backend rather than hardcoded.
- [ ] Fields such as researcher and PI can pre-populate from existing values where appropriate.
- [ ] Adding a new value follows a bounded workflow rather than unstructured free text everywhere.
- [ ] True controlled vocabularies remain admin-managed, while softer recurring values can use scoped select-or-create patterns.
- [ ] Metadata field definitions support required, optional, and custom-but-typed columns.
- [ ] Deactivated values remain valid historically but are not shown for new selections.

**Task Breakdown Hint:**
- Task 6.1: Review required lookup tables and missing endpoints (~4h)
- Task 6.2: Define reusable combobox/create-new patterns (~5h)
- Task 6.3: Implement backend/frontend lookup contract (~8h)
- Task 6.4: Add tests for active/inactive values and creation rules (~4h)

**Dependencies:** Docs 01 and 02 contracts

---

### Story 7: Validate and test against realistic seeded data

**As a** developer or reviewer,  
**I want to** quickly reset the database and load realistic collaborations and studies,  
**So that I can** test navigation, onboarding, permissions, and output generation reliably.

**Acceptance Criteria:**
- [ ] Seed data includes at least two collaborations with different PIs.
- [ ] Each seeded collaboration contains at least three studies.
- [ ] Seed data supports both collaborator and admin review scenarios.
- [ ] There is a documented reset/re-init command sequence for local and test environments.
- [ ] Tests use factories or seed fixtures in a container-first workflow.

**Task Breakdown Hint:**
- Task 7.1: Define seed dataset shape and ownership scenarios (~3h)
- Task 7.2: Implement reset/bootstrap flow (~5h)
- Task 7.3: Add backend fixtures/factories and frontend mocks (~6h)
- Task 7.4: Add documentation and CI-compatible usage notes (~3h)

**Dependencies:** Docker/test environment and existing models

---

## Functional Requirements

### Must Have (P0) - Critical for Launch

#### REQ-001: User-facing terminology must center on Collaborations and Studies
**Description:** The application must present `Collaborations` and `Studies` as the primary top-level navigation concepts. Technical backend naming such as `Project` may remain in code and API payloads initially, but the UI must consistently translate that model into collaboration language.

**Acceptance Criteria:**
- [ ] Top-level navigation shows `Collaborations` and `Studies`.
- [ ] User-facing labels avoid mixing `project`, `registry`, `directory`, and `workspace` in confusing ways.
- [ ] Collaboration pages, study pages, and breadcrumbs follow one terminology model.

**Technical Specification:**
```text
Model name in backend: Project
Primary UI label: Collaboration
Secondary UI label: Study
Translation rule: preserve API compatibility where possible, map terminology in route labels, headings, buttons, and table copy.
```

**Task Breakdown:**
- Audit labels and routes: Small (3h)
- Update navigation and page copy: Medium (5h)
- Test for label regressions: Small (3h)

**Dependencies:** None

---

#### REQ-002: Sidebar information architecture must support direct navigation and preview
**Description:** The sidebar must support direct entry into collaboration and study index pages while also offering expandable preview lists. Clicking a top-level heading should navigate and reveal contextual preview content; clicking again should collapse the submenu.

**Acceptance Criteria:**
- [ ] `Collaborations` and `Studies` act as navigation targets and collapsible controls.
- [ ] Preview lists show up to five accessible records plus a `More...` option when needed.
- [ ] Preview list state is understandable and keyboard accessible.
- [ ] Existing bottom utility links such as `Reference library` and `Admin` remain available.

**Technical Specification:**
```typescript
type SidebarBranchState = {
  routeTarget: "/collaborations" | "/studies";
  expanded: boolean;
  previewLimit: 5;
  items: Array<{ id: number; label: string; secondary?: string }>;
};
```

**Task Breakdown:**
- Refactor branch interaction model: Medium (6h)
- Add preview data hooks and loading states: Medium (6h)
- Add accessibility and route-state tests: Small (4h)

**Dependencies:** REQ-001

---

#### REQ-003: Collaboration index page must replace redundant registry navigation
**Description:** A dedicated collaboration index page must list all accessible collaborations using a server-side table, with create actions available from the page itself rather than through separate duplicated navigation concepts.

**Acceptance Criteria:**
- [ ] Collaboration index page is reachable from the main sidebar.
- [ ] It supports pagination, sorting, search, and row click-through.
- [ ] It includes an obvious create-new collaboration action.
- [ ] Access is filtered by RBAC.

**Technical Specification:**
```text
Page type: route-level page in frontend/src/pages
Data source: GET /api/projects/
Table style: TanStack Table v8 + shadcn-aligned table chrome
Actions: create collaboration, open collaboration
```

**Task Breakdown:**
- Create/reshape page shell: Medium (5h)
- Implement server-side table behaviors: Medium (8h)
- Add tests for RBAC and navigation: Small (4h)

**Dependencies:** REQ-002

---

#### REQ-004: Study index page must show all accessible studies with collaboration grouping and explicit study titles
**Description:** A dedicated study index page must show all accessible studies, grouped or segmented by collaboration to improve findability. Each study must have an explicit study title/name that becomes the primary label in navigation, tables, and workspace headers.

**Acceptance Criteria:**
- [ ] The study index page shows all accessible studies.
- [ ] Studies are visually grouped by collaboration or include equivalent context.
- [ ] Study creation requires a user-entered study title/name.
- [ ] Study naming emphasizes the explicit study title first and species/cell line second.
- [ ] Create-new study is available from the page.

**Technical Specification:**
```text
Primary data: GET /api/studies/
Grouping source: collaboration/project relationship
Primary display label: study title/name
Secondary display metadata: species, cell line/cell type, collaboration name
Fallback if backend does not support grouped response initially: client-side grouping over paginated API responses with documented limitations
```

**Task Breakdown:**
- Define study list schema, title field, and grouping needs: Medium (5h)
- Implement grouped display and filters: Medium (8h)
- Add tests for title-first labels and grouping: Small (4h)

**Dependencies:** REQ-003 or equivalent stable navigation routes

---

#### REQ-005: Study workspace must be samples-first with focused tabs
**Description:** Selecting a study must open a focused study workspace whose primary view is a samples table, with secondary tabs for contrasts and collaboration info.

**Acceptance Criteria:**
- [ ] The default study tab is `Samples`.
- [ ] The workspace includes `Contrasts` and `Collaboration info` tabs.
- [ ] Sidebar submenu exposes study-specific actions such as metadata onboarding, config download, and study info access.
- [ ] The page avoids clutter by demoting hints into tooltips or progressive disclosure.

**Technical Specification:**
```typescript
type StudyWorkspaceTab = "samples" | "contrasts" | "collaboration";

type StudyWorkspaceAction =
  | "add-sample-metadata"
  | "download-config-bundle"
  | "view-study-information";
```

**Task Breakdown:**
- Build tabbed workspace shell: Medium (6h)
- Connect samples table and placeholders for contrasts/info: Medium (8h)
- Add sidebar submenu synchronization: Medium (5h)
- Add route and tab tests: Small (4h)

**Dependencies:** REQ-004

---

#### REQ-006: Post-create flows must redirect users into the next meaningful screen
**Description:** After creating a collaboration or a study, the system must navigate the user into the appropriate next page rather than leaving them in place. The global study creation entry must remain available, but it must ask for collaboration selection before any study-specific setup continues.

**Acceptance Criteria:**
- [ ] Collaboration creation redirects into the created collaboration context.
- [ ] The global study flow requires collaboration selection in step 1.
- [ ] Study creation redirects into the created study context or onboarding flow.
- [ ] Success states explain what happens next.
- [ ] Tests cover creation from both global and contextual entry points.

**Technical Specification:**
```text
Post-create destination examples:
- collaboration create -> /collaborations/:id
- study create from collaboration -> /collaborations/:projectId?study=:studyId
- study create from global index -> collaboration selection step -> canonical study workspace route
```

**Task Breakdown:**
- Define route contract: Small (2h)
- Update mutation success handlers: Small (4h)
- Add coverage for redirects and messages: Small (3h)

**Dependencies:** REQ-003, REQ-004, REQ-005

---

#### REQ-007: Intake must be implemented as a staged onboarding workflow
**Description:** The portal must provide a guided onboarding flow for metadata intake inspired by a `shadcn/ui` onboarding pattern, adapted to the R-ODAF workflow and data contracts.

**Acceptance Criteria:**
- [ ] The flow is multi-step rather than a single long form.
- [ ] High-level details appear early.
- [ ] Metadata template selection and download happen before upload validation.
- [ ] Drag-and-drop upload and local preview are supported.
- [ ] Contrast generation and analysis mapping are part of the flow.

**Technical Specification:**
```text
Suggested stages:
1. Collaboration/study context and high-level details
2. Metadata column selection and template download
3. Metadata upload, preview, and validation
4. Contrasts and analysis mappings
5. Review and generate outputs
```

**Task Breakdown:**
- Design wizard state machine: Medium (6h)
- Build stage components from shadcn primitives: Large (12h)
- Add upload preview and validation plumbing: Large (10h)
- Add route persistence and tests: Medium (6h)

**Dependencies:** REQ-005 and lookup/validation endpoints

---

#### REQ-008: Metadata template generation must support required, optional, and typed custom fields
**Description:** Users must be able to configure metadata templates by selecting required and optional columns, with bounded support for custom fields via admin-managed definitions.

**Acceptance Criteria:**
- [ ] Required columns are locked on and visually distinct.
- [ ] Optional fields are grouped by domain.
- [ ] If `chemical` is selected, `CASN` is auto-included with explanation.
- [ ] Users can name or select allowed custom fields through typed definitions rather than raw freeform columns.
- [ ] Template filename follows `{project_code}_metadata.csv`.

**Technical Specification:**
```text
APIs:
- GET /api/lookups/
- POST /api/metadata-templates/preview/
- POST /api/metadata-templates/download/

Core entity:
- MetadataFieldDefinition
```

**Task Breakdown:**
- Build template configuration schema and UI: Medium (8h)
- Implement preview/download contract: Medium (8h)
- Add tests for required fields and auto-inclusion rules: Small (5h)

**Dependencies:** Docs 01, 02, and 03 lookup/template definitions

---

#### REQ-009: Metadata upload validation must be aggregate and user-readable
**Description:** Uploaded metadata must be previewed and validated against Pydantic-driven rules, with all discovered issues returned in one pass and displayed in user language.

**Acceptance Criteria:**
- [ ] CSV/TSV upload supports drag-and-drop.
- [ ] Local preview shows parsed columns and rows before submission.
- [ ] Server validation returns machine-addressable error locations.
- [ ] UI highlights row/cell issues and shows a summary list.
- [ ] Spreadsheet booleans like `T` and `F` are normalized correctly.

**Technical Specification:**
```typescript
type ValidationError = {
  row_index: number;
  column_key: string;
  message: string;
  severity: "error" | "warning";
};
```

**Task Breakdown:**
- Implement upload and preview stage: Medium (8h)
- Implement backend aggregate validation: Large (10h)
- Add error presentation components and tests: Medium (6h)

**Dependencies:** REQ-007 and REQ-008

---

#### REQ-010: Analysis mapping must support multiple treatment and batch variables from metadata
**Description:** The onboarding flow and persistence model must support treatment and batch mappings coming from metadata columns rather than from a single fixed study-level field.

**Acceptance Criteria:**
- [ ] The flow supports at least one required treatment mapping plus additional optional treatment levels.
- [ ] Batch mappings are chosen from uploaded metadata columns.
- [ ] Mapping options are derived from the uploaded file, not re-entered manually.
- [ ] Users can save mapping progress as a draft when required mappings are still incomplete.
- [ ] The system can suggest candidate contrasts from uploaded metadata values for user review.
- [ ] Final contrast generation and output generation remain blocked until required mappings are complete and valid.
- [ ] Persisted mappings drive config, metadata, contrasts, and export generation.

**Technical Specification:**
```text
Persisted inputs:
- treatment_level_1 through treatment_level_5
- batch
- pca_color
- pca_shape
- pca_alpha
- clustering_group
- report_faceting_group

Workflow rule:
- draft saves allowed before mappings are complete
- suggested contrasts may be generated for review
- final output generation blocked until validation passes
```

**Task Breakdown:**
- Reconcile current Study fields with desired mapping model: Medium (6h)
- Build mapping stage UI and persistence: Medium (8h)
- Add serializer/export integration tests: Medium (6h)

**Dependencies:** REQ-007 and docs 02/04

---

#### REQ-011: All new and updated data grids must use the standardized shadcn/TanStack table pattern
**Description:** Collaboration, study, sample, and future data explorer tables must use a shared server-side data grid pattern built with TanStack Table v8 and `shadcn/ui` table-adjacent primitives.

**Acceptance Criteria:**
- [ ] All modified tables use server-side sorting, pagination, and filtering.
- [ ] Shared table behaviors are reusable across pages.
- [ ] Column toggle and row selection support remain available where required.
- [ ] Styling remains close to default `shadcn/ui` patterns unless a deviation is justified.

**Technical Specification:**
```text
State management: TanStack Query + TanStack Table
UI primitives: shadcn buttons, inputs, dropdowns, pagination, menus
Server params: page, ordering, search, filters
```

**Task Breakdown:**
- Define or adopt shared table scaffolding: Medium (6h)
- Migrate collaboration/study/sample tables: Large (12h)
- Add tests for server-side behavior contracts: Medium (6h)

**Dependencies:** Existing frontend table infrastructure

---

#### REQ-012: Seed data and reset workflows must support UX and validation testing
**Description:** The project must include a deterministic reset and repopulation workflow with realistic data for manual QA, automated tests, and demos.

**Acceptance Criteria:**
- [ ] Seed data includes two collaborations with different PIs.
- [ ] Each collaboration has at least three studies.
- [ ] Seed data covers multiple species/cell line combinations.
- [ ] Reset/re-init is documented and runnable in the Docker workflow.

**Technical Specification:**
```text
Preferred tools:
- pytest + factory_boy for backend tests
- deterministic seed/bootstrap command for dev/QA
- container-first execution through docker compose
```

**Task Breakdown:**
- Create seed blueprint: Small (3h)
- Implement reset/bootstrap flow: Medium (5h)
- Document commands and add validation tests: Small (4h)

**Dependencies:** Docker/test setup

---

### Should Have (P1) - Important but Not Blocking

#### REQ-013: Lookup-backed create-or-select UX for recurring values
**Description:** Repeated values such as PI name, researcher name, and related controlled inputs should prefer searchable select-or-create patterns over repeated free text entry where policy allows. The policy is hybrid by field type: controlled scientific or pipeline vocabularies remain admin-managed, while softer recurring people or project labels may support scoped create-or-select patterns.

#### REQ-014: Study and collaboration pages should use tooltips and progressive disclosure to reduce clutter
**Description:** Guidance and secondary hints should move into tooltips, accordions, or compact help surfaces rather than occupying primary layout space.

#### REQ-015: Advanced config overrides should live behind an accordion in the onboarding flow
**Description:** QC and DESeq2 defaults should be preserved while allowing expert overrides without overwhelming default users.

#### REQ-016: Collaboration and study index pages should support lightweight summary cards or counts
**Description:** Pages may show counts such as study totals, sample totals, or recent activity if those additions do not compromise clarity or performance.

---

### Nice to Have (P2) - Future Enhancement

#### REQ-017: Add a main `Status` navigation area for project tracking
**Description:** A future top-level `Status` view should present project/study progress in a Kanban-style board once the core IA and onboarding flows are stable.

#### REQ-018: Extend outputs and workspace views with richer derived artifact previews
**Description:** Future versions may preview generated YAML, metadata tables, GEO exports, or sample sheet payloads inline before download.

---

## Non-Functional Requirements

### Performance

**Response Time:**
- Collaboration and study list endpoints: p95 under 500ms for typical filtered requests.
- Sample table interactions: p95 under 700ms for paginated/sorted study-level sample queries.
- Metadata template preview/download initiation: under 2 seconds for normal requests.
- Metadata validation response for typical intake sheets up to 2,000 rows: under 10 seconds with aggregate errors returned.

**Throughput:**
- System must support concurrent collaborator/admin browsing without client-side full-table loading.
- Table UI must remain server-side to protect future performance as sample volume grows into the hundreds of thousands.

**Resource Usage:**
- Frontend must avoid loading full collaboration/study/sample datasets into memory.
- Backend validation should stream or batch intelligently where appropriate, but correctness takes priority over micro-optimization in the first milestone.

---

### Security

**Authentication:**
- Existing authentication model remains in place.
- Authenticated access is required for all collaboration and study views.

**Authorization:**
- RBAC roles remain `Admin`, `Client`, and `System`.
- Clients may only view or edit their own assigned collaborations/projects and descendant studies.
- Admin-only operations include lookup administration and other elevated controls.

**Data Protection:**
- Validation errors and uploaded metadata must be handled as project data, not exposed across tenants.
- Generated bundles and temporary artifacts must use project-scoped temporary storage with controlled download flows and automatic cleanup.

**Compliance Mindset:**
- System behavior should favor deterministic validation, auditable data flows, and explicit mapping logic suitable for regulated scientific workflows.

---

### Scalability

**User Load:**
- Architecture must remain viable as collaborator usage and study counts increase.

**Data Volume:**
- Sample and assay records will grow substantially; all grids must stay server-side.
- Lookup tables must be database-backed to support evolution without code deploys.

**Extensibility:**
- The redesign must leave room for future Kanban status tracking and richer export management without another sidebar reset.

---

### Reliability

**Operational Model:**
- Development, testing, and production execution remain container-first using Docker Compose.
- Frontend, backend, worker, Redis, and Postgres services must continue to operate with dev/prod parity.

**Error Handling:**
- Validation should fail clearly and comprehensively, not one error at a time.
- Redirect and navigation flows should degrade gracefully when API calls fail.

**Monitoring and Debugging:**
- Existing healthcheck patterns should remain intact.
- E2E failure artifacts should remain available through CI when configured.

---

### Accessibility

**Standards:**
- Preserve `shadcn/ui` and Radix accessibility defaults.
- Sidebar, tabs, comboboxes, tables, and dialogs must remain keyboard accessible.
- Tooltip usage must not hide essential information from keyboard or screen-reader users.

**Testing:**
- Component tests should cover focusable controls and role-sensitive states.
- Manual review should confirm that navigation patterns remain understandable without pointer-only interaction.

---

### Compatibility

**Browsers and Layout:**
- Desktop-first experience is acceptable for current users, but pages must remain functional on smaller widths.
- Sidebar behavior and study workspace tabs must work on both desktop and mobile layouts supported by the existing app shell.

**Development Compatibility:**
- New work must fit the existing React 18 + Vite + TypeScript stack and Django + DRF backend.

---

## Technical Considerations

### System Architecture

**Current Architecture:**
- Backend: Django + DRF + PostgreSQL + Pydantic validation services
- Frontend: React 18 + TypeScript + Vite + Tailwind + `shadcn/ui`
- State and data fetching: TanStack Query
- Tables: TanStack Table v8
- Background tasks: Celery + Redis
- Tests: Pytest, Vitest, Playwright
- Delivery model: Docker Compose

**Current Product Shape:**
- Existing pages include collaborations/projects, project workspace, study creation, admin users, and reference library.
- Current sidebar already has promising visual elements plus `Create`, `Browse`, `Reference library`, and `Admin`, but its overall IA is confusing.
- Current tests already encode some navigation behavior that will need to be intentionally rewritten alongside the redesign.

**Proposed Changes:**
- Keep the existing backend stack and main model hierarchy.
- Reframe the UI around `Collaboration` and `Study`.
- Introduce or refactor route-level index pages for collaborations and studies.
- Refocus the study workspace around a sample table plus tabs.
- Build a route-aware onboarding wizard for metadata intake.
- Expand lookup/template/validation/mapping contracts where gaps exist.
- Add deterministic seed/reset tooling for repeatable UX testing.

### Data Model and Terminology Alignment

- `Project` remains the likely persistence model for a collaboration in the short term.
- `Study` remains the experiment-level unit.
- Metadata mappings currently split across `Study`, `Sample`, `Assay`, and future normalized metadata definitions must be revisited so treatment and batch semantics come from uploaded metadata rather than only study-level fields.
- First-class and normalized metadata must continue to support derived artifacts:
  - `config.yaml`
  - `metadata.tsv`
  - `contrasts.tsv`
  - Illumina sample sheet payload
  - analysis metadata file
  - GEO metadata file

### Frontend Architecture Guidance

- Use `shadcn/ui` primitives from `frontend/src/components/ui`.
- Keep application-specific workflows outside the `ui` folder.
- Prefer composition over one-off controls.
- Favor minimal customization of default `shadcn` appearance in this milestone.
- Use shared wrappers for forms, tables, tabs, dialogs, comboboxes, tooltips, and upload states.

### API and Integration Guidance

- Continue using documented REST endpoints with DRF pagination.
- Add or complete the workflow endpoints described in `docs/02-API_AND_INTEGRATIONS.md`.
- Preserve deterministic validation across preview, upload, persistence, and output generation.
- Keep Plane integration and downstream config-generation concerns compatible with the new onboarding flow.

### Testing and Delivery Guidance

- Follow TDD: write tests before implementation changes.
- Run development and test commands through Dockerized services.
- Frontend changes require Vitest coverage; backend workflow changes require pytest coverage; cross-step onboarding requires Playwright coverage.
- Seed data and reset scripts must support both manual UX checks and automated tests.

### Constraints

- Do not abandon the documented stack.
- Do not introduce client-side full-data tables.
- Do not hardcode lookup values that docs say must be database-backed.
- Do not build bespoke UI patterns where `shadcn/ui` primitives already fit.
- Do not defer navigation cleanup by simply adding more links.

---

## Implementation Roadmap

### Phase 1: Information Architecture and Routing Reset
**Goal:** Establish clear terminology, top-level navigation, and canonical routes.

**Tasks:**
- [ ] Task 1.1: Audit existing collaboration/project/study navigation labels and routes
  - Complexity: Small (3h)
  - Dependencies: None
  - Owner: Full-stack
- [ ] Task 1.2: Define canonical route map for collaboration index, study index, and study workspace
  - Complexity: Small (4h)
  - Dependencies: Task 1.1
  - Owner: Frontend
- [ ] Task 1.3: Refactor sidebar IA to `Collaborations` and `Studies` with preview/collapse behavior
  - Complexity: Medium (8h)
  - Dependencies: Task 1.2
  - Owner: Frontend
- [ ] Task 1.4: Rewrite navigation tests to match the new model
  - Complexity: Medium (6h)
  - Dependencies: Task 1.3
  - Owner: Frontend

**Validation Checkpoint:** Users can enter collaboration and study index pages from a coherent sidebar.

---

### Phase 2: Collaboration and Study Index Pages
**Goal:** Replace redundant registry/directory navigation with clear browse pages.

**Tasks:**
- [ ] Task 2.1: Build collaboration index page with server-side table and create action
  - Complexity: Medium (8h)
  - Dependencies: Phase 1 complete
  - Owner: Frontend
- [ ] Task 2.2: Add explicit study title field/contract and build study index page with collaboration-aware grouping
  - Complexity: Large (12h)
  - Dependencies: Phase 1 complete
  - Owner: Full-stack
- [ ] Task 2.3: Confirm API support for study index filters/grouping and add gaps if required
  - Complexity: Medium (6h)
  - Dependencies: Task 2.2
  - Owner: Backend
- [ ] Task 2.4: Add tests for RBAC, grouping, and navigation outcomes
  - Complexity: Medium (6h)
  - Dependencies: Tasks 2.1-2.3
  - Owner: Full-stack

**Validation Checkpoint:** Seeded users can browse collaborations and studies without using old registry/directory links.

---

### Phase 3: Study Workspace Restructure and Post-Create Redirects
**Goal:** Make study pages samples-first and ensure create flows move users forward.

**Tasks:**
- [ ] Task 3.1: Redesign study workspace around `Samples`, `Contrasts`, and `Collaboration info` tabs
  - Complexity: Medium (8h)
  - Dependencies: Phase 2 complete
  - Owner: Frontend
- [ ] Task 3.2: Add study-specific sidebar submenu and active state behavior
  - Complexity: Medium (5h)
  - Dependencies: Task 3.1
  - Owner: Frontend
- [ ] Task 3.3: Update create collaboration and create study flows so global study creation selects collaboration first, then redirects into the new route model
  - Complexity: Medium (6h)
  - Dependencies: Task 3.1
  - Owner: Frontend
- [ ] Task 3.4: Add tests for workspace route behavior, tab defaults, and redirects
  - Complexity: Medium (6h)
  - Dependencies: Tasks 3.1-3.3
  - Owner: Frontend

**Validation Checkpoint:** Selecting or creating a study consistently lands users in a focused workspace.

---

### Phase 4: Metadata Onboarding Wizard and Validation Contract
**Goal:** Build the staged intake workflow from high-level details through metadata validation and mapping.

**Tasks:**
- [ ] Task 4.1: Design wizard stages, shared state, and route persistence
  - Complexity: Medium (6h)
  - Dependencies: Phase 3 complete
  - Owner: Frontend
- [ ] Task 4.2: Implement lookup and metadata-template backend endpoints or fill gaps
  - Complexity: Large (12h)
  - Dependencies: Phase 3 complete
  - Owner: Backend
- [ ] Task 4.3: Build template-selection step with required/optional/custom field support
  - Complexity: Medium (8h)
  - Dependencies: Tasks 4.1-4.2
  - Owner: Frontend
- [ ] Task 4.4: Build drag-and-drop upload, local preview, and aggregate validation step
  - Complexity: Large (12h)
  - Dependencies: Tasks 4.1-4.2
  - Owner: Full-stack
- [ ] Task 4.5: Build mapping/contrast step with multiple treatment levels and batch mapping
  - Complexity: Medium (8h)
  - Dependencies: Task 4.4
  - Owner: Full-stack
- [ ] Task 4.6: Add draft-save and suggested-contrast behavior while keeping final generation validation-gated
  - Complexity: Medium (6h)
  - Dependencies: Task 4.5
  - Owner: Full-stack

**Validation Checkpoint:** Users can download a template, upload seeded metadata, see aggregated errors, fix them, and proceed.

---

### Phase 5: Derived Outputs, Seed Data, and Test Hardening
**Goal:** Connect the new UX to output generation and make the system repeatable to validate across fresh environments.

**Tasks:**
- [ ] Task 5.1: Verify persistence and serializer behavior for config and export inputs
  - Complexity: Medium (8h)
  - Dependencies: Phase 4 complete
  - Owner: Backend
- [ ] Task 5.2: Add deterministic seed data with two collaborations and three studies each
  - Complexity: Medium (6h)
  - Dependencies: Phase 4 complete
  - Owner: Backend
- [ ] Task 5.3: Add reset/re-init workflow for local QA and tests
  - Complexity: Small (4h)
  - Dependencies: Task 5.2
  - Owner: Backend
- [ ] Task 5.4: Expand pytest, Vitest, and Playwright coverage across the new flows
  - Complexity: Large (12h)
  - Dependencies: Tasks 5.1-5.3
  - Owner: Full-stack
- [ ] Task 5.5: Document the new UX model, test data flow, and developer workflow
  - Complexity: Small (4h)
  - Dependencies: Tasks 5.1-5.4
  - Owner: Full-stack

**Validation Checkpoint:** Fresh environments can be seeded, tested, and used for manual UX review reliably.

---

### Task Dependencies Visualization

```text
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5

Critical path:
1.2 Canonical routes
-> 1.3 Sidebar IA
-> 2.2 Study index
-> 3.1 Study workspace
-> 4.2 Lookup/template backend contract
-> 4.4 Upload + aggregate validation
-> 4.5 Mapping/contrasts
-> 5.1 Derived output verification
-> 5.4 End-to-end test hardening
```

---

### Effort Estimation

**Total Estimated Effort:**
- Phase 1: 21 hours
- Phase 2: 30 hours
- Phase 3: 23 hours
- Phase 4: 46 hours
- Phase 5: 34 hours
- **Total: ~154 hours**

**Risk Buffer:** +20% (~31 hours) for data model adjustments, route churn, and validation edge cases  
**Final Estimate:** ~185 hours

---

## Out of Scope

Explicitly NOT included in this release:

1. **Full Kanban status board**
   - Reason: Valuable future feature, but the current priority is fixing information architecture and intake.
   - Future: Main `Status` sidebar destination after the core UX is stable.

2. **Deep visual redesign beyond default `shadcn/ui` patterns**
   - Reason: Styling is not the core problem. Information architecture and workflow clarity are.
   - Future: Revisit once the product structure is stable.

3. **Major backend model rename from `Project` to `Collaboration`**
   - Reason: UI terminology can change independently first.
   - Future: Evaluate later if API/domain language drift becomes too costly.

4. **Comprehensive workflow-status automation**
   - Reason: This milestone focuses on getting users into and through the correct metadata flow.
   - Future: Add after stable collaboration/study navigation.

5. **Advanced inline previews for every generated downstream artifact**
   - Reason: Generation correctness matters more than rich preview UX in the first pass.
   - Future: Add targeted previews where they materially reduce confusion.

---

## Open Questions & Risks

### Resolved Decisions

#### D1: Global study creation remains, but collaboration selection is mandatory in step 1
- **Decision:** Adopt former option B.
- **Reasoning:** This preserves discoverability for users who start from a global `New study` action while preventing collaboration-free study creation.
- **Implementation Impact:** Phase 3 create flows and route contracts must support a collaboration-selection step before study-specific fields.

#### D2: Study title/name becomes the canonical study label
- **Decision:** Adopt former option A.
- **Reasoning:** This is the cleanest way to reduce ambiguity in the sidebar, study index, and workspace headers while still keeping species and cell line visible as supporting metadata.
- **Implementation Impact:** Study create/edit flows, API contracts, display components, tests, and possibly schema must support an explicit title/name field.

#### D3: Inline value creation uses a hybrid policy by field type
- **Decision:** Adopt former option C.
- **Reasoning:** Controlled scientific and pipeline vocabularies need tight governance, while softer recurring people/project labels benefit from select-or-create ergonomics.
- **Implementation Impact:** Lookup UX and API policy must distinguish admin-managed vocabularies from scoped reusable values.

#### D4: Contrasts support draft save plus suggested candidates, but final generation stays blocked until mappings are valid
- **Decision:** Combine former options B and C with a final-generation gate.
- **Reasoning:** This gives users momentum during onboarding without allowing invalid or ambiguous outputs to be treated as complete.
- **Implementation Impact:** Wizard state, contrast suggestion logic, and output-generation guards must all distinguish draft from final-ready states.

---

### Risks & Mitigation

| Risk | Likelihood | Impact | Severity | Mitigation | Contingency |
|------|------------|--------|----------|------------|-------------|
| Sidebar refactor creates route regressions | Medium | High | High | Rewrite tests first, define canonical route map | Feature-flag or stage rollout in small PRs |
| Data model assumptions around treatment/batch mappings conflict with current schema | High | High | Critical | Resolve contract early in Phase 4, document interim persistence plan | Use transitional serializer/model layer before schema changes |
| Wizard complexity grows into an untestable flow | Medium | High | High | Use clear staged state model and route persistence | Trim non-essential steps from v1 |
| Lookup create/select UX weakens data control | Medium | Medium | Medium | Separate controlled vocabularies from reusable free-text suggestions | Restrict create-new behavior by field policy |
| Seed data or reset workflows drift from real-world scenarios | Medium | Medium | Medium | Define seed dataset from documented schema and user notes | Refresh seed data during checkpoint reviews |
| Redirect changes confuse existing users temporarily | Low | Medium | Medium | Keep destination messaging explicit | Provide in-app orientation copy during rollout |

---

## Validation Checkpoints

### Checkpoint 1: Navigation Reset
**Criteria:**
- [ ] Sidebar exposes `Collaborations` and `Studies` as the primary browse model
- [ ] Collaboration and study index pages are reachable
- [ ] Old registry/directory duplication is removed or deprecated
- [ ] Frontend navigation tests pass

**If Failed:** Do not proceed to wizard implementation until routes and navigation semantics are stable.

---

### Checkpoint 2: Study Workspace Clarity
**Criteria:**
- [ ] Opening a study lands on a samples-first workspace
- [ ] Tabs for `Samples`, `Contrasts`, and `Collaboration info` exist
- [ ] Study-specific submenu actions behave predictably
- [ ] Create flows redirect into the new workspace model

**If Failed:** Revisit IA before adding more intake steps.

---

### Checkpoint 3: Onboarding Wizard Core
**Criteria:**
- [ ] Users can enter high-level details
- [ ] Users can choose metadata columns and download a template
- [ ] Users can upload a seeded file and receive aggregate validation feedback
- [ ] Cell- or row-level error presentation is understandable

**If Failed:** Fix validation clarity and workflow sequencing before connecting output generation.

---

### Checkpoint 4: Mapping and Output Readiness
**Criteria:**
- [ ] Treatment and batch mappings are derived from uploaded metadata
- [ ] Required mappings persist correctly
- [ ] Derived-output inputs match documented backend contracts
- [ ] Backend tests cover export/config mapping paths

**If Failed:** Do not ship generated-output workflows until contract mismatches are resolved.

---

### Checkpoint 5: Seeded Validation and Test Stability
**Criteria:**
- [ ] Seed data loads two collaborations with three studies each
- [ ] Docker-based test flows pass
- [ ] Vitest, pytest, and Playwright cover the main user journeys
- [ ] Manual seeded QA can reproduce navigation and onboarding review scenarios

**If Failed:** Stabilize fixtures, reset tooling, and tests before calling the milestone complete.

---

## Appendix: Task Breakdown Hints

### Suggested Taskmaster Task Structure

**Planning and IA (4 tasks, ~21 hours)**
1. Audit current routes, labels, and sidebar states
2. Define canonical route map and terminology rules
3. Refactor sidebar interaction model
4. Rewrite navigation tests

**Browse Experience (4 tasks, ~30 hours)**
5. Build collaboration index page with server-side table
6. Build study index page with collaboration-aware grouping
7. Add preview-list data loading and `More...` behavior
8. Add RBAC and navigation tests

**Study Workspace (4 tasks, ~23 hours)**
9. Build tabbed study workspace shell
10. Connect samples-first default view
11. Add study submenu actions and active-state logic
12. Update create flows to redirect into workspaces

**Onboarding Workflow (6 tasks, ~46 hours)**
13. Design wizard stage model and route persistence
14. Implement lookup and metadata-template backend endpoints
15. Build template-selection step
16. Build upload/preview/validation step
17. Build mapping and contrast step
18. Add end-to-end wizard tests

**Validation and Outputs (4 tasks, ~22 hours)**
19. Reconcile treatment/batch persistence model
20. Verify serializers and output generation contracts
21. Add aggregated validation error handling coverage
22. Add advanced-options scaffolding where needed

**Seed Data and Test Hardening (4 tasks, ~20 hours)**
23. Create deterministic seed dataset and reset flow
24. Add factories/fixtures for backend and frontend tests
25. Expand Playwright coverage for seeded flows
26. Document QA and reset workflows

**Total: 26 tasks, ~162 hours before buffer**

### Parallelizable Tasks

**Can work in parallel:**
- Collaboration index and study index work can overlap after canonical routes are defined.
- Backend lookup/template endpoints can proceed in parallel with wizard shell work.
- Seed data setup can begin once required entities and RBAC assumptions are stable.
- Test-writing can run in parallel with implementation at story boundaries if file ownership is clear.

**Must be sequential:**
- Route and terminology decisions should precede deep navigation work.
- Wizard validation UI depends on the backend validation contract.
- Output verification should follow final decisions on mapping persistence.

### Critical Path Tasks
1. Define canonical routes and terms
2. Refactor sidebar IA
3. Build study index/workspace path
4. Finalize lookup/template backend contract
5. Implement aggregate validation flow
6. Implement mapping/contrasts persistence
7. Harden tests and seeded reset flow

**Critical path duration:** ~95-110 hours before buffer

---

**End of PRD**

*This PRD is optimized for TaskMaster task generation and later phased execution. It deliberately favors clear dependency mapping, acceptance criteria, and implementation boundaries over speculative visual polish.*
