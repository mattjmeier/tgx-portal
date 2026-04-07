import crypto from 'node:crypto';

export const SAMPLE_INTAKE_SCHEMA_VERSION = '2026-04-07.1';

export const SAMPLE_ID_PATTERN = /^[a-zA-Z0-9-_]*$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTEGER_PATTERN = /^[0-9]+$/;

const SAMPLE_FIELDS = [
  'sample_ID',
  'sample_name',
  'description',
  'group',
  'chemical',
  'chemical_longname',
  'dose',
  'technical_control',
  'reference_rna',
  'solvent_control',
];

const ASSAY_FIELDS = ['platform', 'genome_version', 'quantification_method', 'read_mode'];

export const SAMPLE_INTAKE_FIELDS = [...SAMPLE_FIELDS, ...ASSAY_FIELDS];

const HEADER_ALIASES = new Map([
  ['sample_id', 'sample_ID'],
  ['sample id', 'sample_ID'],
  ['sampleid', 'sample_ID'],
  ['sample_id#', 'sample_ID'],
  ['sample_name', 'sample_name'],
  ['sample name', 'sample_name'],
  ['name', 'sample_name'],
  ['group', 'group'],
  ['treatment_group', 'group'],
  ['treatment group', 'group'],
  ['chemical_longname', 'chemical_longname'],
  ['chemical longname', 'chemical_longname'],
  ['chemical_long_name', 'chemical_longname'],
  ['technical_control', 'technical_control'],
  ['technical control', 'technical_control'],
  ['reference_rna', 'reference_rna'],
  ['reference rna', 'reference_rna'],
  ['solvent_control', 'solvent_control'],
  ['solvent control', 'solvent_control'],
  ['genome_version', 'genome_version'],
  ['genome version', 'genome_version'],
  ['genome', 'genome_version'],
  ['quantification_method', 'quantification_method'],
  ['quantification method', 'quantification_method'],
  ['quant_method', 'quantification_method'],
  ['quant method', 'quantification_method'],
  ['read_mode', 'read_mode'],
  ['read mode', 'read_mode'],
  ['mode', 'read_mode'],
]);

export function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '');
}

export function hashContent(content) {
  return crypto.createHash('sha256').update(String(content ?? '')).digest('hex');
}

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

export function parseBoolean(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '') return { ok: true, value: null, present: false };
  if (['true', 't', 'yes', 'y', '1'].includes(v)) return { ok: true, value: true, present: true };
  if (['false', 'f', 'no', 'n', '0'].includes(v)) return { ok: true, value: false, present: true };
  return { ok: false, value: null, present: true };
}

export function normalizeReadMode(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '') return { ok: true, value: null, present: false };
  if (v === 'se' || v === 'single' || v === 'single-end' || v === 'single end') {
    return { ok: true, value: 'se', present: true };
  }
  if (v === 'pe' || v === 'paired' || v === 'paired-end' || v === 'paired end') {
    return { ok: true, value: 'pe', present: true };
  }
  return { ok: false, value: null, present: true };
}

function delimiterForType(fileType) {
  if (fileType === 'csv') return ',';
  if (fileType === 'tsv') return '\t';
  return null;
}

function parseDelimited(content, delimiter) {
  const text = String(content ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  function pushCell() {
    currentRow.push(currentCell);
    currentCell = '';
  }

  function pushRow() {
    // Skip a completely empty trailing row.
    if (currentRow.length === 1 && currentRow[0] === '' && rows.length > 0) {
      currentRow = [];
      return;
    }
    rows.push(currentRow);
    currentRow = [];
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      pushCell();
      continue;
    }

    if (ch === '\n') {
      pushCell();
      pushRow();
      continue;
    }

    if (ch === '\r') {
      // Handle CRLF or standalone CR
      const next = text[i + 1];
      if (next === '\n') i += 1;
      pushCell();
      pushRow();
      continue;
    }

    currentCell += ch;
  }

  pushCell();
  if (currentRow.length > 1 || currentRow[0] !== '') pushRow();

  return rows;
}

function normalizeHeaderCell(cell) {
  return normalizeKey(cell).replace(/[_-]+/g, '_');
}

