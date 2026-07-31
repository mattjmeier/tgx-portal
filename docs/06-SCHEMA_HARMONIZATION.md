# Schema Harmonization With UL Broad Profiling Plan

This document tracks how the current `tgx-portal` backend aligns with the collaborator schema in `UL_schema.txt`, and how the portal should grow from R-ODAF intake management into a warehouse for historical broad profiling studies.

## Current Portal Model Inventory

The current portal schema is centered on operational intake and R-ODAF configuration:

| Portal model | Current purpose | UL overlap |
| --- | --- | --- |
| `Project` | Collaboration, ownership, PI/researcher/bioinformatician routing, Plane integration | No direct UL equivalent; keep as portal context |
| `Study` | Experiment within a project; currently stores title, species, cell type, treatment and batch mapping fields | Strong overlap with `tgx_study`, but UL has more warehouse-level descriptors |
| `Sample` | R-ODAF biological/sample metadata row with validated `sample_ID`, controls, and JSON metadata | Partial overlap with domain well/sample metadata; not equivalent to UL `tgx_samples` |
| `Assay` | Analytical run per sample with platform, genome version, quantification method, and sequencing runs | Partial overlap with `tgx_platforms`; UL treats platform as a study-level feature set |
| `SamplePlating` | Lab plating and index metadata for labels and sequencing preparation | Partial overlap with `httr_wells`, but narrower and one-to-one with `Sample` |
| `SequencingRun` | Physical sequencing run metadata | Supports R-ODAF processing; not a central UL table |
| `StudyConfig`, `StudyMetadataMapping`, `StudyOnboardingState` | Intake/onboarding state and generated R-ODAF config data | Portal-specific workflow state |
| `MetadataFieldDefinition`, `StudyMetadataFieldSelection` | Typed extensible metadata templates for sample intake/import | Useful staging layer for historical imports |

## UL Schema Inventory

The UL plan separates shared cross-domain tables from domain-specific tables:

| UL table | Purpose | Portal action |
| --- | --- | --- |
| `tgx_study` | Warehouse study metadata across HTTr, HTPP, and TGx | Add `StudyWarehouseMetadata` linked one-to-one to portal `Study` |
| `tgx_samples` | Chemical/environmental sample identity and external chemical identifiers | Add `chemicals.ChemicalSample`; do not overload portal `Sample` |
| `tgx_platforms` | Profiling platform and feature set registry | Add `profiling.ProfilingPlatform` |
| `tgx_series` | Concentration/dose-response well series | Add `profiling.Series` |
| `tgx_metrics` | POD/global metric definitions | Add `profiling.Metric` |
| `tgx_pods` | Global POD values per series and metric | Add `profiling.Pod` |
| `httr_wells` | HTTr well-level metadata | Add `profiling.HTTrWell` |
| `httr_series_wells` | Bridge between series and HTTr wells | Add `profiling.HTTrSeriesWell` |
| `httr_features` | HTTr probe/gene feature catalog | Missing; scaffold next when feature-level imports are prioritized |
| `httr_platform_features` | Platform-feature bridge with ordering and attenuation | Missing; scaffold with `httr_features` |
| `httr_sig_cat`, `httr_sig_sets`, `httr_sig_set_cat`, `httr_sig_cr` | Signature catalog, signature sets, set membership, and active signature hits | Missing; scaffold before Navigator-style signature UI |
| HTPP/TGx domain well/result tables | Domain-specific wells and active features/results outside HTTr | Missing; defer until first HTPP or non-HTTr TGx import |
| External data resources | Raw/intermediate/feature/supporting data object pointers | Add `profiling.StudyDataResource` attached to warehouse study metadata |

## Field Similarity Matrix

| Current / planned portal field | UL field | Decision |
| --- | --- | --- |
| `Study.title` | `tgx_study.title` | Same concept; keep existing field |
| `Study.description` | `tgx_study.desc` | Same concept; keep existing field, map `desc` alias on import |
| `Study.celltype` | `tgx_study.cell_types` | Preserve `celltype`; use `cell_types` list in warehouse metadata |
| `Study.species` | `tgx_study.species`, `tgx_platforms.species` | Reuse existing species enum where possible |
| `Assay.platform` / `StudyConfig.common.platform` | `tgx_platforms.tech_type` and platform reference | Add platform registry; avoid treating free-text platform as final warehouse identity |
| `Sample.sample_ID` | `httr_wells.biosamp_name` or imported sample key | Related but context-specific; keep `sample_ID` for R-ODAF samples |
| `Sample.metadata.chemical` | `tgx_samples.chem_name` or aliases | Treat as intake alias; map to `ChemicalSample.preferred_name` |
| `Sample.metadata.chemical_longname` | `tgx_samples.chem_name` | Intake alias only |
| `Sample.metadata.CASN` | `tgx_samples.casrn` | Canonicalize to `casrn` |
| `Sample.metadata.dose` | `tgx_series.exp_*` / `httr_wells.exp_conc` for in vivo/in vitro contexts | Keep template field; map to canonical exposure fields during import |
| `Sample.metadata.concentration` | `httr_wells.exp_conc` | Keep template field; map to `exposure_concentration` |
| `SamplePlating.plate_well`, `row`, `column` | `httr_wells.plate_id`, `well_row`, `well_col` | Add warehouse well table; keep plating for lab utility |
| `technical_control`, `reference_rna`, `solvent_control` | `is_ref`, `is_ctrl`, domain QC fields | Preserve existing controls; map into domain well flags as needed |

