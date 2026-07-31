import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type StudyImportState = {
  id: number;
  status: string;
  project_id: number | null;
  title: string;
  description: string;
  species: string | null;
  celltype: string;
  study_name: string;
  source: string;
  study_type: string | null;
  in_vitro: boolean | null;
  platform_id: number | null;
  metadata_preview: {
    valid: boolean;
    issues: Array<{ row_index: number; column_key: string; message: string; severity: "error" | "warning" }>;
    normalized_rows: Array<Record<string, unknown>>;
    columns?: string[];
  };
  contrasts_preview: {
    valid: boolean;
    issues: Array<{ row_index: number; column_key: string; message: string; severity: "error" | "warning" }>;
    contrasts: Array<{ reference_group: string; comparison_group: string }>;
  };
  count_resource: {
    id: number;
    display_name: string;
    file_format: string;
    checksum: string;
    ext?: Record<string, unknown>;
  } | null;
};

export type CreateStudyImportPayload = {
  project_id: number;
  title: string;
  description?: string;
  species?: string | null;
  celltype?: string;
  study_name: string;
  source?: string;
  study_type: string;
  in_vitro?: boolean | null;
  platform_id: number;
};

type MetadataMapping = {
  source_column: string;
  target_field: string;
  transforms?: string[];
};

export async function createStudyImport(payload: CreateStudyImportPayload): Promise<StudyImportState> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create the study import draft."));
  }
  return response.json();
}

export async function fetchStudyImport(importId: number): Promise<StudyImportState> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/${importId}/`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load the study import draft."));
  }
  return response.json();
}

export async function previewStudyImportMetadata(
  importId: number,
  payload: { filename: string; content: string; mappings?: MetadataMapping[] },
) {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/${importId}/metadata-preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to preview the metadata import."));
  }
  return response.json();
}

export async function previewStudyImportContrasts(importId: number, payload: { filename: string; content: string }) {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/${importId}/contrasts-preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to preview the contrasts import."));
  }
  return response.json();
}

export async function registerStudyImportCountResource(
  importId: number,
  payload: { path: string; feature_id_kind?: string; annotation_source?: string; annotation_version?: string },
) {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/${importId}/count-resource/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to register the count data resource."));
  }
  return response.json();
}

export async function commitStudyImport(importId: number) {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/${importId}/commit/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to commit the study import."));
  }
  return response.json();
}

export type ArchiveManifestPreview = {
  study_key: string;
  outcome: "changes" | "no_changes";
  source_digest: string;
  curation_status: string;
  artifact_count: number;
  missing_artifacts: string[];
  warnings: string[];
  created: Record<string, string[]>;
  updated: Record<string, string[]>;
  stale: Record<string, string[]>;
};

export type ArchiveManifestApplyResult = {
  study_key: string;
  outcome: "completed" | "no_changes" | "failed";
  import_batch_id: number | null;
  created: number;
  updated: number;
  stale: Record<string, string[]>;
  warnings: string[];
};

export async function previewArchiveManifest(manifestPath: string): Promise<ArchiveManifestPreview> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/archive-preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_path: manifestPath }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to preview the archive manifest."));
  }
  return response.json();
}

export async function applyArchiveManifest(manifestPath: string): Promise<ArchiveManifestApplyResult> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/study-imports/archive-apply/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_path: manifestPath }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to apply the archive manifest."));
  }
  return response.json();
}
