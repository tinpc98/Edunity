import { Typography, Tag, Row, Col } from "antd";
import { CalendarOutlined, LineChartOutlined } from "@ant-design/icons";
import type { AdminDashboardFinance } from "../../../../types/adminDashboard";
import { formatVND } from "../../../../types/payment";

const { Title, Text } = Typography;

interface AdminFinanceOverviewProps {
  finance?: AdminDashboardFinance;
}

export default function AdminFinanceOverview({ finance }: AdminFinanceOverviewProps) {
  const currentMonthYear = new Date().toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
  
  const monthlyData = finance?.monthly || [];
  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1000000);

  const formatMonthLabel = (mStr: string) => {
    // "2026-10" -> "Th10"
    if (!mStr) return "";
    const parts = mStr.split("-");
    if (parts.length === 2) {
      return `Th${parseInt(parts[1], 10)}`;
    }
    return mStr;
  };

  const currentIsoMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex flex-col">
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Tổng quan tài chính</Title>
          <Text type="secondary" className="text-[12px] mt-0.5">Dòng tiền, hoa hồng nền tảng và tình trạng giải ngân</Text>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Tag className="px-2.5 py-1 rounded-[10px] bg-gray-50 font-bold border border-gray-100 text-gray-700 m-0 text-[11px]">
            Tháng {currentMonthYear}
          </Tag>
          <div className="bg-gray-50 text-gray-500 rounded-[10px] h-8 w-8 p-0 flex items-center justify-center border border-gray-100">
            <CalendarOutlined className="text-[14px]" />
          </div>
        </div>
      </div>

      <Row gutter={[12, 12]} className="mb-6">
        <Col xs={12} sm={6}>
          <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 flex flex-col justify-center h-full">
            <Text type="secondary" className="text-[11px]">Doanh thu tháng này</Text>
            <div className="font-bold text-gray-800 text-[15px] mt-0.5 whitespace-nowrap">
              {formatVND(finance?.revenueThisMonth || 0)}
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100/50 flex flex-col justify-center h-full">
            <Text className="text-indigo-600 font-medium text-[11px] leading-tight">Hoa hồng nền tảng</Text>
            <div className="font-extrabold text-indigo-600 text-[15px] mt-0.5 whitespace-nowrap">
              {formatVND(finance?.commission || 0)}
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-2.5 rounded-xl bg-teal-50/50 border border-teal-100/50 flex flex-col justify-center h-full">
            <Text className="text-teal-700 font-medium text-[11px]">Giao dịch thành công</Text>
            <div className="font-bold text-teal-700 text-[15px] mt-0.5 whitespace-nowrap">
              {finance?.transactions || 0} GD
            </div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 flex flex-col justify-center h-full">
            <Text type="secondary" className="text-[11px]">Yêu cầu hoàn tiền</Text>
            <div className="font-bold text-gray-800 text-[14px] mt-0.5 whitespace-nowrap">
              {finance?.refunds || 0} GD
            </div>
          </div>
        </Col>
      </Row>

      <div className="pt-1">
        <div className="flex items-center justify-between mb-3">
          <Text strong className="text-[12px]">Biểu đồ doanh thu 6 tháng gần nhất (VNĐ)</Text>
          <Text strong className="text-teal-600 text-[11px] flex items-center gap-1">
            <LineChartOutlined className="text-[14px]" /> Cập nhật tự động từ giao dịch thực tế
          </Text>
        </div>
        
        <div className="w-full bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
          <div className="h-40 w-full flex items-end justify-between gap-2 sm:gap-6 pt-4 px-2 sm:px-4">
            {monthlyData.map((data, idx) => {
              const isActive = data.month === currentIsoMonth || idx === monthlyData.length - 1;
              const heightPercent = `${Math.min(Math.max((data.revenue / maxRevenue) * 100, 8), 100)}%`;
              const revenueInM = (data.revenue / 1000000).toFixed(1);
              
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end">
                  <span className={`text-[10px] font-bold ${isActive ? 'text-indigo-600' : 'text-gray-400 opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    {data.revenue > 0 ? `${revenueInM}M` : '0đ'}
                  </span>
                  <div 
                    className={`w-full max-w-[40px] rounded-t-lg transition-all duration-300 ${
                      isActive ? 'bg-indigo-500 shadow-md shadow-indigo-600/20 relative' : 'bg-indigo-100 hover:bg-indigo-300'
                    }`} 
                    style={{ height: heightPercent }}
                  >
                    {isActive && (
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-teal-400 rounded-full border-[1.5px] border-white"></div>
                    )}
                  </div>
                  <span className={`text-[11px] ${isActive ? 'text-indigo-600 font-extrabold' : 'text-gray-500 font-medium'}`}>
                    {formatMonthLabel(data.month)} {isActive && '★'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
