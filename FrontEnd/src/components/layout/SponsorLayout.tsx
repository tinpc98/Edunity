import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import { adminThemeConfig } from "./admin/adminTheme";
import SponsorSidebar from "./sponsor/SponsorSidebar";
import SponsorHeader from "./sponsor/SponsorHeader";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";

export default function SponsorLayout() {
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

    if (user.role !== "SPONSOR") {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: "Bạn không có quyền Nhà tài trợ để truy cập trang này.",
        placement: "topRight",
      });
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [isAuthenticated, user, navigate, notification, location.pathname]);

  if (!isAuthenticated || !user || user.role !== "SPONSOR") {
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

  const getPageTitle = () => {
    if (location.pathname === ROUTES.SPONSOR.HOME) return "Tổng quan Nhà tài trợ";
    if (location.pathname.startsWith(ROUTES.SPONSOR.CONTRIBUTIONS)) return "Lịch sử tài trợ học bổng";
    if (location.pathname.startsWith(ROUTES.SPONSOR.PROFILE)) return "Hồ sơ cá nhân";
    return "Cổng Thông tin Nhà Tài Trợ";
  };

  return (
    <ConfigProvider theme={adminThemeConfig}>
      <div className="min-h-screen bg-[#F5FAF9] text-slate-800 flex overflow-x-hidden font-sans">
        {/* Dedicated Sponsor Sidebar */}
        <SponsorSidebar
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
          {/* Dedicated Glassmorphism Header */}
          <SponsorHeader
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            user={user}
            onLogout={handleLogout}
            isMobile={isMobile}
            pageTitle={getPageTitle()}
          />

          {/* Page Canvas Container */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
