import { Typography, Input, Button, Table, Tag, Progress, Row, Col, Card } from 'antd';
import { 
  SearchOutlined, 
  PlusOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
  TeamOutlined,
  FileDoneOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';
import { mockAdminCampaigns } from '../../../data/mockAdminCampaigns';
import type { ScholarshipCampaignAdmin } from '../../../types/admin';

const { Title, Text } = Typography;

export default function AdminCampaignsPage() {
  const navigate = useNavigate();

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'OPEN': return <Tag color="success">Đang mở đơn</Tag>;
      case 'DRAFT': return <Tag color="default">Bản nháp</Tag>;
      case 'ACTIVE': return <Tag color="processing">Đang cấp quỹ</Tag>;
      case 'CLOSED': return <Tag color="error">Đã đóng</Tag>;
      default: return null;
    }
  };

  const columns = [
    {
      title: 'Chiến dịch',
      dataIndex: 'title',
      key: 'title',
      width: '30%',
      render: (text: string, record: ScholarshipCampaignAdmin) => (
        <div>
          <div className="font-semibold text-gray-900 mb-1">{text}</div>
          <div className="text-xs text-gray-500">Mã: #{record.id.split('_').pop()}</div>
        </div>
      ),
    },
    {
      title: 'Ngân sách mục tiêu',
      dataIndex: 'targetBudget',
      key: 'targetBudget',
      render: (amount: number) => <span className="font-medium">{amount.toLocaleString('vi-VN')}đ</span>
    },
    {
      title: 'Đã huy động',
      key: 'fundedAmount',
      render: (_: any, record: ScholarshipCampaignAdmin) => {
        const percent = Math.round((record.fundedAmount / record.targetBudget) * 100);
        return (
          <div className="flex flex-col gap-1 w-full max-w-[150px]">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-emerald-600">{record.fundedAmount.toLocaleString('vi-VN')}đ</span>
              <span className="text-gray-500">{percent}%</span>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor="#10B981" size="small" className="!m-0" />
          </div>
        );
      }
    },
    {
      title: 'Suất học bổng',
      key: 'slots',
      render: (_: any, record: ScholarshipCampaignAdmin) => (
        <span><strong className="text-gray-900">{record.allocatedSlots}</strong> / {record.expectedSlots}</span>
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
      render: (_: any, record: ScholarshipCampaignAdmin) => (
        <Button 
          type="primary" 
          ghost 
          className="rounded-lg font-medium"
          onClick={() => navigate(ROUTES.ADMIN.CAMPAIGN_DETAIL.replace(':campaignId', record.id))}
        >
          Quản lý
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Chiến dịch học bổng</Title>
          <Text className="text-gray-500">Quản lý các chương trình tài trợ và phân bổ học bổng cho học viên</Text>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Tìm chiến dịch..." prefix={<SearchOutlined />} className="rounded-lg w-[250px]" />
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            className="rounded-lg bg-indigo-600"
            onClick={() => navigate(ROUTES.ADMIN.CREATE_CAMPAIGN)}
          >
            Tạo chiến dịch
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">ĐANG MỞ ĐƠN</Text>
              <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-500 flex items-center justify-center"><FileDoneOutlined /></div>
            </div>
            <Title level={1} className="!m-0 text-gray-900 !text-4xl">3</Title>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">TỔNG QUỸ HUY ĐỘNG</Text>
              <div className="w-8 h-8 rounded bg-indigo-50 text-indigo-500 flex items-center justify-center"><DollarOutlined /></div>
            </div>
            <Title level={1} className="!m-0 text-indigo-900 !text-3xl">420<span className="text-lg">Tr</span></Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">CHIẾN DỊCH HOẠT ĐỘNG</Text>
              <div className="w-8 h-8 rounded bg-blue-50 text-blue-500 flex items-center justify-center"><SafetyCertificateOutlined /></div>
            </div>
            <Title level={1} className="!m-0 text-gray-900 !text-4xl">12</Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">HỌC VIÊN ĐƯỢC HỖ TRỢ</Text>
              <div className="w-8 h-8 rounded bg-rose-50 text-rose-500 flex items-center justify-center"><TeamOutlined /></div>
            </div>
            <Title level={1} className="!m-0 text-gray-900 !text-4xl">124</Title>
          </Card>
        </Col>
      </Row>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <Table 
          columns={columns} 
          dataSource={mockAdminCampaigns} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </div>
    </div>
  );
}
