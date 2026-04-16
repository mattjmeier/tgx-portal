const authTokenStorageKey = "tgx_portal_auth_token";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const defaultRequestTimeoutMs = 30_000;

function getRequestTimeoutMs(): number {
  const configuredTimeout = import.meta.env.VITE_API_REQUEST_TIMEOUT_MS;
  if (!configuredTimeout) {
    return defaultRequestTimeoutMs;
  }

  const parsedTimeout = Number(configuredTimeout);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return defaultRequestTimeoutMs;
  }

  return parsedTimeout;
}

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
  let didTimeout = false;
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, getRequestTimeoutMs());
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
  } catch (error) {
    if (didTimeout) {
      throw new Error("Request timed out. Please try again.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request was cancelled. Please retry.");
    }
    throw error;
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
