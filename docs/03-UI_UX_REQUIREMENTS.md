# Frontend UI & UX Requirements

## Framework
* React 18, TypeScript, Vite.
* **Styling**: TailwindCSS + Headless UI (e.g., Radix UI or shadcn/ui).
* **State/Fetching**: TanStack Query (React Query) for server-state caching.

## Component: Project Intake Form (Client UI)
* Replaces the static PDF. 
* Must be dynamic: If `Platform == TempO-Seq`, show `Biospyder Manifest` dropdowns. If `Platform == RNA-Seq`, hide them.
* **Spreadsheet Upload**: Provide a drag-and-drop zone. Use `Papaparse` to parse the CSV/TSV locally. Display a preview grid. If Pydantic/DRF returns validation errors, highlight the exact cell/row in the UI. Allow copy-pasting from Excel directly into the UI (consider `react-datasheet-grid` or TanStack implementation).

## Component: Data Explorer Tables (Bioinformatician UI)
* Use **TanStack Table v8**.
* **CRITICAL**: The database will eventually hold hundreds of thousands of sample/gene rows. *All data grid implementations must be Server-Side.*
* TanStack Table configuration must map `onSortingChange`, `onPaginationChange`, and `onGlobalFilterChange` to state variables, which are then passed as query parameters to TanStack Query (e.g., `?page=2&ordering=-sample_ID&search=M1`).
* **Features Required on Tables**:
  * Global Search.
  * Column toggling (hide/show specific metadata).
  * Row selection (to trigger bulk actions like "Export selected to TSV" or "Print Labels").

## Admin Capabilities
* Provide an "Admin Dashboard" that bypasses standard client limits.
* Admins need a view to assign users to roles, manage lookup tables (e.g., adding a new `genome_version` or `biospyder_db` option to the dropdowns without requiring a code deploy).