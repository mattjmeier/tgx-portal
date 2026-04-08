const BASE_URL = (
  process.env.DIRECTUS_INTERNAL_URL ||
  process.env.DIRECTUS_URL ||
  process.env.DIRECTUS_PUBLIC_URL ||
  "http://127.0.0.1:8055"
).replace(/\/$/, "");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ERROR: ADMIN_EMAIL/DIRECTUS_ADMIN_EMAIL and ADMIN_PASSWORD/DIRECTUS_ADMIN_PASSWORD must be set.");
  process.exit(1);
}

const collectionCache = new Set();
const fieldCache = new Map();
const relationCache = new Set();

const LOOKUP_COLLECTIONS = [
  "platform_options",
  "genome_versions",
  "quantification_methods",
  "species_options",
  "biospyder_databases",
  "biospyder_manifests",
];

const REQUIRED_COLLECTIONS = [
  "projects",
  "studies",
  "samples",
  "assays",
  "sample_plating",
  "projects_biospyder_databases",
  "sample_intake_uploads",
  ...LOOKUP_COLLECTIONS,
];

const PROJECT_EXPORT_FIELDS = [
  "workflow_export_status",
  "workflow_export_last_generated_at",
  "workflow_export_last_error_code",
  "workflow_export_last_error_message",
  "latest_workflow_export",
];

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, compact(v)])
    );
  }
  return value;
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

  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function requestJsonFallback(method, paths, { token, payload } = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      return await requestJson(method, path, { token, payload });
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (message.includes(" 404 ") || message.includes(" 405 ")) continue;
      throw error;
    }
  }
  throw lastError || new Error(`${method} failed for all paths: ${paths.join(", ")}`);
}

