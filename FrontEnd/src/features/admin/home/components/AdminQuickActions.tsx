import { Button } from "antd";
import { UserAddOutlined, SafetyCertificateOutlined, PlusCircleOutlined, BookOutlined, ToolOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardPending } from "../../../../types/adminDashboard";

interface AdminQuickActionsProps {
  pending?: AdminDashboardPending;
}

export default function AdminQuickActions({ pending }: AdminQuickActionsProps) {
  const navigate = useNavigate();

  const actions = [
    {
      icon: UserAddOutlined,
      label: "Xác minh giáo viên",
      color: "text-indigo-600",
      count: pending?.teacherVerifications || 0,
      badgeColor: "bg-amber-100 text-amber-800",
      path: "/admin/teachers/verifications",
    },
    {
      icon: SafetyCertificateOutlined,
      label: "Duyệt học bổng",
      color: "text-indigo-600",
      count: pending?.scholarshipApplications || 0,
      badgeColor: "bg-indigo-100 text-indigo-700",
      path: "/admin/scholarship-applications",
    },
    {
      icon: PlusCircleOutlined,
      label: "Tạo Campaign mới",
      color: "text-teal-600",
      count: 0,
      badgeColor: "",
      path: "/admin/campaigns/create",
    },
    {
      icon: BookOutlined,
      label: "Quản lý Course",
      color: "text-gray-500",
      count: pending?.courseProposals || 0,
      badgeColor: "bg-teal-100 text-teal-700",
      path: "/admin/course-proposals",
    },
    {
      icon: ToolOutlined,
      label: "Kiểm tra Payment",
      color: "text-rose-600",
      count: pending?.refundsRequired || 0,
      badgeColor: "bg-rose-100 text-rose-700",
      path: "/admin/payments",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 pb-1">
      {actions.map((act, index) => {
        const Icon = act.icon;
        return (
          <Button 
            key={index}
            onClick={() => navigate(act.path)}
            className="shrink-0 flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white hover:bg-gray-50 border border-gray-100 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04)] transition-all cursor-pointer"
          >
            <Icon className={`text-[16px] ${act.color}`} />
            <span className="font-semibold text-gray-700 text-[13px]">{act.label}</span>
            {act.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5 leading-none ${act.badgeColor}`}>
                {act.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
