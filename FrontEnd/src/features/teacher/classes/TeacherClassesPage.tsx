import { useState } from 'react';
import { Typography, Input, Button, Tabs, Card, Tag, Progress, Dropdown, Row, Col, Select } from 'antd';
import type { MenuProps } from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined, 
  VideoCameraOutlined,
  TeamOutlined,
  StarFilled,
  MoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ScheduleOutlined,
  BookOutlined,
  UsergroupAddOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';
import { teacherClasses, teacherClassSummary } from '../../../data/mockTeacherClasses';

const { Title, Text } = Typography;

export default function TeacherClassesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');

  const filteredClasses = teacherClasses.filter(c => {
    if (activeTab === 'all') return true;
    if (activeTab === 'enrolling') return c.status === 'ENROLLING';
    if (activeTab === 'upcoming') return c.status === 'UPCOMING';
    if (activeTab === 'active') return c.status === 'ACTIVE';
    if (activeTab === 'completed') return c.status === 'COMPLETED';
    return true;
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <Tag color="success">Đang học</Tag>;
      case 'ENROLLING': return <Tag color="warning">Đang tuyển sinh</Tag>;
      case 'UPCOMING': return <Tag color="processing">Sắp khai giảng</Tag>;
      case 'COMPLETED': return <Tag color="default">Đã kết thúc</Tag>;
      default: return null;
    }
  };

  const getActionMenu = (): MenuProps['items'] => [
    { key: 'edit', label: 'Chỉnh sửa' },
    { key: 'schedule', label: 'Quản lý lịch' },
    { key: 'sessions', label: 'Quản lý buổi học' },
    { key: 'close_enrollment', label: 'Đóng tuyển sinh', danger: true },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!m-0 text-indigo-700 uppercase !text-[12px] font-bold tracking-wider mb-1">Hệ thống giảng dạy 2026</Title>
          <Title level={2} className="!m-0 text-gray-900">Lớp của tôi</Title>
          <Text className="text-gray-500">Quản lý tất cả lớp học bạn đang phụ trách, theo dõi tiến độ tuyển sinh và bài giảng</Text>
        </div>
        <div className="flex flex-row items-center gap-3">
          <Input 
            placeholder="Tìm kiếm lớp học..." 
            prefix={<SearchOutlined className="text-gray-400" />} 
            className="w-full md:w-[250px] rounded-lg"
            size="large"
          />
          <Select defaultValue="all" size="large" className="w-[120px]"
            options={[
              { value: 'all', label: 'Bộ lọc' },
              { value: 'free', label: 'FREE' },
              { value: 'paid', label: 'PAID' }
            ]}
          />
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="large"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate(ROUTES.TEACHER.CREATE_CLASS)}
          >
            Tạo lớp mới
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Lớp đang hoạt động</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{teacherClassSummary.activeClasses}</Title>
              <Text className="text-emerald-500 text-sm font-medium mb-1">+1 tháng này</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Đang giảng dạy đều đặn</Text>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <BookOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Tổng học viên</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{teacherClassSummary.totalStudents}</Title>
              <Text className="text-gray-500 text-sm font-medium mb-1">88% tỷ lệ lấp đầy</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Đang tham gia học</Text>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <TeamOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Đang tuyển sinh</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{teacherClassSummary.enrolling}</Title>
              <Text className="text-indigo-600 font-medium mb-1">Đang mở đơn</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Còn 15 suất tuyển sinh</Text>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <UsergroupAddOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Sắp khai giảng</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{teacherClassSummary.upcoming}</Title>
              <Text className="text-rose-500 font-medium mb-1">Trong 7 ngày</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Chuẩn bị bài giảng</Text>
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
                <ScheduleOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        className="mt-2 font-medium"
        items={[
          { key: 'all', label: `Tất cả (${teacherClasses.length})` },
          { key: 'enrolling', label: `Đang tuyển sinh (${teacherClasses.filter(c => c.status === 'ENROLLING').length})` },
          { key: 'upcoming', label: `Sắp khai giảng (${teacherClasses.filter(c => c.status === 'UPCOMING').length})` },
          { key: 'active', label: `Đang học (${teacherClasses.filter(c => c.status === 'ACTIVE').length})` },
          { key: 'completed', label: `Đã kết thúc (${teacherClasses.filter(c => c.status === 'COMPLETED').length})` },
        ]}
      />

      {/* Class List */}
      <div className="flex flex-col gap-5">
        {filteredClasses.map((cls) => {
          const progressPercent = Math.round((cls.enrolled / cls.capacity) * 100);
          
          return (
            <Card key={cls.id} className="rounded-2xl shadow-sm border-gray-200 overflow-hidden" bodyStyle={{ padding: 0 }}>
              <div className="flex flex-col md:flex-row">
                
                {/* Thumbnail Side */}
                <div className="md:w-[280px] h-[200px] bg-slate-100 relative shrink-0">
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Tag color={cls.type === 'PAID' ? 'indigo' : 'green'} className="!m-0 rounded border-0 font-bold tracking-wider">{cls.type}</Tag>
                    {getStatusTag(cls.status)}
                  </div>
                  
                  {/* Mock thumbnail based on ID */}
                  <img src={`https://picsum.photos/seed/${cls.id}/600/400`} alt={cls.name} className="w-full h-full object-cover" />
                  
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
                    <VideoCameraOutlined /> {cls.totalSessions} buổi
                  </div>
                  {cls.rating > 0 && (
                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <StarFilled className="text-yellow-400" /> {cls.rating} ({cls.reviewCount})
                    </div>
                  )}
                </div>

                {/* Content Side */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <Text className="text-indigo-600 text-xs font-bold uppercase tracking-wider">{cls.courseName}</Text>
                      <Title level={4} className="!m-0 !mt-1 text-gray-900">{cls.name}</Title>
                    </div>
                    <Dropdown menu={{ items: getActionMenu() }} trigger={['click']}>
                      <Button type="text" icon={<MoreOutlined className="text-gray-500 text-lg" />} />
                    </Dropdown>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6 mt-4 mb-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <ClockCircleOutlined className="text-indigo-500" />
                      <span className="text-sm">{cls.schedule}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <CalendarOutlined className="text-indigo-500" />
                      <span className="text-sm">Khai giảng: <span className="font-semibold text-gray-800">{cls.startDate}</span></span>
                    </div>
                    {cls.type === 'PAID' && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Tag color="green" className="!m-0 rounded px-2">
                          <span className="text-[13px] font-semibold">{cls.price?.toLocaleString('vi-VN')}đ</span> /khóa
                        </Tag>
                      </div>
                    )}
                    {cls.type === 'FREE' && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Tag color="green" className="!m-0 rounded px-2">Miễn phí (Cộng đồng)</Tag>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-xl mb-4 border border-gray-100">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 flex items-center gap-1"><TeamOutlined /> Sĩ số lớp:</span>
                      <span className="font-medium text-gray-800">{cls.enrolled} / {cls.capacity} học viên <span className={progressPercent >= 100 ? 'text-emerald-500' : progressPercent >= 80 ? 'text-amber-500' : 'text-indigo-500'}>({progressPercent}%)</span></span>
                    </div>
                    <Progress percent={progressPercent} showInfo={false} strokeColor={progressPercent >= 100 ? '#10B981' : '#4F46E5'} trailColor="#E2DFFF" size="small" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      {cls.nextSession ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <Text className="text-gray-600">Buổi tiếp theo: <span className="font-medium text-gray-800">{cls.nextSession.date} {cls.nextSession.time} (Buổi {cls.nextSession.sessionNumber})</span></Text>
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <Text className="text-gray-600">Trạng thái: <span className="font-medium text-gray-800">{cls.status === 'ENROLLING' ? 'Đang nhận hồ sơ học viên' : cls.status === 'COMPLETED' ? 'Lớp đã kết thúc' : 'Chưa có lịch'}</span></Text>
                        </>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      <Button className="rounded-lg font-medium text-indigo-600 bg-indigo-50 border-0 hover:bg-indigo-100">Xem học viên</Button>
                      <Button type="primary" className="rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate(`/teacher/classes/${cls.id}`)}>
                        Quản lý lớp
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
