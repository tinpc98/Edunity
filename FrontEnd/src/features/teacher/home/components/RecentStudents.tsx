import { Card, Typography, List, Tag, Button } from "antd";
import { ArrowRightOutlined, BookOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ClassModel } from "../../../../types/class";

const { Title, Text } = Typography;

interface RecentStudentsProps {
  classes?: ClassModel[];
  total?: number;
}

/**
 * Replaces mock fake student roster with real-data Class Status Summary
 * to avoid N+1 queries and avoid collision with Teacher Student Roster teammate work.
 */
export default function RecentStudents({ classes = [], total = 0 }: RecentStudentsProps) {
  const navigate = useNavigate();

  const displayList = classes.slice(0, 4);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <Tag color="green" className="rounded-md border-0 font-bold m-0 text-[10px]">Đang mở</Tag>;
      case "IN_PROGRESS":
        return <Tag color="cyan" className="rounded-md border-0 font-bold m-0 text-[10px]">Đang học</Tag>;
      case "PENDING_APPROVAL":
        return <Tag color="gold" className="rounded-md border-0 font-bold m-0 text-[10px]">Chờ duyệt</Tag>;
      case "COMPLETED":
        return <Tag color="default" className="rounded-md border-0 font-bold m-0 text-[10px]">Kết thúc</Tag>;
      default:
        return <Tag className="rounded-md border-0 font-bold m-0 text-[10px]">{status}</Tag>;
    }
  };

  return (
    <Card 
      className="rounded-2xl shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100" 
      styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BookOutlined className="text-teal-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>Tiến độ lớp học</Title>
        </div>
        <Tag color="cyan" className="rounded-full px-2 py-0.5 text-[10px] font-bold border-0">
          {total} lớp
        </Tag>
      </div>

      {displayList.length === 0 ? (
        <div className="py-4 text-center text-gray-400 text-[12px]">
          Chưa có dữ liệu lớp học.
        </div>
      ) : (
        <List
          dataSource={displayList}
          split={false}
          className="w-full"
          renderItem={(cls) => (
            <List.Item 
              onClick={() => navigate(`/teacher/classes/${cls.id}`)}
              className="px-0 py-2 group hover:bg-gray-50 rounded-lg transition-colors cursor-pointer border-0"
            >
              <div className="flex items-center justify-between gap-2 w-full px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <Text strong className="truncate group-hover:text-indigo-600 transition-colors text-[13px]">
                      {cls.className}
                    </Text>
                    <Text type="secondary" className="truncate text-[11px]">
                      {cls.enrolledCount || 0}/{cls.capacity} học viên • {cls.classType === "PAID" ? "Thu phí" : "Miễn phí"}
                    </Text>
                  </div>
                </div>
                <div className="shrink-0">
                  {getStatusBadge(cls.status)}
                </div>
              </div>
            </List.Item>
          )}
        />
      )}

      <div className="pt-1 mt-1">
        <Button 
          block 
          type="text" 
          onClick={() => navigate("/teacher/classes")}
          className="bg-gray-50 text-indigo-600 font-bold h-9 hover:bg-gray-100 rounded-xl flex items-center justify-center text-[12px] cursor-pointer"
        >
          Xem tất cả lớp học ({total}) <ArrowRightOutlined />
        </Button>
      </div>
    </Card>
  );
}
