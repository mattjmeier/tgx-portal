const authTokenStorageKey = "tgx_portal_auth_token";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const defaultRequestTimeoutMs = 8_000;

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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), defaultRequestTimeoutMs);
  const abortSignal = init.signal;
  const forwardAbort = () => controller.abort(abortSignal?.reason);

  if (token) {
    headers.set("Authorization", `Token ${token}`);
  }

  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort(abortSignal.reason);
    } else {
      abortSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    abortSignal?.removeEventListener("abort", forwardAbort);
  }
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
