import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "../types/auth";
import { queryClient } from "../lib/queryClient";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken?: string | null) => void;
  updateUser: (partialUser: Partial<AuthUser>) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken = null) => 
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      updateUser: (partialUser) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partialUser } : null,
        })),
      setTokens: (accessToken, refreshToken) => 
        set({ accessToken, refreshToken }),
      logout: () => {
        queryClient.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    { name: "edunity-auth" },
  ),
);
