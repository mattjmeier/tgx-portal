function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 _-]/g, '');
}

function pickWorkspace({ piName, env }) {
  const defaultWorkspace = env.PLANE_WORKSPACE_DEFAULT || null;
  const rawMap = env.PLANE_WORKSPACE_MAP_JSON || null;

  if (!rawMap) return defaultWorkspace || normalizeKey(piName).replace(/\s+/g, '-');

  try {
    const map = JSON.parse(rawMap);
    const key = normalizeKey(piName);
    if (map && typeof map === 'object' && map[key]) return map[key];
  } catch {
    // ignore bad env; fall back
  }

  return defaultWorkspace || normalizeKey(piName).replace(/\s+/g, '-');
}

function invalidPayload(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'invalid_payload';
  return err;
}

export default (router, { services, database, getSchema, env, logger }) => {
  const { ItemsService } = services;

  router.post('/sync', async (req, res, next) => {
    try {
      if (!req.accountability?.user) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }

      const { project_id: projectId, event } = req.body ?? {};
      if (!projectId) throw invalidPayload('project_id is required');
      if (!event) throw invalidPayload('event is required');

      const schema = await getSchema();
      const projects = new ItemsService('projects', {
        knex: database,
        schema,
        accountability: req.accountability,
      });

      const project = await projects.readOne(projectId, {
        fields: [
          '*',
          'bioinformatician_assigned.id',
          'bioinformatician_assigned.email',
        ],
      });

      if (event === 'intake_ready' && project.status !== 'intake_ready') {
        res.json({ ok: true, skipped: true, reason: 'project.status is not intake_ready' });
        return;
      }

      const webhookUrl = env.PLANE_WEBHOOK_URL || null;
      if (!webhookUrl) {
        await projects.updateOne(projectId, {
          plane_sync_status: 'failed',
          plane_last_error: 'PLANE_WEBHOOK_URL is not configured.',
        });
        res.status(501).json({ ok: false, error: 'PLANE_WEBHOOK_URL is not configured.' });
        return;
      }

      await projects.updateOne(projectId, { plane_sync_status: 'pending', plane_last_error: null });

      const workspace = pickWorkspace({ piName: project.pi_name, env });
      const payload = {
        event,
        workspace,
        issue: {
          title: project.title,
          description: project.description,
          assignee: project.bioinformatician_assigned?.email ?? null,
        },
        project: {
          id: project.id,
          title: project.title,
          pi_name: project.pi_name,
          researcher_name: project.researcher_name,
          status: project.status,
          intake_platform: project.intake_platform,
        },
        portal: {
          public_url: env.PUBLIC_URL || null,
        },
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      if (!response.ok) {
        await projects.updateOne(projectId, {
          plane_sync_status: 'failed',
          plane_last_error: `Plane webhook failed (${response.status}). ${responseText.slice(0, 2000)}`,
        });
        res.status(502).json({ ok: false, status: response.status, body: responseText });
        return;
      }

      let externalRef = null;
      try {
        const parsed = JSON.parse(responseText);
        externalRef = parsed?.id ?? parsed?.url ?? null;
      } catch {
        externalRef = responseText.slice(0, 255) || null;
      }

      await projects.updateOne(projectId, {
        plane_sync_status: 'success',
        plane_external_ref: externalRef,
        plane_last_error: null,
      });

      res.json({ ok: true, external_ref: externalRef });
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
