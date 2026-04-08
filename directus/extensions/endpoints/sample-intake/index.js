import {
  commitSampleIntakeFromContent,
  previewSampleIntakeFromContent,
} from '../../shared/sampleIntakeDirectus.mjs';

function invalidPayload(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'invalid_payload';
  return err;
}

export default (router, { services, database, getSchema, logger }) => {
  const allowedWriteModes = new Set(['upsert', 'create_only']);

  router.post('/preview', async (req, res, next) => {
    try {
      const { study_id: studyId, file_type: fileType, content, write_mode: writeMode } = req.body ?? {};
      if (!studyId) throw invalidPayload('study_id is required');
      if (!fileType) throw invalidPayload('file_type is required');
      if (typeof content !== 'string') throw invalidPayload('content must be a string');
      if (writeMode && !allowedWriteModes.has(String(writeMode))) {
        throw invalidPayload("write_mode must be 'upsert' or 'create_only'");
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
      if (err?.code === 'invalid_payload') {
        res.status(err.status || 400).json({ ok: false, code: err.code, message: err.message });
        return;
      }
      logger?.error?.(err);
      next(err);
    }
  });

  router.post('/commit', async (req, res, next) => {
    try {
      const { study_id: studyId, file_type: fileType, content, write_mode: writeMode } = req.body ?? {};
      if (!studyId) throw invalidPayload('study_id is required');
      if (!fileType) throw invalidPayload('file_type is required');
      if (typeof content !== 'string') throw invalidPayload('content must be a string');
      if (writeMode && !allowedWriteModes.has(String(writeMode))) {
        throw invalidPayload("write_mode must be 'upsert' or 'create_only'");
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
      if (err?.code === 'invalid_payload') {
        res.status(err.status || 400).json({ ok: false, code: err.code, message: err.message });
        return;
      }
      logger?.error?.(err);
      next(err);
    }
  });
};
