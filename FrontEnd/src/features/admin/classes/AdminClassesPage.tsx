import { useState } from 'react';
import { Typography, Tabs, Table, Tag, Button, Input, Card, Badge, Space, Select } from 'antd';
import { 
  SearchOutlined, 
  EyeOutlined, 
  ClockCircleOutlined,
  BookOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import { classService, classKeys } from '../../../services/class.service';
import type { ClassModel, ClassStatus } from '../../../types/class';
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from '../../../types/class';

const { Title, Text } = Typography;

export default function AdminClassesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [pendingPage, setPendingPage] = useState(1);
  const [allPage, setAllPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 1. Pending Classes Query (Backend endpoint: GET /api/admin/classes/pending)
  const { 
    data: pendingData, 
    isLoading: isPendingLoading
  } = useQuery({
    queryKey: classKeys.adminPending({ page: pendingPage }),
    queryFn: () => classService.listPendingClasses({ page: pendingPage, pageSize: 10 }),
    staleTime: 1000 * 30,
  });

  // 2. All Public / System Classes Query for monitoring (Backend endpoint: GET /api/classes)
  const { 
    data: allData, 
    isLoading: isAllLoading
  } = useQuery({
    queryKey: classKeys.publicList({ 
      page: allPage, 
      search: searchTerm || undefined, 
      statuses: statusFilter !== 'all' ? statusFilter : undefined 
    }),
    queryFn: () => classService.getClasses({ 
      page: allPage, 
      pageSize: 10,
      search: searchTerm || undefined,
      statuses: statusFilter !== 'all' ? statusFilter : undefined,
    }),
    enabled: activeTab === 'all',
    staleTime: 1000 * 30,
  });

  const pendingCount = pendingData?.total ?? 0;

  const columns = [
    {
      title: 'Lớp học',
      dataIndex: 'className',
      key: 'className',
      render: (text: string, record: ClassModel) => (
        <div>
          <div className="font-semibold text-gray-900 text-sm hover:text-indigo-600 transition-colors">
            {text}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Khóa: <span className="text-indigo-600 font-medium">{record.courseTitle}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Giảng viên',
      dataIndex: 'teacherName',
      key: 'teacherName',
      render: (text: string) => (
        <span className="font-medium text-gray-700 text-sm">{text || 'Giảng viên'}</span>
      ),
    },
    {
      title: 'Loại hình / Học phí',
      key: 'classType',
      render: (_: any, record: ClassModel) => (
        <div>
          <Tag color={record.classType === 'PAID' ? 'indigo' : 'green'} className="!m-0 font-bold text-xs">
            {record.classType}
          </Tag>
          <div className="text-xs font-semibold text-gray-700 mt-1">
            {record.formattedPrice}
          </div>
        </div>
      ),
    },
    {
      title: 'Sĩ số',
      dataIndex: 'capacity',
      key: 'capacity',
      render: (capacity: number, record: ClassModel) => (
        <span className="text-xs text-gray-600 font-medium">
          {record.enrolledCount} / {capacity}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: ClassStatus) => (
        <Tag color={CLASS_STATUS_COLORS[status]} className="font-semibold text-xs !m-0">
          {CLASS_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Khai giảng',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (date?: string | null) => (
        <span className="text-xs text-gray-500">
          {date ? new Date(date).toLocaleDateString('vi-VN') : 'Chưa đặt'}
        </span>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      render: (_: any, record: ClassModel) => (
        <Button 
          type="primary" 
          size="small"
          icon={<EyeOutlined />}
          className="bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium text-xs"
          onClick={() => navigate(((ROUTES.ADMIN as any).CLASS_DETAIL || "/admin/classes/:classId").replace(":classId", record.id))}
        >
          {record.status === 'PENDING_APPROVAL' ? 'Xét duyệt' : 'Chi tiết'}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Quản lý Lớp học</Title>
          <Text className="text-gray-500">
            Giám sát, theo dõi và phê duyệt mở lớp trực tuyến từ các giảng viên
          </Text>
        </div>
      </div>

      {/* Main Tabs */}
      <Card className="rounded-2xl shadow-sm border-gray-100 p-2">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'pending' | 'all')}
          size="large"
          className="font-medium"
          items={[
            {
              key: 'pending',
              label: (
                <Space>
                  <ClockCircleOutlined />
                  <span>Hàng đợi chờ duyệt</span>
                  {pendingCount > 0 && (
                    <Badge count={pendingCount} className="ml-1" />
                  )}
                </Space>
              ),
              children: (
                <div className="mt-4">
                  <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={pendingData?.items || []}
                    loading={isPendingLoading}
                    pagination={{
                      current: pendingPage,
                      pageSize: pendingData?.pageSize || 10,
                      total: pendingData?.total || 0,
                      onChange: (page) => setPendingPage(page),
                      showTotal: (total) => `Tổng số ${total} lớp chờ duyệt`,
                    }}
                    className="overflow-x-auto"
                  />
                </div>
              ),
            },
            {
              key: 'all',
              label: (
                <Space>
                  <BookOutlined />
                  <span>Tất cả lớp học hệ thống</span>
                </Space>
              ),
              children: (
                <div className="mt-4 flex flex-col gap-4">
                  {/* Filters Bar */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      placeholder="Tìm kiếm theo tên lớp, khóa học..."
                      prefix={<SearchOutlined className="text-gray-400" />}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full md:w-[300px] rounded-lg"
                      allowClear
                    />
                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      className="w-[180px]"
                      options={[
                        { value: 'all', label: 'Tất cả trạng thái' },
                        { value: 'OPEN', label: 'Đang mở (OPEN)' },
                        { value: 'IN_PROGRESS', label: 'Đang học (IN_PROGRESS)' },
                        { value: 'COMPLETED', label: 'Hoàn thành (COMPLETED)' },
                        { value: 'CANCELLED', label: 'Đã hủy (CANCELLED)' },
                      ]}
                    />
                  </div>

                  <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={allData?.items || []}
                    loading={isAllLoading}
                    pagination={{
                      current: allPage,
                      pageSize: allData?.pageSize || 10,
                      total: allData?.total || 0,
                      onChange: (page) => setAllPage(page),
                      showTotal: (total) => `Tổng số ${total} lớp học`,
                    }}
                    className="overflow-x-auto"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
