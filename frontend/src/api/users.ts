import { apiFetch, parseErrorMessage } from "./http";
import type { PaginatedResponse } from "./projects";

export type ManagedUser = {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  owned_project_count: number;
  profile: {
    role: "admin" | "client" | "system";
  };
};

export type FetchUsersOptions = {
  page?: number;
  pageSize?: number;
  ordering?: string;
  search?: string;
  role?: "admin" | "client" | "system";
};

export async function fetchUsers(options?: FetchUsersOptions): Promise<PaginatedResponse<ManagedUser>> {
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
  if (options?.role) {
    params.set("role", options.role);
  }

  const query = params.toString();
  const response = await apiFetch(`/api/users/${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load users."));
  }

  return response.json();
}

export async function createManagedUser(payload: {
  username: string;
  email: string;
  password: string;
  role: "admin" | "client" | "system";
}): Promise<ManagedUser> {
  const response = await apiFetch("/api/users/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to create user."));
  }

  return response.json();
}

export async function updateManagedUserRole(userId: number, role: "admin" | "client" | "system"): Promise<ManagedUser> {
  const response = await apiFetch(`/api/users/${userId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to update user role."));
  }

  return response.json();
}
