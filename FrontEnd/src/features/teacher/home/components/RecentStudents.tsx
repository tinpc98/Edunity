import { Card, Typography, List, Avatar, Tag, Button } from "antd";
import { ArrowRightOutlined, UserAddOutlined } from "@ant-design/icons";
import { newStudents } from "../../../../data/mockTeacherDashboard";

const { Title, Text } = Typography;

export default function RecentStudents() {
  return (
    <Card 
      className="rounded-2xl shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100" 
      styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <UserAddOutlined className="text-teal-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Học viên mới</Title>
        </div>
        <Tag color="cyan" className="rounded-full px-2 py-0.5 text-[10px] font-bold border-0">+3 mới</Tag>
      </div>

      <List
        dataSource={newStudents}
        split={false}
        className="w-full"
        renderItem={(student) => (
          <List.Item className="px-0 py-2 group hover:bg-gray-50 rounded-lg transition-colors cursor-pointer border-0">
            <div className="flex items-center justify-between gap-2 w-full px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex-shrink-0">
                  <Avatar size={36} className={`bg-${student.color === 'blue' ? 'indigo-100 text-indigo-600' : student.color === 'purple' ? 'purple-100 text-purple-600' : 'teal-100 text-teal-600'} font-bold text-[13px]`}>
                    {student.initials}
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-white"></span>
                </div>
                <div className="flex flex-col min-w-0">
                  <Text strong className="truncate group-hover:text-indigo-600 transition-colors text-[13px]">{student.name}</Text>
                  <Text type="secondary" className="truncate text-[11px]">{student.course} • {student.joined}</Text>
                </div>
              </div>
              <Tag color="cyan" className="flex-shrink-0 rounded-md border-0 bg-teal-50 text-teal-700 font-bold m-0 text-[10px]">{student.status}</Tag>
            </div>
          </List.Item>
        )}
      />

      <div className="pt-1 mt-1">
        <Button block type="text" className="bg-gray-50 text-indigo-600 font-bold h-9 hover:bg-gray-100 rounded-xl flex items-center justify-center text-[12px]">
          Xem tất cả học viên (58) <ArrowRightOutlined />
        </Button>
      </div>
    </Card>
  );
}
