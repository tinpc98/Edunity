import { Typography, Button, List } from "antd";
import { todaySessions } from "../../../../data/mockTeacherDashboard";
import { 
  CalendarOutlined, 
  ArrowRightOutlined, 
  LoginOutlined, 
  BarChartOutlined, 
  SettingOutlined 
} from "@ant-design/icons";

const { Title, Text } = Typography;

export default function TodaySchedule() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarOutlined className="text-indigo-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Lịch dạy hôm nay</Title>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] font-bold text-indigo-600 ml-1">3 ca</span>
        </div>
        <Button type="link" className="font-semibold text-indigo-600 p-0 text-[13px]">
          Xem toàn bộ lịch giảng <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      <List
        dataSource={todaySessions}
        renderItem={(session) => {
          const isActive = session.status === "active";
          const isEnded = session.status === "ended";
          
          return (
            <div className={`mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl p-3 shadow-sm relative overflow-hidden transition-all ${isActive ? 'bg-[#f4f3ff] border border-indigo-100 border-l-4 border-l-indigo-600' : 'bg-white border border-transparent hover:border-gray-200'}`}>
              
              <div className="flex items-start sm:items-center gap-3 pl-1">
                <div className={`flex flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center min-w-[64px] shadow-sm ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>
                  <span className={`text-base font-bold leading-tight ${!isActive && 'text-gray-800'}`}>{session.timeStart}</span>
                  <span className={`text-[11px] font-medium leading-tight ${isActive ? 'text-white/80' : 'text-gray-400'}`}>{session.timeEnd}</span>
                </div>
                
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <Title level={5} style={{ margin: 0, fontSize: '15px' }}>{session.title}</Title>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wide">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                        Sắp diễn ra
                      </span>
                    )}
                    {isEnded && <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Đã kết thúc</span>}
                    {!isActive && !isEnded && <span className="inline-flex items-center rounded-md bg-gray-50 border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Chưa bắt đầu</span>}
                  </div>
                  <Text type="secondary" className="mt-0.5 flex items-center gap-2 text-[13px]">
                    {session.details}
                  </Text>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:self-center pr-1">
                {isActive ? (
                  <Button type="primary" className="bg-indigo-600 shadow-md shadow-indigo-600/25 rounded-[10px] border-0 h-9 px-3.5 flex items-center text-[13px] font-semibold">
                    <LoginOutlined className="mr-1" /> Vào lớp ngay
                  </Button>
                ) : isEnded ? (
                  <Button className="rounded-[10px] h-9 px-3 bg-gray-50 border-0 flex items-center text-[13px] font-medium hover:bg-gray-100">
                    <BarChartOutlined className="mr-1 text-gray-500" /> Xem báo cáo
                  </Button>
                ) : (
                  <Button className="rounded-[10px] h-9 px-3 bg-gray-50 border-0 flex items-center text-[13px] font-medium hover:bg-gray-100">
                    <SettingOutlined className="mr-1 text-gray-500" /> Chi tiết
                  </Button>
                )}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
