const authTokenStorageKey = "tgx_portal_auth_token";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export function getStoredAuthToken(): string | null {
  return window.localStorage.getItem(authTokenStorageKey);
}

export function setStoredAuthToken(token: string | null): void {
  if (token) {
    window.localStorage.setItem(authTokenStorageKey, token);
    return;
  }

  window.localStorage.removeItem(authTokenStorageKey);
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const token = getStoredAuthToken();
  const url = input.startsWith("http") ? input : `${apiBaseUrl}${input}`;

  if (token) {
    headers.set("Authorization", `Token ${token}`);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

export async function parseErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const errorPayload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!errorPayload) {
    return fallbackMessage;
  }

  for (const value of Object.values(errorPayload)) {
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    if (typeof value === "string") {
      return value;
    }
  }

  return fallbackMessage;
}