async function login() {
  const result = await requestJson("POST", "/auth/login", {
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return result.data.access_token;
}

async function refreshCollections(token) {
  const result = await requestJson("GET", "/collections", { token });
  collectionCache.clear();
  for (const item of result.data || []) {
    if (item.collection) collectionCache.add(item.collection);
  }
}

async function refreshFields(token, collection) {
  const result = await requestJson("GET", `/fields/${collection}`, { token });
  fieldCache.set(
    collection,
    new Set((result.data || []).map((item) => item.field).filter(Boolean))
  );
}

async function refreshRelations(token) {
  const result = await requestJson("GET", "/relations", { token });
  relationCache.clear();
  for (const item of result.data || []) {
    if (item.collection && item.field) relationCache.add(`${item.collection}.${item.field}`);
  }
}

async function collectionExists(token, name) {
  if (collectionCache.size === 0) await refreshCollections(token);
  return collectionCache.has(name);
}

async function fieldExists(token, collection, field) {
  if (!fieldCache.has(collection)) await refreshFields(token, collection);
  return fieldCache.get(collection).has(field);
}

async function relationExists(token, collection, field) {
  if (relationCache.size === 0) await refreshRelations(token);
  return relationCache.has(`${collection}.${field}`);
}

async function createCollection(token, collection, meta) {
  if (await collectionExists(token, collection)) {
    console.log(`SKIP collection ${collection}`);
    return;
  }

  await requestJson("POST", "/collections", {
    token,
    payload: compact({
      collection,
      meta,
      schema: { name: collection },
    }),
  });
  collectionCache.add(collection);
  console.log(`CREATE collection ${collection}`);
}

async function patchCollectionMeta(token, collection, metaPatch) {
  try {
    await requestJson("PATCH", `/collections/${collection}`, {
      token,
      payload: { meta: metaPatch },
    });
    console.log(`PATCH collection meta ${collection}`);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("Invalid foreign key") && Object.hasOwn(metaPatch, "group")) {
      const fallback = { ...metaPatch };
      delete fallback.group;
      if (Object.keys(fallback).length > 0) {
        await requestJson("PATCH", `/collections/${collection}`, {
          token,
          payload: { meta: fallback },
        });
        console.log(`PATCH collection meta ${collection} (without group)`);
        return;
      }
    }
    throw error;
  }
}

async function createField(token, collection, field, fieldType, { meta = null, schema = null } = {}) {
  if (await fieldExists(token, collection, field)) {
    console.log(`SKIP field ${collection}.${field}`);
    return;
  }

  await requestJson("POST", `/fields/${collection}`, {
    token,
    payload: compact({
      field,
      type: fieldType,
      meta,
      schema,
    }),
  });
  if (!fieldCache.has(collection)) fieldCache.set(collection, new Set());
  fieldCache.get(collection).add(field);
  console.log(`CREATE field ${collection}.${field}`);
}

async function createRelation(
  token,
  { collection, field, related_collection, meta = null, schema = null }
) {
  if (await relationExists(token, collection, field)) {
    console.log(`SKIP relation ${collection}.${field} -> ${related_collection}`);
    return;
  }

  await requestJson("POST", "/relations", {
    token,
    payload: compact({
      collection,
      field,
      related_collection,
      meta,
      schema,
    }),
  });
  relationCache.add(`${collection}.${field}`);
  console.log(`CREATE relation ${collection}.${field} -> ${related_collection}`);
}

async function listSystemItems(token, name) {
  const result = await requestJsonFallback("GET", [`/${name}`, `/items/directus_${name}`], { token });
  return result.data || [];
}

async function createSystemItem(token, name, payload) {
  const result = await requestJsonFallback("POST", [`/${name}`, `/items/directus_${name}`], {
    token,
    payload,
  });
  return result.data || result || {};
}

async function patchSystemItem(token, name, itemId, payload) {
  const result = await requestJsonFallback(
    "PATCH",
    [`/${name}/${itemId}`, `/items/directus_${name}/${itemId}`],
    { token, payload }
  );
  return result.data || result || {};
}

async function ensureRole(token, { name, icon, description }) {
  const roles = await listSystemItems(token, "roles");
  const existing = roles.find((row) => row.name === name);
  const payload = { name, icon, description };

  if (!existing) {
    const created = await createSystemItem(token, "roles", payload);
    if (!created.id) throw new Error(`Role create did not return an id for ${name}`);
    console.log(`CREATE role ${name} (${created.id})`);
    return String(created.id);
  }

  const patch = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => existing[key] !== value)
  );
  if (Object.keys(patch).length > 0) {
    await patchSystemItem(token, "roles", existing.id, patch);
    console.log(`PATCH role ${name} (${existing.id})`);
  } else {
    console.log(`SKIP role ${name} (${existing.id})`);
  }
  return String(existing.id);
}

async function ensurePolicy(token, { name, icon, description, admin_access, app_access }) {
  const policies = await listSystemItems(token, "policies");
  const existing = policies.find((row) => row.name === name);
  const payload = { name, icon, description, admin_access, app_access, enforce_tfa: false };

  if (!existing) {
    const created = await createSystemItem(token, "policies", payload);
    if (!created.id) throw new Error(`Policy create did not return an id for ${name}`);
    console.log(`CREATE policy ${name} (${created.id})`);
    return String(created.id);
  }

  const patch = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => existing[key] !== value)
  );
  if (Object.keys(patch).length > 0) {
    await patchSystemItem(token, "policies", existing.id, patch);
    console.log(`PATCH policy ${name} (${existing.id})`);
  } else {
    console.log(`SKIP policy ${name} (${existing.id})`);
  }
  return String(existing.id);
}

async function attachPolicyToRole(token, roleId, policyId) {
  const rows = await listSystemItems(token, "access");
  const existing = rows.find(
    (row) => String(row.role) === String(roleId) && String(row.policy) === String(policyId)
  );
  if (existing) {
    console.log(`SKIP role-policy ${roleId} -> ${policyId}`);
    return;
  }

  await createSystemItem(token, "access", { role: roleId, policy: policyId });
  console.log(`CREATE role-policy ${roleId} -> ${policyId}`);
}

