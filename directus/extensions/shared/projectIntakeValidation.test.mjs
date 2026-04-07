import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceClientOwnership, validateProjectIntake } from './projectIntakeValidation.mjs';

test('validateProjectIntake requires base fields', () => {
  const errors = validateProjectIntake({});
  const fields = new Set(errors.map((e) => e.field));
  for (const field of [
    'title',
    'pi_name',
    'researcher_name',
    'status',
    'intake_platform',
    'client_user',
  ]) {
    assert.equal(fields.has(field), true, `expected error for ${field}`);
  }
});

test('validateProjectIntake requires Biospyder fields for TempO-Seq', () => {
  const errors = validateProjectIntake({
    title: 't',
    pi_name: 'pi',
    researcher_name: 'r',
    status: 'draft',
    intake_platform: 'TempO-Seq',
    client_user: 'u',
  });
  const fields = new Set(errors.map((e) => e.field));
  assert.equal(fields.has('biospyder_manifest'), true);
  assert.equal(fields.has('biospyder_databases'), true);
});

test('validateProjectIntake requires description and bioinformatician for intake_ready', () => {
  const errors = validateProjectIntake({
    title: 't',
    pi_name: 'pi',
    researcher_name: 'r',
    status: 'intake_ready',
    intake_platform: 'RNA-Seq',
    client_user: 'u',
  });
  const fields = new Set(errors.map((e) => e.field));
  assert.equal(fields.has('bioinformatician_assigned'), true);
  assert.equal(fields.has('description'), true);
});

test('enforceClientOwnership sets client_user for non-admin users', () => {
  const enforced = enforceClientOwnership({
    input: { title: 't' },
    existing: null,
    accountability: { user: 'user-1', admin: false },
  });
  assert.equal(enforced.client_user, 'user-1');
});

test('enforceClientOwnership overwrites mismatched client_user for non-admin users', () => {
  const enforced = enforceClientOwnership({
    input: { client_user: 'user-2' },
    existing: null,
    accountability: { user: 'user-1', admin: false },
  });
  assert.equal(enforced.client_user, 'user-1');
});

