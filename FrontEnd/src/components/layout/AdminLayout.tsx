import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import { adminThemeConfig } from "./admin/adminTheme";
import AdminSidebar from "./admin/AdminSidebar";
import AdminHeader from "./admin/AdminHeader";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";

export default function AdminLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { notification } = AntdApp.useApp();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }

    if (user.role !== "ADMIN") {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: "Bạn không có quyền quản trị viên để truy cập trang này.",
        placement: "topRight",
      });
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [isAuthenticated, user, navigate, notification, location.pathname]);

  if (!isAuthenticated || !user || user.role !== "ADMIN") {
    return null;
  }

  const handleLogout = async () => {
    try {
      const { refreshToken } = useAuthStore.getState();
      const { logoutUser } = await import("../../services/auth.service");
      await logoutUser(refreshToken);
    } catch {
      // Ignore errors
    } finally {
      useAuthStore.getState().logout();
      navigate(ROUTES.AUTH.LOGIN);
    }
  };

  const currentMarginLeft = isMobile
    ? collapsed
      ? 0
      : 288
    : collapsed
    ? 80
    : 288;

  return (
    <ConfigProvider theme={adminThemeConfig}>
      <div className="min-h-screen bg-[#F5FAF9] text-slate-800 flex overflow-x-hidden font-sans">
        {/* Dedicated Admin Sidebar */}
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          user={user}
          onLogout={handleLogout}
          isMobile={isMobile}
        />

        {/* Backdrop overlay for mobile when drawer is open */}
        {isMobile && !collapsed && (
          <div
            onClick={() => setCollapsed(true)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity"
          />
        )}

        {/* Main Content Layout */}
        <div
          style={{ marginLeft: currentMarginLeft, transition: "margin-left 0.25s ease-in-out" }}
          className="flex-1 flex flex-col min-h-screen min-w-0"
        >
          {/* Dedicated Glassmorphism Admin Header */}
          <AdminHeader
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            user={user}
            onLogout={handleLogout}
            isMobile={isMobile}
          />

          {/* Admin Content Area */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
