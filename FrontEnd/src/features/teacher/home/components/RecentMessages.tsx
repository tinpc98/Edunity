import { Card, Typography, List, Avatar, Button } from "antd";
import { MessageOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ConversationItem } from "../../../../types/communication";

const { Title, Text } = Typography;

interface RecentMessagesProps {
  conversations?: ConversationItem[];
}

export default function RecentMessages({ conversations = [] }: RecentMessagesProps) {
  const navigate = useNavigate();

  const formatRelativeTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      const now = Date.now();
      const past = new Date(isoString).getTime();
      const diffMs = now - past;
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return "Vừa xong";
      if (diffMins < 60) return `${diffMins}p trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return new Date(isoString).toLocaleDateString("vi-VN");
    } catch {
      return "";
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

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
        {conversations.length > 0 && (
          <span className="h-2 w-2 rounded-full bg-teal-500"></span>
        )}
      </div>

      {conversations.length === 0 ? (
        <div className="py-4 text-center text-gray-400 text-[12px]">
          Chưa có cuộc trò chuyện nào gần đây.
        </div>
      ) : (
        <List
          dataSource={conversations}
          split={false}
          className="w-full"
          renderItem={(conv) => {
            const partnerName = conv.participant?.fullName || conv.className || "Người dùng";
            const lastText = conv.lastMessagePreview || "Đã bắt đầu cuộc trò chuyện";
            const initials = getInitials(partnerName);

            return (
              <List.Item 
                onClick={() => navigate("/messages")}
                className="px-2 py-2.5 rounded-xl transition-colors cursor-pointer border-0 mb-1.5 hover:bg-gray-50"
              >
                <div className="flex items-start gap-2.5 w-full">
                  <Avatar 
                    size={36} 
                    src={conv.participant?.avatarUrl} 
                    icon={!conv.participant?.avatarUrl && <UserOutlined />}
                    className="bg-indigo-100 text-indigo-600 font-bold text-[13px] shrink-0"
                  >
                    {initials}
                  </Avatar>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <Text strong className="truncate text-[13px]">{partnerName}</Text>
                      <Text type="secondary" className="text-[10px] flex-shrink-0">
                        {formatRelativeTime(conv.lastMessageAt || conv.createdAt)}
                      </Text>
                    </div>
                    <Text className="truncate mt-0 text-[12px] text-gray-500">
                      {lastText}
                    </Text>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}

      <div className="pt-1 mt-1">
        <Button 
          block 
          type="text" 
          onClick={() => navigate("/messages")}
          className="bg-gray-50 text-indigo-600 font-bold h-9 hover:bg-gray-100 rounded-xl flex items-center justify-center text-[12px] cursor-pointer"
        >
          Mở hộp thư tin nhắn <MessageOutlined className="ml-1 text-[14px]" />
        </Button>
      </div>
    </Card>
  );
}
