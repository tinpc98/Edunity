import { Button, Typography, Space } from "antd";
import { 
  VideoCameraOutlined, 
  InfoCircleOutlined, 
  ClockCircleOutlined, 
  UserOutlined,
  CalendarOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { Session } from "../../../../types/session";
import { formatSessionTimeRange } from "../../../../api/sessionAdapters";

const { Title, Text } = Typography;

interface TeacherWelcomeHeroProps {
  teacherName: string;
  nextSession?: Session;
  todaySessionsCount: number;
}

export default function TeacherWelcomeHero({
  teacherName,
  nextSession,
  todaySessionsCount,
}: TeacherWelcomeHeroProps) {
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  };

  const currentDateFormatted = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-white p-5 lg:p-6 shadow-sm border border-gray-100 max-w-full">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/5 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-teal-500/10 blur-2xl"></div>
      
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between max-w-full">
        <div className="flex max-w-xl flex-col gap-1.5 min-w-0">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 tracking-wide">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
              Cổng giảng dạy Edunity
            </span>
            <Text type="secondary" className="text-[13px] font-medium capitalize">
              {currentDateFormatted}
            </Text>
          </div>

          <Title level={2} style={{ margin: "4px 0", letterSpacing: "-0.02em", fontSize: "24px" }}>
            {getGreeting()}, {teacherName} <span className="inline-block animate-wave origin-bottom-right">👋</span>
          </Title>

          <Text className="text-[14px] text-gray-500 leading-snug">
            {todaySessionsCount > 0 ? (
              <>
                Hôm nay thầy/cô có <strong className="font-semibold text-gray-800">{todaySessionsCount} buổi học trực tuyến</strong>. Phòng học ảo đã sẵn sàng kết nối cùng các học viên!
              </>
            ) : (
              <>
                Hôm nay không có ca dạy trực tuyến. Thầy/Cô có thể nghỉ ngơi hoặc chuẩn bị giáo án cho các buổi học sắp tới.
              </>
            )}
          </Text>
        </div>
        
        {nextSession ? (
          <div className="flex w-full flex-col gap-3 rounded-[16px] bg-indigo-50/50 p-4 lg:max-w-[400px] border border-indigo-50 max-w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider ${
                nextSession.status === "IN_PROGRESS" 
                  ? "bg-rose-100 text-rose-700" 
                  : "bg-indigo-100 text-indigo-700"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${nextSession.status === "IN_PROGRESS" ? "bg-rose-500 animate-ping" : "bg-indigo-500"}`}></span>
                {nextSession.status === "IN_PROGRESS" ? "ĐANG DIỄN RA" : "SẮP BẮT ĐẦU"}
              </span>
              <Text type="secondary" className="text-[13px] font-medium flex items-center gap-1">
                <ClockCircleOutlined className="text-[14px]" />
                {formatSessionTimeRange(nextSession.startDatetime, nextSession.endDatetime) || "Theo lịch"}
              </Text>
            </div>
            <div className="flex flex-col">
              <h4 className="font-bold text-[15px] text-gray-800 truncate m-0">
                {nextSession.title || nextSession.className || "Buổi học trực tuyến"}
              </h4>
              <div className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-500">
                <span className="inline-flex items-center gap-1 text-teal-600 font-semibold bg-teal-50 px-1.5 py-0.5 rounded-md truncate">
                  <UserOutlined className="text-[14px]" />
                  {nextSession.className || "Lớp học trực tuyến"}
                </span>
              </div>
            </div>
            <Space wrap className="pt-0.5 max-w-full">
              <Button 
                type="primary" 
                size="middle" 
                onClick={() => navigate(`/classroom/${nextSession.id}`)}
                icon={<VideoCameraOutlined />} 
                className="bg-indigo-600 shadow-sm shadow-indigo-600/20 rounded-xl px-5 font-semibold cursor-pointer"
              >
                Vào lớp Live
              </Button>
              <Button 
                size="middle" 
                onClick={() => navigate(`/teacher/classes/${nextSession.classId}`)}
                icon={<InfoCircleOutlined />} 
                className="rounded-xl bg-white border-transparent shadow-sm hover:text-indigo-600 cursor-pointer" 
                title="Chi tiết lớp học" 
              />
            </Space>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 rounded-[16px] bg-gray-50/80 p-4 lg:max-w-[400px] border border-gray-100 justify-center max-w-full">
            <div className="flex items-center gap-2 text-indigo-600 font-semibold text-[13px]">
              <CalendarOutlined />
              <span>Chưa có buổi dạy sắp tới</span>
            </div>
            <Text type="secondary" className="text-[12px]">
              Hãy kiểm tra thời khóa biểu hoặc tạo lịch buổi học mới trong các lớp đang giảng dạy.
            </Text>
            <Button 
              onClick={() => navigate("/teacher/schedule")}
              className="mt-1 rounded-xl bg-white text-indigo-600 border border-gray-200 font-semibold h-8 text-[12px] cursor-pointer"
            >
              Xem lịch giảng dạy
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
