import { Typography, Timeline } from "antd";
import { recentActivities } from "../../../../data/mockAdminDashboard";
import { ClockCircleOutlined, CheckCircleOutlined, GiftOutlined, WarningOutlined, HistoryOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function RecentActivities() {
  const getIcon = (type: string) => {
    switch(type) {
      case 'teacher': return <CheckCircleOutlined className="text-teal-500 bg-white text-[14px]" />;
      case 'scholarship': return <GiftOutlined className="text-indigo-600 bg-white text-[14px]" />;
      case 'transaction': return <WarningOutlined className="text-rose-500 bg-white text-[14px]" />;
      default: return <ClockCircleOutlined className="text-gray-400 bg-white text-[14px]" />;
    }
  };

  const getColor = (type: string) => {
    switch(type) {
      case 'teacher': return 'green';
      case 'scholarship': return 'blue';
      case 'transaction': return 'red';
      default: return 'gray';
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center shadow-sm">
            <HistoryOutlined className="text-[16px]" />
          </div>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Hoạt động gần đây</Title>
        </div>
        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
      </div>

      <Timeline
        className="mt-1"
        items={recentActivities.map((act) => ({
          color: getColor(act.type),
          dot: getIcon(act.type),
          children: (
            <div className="flex flex-col pb-3">
              <div className="flex items-center justify-between">
                <Text strong className={`text-[12px] ${act.type === 'teacher' ? 'text-teal-600' : act.type === 'scholarship' ? 'text-indigo-600' : 'text-rose-600'}`}>
                  {act.title}
                </Text>
                <Text type="secondary" className="text-[10px] ml-2 shrink-0">{act.time}</Text>
              </div>
              <Text className="text-[12px] mt-0.5 text-gray-600 leading-snug">{act.desc}</Text>
            </div>
          ),
        }))}
      />
    </div>
  );
}