export function parseSampleIntakeContent({ content, file_type: fileType }) {
  const ft = String(fileType ?? '').trim().toLowerCase();
  const delimiter = delimiterForType(ft);
  if (!delimiter) {
    return {
      ok: false,
      file_type: ft,
      errors: [
        {
          row: 1,
          field: 'file_type',
          code: 'invalid_file_type',
          message: "file_type must be 'csv' or 'tsv'",
        },
      ],
      header: [],
      rows: [],
      warnings: [],
    };
  }

  const raw = parseDelimited(content, delimiter);
  if (raw.length === 0) {
    return {
      ok: false,
      file_type: ft,
      errors: [
        {
          row: 1,
          field: 'content',
          code: 'empty_content',
          message: 'No rows found in uploaded content.',
        },
      ],
      header: [],
      rows: [],
      warnings: [],
    };
  }

  const headerRaw = raw[0] ?? [];
  const header = headerRaw.map((h) => String(h ?? '').trim());
  const canonicalHeader = headerRaw.map((h) => {
    const normalized = normalizeHeaderCell(h);
    return HEADER_ALIASES.get(normalized) ?? normalized;
  });

  const unknownHeaders = canonicalHeader.filter(
    (h) => h && !SAMPLE_INTAKE_FIELDS.includes(h) && h !== 'sample_ID'
  );

  const warnings = [];
  if (unknownHeaders.length > 0) {
    warnings.push({
      code: 'unknown_columns',
      message: `Unknown columns will be ignored: ${unknownHeaders.join(', ')}`,
      columns: unknownHeaders,
    });
  }

  const index = new Map();
  for (let i = 0; i < canonicalHeader.length; i += 1) {
    const name = canonicalHeader[i];
    if (!name) continue;
    if (!index.has(name)) index.set(name, i);
  }

  const rows = [];
  for (let r = 1; r < raw.length; r += 1) {
    const rowNumber = r + 1; // 1-based file row number, with header at 1
    const row = raw[r] ?? [];

    const values = {};
    const present = {};

    for (const field of SAMPLE_INTAKE_FIELDS) {
      const i = index.get(field);
      const cell = i === undefined ? '' : String(row[i] ?? '');
      const trimmed = cell.trim();
      values[field] = trimmed === '' ? null : trimmed;
      present[field] = trimmed !== '';
    }

    // Always include sample_ID explicitly; it is required for the workflow.
    if (index.has('sample_ID')) {
      const i = index.get('sample_ID');
      const cell = String(row[i] ?? '').trim();
      values.sample_ID = cell === '' ? null : cell;
      present.sample_ID = cell !== '';
    } else {
      values.sample_ID = null;
      present.sample_ID = false;
    }

    rows.push({ row: rowNumber, values, present });
  }

  return { ok: true, file_type: ft, header, rows, warnings, errors: [] };
}

function lookupName(record) {
  return String(record?.name ?? record?.code ?? record?.id ?? '').trim();
}

export function makeLookupMap(records) {
  const byId = new Map();
  const byKey = new Map();
  const recordsById = new Map();

  for (const record of records ?? []) {
    if (!record?.id) continue;
    byId.set(String(record.id), String(record.id));
    recordsById.set(String(record.id), record);

    const name = normalizeKey(record.name);
    const code = normalizeKey(record.code);
    if (name) byKey.set(name, String(record.id));
    if (code) byKey.set(code, String(record.id));
  }

  return { byId, byKey, recordsById };
}

function resolveLookup(value, { byId, byKey, recordsById }) {
  const raw = String(value ?? '').trim();
  if (raw === '') return { ok: true, id: null, record: null };
  // Allow callers to supply either an ID (uuid/int) or a human-friendly lookup key (name/code).
  // Directus exports commonly use integer primary keys for lookup tables in this repo baseline.
  const looksLikeId = isUuid(raw) || INTEGER_PATTERN.test(raw);
  if (looksLikeId) {
    const id = byId.get(raw) ?? null;
    // If the value is numeric but does not match an existing ID, fall back to key matching
    // to avoid breaking numeric codes (rare, but possible).
    if (id) {
      return {
        ok: true,
        id,
        record: recordsById.get(id) ?? null,
        label: lookupName(recordsById.get(id)),
      };
    }
    if (isUuid(raw)) return { ok: false, id: null, record: null, label: raw };
  }

  const key = normalizeKey(raw);
  const id = byKey.get(key) ?? null;
  if (!id) return { ok: false, id: null, record: null, label: raw };
  return { ok: true, id, record: recordsById.get(id) ?? null, label: lookupName(recordsById.get(id)) };
}

