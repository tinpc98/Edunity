import { useNow } from "../../../../hooks/useNow";
import { Timeline } from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  GiftOutlined,
  WarningOutlined,
  HistoryOutlined,
  BookOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { AdminDashboardActivity } from "../../../../types/adminDashboard";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface RecentActivitiesProps {
  activities?: AdminDashboardActivity[];
}

export default function RecentActivities({ activities = [] }: RecentActivitiesProps) {
  const now = useNow();

  const getActionConfig = (action: string) => {
    if (action.includes("TEACHER")) {
      return {
        icon: <UserOutlined className="text-teal-700 text-sm" />,
        color: "#0D9488",
        title: action.includes("VERIFIED") ? "Xác minh giáo viên" : "Từ chối xác minh",
        titleColor: "text-teal-800",
      };
    }
    if (action.includes("SCHOLARSHIP") || action.includes("CAMPAIGN")) {
      return {
        icon: <GiftOutlined className="text-teal-600 text-sm" />,
        color: "#14B8A6",
        title: action.includes("APPROVED") ? "Duyệt học bổng" : "Cập nhật chiến dịch",
        titleColor: "text-teal-800",
      };
    }
    if (action.includes("CLASS") || action.includes("COURSE")) {
      return {
        icon: <BookOutlined className="text-emerald-600 text-sm" />,
        color: "#10B981",
        title: action.includes("APPROVED") ? "Phê duyệt đào tạo" : "Xử lý đào tạo",
        titleColor: "text-emerald-800",
      };
    }
    if (action.includes("REPORT")) {
      return {
        icon: <CheckCircleOutlined className="text-amber-600 text-sm" />,
        color: "#F59E0B",
        title: "Xử lý khiếu nại / báo cáo",
        titleColor: "text-amber-800",
      };
    }
    if (action.includes("REFUND") || action.includes("FAIL")) {
      return {
        icon: <WarningOutlined className="text-rose-600 text-sm" />,
        color: "#EF4444",
        title: "Cảnh báo hệ thống",
        titleColor: "text-rose-800",
      };
    }
    return {
      icon: <ClockCircleOutlined className="text-slate-400 text-sm" />,
      color: "#94A3B8",
      title: "Nhật ký hệ thống",
      titleColor: "text-slate-700",
    };
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const past = new Date(isoString).getTime();
      const diffMs = now - past;
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return "Vừa xong";
      if (diffMins < 60) return `${diffMins}m trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return new Date(isoString).toLocaleDateString("vi-VN");
    } catch {
      return "";
    }
  };

  const getActionDescription = (act: AdminDashboardActivity) => {
    const actor = act.actorEmail ? `Bởi ${act.actorEmail}` : "Hệ thống";
    return `${actor} • Thao tác: ${act.action} [${act.targetType}]`;
  };

  return (
    <AdminSectionCard
      title="Hoạt động gần đây"
      icon={<HistoryOutlined />}
      badge={<span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
    >
      {activities.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs">
          Chưa có nhật ký hoạt động nào gần đây.
        </div>
      ) : (
        <div className="pt-2">
          <Timeline
            items={activities.map((act) => {
              const cfg = getActionConfig(act.action);
              return {
                dot: (
                  <div className="w-6 h-6 rounded-full bg-[#F0F8F6] border border-[#D6E5E2] flex items-center justify-center shadow-2xs">
                    {cfg.icon}
                  </div>
                ),
                color: cfg.color,
                children: (
                  <div className="flex flex-col gap-0.5 pb-2 -mt-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-bold ${cfg.titleColor}`}>
                        {cfg.title}
                      </span>
                      <span className="text-[10px] text-[#64748B] font-medium">
                        {formatRelativeTime(act.createdAt)}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#64748B] leading-tight font-medium">
                      {getActionDescription(act)}
                    </span>
                  </div>
                ),
              };
            })}
          />
        </div>
      )}
    </AdminSectionCard>
  );
}
