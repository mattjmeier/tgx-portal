import { apiFetch, parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type MetadataTemplatePreviewRequest = {
  study_id: number;
  optional_field_keys: string[];
  custom_field_keys: string[];
};

export type MetadataTemplatePreviewResponse = {
  columns: string[];
  auto_included: Array<{ key: string; reason: string }>;
  deprecated_fields: string[];
  project_code: string;
  filename: string;
};

export async function previewMetadataTemplate(
  payload: MetadataTemplatePreviewRequest,
): Promise<MetadataTemplatePreviewResponse> {
  const response = await apiFetch(`${apiBaseUrl}/api/metadata-templates/preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to preview the template."));
  }

  return response.json();
}

function parseAttachmentFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = /filename="(?<filename>[^"]+)"/i.exec(contentDisposition);
  return match?.groups?.filename ?? null;
}

export async function downloadMetadataTemplate(
  payload: MetadataTemplatePreviewRequest,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await apiFetch(`${apiBaseUrl}/api/metadata-templates/download/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to download the template."));
  }

  const blob = await response.blob();
  const filename = parseAttachmentFilename(response.headers.get("content-disposition"));
  return { blob, filename };
}
