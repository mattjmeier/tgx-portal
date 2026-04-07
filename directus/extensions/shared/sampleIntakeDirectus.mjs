import fs from 'node:fs/promises';
import path from 'node:path';

import {
  hashContent,
  makeLookupMap,
  parseSampleIntakeContent,
  validateSampleIntakeRows,
} from './sampleIntakeValidation.mjs';

function guessFileTypeFromName(filename) {
  const lower = String(filename ?? '').toLowerCase();
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.csv')) return 'csv';
  return null;
}

function pickUploadsRoot(env) {
  if (env?.STORAGE_LOCAL_ROOT) return path.resolve(env.STORAGE_LOCAL_ROOT);
  // Directus Docker image default
  return '/directus/uploads';
}

export async function resolveSampleIntakeContent({
  input,
  existing,
  env,
  services,
  database,
  schema,
  accountability,
}) {
  const sourceType = input?.source_type ?? existing?.source_type ?? 'text';
  const fileType =
    String(input?.file_type ?? existing?.file_type ?? '').trim().toLowerCase() || null;

  if (sourceType === 'file') {
    const fileId = input?.source_file ?? existing?.source_file ?? null;
    if (!fileId) {
      return {
        ok: false,
        file_type: fileType,
        content: '',
        errors: [
          {
            row: 1,
            field: 'source_file',
            code: 'required',
            message: 'source_file is required when source_type is File.',
          },
        ],
      };
    }

    const { ItemsService } = services;
    const files = new ItemsService('directus_files', { knex: database, schema, accountability });
    const file = await files.readOne(fileId, {
      fields: ['id', 'storage', 'filename_disk', 'filename_download'],
    });

    if (file?.storage && file.storage !== 'local') {
      return {
        ok: false,
        file_type: fileType,
        content: '',
        errors: [
          {
            row: 1,
            field: 'source_file',
            code: 'unsupported_storage',
            message: `Only local file storage is supported for sample intake validation (storage=${file.storage}).`,
          },
        ],
      };
    }

    const inferred = guessFileTypeFromName(file.filename_download);
    const effectiveType = fileType || inferred;
    const root = pickUploadsRoot(env);
    const fullPath = path.join(root, file.filename_disk);
    const content = await fs.readFile(fullPath, 'utf8');

    return { ok: true, file_type: effectiveType, content, errors: [] };
  }

  const content = input?.source_text ?? existing?.source_text ?? '';
  return { ok: true, file_type: fileType, content, errors: [] };
}

export async function loadSampleIntakeContext({ services, database, schema, accountability, studyId }) {
  const { ItemsService } = services;

  const studies = new ItemsService('studies', { knex: database, schema, accountability });
  const study = await studies.readOne(studyId, {
    fields: [
      '*',
      'project.id',
      'project.intake_platform',
    ],
  });

  const platformOptions = new ItemsService('platform_options', { knex: database, schema, accountability });
  const genomeVersions = new ItemsService('genome_versions', { knex: database, schema, accountability });
  const quantMethods = new ItemsService('quantification_methods', { knex: database, schema, accountability });

  const [platformRows, genomeRows, quantRows] = await Promise.all([
    platformOptions.readByQuery({ limit: -1, fields: ['id', 'name', 'code'] }),
    genomeVersions.readByQuery({ limit: -1, fields: ['id', 'name', 'code'] }),
    quantMethods.readByQuery({ limit: -1, fields: ['id', 'name', 'code'] }),
  ]);

  const lookups = {
    platform_options: makeLookupMap(platformRows?.data ?? platformRows ?? []),
    genome_versions: makeLookupMap(genomeRows?.data ?? genomeRows ?? []),
    quantification_methods: makeLookupMap(quantRows?.data ?? quantRows ?? []),
  };

  return {
    study,
    project_intake_platform: study?.project?.intake_platform ?? null,
    lookups,
  };
}