## Low-Hanging Harmonization

- Keep `Project` as the portal-owned operational parent for RBAC, ownership, and Plane routing.
- Preserve current `/api/projects/`, `/api/studies/`, `/api/samples/`, and config-generation behavior.
- Add canonical warehouse models beside the intake schema instead of forcing historical data into `Sample.metadata`.
- Use explicit import aliases:
  - `chemical`, `chemical_longname` -> `ChemicalSample.preferred_name` candidates.
  - `CASN`, `CAS`, `cas` -> `ChemicalSample.casrn`.
  - `DTXSID`, `dtx`, `dtxsid` -> `ChemicalSample.dtxsid`.
  - `dose`, `concentration`, `exp_conc` -> canonical exposure fields based on study context.
- Prefer `cell_type` and `cell_types` for new warehouse structures while keeping `Study.celltype` for existing intake screens and config generation.

## Material Conceptual Differences

- Portal `Sample` is a biological/sample row for intake and R-ODAF metadata; UL `tgx_samples` is a chemical or environmental sample registry row. These must remain separate.
- Portal `Assay` is sample-level and operational; UL `tgx_platforms` is a reusable platform/feature-set registry. A study should link to a platform for warehouse purposes.
- Portal `SamplePlating` is label/sequencing utility metadata; UL `httr_wells` is warehouse well metadata used for concentration-response analysis.
- JSON metadata is appropriate for staging, import flexibility, and study-specific extras, but canonical chemical identity, platforms, PODs, series, and wells need relational tables.
- The portal stores summary/warehouse data, but large raw and intermediate matrices should remain external and be linked from metadata.
- UL uses compact database column names such as `desc`, `refs`, `ver`, `tech_type`, `trt_cond`, `exp_all`, and `sw_ver`. Portal models intentionally use more explicit Django names such as `description`, `references`, `version`, `technology_type`, `treatment_condition`, `exposure_values`, and `software_version`. Historical import code must maintain a clear alias map rather than renaming model fields to UL abbreviations.

## UL Schema Caveats

- UL relies heavily on arrays and JSON for study metadata, exposure values, references, and gene lists. This keeps imports flexible, but weakens referential integrity, query optimization, and database-level validation.
- `tgx_samples` intentionally combines chemical, mixture, and environmental sample identity. The portal may need a normalized identifier/alias table once ROC IDs and multiple external identifiers become authoritative.
- The HTTr, HTPP, and TGx domain split is pragmatic, but shared concepts such as well/profile metadata, active features, and series membership may duplicate logic across domain tables.
- Some array fields imply ordering and length contracts, such as `tgx_series.exp_all` and `httr_sig_cr.resp`, but those relationships are not enforceable with the proposed table definitions alone.
- Signature catalog tables store gene-symbol arrays directly. That is easy to load, but it is weak for gene identity versioning, aliases, and cross-species mapping.
- The one-platform-per-study rule is clear and useful for central reporting, but multi-platform studies need a documented split/linking convention to avoid duplicated study metadata.

## Proposed App And Model Roadmap

- `core`: keep operational intake, projects, studies, samples, onboarding state, config generation, RBAC, and existing APIs.
- `chemicals`: own chemical/environmental sample identity. Initial model: `ChemicalSample`.
- `profiling`: own analysis warehouse concepts. Initial models: `ProfilingPlatform`, `StudyWarehouseMetadata`, `Series`, `Metric`, `Pod`, `HTTrWell`, `HTTrSeriesWell`.

Phased expansion:

1. Establish `ChemicalSample`, `ProfilingPlatform`, and `StudyWarehouseMetadata`.
2. Add concentration-response series, POD metric definitions, POD values, HTTr wells, and HTTr series-well bridges.
3. Add HTTr feature/signature catalogs and active result tables.
4. Add HTPP and TGx-specific well/result tables when historical imports require them.
5. Add additive APIs under `/api/chemicals/` and `/api/profiling/` after the model layer and import contracts are stable.

## Remaining Scaffold Candidates

These are the main UL schema concepts not yet represented in Django models:

