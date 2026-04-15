import { apiFetch, parseErrorMessage } from "./http";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  row_index: number;
  column_key: string;
  message: string;
  severity: ValidationSeverity;
};

export type ValidateMetadataUploadPayload = {
  study_id: number;
  expected_columns?: string[];
  rows: Array<Record<string, unknown>>;
};

export type ValidateMetadataUploadResponse = {
  valid: boolean;
  issues: ValidationIssue[];
  columns: string[];
  validated_rows: Array<Record<string, unknown>>;
  suggested_contrasts: Array<{
    reference_group: string;
    comparison_group: string;
  }>;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function validateMetadataUpload(
  payload: ValidateMetadataUploadPayload,
): Promise<ValidateMetadataUploadResponse> {
  const response = await apiFetch(`${apiBaseUrl}/api/metadata-validation/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to validate metadata upload."));
  }

  return response.json();
}
