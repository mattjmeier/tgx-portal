# Frontend UI & UX Requirements

## Framework
* React 18 with TypeScript
* Vite for local development
* TailwindCSS or another utility-first styling system
* TanStack Query for server-state
* TanStack Table for large explorer views

## Product Direction
This project still requires a **custom front end**.

Directus should not be treated as the client-facing experience. Instead:
* collaborators use a tailored intake portal
* bioinformaticians use a custom workspace optimized for sample review and exports
* Directus admin is primarily for internal operations and reference-data management

## Component: Project Intake Form
* Replaces the static PDF
* Must be dynamic based on upstream assay and platform choices
* If `platform == TempO-Seq`, show Biospyder-related options
* If `platform == RNA-Seq`, hide TempO-Seq-specific controls

## Component: Spreadsheet Upload
* Provide drag-and-drop upload for CSV/TSV
* Parse locally for preview
* Show row-level and cell-level validation feedback returned by the validation layer
* Allow copy-paste from Excel-like sources where practical
* Do not expose raw Directus admin forms to collaborators for bulk sample intake

## Component: Explorer Tables
* All large tables must be server-side
* The frontend must map sorting, filtering, pagination, and search state to Directus-compatible query parameters or custom API parameters
* Required table capabilities:
  * global search
  * server-side sort
  * pagination
  * row selection
  * export actions
  * optional column visibility preferences

## Admin Experience
Use Directus admin for:
* internal data review
* role and permission administration
* lookup-table maintenance
* lightweight manual corrections

Use the custom frontend for:
* collaborator intake
* domain-specific workflows
* guided config generation
* domain-specific dashboards

## UX Principle
The external user experience should feel like a regulated lab portal, not like a generic database tool.
