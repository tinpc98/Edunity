import { useState, useMemo } from 'react';
import { Typography, Input, Button, Tabs, Card, Tag, Progress, Row, Col, Select, Skeleton, Alert, Empty } from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined, 
  TeamOutlined, 
  CalendarOutlined, 
  ClockCircleOutlined, 
  BookOutlined, 
  ClockCircleTwoTone,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import { classService, classKeys } from '../../../services/class.service';
import type { ClassStatus, ClassModel } from '../../../types/class';
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from '../../../types/class';
import { deriveScheduleText } from '../../../api/classAdapters';

const { Title, Text } = Typography;

export default function TeacherClassesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: classKeys.teacherList(),
    queryFn: () => classService.listMyClasses({ pageSize: 100 }),
    staleTime: 1000 * 30,
  });

  const allClasses = useMemo(() => data?.items || [], [data]);

  // Client filtering for fast instant search/filter responsiveness
  const filteredClasses = useMemo(() => {
    return allClasses.filter((c: ClassModel) => {
      // Tab filter
      if (activeTab !== 'all' && c.status !== activeTab) {
        return false;
      }
      // Type filter
      if (filterType !== 'all' && c.classType !== filterType) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesName = c.className.toLowerCase().includes(q);
        const matchesCourse = c.courseTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesCourse) return false;
      }
      return true;
    });
  }, [allClasses, activeTab, filterType, searchTerm]);

  // Statistics summaries
  const stats = useMemo(() => {
    const total = allClasses.length;
    const active = allClasses.filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length;
    const pending = allClasses.filter((c) => c.status === 'PENDING_APPROVAL').length;
    const totalStudents = allClasses.reduce((acc, c) => acc + (c.enrolledCount || 0), 0);
    return { total, active, pending, totalStudents };
  }, [allClasses]);

  const getStatusTag = (status: ClassStatus) => {
    return (
      <Tag color={CLASS_STATUS_COLORS[status]} className="!m-0 rounded border-0 font-bold">
        {CLASS_STATUS_LABELS[status] || status}
      </Tag>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!m-0 text-indigo-700 uppercase !text-[12px] font-bold tracking-wider mb-1">
            Hệ thống giảng dạy
          </Title>
          <Title level={2} className="!m-0 text-gray-900">Lớp của tôi</Title>
          <Text className="text-gray-500">
            Quản lý tất cả lớp học bạn đang phụ trách, theo dõi tiến độ duyệt và tuyển sinh
          </Text>
        </div>
        <div className="flex flex-row items-center gap-3">
          <Input 
            placeholder="Tìm kiếm lớp học..." 
            prefix={<SearchOutlined className="text-gray-400" />} 
            className="w-full md:w-[250px] rounded-lg"
            size="large"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
          />
          <Select 
            value={filterType} 
            onChange={setFilterType}
            size="large" 
            className="w-[130px]"
            options={[
              { value: 'all', label: 'Tất cả loại' },
              { value: 'FREE', label: 'Miễn phí' },
              { value: 'PAID', label: 'Có phí' }
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
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Tổng số lớp</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{stats.total}</Title>
              <Text className="text-gray-400 text-sm font-medium mb-1">lớp</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Hồ sơ lớp giảng dạy</Text>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <BookOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Đang mở / Giảng dạy</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-emerald-600 !text-4xl">{stats.active}</Title>
              <Text className="text-emerald-500 text-sm font-medium mb-1">hoạt động</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Đang mở tuyển / học</Text>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircleOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Chờ xét duyệt</Text>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-amber-600 !text-4xl">{stats.pending}</Title>
              <Text className="text-amber-500 text-sm font-medium mb-1">chờ duyệt</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Đang gửi Admin</Text>
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <ClockCircleTwoTone twoToneColor="#d97706" className="text-xl" />
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
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{stats.totalStudents}</Title>
              <Text className="text-indigo-600 text-sm font-medium mb-1">học viên</Text>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Text className="text-gray-500 text-sm">Đã ghi danh thực tế</Text>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <TeamOutlined className="text-xl" />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Tabs by Status */}
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        className="mt-2 font-medium"
        items={[
          { key: 'all', label: `Tất cả (${allClasses.length})` },
          { key: 'OPEN', label: `Đang mở (${allClasses.filter(c => c.status === 'OPEN').length})` },
          { key: 'PENDING_APPROVAL', label: `Chờ duyệt (${allClasses.filter(c => c.status === 'PENDING_APPROVAL').length})` },
          { key: 'DRAFT', label: `Bản nháp (${allClasses.filter(c => c.status === 'DRAFT').length})` },
          { key: 'IN_PROGRESS', label: `Đang học (${allClasses.filter(c => c.status === 'IN_PROGRESS').length})` },
          { key: 'REJECTED', label: `Bị từ chối (${allClasses.filter(c => c.status === 'REJECTED').length})` },
          { key: 'COMPLETED', label: `Hoàn thành (${allClasses.filter(c => c.status === 'COMPLETED').length})` },
          { key: 'CANCELLED', label: `Đã hủy (${allClasses.filter(c => c.status === 'CANCELLED').length})` },
        ]}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách lớp học"
          description={(error as any)?.message || "Vui lòng thử lại sau."}
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* Empty state */}
      {!isLoading && !isError && filteredClasses.length === 0 && (
        <Card className="rounded-2xl border-dashed border-gray-300 py-12 text-center">
          <Empty
            description={
              <span className="text-gray-500">
                Chưa có lớp học nào trong danh mục này.
              </span>
            }
          >
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => navigate(ROUTES.TEACHER.CREATE_CLASS)}
            >
              Tạo lớp mới ngay
            </Button>
          </Empty>
        </Card>
      )}

      {/* Class List */}
      {!isLoading && !isError && filteredClasses.length > 0 && (
        <div className="flex flex-col gap-5">
          {filteredClasses.map((cls: ClassModel) => {
            const progressPercent = cls.capacity > 0 
              ? Math.min(100, Math.round((cls.enrolledCount / cls.capacity) * 100))
              : 0;
            const scheduleDisplay = deriveScheduleText(cls.schedule);
            const formattedStartDate = cls.startDate
              ? new Date(cls.startDate).toLocaleDateString('vi-VN')
              : 'Chưa đặt';
            
            return (
              <Card 
                key={cls.id} 
                className="rounded-2xl shadow-sm border-gray-200 overflow-hidden hover:border-indigo-300 transition-all cursor-pointer" 
                onClick={() => navigate(ROUTES.TEACHER.CLASS_DETAIL.replace(":classId", cls.id))}
              >
                <div className="flex flex-col md:flex-row gap-5">
                  {/* Thumbnail Side */}
                  <div className="md:w-[240px] h-[160px] bg-slate-100 rounded-xl relative shrink-0 overflow-hidden">
                    <img 
                      src={cls.coverImage || `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80`} 
                      alt={cls.className} 
                      className="w-full h-full object-cover" 
                    />
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
                      <Tag color={cls.classType === 'PAID' ? 'indigo' : 'green'} className="!m-0 rounded border-0 font-bold tracking-wider">
                        {cls.classType}
                      </Tag>
                      {getStatusTag(cls.status)}
                    </div>
                  </div>

                  {/* Content Side */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <Text className="text-indigo-600 text-xs font-bold uppercase tracking-wider">
                            {cls.courseTitle || "Khóa học"}
                          </Text>
                          <Title level={4} className="!m-0 !mt-0.5 text-gray-900 hover:text-indigo-600 transition-colors">
                            {cls.className}
                          </Title>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-base font-extrabold ${cls.classType === 'FREE' ? 'text-emerald-600' : 'text-indigo-700'}`}>
                            {cls.formattedPrice}
                          </span>
                        </div>
                      </div>

                      {/* Rejection notice if REJECTED */}
                      {cls.status === 'REJECTED' && cls.reviewNote && (
                        <div className="mt-2.5 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-800">
                          <span className="font-semibold">Lý do từ chối: </span>
                          {cls.reviewNote}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 mt-3 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <ClockCircleOutlined className="text-indigo-500" />
                          <span>{scheduleDisplay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CalendarOutlined className="text-indigo-500" />
                          <span>Khai giảng: <strong className="text-gray-800">{formattedStartDate}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
                      {/* Sĩ số */}
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1 font-medium">
                          <TeamOutlined /> Sĩ số: <strong>{cls.enrolledCount} / {cls.capacity}</strong>
                        </span>
                        <div className="w-24">
                          <Progress percent={progressPercent} size="small" showInfo={false} strokeColor="#4f46e5" />
                        </div>
                      </div>

                      {/* Button */}
                      <Button 
                        type="primary" 
                        size="small"
                        className="bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium px-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(ROUTES.TEACHER.CLASS_DETAIL.replace(":classId", cls.id));
                        }}
                      >
                        Quản lý lớp →
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
