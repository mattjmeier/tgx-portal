export const WORKFLOW_EXPORT_SCHEMA_VERSION = '2026-04-07.1';

export class WorkflowExportError extends Error {
  constructor({ code, message, status = 422, details = null }) {
    super(message);
    this.name = 'WorkflowExportError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '');
}

function uniq(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const key = v === null || v === undefined ? '' : String(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function defined(values) {
  return values.filter((v) => v !== null && v !== undefined && String(v) !== '');
}

function pickSingleOrError({ values, code, message, detailsKey }) {
  const unique = uniq(defined(values).map((v) => String(v)));
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  throw new WorkflowExportError({
    code,
    message,
    details: { [detailsKey]: unique },
  });
}

function isTempoSeqPlatform(platformCodeOrName) {
  const v = normalizeKey(platformCodeOrName);
  return v === 'tempo-seq' || v === 'tempo seq' || v === 'temposeq';
}

function yamlNeedsQuotes(value) {
  if (value === '') return true;
  if (/[\n\r\t]/.test(value)) return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/[:[\]{}#,>&*!|'"%@`]/.test(value)) return true;
  if (/^(true|false|null|yes|no|on|off)$/i.test(value)) return true;
  if (/^-/.test(value)) return true;
  return false;
}

function yamlString(value) {
  const s = String(value);
  if (!yamlNeedsQuotes(s)) return s;
  return JSON.stringify(s);
}

function yamlIndent(level) {
  return '  '.repeat(level);
}

function yamlDump(value, level = 0) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return yamlString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const lines = [];
    for (const item of value) {
      const dumped = yamlDump(item, level + 1);
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        lines.push(`${yamlIndent(level)}- ${dumped === 'null' ? 'null' : ''}`.trimEnd());
        if (dumped !== 'null') lines.push(dumped);
      } else {
        lines.push(`${yamlIndent(level)}- ${dumped}`);
      }
    }
    return lines.join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = [];
    for (const [key, v] of entries) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        lines.push(`${yamlIndent(level)}${key}:`);
        lines.push(yamlDump(v, level + 1));
        continue;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push(`${yamlIndent(level)}${key}: []`);
        } else {
          lines.push(`${yamlIndent(level)}${key}:`);
          lines.push(yamlDump(v, level + 1));
        }
        continue;
      }
      lines.push(`${yamlIndent(level)}${key}: ${yamlDump(v, level + 1)}`);
    }
    return lines.join('\n');
  }
  return yamlString(String(value));
}

function tsvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function stableSortBy(keys) {
  return (a, b) => {
    for (const key of keys) {
      const av = String(a?.[key] ?? '');
      const bv = String(b?.[key] ?? '');
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  };
}

function pickBioinformaticianName(bio) {
  if (!bio) return null;
  const first = String(bio.first_name ?? '').trim();
  const last = String(bio.last_name ?? '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const email = String(bio.email ?? '').trim();
  return email || null;
}

function normalizeReadMode(value) {
  const v = normalizeKey(value);
  if (!v) return null;
  if (v === 'se' || v === 'single' || v === 'single end' || v === 'single-end') return 'se';
  if (v === 'pe' || v === 'paired' || v === 'paired end' || v === 'paired-end') return 'pe';
  return String(value ?? '').trim() || null;
}

function resolveTreatmentVariable(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'group';

  const normalized = normalizeKey(raw).replace(/[_-]+/g, ' ');
  const aliases = new Map([
    ['group', 'group'],
    ['treatment group', 'group'],
    ['chemical', 'chemical'],
    ['compound', 'chemical'],
    ['compound code', 'chemical'],
    ['chemical longname', 'chemical_longname'],
    ['chemical long name', 'chemical_longname'],
    ['compound name', 'chemical_longname'],
    ['dose', 'dose'],
  ]);

  return aliases.get(normalized) ?? raw;
}

function getM2MValues(raw, fields = ['code']) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const candidate =
      row?.biospyder_databases_id ??
      row?.biospyder_databases ??
      row?.item ??
      row ??
      null;
    if (!candidate || typeof candidate !== 'object') continue;
    const picked = {};
    for (const f of fields) picked[f] = candidate[f] ?? null;
    out.push(picked);
  }
  return out;
}

