import { parseErrorMessage } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type AuthenticatedUser = {
  id: number;
  username: string;
  email: string;
  profile: {
    role: "admin" | "client" | "system";
  };
};

export async function loginUser(username: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to sign in."));
  }

  return response.json();
}

export async function fetchCurrentUser(token: string): Promise<AuthenticatedUser> {
  const response = await fetch(`${apiBaseUrl}/api/auth/me/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load the current user."));
  }

  return response.json();
}

export async function logoutUser(token: string): Promise<void> {
  await fetch(`${apiBaseUrl}/api/auth/logout/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
  });
}
