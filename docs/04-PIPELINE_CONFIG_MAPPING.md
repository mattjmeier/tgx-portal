# R-ODAF Snakemake Configuration Mapping

When building the Config Generation service, the Django backend must output a strict JSON/YAML file validating against the draft-2020-12 schema defined in the R-ODAF pipeline.

## Mappings from Database to YAML

### `common` block
* `projectdir`: Handled by backend path logic.
* `project_title`: `Project.title`
* `researcher_name`: `Project.researcher_name`
* `bioinformatician_name`: `Project.bioinformatician_assigned`
* `platform`: `Assay.platform` (TempO-Seq vs RNA-Seq)
* `dose`: Derived from `Sample.dose` column mapping.
* `batch_var`, `celltype`, `units`: From `Study` model.
* `biospyder_dbs`, `biospyder_manifest_file`: Conditionally required if `platform == TempO-Seq`.

### `pipeline` block
* `genomedir`, `genome_filename`, `annotation_filename`, `genome_name`: Map from the selected `Assay.genome_version` lookup tables.
* `mode`: `se` (Single End) or `pe` (Paired End) selected in the intake form.

### `QC` & `DESeq2` blocks
* Many of these parameters (e.g., `clust_method`, `align_threshold`, `cooks`, `filter_gene_counts`) have sensible defaults in the lab.
* The Intake Form should have an "Advanced Options" accordion that allows clients or bioinformaticians to override these defaults. If not touched, the DB uses the default values to populate the YAML.

## File Generation
Alongside `config.yaml`, the system must compile the tabular data:
1. `metadata_file`: Generate a TSV from the validated `Sample` models associated with the project.
2. `contrasts_file`: Generate a TSV based on the selected `experimental_groups` versus the `solvent_control` samples.