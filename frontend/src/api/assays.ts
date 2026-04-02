import { apiFetch, parseErrorMessage } from "./http";
import type { PaginatedResponse } from "./projects";

export type Assay = {
  id: number;
  sample: number;
  platform: "tempo_seq" | "rna_seq";
  genome_version: string;
  quantification_method: string;
};

export type CreateAssayPayload = Omit<Assay, "id">;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchAssays(studyId: number): Promise<PaginatedResponse<Assay>> {
  const response = await apiFetch(`${apiBaseUrl}/api/assays/?study_id=${studyId}`);
  if (!response.ok) {
    throw new Error("Failed to load assays.");
  }

  return response.json();
}

export async function createAssay(payload: CreateAssayPayload): Promise<Assay> {
  const response = await apiFetch(`${apiBaseUrl}/api/assays/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create the assay."));
  }

  return response.json();
}

export async function deleteAssay(assayId: number): Promise<void> {
  const response = await apiFetch(`${apiBaseUrl}/api/assays/${assayId}/`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to delete the assay."));
  }
}
