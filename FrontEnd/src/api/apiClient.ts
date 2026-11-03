import { useAuthStore } from "../stores/auth.store";

export interface ApiError {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
}

export class FetchError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
    this.name = "FetchError";
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

const NO_REFRESH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

const REFRESH_LOCK = "edunity-auth-refresh";

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh tokens are single-use and shared by every tab: the backend treats a second use as theft and ends all
 * sessions. So only one tab refreshes at a time. navigator.locks needs a secure context (HTTPS or localhost).
 */
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(REFRESH_LOCK, task) : task();
}

async function refreshSession(expiredToken: string | null): Promise<string | null> {
  try {
    return await runExclusive(async () => {
      // Another tab may have rotated the session while this one was waiting for the lock
      await useAuthStore.persist.rehydrate();
      const { accessToken, refreshToken, setTokens, logout } = useAuthStore.getState();
      if (accessToken && accessToken !== expiredToken) return accessToken;

      if (!refreshToken) {
        logout();
        return null;
      }

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      // Only the server rejecting the token ends the session. A rate limit or a server error says nothing
      // about it: the session stays and the next request tries again.
      if (response.status === 401 || response.status === 403) {
        logout();
        return null;
      }
      if (!response.ok) return null;

      const result = await response.json();
      if (!result.success || !result.data?.accessToken) return null;

      setTokens(result.data.accessToken, result.data.refreshToken);
      return result.data.accessToken;
    });
  } catch {
    return null; // network failure: same as above, the session is not in doubt
  } finally {
    refreshPromise = null;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const store = useAuthStore.getState();
  const headers = new Headers(options.headers || {});

  // Default to JSON if not FormData
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Inject Access Token
  if (store.accessToken) {
    headers.set("Authorization", `Bearer ${store.accessToken}`);
  }

  const url = `${BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, { ...options, headers });

    // Handle 401 Unauthorized. On the credential endpoints a 401 means wrong credentials or a dead
    // refresh token, not an expired access token, so it must not trigger a refresh.
    if (response.status === 401 && !isRetry && !NO_REFRESH_ENDPOINTS.includes(endpoint)) {
      if (!refreshPromise) {
        refreshPromise = refreshSession(store.accessToken);
      }
      const newAccessToken = await refreshPromise;
      
      if (newAccessToken) {
        // Retry with new token
        const retryHeaders = new Headers(options.headers || {});
        if (!retryHeaders.has("Content-Type") && !(options.body instanceof FormData)) {
          retryHeaders.set("Content-Type", "application/json");
        }
        retryHeaders.set("Authorization", `Bearer ${newAccessToken}`);
        
        return apiClient<T>(endpoint, { ...options, headers: retryHeaders }, true);
      }
    }

    // Parse JSON safely
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new FetchError({
        status: response.status,
        code: data?.error || "API_ERROR",
        message: data?.message || "An unexpected error occurred",
        details: data?.details || data,
      });
    }

    // Backend responds with { success: true, data: T }
    return data?.data ?? data;
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    throw new FetchError({
      message: error instanceof Error ? error.message : "Network error",
      code: "NETWORK_ERROR",
    });
  }
}
