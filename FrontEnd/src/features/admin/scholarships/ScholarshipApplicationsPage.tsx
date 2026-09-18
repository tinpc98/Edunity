import { useState } from 'react';
import { Typography, Input, Button, Table, Tag, Avatar, Row, Col, Card } from 'antd';
import { 
  SearchOutlined, 
  ProfileOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';
import { mockAdminScholarships } from '../../../data/mockAdminScholarships';
import type { ScholarshipApplicationAdmin } from '../../../types/admin';

const { Title, Text } = Typography;

export default function ScholarshipApplicationsPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('ALL');

  const filteredApps = mockAdminScholarships.filter(a => {
    if (activeFilter === 'ALL') return true;
    return a.status === activeFilter;
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'APPROVED': return <Tag color="success" icon={<CheckCircleOutlined />}>Đã duyệt</Tag>;
      case 'SUBMITTED': return <Tag color="processing" icon={<ClockCircleOutlined />}>Chờ xét duyệt</Tag>;
      case 'NEED_MORE_INFORMATION': return <Tag color="warning" icon={<ExclamationCircleOutlined />}>Cần bổ sung</Tag>;
      case 'REJECTED': return <Tag color="error" icon={<CloseCircleOutlined />}>Từ chối</Tag>;
      default: return null;
    }
  };

  const columns = [
    {
      title: 'Học sinh',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (text: string, record: ScholarshipApplicationAdmin) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">{text.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">{record.grade} • {record.school}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Chiến dịch',
      dataIndex: 'campaignTitle',
      key: 'campaignTitle',
      render: (text: string, record: ScholarshipApplicationAdmin) => (
        <div>
          <div className="font-medium text-gray-800">{text}</div>
          <div className="text-xs text-gray-400">#{record.campaignId}</div>
        </div>
      )
    },
    {
      title: 'Ngày nộp',
      dataIndex: 'submittedDate',
      key: 'submittedDate',
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
      render: (_: any, record: ScholarshipApplicationAdmin) => (
        <Button 
          type="primary" 
          ghost 
          className="rounded-lg font-medium"
          onClick={() => navigate(ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(':applicationId', record.id))}
        >
          Xem hồ sơ
        </Button>
      ),
    },
  ];

  const pendingCount = mockAdminScholarships.filter(a => a.status === 'SUBMITTED').length;
  const needsInfoCount = mockAdminScholarships.filter(a => a.status === 'NEED_MORE_INFORMATION').length;
  const approvedCount = mockAdminScholarships.filter(a => a.status === 'APPROVED').length;
  const rejectedCount = mockAdminScholarships.filter(a => a.status === 'REJECTED').length;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Hồ sơ ứng tuyển học bổng</Title>
          <Text className="text-gray-500">Quản lý và xét duyệt hồ sơ ứng tuyển từ học sinh</Text>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Tìm học sinh / chiến dịch..." prefix={<SearchOutlined />} className="rounded-lg w-[250px]" />
          <Button icon={<ProfileOutlined />} className="rounded-lg bg-white">Lịch sử xét duyệt</Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-indigo-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('SUBMITTED')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">CHỜ XÉT DUYỆT</Text>
            </div>
            <Title level={1} className="!m-0 text-indigo-900 !text-4xl">{pendingCount}</Title>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('NEED_MORE_INFORMATION')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">CẦN BỔ SUNG</Text>
            </div>
            <Title level={1} className="!m-0 text-gray-900 !text-4xl">{needsInfoCount}</Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('APPROVED')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">ĐÃ DUYỆT</Text>
            </div>
            <Title level={1} className="!m-0 text-emerald-600 !text-4xl">{approvedCount}</Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setActiveFilter('REJECTED')}>
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">TỪ CHỐI</Text>
            </div>
            <Title level={1} className="!m-0 text-gray-900 !text-4xl">{rejectedCount}</Title>
          </Card>
        </Col>
      </Row>

      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0 hide-scrollbar flex-1">
          <Button type={activeFilter === 'ALL' ? 'primary' : 'default'} onClick={() => setActiveFilter('ALL')} className={activeFilter === 'ALL' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Tất cả
          </Button>
          <Button type={activeFilter === 'SUBMITTED' ? 'primary' : 'default'} onClick={() => setActiveFilter('SUBMITTED')} className={activeFilter === 'SUBMITTED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Chờ xét duyệt
          </Button>
          <Button type={activeFilter === 'NEED_MORE_INFORMATION' ? 'primary' : 'default'} onClick={() => setActiveFilter('NEED_MORE_INFORMATION')} className={activeFilter === 'NEED_MORE_INFORMATION' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Cần bổ sung
          </Button>
          <Button type={activeFilter === 'APPROVED' ? 'primary' : 'default'} onClick={() => setActiveFilter('APPROVED')} className={activeFilter === 'APPROVED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Đã duyệt
          </Button>
          <Button type={activeFilter === 'REJECTED' ? 'primary' : 'default'} onClick={() => setActiveFilter('REJECTED')} className={activeFilter === 'REJECTED' ? 'bg-indigo-600 rounded-full' : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'}>
            Từ chối
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <Table 
          columns={columns} 
          dataSource={filteredApps} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </div>
    </div>
  );
}
