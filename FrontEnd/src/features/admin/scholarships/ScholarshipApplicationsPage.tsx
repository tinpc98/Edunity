import GuardianConsentReviewCard from "./GuardianConsentReviewCard";
import { useState } from 'react';
import { Typography, Input, Button, Table, Tag, Avatar, Row, Col, Card } from 'antd';
import { 
  SearchOutlined, 
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from '../../../services/scholarshipApplication.service';
import type { ScholarshipApplication } from '../../../types/scholarship';
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from '../../../types/scholarship';
import { formatVND } from '../../../types/payment';

const { Title, Text } = Typography;

export default function ScholarshipApplicationsPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchText, setSearchText] = useState('');

  // 1. Fetch real applications for the active tab
  const { data, isLoading } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({
      status: activeFilter,
      page,
      pageSize,
    }),
    queryFn: () =>
      scholarshipApplicationService.adminListApplications({
        status: activeFilter,
        page,
        pageSize,
      }),
  });

  // 2. Fetch counts for each status tab
  const { data: submittedData } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({ status: 'SUBMITTED', page: 1, pageSize: 1 }),
    queryFn: () => scholarshipApplicationService.adminListApplications({ status: 'SUBMITTED', page: 1, pageSize: 1 }),
  });
  const { data: needInfoData } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({ status: 'NEED_MORE_INFORMATION', page: 1, pageSize: 1 }),
    queryFn: () => scholarshipApplicationService.adminListApplications({ status: 'NEED_MORE_INFORMATION', page: 1, pageSize: 1 }),
  });
  const { data: approvedData } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({ status: 'APPROVED', page: 1, pageSize: 1 }),
    queryFn: () => scholarshipApplicationService.adminListApplications({ status: 'APPROVED', page: 1, pageSize: 1 }),
  });
  const { data: rejectedData } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({ status: 'REJECTED', page: 1, pageSize: 1 }),
    queryFn: () => scholarshipApplicationService.adminListApplications({ status: 'REJECTED', page: 1, pageSize: 1 }),
  });

  const getStatusTag = (status: string) => {
    const label = SCHOLARSHIP_APP_STATUS_LABELS[status as keyof typeof SCHOLARSHIP_APP_STATUS_LABELS] || status;
    const color = SCHOLARSHIP_APP_STATUS_COLORS[status as keyof typeof SCHOLARSHIP_APP_STATUS_COLORS] || 'default';
    switch (status) {
      case 'APPROVED': return <Tag color={color} icon={<CheckCircleOutlined />}>{label}</Tag>;
      case 'SUBMITTED': return <Tag color={color} icon={<ClockCircleOutlined />}>{label}</Tag>;
      case 'NEED_MORE_INFORMATION': return <Tag color={color} icon={<ExclamationCircleOutlined />}>{label}</Tag>;
      case 'REJECTED': return <Tag color={color} icon={<CloseCircleOutlined />}>{label}</Tag>;
      default: return <Tag color={color}>{label}</Tag>;
    }
  };

  const items = (data?.items || []).filter((item) => {
    if (!searchText.trim()) return true;
    const term = searchText.toLowerCase();
    return (
      (item.studentName || '').toLowerCase().includes(term) ||
      (item.studentEmail || '').toLowerCase().includes(term) ||
      (item.campaignTitle || '').toLowerCase().includes(term)
    );
  });

  const columns = [
    {
      title: 'Học sinh',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (text: string, record: ScholarshipApplication) => {
        const displayName = text || record.studentEmail || 'Học viên';
        const initials = displayName.substring(0, 2).toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <Avatar className="bg-teal-50 text-teal-800 border border-teal-200 font-bold">{initials}</Avatar>
            <div>
              <div className="font-semibold text-gray-900">{displayName}</div>
              <div className="text-xs text-gray-500">{record.studentEmail}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Chiến dịch',
      dataIndex: 'campaignTitle',
      key: 'campaignTitle',
      render: (text: string, record: ScholarshipApplication) => (
        <div>
          <div className="font-medium text-gray-800">{text || 'Chiến dịch học bổng'}</div>
          {record.awardAmountPerStudent > 0 && (
            <div className="text-xs text-teal-700 font-semibold">
              Định mức: {formatVND(record.awardAmountPerStudent)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Ngày nộp',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      render: (dateStr: string) => (
        <span className="text-xs text-gray-600">
          {dateStr ? new Date(dateStr).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }) : '—'}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, record: ScholarshipApplication) => (
        <Button 
          type="primary" 
          ghost 
          className="rounded-lg font-medium text-xs"
          onClick={() => navigate(ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(':applicationId', record.id))}
        >
          Xem hồ sơ
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <GuardianConsentReviewCard />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Hồ sơ ứng tuyển học bổng</Title>
          <Text className="text-gray-500">Quản lý và xét duyệt hồ sơ ứng tuyển từ học sinh</Text>
        </div>
        <div className="flex gap-2">
          <Input 
            placeholder="Tìm học sinh / chiến dịch..." 
            prefix={<SearchOutlined />} 
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="rounded-lg w-[260px]" 
          />
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card 
            className={`rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border transition-all cursor-pointer ${
              activeFilter === 'SUBMITTED' ? 'border-[#0D9488] bg-[#CCFBF1]' : 'border-[#D6E5E2] bg-white hover:border-[#99F6E4]'
            }`} 
            onClick={() => { setActiveFilter('SUBMITTED'); setPage(1); }}
          >
            <div className="flex justify-between items-start mb-2">
              <Text className="text-[#64748B] text-xs font-bold uppercase tracking-wider">CHỜ XÉT DUYỆT</Text>
            </div>
            <Title level={1} className="!m-0 text-[#0F766E] !text-3xl font-extrabold">{submittedData?.total ?? 0}</Title>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6}>
          <Card 
            className={`rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border transition-all cursor-pointer ${
              activeFilter === 'NEED_MORE_INFORMATION' ? 'border-amber-500 bg-[#FEF3C7]' : 'border-[#D6E5E2] bg-white hover:border-amber-300'
            }`} 
            onClick={() => { setActiveFilter('NEED_MORE_INFORMATION'); setPage(1); }}
          >
            <div className="flex justify-between items-start mb-2">
              <Text className="text-[#64748B] text-xs font-bold uppercase tracking-wider">CẦN BỔ SUNG</Text>
            </div>
            <Title level={1} className="!m-0 text-[#B45309] !text-3xl font-extrabold">{needInfoData?.total ?? 0}</Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card 
            className={`rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border transition-all cursor-pointer ${
              activeFilter === 'APPROVED' ? 'border-emerald-500 bg-[#DCFCE7]' : 'border-[#D6E5E2] bg-white hover:border-emerald-300'
            }`} 
            onClick={() => { setActiveFilter('APPROVED'); setPage(1); }}
          >
            <div className="flex justify-between items-start mb-2">
              <Text className="text-[#64748B] text-xs font-bold uppercase tracking-wider">ĐÃ DUYỆT</Text>
            </div>
            <Title level={1} className="!m-0 text-[#15803D] !text-3xl font-extrabold">{approvedData?.total ?? 0}</Title>
          </Card>
        </Col>

        <Col xs={12} sm={12} md={6}>
          <Card 
            className={`rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border transition-all cursor-pointer ${
              activeFilter === 'REJECTED' ? 'border-rose-500 bg-[#FEE2E2]' : 'border-[#D6E5E2] bg-white hover:border-rose-300'
            }`} 
            onClick={() => { setActiveFilter('REJECTED'); setPage(1); }}
          >
            <div className="flex justify-between items-start mb-2">
              <Text className="text-[#64748B] text-xs font-bold uppercase tracking-wider">TỪ CHỐI</Text>
            </div>
            <Title level={1} className="!m-0 text-[#DC2626] !text-3xl font-extrabold">{rejectedData?.total ?? 0}</Title>
          </Card>
        </Col>
      </Row>

      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 hide-scrollbar flex-1">
          <Button 
            type={activeFilter === 'ALL' ? 'primary' : 'default'} 
            onClick={() => { setActiveFilter('ALL'); setPage(1); }} 
            className={activeFilter === 'ALL' ? 'bg-[#0D9488] hover:bg-[#0B746C] rounded-full text-white font-bold' : 'rounded-full border-0 bg-slate-100 text-[#334155] font-semibold hover:text-[#0F766E]'}
          >
            Tất cả
          </Button>
          <Button 
            type={activeFilter === 'SUBMITTED' ? 'primary' : 'default'} 
            onClick={() => { setActiveFilter('SUBMITTED'); setPage(1); }} 
            className={activeFilter === 'SUBMITTED' ? 'bg-teal-600 hover:bg-teal-700 rounded-full text-white' : 'rounded-full border-0 bg-slate-100 text-slate-700 font-medium hover:text-teal-700'}
          >
            Chờ xét duyệt
          </Button>
          <Button 
            type={activeFilter === 'NEED_MORE_INFORMATION' ? 'primary' : 'default'} 
            onClick={() => { setActiveFilter('NEED_MORE_INFORMATION'); setPage(1); }} 
            className={activeFilter === 'NEED_MORE_INFORMATION' ? 'bg-teal-600 hover:bg-teal-700 rounded-full text-white' : 'rounded-full border-0 bg-slate-100 text-slate-700 font-medium hover:text-teal-700'}
          >
            Cần bổ sung
          </Button>
          <Button 
            type={activeFilter === 'APPROVED' ? 'primary' : 'default'} 
            onClick={() => { setActiveFilter('APPROVED'); setPage(1); }} 
            className={activeFilter === 'APPROVED' ? 'bg-teal-600 hover:bg-teal-700 rounded-full text-white' : 'rounded-full border-0 bg-slate-100 text-slate-700 font-medium hover:text-teal-700'}
          >
            Đã duyệt
          </Button>
          <Button 
            type={activeFilter === 'REJECTED' ? 'primary' : 'default'} 
            onClick={() => { setActiveFilter('REJECTED'); setPage(1); }} 
            className={activeFilter === 'REJECTED' ? 'bg-teal-600 hover:bg-teal-700 rounded-full text-white' : 'rounded-full border-0 bg-slate-100 text-slate-700 font-medium hover:text-teal-700'}
          >
            Từ chối
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <Table 
          columns={columns} 
          dataSource={items} 
          rowKey="id"
          loading={isLoading}
          pagination={{ 
            current: page,
            pageSize,
            total: data?.total || 0,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
          }}
        />
      </div>
    </div>
  );
}
