import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, Button, Tag, Table, Avatar, Alert } from 'antd';
import { 
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { teacherVerificationService } from '../../../../services/teacherVerification.service';

const { Title, Text } = Typography;

export default function TeacherVerificationPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('PENDING');

  const { data: pagedVerifications, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-teacher-verifications', activeFilter],
    queryFn: () => teacherVerificationService.adminListVerifications(activeFilter, 1, 100),
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'VERIFIED': return <Tag color="success" icon={<CheckCircleOutlined />}>Đã xác minh</Tag>;
      case 'PENDING': return <Tag color="processing" icon={<ClockCircleOutlined />}>Chờ duyệt</Tag>;
      case 'UNVERIFIED': return <Tag color="default">Chưa gửi</Tag>;
      case 'REJECTED': return <Tag color="error" icon={<CloseCircleOutlined />}>Từ chối</Tag>;
      default: return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Giáo viên',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (text: string, record: any) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">{text?.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Chuyên môn',
      dataIndex: 'qualificationSummary',
      key: 'qualificationSummary',
      render: (text: string) => text ? <Tag className="border-0 bg-gray-100 font-medium text-gray-700">{text}</Tag> : <span className="text-gray-400">Không có</span>
    },
    {
      title: 'Ngày cập nhật',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Trạng thái',
      dataIndex: 'verificationStatus',
      key: 'verificationStatus',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, record: any) => (
        <Button 
          type="primary" 
          ghost 
          className="rounded-lg font-medium"
          onClick={() => navigate(ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(':teacherId', record.teacherId))}
        >
          Xem hồ sơ
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Xác minh giáo viên</Title>
          <Text className="text-gray-500">Kiểm tra hồ sơ và xác minh năng lực sư phạm trước khi cho phép giáo viên mở lớp trên Edunity</Text>
        </div>
        <div className="flex gap-2">
          <Button icon={<ClockCircleOutlined />} className="rounded-lg bg-white">Lịch sử xét duyệt</Button>
          <Button type="primary" icon={<SafetyCertificateOutlined />} className="rounded-lg bg-indigo-600">Xuất báo cáo thẩm định</Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0 hide-scrollbar flex-1">
          <Button type={activeFilter === 'PENDING' ? 'primary' : 'default'} onClick={() => setActiveFilter('PENDING')} className={activeFilter === 'PENDING' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Chờ duyệt
          </Button>
          <Button type={activeFilter === 'VERIFIED' ? 'primary' : 'default'} onClick={() => setActiveFilter('VERIFIED')} className={activeFilter === 'VERIFIED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Đã xác minh
          </Button>
          <Button type={activeFilter === 'REJECTED' ? 'primary' : 'default'} onClick={() => setActiveFilter('REJECTED')} className={activeFilter === 'REJECTED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Từ chối
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <Title level={4} className="!m-0 text-gray-800">Danh sách hàng đợi ({pagedVerifications?.paging?.total || 0})</Title>
          <Button type="text" onClick={() => refetch()} className="text-indigo-600 font-medium">Làm mới</Button>
        </div>
        
        {isError && (
          <Alert message="Không thể tải danh sách xác minh." type="error" showIcon className="mb-4" />
        )}
        
        <Table 
          columns={columns} 
          dataSource={pagedVerifications?.data || []} 
          rowKey="teacherId"
          pagination={{ pageSize: 10 }}
          loading={isLoading}
        />
      </div>
    </div>
  );
}
