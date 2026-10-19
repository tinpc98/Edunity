import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AuthUser } from "../types/auth";
import { queryClient } from "../lib/queryClient";

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
  getItem: (name) => safe(() => localStorage.getItem(name), null) ?? safe(() => sessionStorage.getItem(name), null),
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
    { name: "edunity-auth", storage: createJSONStorage(() => rememberAwareStorage) },
  ),
);
