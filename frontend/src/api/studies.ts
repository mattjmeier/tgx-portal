import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

export type Study = {
  id: number;
  project: number;
  species: "human" | "mouse" | "rat" | "hamster";
  celltype: string;
  treatment_var: string;
  batch_var: string;
};

export type CreateStudyPayload = Omit<Study, "id">;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchStudies(projectId: number): Promise<PaginatedResponse<Study>> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/?project_id=${projectId}`);
  if (!response.ok) {
    throw new Error("Failed to load studies.");
  }

  return response.json();
}

export async function createStudy(payload: CreateStudyPayload): Promise<Study> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create the study."));
  }

  return response.json();
}

export async function deleteStudy(studyId: number): Promise<void> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to delete the study."));
  }
}
