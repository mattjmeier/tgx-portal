# Database Schema & Data Models

## Core Philosophy
We use a relational structure inspired by the `SummarizedExperiment` object. Metadata is separated into hierarchical levels: Project -> Study -> Sample -> Assay. 

## Models & Pydantic Validation

### 1. Project Management
* **`Project`**: Represents the collaboration.
  * Fields: `id`, `pi_name`, `researcher_name`, `bioinformatician_assigned`, `title`, `description`, `created_at`.
  * *Constraint*: PI Name and title are used to route to Plane PM.
* **`Study`**: A distinct experiment within a project.
  * Fields: `id`, `project_id`, `species` (Enum: human, mouse, rat, hamster), `celltype`, `treatment_var`, `batch_var`.

### 2. The Sample Tensor
* **`Sample`**: The biological entity. 
  * Validation: Must use strict regex for `sample_ID`: `^[a-zA-Z0-9-_]*$` (No spaces/special chars).
  * Fields: `id`, `study_id`, `sample_ID`, `sample_name`, `description`, `group` (experimental group mapping).
  * *Toxicology Specifics*: `chemical`, `chemical_longname`, `dose` (Float, min: 0), `technical_control` (Bool), `reference_rna` (Bool), `solvent_control` (Bool).
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