async function upsertPermission(token, existingIndex, payload) {
  const key = `${payload.policy}:${payload.collection}:${payload.action}`;
  const existing = existingIndex.get(key);
  if (!existing) {
    const created = await createSystemItem(token, "permissions", payload);
    existingIndex.set(key, created);
    console.log(`CREATE permission ${key}`);
    return;
  }

  const patch = {};
  for (const field of ["fields", "permissions", "validation"]) {
    if (JSON.stringify(existing[field] ?? null) !== JSON.stringify(payload[field] ?? null)) {
      patch[field] = payload[field] ?? null;
    }
  }
  if (Object.keys(patch).length > 0) {
    await patchSystemItem(token, "permissions", existing.id, patch);
    console.log(`PATCH permission ${key}`);
  } else {
    console.log(`SKIP permission ${key}`);
  }
}

async function upsertPreset(token, existingIndex, payload) {
  const key = `${payload.role}:${payload.collection}:${payload.bookmark}`;
  const existing = existingIndex.get(key);
  if (!existing) {
    const created = await createSystemItem(token, "presets", payload);
    existingIndex.set(key, created);
    console.log(`CREATE preset ${key}`);
    return;
  }

  const patch = {};
  for (const field of ["layout", "layout_query", "filter"]) {
    if (JSON.stringify(existing[field] ?? null) !== JSON.stringify(payload[field] ?? null)) {
      patch[field] = payload[field] ?? null;
    }
  }
  if (Object.keys(patch).length > 0) {
    await patchSystemItem(token, "presets", existing.id, patch);
    console.log(`PATCH preset ${key}`);
  } else {
    console.log(`SKIP preset ${key}`);
  }
}

async function readItems(token, collection, { filter = null, limit = -1, fields = null } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (fields?.length) params.set("fields", fields.join(","));
  if (filter) params.set("filter", JSON.stringify(filter));
  const result = await requestJson("GET", `/items/${collection}?${params.toString()}`, { token });
  return result.data || [];
}

async function createItem(token, collection, payload) {
  const result = await requestJson("POST", `/items/${collection}`, { token, payload });
  return result.data || {};
}

async function ensurePipelineDefaultsRow(token) {
  await requestJson("PATCH", "/items/pipeline_defaults", {
    token,
    payload: {
      qc_defaults: { min_counts: 10 },
      deseq2_defaults: { lfc_threshold: 1 },
    },
  });
  console.log("UPSERT pipeline_defaults singleton row");
}

