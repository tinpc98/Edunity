import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth.store";
import { getMe } from "../../services/auth.service";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isHydrating, setIsHydrating] = useState(true);
  const { isAuthenticated, accessToken, setAuth, logout } = useAuthStore();

  useEffect(() => {
    const hydrate = async () => {
      // If store says authenticated but we need to verify with Backend
      if (isAuthenticated && accessToken) {
        try {
          const user = await getMe();
          // Update user with fresh data from Backend
          setAuth(user, useAuthStore.getState().accessToken!, useAuthStore.getState().refreshToken!);
        } catch (error) {
          // apiClient already ends the session when the refresh token is rejected. What is left here is either
          // an account the server refuses (403/404) or a temporary failure, which must not sign the user out.
          const status = (error as { status?: number }).status;
          if (status === 403 || status === 404) logout();
        }
      } else if (accessToken || useAuthStore.getState().refreshToken) {
        // If not authenticated, ensure we don't have dangling tokens
        logout();
      }
      setIsHydrating(false);
    };

    hydrate();
  }, []); // Run once on mount

  if (isHydrating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#faf8ff]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
          <p className="text-sm font-medium text-slate-500">Đang tải phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
