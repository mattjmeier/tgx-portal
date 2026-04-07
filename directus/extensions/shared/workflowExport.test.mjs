import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkflowExportError, generateWorkflowExportArtifacts } from './workflowExport.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, '__fixtures__', 'workflow-export');

async function readFixture(name) {
  return fs.readFile(path.join(FIXTURES, name), 'utf8');
}

function baseRnaSeqFixture() {
  const project = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Test Project',
    researcher_name: 'Alice',
    intake_platform: 'RNA-Seq',
    bioinformatician_assigned: { first_name: 'Bob', last_name: 'Bio', email: 'bob@example.com' },
    biospyder_manifest: null,
    biospyder_databases: [],
  };

  const studies = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      species: null,
      celltype: 'PBMC',
      treatment_var: 'group',
      batch_var: 'batch',
      units: 'mg',
    },
  ];

  const samples = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      study: studies[0].id,
      sample_ID: 'S1',
      sample_name: 'Sample1',
      group: 'Control',
      chemical: null,
      chemical_longname: null,
      dose: '0',
      technical_control: true,
      reference_rna: false,
      solvent_control: false,
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      study: studies[0].id,
      sample_ID: 'S2',
      sample_name: 'Sample2',
      group: 'Treated',
      chemical: null,
      chemical_longname: null,
      dose: '10',
      technical_control: false,
      reference_rna: false,
      solvent_control: false,
    },
  ];

  const platform = { code: 'RNA-Seq', name: 'RNA-Seq' };
  const genome_version = {
    code: 'hg38',
    name: 'hg38',
    genomedir: '/genomes/hg38',
    genome_filename: 'genome.fa',
    annotation_filename: 'genes.gtf',
    genome_name: 'hg38',
  };
  const quantification_method = { code: 'salmon', name: 'Salmon' };

  const assays = [
    {
      id: '55555555-5555-5555-5555-555555555555',
      sample: samples[0].id,
      platform,
      genome_version,
      quantification_method,
      read_mode: 'se',
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      sample: samples[1].id,
      platform,
      genome_version,
      quantification_method,
      read_mode: 'se',
    },
  ];

  const defaults = { qc_defaults: { min_counts: 10 }, deseq2_defaults: { lfc_threshold: 1 } };
  return { project, studies, samples, assays, defaults };
}

test('generateWorkflowExportArtifacts matches golden artifacts (RNA-Seq)', async () => {
  const fx = baseRnaSeqFixture();
  const out = generateWorkflowExportArtifacts(fx);

  assert.equal(out.ok, true);
  assert.equal(out.project_id, fx.project.id);

  assert.equal(out.artifacts['config.yaml'], await readFixture('rna_seq_config.yaml'));
  assert.equal(out.artifacts['metadata.tsv'], await readFixture('rna_seq_metadata.tsv'));
  assert.equal(out.artifacts['contrasts.tsv'], await readFixture('rna_seq_contrasts.tsv'));
});

test('generateWorkflowExportArtifacts fails on mixed platforms', () => {
  const fx = baseRnaSeqFixture();
  fx.assays[1].platform = { code: 'TempO-Seq', name: 'TempO-Seq' };

  assert.throws(
    () => generateWorkflowExportArtifacts(fx),
    (err) => err instanceof WorkflowExportError && err.code === 'mixed_platforms_not_supported'
  );
});

test('generateWorkflowExportArtifacts fails TempO-Seq when Biospyder metadata missing', () => {
  const fx = baseRnaSeqFixture();
  fx.project.intake_platform = 'TempO-Seq';
  fx.assays.forEach((a) => {
    a.platform = { code: 'TempO-Seq', name: 'TempO-Seq' };
  });
  fx.project.biospyder_manifest = null;
  fx.project.biospyder_databases = [];

  assert.throws(
    () => generateWorkflowExportArtifacts(fx),
    (err) => err instanceof WorkflowExportError && err.code === 'tempo_seq_missing_biospyder_manifest'
  );
});

