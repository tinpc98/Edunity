import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AuthUser } from "../types/auth";
import { queryClient } from "../lib/queryClient";

const AUTH_STORAGE_KEY = "edunity-auth";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** "Ghi nhớ đăng nhập": true keeps the session in localStorage, false only for this browser session. */
  rememberMe: boolean;
  /** `rememberMe` is kept unchanged when omitted (e.g. when refreshing the user profile). */
  setAuth: (user: AuthUser, accessToken: string, refreshToken?: string | null, rememberMe?: boolean) => void;
  updateUser: (partialUser: Partial<AuthUser>) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Writes the persisted session to localStorage or sessionStorage depending on `rememberMe`. */
const rememberAwareStorage: StateStorage = {
  // This tab's own session comes first, so other tabs signing in or out cannot replace a "not remembered" one
  getItem: (name) => safe(() => sessionStorage.getItem(name), null) ?? safe(() => localStorage.getItem(name), null),
  setItem: (name, value) => {
    const remember = safe(() => JSON.parse(value)?.state?.rememberMe !== false, true);
    const [target, other] = remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    safe(() => target.setItem(name, value), undefined);
    safe(() => other.removeItem(name), undefined);
  },
  removeItem: (name) => {
    safe(() => localStorage.removeItem(name), undefined);
    safe(() => sessionStorage.removeItem(name), undefined);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      rememberMe: true,
      setAuth: (user, accessToken, refreshToken = null, rememberMe) =>
        set((state) => ({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          rememberMe: rememberMe ?? state.rememberMe,
        })),
      updateUser: (partialUser) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partialUser } : null,
        })),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      logout: () => {
        queryClient.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: true });
      },
    }),
    { name: AUTH_STORAGE_KEY, storage: createJSONStorage(() => rememberAwareStorage) },
  ),
);

// Each tab keeps its own copy of the session in memory: follow what other tabs do to the shared one
if (typeof window !== "undefined") {
  window.addEventListener("storage", async (event) => {
    if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return;

    const previousUserId = useAuthStore.getState().user?.userId;
    await useAuthStore.persist.rehydrate();

    const { user, isAuthenticated, logout } = useAuthStore.getState();
    if (isAuthenticated && rememberAwareStorage.getItem(AUTH_STORAGE_KEY) === null) {
      logout(); // the shared session was removed altogether
    } else if (user?.userId !== previousUserId) {
      queryClient.clear(); // another account signed in: never show the previous one's cached data
    }
  });
}
