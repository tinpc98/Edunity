import { Avatar, Dropdown, Input } from "antd";
import {
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  HeartOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { NotificationPopover } from "../../../features/notifications/components/NotificationPopover";
import { ROUTES } from "../../../routes/routePaths";

interface SponsorHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  user: any;
  onLogout: () => void;
  isMobile?: boolean;
  pageTitle?: string;
}

export default function SponsorHeader({
  collapsed,
  onToggleCollapse,
  user,
  onLogout,
  pageTitle,
}: SponsorHeaderProps) {
  const navigate = useNavigate();

  const userMenuItems = [
    {
      key: "status",
      label: (
        <div className="px-2 py-1">
          <p className="text-xs font-bold text-slate-800">
            {user?.fullName || "Nhà tài trợ"}
          </p>
          <p className="text-[11px] text-slate-500">
            {user?.email || "sponsor@edunity.edu.vn"}
          </p>
          <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-700">
            NHÀ TÀI TRỢ
          </span>
        </div>
      ),
      disabled: true,
    },
    {
      type: "divider" as const,
    },
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Hồ sơ cá nhân",
      onClick: () => navigate(ROUTES.SPONSOR.PROFILE),
    },
    {
      key: "contributions",
      icon: <HeartOutlined />,
      label: "Lịch sử tài trợ",
      onClick: () => navigate(ROUTES.SPONSOR.CONTRIBUTIONS),
    },
    {
      type: "divider" as const,
    },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined />,
      label: "Đăng xuất tài khoản",
      onClick: onLogout,
    },
  ];

  return (
    <header className="sticky top-0 right-0 z-40 h-16 bg-white/90 backdrop-blur-xl border-b border-[#D6E5E2] px-4 sm:px-6 flex items-center justify-between shadow-[0_1px_8px_rgba(13,148,136,0.04)]">
      {/* Left: Collapse toggle + Breadcrumb Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-xl text-[#64748B] hover:text-[#0F766E] hover:bg-[#E5F5F1] transition-colors"
          title={
            collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"
          }
        >
          {collapsed ? (
            <MenuUnfoldOutlined className="text-lg" />
          ) : (
            <MenuFoldOutlined className="text-lg" />
          )}
        </button>

        <div className="flex items-center gap-2 text-[#334155] text-sm">
          <HeartOutlined className="text-[#0D9488] text-base" />
          <span className="text-slate-300">/</span>
          <span className="font-bold text-[#163B40] truncate max-w-[200px] sm:max-w-md">
            {pageTitle || "Cổng Thông tin Nhà Tài Trợ"}
          </span>
        </div>
      </div>

      {/* Right: Quick Search + Status Pill + Notifications + Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Quick Search */}
        <div className="relative hidden md:flex items-center w-64 lg:w-72">
          <Input
            prefix={<SearchOutlined className="text-[#64748B] text-sm" />}
            placeholder="Tìm kiếm chiến dịch, khoản tài trợ..."
            className="rounded-xl bg-[#F5FAF9] border-[#D6E5E2] hover:border-teal-400 focus:border-[#0D9488] text-xs py-1.5 placeholder:text-[#64748B]"
          />
        </div>

        {/* Operational Status Pill */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
          <span>Verified Sponsor</span>
        </div>

        {/* Notifications */}
        <div className="flex items-center">
          <NotificationPopover />
        </div>

        <div className="h-6 w-[1px] bg-[#D6E5E2] hidden sm:block"></div>

        {/* Sponsor Profile Dropdown */}
        <Dropdown
          menu={{ items: userMenuItems }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <div className="flex items-center gap-2 cursor-pointer p-1.5 rounded-xl hover:bg-[#E5F5F1] transition-colors">
            <Avatar
              size={32}
              src={user?.avatarUrl}
              icon={!user?.avatarUrl && <UserOutlined />}
              className="bg-[#0D9488] border border-[#99F6E4]"
            />
            <div className="hidden lg:flex flex-col text-left leading-none">
              <span className="text-xs font-bold text-[#163B40] truncate max-w-[120px]">
                {user?.fullName || "Nhà tài trợ"}
              </span>
              <span className="text-[10px] text-[#0F766E] font-bold mt-0.5">
                Nhà tài trợ
              </span>
            </div>
            <DownOutlined className="text-[10px] text-[#64748B] hidden lg:block" />
          </div>
        </Dropdown>
      </div>
    </header>
  );
}
