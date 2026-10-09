import { useAuthStore } from "../stores/auth.store";

export interface ApiError {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
}

class FetchError extends Error {
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

let refreshPromise: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  
  if (!refreshToken) {
    logout();
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error("Refresh failed");
    }

    const result = await response.json();
    if (result.success && result.data?.accessToken) {
      setTokens(result.data.accessToken, result.data.refreshToken);
      return result.data.accessToken;
    } else {
      throw new Error("Invalid refresh response");
    }
  } catch (error) {
    logout();
    return null;
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

    // Handle 401 Unauthorized
    if (response.status === 401 && !isRetry) {
      if (!refreshPromise) {
        refreshPromise = refreshSession();
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
