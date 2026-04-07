import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commitSampleIntakeFromContent,
  previewSampleIntakeFromContent,
} from './sampleIntakeDirectus.mjs';

function makeHarness() {
  const store = {
    studies: [
      {
        id: 10,
        treatment_var: 'dose',
        project: { id: 1, intake_platform: 'RNA-Seq' },
      },
    ],
    platform_options: [{ id: 1, name: 'RNA-Seq', code: 'RNA-Seq' }],
    genome_versions: [{ id: 2, name: 'hg38', code: 'hg38' }],
    quantification_methods: [{ id: 3, name: 'salmon', code: 'salmon' }],
    samples: [],
    assays: [],
    directus_files: [],
  };

  const idCounters = new Map([
    ['samples', 1],
    ['assays', 1],
  ]);

  function nextId(collection) {
    const current = idCounters.get(collection) ?? 1;
    idCounters.set(collection, current + 1);
    return current;
  }

  function applyFields(record, fields) {
    if (!Array.isArray(fields) || fields.length === 0) return record;
    if (fields.includes('*')) return record;
    const out = {};
    for (const f of fields) out[f] = record?.[f];
    return out;
  }

  function matchesFilter(record, filter) {
    if (!filter || typeof filter !== 'object') return true;
    for (const [key, clause] of Object.entries(filter)) {
      const value = record?.[key];
      if (clause && typeof clause === 'object') {
        if (Object.prototype.hasOwnProperty.call(clause, '_eq')) {
          if (String(value) !== String(clause._eq)) return false;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(clause, '_in')) {
          const allowed = (clause._in ?? []).map((v) => String(v));
          if (!allowed.includes(String(value))) return false;
          continue;
        }
      }
      if (String(value) !== String(clause)) return false;
    }
    return true;
  }

  class FakeItemsService {
    constructor(collection) {
      this.collection = collection;
    }

    async readOne(id, options = {}) {
      const data = store[this.collection] ?? [];
      const found = data.find((r) => String(r.id) === String(id));
      if (!found) throw new Error(`Not found: ${this.collection}.${id}`);
      return applyFields(found, options.fields);
    }

    async readByQuery(query = {}) {
      const data = store[this.collection] ?? [];
      const filtered = data.filter((r) => matchesFilter(r, query.filter));
      const mapped = filtered.map((r) => applyFields(r, query.fields));
      return { data: mapped };
    }

    async createOne(payload) {
      const id = nextId(this.collection);
      store[this.collection].push({ id, ...payload });
      return id;
    }

    async updateOne(id, payload) {
      const data = store[this.collection] ?? [];
      const idx = data.findIndex((r) => String(r.id) === String(id));
      if (idx === -1) throw new Error(`Not found: ${this.collection}.${id}`);
      data[idx] = { ...data[idx], ...payload };
      return id;
    }
  }

  const services = { ItemsService: FakeItemsService };
  const database = { transaction: async (fn) => fn(database) };
  const schema = {};
  const accountability = {};

  return { services, database, schema, accountability, store };
}

test('sample intake preview resolves platform from project intake_platform', async () => {
  const h = makeHarness();

  const content = ['sample_ID\tgroup\tread_mode', 'S1\tA\tse'].join('\n');
  const preview = await previewSampleIntakeFromContent({
    services: h.services,
    database: h.database,
    schema: h.schema,
    accountability: h.accountability,
    studyId: 10,
    fileType: 'tsv',
    content,
    writeMode: 'upsert',
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.preview_rows.length, 1);
  assert.equal(preview.preview_rows[0].action, 'create');
  assert.equal(preview.preview_rows[0].assay_patch.platform, '1');
});

test('sample intake commit creates then upserts sample+assay', async () => {
  const h = makeHarness();
  const content = ['sample_ID\tgroup\tread_mode', 'S1\tA\tse'].join('\n');

  const first = await commitSampleIntakeFromContent({
    services: h.services,
    database: h.database,
    schema: h.schema,
    accountability: h.accountability,
    studyId: 10,
    fileType: 'tsv',
    content,
    writeMode: 'upsert',
  });

  assert.equal(first.ok, true);
  assert.equal(first.commit.created_samples, 1);
  assert.equal(first.commit.created_assays, 1);
  assert.equal(h.store.samples.length, 1);
  assert.equal(h.store.assays.length, 1);

  const second = await commitSampleIntakeFromContent({
    services: h.services,
    database: h.database,
    schema: h.schema,
    accountability: h.accountability,
    studyId: 10,
    fileType: 'tsv',
    content,
    writeMode: 'upsert',
  });

  assert.equal(second.ok, true);
  assert.equal(second.commit.updated_samples, 1);
  assert.equal(second.commit.updated_assays, 1);
});

