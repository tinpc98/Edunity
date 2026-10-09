import { useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, Dropdown, Badge, Button, App as AntdApp } from "antd";
import type { MenuProps } from "antd";
import {
  BookOutlined,
  CalendarOutlined,
  UserOutlined,
  WalletOutlined,
  HomeOutlined,
  LogoutOutlined,
  BellOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import { LOGO_URL } from "../../data/homeData";

export default function StudentLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notification } = AntdApp.useApp();
  const { user, isAuthenticated, logout } = useAuthStore();


  // Auth Guard: Only authenticated STUDENT can access
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(ROUTES.STUDENT.HOME)}`, { replace: true });
      return;
    }

    if (user.role !== "STUDENT") {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: "Chỉ tài khoản học viên (Student) mới có quyền truy cập Học tập của tôi.",
        placement: "topRight",
      });
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [isAuthenticated, user, navigate, notification]);

  if (!isAuthenticated || !user || user.role !== "STUDENT") {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate(ROUTES.HOME);
  };

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user-info",
      disabled: true,
      label: (
        <div className="py-1 px-1 cursor-default">
          <div className="font-bold text-slate-800 text-xs">{user.fullName}</div>
          <div className="text-[11px] text-slate-400 font-normal truncate max-w-[180px]">
            {user.email}
          </div>
        </div>
      ),
    },
    { type: "divider" },
    {
      key: "profile",
      icon: <UserOutlined className="text-xs text-slate-500" />,
      label: <span className="text-xs font-medium">Hồ sơ cá nhân</span>,
      onClick: () => navigate(ROUTES.STUDENT.PROFILE),
    },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined className="text-xs" />,
      label: <span className="text-xs font-medium">Đăng xuất</span>,
      onClick: handleLogout,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex">
      {/* ================= LEFT STUDENT SIDEBAR ================= */}
      <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-30 shadow-2xs">
        {/* Top Section */}
        <div className="p-5 flex flex-col">
          {/* Logo */}
          <div className="pb-4 border-b border-slate-100">
            <Link to={ROUTES.HOME} className="flex items-center gap-3">
              <img src={LOGO_URL} alt="Edunity" className="h-8 w-auto object-contain" />
              <div className="flex flex-col">
                <span className="text-lg font-black tracking-tight text-indigo-900 leading-none">
                  Edunity
                </span>
                <span className="text-[8px] font-bold text-indigo-600 tracking-wider uppercase mt-1">
                  Học Trực Tuyến Live
                </span>
              </div>
            </Link>
          </div>

          {/* Nav Section: HỌC TẬP */}
          <div className="space-y-1 mt-5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
              HỌC TẬP
            </div>

            <Link
              to={ROUTES.STUDENT.HOME}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                location.pathname === ROUTES.STUDENT.HOME || location.pathname.startsWith("/student/classes")
                  ? "bg-indigo-50 text-indigo-600 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-slate-50"
              }`}
            >
              <BookOutlined className="text-sm" />
              <span>Lớp học của tôi</span>
            </Link>

            <Link
              to={ROUTES.STUDENT.SCHEDULE}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                location.pathname === ROUTES.STUDENT.SCHEDULE
                  ? "bg-indigo-50 text-indigo-600 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-slate-50"
              }`}
            >
              <CalendarOutlined className="text-sm" />
              <span>Lịch học</span>
            </Link>
          </div>

          {/* Nav Section: TÀI KHOẢN */}
          <div className="space-y-1 mt-6">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
              TÀI KHOẢN
            </div>

            <Link
              to={ROUTES.STUDENT.PROFILE}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                location.pathname === ROUTES.STUDENT.PROFILE
                  ? "bg-indigo-50 text-indigo-600 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-slate-50"
              }`}
            >
              <UserOutlined className="text-sm" />
              <span>Hồ sơ cá nhân</span>
            </Link>

            <Link
              to={ROUTES.STUDENT.PAYMENTS}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                location.pathname === ROUTES.STUDENT.PAYMENTS
                  ? "bg-indigo-50 text-indigo-600 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-indigo-600 hover:bg-slate-50"
              }`}
            >
              <WalletOutlined className="text-sm" />
              <span>Lịch sử thanh toán</span>
            </Link>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-slate-100 space-y-1">
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
          >
            <HomeOutlined className="text-sm" />
            <span>Về trang chủ</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <LogoutOutlined className="text-sm" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* ================= RIGHT WORKSPACE ================= */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white/95 backdrop-blur border-b border-slate-200/80 sticky top-0 z-20 px-8 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Không gian học tập
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Icon */}
            <Badge dot color="#4f46e5">
              <Button
                type="text"
                shape="circle"
                icon={<BellOutlined className="text-base text-slate-600" />}
                className="hover:bg-slate-100 flex items-center justify-center h-9 w-9"
              />
            </Badge>

            <div className="h-4 w-px bg-slate-200" />

            {/* User Dropdown */}
            <Dropdown menu={{ items: userMenuItems }} trigger={["click", "hover"]} placement="bottomRight">
              <button
                type="button"
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
              >
                {user.avatarUrl ? (
                  <Avatar src={user.avatarUrl} size={32} />
                ) : (
                  <Avatar
                    size={32}
                    className="bg-indigo-600 text-white font-bold text-xs flex items-center justify-center"
                  >
                    {user.fullName ? user.fullName.charAt(0).toUpperCase() : <UserOutlined />}
                  </Avatar>
                )}
                <DownOutlined className="text-[10px] text-slate-400 mr-1" />
              </button>
            </Dropdown>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-6 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
