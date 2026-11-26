import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, Tooltip } from "antd";
import {
  DashboardOutlined,
  HeartOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  LogoutOutlined,
  LeftOutlined,
} from "@ant-design/icons";
import { ROUTES } from "../../../routes/routePaths";

interface SponsorSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  user: any;
  onLogout: () => void;
  isMobile: boolean;
}

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  path: string;
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

const sponsorNavGroups: NavGroup[] = [
  {
    groupTitle: "TỔNG QUAN",
    items: [
      {
        key: ROUTES.SPONSOR.HOME,
        label: "Tổng quan",
        icon: <DashboardOutlined className="text-[17px]" />,
        path: ROUTES.SPONSOR.HOME,
      },
    ],
  },
  {
    groupTitle: "TÀI TRỢ & HỌC BỔNG",
    items: [
      {
        key: ROUTES.SPONSOR.CONTRIBUTIONS,
        label: "Lịch sử tài trợ",
        icon: <HeartOutlined className="text-[17px]" />,
        path: ROUTES.SPONSOR.CONTRIBUTIONS,
      },
      {
        key: ROUTES.CAMPAIGNS,
        label: "Khám phá chiến dịch",
        icon: <SafetyCertificateOutlined className="text-[17px]" />,
        path: ROUTES.CAMPAIGNS,
      },
    ],
  },
  {
    groupTitle: "TÀI KHOẢN",
    items: [
      {
        key: ROUTES.SPONSOR.PROFILE,
        label: "Hồ sơ cá nhân",
        icon: <UserOutlined className="text-[17px]" />,
        path: ROUTES.SPONSOR.PROFILE,
      },
    ],
  },
];

export default function SponsorSidebar({
  collapsed,
  onToggleCollapse,
  user,
  onLogout,
  isMobile,
}: SponsorSidebarProps) {
  const location = useLocation();

  const isItemActive = (path: string) => {
    if (path === ROUTES.SPONSOR.HOME) {
      return location.pathname === ROUTES.SPONSOR.HOME;
    }
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-50 flex flex-col bg-[#F0F8F6] border-r border-[#D6E5E2] transition-all duration-300 shadow-[0_1px_8px_rgba(13,148,136,0.06)] ${
        collapsed ? (isMobile ? "-translate-x-full w-0" : "w-20") : "w-72"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#D6E5E2] bg-[#F0F8F6] shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-teal-900/30">
              E
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base text-[#163B40] tracking-tight leading-none">
                Edunity
              </span>
              <span className="text-[11px] font-medium text-[#64748B] mt-0.5">
                Nhà Tài Trợ
              </span>
            </div>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]">
              SPONSOR
            </span>
          </div>
        ) : (
          <div className="w-9 h-9 mx-auto rounded-xl bg-[#0F766E] flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-teal-900/30">
            E
          </div>
        )}

        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg text-[#64748B] hover:text-[#0F766E] hover:bg-[#E5F5F1] transition-colors ${
              collapsed ? "hidden" : "block"
            }`}
            title={
              collapsed
                ? "Mở rộng thanh điều hướng"
                : "Thu gọn thanh điều hướng"
            }
          >
            <LeftOutlined className="text-xs" />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-admin-scrollbar">
        {sponsorNavGroups.map((group) => (
          <div key={group.groupTitle} className="space-y-1">
            {!collapsed && (
              <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-[#0F766E] block mb-1">
                {group.groupTitle}
              </span>
            )}
            {group.items.map((item) => {
              const active = isItemActive(item.path);

              const content = (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                    active
                      ? "bg-[#CCFBF1] text-[#0F766E] font-bold shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3.5px] before:bg-[#0D9488] before:rounded-r-full"
                      : "text-[#334155] hover:bg-[#E5F5F1] hover:text-[#0F766E]"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <span
                    className={`shrink-0 flex items-center justify-center ${
                      active ? "text-[#0F766E] font-bold" : "text-[#64748B]"
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );

              return collapsed ? (
                <Tooltip key={item.key} placement="right" title={item.label}>
                  {content}
                </Tooltip>
              ) : (
                content
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-3 bg-[#E5F5F1] border-t border-[#D6E5E2] shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <Avatar
              size={36}
              src={user?.avatarUrl}
              icon={!user?.avatarUrl && <UserOutlined />}
              className="bg-[#0D9488] shrink-0 border border-[#99F6E4]"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#163B40] truncate leading-tight">
                {user?.fullName || "Nhà tài trợ"}
              </p>
              <p className="text-[11px] text-[#64748B] truncate leading-tight mt-0.5">
                {user?.email || "sponsor@edunity.edu.vn"}
              </p>
            </div>
            <Tooltip title="Đăng xuất">
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
              >
                <LogoutOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Avatar
              size={32}
              src={user?.avatarUrl}
              icon={!user?.avatarUrl && <UserOutlined />}
              className="bg-[#0D9488] border border-[#99F6E4]"
            />
            <Tooltip placement="right" title="Đăng xuất">
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogoutOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
}
