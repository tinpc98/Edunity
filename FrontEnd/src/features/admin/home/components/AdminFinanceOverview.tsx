import { Row, Col } from "antd";
import { CalendarOutlined, LineChartOutlined } from "@ant-design/icons";
import type { AdminDashboardFinance } from "../../../../types/adminDashboard";
import { formatVND } from "../../../../types/payment";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface AdminFinanceOverviewProps {
  finance?: AdminDashboardFinance;
}

export default function AdminFinanceOverview({ finance }: AdminFinanceOverviewProps) {
  const currentMonthYear = new Date().toLocaleDateString("vi-VN", {
    month: "2-digit",
    year: "numeric",
  });

  const monthlyData = finance?.monthly || [];
  const maxRevenue = Math.max(...monthlyData.map((m) => m.revenue), 1000000);

  const formatMonthLabel = (mStr: string) => {
    if (!mStr) return "";
    const parts = mStr.split("-");
    if (parts.length === 2) {
      return `Th${parseInt(parts[1], 10)}`;
    }
    return mStr;
  };

  const currentIsoMonth = new Date().toISOString().slice(0, 7);

  return (
    <AdminSectionCard
      title="Tổng quan tài chính & Đối soát"
      subtitle="Dòng tiền, hoa hồng nền tảng và tình trạng giải ngân"
      icon={<LineChartOutlined />}
      extra={
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-[#CCFBF1] border border-[#99F6E4] font-bold text-[#0F766E] text-xs flex items-center gap-1.5">
            <CalendarOutlined className="text-[#0D9488]" />
            <span>Tháng {currentMonthYear}</span>
          </span>
        </div>
      }
    >
      <Row gutter={[12, 12]} className="mb-6">
        <Col xs={12} sm={6}>
          <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-center h-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Doanh thu tháng này
            </span>
            <div className="font-extrabold text-[#163B40] text-base sm:text-lg mt-1 whitespace-nowrap">
              {formatVND(finance?.revenueThisMonth || 0)}
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-3.5 rounded-xl bg-[#CCFBF1] border border-[#99F6E4] flex flex-col justify-center h-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
              Hoa hồng nền tảng
            </span>
            <div className="font-extrabold text-[#0F766E] text-base sm:text-lg mt-1 whitespace-nowrap">
              {formatVND(finance?.commission || 0)}
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-3.5 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] flex flex-col justify-center h-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
              Giao dịch thành công
            </span>
            <div className="font-extrabold text-[#15803D] text-base sm:text-lg mt-1 whitespace-nowrap">
              {finance?.transactions || 0} GD
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] flex flex-col justify-center h-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#DC2626]">
              Yêu cầu hoàn tiền
            </span>
            <div className="font-extrabold text-[#DC2626] text-base sm:text-lg mt-1 whitespace-nowrap">
              {finance?.refunds || 0} GD
            </div>
          </div>
        </Col>
      </Row>

      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-[#163B40]">
            Biểu đồ doanh thu 6 tháng gần nhất (VNĐ)
          </span>
          <span className="text-[11px] font-semibold text-[#0F766E] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />
            <span>Cập nhật trực tiếp từ sổ cái giao dịch</span>
          </span>
        </div>

        <div className="w-full bg-[#F5FAF9] rounded-2xl p-4 border border-[#D6E5E2]">
          <div className="h-44 w-full flex items-end justify-between gap-2 sm:gap-6 pt-4 px-2 sm:px-4">
            {monthlyData.map((data, idx) => {
              const isActive =
                data.month === currentIsoMonth || idx === monthlyData.length - 1;
              const heightPercent = `${Math.min(
                Math.max((data.revenue / maxRevenue) * 100, 8),
                100
              )}%`;
              const revenueInM = (data.revenue / 1000000).toFixed(1);

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end"
                >
                  <span
                    className={`text-[10px] font-bold transition-opacity ${
                      isActive
                        ? "text-[#0F766E]"
                        : "text-[#64748B] opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {data.revenue > 0 ? `${revenueInM}M` : "0đ"}
                  </span>
                  <div
                    className={`w-full max-w-[40px] rounded-t-lg transition-all duration-300 ${
                      isActive
                        ? "bg-[#0D9488] shadow-md shadow-teal-700/30 relative"
                        : "bg-[#5EEAD4] hover:bg-[#14B8A6]"
                    }`}
                    style={{ height: heightPercent }}
                  >
                    {isActive && (
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0F766E] rounded-full border-2 border-white shadow-xs" />
                    )}
                  </div>
                  <span
                    className={`text-[11px] ${
                      isActive
                        ? "text-[#163B40] font-extrabold"
                        : "text-[#64748B] font-medium"
                    }`}
                  >
                    {formatMonthLabel(data.month)} {isActive && "★"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminSectionCard>
  );
}
