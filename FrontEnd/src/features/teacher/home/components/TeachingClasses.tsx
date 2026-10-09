import { Typography, Button, Card, Row, Col, Tag, Progress } from "antd";
import { StarFilled, BookOutlined, ArrowRightOutlined, CalendarOutlined, PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ClassModel } from "../../../../types/class";
import { deriveScheduleText } from "../../../../api/classAdapters";

const { Title, Text } = Typography;

interface TeachingClassesProps {
  classes: ClassModel[];
  total: number;
}

export default function TeachingClasses({ classes = [], total = 0 }: TeachingClassesProps) {
  const navigate = useNavigate();

  const getStatusTag = (status: string) => {
    switch(status) {
      case "OPEN": return <Tag className="m-0 rounded-[6px] bg-emerald-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">Tuyển sinh</Tag>;
      case "IN_PROGRESS": return <Tag className="m-0 rounded-[6px] bg-teal-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">Đang học</Tag>;
      case "PENDING_APPROVAL": return <Tag className="m-0 rounded-[6px] bg-amber-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">Chờ duyệt</Tag>;
      case "COMPLETED": return <Tag className="m-0 rounded-[6px] bg-gray-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">Hoàn thành</Tag>;
      case "DRAFT": return <Tag className="m-0 rounded-[6px] bg-indigo-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">Bản nháp</Tag>;
      default: return <Tag className="m-0 rounded-[6px] bg-gray-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">{status}</Tag>;
    }
  };

  const displayClasses = classes.slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOutlined className="text-indigo-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Lớp đang giảng dạy</Title>
        </div>
        <Button 
          type="link" 
          onClick={() => navigate("/teacher/classes")}
          className="font-semibold text-indigo-600 p-0 text-[13px] cursor-pointer"
        >
          Xem tất cả lớp ({total}) <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      {displayClasses.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center flex flex-col items-center justify-center">
          <BookOutlined className="text-3xl text-gray-300 mb-2" />
          <Text strong className="text-[14px] text-gray-700">Chưa có lớp học nào</Text>
          <Text type="secondary" className="text-[12px] mt-1">
            Bắt đầu tạo lớp học đầu tiên của bạn để kết nối với học viên!
          </Text>
          <Button 
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/teacher/classes/create")}
            className="mt-3 rounded-xl bg-indigo-600 font-semibold h-9 text-[12px] cursor-pointer"
          >
            Tạo lớp học mới
          </Button>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {displayClasses.map((cls) => {
            const scheduleStr = deriveScheduleText(cls.schedule) || "Chưa có lịch cố định";
            const enrolled = cls.enrolledCount || 0;
            const capacity = cls.capacity || 1;
            const percent = Math.min(Math.round((enrolled / capacity) * 100), 100);
            const rating = cls.ratingAverage ? cls.ratingAverage.toFixed(1) : "0.0";
            const reviews = cls.ratingCount || 0;

            return (
              <Col xs={24} md={12} xl={8} key={cls.id}>
                <Card 
                  hoverable 
                  cover={
                    <div className="relative h-28 w-full bg-gradient-to-br from-indigo-900 to-indigo-700 overflow-hidden">
                      {cls.coverImage ? (
                        <img alt={cls.className} src={cls.coverImage} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center p-3 text-center">
                          <span className="text-white/80 font-bold text-sm tracking-wide line-clamp-2">
                            {cls.className}
                          </span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        <Tag className="m-0 rounded-[6px] bg-white/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 border-0 shadow-sm uppercase tracking-wide">
                          {cls.classType === "PAID" ? "Học phí" : "Miễn phí"}
                        </Tag>
                        {getStatusTag(cls.status)}
                      </div>
                    </div>
                  }
                  styles={{ body: { padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' } }}
                  className="h-full rounded-2xl overflow-hidden shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100"
                >
                  <div className="flex flex-col gap-1 mb-2 flex-1">
                    <div className="flex items-center gap-1.5 text-teal-600 text-[11px] font-semibold">
                      <CalendarOutlined className="text-[12px]" />
                      <span className="truncate">{scheduleStr}</span>
                    </div>
                    <Title level={5} className="line-clamp-2 leading-snug m-0 text-[14px]">
                      {cls.className}
                    </Title>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 mt-auto pt-1 border-t border-gray-50">
                    <div className="flex items-center justify-between text-[12px]">
                      <Text type="secondary" className="text-[11px]">Sĩ số lớp</Text>
                      <Text strong className="text-[12px]">{enrolled} / {capacity} học viên</Text>
                    </div>
                    
                    <Progress percent={percent} showInfo={false} strokeColor="#4f46e5" railColor="#f0f0f0" className="m-0 leading-none" size={{ height: 6 }} />
                    
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1 text-[11px] text-amber-700">
                        <StarFilled className="text-amber-500 text-[12px]" />
                        <strong className="font-bold text-[12px]">{rating}</strong>
                        <Text type="secondary" className="text-[11px]">({reviews})</Text>
                      </div>
                      <Button 
                        type="primary" 
                        onClick={() => navigate(`/teacher/classes/${cls.id}`)}
                        className="rounded-lg bg-indigo-50 text-indigo-600 font-bold border-0 hover:bg-indigo-600 hover:text-white shadow-none h-7 px-2.5 text-[11px] cursor-pointer"
                      >
                        Quản lý lớp
                      </Button>
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
