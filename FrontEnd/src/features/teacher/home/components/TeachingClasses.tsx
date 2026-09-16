import { Typography, Button, Card, Row, Col, Tag, Progress } from "antd";
import { StarFilled, BookOutlined, ArrowRightOutlined, MoreOutlined, CalendarOutlined } from "@ant-design/icons";
import { activeClasses } from "../../../../data/mockTeacherDashboard";

const { Title, Text } = Typography;

export default function TeachingClasses() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOutlined className="text-indigo-600 text-[20px]" />
          <Title level={4} style={{ margin: 0, fontSize: '18px' }}>Lớp đang giảng dạy</Title>
        </div>
        <Button type="link" className="font-semibold text-indigo-600 p-0 text-[13px]">
          Xem tất cả lớp (4) <ArrowRightOutlined className="ml-1" />
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {activeClasses.map(cls => (
          <Col xs={24} md={12} xl={8} key={cls.id}>
            <Card 
              hoverable 
              cover={
                <div className="relative h-28 w-full bg-gray-100">
                  <img alt={cls.title} src={cls.image} className="h-full w-full object-cover" />
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <Tag className="m-0 rounded-[6px] bg-white/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 border-0 shadow-sm uppercase tracking-wide">{cls.type}</Tag>
                    <Tag className="m-0 rounded-[6px] bg-teal-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border-0 shadow-sm uppercase tracking-wide">{cls.status}</Tag>
                  </div>
                  <Button 
                    shape="circle" 
                    type="text" 
                    className="absolute top-2 right-2 bg-white/80 backdrop-blur-md border-0 text-gray-600 hover:text-indigo-600 flex items-center justify-center w-6 h-6 min-w-0 p-0"
                  >
                    <MoreOutlined className="text-[14px]" />
                  </Button>
                </div>
              }
              styles={{ body: { padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' } }}
              className="h-full rounded-2xl overflow-hidden shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] border border-gray-100"
            >
              <div className="flex flex-col gap-1 mb-2 flex-1">
                <div className="flex items-center gap-1.5 text-teal-600 text-[11px] font-semibold">
                  <CalendarOutlined className="text-[12px]" />
                  <span>{cls.schedule}</span>
                </div>
                <Title level={5} className="line-clamp-2 leading-snug m-0 text-[14px]">{cls.title}</Title>
              </div>
              
              <div className="flex flex-col gap-1.5 mt-auto pt-1 border-t border-gray-50">
                <div className="flex items-center justify-between text-[12px]">
                  <Text type="secondary" className="text-[11px]">Sĩ số lớp</Text>
                  <Text strong className="text-[12px]">{cls.studentsJoined} / {cls.capacity} học viên</Text>
                </div>
                
                <Progress percent={Math.round((cls.studentsJoined / cls.capacity) * 100)} showInfo={false} strokeColor="#4f46e5" trailColor="#f0f0f0" className="m-0 leading-none" strokeWidth={6} />
                
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 text-[11px] text-amber-700">
                    <StarFilled className="text-amber-500 text-[12px]" />
                    <strong className="font-bold text-[12px]">{cls.rating}</strong>
                    <Text type="secondary" className="text-[11px]">({cls.reviews})</Text>
                  </div>
                  <Button type="primary" className="rounded-lg bg-indigo-50 text-indigo-600 font-bold border-0 hover:bg-indigo-600 hover:text-white shadow-none h-7 px-2.5 text-[11px]">
                    Quản lý lớp
                  </Button>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
