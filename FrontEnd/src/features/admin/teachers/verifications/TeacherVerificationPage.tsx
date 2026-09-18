import { useState } from 'react';
import { Typography, Input, Button, Card, Tag, Table, Select, Row, Col, Avatar } from 'antd';
import { 
  SearchOutlined, 
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../../routes/routePaths';
import { mockAdminTeacherVerifications } from '../../../../data/mockAdminTeacherVerification';

const { Title, Text } = Typography;

export default function TeacherVerificationPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('ALL');

  const filteredTeachers = mockAdminTeacherVerifications.filter(t => {
    if (activeFilter === 'ALL') return true;
    return t.status === activeFilter;
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'VERIFIED': return <Tag color="success" icon={<CheckCircleOutlined />}>Đã xác minh</Tag>;
      case 'PENDING': return <Tag color="processing" icon={<ClockCircleOutlined />}>Chờ duyệt</Tag>;
      case 'NEEDS_INFO': return <Tag color="warning" icon={<ExclamationCircleOutlined />}>Cần bổ sung</Tag>;
      case 'REJECTED': return <Tag color="error" icon={<CloseCircleOutlined />}>Từ chối</Tag>;
      default: return null;
    }
  };

  const columns = [
    {
      title: 'Giáo viên',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">{text.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Chuyên môn',
      dataIndex: 'specialization',
      key: 'specialization',
      render: (text: string) => <Tag className="border-0 bg-gray-100 font-medium text-gray-700">{text}</Tag>
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'dateSubmitted',
      key: 'dateSubmitted',
    },
    {
      title: 'Tài liệu',
      key: 'documents',
      render: (_: any, record: any) => (
        <span className="text-gray-600 flex items-center gap-1.5"><FileTextOutlined /> {record.documents.length} tài liệu</span>
      )
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
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
          onClick={() => navigate(ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(':teacherId', record.id))}
        >
          Xem hồ sơ
        </Button>
      ),
    },
  ];

  const pendingCount = mockAdminTeacherVerifications.filter(t => t.status === 'PENDING').length;
  const needsInfoCount = mockAdminTeacherVerifications.filter(t => t.status === 'NEEDS_INFO').length;
  const verifiedCount = mockAdminTeacherVerifications.filter(t => t.status === 'VERIFIED').length;
  const rejectedCount = mockAdminTeacherVerifications.filter(t => t.status === 'REJECTED').length;

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

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-indigo-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('PENDING')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">HỒ SƠ CHỜ DUYỆT</Text>
              <Tag color="error" className="!m-0 rounded-full font-bold">Cần xử lý sớm</Tag>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{pendingCount}</Title>
            </div>
            <div className="mt-2">
              <Text className="text-rose-500 text-xs font-medium">Hạn chót thẩm định: &lt; 24 giờ</Text>
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('NEEDS_INFO')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">CẦN BỔ SUNG TÀI LIỆU</Text>
              <Tag color="warning" className="!m-0 rounded-full">Đã gửi thông báo</Tag>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-gray-900 !text-4xl">{needsInfoCount}</Title>
            </div>
            <div className="mt-2">
              <Text className="text-gray-500 text-xs">Chờ phản hồi (Hồ sơ quá hạn 7 ngày)</Text>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('VERIFIED')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">GIÁO VIÊN ĐÃ XÁC MINH</Text>
              <Tag color="success" className="!m-0 rounded-full font-medium">97.4% Đủ điều kiện</Tag>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-gray-900 !text-4xl">{verifiedCount}</Title>
              <Text className="text-emerald-500 text-xs font-medium mb-1">+14 tháng này</Text>
            </div>
            <div className="mt-2">
              <Text className="text-gray-500 text-xs">Đang hoạt động trên nền tảng</Text>
            </div>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('REJECTED')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">TỪ CHỐI / KHIẾU NẠI</Text>
              <Tag color="default" className="!m-0 rounded-full">Đã trả kết quả</Tag>
            </div>
            <div className="flex items-end gap-2">
              <Title level={1} className="!m-0 text-gray-900 !text-4xl">{rejectedCount}</Title>
            </div>
            <div className="mt-2">
              <Text className="text-gray-500 text-xs">Tỷ lệ không đạt: 1.5%</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0 hide-scrollbar flex-1">
          <Button type={activeFilter === 'ALL' ? 'primary' : 'default'} onClick={() => setActiveFilter('ALL')} className={activeFilter === 'ALL' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Tất cả ({mockAdminTeacherVerifications.length})
          </Button>
          <Button type={activeFilter === 'PENDING' ? 'primary' : 'default'} onClick={() => setActiveFilter('PENDING')} className={activeFilter === 'PENDING' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Chờ duyệt ({pendingCount})
          </Button>
          <Button type={activeFilter === 'NEEDS_INFO' ? 'primary' : 'default'} onClick={() => setActiveFilter('NEEDS_INFO')} className={activeFilter === 'NEEDS_INFO' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Cần bổ sung ({needsInfoCount})
          </Button>
          <Button type={activeFilter === 'VERIFIED' ? 'primary' : 'default'} onClick={() => setActiveFilter('VERIFIED')} className={activeFilter === 'VERIFIED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Đã xác minh ({verifiedCount})
          </Button>
          <Button type={activeFilter === 'REJECTED' ? 'primary' : 'default'} onClick={() => setActiveFilter('REJECTED')} className={activeFilter === 'REJECTED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Từ chối ({rejectedCount})
          </Button>
        </div>
        
        <div className="flex gap-3 shrink-0">
          <Input placeholder="Tìm kiếm giáo viên..." prefix={<SearchOutlined />} className="rounded-lg w-full md:w-[250px]" />
          <Select defaultValue="newest" className="w-[150px]" options={[{value: 'newest', label: 'Mới nhất trước'}]} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <Title level={4} className="!m-0 text-gray-800">Danh sách hàng đợi</Title>
          <Button type="text" className="text-indigo-600 font-medium">Làm mới</Button>
        </div>
        
        <Table 
          columns={columns} 
          dataSource={filteredTeachers} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </div>
    </div>
  );
}
