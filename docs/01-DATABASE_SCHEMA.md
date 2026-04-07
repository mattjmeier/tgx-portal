# Collections & Data Model

## Core Philosophy
The relational model still follows the lab hierarchy:
`Project -> Study -> Sample -> Assay`

That hierarchy should be implemented as **Directus collections and relations**.

## Core Collections

### 1. Project Management
* **`projects`**
  * Fields: `id`, `pi_name`, `researcher_name`, `bioinformatician_assigned`, `title`, `description`, `owner`, `status`, `created_at`, `updated_at`
  * `owner` should reference the Directus user or a linked collaborator record used for client visibility rules.
  * `pi_name` and `title` remain important for Plane and reporting integrations.

* **`studies`**
  * Fields: `id`, `project`, `species`, `celltype`, `treatment_var`, `batch_var`, `units`
  * Relationship: many studies belong to one project.
  * Constraint goal: prevent duplicate study definitions within the same project.

### 2. Sample Metadata
* **`samples`**
  * Fields: `id`, `study`, `sample_ID`, `sample_name`, `description`, `group`, `chemical`, `chemical_longname`, `dose`, `technical_control`, `reference_rna`, `solvent_control`
  * Relationship: many samples belong to one study.
  * Validation goal: `sample_ID` must match `^[a-zA-Z0-9-_]*$`.
  * Constraint goal: `sample_ID` must be unique within a study.

* **`assays`**
  * Fields: `id`, `sample`, `platform`, `genome_version`, `quantification_method`, `read_mode`
  * Relationship: many assays belong to one sample.

### 3. Lab Utility Collections
* **`sample_plating`**
  * Fields: `id`, `sample`, `plate_number`, `batch`, `plate_well`, `row`, `column`, `index_I7`, `I7_Index_ID`, `index2`, `I5_Index_ID`
  * Relationship: one plating record per sample where applicable.

### 4. Future-Proofing Collections
* **`sequencing_runs`**
  * Fields: `id`, `run_id`, `flowcell_id`, `instrument_name`, `date_run`, `raw_data_path`

* **`assay_sequencing_runs`**
  * Join collection implementing many-to-many between assays and sequencing runs.

## Lookup Collections
Directus is especially useful for non-code-managed reference data. Add lookup collections for:
* `genome_versions`
* `biospyder_databases`
* `biospyder_manifests`
* `species_options`
* `platform_options`
* `quantification_methods`

These should be admin-editable without a code deploy.

## Validation Strategy
Use the following layered approach:
* Directus field rules for required values, enums, and basic relational constraints.
* Directus flows or hooks for cross-field and cross-record rules.
* A custom validation extension or companion service for spreadsheet imports when row-level error reporting must be precise.

If a collaborator uploads a CSV where `sample_ID` contains spaces or duplicates an existing sample in the study, the system must return row-specific validation feedback.
