import { apiFetch, parseErrorMessage } from "./http";
import type { PaginatedResponse } from "./projects";

export type ManagedUser = {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  profile: {
    role: "admin" | "client" | "system";
  };
};

export async function fetchUsers(): Promise<PaginatedResponse<ManagedUser>> {
  const response = await apiFetch("/api/users/");
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
