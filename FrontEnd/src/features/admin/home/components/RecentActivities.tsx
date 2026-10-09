import { Typography, Timeline } from "antd";
import { ClockCircleOutlined, CheckCircleOutlined, GiftOutlined, WarningOutlined, HistoryOutlined, BookOutlined, UserOutlined } from "@ant-design/icons";
import type { AdminDashboardActivity } from "../../../../types/adminDashboard";

const { Title, Text } = Typography;

interface RecentActivitiesProps {
  activities?: AdminDashboardActivity[];
}

export default function RecentActivities({ activities = [] }: RecentActivitiesProps) {
  const getActionConfig = (action: string) => {
    if (action.includes("TEACHER")) {
      return {
        icon: <UserOutlined className="text-teal-600 bg-white text-[14px]" />,
        color: "teal",
        title: action.includes("VERIFIED") ? "Xác minh giáo viên" : "Từ chối xác minh",
        titleColor: "text-teal-600",
      };
    }
    if (action.includes("SCHOLARSHIP") || action.includes("CAMPAIGN")) {
      return {
        icon: <GiftOutlined className="text-indigo-600 bg-white text-[14px]" />,
        color: "blue",
        title: action.includes("APPROVED") ? "Duyệt học bổng" : "Cập nhật chiến dịch",
        titleColor: "text-indigo-600",
      };
    }
    if (action.includes("CLASS") || action.includes("COURSE")) {
      return {
        icon: <BookOutlined className="text-emerald-600 bg-white text-[14px]" />,
        color: "green",
        title: action.includes("APPROVED") ? "Phê duyệt đào tạo" : "Xử lý đào tạo",
        titleColor: "text-emerald-600",
      };
    }
    if (action.includes("REPORT")) {
      return {
        icon: <CheckCircleOutlined className="text-amber-600 bg-white text-[14px]" />,
        color: "gold",
        title: "Xử lý khiếu nại / báo cáo",
        titleColor: "text-amber-600",
      };
    }
    if (action.includes("REFUND") || action.includes("FAIL")) {
      return {
        icon: <WarningOutlined className="text-rose-500 bg-white text-[14px]" />,
        color: "red",
        title: "Cảnh báo hệ thống",
        titleColor: "text-rose-600",
      };
    }
    return {
      icon: <ClockCircleOutlined className="text-gray-400 bg-white text-[14px]" />,
      color: "gray",
      title: "Nhật ký hệ thống",
      titleColor: "text-gray-700",
    };
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const now = Date.now();
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
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center shadow-sm">
            <HistoryOutlined className="text-[16px]" />
          </div>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Hoạt động gần đây</Title>
        </div>
        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-[13px]">
          Chưa có nhật ký hoạt động nào gần đây.
        </div>
      ) : (
        <Timeline
          className="mt-1"
          items={activities.map((act) => {
            const config = getActionConfig(act.action);
            return {
              color: config.color,
              dot: config.icon,
              children: (
                <div className="flex flex-col pb-3">
                  <div className="flex items-center justify-between">
                    <Text strong className={`text-[12px] ${config.titleColor}`}>
                      {config.title}
                    </Text>
                    <Text type="secondary" className="text-[10px] ml-2 shrink-0">
                      {formatRelativeTime(act.createdAt)}
                    </Text>
                  </div>
                  <Text className="text-[12px] mt-0.5 text-gray-600 leading-snug">
                    {getActionDescription(act)}
                  </Text>
                </div>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