function platformImpliesRnaSeq(platformRecord) {
  const name = normalizeKey(platformRecord?.name);
  const code = normalizeKey(platformRecord?.code);
  return name.includes('rna') || code.includes('rna');
}

export function validateSampleIntakeRows({
  parsed,
  study,
  project_intake_platform: projectPlatform,
  existing_samples_by_sample_id: existingBySampleId,
  existing_assays_by_sample_uuid: assaysBySampleUuid,
  lookups,
  write_mode: writeMode = 'upsert',
  preview_limit: previewLimit = 25,
  content_hash: contentHash = null,
}) {
  const errors = [...(parsed?.errors ?? [])];
  const warnings = [...(parsed?.warnings ?? [])];

  if (!parsed?.ok) {
    return {
      ok: false,
      schema_version: SAMPLE_INTAKE_SCHEMA_VERSION,
      content_hash: hashContent(''),
      preview_rows: [],
      errors,
      warnings,
      summary: { total_rows: 0, valid_rows: 0, invalid_rows: 0, creates: 0, updates: 0 },
      normalized_rows: [],
    };
  }

  const rows = parsed.rows ?? [];
  const normalizedRows = [];

  const sampleIdSeen = new Map();
  for (const row of rows) {
    const sampleId = String(row?.values?.sample_ID ?? '').trim();
    if (!sampleId) continue;
    if (!sampleIdSeen.has(sampleId)) sampleIdSeen.set(sampleId, row.row);
  }

  const duplicates = new Set();
  for (const row of rows) {
    const sampleId = String(row?.values?.sample_ID ?? '').trim();
    if (!sampleId) continue;
    const first = sampleIdSeen.get(sampleId);
    if (first !== row.row) duplicates.add(sampleId);
  }

  let creates = 0;
  let updates = 0;

  for (const row of rows) {
    const rowErrors = [];
    const raw = row.values ?? {};
    const present = row.present ?? {};

    const sampleId = String(raw.sample_ID ?? '').trim();
    if (!sampleId) {
      rowErrors.push({
        row: row.row,
        field: 'sample_ID',
        code: 'required',
        message: 'sample_ID is required.',
      });
    } else if (!SAMPLE_ID_PATTERN.test(sampleId)) {
      rowErrors.push({
        row: row.row,
        field: 'sample_ID',
        code: 'pattern',
        message: 'sample_ID must match ^[a-zA-Z0-9-_]*$',
      });
    }

    if (sampleId && duplicates.has(sampleId)) {
      rowErrors.push({
        row: row.row,
        field: 'sample_ID',
        code: 'duplicate_within_file',
        message: 'sample_ID is duplicated within the uploaded file.',
      });
    }

    const existing = sampleId ? existingBySampleId?.get(sampleId) ?? null : null;
    if (existing && writeMode === 'create_only') {
      rowErrors.push({
        row: row.row,
        field: 'sample_ID',
        code: 'duplicate_within_study',
        message: 'sample_ID must be unique within the selected study.',
      });
    }

    if (study?.treatment_var && String(study.treatment_var).trim().length > 0) {
      if (!raw.group) {
        rowErrors.push({
          row: row.row,
          field: 'group',
          code: 'required_by_study',
          message: 'group is required because this study defines a treatment_var.',
        });
      }
    }

    const boolFields = ['technical_control', 'reference_rna', 'solvent_control'];
    const booleans = {};
    for (const field of boolFields) {
      const parsedBool = parseBoolean(raw[field]);
      if (!parsedBool.ok) {
        rowErrors.push({
          row: row.row,
          field,
          code: 'invalid_boolean',
          message: `${field} must be true/false (or yes/no, 1/0).`,
        });
      }
      booleans[field] = parsedBool;
      present[field] = parsedBool.present;
    }

    const parsedReadMode = normalizeReadMode(raw.read_mode);
    if (!parsedReadMode.ok) {
      rowErrors.push({
        row: row.row,
        field: 'read_mode',
        code: 'invalid_read_mode',
        message: "read_mode must be 'se' or 'pe' (or Single-end/Paired-end).",
      });
    }

    // Lookups
    const platformLookup = lookups?.platform_options ?? null;
    const genomeLookup = lookups?.genome_versions ?? null;
    const quantLookup = lookups?.quantification_methods ?? null;

    const platformRaw = raw.platform ?? projectPlatform ?? null;
    const platformResolved = platformLookup ? resolveLookup(platformRaw, platformLookup) : { ok: true, id: null, record: null, label: null };
    if (!platformResolved.ok) {
      rowErrors.push({
        row: row.row,
        field: 'platform',
        code: 'lookup_mismatch',
        message: `Unknown platform: ${platformResolved.label}`,
      });
    }
    if (platformResolved.ok && !platformResolved.id) {
      rowErrors.push({
        row: row.row,
        field: 'platform',
        code: 'required',
        message: 'platform is required (or set a project intake_platform).',
      });
    }

    const genomeResolved = genomeLookup ? resolveLookup(raw.genome_version, genomeLookup) : { ok: true, id: null, record: null, label: null };
    if (!genomeResolved.ok) {
      rowErrors.push({
        row: row.row,
        field: 'genome_version',
        code: 'lookup_mismatch',
        message: `Unknown genome_version: ${genomeResolved.label}`,
      });
    }

    const quantResolved = quantLookup ? resolveLookup(raw.quantification_method, quantLookup) : { ok: true, id: null, record: null, label: null };
    if (!quantResolved.ok) {
      rowErrors.push({
        row: row.row,
        field: 'quantification_method',
        code: 'lookup_mismatch',
        message: `Unknown quantification_method: ${quantResolved.label}`,
      });
    }

    const needsReadMode = platformImpliesRnaSeq(platformResolved.record);
    if (needsReadMode && parsedReadMode.ok && parsedReadMode.value === null) {
      rowErrors.push({
        row: row.row,
        field: 'read_mode',
        code: 'required_by_platform',
        message: 'read_mode is required for RNA-Seq platforms.',
      });
    }

    const existingAssayInfo = existing?.id ? assaysBySampleUuid?.get(String(existing.id)) ?? null : null;
    if (existingAssayInfo?.count > 1) {
      rowErrors.push({
        row: row.row,
        field: 'sample_ID',
        code: 'multiple_assays_existing',
        message: 'Existing sample has multiple assays; intake upsert is ambiguous.',
      });
    }

    const samplePatch = {};
    for (const field of SAMPLE_FIELDS) {
      if (field === 'sample_ID') continue;
      if (!present[field]) continue;
      samplePatch[field] = raw[field];
    }
    for (const field of boolFields) {
      if (!booleans[field]?.present) continue;
      samplePatch[field] = booleans[field].value;
    }

    const assayPatch = {};
    if (platformResolved.ok && platformResolved.id) assayPatch.platform = platformResolved.id;
    if (genomeResolved.ok && genomeResolved.id) assayPatch.genome_version = genomeResolved.id;
    if (quantResolved.ok && quantResolved.id) assayPatch.quantification_method = quantResolved.id;
    if (parsedReadMode.ok && parsedReadMode.present) assayPatch.read_mode = parsedReadMode.value;

    const action = existing ? 'update' : 'create';
    if (action === 'create') creates += 1;
    else updates += 1;

    const normalized = {
      row: row.row,
      sample_ID: sampleId || null,
      action,
      existing_sample_id: existing?.id ?? null,
      existing_assay_id: existingAssayInfo?.id ?? null,
      sample_patch: samplePatch,
      assay_patch: assayPatch,
      valid: rowErrors.length === 0,
    };

    if (rowErrors.length > 0) errors.push(...rowErrors);
    normalizedRows.push(normalized);
  }

  const invalidRows = new Set(errors.map((e) => e.row));
  const validRows = normalizedRows.filter((r) => r.valid).length;
  const invalid = rows.length - validRows;

  return {
    ok: errors.length === 0,
    schema_version: SAMPLE_INTAKE_SCHEMA_VERSION,
    content_hash: contentHash,
    preview_rows: normalizedRows.slice(0, previewLimit).map((r) => ({
      row: r.row,
      sample_ID: r.sample_ID,
      action: r.action,
      valid: r.valid,
      sample_patch: r.sample_patch,
      assay_patch: r.assay_patch,
    })),
    errors,
    warnings,
    summary: {
      total_rows: rows.length,
      valid_rows: validRows,
      invalid_rows: invalid,
      creates,
      updates,
      invalid_row_numbers: Array.from(invalidRows).sort((a, b) => a - b),
    },
    normalized_rows: normalizedRows,
  };
}
