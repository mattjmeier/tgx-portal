import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeLookupMap,
  parseSampleIntakeContent,
  validateSampleIntakeRows,
} from './sampleIntakeValidation.mjs';

const PLATFORM_RNASEQ_ID = '11111111-1111-4111-8111-111111111111';
const GENOME_HG38_ID = '22222222-2222-4222-8222-222222222222';
const QUANT_SALMON_ID = '33333333-3333-4333-8333-333333333333';

function makeLookups() {
  return {
    platform_options: makeLookupMap([
      { id: PLATFORM_RNASEQ_ID, name: 'RNA-Seq', code: 'RNA-Seq' },
    ]),
    genome_versions: makeLookupMap([{ id: GENOME_HG38_ID, name: 'hg38', code: 'hg38' }]),
    quantification_methods: makeLookupMap([
      { id: QUANT_SALMON_ID, name: 'salmon', code: 'salmon' },
    ]),
  };
}

test('parseSampleIntakeContent parses TSV with header aliases', () => {
  const content = ['sample id\tgroup\tread mode', 'S1\tA\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.sample_ID, 'S1');
  assert.equal(parsed.rows[0].values.group, 'A');
  assert.equal(parsed.rows[0].values.read_mode, 'se');
});

test('parseSampleIntakeContent parses quoted CSV cells', () => {
  const content = ['sample_ID,group', '"S,1",A'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'csv' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows[0].values.sample_ID, 'S,1');
});

test('validateSampleIntakeRows catches duplicate sample_ID within file', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S1\tRNA-Seq\tse', 'S1\tRNA-Seq\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const existing = new Map();
  const assays = new Map();

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: existing,
    existing_assays_by_sample_uuid: assays,
    lookups: makeLookups(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === 'duplicate_within_file' && e.field === 'sample_ID'));
});

test('validateSampleIntakeRows enforces sample_ID pattern', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S 1\tRNA-Seq\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
  });

  assert.ok(result.errors.some((e) => e.code === 'pattern' && e.field === 'sample_ID'));
});

test('validateSampleIntakeRows requires read_mode for RNA-Seq', () => {
  const content = ['sample_ID\tplatform', 'S1\tRNA-Seq'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
  });

  assert.ok(result.errors.some((e) => e.code === 'required_by_platform' && e.field === 'read_mode'));
});

test('validateSampleIntakeRows supports project_intake_platform default', () => {
  const content = ['sample_ID\tread_mode', 'S1\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: 'RNA-Seq',
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
  });

  assert.equal(result.ok, true);
});

test('validateSampleIntakeRows accepts numeric lookup IDs (Directus baseline style)', () => {
  const numericLookups = {
    platform_options: makeLookupMap([{ id: 1, name: 'RNA-Seq', code: 'RNA-Seq' }]),
    genome_versions: makeLookupMap([{ id: 2, name: 'hg38', code: 'hg38' }]),
    quantification_methods: makeLookupMap([{ id: 3, name: 'salmon', code: 'salmon' }]),
  };

  const content = ['sample_ID\tplatform\tread_mode\tgenome_version\tquantification_method', 'S1\t1\tse\t2\t3'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: numericLookups,
  });

  assert.equal(result.ok, true);
  assert.equal(result.preview_rows[0].assay_patch.platform, '1');
  assert.equal(result.preview_rows[0].assay_patch.genome_version, '2');
  assert.equal(result.preview_rows[0].assay_patch.quantification_method, '3');
});

test('validateSampleIntakeRows blocks ambiguous multi-assay updates', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S1\tRNA-Seq\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const existing = new Map([['S1', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sample_ID: 'S1' }]]);
  const assays = new Map([['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { count: 2, id: null }]]);

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: existing,
    existing_assays_by_sample_uuid: assays,
    lookups: makeLookups(),
  });

  assert.ok(result.errors.some((e) => e.code === 'multiple_assays_existing'));
});

test('validateSampleIntakeRows requires group when study defines treatment_var', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S1\tRNA-Seq\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: 'dose' },
    project_intake_platform: null,
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
  });

  assert.ok(result.errors.some((e) => e.code === 'required_by_study' && e.field === 'group'));
});

test('validateSampleIntakeRows rejects existing sample_ID in create_only mode', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S1\tRNA-Seq\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const existing = new Map([['S1', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sample_ID: 'S1' }]]);

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: existing,
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
    write_mode: 'create_only',
  });

  assert.ok(result.errors.some((e) => e.code === 'duplicate_within_study' && e.field === 'sample_ID'));
});

test('validateSampleIntakeRows flags unknown lookup values', () => {
  const content = ['sample_ID\tplatform\tread_mode', 'S1\tNot-A-Platform\tse'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });

  const result = validateSampleIntakeRows({
    parsed,
    study: { treatment_var: '' },
    project_intake_platform: null,
    existing_samples_by_sample_id: new Map(),
    existing_assays_by_sample_uuid: new Map(),
    lookups: makeLookups(),
  });

  assert.ok(result.errors.some((e) => e.code === 'lookup_mismatch' && e.field === 'platform'));
});

test('parseSampleIntakeContent warns on unknown columns', () => {
  const content = ['sample_ID\tplatform\tread_mode\tmystery', 'S1\tRNA-Seq\tse\tx'].join('\n');
  const parsed = parseSampleIntakeContent({ content, file_type: 'tsv' });
  assert.equal(parsed.ok, true);
  assert.ok(parsed.warnings.some((w) => w.code === 'unknown_columns'));
});
