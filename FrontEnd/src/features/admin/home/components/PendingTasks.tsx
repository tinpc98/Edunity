import { Typography, Button, List, Tag } from "antd";
import { IdcardOutlined, ReadOutlined, SyncOutlined, QuestionCircleOutlined, CheckSquareOutlined } from "@ant-design/icons";
import { pendingTasks } from "../../../../data/mockAdminDashboard";

const { Title, Text } = Typography;

export default function PendingTasks() {
  const getIconConfig = (type: string) => {
    switch(type) {
      case 'teacher': return { icon: IdcardOutlined, bg: 'bg-amber-50', text: 'text-amber-600', tagColor: 'gold' };
      case 'scholarship': return { icon: ReadOutlined, bg: 'bg-indigo-50', text: 'text-indigo-600', tagColor: 'geekblue' };
      case 'transaction': return { icon: SyncOutlined, bg: 'bg-rose-50', text: 'text-rose-600', tagColor: 'error' };
      case 'complaint': return { icon: QuestionCircleOutlined, bg: 'bg-orange-50', text: 'text-orange-600', tagColor: 'volcano' };
      default: return { icon: CheckSquareOutlined, bg: 'bg-gray-50', text: 'text-gray-600', tagColor: 'default' };
    }
  };

  const getActionLabel = (type: string) => {
    switch(type) {
      case 'teacher': return 'Xem danh sách';
      case 'scholarship': return 'Xử lý hồ sơ';
      case 'transaction': return 'Kiểm tra ngay';
      case 'complaint': return 'Xem chi tiết';
      default: return 'Xử lý';
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Cần xử lý gấp</Title>
        </div>
        <Text type="secondary" className="text-[11px]">Ưu tiên theo thời gian tồn đọng</Text>
      </div>

      <List
        dataSource={pendingTasks}
        split={false}
        renderItem={(task) => {
          const config = getIconConfig(task.type);
          const isUrgent = task.type === 'transaction';
          const IconComponent = config.icon;
          
          return (
            <div className={`mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl transition-all ${isUrgent ? 'bg-rose-50/50 hover:bg-rose-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg ${config.bg} ${config.text} flex items-center justify-center shrink-0 shadow-sm`}>
                  <IconComponent className="text-[18px]" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <Text strong className="text-[13px]">{task.title}</Text>
                    <Tag color={config.tagColor} className="m-0 border-0 font-bold rounded-full px-1.5 py-0 text-[10px] leading-tight">
                      {task.count > 0 ? `(${task.count})` : ''} 
                    </Tag>
                  </div>
                  <Text type="secondary" className="text-[12px] leading-tight">{task.desc}</Text>
                </div>
              </div>
              <Button 
                type={isUrgent ? 'primary' : 'default'}
                danger={isUrgent}
                className={`self-end sm:self-center shrink-0 rounded-[10px] font-semibold shadow-sm h-8 px-3 text-[12px] ${!isUrgent ? 'bg-white border border-gray-200 hover:text-indigo-600' : ''}`}
              >
                {getActionLabel(task.type)}
              </Button>
            </div>
          );
        }}
      />
    </div>
  );
}
