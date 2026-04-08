const BASE_URL = (
  process.env.DIRECTUS_INTERNAL_URL ||
  process.env.DIRECTUS_URL ||
  process.env.DIRECTUS_PUBLIC_URL ||
  "http://127.0.0.1:8055"
).replace(/\/$/, "");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;
const PROJECT_TITLE = process.env.DIRECTUS_SAMPLE_PROJECT_TITLE || "Golden Sample Project";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ERROR: ADMIN_EMAIL/DIRECTUS_ADMIN_EMAIL and ADMIN_PASSWORD/DIRECTUS_ADMIN_PASSWORD must be set.");
  process.exit(1);
}

async function requestJson(method, path, { token = null, payload = undefined } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { status: res.status, body };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

async function login() {
  const result = await requestJson("POST", "/auth/login", {
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (result.status !== 200) fail(`Login failed: ${JSON.stringify(result.body)}`);
  return result.body.data.access_token;
}

async function main() {
  const token = await login();
  const headersToken = token;
  const filter = encodeURIComponent(JSON.stringify({ title: { _eq: PROJECT_TITLE } }));

  const matches = await requestJson(
    "GET",
    `/items/projects?limit=1&fields=id,title,workflow_export_status,workflow_export_last_generated_at,workflow_export_last_error_code,workflow_export_last_error_message,latest_workflow_export&filter=${filter}`,
    { token: headersToken }
  );
  if (matches.status !== 200) fail(`Project lookup failed: ${JSON.stringify(matches.body)}`);
  if (!(matches.body.data || []).length) {
    fail(`No project found for title '${PROJECT_TITLE}'. Load the seeded sample project first.`);
  }

  const project = matches.body.data[0];
  const projectId = project.id;

  const generated = await requestJson(
    "POST",
    `/workflow-export/projects/${projectId}/generate-config?include_content=true&store=true`,
    { token: headersToken, payload: {} }
  );
  if (generated.status !== 200) {
    fail(`Workflow export endpoint returned HTTP ${generated.status}: ${JSON.stringify(generated.body)}`);
  }
  if (!generated.body.ok) fail(`Workflow export endpoint returned ok=false: ${JSON.stringify(generated.body)}`);

  const artifacts = generated.body.artifacts || {};
  for (const name of ["config.yaml", "metadata.tsv", "contrasts.tsv"]) {
    if (!artifacts[name]) fail(`Missing artifact content for ${name}`);
  }

  const updated = await requestJson(
    "GET",
    `/items/projects/${projectId}?fields=id,title,workflow_export_status,workflow_export_last_generated_at,workflow_export_last_error_code,workflow_export_last_error_message,latest_workflow_export`,
    { token: headersToken }
  );
  if (updated.status !== 200) fail(`Project refresh failed: ${JSON.stringify(updated.body)}`);
  const updatedProject = updated.body.data || {};

  if (updatedProject.workflow_export_status !== "ready") {
    fail(`Expected workflow_export_status=ready, got ${JSON.stringify(updatedProject)}`);
  }
  if (!updatedProject.workflow_export_last_generated_at) {
    fail(`Expected workflow_export_last_generated_at to be set, got ${JSON.stringify(updatedProject)}`);
  }
  if (updatedProject.workflow_export_last_error_code !== null) {
    fail(`Expected workflow_export_last_error_code to be cleared, got ${JSON.stringify(updatedProject)}`);
  }
  if (!updatedProject.latest_workflow_export) {
    fail(`Expected latest_workflow_export to be set, got ${JSON.stringify(updatedProject)}`);
  }

  const exportId = generated.body.export_id || updatedProject.latest_workflow_export;
  const exportRow = await requestJson(
    "GET",
    `/items/workflow_exports/${exportId}?fields=id,project,status,schema_version,platform,genome_version,quantification_method,read_mode,created_at`,
    { token: headersToken }
  );
  if (exportRow.status !== 200) fail(`Workflow export row fetch failed: ${JSON.stringify(exportRow.body)}`);
  if ((exportRow.body.data || {}).status !== "ready") {
    fail(`Stored workflow export row is not ready: ${JSON.stringify(exportRow.body.data || {})}`);
  }

  console.log("Workflow export verification passed.");
  console.log(`Project: ${updatedProject.title} (${projectId})`);
  console.log(`Export row: ${exportRow.body.data.id}`);
  console.log(`Schema version: ${generated.body.schema_version}`);
  if ((generated.body.warnings || []).length > 0) {
    console.log(`Warnings: ${JSON.stringify(generated.body.warnings)}`);
  }
}

main().catch((error) => fail(error.message || error));