export async function previewSampleIntakeFromContent({
  services,
  database,
  schema,
  accountability,
  studyId,
  fileType,
  content,
  writeMode = 'upsert',
  previewLimit = 25,
}) {
  const { ItemsService } = services;
  const context = await loadSampleIntakeContext({
    services,
    database,
    schema,
    accountability,
    studyId,
  });

  const parsed = parseSampleIntakeContent({ content, file_type: fileType });
  const sampleIds = parsed?.ok
    ? Array.from(
        new Set(
          (parsed.rows ?? [])
            .map((r) => String(r?.values?.sample_ID ?? '').trim())
            .filter(Boolean)
        )
      )
    : [];

  const samples = new ItemsService('samples', { knex: database, schema, accountability });
  const existingRows = sampleIds.length
    ? await samples.readByQuery({
        limit: -1,
        fields: ['id', 'sample_ID'],
        filter: { study: { _eq: studyId }, sample_ID: { _in: sampleIds } },
      })
    : { data: [] };

  const existingBySampleId = new Map();
  const existingSampleUuids = [];
  for (const rec of existingRows?.data ?? existingRows ?? []) {
    if (!rec?.sample_ID) continue;
    existingBySampleId.set(String(rec.sample_ID), { id: rec.id, sample_ID: rec.sample_ID });
    existingSampleUuids.push(rec.id);
  }

  const assays = new ItemsService('assays', { knex: database, schema, accountability });
  const assayRows = existingSampleUuids.length
    ? await assays.readByQuery({
        limit: -1,
        fields: ['id', 'sample'],
        filter: { sample: { _in: existingSampleUuids } },
      })
    : { data: [] };

  const assaysBySampleUuid = new Map();
  for (const assay of assayRows?.data ?? assayRows ?? []) {
    const sample = String(assay?.sample ?? '');
    if (!sample) continue;
    const current = assaysBySampleUuid.get(sample) ?? { count: 0, id: null };
    const next = { count: current.count + 1, id: current.id };
    if (next.count === 1) next.id = assay.id;
    assaysBySampleUuid.set(sample, next);
  }

  const validation = validateSampleIntakeRows({
    parsed,
    study: context.study,
    project_intake_platform: context.project_intake_platform,
    existing_samples_by_sample_id: existingBySampleId,
    existing_assays_by_sample_uuid: assaysBySampleUuid,
    lookups: context.lookups,
    write_mode: writeMode,
    preview_limit: previewLimit,
    content_hash: hashContent(content ?? ''),
  });

  return {
    ...validation,
    file_type: parsed?.file_type ?? String(fileType ?? '').toLowerCase(),
    header: parsed?.header ?? [],
    content_hash: hashContent(content ?? ''),
  };
}

export async function commitSampleIntakeFromContent({
  services,
  database,
  schema,
  accountability,
  studyId,
  fileType,
  content,
  writeMode = 'upsert',
}) {
  const preview = await previewSampleIntakeFromContent({
    services,
    database,
    schema,
    accountability,
    studyId,
    fileType,
    content,
    writeMode,
    previewLimit: 0,
  });

  if (!preview.ok) {
    return {
      ok: false,
      errors: preview.errors,
      warnings: preview.warnings,
      summary: preview.summary,
      commit: null,
    };
  }

  const rows = (preview.normalized_rows ?? []).filter((r) => r.valid);
  const { ItemsService } = services;

  const commit = await database.transaction(async (trx) => {
    const samples = new ItemsService('samples', { knex: trx, schema, accountability });
    const assays = new ItemsService('assays', { knex: trx, schema, accountability });

    const results = [];
    let createdSamples = 0;
    let updatedSamples = 0;
    let createdAssays = 0;
    let updatedAssays = 0;

    for (const row of rows) {
      const samplePayload = {
        sample_ID: row.sample_ID,
        study: studyId,
        ...row.sample_patch,
      };

      let sampleId = row.existing_sample_id;
      if (row.action === 'create') {
        sampleId = await samples.createOne(samplePayload);
        createdSamples += 1;
      } else {
        await samples.updateOne(sampleId, row.sample_patch);
        updatedSamples += 1;
      }

      const assayPayload = {
        sample: sampleId,
        ...row.assay_patch,
      };

      let assayId = row.existing_assay_id;
      if (!assayId) {
        assayId = await assays.createOne(assayPayload);
        createdAssays += 1;
      } else {
        await assays.updateOne(assayId, row.assay_patch);
        updatedAssays += 1;
      }

      results.push({ row: row.row, sample: sampleId, assay: assayId, action: row.action });
    }

    return {
      rows_committed: results.length,
      created_samples: createdSamples,
      updated_samples: updatedSamples,
      created_assays: createdAssays,
      updated_assays: updatedAssays,
      results,
    };
  });

  return { ok: true, errors: [], warnings: preview.warnings, summary: preview.summary, commit };
}
