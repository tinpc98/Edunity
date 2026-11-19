import {
  UserAddOutlined,
  SafetyCertificateOutlined,
  PlusCircleOutlined,
  BookOutlined,
  WalletOutlined,
} from "@ant-design/icons";
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
      iconColor: "text-[#D97706]",
      count: pending?.teacherVerifications || 0,
      badgeStyle: "bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]",
      path: "/admin/teachers/verifications",
    },
    {
      icon: SafetyCertificateOutlined,
      label: "Duyệt học bổng",
      iconColor: "text-[#0F766E]",
      count: pending?.scholarshipApplications || 0,
      badgeStyle: "bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]",
      path: "/admin/scholarship-applications",
    },
    {
      icon: PlusCircleOutlined,
      label: "Tạo Campaign mới",
      iconColor: "text-[#15803D]",
      count: 0,
      badgeStyle: "",
      path: "/admin/campaigns/create",
    },
    {
      icon: BookOutlined,
      label: "Quản lý khóa học",
      iconColor: "text-[#7E22CE]",
      count: pending?.courseProposals || 0,
      badgeStyle: "bg-[#F3E8FF] text-[#7E22CE] border border-[#E9D5FF]",
      path: "/admin/course-proposals",
    },
    {
      icon: WalletOutlined,
      label: "Kiểm tra thanh toán",
      iconColor: "text-[#DC2626]",
      count: pending?.refundsRequired || 0,
      badgeStyle: "bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA]",
      path: "/admin/payments",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2.5 pb-2">
      {actions.map((act, index) => {
        const Icon = act.icon;
        return (
          <button
            key={index}
            onClick={() => navigate(act.path)}
            className="shrink-0 inline-flex items-center gap-2 px-3.5 h-10 rounded-xl bg-white hover:bg-[#E5F5F1] border border-[#D6E5E2] hover:border-[#99F6E4] shadow-2xs transition-all cursor-pointer text-xs font-bold text-[#163B40] hover:text-[#0F766E]"
          >
            <Icon className={`text-base ${act.iconColor}`} />
            <span>{act.label}</span>
            {act.count > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${act.badgeStyle}`}
              >
                {act.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
