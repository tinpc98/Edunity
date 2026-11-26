import { useState, type FormEvent } from 'react';
import { Input, InputNumber, Button, Table, Tag, Avatar, Modal, Form, Select, message, Pagination } from 'antd';
import { 
  SearchOutlined, 
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  FileDoneOutlined,
  SyncOutlined,
  BookOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from '../../../services/scholarshipApplication.service';
import { campaignService, campaignKeys } from '../../../services/campaign.service';
import type { ScholarshipApplication } from '../../../types/scholarship';
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from '../../../types/scholarship';
import { formatVND } from '../../../types/payment';
import { AdminPageHero, AdminFilterBar, AdminFilterField, AdminTableCard } from '../../../components/admin';
import AdminKpiCard from '../../../components/admin/AdminKpiCard';

export default function ScholarshipApplicationsPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const submissionModeFilter = 'ALL';
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchText, setSearchText] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [residenceProvinceFilter, setResidenceProvinceFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [povertyFilter, setPovertyFilter] = useState('ALL');
  const [hardshipFilter, setHardshipFilter] = useState('ALL');
  const [paperFilter, setPaperFilter] = useState('ALL');
  const [minPriorityScore, setMinPriorityScore] = useState<number | null>(null);
  const [maxPriorityScore, setMaxPriorityScore] = useState<number | null>(null);
  const [sortByPriority, setSortByPriority] = useState(false);
  const [isPaperIntakeModalOpen, setIsPaperIntakeModalOpen] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeForm] = Form.useForm();

  // Load danh sách chiến dịch để đưa vào dropdown lọc
  const { data: campaignsData } = useQuery({
    queryKey: campaignKeys.adminList({ pageSize: 100 }),
    queryFn: () => campaignService.adminListCampaigns({ pageSize: 100 }),
  });
  const campaignOptions = [
    { value: 'ALL', label: 'Tất cả chiến dịch' },
    ...(campaignsData?.items || []).map((c) => ({
      value: c.id,
      label: c.title,
    })),
  ];

  const handleIntakeSubmit = async () => {
    try {
      const values = await intakeForm.validateFields();
      setIntakeLoading(true);
      await scholarshipApplicationService.adminIntakePaperDossier({
        postalInfo: {
          deliveryMethod: values.deliveryMethod || "POSTAL_MAIL",
          carrierName: values.carrierName,
          trackingNumber: values.trackingNumber,
          senderName: values.senderName,
          senderPhone: values.senderPhone,
          senderAddress: values.senderAddress,
          packageCondition: values.packageCondition || "INTACT",
        },
        applicationCode: values.applicationCode ? values.applicationCode.trim().toUpperCase() : undefined,
        intakeNote: values.intakeNote,
      });
      message.success("Đã tiếp nhận hồ sơ giấy thành công! Biên nhận đã được tạo.");
      setIsPaperIntakeModalOpen(false);
      intakeForm.resetFields();
    } catch (err: any) {
      message.error(err?.message || "Tiếp nhận hồ sơ giấy thất bại.");
    } finally {
      setIntakeLoading(false);
    }
  };

  // Fetch applications & counts trực tiếp từ backend phân trang trên database
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({
      status: activeFilter,
      campaignId: campaignFilter,
      submissionMode: submissionModeFilter,
      search: searchText.trim(),
      province: provinceFilter.trim(),
      residenceProvince: residenceProvinceFilter.trim(),
      gradeLevel: gradeFilter,
      hasPovertyCertificate: povertyFilter,
      hardshipCategory: hardshipFilter,
      paperStatus: paperFilter,
      minPriorityScore,
      maxPriorityScore,
      sortByPriority,
      page,
      pageSize,
    }),
    queryFn: () =>
      scholarshipApplicationService.adminListApplications({
        status: activeFilter,
        campaignId: campaignFilter === 'ALL' ? undefined : campaignFilter,
        submissionMode: submissionModeFilter === 'ALL' ? undefined : submissionModeFilter,
        search: searchText.trim() || undefined,
        province: provinceFilter.trim() || undefined,
        residenceProvince: residenceProvinceFilter.trim() || undefined,
        gradeLevel: gradeFilter === 'ALL' ? undefined : gradeFilter,
        hasPovertyCertificate: povertyFilter === 'ALL' ? undefined : povertyFilter,
        hardshipCategory: hardshipFilter === 'ALL' ? undefined : hardshipFilter,
        paperStatus: paperFilter === 'ALL' ? undefined : paperFilter,
        minPriorityScore: minPriorityScore ?? undefined,
        maxPriorityScore: maxPriorityScore ?? undefined,
        sortByPriority,
        page,
        pageSize,
      }),
  });

  const counts = data?.counts || {
    all: data?.total ?? 0,
    submitted: 0,
    needMoreInfo: 0,
    dossierVerified: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };

  const getStatusTag = (status: string) => {
    const label = SCHOLARSHIP_APP_STATUS_LABELS[status as keyof typeof SCHOLARSHIP_APP_STATUS_LABELS] || status;
    const color = SCHOLARSHIP_APP_STATUS_COLORS[status as keyof typeof SCHOLARSHIP_APP_STATUS_COLORS] || 'default';
    switch (status) {
      case 'APPROVED': return <Tag color={color} icon={<CheckCircleOutlined />}>{label}</Tag>;
      case 'DOSSIER_VERIFIED': return <Tag color="cyan" icon={<FileDoneOutlined />}>Đủ hồ sơ – Chờ duyệt</Tag>;
      case 'SUBMITTED': return <Tag color={color} icon={<ClockCircleOutlined />}>{label}</Tag>;
      case 'NEED_MORE_INFORMATION': return <Tag color={color} icon={<ExclamationCircleOutlined />}>{label}</Tag>;
      case 'REJECTED': return <Tag color={color} icon={<CloseCircleOutlined />}>{label}</Tag>;
      default: return <Tag color={color}>{label}</Tag>;
    }
  };

  const items = data?.items || [];

  const columns = [
    {
      title: 'Mã hồ sơ',
      dataIndex: 'applicationCode',
      key: 'applicationCode',
      width: 130,
      render: (code: string, record: ScholarshipApplication) => (
        <span className="font-mono text-xs font-bold text-gray-800">
          {code || record.id.substring(0, 10).toUpperCase()}
        </span>
      ),
    },
    {
      title: 'Học sinh',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 180,
      render: (text: string) => {
        const displayName = text || 'Học viên';
        const initials = displayName.substring(0, 2).toUpperCase();
        return (
          <div className="flex items-center gap-2.5">
            <Avatar className="bg-teal-50 text-teal-800 border border-teal-200 font-bold shrink-0">{initials}</Avatar>
            <div className="font-bold text-[#163B40] text-sm truncate">{displayName}</div>
          </div>
        );
      },
    },
    {
      title: 'Chiến dịch',
      dataIndex: 'campaignTitle',
      key: 'campaignTitle',
      width: 240,
      render: (text: string, record: ScholarshipApplication) => (
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate" title={text || 'Chiến dịch học bổng'}>{text || 'Chiến dịch học bổng'}</div>
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
      width: 110,
      render: (dateStr: string) => (
        <span className="text-xs text-gray-600 font-medium">
          {dateStr ? new Date(dateStr).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }) : '—'}
        </span>
      ),
    },
    {
      title: 'Điểm ưu tiên',
      key: 'priorityScore',
      width: 120,
      render: (_: any, record: ScholarshipApplication) => {
        const score = record.screeningResult?.layer2Score;
        const statusKey =
          record.screeningResult?.scoreStatus ||
          (record.status === 'APPROVED'
            ? 'OFFICIAL'
            : record.status === 'DOSSIER_VERIFIED'
            ? 'VERIFIED'
            : score != null
            ? 'AUTOMATIC'
            : 'UNSCORED');
        const statusConfig: Record<string, { label: string; color: string }> = {
          UNSCORED: { label: 'Chưa chấm', color: 'default' },
          AUTOMATIC: { label: 'Tự động', color: 'processing' },
          VERIFIED: { label: 'Đã duyệt', color: 'success' },
          ADJUSTED: { label: 'Điều chỉnh', color: 'purple' },
          OFFICIAL: { label: 'Chính thức', color: 'gold' },
        };
        const config = statusConfig[statusKey] || statusConfig.UNSCORED;
        return (
          <div className="flex flex-col gap-1 items-start">
            {score !== null && score !== undefined ? (
              <Tag color="blue" className="font-semibold !m-0">
                {score} điểm
              </Tag>
            ) : (
              <span className="text-gray-400 text-xs">0 điểm</span>
            )}
            <Tag color={config.color} className="text-[10px] uppercase font-bold !m-0">
              {config.label}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Tình trạng & Mục thiếu',
      key: 'statusInfo',
      render: (_: any, record: ScholarshipApplication) => {
        const summary = record.checklistSummary as any;
        const missing = summary?.missingItemTitles || [];
        const pending = summary?.pendingItemTitles || [];
        return (
          <div className="flex flex-col gap-1 items-start">
            {getStatusTag(record.status)}
            {pending.length > 0 && record.status === 'SUBMITTED' && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Chờ kiểm tra: {pending.join(', ')}
              </span>
            )}
            {missing.length > 0 && (
              <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Cần bổ sung: {missing.join(', ')}
              </span>
            )}
            {summary?.isComplete && record.status === 'SUBMITTED' && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Đã đủ giấy tờ bắt buộc
              </span>
            )}
          </div>
        );
      },
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

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchText('');
    setCampaignFilter('ALL');
    setProvinceFilter('');
    setResidenceProvinceFilter('');
    setGradeFilter('ALL');
    setPovertyFilter('ALL');
    setHardshipFilter('ALL');
    setPaperFilter('ALL');
    setMinPriorityScore(null);
    setMaxPriorityScore(null);
    setSortByPriority(false);
    setActiveFilter('ALL');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-5 w-full pb-10">
      <AdminPageHero
        icon={<BookOutlined />}
        title="Quản lý hồ sơ học bổng"
        crumb="Hồ sơ học bổng"
        description="Quản lý, tiếp nhận và xét duyệt hồ sơ ứng tuyển của học sinh."
        extra={
          <div className="flex items-center gap-2">
            <Button
              icon={<SyncOutlined spin={isFetching} />}
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-xl"
            >
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<InboxOutlined />}
              onClick={() => setIsPaperIntakeModalOpen(true)}
              className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-bold shadow-xs"
            >
              Tiếp nhận hồ sơ giấy
            </Button>
          </div>
        }
      />

      {/* 6 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <AdminKpiCard
          title="Tất cả hồ sơ"
          value={counts.all.toLocaleString("vi-VN")}
          icon={<TeamOutlined />}
          variant="teal"
          onClick={() => { setActiveFilter('ALL'); setPage(1); }}
        />
        <AdminKpiCard
          title="Chờ xét duyệt"
          value={counts.submitted.toLocaleString("vi-VN")}
          icon={<ClockCircleOutlined />}
          variant="sky"
          onClick={() => { setActiveFilter('SUBMITTED'); setPage(1); }}
        />
        <AdminKpiCard
          title="Cần bổ sung"
          value={counts.needMoreInfo.toLocaleString("vi-VN")}
          icon={<ExclamationCircleOutlined />}
          variant="amber"
          onClick={() => { setActiveFilter('NEED_MORE_INFORMATION'); setPage(1); }}
        />
        <AdminKpiCard
          title="Đủ hồ sơ – Chờ duyệt"
          value={counts.dossierVerified.toLocaleString("vi-VN")}
          icon={<FileDoneOutlined />}
          variant="mint"
          onClick={() => { setActiveFilter('DOSSIER_VERIFIED'); setPage(1); }}
        />
        <AdminKpiCard
          title="Đã duyệt"
          value={counts.approved.toLocaleString("vi-VN")}
          icon={<CheckCircleOutlined />}
          variant="teal"
          onClick={() => { setActiveFilter('APPROVED'); setPage(1); }}
        />
        <AdminKpiCard
          title="Từ chối"
          value={counts.rejected.toLocaleString("vi-VN")}
          icon={<CloseCircleOutlined />}
          variant="rose"
          onClick={() => { setActiveFilter('REJECTED'); setPage(1); }}
        />
      </div>

      {/* Main Data Table + Filter bar */}
      <AdminTableCard>
        <form onSubmit={handleSearchSubmit}>
          <AdminFilterBar
            title="Bộ lọc hồ sơ học bổng"
            gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3"
            onReset={handleResetFilters}
            hasFilter={Boolean(
              searchText ||
              campaignFilter !== 'ALL' ||
              provinceFilter ||
              residenceProvinceFilter ||
              gradeFilter !== 'ALL' ||
              povertyFilter !== 'ALL' ||
              hardshipFilter !== 'ALL' ||
              paperFilter !== 'ALL' ||
              minPriorityScore !== null ||
              maxPriorityScore !== null ||
              sortByPriority
            )}
          >
            <AdminFilterField label="Tìm kiếm">
              <Input
                placeholder="Tìm mã hồ sơ, tên học sinh..."
                prefix={<SearchOutlined className="text-slate-400" />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                className="rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Chiến dịch">
              <Select
                value={campaignFilter}
                onChange={(val) => { setCampaignFilter(val); setPage(1); }}
                options={campaignOptions}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                className="w-full rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Cấp lớp">
              <Select
                value={gradeFilter}
                onChange={(val) => { setGradeFilter(val); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'Mọi cấp lớp' },
                  ...Array.from({ length: 12 }, (_, index) => ({ value: `GRADE_${index + 1}`, label: `Lớp ${index + 1}` })),
                  { value: 'UNIVERSITY', label: 'Đại học' },
                  { value: 'COLLEGE', label: 'Cao đẳng' },
                ]}
                className="w-full rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Tỉnh/Thành trường">
              <Input
                placeholder="VD: Hà Giang, Cao Bằng..."
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                allowClear
                className="rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Tỉnh/Thành hộ khẩu">
              <Input
                placeholder="VD: Nghệ An, Hà Tĩnh..."
                value={residenceProvinceFilter}
                onChange={(e) => setResidenceProvinceFilter(e.target.value)}
                allowClear
                className="rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Hộ nghèo">
              <Select
                value={povertyFilter}
                onChange={(val) => { setPovertyFilter(val); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'Hộ nghèo: tất cả' },
                  { value: 'true', label: 'Có giấy chứng nhận' },
                  { value: 'false', label: 'Không có giấy' },
                ]}
                className="w-full rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Diện khó khăn">
              <Select
                value={hardshipFilter}
                onChange={(val) => { setHardshipFilter(val); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'Mọi diện khó khăn' },
                  { value: 'POOR_HOUSEHOLD', label: 'Hộ nghèo' },
                  { value: 'NEAR_POOR_HOUSEHOLD', label: 'Hộ cận nghèo' },
                  { value: 'REMOTE_AREA', label: 'Vùng sâu/vùng xa' },
                  { value: 'ORPHANED', label: 'Mồ côi cha mẹ' },
                ]}
                className="w-full rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Hồ sơ giấy">
              <Select
                value={paperFilter}
                onChange={(val) => { setPaperFilter(val); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'Hồ sơ giấy: tất cả' },
                  { value: 'NOT_DECLARED', label: 'Chưa khai báo gửi' },
                  { value: 'DECLARED', label: 'Đã khai báo gửi' },
                  { value: 'RECEIVED', label: 'Đã nhận' },
                  { value: 'RECONCILED', label: 'Đã đối chiếu' },
                ]}
                className="w-full rounded-xl"
              />
            </AdminFilterField>

            <AdminFilterField label="Khoảng điểm ưu tiên">
              <div className="flex items-center gap-1.5">
                <InputNumber
                  min={0}
                  placeholder="Từ"
                  value={minPriorityScore}
                  onChange={(val) => setMinPriorityScore(val)}
                  className="w-full rounded-xl"
                />
                <span className="text-slate-400">-</span>
                <InputNumber
                  min={0}
                  placeholder="Đến"
                  value={maxPriorityScore}
                  onChange={(val) => setMaxPriorityScore(val)}
                  className="w-full rounded-xl"
                />
              </div>
            </AdminFilterField>

            <AdminFilterField label="Thao tác">
              <div className="flex items-center gap-2">
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SearchOutlined />}
                  className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-medium"
                >
                  Lọc
                </Button>
                <Button
                  onClick={() => { setSortByPriority(!sortByPriority); setPage(1); }}
                  type={sortByPriority ? "primary" : "default"}
                  className="rounded-xl"
                >
                  {sortByPriority ? "Ưu tiên: Cao → Thấp" : "Xếp theo điểm"}
                </Button>
              </div>
            </AdminFilterField>
          </AdminFilterBar>
        </form>

        <div className="overflow-x-auto">
          <Table
            columns={columns}
            dataSource={items}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            className="border-t border-slate-100"
          />
        </div>

        {data && data.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data.total)} trong tổng số {data.total} hồ sơ
            </span>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={data.total}
              onChange={(p) => setPage(p)}
              showSizeChanger={false}
              size="small"
            />
          </div>
        )}
      </AdminTableCard>

      {/* MODAL TIẾP NHẬN HỒ SƠ GIẤY ĐẾN TRƯỚC */}
      <Modal
        title="Tiếp nhận hồ sơ giấy gửi đến trước"
        open={isPaperIntakeModalOpen}
        onCancel={() => setIsPaperIntakeModalOpen(false)}
        footer={null}
        destroyOnClose
        width={600}
      >
        <Form
          form={intakeForm}
          layout="vertical"
          initialValues={{
            deliveryMethod: "POSTAL_MAIL",
            carrierName: "VNPost",
            packageCondition: "INTACT",
          }}
          onFinish={handleIntakeSubmit}
          className="pt-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item name="deliveryMethod" label="Phương thức nhận" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "POSTAL_MAIL", label: "Bưu chính / Thư bảo đảm" },
                  { value: "COURIER", label: "Chuyển phát nhanh (GHTK/ViettelPost)" },
                  { value: "IN_PERSON_DROP_OFF", label: "Nộp trực tiếp tại văn phòng" },
                ]}
              />
            </Form.Item>
            <Form.Item name="carrierName" label="Đơn vị vận chuyển" rules={[{ required: true, message: "Nhập đơn vị vận chuyển" }]}>
              <Input placeholder="VNPost / ViettelPost / Trực tiếp..." />
            </Form.Item>
            <Form.Item name="trackingNumber" label="Mã vận đơn / Bưu gửi">
              <Input placeholder="VD: VN123456789" />
            </Form.Item>
            <Form.Item name="packageCondition" label="Tình trạng bưu kiện" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "INTACT", label: "Nguyên vẹn (INTACT)" },
                  { value: "DAMAGED", label: "Hư hỏng (DAMAGED)" },
                  { value: "TORN", label: "Bị rách (TORN)" },
                  { value: "WET", label: "Bị ướt (WET)" },
                  { value: "PARTIAL", label: "Thiếu phần (PARTIAL)" },
                ]}
              />
            </Form.Item>
            <Form.Item name="senderName" label="Người gửi / Học sinh" rules={[{ required: true, message: "Nhập tên người gửi" }]}>
              <Input placeholder="Họ và tên..." />
            </Form.Item>
            <Form.Item name="senderPhone" label="Số điện thoại người gửi">
              <Input placeholder="Số điện thoại liên hệ..." />
            </Form.Item>
            <Form.Item name="applicationCode" label="Mã hồ sơ liên kết (nếu có)" className="md:col-span-2">
              <Input placeholder="APP-YYYYMMDD-XXXX (để trống nếu chưa liên kết)" />
            </Form.Item>
            <Form.Item name="intakeNote" label="Ghi chú tiếp nhận" className="md:col-span-2">
              <Input.TextArea rows={2} placeholder="Chi tiết giấy tờ bên trong bưu phẩm..." />
            </Form.Item>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <Button onClick={() => setIsPaperIntakeModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={intakeLoading} className="bg-teal-600 hover:bg-teal-700 font-semibold">
              Xác nhận tiếp nhận
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