async function main() {
  const token = await login();
  await refreshCollections(token);
  await refreshRelations(token);

  const missing = [];
  for (const name of REQUIRED_COLLECTIONS) {
    if (!(await collectionExists(token, name))) missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      "Missing required collections (run STORY-001/002/003 bootstrap first): " + missing.join(", ")
    );
  }

  await createCollection(token, "workflow_exports", {
    icon: "output",
    note: "Generated Snakemake config artifacts for a project.",
    display_template: "{{status}} {{platform}}",
    accountability: "all",
    sort: 70,
    hidden: false,
    singleton: false,
  });
  await createCollection(token, "pipeline_defaults", {
    icon: "tune",
    note: "Global QC/DESeq2 defaults used during workflow export generation.",
    display_template: "Pipeline Defaults",
    accountability: "all",
    sort: 80,
    hidden: false,
    singleton: true,
  });

  await patchCollectionMeta(token, "workflow_exports", { accountability: "all" });
  await patchCollectionMeta(token, "pipeline_defaults", { accountability: "all" });

  await createField(token, "projects", "workflow_export_status", "string", {
    meta: { interface: "select-dropdown", required: false, readonly: true },
    schema: { is_nullable: true, max_length: 50 },
  });
  await createField(token, "projects", "workflow_export_last_generated_at", "timestamp", {
    meta: { interface: "datetime", readonly: true },
    schema: { is_nullable: true },
  });
  await createField(token, "projects", "workflow_export_last_error_code", "string", {
    meta: { interface: "input", readonly: true },
    schema: { is_nullable: true, max_length: 100 },
  });
  await createField(token, "projects", "workflow_export_last_error_message", "text", {
    meta: { interface: "input-multiline", readonly: true },
    schema: { is_nullable: true },
  });
  await createField(token, "projects", "latest_workflow_export", "integer", {
    meta: {
      interface: "select-dropdown-m2o",
      required: false,
      readonly: true,
      special: ["m2o"],
    },
    schema: { is_nullable: true },
  });

  await createField(token, "genome_versions", "genomedir", "string", {
    meta: { interface: "input", required: false },
    schema: { is_nullable: true, max_length: 255 },
  });
  await createField(token, "genome_versions", "genome_filename", "string", {
    meta: { interface: "input", required: false },
    schema: { is_nullable: true, max_length: 255 },
  });
  await createField(token, "genome_versions", "annotation_filename", "string", {
    meta: { interface: "input", required: false },
    schema: { is_nullable: true, max_length: 255 },
  });
  await createField(token, "genome_versions", "genome_name", "string", {
    meta: { interface: "input", required: false },
    schema: { is_nullable: true, max_length: 255 },
  });

  await createField(token, "workflow_exports", "project", "integer", {
    meta: { interface: "select-dropdown-m2o", required: true, special: ["m2o"] },
    schema: { is_nullable: false },
  });
  await createField(token, "workflow_exports", "status", "string", {
    meta: { interface: "select-dropdown", required: true },
    schema: { is_nullable: false, max_length: 20, default_value: "ready" },
  });
  await createField(token, "workflow_exports", "schema_version", "string", {
    meta: { interface: "input", required: true, readonly: true },
    schema: { is_nullable: false, max_length: 32 },
  });
  await createField(token, "workflow_exports", "platform", "string", {
    meta: { interface: "input", required: true, readonly: true },
    schema: { is_nullable: false, max_length: 64 },
  });
  await createField(token, "workflow_exports", "genome_version", "string", {
    meta: { interface: "input", readonly: true },
    schema: { is_nullable: true, max_length: 64 },
  });
  await createField(token, "workflow_exports", "quantification_method", "string", {
    meta: { interface: "input", readonly: true },
    schema: { is_nullable: true, max_length: 64 },
  });
  await createField(token, "workflow_exports", "read_mode", "string", {
    meta: { interface: "input", readonly: true },
    schema: { is_nullable: true, max_length: 10 },
  });
  await createField(token, "workflow_exports", "config_yaml", "text", {
    meta: { interface: "input-multiline", required: true, readonly: true },
    schema: { is_nullable: false },
  });
  await createField(token, "workflow_exports", "metadata_tsv", "text", {
    meta: { interface: "input-multiline", required: true, readonly: true },
    schema: { is_nullable: false },
  });
  await createField(token, "workflow_exports", "contrasts_tsv", "text", {
    meta: { interface: "input-multiline", required: true, readonly: true },
    schema: { is_nullable: false },
  });
  await createField(token, "workflow_exports", "warnings", "json", {
    meta: {
      interface: "input-code",
      required: false,
      readonly: true,
      options: { language: "json" },
    },
    schema: { is_nullable: true },
  });
  await createField(token, "workflow_exports", "created_at", "timestamp", {
    meta: { special: ["date-created"], readonly: true, interface: "datetime" },
    schema: { is_nullable: false },
  });

  await createField(token, "pipeline_defaults", "qc_defaults", "json", {
    meta: { interface: "input-code", required: false, options: { language: "json" } },
    schema: { is_nullable: true },
  });
  await createField(token, "pipeline_defaults", "deseq2_defaults", "json", {
    meta: { interface: "input-code", required: false, options: { language: "json" } },
    schema: { is_nullable: true },
  });

  await createRelation(token, {
    collection: "workflow_exports",
    field: "project",
    related_collection: "projects",
    meta: {
      many_collection: "workflow_exports",
      many_field: "project",
      one_collection: "projects",
      one_field: "workflow_exports",
    },
    schema: {
      table: "workflow_exports",
      column: "project",
      foreign_key_table: "projects",
      foreign_key_column: "id",
      on_delete: "CASCADE",
    },
  });
  await createRelation(token, {
    collection: "projects",
    field: "latest_workflow_export",
    related_collection: "workflow_exports",
    meta: {
      many_collection: "projects",
      many_field: "latest_workflow_export",
      one_collection: "workflow_exports",
      one_field: "latest_for_projects",
    },
    schema: {
      table: "projects",
      column: "latest_workflow_export",
      foreign_key_table: "workflow_exports",
      foreign_key_column: "id",
      on_delete: "SET NULL",
    },
  });

  await ensurePipelineDefaultsRow(token);

  const adminRole = await ensureRole(token, {
    name: "Admin",
    icon: "admin_panel_settings",
    description: "Full access for administrators and bioinformatics staff.",
  });
  const clientRole = await ensureRole(token, {
    name: "Client",
    icon: "account_circle",
    description: "Collaborator/client role scoped to assigned projects only.",
  });
  const systemRole = await ensureRole(token, {
    name: "System",
    icon: "smart_toy",
    description: "Least-privilege automation/integration role for flows/endpoints.",
  });

  const adminPolicy = await ensurePolicy(token, {
    name: "Admin",
    icon: "admin_panel_settings",
    description: "Full access for administrators and bioinformatics staff.",
    admin_access: true,
    app_access: true,
  });
  const clientPolicy = await ensurePolicy(token, {
    name: "Client",
    icon: "account_circle",
    description: "Collaborator/client role scoped to assigned projects only.",
    admin_access: false,
    app_access: true,
  });
  const systemPolicy = await ensurePolicy(token, {
    name: "System",
    icon: "smart_toy",
    description: "Least-privilege automation/integration role for flows/endpoints.",
    admin_access: false,
    app_access: false,
  });

  await attachPolicyToRole(token, adminRole, adminPolicy);
  await attachPolicyToRole(token, clientRole, clientPolicy);
  await attachPolicyToRole(token, systemRole, systemPolicy);

  const permissions = await listSystemItems(token, "permissions");
  const permissionIndex = new Map();
  for (const row of permissions) {
    if (row.policy && row.collection && row.action) {
      permissionIndex.set(`${row.policy}:${row.collection}:${row.action}`, row);
    }
  }

  for (const collection of ["workflow_exports", "pipeline_defaults"]) {
    for (const action of ["create", "read", "update", "delete"]) {
      await upsertPermission(token, permissionIndex, {
        policy: adminPolicy,
        collection,
        action,
        fields: ["*"],
        permissions: {},
      });
    }
  }

  await upsertPermission(token, permissionIndex, {
    policy: systemPolicy,
    collection: "projects",
    action: "update",
    fields: [
      "plane_sync_status",
      "plane_last_error",
      "plane_external_ref",
      ...PROJECT_EXPORT_FIELDS,
    ],
    permissions: {},
  });
  await upsertPermission(token, permissionIndex, {
    policy: systemPolicy,
    collection: "workflow_exports",
    action: "create",
    fields: ["*"],
    permissions: {},
  });
  await upsertPermission(token, permissionIndex, {
    policy: systemPolicy,
    collection: "workflow_exports",
    action: "read",
    fields: ["*"],
    permissions: {},
  });
  await upsertPermission(token, permissionIndex, {
    policy: systemPolicy,
    collection: "pipeline_defaults",
    action: "read",
    fields: ["*"],
    permissions: {},
  });

  const presets = await listSystemItems(token, "presets");
  const presetIndex = new Map();
  for (const row of presets) {
    if (row.role && row.collection && row.bookmark) {
      presetIndex.set(`${row.role}:${row.collection}:${row.bookmark}`, row);
    }
  }

  await upsertPreset(token, presetIndex, {
    role: adminRole,
    collection: "workflow_exports",
    bookmark: "Workflow Exports",
    layout: "tabular",
    layout_query: { sort: ["-created_at"] },
  });
  await upsertPreset(token, presetIndex, {
    role: adminRole,
    collection: "pipeline_defaults",
    bookmark: "Pipeline Defaults",
    layout: "raw",
  });

  console.log("");
  console.log("Bootstrap complete.");
  console.log("Next steps:");
  console.log("1. Reload the seeded project if needed.");
  console.log("2. Verify export generation live.");
  console.log("3. Export a real Directus snapshot after validation.");
}

main().catch((error) => {
  console.error(`ERROR: ${error.message || error}`);
  process.exit(1);
});
