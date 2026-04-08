import { WorkflowExportError, generateWorkflowExportArtifacts } from '../../shared/workflowExport.mjs';

function invalidPayload(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'invalid_payload';
  return err;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'y') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'n') return false;
  return fallback;
}

async function readAll({ service, query }) {
  const res = await service.readByQuery({ ...query, limit: -1 });
  return res?.data ?? res ?? [];
}

async function readSingleton({ service, fields }) {
  const res = await service.readByQuery({ limit: 1, fields });
  const rows = res?.data ?? res ?? [];
  return rows[0] ?? null;
}

async function updateProjectExportState(database, projectId, payload) {
  await database('projects').where({ id: projectId }).update(payload);
}

function lookupMap(rows, keys = ['id', 'code', 'name']) {
  const map = new Map();
  for (const row of rows ?? []) {
    for (const key of keys) {
      const value = row?.[key];
      if (value === null || value === undefined || String(value) === '') continue;
      map.set(String(value), row);
    }
  }
  return map;
}

function resolveLookupValue(raw, map) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  return map.get(String(raw)) ?? { id: raw, code: raw, name: String(raw) };
}

export default (router, { services, database, getSchema, logger }) => {
  const { ItemsService } = services;

  async function handleGenerate(req, res, next, projectIdFromArg) {
    try {
      if (!req.accountability?.user) {
        res.status(401).json({ ok: false, code: 'auth_required', message: 'Authentication required' });
        return;
      }

      const projectId = projectIdFromArg ?? req.body?.project_id ?? null;
      if (!projectId) throw invalidPayload('project_id is required');

      const includeContent =
        parseBoolean(req.query?.include_content, parseBoolean(req.body?.include_content, true));
      const store = parseBoolean(req.query?.store, parseBoolean(req.body?.store, true));

      const schema = await getSchema();
      const opts = { knex: database, schema, accountability: req.accountability };

      const projects = new ItemsService('projects', opts);
      const studiesSvc = new ItemsService('studies', opts);
      const samplesSvc = new ItemsService('samples', opts);
      const assaysSvc = new ItemsService('assays', opts);
      const projectBiospyderDatabasesSvc = new ItemsService('projects_biospyder_databases', opts);
      const platformOptionsSvc = new ItemsService('platform_options', opts);
      const genomeVersionsSvc = new ItemsService('genome_versions', opts);
      const quantMethodsSvc = new ItemsService('quantification_methods', opts);

      const project = await projects.readOne(projectId, {
        fields: [
          'id',
          'title',
          'researcher_name',
          'intake_platform',
          'bioinformatician_assigned.id',
          'bioinformatician_assigned.first_name',
          'bioinformatician_assigned.last_name',
          'bioinformatician_assigned.email',
          'biospyder_manifest.id',
          'biospyder_manifest.name',
          'biospyder_manifest.code',
        ],
      });

      const projectBiospyderDatabases = await readAll({
        service: projectBiospyderDatabasesSvc,
        query: {
          filter: { projects_id: { _eq: projectId } },
          fields: [
            'biospyder_databases_id.id',
            'biospyder_databases_id.name',
            'biospyder_databases_id.code',
          ],
          sort: ['biospyder_databases_id'],
        },
      });

      const studies = await readAll({
        service: studiesSvc,
        query: {
          filter: { project: { _eq: projectId } },
          fields: ['id', 'species', 'celltype', 'treatment_var', 'batch_var', 'units'],
          sort: ['id'],
        },
      });

      const studyIds = studies.map((s) => s.id).filter(Boolean);
      const samples = await readAll({
        service: samplesSvc,
        query: {
          filter: { study: { _in: studyIds.length > 0 ? studyIds : ['00000000-0000-0000-0000-000000000000'] } },
          fields: [
            'id',
            'study',
            'sample_ID',
            'sample_name',
            'description',
            'group',
            'chemical',
            'chemical_longname',
            'dose',
          ],
          sort: ['sample_ID'],
        },
      });

      const sampleIds = samples.map((s) => s.id).filter(Boolean);
      const assays = await readAll({
        service: assaysSvc,
        query: {
          filter: { sample: { _in: sampleIds.length > 0 ? sampleIds : ['00000000-0000-0000-0000-000000000000'] } },
          fields: [
            'id',
            'sample',
            'platform',
            'genome_version',
            'quantification_method',
            'read_mode',
          ],
          sort: ['id'],
        },
      });

      const [platformOptions, genomeVersions, quantificationMethods] = await Promise.all([
        readAll({
          service: platformOptionsSvc,
          query: { fields: ['id', 'name', 'code'], sort: ['id'] },
        }),
        readAll({
          service: genomeVersionsSvc,
          query: {
            fields: ['id', 'name', 'code', 'genomedir', 'genome_filename', 'annotation_filename', 'genome_name'],
            sort: ['id'],
          },
        }),
        readAll({
          service: quantMethodsSvc,
          query: { fields: ['id', 'name', 'code'], sort: ['id'] },
        }),
      ]);

      const platformMap = lookupMap(platformOptions);
      const genomeVersionMap = lookupMap(genomeVersions);
      const quantMethodMap = lookupMap(quantificationMethods);

      const enrichedAssays = assays.map((assay) => ({
        ...assay,
        platform: resolveLookupValue(assay?.platform, platformMap),
        genome_version: resolveLookupValue(assay?.genome_version, genomeVersionMap),
        quantification_method: resolveLookupValue(assay?.quantification_method, quantMethodMap),
      }));

      const pipelineDefaultsSvc = new ItemsService('pipeline_defaults', opts);
      const defaults = await readSingleton({
        service: pipelineDefaultsSvc,
        fields: ['qc_defaults', 'deseq2_defaults'],
      });

      const generation = generateWorkflowExportArtifacts({
        project: {
          ...project,
          biospyder_databases: projectBiospyderDatabases,
        },
        studies,
        samples,
        assays: enrichedAssays,
        defaults,
      });

      let exportRow = null;
      if (store) {
        const exportsSvc = new ItemsService('workflow_exports', opts);
        exportRow = await exportsSvc.createOne({
          project: projectId,
          status: 'ready',
          schema_version: generation.schema_version,
          platform: generation.platform,
          genome_version: generation.genome_version,
          quantification_method: generation.quantification_method,
          read_mode: generation.read_mode,
          config_yaml: generation.artifacts['config.yaml'],
          metadata_tsv: generation.artifacts['metadata.tsv'],
          contrasts_tsv: generation.artifacts['contrasts.tsv'],
          warnings: generation.warnings,
        });

        await updateProjectExportState(database, projectId, {
          workflow_export_status: 'ready',
          workflow_export_last_generated_at: new Date().toISOString(),
          latest_workflow_export: exportRow,
          workflow_export_last_error_code: null,
          workflow_export_last_error_message: null,
        });
      }

      const response = {
        ok: true,
        project_id: projectId,
        status: 'ready',
        export_id: exportRow,
        schema_version: generation.schema_version,
        artifacts: includeContent
          ? {
              'config.yaml': generation.artifacts['config.yaml'],
              'metadata.tsv': generation.artifacts['metadata.tsv'],
              'contrasts.tsv': generation.artifacts['contrasts.tsv'],
            }
          : { names: Object.keys(generation.artifacts) },
        warnings: generation.warnings,
      };

      res.json(response);
    } catch (err) {
      if (err instanceof WorkflowExportError) {
        try {
          const projectId = projectIdFromArg ?? req.body?.project_id ?? null;
          if (projectId) {
            await updateProjectExportState(database, projectId, {
              workflow_export_status: 'failed',
              workflow_export_last_error_code: err.code,
              workflow_export_last_error_message: err.message,
            });
          }
        } catch (updateErr) {
          logger?.error?.(updateErr);
        }

        res.status(err.status || 422).json({
          ok: false,
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        });
        return;
      }
      if (err?.code === 'invalid_payload') {
        res.status(err.status || 400).json({
          ok: false,
          code: err.code,
          message: err.message,
          details: null,
        });
        return;
      }
      logger?.error?.(err);
      next(err);
    }
  }

  router.post('/generate', async (req, res, next) => handleGenerate(req, res, next, null));
  router.post('/projects/:projectId/generate-config', async (req, res, next) =>
    handleGenerate(req, res, next, req.params?.projectId ?? null)
  );
};
