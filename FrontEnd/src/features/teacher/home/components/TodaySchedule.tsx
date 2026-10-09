import { Typography, Button, List } from "antd";
import { 
  CalendarOutlined, 
  ArrowRightOutlined, 
  LoginOutlined, 
  EyeOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { Session } from "../../../../types/session";

const { Title, Text } = Typography;

interface TodayScheduleProps {
  todaySessions: Session[];
}

export default function TodaySchedule({ todaySessions = [] }: TodayScheduleProps) {
  const navigate = useNavigate();

  const formatTimeOnly = (isoString?: string) => {
    if (!isoString) return "--:--";
    try {
      const d = new Date(isoString);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return "--:--";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarOutlined className="text-indigo-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Lịch dạy hôm nay</Title>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] font-bold text-indigo-600 ml-1">
            {todaySessions.length} ca
          </span>
        </div>
        <Button 
          type="link" 
          onClick={() => navigate("/teacher/schedule")}
          className="font-semibold text-indigo-600 p-0 text-[13px] cursor-pointer"
        >
          Xem toàn bộ lịch giảng <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      {todaySessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center flex flex-col items-center justify-center">
          <CheckCircleOutlined className="text-3xl text-emerald-500 mb-2" />
          <Text strong className="text-[14px] text-gray-700">Hôm nay không có lịch dạy trực tuyến</Text>
          <Text type="secondary" className="text-[12px] mt-1">
            Thầy/Cô có thể nghỉ ngơi hoặc kiểm tra lịch các ngày tiếp theo trong tuần.
          </Text>
          <Button 
            onClick={() => navigate("/teacher/schedule")}
            className="mt-3 rounded-xl bg-indigo-50 text-indigo-600 border-0 font-semibold h-8 text-[12px] cursor-pointer"
          >
            Mở thời khóa biểu
          </Button>
        </div>
      ) : (
        <List
          dataSource={todaySessions}
          renderItem={(session) => {
            const isInProgress = session.status === "IN_PROGRESS";
            const isCompleted = session.status === "COMPLETED";
            const isScheduled = session.status === "SCHEDULED";

            const timeStart = formatTimeOnly(session.startDatetime);
            const timeEnd = formatTimeOnly(session.endDatetime);
            
            return (
              <div 
                key={session.id}
                className={`mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl p-3 shadow-sm relative overflow-hidden transition-all ${
                  isInProgress 
                    ? 'bg-[#f4f3ff] border border-indigo-100 border-l-4 border-l-indigo-600' 
                    : 'bg-white border border-transparent hover:border-gray-200'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 pl-1">
                  <div className={`flex flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center min-w-[64px] shadow-sm ${
                    isInProgress ? 'bg-indigo-600 text-white' : 'bg-gray-50'
                  }`}>
                    <span className={`text-base font-bold leading-tight ${!isInProgress && 'text-gray-800'}`}>
                      {timeStart}
                    </span>
                    <span className={`text-[11px] font-medium leading-tight ${isInProgress ? 'text-white/80' : 'text-gray-400'}`}>
                      {timeEnd}
                    </span>
                  </div>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Title level={5} style={{ margin: 0, fontSize: '15px' }}>
                        {session.title || session.className || "Buổi học trực tuyến"}
                      </Title>
                      {isInProgress && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wide">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                          Đang diễn ra
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Đã kết thúc
                        </span>
                      )}
                      {isScheduled && (
                        <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          Sắp diễn ra
                        </span>
                      )}
                    </div>
                    <Text type="secondary" className="mt-0.5 flex items-center gap-2 text-[13px]">
                      {session.className || "Lớp học trực tuyến"} • Phòng học LiveKit
                    </Text>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:self-center pr-1">
                  {isInProgress || isScheduled ? (
                    <Button 
                      type="primary" 
                      onClick={() => navigate(`/classroom/${session.id}`)}
                      className="bg-indigo-600 shadow-md shadow-indigo-600/25 rounded-[10px] border-0 h-9 px-3.5 flex items-center text-[13px] font-semibold cursor-pointer"
                    >
                      <LoginOutlined className="mr-1" /> Vào lớp Live
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => navigate(`/teacher/classes/${session.classId}`)}
                      className="rounded-[10px] h-9 px-3 bg-gray-50 border-0 flex items-center text-[13px] font-medium hover:bg-gray-100 cursor-pointer"
                    >
                      <EyeOutlined className="mr-1 text-gray-500" /> Xem chi tiết
                    </Button>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
