import { Link, useLocation, useNavigate } from "react-router-dom";
import { Input, Button, Dropdown, Avatar } from "antd";
import type { MenuProps } from "antd";
import {
  SearchOutlined,
  UserOutlined,
  DownOutlined,
  BookOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { LOGO_URL } from "../../data/homeData";
import { useHomeStore } from "../../stores/useHomeStore";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import { NotificationPopover } from "../../features/notifications/components/NotificationPopover";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
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
    { label: "Giới thiệu", href: "#", isRoute: false },
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
    { label: "Hỗ trợ", href: "#", isRoute: false },
  ];

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user-info",
      disabled: true,
      label: (
        <div className="py-1 px-0.5 cursor-default">
          <div className="font-bold text-slate-800 text-xs">{user?.fullName}</div>
          <div className="text-[11px] text-slate-400 font-normal truncate max-w-[180px]">
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
            icon: <BookOutlined className="text-xs text-indigo-600" />,
            label: <span className="text-xs font-medium">Kênh Nhà tài trợ</span>,
            onClick: () => navigate(ROUTES.SPONSOR.HOME),
          },
        ]
      : user?.role === "TEACHER"
      ? [
          {
            key: "teacher-portal",
            icon: <BookOutlined className="text-xs text-indigo-600" />,
            label: <span className="text-xs font-medium">Kênh Giảng viên</span>,
            onClick: () => navigate(ROUTES.TEACHER.HOME),
          },
        ]
      : user?.role === "ADMIN"
      ? [
          {
            key: "admin-portal",
            icon: <BookOutlined className="text-xs text-indigo-600" />,
            label: <span className="text-xs font-medium">Trang Quản trị</span>,
            onClick: () => navigate(ROUTES.ADMIN.HOME),
          },
        ]
      : [
          {
            key: "my-learning",
            icon: <BookOutlined className="text-xs text-indigo-600" />,
            label: <span className="text-xs font-medium">Học tập của tôi</span>,
            onClick: () => navigate(ROUTES.STUDENT.HOME),
          },
          {
            key: "my-scholarships",
            icon: <BookOutlined className="text-xs text-indigo-600" />,
            label: <span className="text-xs font-medium">Học bổng & hồ sơ của tôi</span>,
            onClick: () => navigate(ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS),
          },
        ]),
    {
      type: "divider",
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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
      <div className="site-container h-[72px] flex items-center justify-between gap-4">
        {/* Brand & Category Button */}
        <div className="flex items-center gap-4 shrink-0">
          <Link to={ROUTES.HOME} className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Edunity" className="h-9 w-auto object-contain" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-indigo-900 leading-none">Edunity</span>
              <span className="text-[9px] font-bold text-indigo-600 tracking-wider uppercase mt-1">Học Trực Tuyến Live</span>
            </div>
          </Link>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-[300px]">
          <Input
            prefix={<SearchOutlined className="text-slate-400 mr-1" />}
            placeholder="Tìm kiếm khóa học, môn học, giáo viên..."
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            onPressEnter={() => {
              if (searchKeyword.trim()) {
                navigate(`${ROUTES.CLASSES}?search=${encodeURIComponent(searchKeyword.trim())}`);
              }
            }}
            allowClear
            className="rounded-full bg-slate-50 border-slate-200 hover:border-indigo-400 focus:border-indigo-600 h-10 text-[13px] px-3"
          />
        </div>

        {/* Navigation & Auth */}
        <div className="flex items-center gap-4 shrink-0">
          <nav className="flex items-center gap-3">
            {navLinks.map((item, idx) =>
              item.isRoute ? (
                <Link
                  key={idx}
                  to={item.href}
                  className={`text-[13px] font-medium transition-colors ${
                    item.active
                      ? "text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1.5 rounded-md"
                      : "text-slate-600 hover:text-indigo-600"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={idx}
                  href={item.href}
                  className="text-[13px] font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <NotificationPopover />
              <Dropdown menu={{ items: userMenuItems }} trigger={["hover", "click"]} placement="bottomRight">
                <button
                  type="button"
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                >
                  {user.avatarUrl ? (
                    <Avatar src={user.avatarUrl} size={36} />
                  ) : (
                    <Avatar
                      size={36}
                      className="bg-indigo-600 text-white font-bold text-sm flex items-center justify-center"
                    >
                      {user.fullName ? user.fullName.charAt(0).toUpperCase() : <UserOutlined />}
                    </Avatar>
                  )}
                  <DownOutlined className="text-[10px] text-slate-400 mr-1" />
                </button>
              </Dropdown>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <Button
                type="text"
                onClick={() => navigate(ROUTES.AUTH.LOGIN)}
                className="font-semibold text-[13px] text-slate-700 hover:text-indigo-600 h-10 px-3"
              >
                Đăng nhập
              </Button>
              <Button
                type="primary"
                onClick={() => navigate(ROUTES.AUTH.REGISTER)}
                className="bg-indigo-600 hover:bg-indigo-700 font-semibold text-[13px] rounded-lg h-10 px-4 shadow-sm shadow-indigo-200 border-none"
              >
                Đăng ký miễn phí
              </Button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.AUTH.LOGIN)}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
              >
                <UserOutlined />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}