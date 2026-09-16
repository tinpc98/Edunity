import { Card, Typography, List, Avatar, Button, Badge } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { recentMessages } from "../../../../data/mockTeacherDashboard";

const { Title, Text } = Typography;

export default function RecentMessages() {
  return (
    <Card 
      className="rounded-2xl shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100" 
      styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageOutlined className="text-indigo-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Tin nhắn gần đây</Title>
        </div>
        <span className="h-2 w-2 rounded-full bg-rose-600"></span>
      </div>

      <List
        dataSource={recentMessages}
        split={false}
        className="w-full"
        renderItem={(msg) => (
          <List.Item className={`px-2 py-2.5 rounded-xl transition-colors cursor-pointer border-0 mb-1.5 ${msg.isUnread ? 'bg-[#f4f3ff] hover:bg-indigo-50' : 'hover:bg-gray-50'}`}>
            <div className="flex items-start gap-2.5 w-full">
              <Badge dot={msg.isUnread} color="#e11d48">
                <Avatar size={36} className={msg.isUnread ? 'bg-indigo-600 text-[13px]' : 'bg-gray-100 text-gray-500 font-bold text-[13px]'}>
                  {msg.initials}
                </Avatar>
              </Badge>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <Text strong className="truncate text-[13px]">{msg.name}</Text>
                  <Text type="secondary" className={`text-[10px] flex-shrink-0 ${msg.isUnread ? 'text-rose-600 font-semibold' : ''}`}>{msg.time}</Text>
                </div>
                <Text className={`truncate mt-0 text-[12px] ${msg.isUnread ? 'font-medium' : 'text-gray-500'}`}>{msg.text}</Text>
              </div>
            </div>
          </List.Item>
        )}
      />

      <div className="pt-1 mt-1">
        <Button block type="text" className="bg-gray-50 text-indigo-600 font-bold h-9 hover:bg-gray-100 rounded-xl flex items-center justify-center text-[12px]">
          Mở hộp thư tin nhắn <MessageOutlined className="ml-1 text-[14px]" />
        </Button>
      </div>
    </Card>
  );
}
