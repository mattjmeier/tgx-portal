import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

export type CountMatrixSummary = {
  id: number;
  resource_id: number;
  display_name: string;
  value_type: string;
  feature_id_kind: string;
  annotation_source: string;
  annotation_version: string;
  feature_count: number;
  matrix_column_count: number;
  validation_status: string;
  validation_errors: string[];
  compatibility_key: unknown[];
  browser_ready: boolean;
  resource_key?: string;
  checksum?: string;
  checksum_algorithm?: string;
  version?: string;
  availability_status?: string;
  size_bytes?: number | null;
  is_primary?: boolean;
  mapped_column_count?: number;
};

export type DataBrowserStudy = {
  id: number;
  study_id: number;
  study_name: string;
  title: string;
  collaboration: { id: number; title: string };
  species: string;
  cell_type: string;
  study_type: string;
  curation_status: string;
  lineage_status: string;
  sample_count: number;
  platform: { id: number; name: string; title: string; technology_type: string } | null;
  chemicals: Array<{ id: number; label: string; chemical_sample_id: string; dtxsid: string; casrn: string }>;
  primary_matrix: CountMatrixSummary | null;
  matrices?: CountMatrixSummary[];
  browser_ready: boolean;
};

export type FacetBucket = { value: string | number; label: string; count: number };
export type DataBrowserFacets = {
  facets: Record<string, FacetBucket[]>;
};

export type MatrixPreview = { columns: string[]; rows: string[][]; truncated: boolean };

export type DataExportSummary = {
  id: number;
  status: "queued" | "running" | "completed" | "failed" | "expired";
  matrix_ids: number[];
  feature_count: number | null;
  failure_detail: string;
  output_filename: string;
  output_size_bytes?: number | null;
  created_at: string;
  expires_at?: string | null;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function browserParams(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("page");
  return next.toString();
}

export async function fetchDataBrowserStudies(params: URLSearchParams, page = 1): Promise<PaginatedResponse<DataBrowserStudy>> {
  const next = new URLSearchParams(browserParams(params));
  next.set("page", String(page));
  next.set("page_size", "20");
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/data-browser/studies/?${next}`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to load data browser studies."));
  return response.json();
}

export async function fetchDataBrowserFacets(params: URLSearchParams): Promise<DataBrowserFacets> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/data-browser/facets/?${browserParams(params)}`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to load data browser filters."));
  return response.json();
}

export async function fetchDataBrowserStudy(studyDatasetId: number): Promise<DataBrowserStudy> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/data-browser/studies/${studyDatasetId}/`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to load dataset details."));
  return response.json();
}

export async function fetchMatrixPreview(matrixId: number): Promise<MatrixPreview> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/count-matrices/${matrixId}/preview/?features=20&samples=10`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to preview count matrix."));
  return response.json();
}

export async function createDataExport(matrixIds: number[], filters: Record<string, string[]>): Promise<DataExportSummary> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/data-exports/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matrix_ids: matrixIds, filters }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to create data export."));
  return response.json();
}

export async function fetchDataExport(exportId: number): Promise<DataExportSummary> {
  const response = await apiFetch(`${apiBaseUrl}/api/profiling/data-exports/${exportId}/`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "Failed to load export status."));
  return response.json();
}

export function dataExportDownloadUrl(exportId: number): string {
  return `${apiBaseUrl}/api/profiling/data-exports/${exportId}/download/`;
}
