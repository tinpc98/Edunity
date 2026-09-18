import { useState } from 'react';
import { Typography, Breadcrumb, Button, Card, Row, Col, Tag, Progress, Tabs, Table, Avatar, Timeline, Input } from 'antd';
import { 
  DollarOutlined,
  TeamOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useParams, Link } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';
import { mockAdminCampaigns, mockCampaignContributions, mockCampaignActivity } from '../../../data/mockAdminCampaigns';
import { mockAdminScholarships } from '../../../data/mockAdminScholarships';
import type { ScholarshipApplicationAdmin } from '../../../types/admin';

const { Title } = Typography;

export default function CampaignDetailPage() {
  const { campaignId } = useParams();
  const campaign = mockAdminCampaigns.find(c => c.id === (campaignId || "CAMP_2026_FALL")) || mockAdminCampaigns[0];
  
  const [activeTab, setActiveTab] = useState('overview');

  const fundedPercent = Math.round((campaign.fundedAmount / campaign.targetBudget) * 100);
  const allocatedPercent = Math.round((campaign.allocatedAmount / campaign.fundedAmount) * 100);
  const usedPercent = Math.round((campaign.usedAmount / campaign.allocatedAmount) * 100);

  const sponsorColumns = [
    {
      title: 'Nhà tài trợ / Đơn vị',
      dataIndex: 'sponsorName',
      key: 'sponsorName',
      render: (text: string) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">{text.substring(0, 2).toUpperCase()}</Avatar>
          <div className="font-semibold text-gray-900">{text}</div>
        </div>
      ),
    },
    {
      title: 'Số tiền tài trợ',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => <span className="font-bold text-indigo-600">{val.toLocaleString('vi-VN')}đ</span>
    },
    {
      title: 'Ngày giao dịch',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Mã đối soát',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => <Tag className="bg-gray-100 text-gray-500 border-0">{text}</Tag>
    },
    {
      title: 'Trạng thái quỹ',
      dataIndex: 'status',
      key: 'status',
      render: () => (
        <Tag color="success" className="rounded-full px-3 py-1 font-medium flex w-max items-center gap-1">
          <CheckCircleOutlined /> Đã vào quỹ
        </Tag>
      )
    },
  ];

  const applicationColumns = [
    {
      title: 'Hồ sơ ứng viên',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (text: string, record: ScholarshipApplicationAdmin) => (
        <div>
          <div className="font-semibold text-gray-900">{text}</div>
          <div className="text-xs text-gray-500">{record.grade} - {record.school}</div>
        </div>
      )
    },
    {
      title: 'Mức tài trợ',
      dataIndex: 'awardAmount',
      key: 'awardAmount',
      render: (val: number) => <span className="font-semibold">{val.toLocaleString('vi-VN')}đ</span>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'APPROVED') return <Tag color="success">Đã duyệt</Tag>;
        if (status === 'SUBMITTED') return <Tag color="processing">Chờ thẩm định</Tag>;
        if (status === 'NEED_MORE_INFORMATION') return <Tag color="warning">Cần bổ sung</Tag>;
        return <Tag color="error">Từ chối</Tag>;
      }
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, record: ScholarshipApplicationAdmin) => (
        <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(':applicationId', record.id)} className="text-indigo-600 font-medium hover:underline">
          Xét duyệt hồ sơ →
        </Link>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.ADMIN.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</a> },
          { title: `#${campaign.id}` },
        ]}
      />

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-6">
        <div className="flex-1">
          <Title level={2} className="!m-0 mb-3 text-gray-900">{campaign.title}</Title>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Tag color="success" className="!m-0 px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white"></div> ĐANG NHẬN TÀI TRỢ & MỞ ĐƠN</Tag>
            <Tag className="!m-0 px-3 py-1 border-0 bg-gray-100 text-gray-600 font-medium">Khóa 2026 - 2027</Tag>
          </div>
          
          <Row gutter={[24, 24]}>
            <Col xs={12} md={6} className="border-r border-gray-100">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">NGÂN SÁCH MỤC TIÊU</div>
              <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{campaign.targetBudget.toLocaleString('vi-VN')}đ</div>
              <div className="text-sm text-indigo-600 font-medium flex items-center gap-1.5"><TeamOutlined /> {campaign.expectedSlots} suất học bổng (Định mức chuẩn)</div>
            </Col>
            <Col xs={12} md={6} className="border-r border-gray-100">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">ĐÃ HUY ĐỘNG ĐƯỢC <Tag color="success" className="!m-0 text-[10px]">{fundedPercent}%</Tag></div>
              <div className="text-2xl md:text-3xl font-bold text-indigo-600 mb-2">{campaign.fundedAmount.toLocaleString('vi-VN')}đ</div>
              <div className="text-sm text-gray-500 font-medium">Còn thiếu: {(campaign.targetBudget - campaign.fundedAmount).toLocaleString('vi-VN')}đ • <span className="text-emerald-600">14 nhà tài trợ</span></div>
            </Col>
            <Col xs={12} md={6} className="border-r border-gray-100">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">ĐÃ DUYỆT PHÂN BỔ <Tag color="processing" className="!m-0 text-[10px]">{allocatedPercent}%</Tag></div>
              <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{campaign.allocatedAmount.toLocaleString('vi-VN')}đ</div>
              <div className="text-sm text-gray-500 font-medium">{campaign.allocatedSlots} / {campaign.expectedSlots} học sinh • <Tag color="success" className="!m-0 rounded border-0 text-[10px]">Còn {campaign.expectedSlots - campaign.allocatedSlots} suất mở</Tag></div>
            </Col>
            <Col xs={12} md={6}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">THỰC TẾ ĐÃ GIẢI NGÂN</div>
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">{campaign.usedAmount.toLocaleString('vi-VN')}đ</div>
              <div className="text-sm text-gray-500 font-medium">30 em đã kích. <span className="text-indigo-600 font-bold">{usedPercent}% quỹ duyệt</span></div>
            </Col>
          </Row>
        </div>
        <div className="flex flex-col gap-3 shrink-0">
          <Button icon={<EditOutlined />} className="rounded-xl h-[40px] font-medium bg-indigo-50 text-indigo-600 border-0 hover:bg-indigo-100">Tạm dừng cổng nhận hồ sơ</Button>
          <Button className="rounded-xl h-[40px] font-medium" icon={<EditOutlined />}>Chỉnh sửa chiến dịch</Button>
          <Button type="primary" className="rounded-xl h-[40px] font-medium bg-indigo-600" icon={<PlusOutlined />}>Tạo chiến dịch mới</Button>
        </div>
      </div>

      {/* Info Cards Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <div className="bg-white p-4 rounded-xl border border-gray-100 h-full flex items-start gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0"><DollarOutlined /></div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">MỨC HỌC BỔNG CỐ ĐỊNH</div>
              <div className="font-bold text-gray-900 text-base">{campaign.awardPerStudent.toLocaleString('vi-VN')}đ <span className="font-normal text-sm text-gray-500">/ học sinh</span></div>
              <div className="text-xs text-gray-500 mt-1">Trọn gói 1 năm học các lớp Live Edunity</div>
            </div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="bg-white p-4 rounded-xl border border-gray-100 h-full flex items-start gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0"><TeamOutlined /></div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ĐỐI TƯỢNG XÉT CHỌN</div>
              <div className="font-bold text-gray-900 text-base">Lớp 10, 11, 12 THPT</div>
              <div className="text-xs text-gray-500 mt-1">Hoàn cảnh khó khăn, học lực Khá/Giỏi</div>
            </div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="bg-white p-4 rounded-xl border border-gray-100 h-full flex items-start gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0"><CalendarOutlined /></div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">CHU KỲ XÉT DUYỆT & TÀI TRỢ</div>
              <div className="font-bold text-gray-900 text-sm">{campaign.fundingStartDate} - {campaign.fundingEndDate}</div>
              <div className="text-xs text-gray-500 mt-1">Nhận hồ sơ: {campaign.appStartDate.substring(0,5)} - {campaign.appEndDate.substring(0,5)}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="bg-white p-4 rounded-xl border border-gray-100 h-full flex items-start gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0"><SafetyCertificateOutlined /></div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">PHẠM VI MÔN HỌC</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {campaign.scope.map(s => <Tag key={s} className="!m-0 border-0 bg-gray-100 text-gray-700">{s}</Tag>)}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 pt-4 font-medium"
        items={[
          { key: 'overview', label: `Tổng quan & Tiến độ` },
          { key: 'sponsors', label: `Nhà tài trợ & Đóng góp quỹ` },
          { key: 'applications', label: `Danh sách hồ sơ học sinh` },
          { key: 'activity', label: `Nhật ký giải ngân & Đối soát` },
        ]}
      />

      {/* Render tab content manually to bypass Tabs' unmount issues if needed, or just conditionally */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {activeTab === 'overview' && (
            <Card className="rounded-2xl shadow-sm border-gray-100 mb-6" title="Tiến độ phân bổ nguồn quỹ" extra={<Tag color="processing" className="rounded-full">Hiệu suất cấp: 100% đúng hạn</Tag>}>
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-600"></div> Đã huy động quỹ (Funded)</span>
                    <span><strong className="text-gray-900">{campaign.fundedAmount.toLocaleString('vi-VN')}đ</strong> / {campaign.targetBudget.toLocaleString('vi-VN')}đ ({fundedPercent}%)</span>
                  </div>
                  <Progress percent={fundedPercent} showInfo={false} strokeColor="#4F46E5" trailColor="#E2DFFF" />
                </div>
                <div>
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Đã duyệt hồ sơ học sinh (Allocated)</span>
                    <span><strong className="text-gray-900">{campaign.allocatedAmount.toLocaleString('vi-VN')}đ</strong> / {campaign.fundedAmount.toLocaleString('vi-VN')}đ khả dụng ({allocatedPercent}%)</span>
                  </div>
                  <Progress percent={allocatedPercent} showInfo={false} strokeColor="#3B82F6" trailColor="#DBEAFE" />
                </div>
                <div>
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Đã chuyển giao học phí (Disbursed)</span>
                    <span><strong className="text-emerald-600">{campaign.usedAmount.toLocaleString('vi-VN')}đ</strong> / {campaign.allocatedAmount.toLocaleString('vi-VN')}đ đã duyệt ({usedPercent}%)</span>
                  </div>
                  <Progress percent={usedPercent} showInfo={false} strokeColor="#10B981" trailColor="#D1FAE5" />
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'sponsors' && (
            <Card className="rounded-2xl shadow-sm border-gray-100" title="Nhà tài trợ đồng hành & Dòng tiền vào quỹ" extra={<Button size="small">Lọc nguồn tiền</Button>}>
              <Table 
                columns={sponsorColumns} 
                dataSource={mockCampaignContributions}
                rowKey="id"
                pagination={false}
              />
            </Card>
          )}

          {activeTab === 'applications' && (
            <Card className="rounded-2xl shadow-sm border-gray-100" title="Hồ sơ ứng tuyển" extra={<Input placeholder="Tìm học sinh..." prefix={<SearchOutlined />} className="rounded-lg" />}>
              <Table 
                columns={applicationColumns} 
                dataSource={mockAdminScholarships.filter(a => a.campaignId === campaign.id)}
                rowKey="id"
                pagination={false}
              />
            </Card>
          )}
          
          {activeTab === 'activity' && (
            <Card className="rounded-2xl shadow-sm border-gray-100" title="Nhật ký hoạt động">
              <Timeline
                className="mt-4"
                items={mockCampaignActivity.map(act => ({
                  color: act.type === 'ADMIN' ? 'blue' : act.type === 'SPONSOR' ? 'green' : 'gray',
                  children: (
                    <div>
                      <div className="font-semibold text-gray-800">{act.action}</div>
                      <div className="text-xs text-gray-500">{act.date} • by {act.type}</div>
                    </div>
                  )
                }))}
              />
            </Card>
          )}
        </Col>

        {/* RIGHT COLUMN */}
        <Col xs={24} lg={8}>
          <Card className="rounded-2xl shadow-sm border-gray-100 mb-6 bg-indigo-50/50" title={<span className="font-bold flex items-center gap-2"><DollarOutlined className="text-indigo-600" /> Công thức tính chỉ tiêu</span>} extra={<Tag color="indigo" className="!m-0 border-0 font-bold">Tự động</Tag>}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600 font-medium">Tổng ngân sách:</span>
              <span className="font-bold text-gray-900">{campaign.targetBudget.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-indigo-100">
              <span className="text-gray-600 font-medium">Định mức / học sinh:</span>
              <span className="font-bold text-gray-900">÷ {campaign.awardPerStudent.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-indigo-700">Tổng suất học bổng:</span>
              <span className="font-bold text-indigo-600 text-3xl">{campaign.expectedSlots} <span className="text-base font-medium text-indigo-700">suất</span></span>
            </div>
            
            <Button block className="rounded-xl h-[44px] font-medium border-indigo-200 text-indigo-700 mb-3 bg-white">Điều chỉnh thông số chiến dịch</Button>
            <Button block type="text" className="text-indigo-600 font-medium">Xuất sao kê minh bạch quỹ PDF</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
