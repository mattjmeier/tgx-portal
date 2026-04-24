# Database Schema & Data Models

## Core Philosophy
We use a relational structure inspired by the `SummarizedExperiment` object. Operational intake metadata is separated into hierarchical levels: Project -> Study -> Sample -> Assay.

The backend now also includes a broad-profiling warehouse layer aligned with `UL_schema.txt`. Warehouse concepts live outside the intake sample hierarchy:

* `chemicals`: chemical/environmental sample identity.
* `profiling`: cross-domain broad-profiling study metadata, platform registry, concentration/dose-response series, POD metrics/values, and domain-specific well metadata.

Do not treat `core.Sample` as equivalent to UL `tgx_samples`. `core.Sample` is a R-ODAF biological/sample metadata row; `chemicals.ChemicalSample` is the canonical chemical/environmental sample registry row.

## Models & Pydantic Validation

### 1. Project Management
* **`Project`**: Represents the collaboration.
  * Fields: `id`, `owner`, `pi_name`, `researcher_name`, `bioinformatician_assigned`, `title`, `description`, `created_at`.
  * *Constraint*: PI Name and title are used to route to Plane PM.
* **`Study`**: A distinct experiment within a project.
  * Fields: `id`, `project_id`, `title`, `description`, `status`, `species` (Enum: human, mouse, rat, hamster), `celltype`, `treatment_var`, `batch_var`.

### 2. The Sample Tensor
* **`Sample`**: The biological entity. 
  * Validation: Must use strict regex for `sample_ID`: `^[a-zA-Z0-9-_]*$` (No spaces/special chars).
  * Fields: `id`, `study_id`, `sample_ID`, `sample_name`, `description`, `technical_control` (Bool), `reference_rna` (Bool), `solvent_control` (Bool), `metadata` (JSON).
  * *Toxicology specifics*: `group`, `chemical`, `chemical_longname`, `CASN`, `dose`, and `concentration` are managed as typed metadata field definitions and selected per study template. They are not fixed `Sample` columns.
* **`Assay`**: Defines the analytical run. 
  * Concept: A given sample might be run on "TempO-Seq" or "RNA-Seq". 
  * Fields: `id`, `sample_id`, `platform` (TempO-Seq vs RNA-Seq), `genome_version`, `quantification_method` (e.g., raw_counts, normalized_transcripts).

### 3. Lab Utilities (Metadata)
* **`SamplePlating`**: To facilitate lab work and label printing.
  * Fields: `sample_id`, `plate_number`, `batch`, `plate_well` (e.g., E-A01), `row`, `column`, `index_I7`, `I7_Index_ID`, `index2`, `I5_Index_ID`.

## Validation Strategy
Before a `Sample` sheet is ingested into Django models, it must pass through a `Pydantic` schema modeled exactly after the `metadata.schema.yaml`. If a collaborator uploads a CSV with a `sample_ID` containing a space, the backend must return a descriptive 400 Bad Request error.

### 4. Instrument & Run Tracking (Future-Proofing)
* **`SequencingRun`**: Represents a physical run on an instrument.
  * Fields: `id`, `run_id` (e.g., the standard Illumina string format), `flowcell_id`, `instrument_name`, `date_run`, `raw_data_path` (absolute path on the server).
* **Relationship**: `Assay` has a `ManyToManyField` to `SequencingRun`. (An assay/sample can be sequenced across multiple flow cells to achieve target depth).

### 5. Metadata Template Support
* **`MetadataFieldDefinition`**: Admin-managed typed field catalog for intake templates.
  * Fields include `key`, `label`, `group`, `scope`, `system_key`, `data_type`, `required`, `is_core`, `allow_null`, `choices`, `regex`, min/max bounds, and wizard display metadata.
* **`StudyMetadataFieldSelection`**: Study-specific set of selected metadata fields.
* **`StudyMetadataMapping`**, **`StudyOnboardingState`**, and **`StudyConfig`**: Store onboarding state, selected treatment/batch mappings, contrasts, and generated config blocks.

### 6. Chemical Registry (`chemicals`)
* **`ChemicalSample`**: Canonical chemical/environmental sample identity corresponding to UL `tgx_samples`.
  * Fields: `chemical_sample_id`, `spid`, `roc_id`, `dtxsid`, `casrn`, `preferred_name`, `is_environmental`, `is_mixture`, `ext`.
  * Naming convention: prefer canonical field names `roc_id`, `dtxsid`, `casrn`, and `preferred_name`; treat `chemical`, `chemical_longname`, `CASN`, `dtx`, and similar historical names as import aliases.

### 7. Broad-Profiling Warehouse (`profiling`)
* **`ProfilingPlatform`**: Registry for reusable broad-profiling platforms/feature sets corresponding to UL `tgx_platforms`.
  * Fields include `platform_name`, `title`, `description`, `version`, `technology_type`, `study_type`, `species`, `url`, and `ext`.
* **`StudyWarehouseMetadata`**: One-to-one warehouse metadata for a portal `Study`, corresponding to UL `tgx_study`.
  * Fields include `study_name`, `source`, `study_type`, `in_vitro`, `platform`, `cell_types`, `culture_conditions`, `exposure_conditions`, `references`, and `ext`.
* **`Series`**, **`Metric`**, and **`Pod`**: Concentration/dose-response series, global metric definitions, and global POD values corresponding to UL `tgx_series`, `tgx_metrics`, and `tgx_pods`.
* **`HTTrWell`** and **`HTTrSeriesWell`**: HTTr well metadata and series-well bridge corresponding to UL `httr_wells` and `httr_series_wells`.

### 8. Known UL Schema Gaps
The current scaffold covers the cross-domain warehouse foundation and HTTr wells. The following UL concepts are not implemented yet:

* HTTr feature catalog: `httr_features`.
* HTTr platform-feature bridge: `httr_platform_features`.
* HTTr signature catalog, signature sets, set membership, and concentration-response signature hits: `httr_sig_cat`, `httr_sig_sets`, `httr_sig_set_cat`, `httr_sig_cr`.
* HTPP-specific well metadata and active-feature/result tables.
* TGx-specific non-HTTr well/profile metadata tables.
* External data-resource tracking for raw, intermediate, feature, and supporting data objects.
* Explicit import alias maps and staged historical import tables.
