import { Card, Typography, Button, Tag } from "antd";
import { ArrowRightOutlined, WalletOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { teacherRevenue } from "../../../../data/mockTeacherDashboard";

const { Title, Text } = Typography;

export default function TeacherRevenue() {
  return (
    <Card 
      className="rounded-2xl shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100 h-full" 
      styles={{ body: { padding: '20px', display: 'flex', flexDirection: 'column' } }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <WalletOutlined className="text-indigo-600 text-[22px]" />
            <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Tổng quan Doanh thu</Title>
            <Tag color="cyan" className="rounded-full border-0 font-bold flex items-center gap-1 text-[11px] px-2 py-0.5 m-0">
              <SafetyCertificateOutlined className="text-[14px]" /> Đã xác minh
            </Tag>
          </div>
          <Text type="secondary" className="mt-1 text-[12px]">Kỳ thanh toán ngày 25 hàng tháng • Tự động đối soát</Text>
        </div>
        <Button type="link" className="font-semibold text-indigo-600 p-0 flex items-center text-[13px]">
          Xem chi tiết doanh thu <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3 my-2 rounded-xl bg-gray-50 px-4">
        <div className="flex flex-col">
          <Text type="secondary" className="text-[12px]">Doanh thu lớp học (Gross)</Text>
          <div className="mt-0.5 whitespace-nowrap"><Text strong className="text-lg">{teacherRevenue.gross}</Text><Text strong className="text-[11px] ml-0.5">đ</Text></div>
        </div>
        <div className="flex flex-col">
          <Text type="secondary" className="text-[12px]">Phí nền tảng (10%)</Text>
          <div className="mt-0.5 whitespace-nowrap"><Text strong className="text-lg text-rose-600">-{teacherRevenue.platformFee}</Text><Text strong className="text-[11px] ml-0.5 text-rose-600">đ</Text></div>
        </div>
        <div className="flex flex-col">
          <Text strong className="text-teal-700 text-[12px]">Thu nhập thực nhận (Net payout)</Text>
          <div className="flex items-baseline gap-2 mt-0.5 whitespace-nowrap">
            <div className="text-indigo-600 font-extrabold text-xl tracking-tight leading-none">{teacherRevenue.netPayout}<span className="text-[13px] ml-0.5">đ</span></div>
            <Tag color="cyan" className="border-0 rounded-full px-1.5 py-0 text-[10px] font-bold">+16%</Tag>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-3 mt-auto">
        <div className="flex items-center justify-between text-[12px]">
          <Text strong>Tăng trưởng thu nhập 6 tháng gần đây</Text>
          <Text strong className="text-teal-600">+16% so với tháng trước</Text>
        </div>
        
        {/* CSS Bar Chart */}
        <div className="grid grid-cols-6 items-end gap-3 pt-5 pb-1 h-36">
          {teacherRevenue.monthlyData.map((data, index) => {
            const heightPercent = `${Math.min((data.value / 10) * 100, 100)}%`;
            return (
              <div key={index} className="flex flex-col items-center gap-2 h-full justify-end group">
                <span className={`text-[10px] font-bold ${data.isActive ? 'text-indigo-600' : 'text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity'}`}>{data.value}M</span>
                <div 
                  className={`w-full max-w-[48px] rounded-t-lg transition-all duration-300 ${data.isActive ? 'bg-indigo-600 shadow-md shadow-indigo-600/25' : 'bg-gray-200 hover:bg-indigo-300'}`} 
                  style={{ height: heightPercent }}
                ></div>
                <span className={`text-[12px] font-bold ${data.isActive ? 'text-indigo-600' : 'text-gray-400 font-medium'}`}>{data.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
