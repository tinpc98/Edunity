import { Typography, Button, Tag } from "antd";
import { ArrowRightOutlined, HourglassOutlined, SafetyCertificateOutlined, CreditCardOutlined, WarningOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function AdminWelcomeHero() {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-800 p-5 lg:p-6 shadow-[0_4px_12px_rgba(79,70,229,0.15)]">
      <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-teal-400 opacity-10 blur-3xl pointer-events-none"></div>
      <div className="absolute right-48 -bottom-20 w-60 h-60 rounded-full bg-indigo-300 opacity-15 blur-2xl pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex flex-col gap-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-300 animate-pulse"></span>
            <span className="text-[10px] text-indigo-100 tracking-wider uppercase font-bold">Bảng điều khiển tác vụ tức thì</span>
          </div>
          
          <Title level={2} style={{ color: 'white', margin: "2px 0", letterSpacing: "-0.02em", fontSize: '24px' }}>
            Xin chào, Admin 👋
          </Title>
          
          <Text className="text-[14px] text-indigo-100 leading-snug">
            Hôm nay có <strong className="font-semibold text-white underline decoration-teal-400 decoration-2 underline-offset-4">12 tác vụ cần xử lý</strong> để đảm bảo chất lượng lớp học và hệ thống vận hành thông suốt.
          </Text>
          
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Tag color="warning" className="border-0 backdrop-blur-md px-2.5 py-1 rounded-lg m-0 flex items-center gap-1 font-bold text-[11px] shadow-sm">
              <HourglassOutlined className="text-[12px]" /> 5 giáo viên chờ xác minh
            </Tag>
            <Tag color="processing" className="bg-indigo-400/30 text-white border-0 backdrop-blur-md px-2.5 py-1 rounded-lg m-0 flex items-center gap-1 font-bold text-[11px] shadow-sm">
              <SafetyCertificateOutlined className="text-[12px] text-indigo-200" /> 4 hồ sơ học bổng chờ duyệt
            </Tag>
            <Tag color="error" className="bg-rose-500/20 text-rose-100 border-0 backdrop-blur-md px-2.5 py-1 rounded-lg m-0 flex items-center gap-1 font-bold text-[11px] shadow-sm">
              <CreditCardOutlined className="text-[12px]" /> 2 thanh toán cần kiểm tra
            </Tag>
            <Tag color="error" className="bg-red-600/30 text-red-100 border-0 backdrop-blur-md px-2.5 py-1 rounded-lg m-0 flex items-center gap-1 font-bold text-[11px] shadow-sm">
              <WarningOutlined className="text-[12px]" /> 1 khiếu nại mới
            </Tag>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <Button type="default" className="rounded-[10px] px-5 h-10 bg-white text-indigo-600 font-bold border-0 shadow-md group text-[13px]">
            Xử lý ngay <ArrowRightOutlined className="transition-transform group-hover:translate-x-1" />
          </Button>
          <Button type="text" className="rounded-[10px] px-3 h-10 bg-white/10 hover:bg-white/20 text-white font-semibold backdrop-blur-md text-[13px]">
            Bộ lọc nhanh
          </Button>
        </div>
      </div>
    </div>
  );
}
