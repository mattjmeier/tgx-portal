import type { PaginatedResponse } from "./projects";
import { apiFetch, parseErrorMessage } from "./http";

export type Study = {
  id: number;
  project: number;
  project_title: string;
  title: string;
  description: string;
  status: "draft" | "active";
  species: "human" | "mouse" | "rat" | "hamster" | null;
  celltype: string | null;
  treatment_var: string | null;
  batch_var: string | null;
  sample_count?: number;
  assay_count?: number;
};

export type CreateStudyPayload = {
  project: number;
  title: string;
};

export type UpdateStudyPayload = Partial<Pick<Study, "title" | "description" | "species" | "celltype" | "treatment_var" | "batch_var">>;

export type FetchStudiesIndexOptions = {
  page?: number;
  pageSize?: number;
  ordering?: string;
  search?: string;
  projectId?: number;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchStudies(projectId: number): Promise<PaginatedResponse<Study>> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/?project_id=${projectId}`);
  if (!response.ok) {
    throw new Error("Failed to load studies.");
  }

  return response.json();
}

export async function fetchStudiesIndex(options?: FetchStudiesIndexOptions): Promise<PaginatedResponse<Study>> {
  const params = new URLSearchParams();
  if (options?.pageSize) {
    params.set("page_size", String(options.pageSize));
  }
  if (options?.page) {
    params.set("page", String(options.page));
  }
  if (options?.ordering) {
    params.set("ordering", options.ordering);
  }
  if (options?.search) {
    params.set("search", options.search);
  }
  if (options?.projectId) {
    params.set("project_id", String(options.projectId));
  }
  const query = params.toString();
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error("Failed to load studies.");
  }

  return response.json();
}

export async function fetchStudy(studyId: number): Promise<Study> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/`);
  if (!response.ok) {
    throw new Error("Failed to load the study.");
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

export async function updateStudy(studyId: number, payload: UpdateStudyPayload): Promise<Study> {
  const response = await apiFetch(`${apiBaseUrl}/api/studies/${studyId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to update the study."));
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