| Missing concept | Proposed Django model(s) | Why it matters |
| --- | --- | --- |
| HTTr measured features | `HTTrFeature` | Stores probes/genes/transcripts shared across platforms |
| HTTr platform-feature membership | `HTTrPlatformFeature` | Captures platform-specific index ordering and attenuation |
| Signature catalog | `HTTrSignature` | Names and describes gene/signature sets used in results |
| Signature sets | `HTTrSignatureSet`, `HTTrSignatureSetMember` | Tracks reusable subsets of signatures for concentration-response analysis |
| Active signature results | `HTTrSignatureConcentrationResponse` | Stores active signature-level hits for Navigator-style UI |
| HTPP wells | `HTPPWell`, later `HTPPSeriesWell` if bridge fields diverge from HTTr | Needed for Cell Painting-style studies |
| TGx profile/well records | `TGxProfile`, later `TGxSeriesProfile` | Needed for in vivo and non-multiwell TGx studies |
| Import alias/staging support | `ImportAliasMap`, `ImportStagedRow` | Makes historical imports repeatable beyond the current batch/resource provenance layer |

Implemented import-provenance foundation: `StudyDataResource`, `ImportBatch`, and `ImportBatchResource` provide study-level external resource pointers and lightweight audit records for manual or historical import attempts. They store references to files, URLs, accessions, or object URIs, not raw data contents.

Recommended next scaffold: explicit import alias and staging models. Those should map legacy source columns into canonical warehouse fields and hold row-level validation results before committing rows into chemical, platform, series, POD, well, feature, or signature tables.

Current admin import MVP implementation:
- `ImportAliasMap` stores per-file mappings from uploaded columns into canonical fields plus transform chains.
- `ImportStagedRow` stores parsed metadata/contrast rows with normalized payloads and validation errors.
- `ImportBatch` is the draft/commit audit root for the workflow.
- `StudyDataResource` stores metadata, contrasts, and count files as provenance-backed inputs. Count matrices remain external resources only in MVP.
- `CountMatrixProfile` and ordered sample-column mappings make external count
  resources searchable, previewable, and safely combinable without storing
  feature-level values in PostgreSQL. Compatibility is deliberately strict:
  canonical platform, species, value type, feature namespace, and annotation
  identity must match exactly.

Read-only archive import is now also implemented. Stable collaboration, study,
resource, library, run, and FASTQ keys drive replay-safe upserts.
`SequencingLibrary`, `SequencingFile`, and `ResourceLineage` represent split
FASTQs, multiple runs/flowcells, technical repeats, unknown mappings, and
evidence-aware artifact lineage. `ImportBatch` stores the descriptor snapshot,
source digest, schema/tool versions, supersession link, result counts, and
study-level diff. See
[`07-ARCHIVE_IMPORT_AND_RECOVERY.md`](07-ARCHIVE_IMPORT_AND_RECOVERY.md).

## Historical Import Strategy And Open Questions

- Build imports as staged transformations: `StudyDataResource` source pointer -> `ImportBatch` audit record -> alias map -> typed staging rows -> canonical warehouse models.
- Enforce uniqueness at canonical boundaries: chemical sample ID, platform name, warehouse study name, POD `(series, metric)`, and well position per study/plate.
- Keep per-study extras in `ext` JSON fields, but only after canonical fields have been extracted.
- Require each warehouse study to select one platform. If a historical study spans multiple platforms, split it into multiple warehouse study records linked to the same portal project when useful.
- Existing operational file/path mechanisms are not provenance substitutes: `SequencingRun.raw_data_path` is sequencing-run metadata, onboarding `validated_rows` is the last uploaded intake payload, and sample metadata fields such as `raw_file` are intake/export values.
- Open questions:
  - Which source should be authoritative for ROC IDs once available?
  - Do historical Health Canada studies already have stable chemical sample IDs, or do we need a deterministic generation rule?
  - Which POD metrics should be seeded first for R-ODAF/TGx studies?
  - Which historical imports require HTTr signatures/features versus POD-only storage?
  - Which canonical feature-identity layer should come first for feature-level ingestion: probes, gene symbols, transcripts, or a combined alias model?

Gene-identity work remains deferred for this cycle. The import flow now reserves count-resource metadata such as `feature_id_kind`, `annotation_source`, and `annotation_version`, but does not yet add probe/gene/transcript alias tables.

## Exploring The Backend Schema

Django admin is the preferred short-term explorer for the warehouse schema because it uses the Django model layer, relationships, choice labels, filters, and search configuration.

- Start the stack with `docker compose up`.
- Open `http://localhost:8003/admin/`.
- Sign in with `admin / admin123`.
- Use the `Chemicals` and `Profiling` sections to inspect or manually create `ChemicalSample`, platform, warehouse study metadata, study data resources, import batches, series, POD, and HTTr well records.
- Run `docker compose run --rm api python manage.py reset_seed_data` to load one linked warehouse demo record set alongside the existing project/study/sample fixtures.

For raw database inspection, PostgreSQL is exposed on local port `5433`:

```bash
psql postgresql://tgx_portal:tgx_portal@localhost:5433/tgx_portal
```

pgAdmin, DBeaver, or TablePlus are reasonable optional SQL/schema browsers against the same connection string. They are useful for raw table inspection, but Django admin should remain the default review surface while the frontend has no warehouse UI.
