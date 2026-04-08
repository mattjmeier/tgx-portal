import {
  commitSampleIntakeFromContent,
  previewSampleIntakeFromContent,
  resolveSampleIntakeContent,
} from '../../shared/sampleIntakeDirectus.mjs';

function nowIso() {
  return new Date().toISOString();
}

function buildValidationFields(preview) {
  const total = preview?.summary?.total_rows ?? 0;
  const valid = preview?.summary?.valid_rows ?? 0;
  const invalid = preview?.summary?.invalid_rows ?? 0;
  return {
    row_count: total,
    valid_row_count: valid,
    invalid_row_count: invalid,
    preview_rows: preview?.preview_rows ?? [],
    validation_errors: preview?.errors ?? [],
    validation_summary: preview?.summary ?? null,
    validated_hash: preview?.content_hash ?? null,
    validated_at: nowIso(),
    status: preview?.ok ? 'validated' : 'invalid',
  };
}

function invalidPayload(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'invalid_payload';
  return err;
}

export default ({ filter }, { services, database, getSchema, env, logger }) => {
  const { ItemsService } = services;
  const allowedWriteModes = new Set(['upsert', 'create_only']);

  async function getUploadsService(accountability) {
    return new ItemsService('sample_intake_uploads', {
      knex: database,
      schema: await getSchema(),
      accountability,
    });
  }

  filter('items.create', async (input, meta, context) => {
    if (meta?.collection !== 'sample_intake_uploads') return input;

    const studyId = input?.study ?? null;
    if (!studyId) throw invalidPayload('study is required');

    const writeMode = String(input?.write_mode ?? 'upsert');
    if (writeMode && !allowedWriteModes.has(writeMode)) {
      return {
        ...input,
        status: 'invalid',
        validation_errors: [
          {
            row: 1,
            field: 'write_mode',
            code: 'invalid_write_mode',
            message: "write_mode must be 'upsert' or 'create_only'",
          },
        ],
        validation_summary: { total_rows: 0, valid_rows: 0, invalid_rows: 0, creates: 0, updates: 0 },
        preview_rows: [],
        row_count: 0,
        valid_row_count: 0,
        invalid_row_count: 0,
        validated_hash: null,
        validated_at: nowIso(),
        validate_requested: false,
        commit_requested: false,
      };
    }

    const schema = await getSchema();
    const resolved = await resolveSampleIntakeContent({
      input,
      existing: null,
      env,
      services,
      database,
      schema,
      accountability: context?.accountability,
    });

    if (!resolved.ok) {
      return {
        ...input,
        status: 'invalid',
        validation_errors: resolved.errors ?? [],
        validation_summary: { total_rows: 0, valid_rows: 0, invalid_rows: 0, creates: 0, updates: 0 },
        preview_rows: [],
        row_count: 0,
        valid_row_count: 0,
        invalid_row_count: 0,
        validated_hash: null,
        validated_at: nowIso(),
        validate_requested: false,
        commit_requested: false,
      };
    }

    const preview = await previewSampleIntakeFromContent({
      services,
      database,
      schema,
      accountability: context?.accountability,
      studyId,
      fileType: resolved.file_type ?? input?.file_type,
      content: resolved.content,
      writeMode,
    });

    return {
      ...input,
      ...buildValidationFields(preview),
      validate_requested: false,
      commit_requested: false,
    };
  });

  filter('items.update', async (input, meta, context) => {
    if (meta?.collection !== 'sample_intake_uploads') return input;

    const keys = meta?.keys ?? [];
    if (!Array.isArray(keys) || keys.length !== 1) {
      logger?.warn?.('[sample-intake] Skipping validation for multi-key update.');
      return input;
    }

    const uploads = await getUploadsService(context?.accountability);
    const existing = await uploads.readOne(keys[0], {
      fields: [
        '*',
      ],
    });

    const merged = { ...existing, ...input };
    const studyId = merged?.study ?? null;
    if (!studyId) throw invalidPayload('study is required');

    const writeMode = String(merged?.write_mode ?? 'upsert');
    if (writeMode && !allowedWriteModes.has(writeMode)) {
      return {
        ...input,
        status: 'invalid',
        validation_errors: [
          {
            row: 1,
            field: 'write_mode',
            code: 'invalid_write_mode',
            message: "write_mode must be 'upsert' or 'create_only'",
          },
        ],
        validation_summary: { total_rows: 0, valid_rows: 0, invalid_rows: 0, creates: 0, updates: 0 },
        preview_rows: [],
        row_count: 0,
        valid_row_count: 0,
        invalid_row_count: 0,
        validated_hash: null,
        validated_at: nowIso(),
        commit_result: null,
        committed_at: null,
        validate_requested: false,
        commit_requested: false,
      };
    }

    const isCommit = input?.commit_requested === true;
    const needsValidate =
      input?.validate_requested === true ||
      Object.prototype.hasOwnProperty.call(input ?? {}, 'source_text') ||
      Object.prototype.hasOwnProperty.call(input ?? {}, 'source_file') ||
      Object.prototype.hasOwnProperty.call(input ?? {}, 'file_type') ||
      Object.prototype.hasOwnProperty.call(input ?? {}, 'source_type');

    if (!isCommit && !needsValidate) return input;

    const schema = await getSchema();
    const resolved = await resolveSampleIntakeContent({
      input,
      existing,
      env,
      services,
      database,
      schema,
      accountability: context?.accountability,
    });

    if (!resolved.ok) {
      return {
        ...input,
        status: 'invalid',
        validation_errors: resolved.errors ?? [],
        validation_summary: { total_rows: 0, valid_rows: 0, invalid_rows: 0, creates: 0, updates: 0 },
        preview_rows: [],
        row_count: 0,
        valid_row_count: 0,
        invalid_row_count: 0,
        validated_hash: null,
        validated_at: nowIso(),
        validate_requested: false,
        commit_requested: false,
      };
    }

    if (isCommit) {
      const result = await commitSampleIntakeFromContent({
        services,
        database,
        schema,
        accountability: context?.accountability,
        studyId,
        fileType: resolved.file_type ?? merged?.file_type,
        content: resolved.content,
        writeMode,
      });

      if (!result.ok) {
        const preview = await previewSampleIntakeFromContent({
          services,
          database,
          schema,
          accountability: context?.accountability,
          studyId,
          fileType: resolved.file_type ?? merged?.file_type,
          content: resolved.content,
          writeMode,
        });

        return {
          ...input,
          ...buildValidationFields(preview),
          status: 'commit_failed',
          commit_result: {
            ok: false,
            errors: result.errors ?? [],
            summary: result.summary ?? null,
            warnings: result.warnings ?? [],
          },
          committed_at: null,
          validate_requested: false,
          commit_requested: false,
        };
      }

      return {
        ...input,
        status: 'committed',
        commit_result: { ok: true, ...result.commit },
        committed_at: nowIso(),
        validate_requested: false,
        commit_requested: false,
      };
    }

    const preview = await previewSampleIntakeFromContent({
      services,
      database,
      schema,
      accountability: context?.accountability,
      studyId,
      fileType: resolved.file_type ?? merged?.file_type,
      content: resolved.content,
      writeMode,
    });

    return {
      ...input,
      ...buildValidationFields(preview),
      validate_requested: false,
      commit_requested: false,
    };
  });
};
