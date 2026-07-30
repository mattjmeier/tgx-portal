# Frontend UI & UX Requirements

## Framework
* React 18, TypeScript, Vite.
* **Styling**: TailwindCSS + `shadcn/ui`.
* **State/Fetching**: TanStack Query (React Query) for server-state caching.
* **Component Architecture**:
  * `shadcn/ui` is the default source for reusable UI primitives such as buttons, dialogs, inputs, dropdowns, tables, tabs, sheets, and form controls.
  * All `shadcn/ui`-managed primitives must live in `frontend/src/components/ui`.
  * Application-specific components must remain outside `frontend/src/components/ui` so the `ui` directory stays reserved for managed design-system building blocks.
  * Prefer composing feature UIs from `shadcn/ui` primitives rather than introducing one-off bespoke controls.
* **Accessibility**:
  * Preserve the accessibility defaults provided by `shadcn/ui` and its Radix primitives.
  * When wrapping a primitive, keep keyboard navigation, focus handling, labeling, and ARIA behavior intact.

## Component: Project Intake Form (Client UI)
* Replaces the static PDF. 
* Must be dynamic: If `Platform == TempO-Seq`, show `Biospyder Manifest` dropdowns. If `Platform == RNA-Seq`, hide them.
* Build the intake form from `shadcn/ui` form primitives and shared field wrappers so validation, spacing, and error presentation stay consistent across the app.
* **Spreadsheet Upload**: Provide a drag-and-drop zone. Use `Papaparse` to parse the CSV/TSV locally. Display a preview grid. If Pydantic/DRF returns validation errors, highlight the exact cell/row in the UI. Allow copy-pasting from Excel directly into the UI (consider `react-datasheet-grid` or TanStack implementation).

## Landing Page: Study Workspace

The authenticated landing page is a task-oriented study workspace:

* The page header presents `Create study` as the single primary action and `New collaboration` as a secondary action.
* The dominant panel lists up to five studies the authenticated user may access, ordered by `updated_at` descending on the server.
* Each recent-study row shows the study, its collaboration, current status, last update, and an open action. Loading, retryable error, populated, and empty states are required.
* The empty state explains the Collaboration-to-Study relationship and offers both study and collaboration creation.
* A compact `Getting started` panel is secondary to recent work. It may be dismissed, with the preference stored in `localStorage` under a key scoped to the authenticated user.
* At desktop widths, recent studies and onboarding use an approximately 2:1 layout. At smaller widths they stack. Once onboarding is dismissed, recent studies use the full content width.
* The landing page does not duplicate sidebar utilities or expose admin controls as primary actions.

### Collaboration and Study Terminology

A Collaboration is the user-facing umbrella record corresponding to the operational project context. A Collaboration may contain one or more Studies. User-facing interfaces should use “Collaboration” consistently unless referring specifically to an external project identifier.

Study creation must always select a Collaboration. If the appropriate Collaboration does not exist, the selection UI links to collaboration creation; the existing post-creation flow then provides the action to add a Study under the newly created Collaboration.

## Component: Data Explorer Tables (Bioinformatician UI)
* Use **TanStack Table v8**.
* **CRITICAL**: The database will eventually hold hundreds of thousands of sample/gene rows. *All data grid implementations must be Server-Side.*
* TanStack Table configuration must map `onSortingChange`, `onPaginationChange`, and `onGlobalFilterChange` to state variables, which are then passed as query parameters to TanStack Query (e.g., `?page=2&ordering=-sample_ID&search=M1`).
* Use `shadcn/ui` table-adjacent primitives for surrounding chrome such as toolbars, filters, dialogs, menus, pagination controls, column selectors, and bulk-action affordances.
* **Features Required on Tables**:
  * Global Search.
  * Column toggling (hide/show specific metadata).
  * Row selection (to trigger bulk actions like "Export selected to TSV" or "Print Labels").

## Admin Capabilities
* Provide an "Admin Dashboard" that bypasses standard client limits.
* Admins need a view to assign users to roles, manage lookup tables (e.g., adding a new `genome_version` or `biospyder_db` option to the dropdowns without requiring a code deploy).
* Provide a dedicated admin study import workspace for profiling-study curation instead of extending the client-facing onboarding wizard.

### Component: Admin Study Import Workspace
* Use one continuous page with section cards for:
  * study shell
  * metadata mapping / preview
  * contrasts preview
  * count resource registration
  * commit
* Keep a persistent review panel visible with unresolved validation issues, count-resource status, and commit readiness.
* Metadata import must support CSV/TSV parsing, canonical field mapping, and lightweight transforms:
  * trim
  * lowercase
  * uppercase
  * replace whitespace with `_`
* Contrasts and count-data uploads may use stricter expected shapes in MVP, but must still surface validation and readiness in the same workspace.
* Highlight validation issues inline at row/cell level before commit.

## Frontend Structure Conventions
* `frontend/src/components/ui`: Reserved for `shadcn/ui` primitives and light local wrappers around those primitives.
* `frontend/src/components`: Feature-level shared components such as tables, forms, panels, layouts, and composite widgets.
* `frontend/src/pages`: Route-level composition only; keep business logic and reusable UI extracted into components and hooks.
* If a future `components.json` file is added for `shadcn/ui`, its aliases and generated paths must continue to target `frontend/src/components/ui`.