function sanitizeContrastName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function computeContrastsForStudy({ study, rows, variable }) {
  const levels = uniq(defined(rows.map((r) => r[variable]))).map((v) => String(v));
  if (levels.length <= 1) {
    return { contrasts: [], levels, control_level: levels[0] ?? null };
  }

  const candidateControls = [
    ...defined(rows.filter((r) => r.solvent_control === true).map((r) => r[variable])),
    ...defined(rows.filter((r) => r.technical_control === true).map((r) => r[variable])),
    ...defined(rows.filter((r) => r.reference_rna === true).map((r) => r[variable])),
  ].map((v) => String(v));

  const control = candidateControls[0] ?? levels.slice().sort((a, b) => (a < b ? -1 : 1))[0];
  const contrasts = [];
  for (const lvl of levels) {
    if (lvl === control) continue;
    const contrast = sanitizeContrastName(`${lvl}_vs_${control}`);
    contrasts.push({
      study_id: study.id,
      variable,
      contrast,
      treatment: lvl,
      control,
    });
  }
  return { contrasts, levels, control_level: control };
}

export function generateWorkflowExportArtifacts({
  project,
  studies,
  samples,
  assays,
  defaults = null,
}) {
  if (!project?.id) {
    throw new WorkflowExportError({ code: 'invalid_project', message: 'project.id is required' });
  }

  const studyRows = Array.isArray(studies) ? studies : [];
  if (studyRows.length === 0) {
    throw new WorkflowExportError({
      code: 'no_studies',
      message: 'Project has no studies; at least one study is required for export.',
    });
  }

  const sampleRows = Array.isArray(samples) ? samples : [];
  if (sampleRows.length === 0) {
    throw new WorkflowExportError({
      code: 'no_samples',
      message: 'Project has no samples; at least one sample is required for export.',
    });
  }

  const assayRows = Array.isArray(assays) ? assays : [];
  if (assayRows.length === 0) {
    throw new WorkflowExportError({
      code: 'no_assays',
      message: 'Project has no assays; at least one assay is required for export.',
    });
  }

  const platformCodes = defined(
    assayRows.map((a) => a?.platform?.code ?? a?.platform?.name ?? a?.platform ?? null)
  ).map((v) => String(v));

  if (platformCodes.length !== assayRows.length) {
    throw new WorkflowExportError({
      code: 'missing_assay_platform',
      message: 'At least one assay is missing platform; set assays.platform before exporting.',
    });
  }

  const platform = pickSingleOrError({
    values: platformCodes,
    code: 'mixed_platforms_not_supported',
    message: 'Project contains incompatible assay platforms for a single export.',
    detailsKey: 'platforms',
  });

  const genome = pickSingleOrError({
    values: assayRows.map((a) => a?.genome_version?.code ?? a?.genome_version?.name ?? null),
    code: 'mixed_genome_versions_not_supported',
    message: 'Project contains multiple genome versions; mixed genome exports are not supported.',
    detailsKey: 'genome_versions',
  });

  const quantMethod = pickSingleOrError({
    values: assayRows.map((a) => a?.quantification_method?.code ?? a?.quantification_method?.name ?? null),
    code: 'mixed_quant_methods_not_supported',
    message: 'Project contains multiple quantification methods; mixed exports are not supported.',
    detailsKey: 'quantification_methods',
  });

  const readMode = pickSingleOrError({
    values: assayRows.map((a) => normalizeReadMode(a?.read_mode ?? null)),
    code: 'mixed_read_modes_not_supported',
    message: 'Project contains multiple read modes; mixed exports are not supported.',
    detailsKey: 'read_modes',
  });

  const isTempoSeq = isTempoSeqPlatform(platform) || isTempoSeqPlatform(project?.intake_platform);
  const biospyderManifestCode = project?.biospyder_manifest?.code ?? project?.biospyder_manifest?.name ?? null;
  const biospyderDbs = getM2MValues(project?.biospyder_databases, ['code', 'name'])
    .map((d) => d.code ?? d.name ?? null)
    .filter((v) => v !== null && v !== undefined && String(v) !== '')
    .map((v) => String(v));

  if (isTempoSeq && !biospyderManifestCode) {
    throw new WorkflowExportError({
      code: 'tempo_seq_missing_biospyder_manifest',
      message: 'TempO-Seq export requires projects.biospyder_manifest to be set.',
    });
  }

  if (isTempoSeq && biospyderDbs.length === 0) {
    throw new WorkflowExportError({
      code: 'tempo_seq_missing_biospyder_databases',
      message: 'TempO-Seq export requires at least one projects.biospyder_databases entry.',
    });
  }

  const genomeVersion = assayRows.find((a) => (a?.genome_version?.code ?? a?.genome_version?.name ?? null) === genome)
    ?.genome_version;

  const genomeFields = {
    genomedir: genomeVersion?.genomedir ?? null,
    genome_filename: genomeVersion?.genome_filename ?? null,
    annotation_filename: genomeVersion?.annotation_filename ?? null,
    genome_name: genomeVersion?.genome_name ?? null,
  };

  const missingGenomeFields = Object.entries(genomeFields)
    .filter(([, v]) => v === null || v === undefined || String(v) === '')
    .map(([k]) => k);

  if (missingGenomeFields.length > 0) {
    throw new WorkflowExportError({
      code: 'missing_genome_version_metadata',
      message: `Selected genome_version is missing required fields: ${missingGenomeFields.join(', ')}.`,
      details: { genome_version: genome, missing_fields: missingGenomeFields },
    });
  }

  const studyFields = ['species', 'celltype', 'treatment_var', 'batch_var', 'units'];
  const mismatchedStudyFields = [];
  for (const field of studyFields) {
    const unique = uniq(defined(studyRows.map((s) => s?.[field] ?? null)).map((v) => String(v)));
    if (unique.length > 1) mismatchedStudyFields.push({ field, values: unique });
  }
  if (mismatchedStudyFields.length > 0) {
    throw new WorkflowExportError({
      code: 'incompatible_study_definitions',
      message: 'Project contains multiple studies with incompatible definitions; export requires consistent study-level fields.',
      details: { mismatches: mismatchedStudyFields },
    });
  }

  const singleStudy = studyRows[0];
  const treatmentVar = resolveTreatmentVariable(singleStudy?.treatment_var ?? 'group');
  const allowedTreatmentVars = new Set(['group', 'chemical', 'chemical_longname', 'dose']);
  if (!allowedTreatmentVars.has(treatmentVar)) {
    throw new WorkflowExportError({
      code: 'invalid_treatment_var',
      message: `Unsupported studies.treatment_var '${treatmentVar}'. Supported: ${[...allowedTreatmentVars].join(', ')}.`,
      details: { treatment_var: treatmentVar },
    });
  }

  const sampleById = new Map(sampleRows.map((s) => [s.id, s]));
  const studyById = new Map(studyRows.map((s) => [s.id, s]));

  const metadataRows = assayRows
    .map((a) => {
      const sample = sampleById.get(a.sample) ?? a.sample ?? null;
      const study = sample?.study ? studyById.get(sample.study) ?? sample.study ?? null : null;
      return {
        study_id: study?.id ?? sample?.study ?? null,
        sample_id: sample?.id ?? a.sample ?? null,
        sample_ID: sample?.sample_ID ?? null,
        sample_name: sample?.sample_name ?? null,
        description: sample?.description ?? null,
        group: sample?.group ?? null,
        chemical: sample?.chemical ?? null,
        chemical_longname: sample?.chemical_longname ?? null,
        dose: sample?.dose ?? null,
        technical_control: sample?.technical_control ?? null,
        reference_rna: sample?.reference_rna ?? null,
        solvent_control: sample?.solvent_control ?? null,
        assay_id: a.id ?? null,
        platform: a?.platform?.code ?? a?.platform?.name ?? null,
        genome_version: a?.genome_version?.code ?? a?.genome_version?.name ?? null,
        quantification_method: a?.quantification_method?.code ?? a?.quantification_method?.name ?? null,
        read_mode: normalizeReadMode(a?.read_mode ?? null),
      };
    })
    .sort(stableSortBy(['study_id', 'sample_ID', 'assay_id']));

  const metadataColumns = [
    'study_id',
    'sample_ID',
    'sample_name',
    'group',
    'chemical',
    'chemical_longname',
    'dose',
    'technical_control',
    'reference_rna',
    'solvent_control',
    'platform',
    'genome_version',
    'quantification_method',
    'read_mode',
    'assay_id',
    'sample_id',
  ];

  const metadataTsv = [
    metadataColumns.join('\t'),
    ...metadataRows.map((r) => metadataColumns.map((c) => tsvCell(r[c])).join('\t')),
    '',
  ].join('\n');

  const contrastsColumns = ['study_id', 'variable', 'contrast', 'treatment', 'control'];
  const contrasts = [];
  const warnings = [];
  const metadataByStudy = new Map();
  for (const row of metadataRows) {
    const studyId = row.study_id ?? 'unknown';
    if (!metadataByStudy.has(studyId)) metadataByStudy.set(studyId, []);
    metadataByStudy.get(studyId).push(row);
  }

  for (const study of studyRows) {
    const rows = metadataByStudy.get(study.id) ?? [];
    const { contrasts: cs, levels, control_level: controlLevel } = computeContrastsForStudy({
      study,
      rows,
      variable: treatmentVar,
    });
    if (cs.length === 0) {
      warnings.push({
        code: 'no_contrasts_generated',
        message: `No contrasts generated for study ${study.id} (levels=${levels.length}).`,
        details: { study_id: study.id, variable: treatmentVar, levels, control_level: controlLevel },
      });
    }
    contrasts.push(...cs);
  }

  const contrastsTsv = [
    contrastsColumns.join('\t'),
    ...contrasts.map((r) => contrastsColumns.map((c) => tsvCell(r[c])).join('\t')),
    '',
  ].join('\n');

  const doseValues = uniq(defined(sampleRows.map((s) => s?.dose ?? null)).map((v) => String(v)));
  const dose = doseValues.length <= 1 ? (doseValues[0] ?? null) : doseValues;

  const configObj = {
    common: {
      projectdir: `project_${project.id}`,
      project_title: project.title ?? null,
      researcher_name: project.researcher_name ?? null,
      bioinformatician_name: pickBioinformaticianName(project.bioinformatician_assigned),
      platform,
      dose,
      batch_var: singleStudy?.batch_var ?? null,
      celltype: singleStudy?.celltype ?? null,
      units: singleStudy?.units ?? null,
      ...(isTempoSeq
        ? {
            biospyder_dbs: uniq(biospyderDbs).sort((a, b) => (a < b ? -1 : 1)),
            biospyder_manifest_file: String(biospyderManifestCode),
          }
        : {}),
    },
    pipeline: {
      ...genomeFields,
      genome_version: genome,
      mode: readMode ?? null,
      quantification_method: quantMethod ?? null,
    },
    QC: defaults?.qc_defaults ?? {},
    DESeq2: defaults?.deseq2_defaults ?? {},
  };

  const configYaml = `${yamlDump(configObj, 0)}\n`;

  return {
    ok: true,
    schema_version: WORKFLOW_EXPORT_SCHEMA_VERSION,
    project_id: project.id,
    platform,
    genome_version: genome,
    quantification_method: quantMethod ?? null,
    read_mode: readMode ?? null,
    artifacts: {
      'config.yaml': configYaml,
      'metadata.tsv': metadataTsv,
      'contrasts.tsv': contrastsTsv,
    },
    warnings,
  };
}
