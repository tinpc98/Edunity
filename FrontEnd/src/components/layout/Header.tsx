import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Input, Button, Dropdown, Avatar, Drawer } from "antd";
import type { MenuProps } from "antd";
import {
  SearchOutlined,
  UserOutlined,
  DownOutlined,
  BookOutlined,
  LogoutOutlined,
  MenuOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { LOGO_URL } from "../../data/homeData";
import { useHomeStore } from "../../stores/useHomeStore";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import { NotificationPopover } from "../../features/notifications/components/NotificationPopover";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchKeyword = useHomeStore((state) => state.searchKeyword);
  const setSearchKeyword = useHomeStore((state) => state.setSearchKeyword);

  const { user, isAuthenticated, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      const { refreshToken } = useAuthStore.getState();
      const { logoutUser } = await import("../../services/auth.service");
      await logoutUser(refreshToken);
    } catch {
      // Ignore errors, clear local state anyway
    } finally {
      logout();
      navigate(ROUTES.HOME);
    }
  };

  const navLinks = [
    {
      label: "Giới thiệu",
      href: ROUTES.ABOUT,
      isRoute: true,
      active: location.pathname === "/about",
    },
    {
      label: "Giáo viên",
      href: ROUTES.TEACHERS,
      isRoute: true,
      active: location.pathname.startsWith("/teachers"),
    },
    {
      label: "Khóa học",
      href: ROUTES.COURSES.LIST,
      isRoute: true,
      active: location.pathname.startsWith("/courses"),
    },
    {
      label: "Lớp học",
      href: ROUTES.CLASSES,
      isRoute: true,
      active: location.pathname.startsWith("/classes"),
    },
    {
      label: "Học bổng",
      href: ROUTES.CAMPAIGNS,
      isRoute: true,
      active: location.pathname.startsWith("/campaigns"),
    },
    {
      label: "Hỗ trợ",
      href: ROUTES.SUPPORT,
      isRoute: true,
      active: location.pathname === "/support",
    },
  ];

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user-info",
      disabled: true,
      label: (
        <div className="py-1 px-0.5 cursor-default">
          <div className="font-bold text-[#163B40] text-xs">{user?.fullName}</div>
          <div className="text-[11px] text-[#64748B] font-normal truncate max-w-[180px]">
            {user?.email}
          </div>
        </div>
      ),
    },
    {
      type: "divider",
    },
    ...(user?.role === "SPONSOR"
      ? [
          {
            key: "sponsor-portal",
            icon: <BookOutlined className="text-xs text-[#0D9488]" />,
            label: <span className="text-xs font-semibold text-[#163B40]">Kênh Nhà tài trợ</span>,
            onClick: () => navigate(ROUTES.SPONSOR.HOME),
          },
        ]
      : user?.role === "TEACHER"
      ? [
          {
            key: "teacher-portal",
            icon: <BookOutlined className="text-xs text-[#0D9488]" />,
            label: <span className="text-xs font-semibold text-[#163B40]">Kênh Giảng viên</span>,
            onClick: () => navigate(ROUTES.TEACHER.HOME),
          },
        ]
      : user?.role === "ADMIN"
      ? [
          {
            key: "admin-portal",
            icon: <BookOutlined className="text-xs text-[#0D9488]" />,
            label: <span className="text-xs font-semibold text-[#163B40]">Trang Quản trị</span>,
            onClick: () => navigate(ROUTES.ADMIN.HOME),
          },
        ]
      : [
          {
            key: "my-learning",
            icon: <BookOutlined className="text-xs text-[#0D9488]" />,
            label: <span className="text-xs font-semibold text-[#163B40]">Học tập của tôi</span>,
            onClick: () => navigate(ROUTES.STUDENT.HOME),
          },
          {
            key: "my-scholarships",
            icon: <BookOutlined className="text-xs text-[#0D9488]" />,
            label: <span className="text-xs font-semibold text-[#163B40]">Học bổng & hồ sơ của tôi</span>,
            onClick: () => navigate(ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS),
          },
        ]),
    {
      type: "divider",
    },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined className="text-xs text-[#DC2626]" />,
      label: <span className="text-xs font-semibold text-[#DC2626]">Đăng xuất</span>,
      onClick: handleLogout,
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#D6E5E2] shadow-[0_1px_3px_rgba(15,118,110,0.04)]">
      <div className="site-container h-[72px] flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <Link to={ROUTES.HOME} className="flex items-center gap-2.5 group">
            <img src={LOGO_URL} alt="Edunity" className="h-9 w-auto object-contain transition-transform group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-[#163B40] leading-none">Edunity</span>
              <span className="text-[9px] font-bold text-[#0D9488] tracking-wider uppercase mt-1">Học Trực Tuyến Live</span>
            </div>
          </Link>
        </div>

        {/* Global Search (Hidden on Mobile) */}
        <div className="hidden md:flex flex-1 max-w-[320px]">
          <Input
            prefix={<SearchOutlined className="text-[#0D9488] mr-1.5" />}
            placeholder="Tìm kiếm khóa học, môn học, giáo viên..."
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            onPressEnter={() => {
              if (searchKeyword.trim()) {
                navigate(`${ROUTES.CLASSES}?search=${encodeURIComponent(searchKeyword.trim())}`);
              }
            }}
            allowClear
            className="rounded-full bg-[#F5FAF9] border-[#D6E5E2] hover:border-[#14B8A6] focus:border-[#0D9488] h-10 text-[13px] px-3.5 placeholder:text-[#64748B]"
          />
        </div>

        {/* Desktop Navigation & Auth */}
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          <nav className="flex items-center gap-1.5">
            {navLinks.map((item, idx) =>
              item.isRoute ? (
                <Link
                  key={idx}
                  to={item.href}
                  className={`text-[13px] font-semibold transition-all px-3 py-1.5 rounded-lg ${
                    item.active
                      ? "text-[#0F766E] bg-[#CCFBF1] shadow-2xs"
                      : "text-[#334155] hover:text-[#0D9488] hover:bg-[#F0FDFA]"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={idx}
                  href={item.href}
                  className="text-[13px] font-medium text-[#334155] hover:text-[#0D9488] hover:bg-[#F0FDFA] px-3 py-1.5 rounded-lg transition-colors"
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 pl-3 border-l border-[#D6E5E2]">
              <NotificationPopover />
              <Dropdown menu={{ items: userMenuItems }} trigger={["hover", "click"]} placement="bottomRight">
                <button
                  type="button"
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-[#F0FDFA] transition-colors cursor-pointer border border-transparent hover:border-[#D6E5E2]"
                >
                  {user.avatarUrl ? (
                    <Avatar src={user.avatarUrl} size={36} className="border border-[#99F6E4]" />
                  ) : (
                    <Avatar
                      size={36}
                      className="bg-[#0D9488] text-white font-bold text-sm flex items-center justify-center border border-[#99F6E4]"
                    >
                      {user.fullName ? user.fullName.charAt(0).toUpperCase() : <UserOutlined />}
                    </Avatar>
                  )}
                  <DownOutlined className="text-[10px] text-[#64748B] mr-1" />
                </button>
              </Dropdown>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 pl-3 border-l border-[#D6E5E2]">
              <Button
                type="text"
                onClick={() => navigate(ROUTES.AUTH.LOGIN)}
                className="font-semibold text-[13px] text-[#163B40] hover:text-[#0D9488] hover:bg-[#F0FDFA] h-10 px-3.5 rounded-xl"
              >
                Đăng nhập
              </Button>
              <Button
                type="primary"
                onClick={() => navigate(ROUTES.AUTH.REGISTER)}
                className="bg-[#0D9488] hover:bg-[#0B746C] font-bold text-[13px] rounded-xl h-10 px-4.5 shadow-xs border-none text-white transition-all active:scale-95"
              >
                Đăng ký miễn phí
              </Button>
            </div>
          )}
        </div>

        {/* Mobile & Tablet Actions */}
        <div className="flex lg:hidden items-center gap-2">
          {isAuthenticated && user ? (
            <>
              <NotificationPopover />
              <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
                <button
                  type="button"
                  className="flex items-center p-1 rounded-full border border-[#D6E5E2]"
                >
                  <Avatar
                    size={32}
                    className="bg-[#0D9488] text-white font-bold text-xs"
                    src={user.avatarUrl}
                  >
                    {user.fullName?.charAt(0).toUpperCase() || <UserOutlined />}
                  </Avatar>
                </button>
              </Dropdown>
            </>
          ) : (
            <Button
              type="primary"
              size="small"
              onClick={() => navigate(ROUTES.AUTH.LOGIN)}
              className="bg-[#0D9488] hover:bg-[#0B746C] text-xs font-bold rounded-lg border-none"
            >
              Đăng nhập
            </Button>
          )}

          <Button
            type="text"
            icon={<MenuOutlined className="text-lg text-[#163B40]" />}
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-[#F0FDFA]"
          />
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={LOGO_URL} alt="Edunity" className="h-7 w-auto" />
              <span className="font-extrabold text-[#163B40]">Edunity</span>
            </div>
          </div>
        }
        placement="right"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        width={300}
        closeIcon={<CloseOutlined className="text-[#163B40]" />}
      >
        <div className="flex flex-col gap-4">
          <Input
            prefix={<SearchOutlined className="text-[#0D9488] mr-1.5" />}
            placeholder="Tìm kiếm..."
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            onPressEnter={() => {
              if (searchKeyword.trim()) {
                setMobileMenuOpen(false);
                navigate(`${ROUTES.CLASSES}?search=${encodeURIComponent(searchKeyword.trim())}`);
              }
            }}
            className="rounded-xl bg-[#F5FAF9] border-[#D6E5E2] h-10 text-xs"
          />

          <nav className="flex flex-col gap-1 pt-2 border-t border-[#D6E5E2]">
            {navLinks.map((item, idx) =>
              item.isRoute ? (
                <Link
                  key={idx}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors ${
                    item.active
                      ? "text-[#0F766E] bg-[#CCFBF1]"
                      : "text-[#334155] hover:text-[#0D9488] hover:bg-[#F0FDFA]"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={idx}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-[#334155] hover:text-[#0D9488] px-3 py-2.5 rounded-xl transition-colors"
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          {!isAuthenticated && (
            <div className="flex flex-col gap-2 pt-4 border-t border-[#D6E5E2]">
              <Button
                type="primary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(ROUTES.AUTH.REGISTER);
                }}
                className="w-full bg-[#0D9488] hover:bg-[#0B746C] font-bold text-sm rounded-xl h-11 border-none shadow-xs text-white"
              >
                Đăng ký miễn phí
              </Button>
              <Button
                type="default"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(ROUTES.AUTH.LOGIN);
                }}
                className="w-full border-[#D6E5E2] font-semibold text-sm rounded-xl h-11 text-[#163B40] hover:border-[#0D9488] hover:text-[#0D9488]"
              >
                Đăng nhập
              </Button>
            </div>
          )}
        </div>
      </Drawer>
    </header>
  );
}
