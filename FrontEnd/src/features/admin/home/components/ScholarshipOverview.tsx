import { Progress } from "antd";
import { SafetyCertificateOutlined, ReadOutlined, MailOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardScholarship } from "../../../../types/adminDashboard";
import { formatVND } from "../../../../types/payment";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface ScholarshipOverviewProps {
  scholarship?: AdminDashboardScholarship;
}

export default function ScholarshipOverview({ scholarship }: ScholarshipOverviewProps) {
  const navigate = useNavigate();

  const openCampaigns = scholarship?.openCampaigns || 0;
  const totalFund = scholarship?.totalFund || 0;
  const allocatedFund = scholarship?.allocatedFund || 0;
  const percent = scholarship?.allocatedPercent || 0;
  const studentsReceived = scholarship?.studentsReceived || 0;
  const newApplications = scholarship?.newApplications || 0;

  return (
    <AdminSectionCard
      title="Học bổng Edunity"
      icon={<SafetyCertificateOutlined />}
      extra={
        <button
          onClick={() => navigate("/admin/campaigns")}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0F766E] hover:text-[#0D9488] transition-colors cursor-pointer"
        >
          <span>Chiến dịch</span>
          <ArrowRightOutlined className="text-[10px]" />
        </button>
      }
    >
      <p className="text-xs text-[#334155] mb-3 leading-relaxed">
        <strong className="text-[#163B40] font-bold">{openCampaigns} chiến dịch</strong> đang tiếp nhận đóng góp & hồ sơ xét duyệt học bổng.
      </p>

      <div className="bg-[#F0F8F6] rounded-xl p-3.5 mb-3 flex flex-col gap-3 border border-[#D6E5E2]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#64748B]">Tổng quỹ huy động:</span>
          <span className="text-sm font-extrabold text-[#163B40]">{formatVND(totalFund)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#0F766E] font-bold">
              Đã phân bổ: {formatVND(allocatedFund)}
            </span>
            <span className="font-bold text-[#163B40]">{percent}%</span>
          </div>
          <Progress
            percent={percent}
            showInfo={false}
            strokeColor="#0D9488"
            trailColor="#D6E5E2"
            className="m-0"
            size={{ height: 6 }}
          />
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-[#D6E5E2] text-xs">
          <span className="text-[#64748B] font-medium">Học sinh đã nhận tài trợ:</span>
          <span className="text-[#0F766E] font-bold flex items-center gap-1">
            <ReadOutlined className="text-[#0D9488]" />
            <span>{studentsReceived} em</span>
          </span>
        </div>
      </div>

      <div
        className="p-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] flex items-start gap-2.5 cursor-pointer hover:bg-amber-100 transition-colors"
        onClick={() => navigate("/admin/scholarship-applications")}
      >
        <MailOutlined className="text-base text-[#D97706] shrink-0 mt-0.5" />
        <span className="text-xs font-bold leading-snug text-[#B45309]">
          {newApplications > 0
            ? `${newApplications} Hồ sơ mới cần hội đồng thẩm định xem xét duyệt`
            : "Hiện không có hồ sơ học bổng mới đang chờ duyệt"}
        </span>
      </div>
    </AdminSectionCard>
  );
}
