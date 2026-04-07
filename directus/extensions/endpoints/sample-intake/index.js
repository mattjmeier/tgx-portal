import { defineEndpoint } from '@directus/extensions-sdk';

import {
  commitSampleIntakeFromContent,
  previewSampleIntakeFromContent,
} from '../../shared/sampleIntakeDirectus.mjs';

export default defineEndpoint((router, { services, exceptions, database, getSchema, logger }) => {
  const { InvalidPayloadException } = exceptions;
  const allowedWriteModes = new Set(['upsert', 'create_only']);

  router.post('/preview', async (req, res, next) => {
    try {
      const { study_id: studyId, file_type: fileType, content, write_mode: writeMode } = req.body ?? {};
      if (!studyId) throw new InvalidPayloadException('study_id is required');
      if (!fileType) throw new InvalidPayloadException('file_type is required');
      if (typeof content !== 'string') throw new InvalidPayloadException('content must be a string');
      if (writeMode && !allowedWriteModes.has(String(writeMode))) {
        throw new InvalidPayloadException("write_mode must be 'upsert' or 'create_only'");
      }

      const schema = await getSchema();
      const preview = await previewSampleIntakeFromContent({
        services,
        database,
        schema,
        accountability: req.accountability,
        studyId,
        fileType,
        content,
        writeMode,
      });

      res.json(preview);
    } catch (err) {
      logger?.error?.(err);
      next(err);
    }
  });

  router.post('/commit', async (req, res, next) => {
    try {
      const { study_id: studyId, file_type: fileType, content, write_mode: writeMode } = req.body ?? {};
      if (!studyId) throw new InvalidPayloadException('study_id is required');
      if (!fileType) throw new InvalidPayloadException('file_type is required');
      if (typeof content !== 'string') throw new InvalidPayloadException('content must be a string');
      if (writeMode && !allowedWriteModes.has(String(writeMode))) {
        throw new InvalidPayloadException("write_mode must be 'upsert' or 'create_only'");
      }

      const schema = await getSchema();
      const result = await commitSampleIntakeFromContent({
        services,
        database,
        schema,
        accountability: req.accountability,
        studyId,
        fileType,
        content,
        writeMode,
      });

      if (!result.ok) {
        res.status(422).json({ ok: false, errors: result.errors, summary: result.summary, warnings: result.warnings });
        return;
      }

      res.json({ ok: true, summary: result.summary, commit: result.commit, warnings: result.warnings });
    } catch (err) {
      logger?.error?.(err);
      next(err);
    }
  });
});
