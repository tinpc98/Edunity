import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, Tooltip } from "antd";
import {
  DashboardOutlined,
  TeamOutlined,
  IdcardOutlined,
  AppstoreOutlined,
  FileDoneOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  ProfileOutlined,
  InboxOutlined,
  BarChartOutlined,
  FileTextOutlined,
  AuditOutlined,
  CloudSyncOutlined,
  WalletOutlined,
  PayCircleOutlined,
  CustomerServiceOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  LeftOutlined,
} from "@ant-design/icons";
import { ROUTES } from "../../../routes/routePaths";

interface AdminSidebarProps {
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

const navGroups: NavGroup[] = [
  {
    groupTitle: "TỔNG QUAN",
    items: [
      {
        key: ROUTES.ADMIN.HOME,
        label: "Tổng quan",
        icon: <DashboardOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.HOME,
      },
    ],
  },
  {
    groupTitle: "QUẢN LÝ HỆ THỐNG",
    items: [
      {
        key: ROUTES.ADMIN.USERS,
        label: "Người dùng",
        icon: <TeamOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.USERS,
      },
      {
        key: ROUTES.ADMIN.TEACHER_VERIFICATIONS,
        label: "Giáo viên",
        icon: <IdcardOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.TEACHER_VERIFICATIONS,
      },
      {
        key: ROUTES.ADMIN.CATALOG,
        label: "Danh mục & Khóa học",
        icon: <AppstoreOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.CATALOG,
      },
      {
        key: ROUTES.ADMIN.COURSE_PROPOSALS,
        label: "Duyệt đề xuất khóa học",
        icon: <FileDoneOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.COURSE_PROPOSALS,
      },
      {
        key: ROUTES.ADMIN.CLASSES,
        label: "Lớp học",
        icon: <BookOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.CLASSES,
      },
    ],
  },
  {
    groupTitle: "HỌC BỔNG",
    items: [
      {
        key: ROUTES.ADMIN.CAMPAIGNS,
        label: "Chiến dịch",
        icon: <SafetyCertificateOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.CAMPAIGNS,
      },
      {
        key: ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS,
        label: "Hồ sơ ứng tuyển",
        icon: <ProfileOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS,
      },
      {
        key: ROUTES.ADMIN.PAPER_DOSSIERS,
        label: "Hồ sơ giấy",
        icon: <InboxOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.PAPER_DOSSIERS,
      },
    ],
  },
  {
    groupTitle: "TÀI CHÍNH & ĐỐI SOÁT",
    items: [
      {
        key: ROUTES.ADMIN.FINANCE_OVERVIEW,
        label: "Tổng quan tài chính",
        icon: <BarChartOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.FINANCE_OVERVIEW,
      },
      {
        key: ROUTES.ADMIN.TRANSACTIONS,
        label: "Sổ cái giao dịch",
        icon: <FileTextOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.TRANSACTIONS,
      },
      {
        key: ROUTES.ADMIN.RECONCILIATIONS,
        label: "Hàng đợi đối soát",
        icon: <AuditOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.RECONCILIATIONS,
      },
      {
        key: ROUTES.ADMIN.BANK_EVENTS,
        label: "Webhooks & Outbox",
        icon: <CloudSyncOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.BANK_EVENTS,
      },
      {
        key: ROUTES.ADMIN.PAYMENTS,
        label: "Thanh toán học phí",
        icon: <WalletOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.PAYMENTS,
      },
      {
        key: ROUTES.ADMIN.PAYOUTS,
        label: "Rút tiền giáo viên",
        icon: <PayCircleOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.PAYOUTS,
      },
      {
        key: ROUTES.ADMIN.REFUNDS,
        label: "Quản lý hoàn tiền",
        icon: <AuditOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.REFUNDS,
      },
    ],
  },
  {
    groupTitle: "VẬN HÀNH",
    items: [
      {
        key: ROUTES.ADMIN.REPORTS,
        label: "Khiếu nại",
        icon: <CustomerServiceOutlined className="text-[17px]" />,
        path: ROUTES.ADMIN.REPORTS,
      },
      {
        key: "/admin/notifications",
        label: "Thông báo",
        icon: <BellOutlined className="text-[17px]" />,
        path: "/admin/notifications",
      },
    ],
  },
];

export default function AdminSidebar({
  collapsed,
  onToggleCollapse,
  user,
  onLogout,
  isMobile,
}: AdminSidebarProps) {
  const location = useLocation();

  const isItemActive = (path: string) => {
    if (path === ROUTES.ADMIN.HOME) {
      return location.pathname === ROUTES.ADMIN.HOME;
    }
    return location.pathname.startsWith(path);
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
                Management V3
              </span>
            </div>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]">
              Admin
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
            title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          >
            <LeftOutlined className="text-xs" />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-admin-scrollbar">
        {navGroups.map((group) => (
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
                {user?.fullName || "Nguyễn Văn Quản Trị"}
              </p>
              <p className="text-[11px] text-[#64748B] truncate leading-tight mt-0.5">
                {user?.email || "admin@edunity.edu.vn"}
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
