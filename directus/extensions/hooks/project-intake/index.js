import { defineHook } from '@directus/extensions-sdk';

import {
  enforceClientOwnership,
  validateProjectIntake,
} from '../../shared/projectIntakeValidation.mjs';

function formatErrors(errors) {
  return errors.map((e) => `${e.field}: ${e.message}`).join(' ');
}

export default defineHook(({ filter }, { services, exceptions, database, getSchema, logger }) => {
  const { ItemsService } = services;
  const { InvalidPayloadException } = exceptions;

  async function getProjectsService(accountability) {
    return new ItemsService('projects', {
      knex: database,
      schema: await getSchema(),
      accountability,
    });
  }

  filter('items.create', async (input, meta, context) => {
    if (meta?.collection !== 'projects') return input;

    const enforced = enforceClientOwnership({
      input,
      existing: null,
      accountability: context?.accountability,
    });

    const errors = validateProjectIntake(enforced);
    if (errors.length > 0) {
      throw new InvalidPayloadException(formatErrors(errors));
    }

    return enforced;
  });

  filter('items.update', async (input, meta, context) => {
    if (meta?.collection !== 'projects') return input;

    const keys = meta?.keys ?? [];
    if (!Array.isArray(keys) || keys.length !== 1) {
      // Avoid blocking batch operations unexpectedly; enforce/validate only in the single-item case.
      logger?.warn?.('[project-intake] Skipping validation for multi-key update.');
      return input;
    }

    const projects = await getProjectsService(context?.accountability);
    const existing = await projects.readOne(keys[0], {
      fields: ['*', 'biospyder_databases.*'],
    });

    const enforced = enforceClientOwnership({
      input,
      existing,
      accountability: context?.accountability,
    });

    const merged = { ...existing, ...enforced };
    const errors = validateProjectIntake(merged);
    if (errors.length > 0) {
      throw new InvalidPayloadException(formatErrors(errors));
    }

    return enforced;
  });
});

