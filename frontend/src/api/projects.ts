import { apiFetch, parseErrorMessage } from "./http";

export type Project = {
  id: number;
  owner: string | null;
  owner_id: number | null;
  pi_name: string;
  researcher_name: string;
  bioinformatician_assigned: string;
  title: string;
  description: string;
  created_at: string;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type CreateProjectPayload = Pick<
  Project,
  "pi_name" | "researcher_name" | "bioinformatician_assigned" | "title" | "description"
>;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type FetchProjectsOptions = {
  page?: number;
  pageSize?: number;
  ordering?: string;
  search?: string;
};

export async function fetchProjects(options?: FetchProjectsOptions): Promise<PaginatedResponse<Project>> {
  const params = new URLSearchParams();
  if (options?.page) {
    params.set("page", String(options.page));
  }
  if (options?.pageSize) {
    params.set("page_size", String(options.pageSize));
  }
  if (options?.ordering) {
    params.set("ordering", options.ordering);
  }
  if (options?.search) {
    params.set("search", options.search);
  }
  const query = params.toString();
  const response = await apiFetch(`${apiBaseUrl}/api/projects/${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error("Failed to load projects.");
  }

  return response.json();
}

export async function fetchProject(projectId: number): Promise<Project> {
  const response = await apiFetch(`${apiBaseUrl}/api/projects/${projectId}/`);
  if (!response.ok) {
    throw new Error("Failed to load the project.");
  }

  return response.json();
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const response = await apiFetch(`${apiBaseUrl}/api/projects/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create the project."));
  }

  return response.json();
}

export async function deleteProject(projectId: number): Promise<void> {
  const response = await apiFetch(`${apiBaseUrl}/api/projects/${projectId}/`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to delete the project."));
  }
}

export async function downloadProjectConfig(projectId: number): Promise<Blob> {
  const response = await apiFetch(`${apiBaseUrl}/api/projects/${projectId}/generate-config/`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to generate the config bundle."));
  }

  return response.blob();
}

export async function assignProjectOwner(projectId: number, ownerId: number | null): Promise<Project> {
  const response = await apiFetch(`${apiBaseUrl}/api/projects/${projectId}/assign-owner/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ owner_id: ownerId }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to update project ownership."));
  }

  return response.json();
}
