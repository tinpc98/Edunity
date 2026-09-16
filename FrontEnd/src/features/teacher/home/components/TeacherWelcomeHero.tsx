import { Button, Typography, Space } from "antd";
import { VideoCameraOutlined, AudioOutlined, InfoCircleOutlined, ClockCircleOutlined, UserAddOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function TeacherWelcomeHero() {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-white p-5 lg:p-6 shadow-sm border border-gray-100">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/5 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-teal-500/10 blur-2xl"></div>
      
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-xl flex-col gap-1.5">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 tracking-wide">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
              Học kỳ Mùa Thu 2026
            </span>
            <Text type="secondary" className="text-[13px] font-medium">Thứ Ba, 16 Tháng 9</Text>
          </div>
          <Title level={2} style={{ margin: "4px 0", letterSpacing: "-0.02em", fontSize: "24px" }}>
            Chào buổi tối, Thầy Minh Đức <span className="inline-block animate-wave origin-bottom-right">👋</span>
          </Title>
          <Text className="text-[14px] text-gray-500 leading-snug">
            Hôm nay thầy có <strong className="font-semibold text-gray-800">2 buổi học trực tuyến</strong>. Phòng học ảo đã sẵn sàng kết nối cùng các học viên nhiệt huyết!
          </Text>
        </div>
        
        <div className="flex w-full flex-col gap-3 rounded-[16px] bg-indigo-50/50 p-4 lg:max-w-[400px] border border-indigo-50">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
              SẮP BẮT ĐẦU
            </span>
            <Text type="secondary" className="text-[13px] font-medium flex items-center gap-1">
              <ClockCircleOutlined className="text-[14px]" />
              20:00 – 21:30
            </Text>
          </div>
          <div className="flex flex-col">
            <h4 className="font-bold text-[15px] text-gray-800 truncate m-0">Toán 12 – Chinh phục 8+ Nâng cao</h4>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-500">
              <span className="inline-flex items-center gap-1 text-teal-600 font-semibold bg-teal-50 px-1.5 py-0.5 rounded-md">
                <UserAddOutlined className="text-[14px]" />
                18/20
              </span>
              <span>học viên đã vào phòng chờ</span>
            </div>
          </div>
          <Space className="pt-0.5">
            <Button type="primary" size="middle" icon={<VideoCameraOutlined />} className="bg-indigo-600 shadow-sm shadow-indigo-600/20 rounded-xl px-5 font-semibold">
              Vào lớp Live
            </Button>
            <Button size="middle" icon={<AudioOutlined />} className="rounded-xl bg-white border-transparent shadow-sm hover:text-indigo-600" title="Kiểm tra Camera & Mic" />
            <Button size="middle" icon={<InfoCircleOutlined />} className="rounded-xl bg-white border-transparent shadow-sm hover:text-indigo-600" title="Chi tiết giáo án" />
          </Space>
        </div>
      </div>
    </div>
  );
}
