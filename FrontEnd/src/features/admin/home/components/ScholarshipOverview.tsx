import { Typography, Button, Progress } from "antd";
import { SafetyCertificateOutlined, ReadOutlined, MailOutlined } from "@ant-design/icons";
import { scholarshipOverview } from "../../../../data/mockAdminDashboard";

const { Title, Text } = Typography;

export default function ScholarshipOverview() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-bl-[80px] pointer-events-none"></div>
      
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <SafetyCertificateOutlined className="text-[16px]" />
          </div>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Học bổng Edunity</Title>
        </div>
        <Button type="link" className="font-bold text-indigo-600 p-0 text-[12px]">Quản lý chiến dịch</Button>
      </div>

      <Text className="block mb-4 text-[13px]">
        <strong className="text-gray-800">3 chiến dịch</strong> đang tiếp nhận hồ sơ: Tiếp sức đến trường, Nuôi dưỡng tài năng, Học bổng STEM.
      </Text>

      <div className="bg-gray-50 rounded-xl p-3 mb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Text type="secondary" className="font-semibold text-[12px]">Tổng quỹ huy động:</Text>
          <Text strong className="text-[16px] text-gray-800">{scholarshipOverview.totalFund}đ</Text>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <Text className="text-indigo-600 font-bold">Đã phân bổ: {scholarshipOverview.allocatedFund}đ</Text>
            <Text strong>{scholarshipOverview.percent}%</Text>
          </div>
          <Progress percent={scholarshipOverview.percent} showInfo={false} strokeColor="#4f46e5" trailColor="#e5e7eb" className="m-0" strokeWidth={6} />
        </div>
        
        <div className="flex items-center justify-between pt-1 text-[12px]">
          <Text type="secondary">Học sinh đã nhận tài trợ:</Text>
          <Text strong className="text-teal-600 flex items-center gap-1 font-bold">
            <ReadOutlined className="text-[14px]" /> {scholarshipOverview.studentsReceived} em
          </Text>
        </div>
      </div>

      <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 flex items-start gap-2">
        <MailOutlined className="text-[16px] text-amber-600 shrink-0 mt-0.5" />
        <Text strong className="text-[12px] leading-tight text-amber-800">4 Hồ sơ mới cần hội đồng thẩm định duyệt trước 18/10</Text>
      </div>
    </div>
  );
}
