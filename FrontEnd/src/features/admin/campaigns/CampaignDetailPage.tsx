import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Breadcrumb,
  Button,
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Tabs,
  Table,
  Avatar,
  Skeleton,
  Alert,
  Popconfirm,
  message,
  Select,
  Modal,
  Input,
  DatePicker,
  Form,
  Space,
  Checkbox,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  RocketOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type {
  SponsorContribution,
  ContributionStatus,
} from "../../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_STATUS_COLORS,
  FUNDING_STATUS_LABELS,
  FUNDING_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
} from "../../../types/campaign";
import dayjs from "dayjs";
import { formatVND } from "../../../types/payment";
import { scholarshipApplicationService, scholarshipApplicationKeys } from "../../../services/scholarshipApplication.service";
import type { ScholarshipApplication, ScholarshipApplicationStatus } from "../../../types/scholarship";
import { SCHOLARSHIP_APP_STATUS_LABELS, SCHOLARSHIP_APP_STATUS_COLORS } from "../../../types/scholarship";
import { ROUTES } from "../../../routes/routePaths";
import { toVietnamCampaignBoundary } from "../../../utils/vietnamCampaignTime";

const { Title, Paragraph } = Typography;

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileReason, setReconcileReason] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAndPublish, setScheduleAndPublish] = useState(false);
  const [scheduleForm] = Form.useForm();

  // State cho Modal gia hạn khi mở lại gây quỹ / nhận hồ sơ
  const [reopenFundingOpen, setReopenFundingOpen] = useState(false);
  const [reopenFundingDate, setReopenFundingDate] = useState<any>(null);
  const [reopenApplicationOpen, setReopenApplicationOpen] = useState(false);
  const [reopenApplicationDate, setReopenApplicationDate] = useState<any>(null);
  const [reopenCampaignOpen, setReopenCampaignOpen] = useState(false);
  const [reopenCampaignForm] = Form.useForm();

  const [contribPage, setContribPage] = useState<number>(1);
  const [contribPageSize, setContribPageSize] = useState<number>(10);
  const [applicationStatus, setApplicationStatus] = useState("ALL");
  const [applicationPage, setApplicationPage] = useState(1);
  const applicationPageSize = 10;

  // Fetch campaign details
  const {
    data: campaign,
    isLoading: isLoadingCampaign,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: campaignKeys.adminDetail(campaignId || ""),
    queryFn: () => (campaignId ? campaignService.adminGetCampaign(campaignId) : null),
    enabled: Boolean(campaignId),
  });

  const { data: applicationsData, isLoading: isLoadingApplications } = useQuery({
    queryKey: scholarshipApplicationKeys.adminList({
      campaignId,
      status: applicationStatus,
      page: applicationPage,
      pageSize: applicationPageSize,
    }),
    queryFn: () => scholarshipApplicationService.adminListApplications({
      campaignId,
      status: applicationStatus,
      page: applicationPage,
      pageSize: applicationPageSize,
    }),
    enabled: Boolean(campaignId) && activeTab === "applications",
  });

  // Fetch campaign contributions
  const {
    data: contributionsData,
    isLoading: isLoadingContributions,
  } = useQuery({
    queryKey: campaignKeys.adminContributions(campaignId || "", { page: contribPage, pageSize: contribPageSize }),
    queryFn: () =>
      campaignId
        ? campaignService.adminListContributions(campaignId, {
            page: contribPage,
            pageSize: contribPageSize,
          })
        : null,
    enabled: Boolean(campaignId),
  });

  // Publish / Close mutations
  const publishMutation = useMutation({
    mutationFn: (id: string) => campaignService.publishCampaign(id),
    onSuccess: () => {
      message.success("Đã phát hành chiến dịch sang trạng thái OPEN_FOR_FUNDING.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => {
      const missingDates = err.details?.missing as string[] | undefined;
      message.error(
        missingDates?.length
          ? "Cần cấu hình đủ lịch vận động và lịch nhận hồ sơ trước khi phát hành."
          : err.message || "Không thể phát hành chiến dịch."
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => campaignService.closeCampaign(id),
    onSuccess: () => {
      message.success("Đã đóng chính thức toàn bộ chiến dịch (CLOSED).");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể đóng chiến dịch.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignService.deleteCampaign(id),
    onSuccess: () => {
      message.success("Đã xóa chiến dịch nháp thành công.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      navigate(ROUTES.ADMIN.CAMPAIGNS);
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể xóa chiến dịch nháp.");
    },
  });

  const pauseFundingMutation = useMutation({
    mutationFn: () => campaignService.pauseFunding(campaignId || ""),
    onSuccess: () => {
      message.success("Đã tạm dừng nhận tài trợ gây quỹ.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể tạm dừng gây quỹ."),
  });

  const resumeFundingMutation = useMutation({
    mutationFn: (payload?: { newFundingEnd?: string }) => campaignService.resumeFunding(campaignId || "", payload),
    onSuccess: () => {
      message.success("Đã tiếp tục/mở lại nhận tài trợ gây quỹ thành công.");
      setReopenFundingOpen(false);
      setReopenFundingDate(null);
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể mở lại gây quỹ."),
  });

  const closeFundingMutation = useMutation({
    mutationFn: () => campaignService.closeFunding(campaignId || ""),
    onSuccess: () => {
      message.success("Đã đóng nhận tài trợ gây quỹ chính thức.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể đóng gây quỹ."),
  });

  const pauseApplicationsMutation = useMutation({
    mutationFn: () => campaignService.pauseApplications(campaignId || ""),
    onSuccess: () => {
      message.success("Đã tạm dừng tiếp nhận hồ sơ mới.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể tạm dừng nhận hồ sơ."),
  });

  const resumeApplicationsMutation = useMutation({
    mutationFn: (payload?: { newApplicationEnd?: string }) => campaignService.resumeApplications(campaignId || "", payload),
    onSuccess: () => {
      message.success("Đã tiếp tục/mở lại tiếp nhận hồ sơ thành công.");
      setReopenApplicationOpen(false);
      setReopenApplicationDate(null);
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể mở lại nhận hồ sơ."),
  });

  const closeApplicationsMutation = useMutation({
    mutationFn: () => campaignService.closeApplications(campaignId || ""),
    onSuccess: () => {
      message.success("Đã đóng tiếp nhận hồ sơ chính thức.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể đóng nhận hồ sơ."),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => campaignService.reconcileFunding(campaignId || "", reconcileReason),
    onSuccess: () => {
      message.success("Đã đối soát và lưu số suất học bổng chính thức.");
      setReconcileOpen(false);
      setReconcileReason("");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể đối soát nguồn tài trợ."),
  });

  const reopenCampaignMutation = useMutation({
    mutationFn: (payload: {
      reason: string;
      newFundingEnd?: string;
      newApplicationEnd?: string;
      reopenFunding?: boolean;
      reopenApplications?: boolean;
      confirmReopenReconciled?: boolean;
    }) => campaignService.reopenCampaign(campaignId || "", payload),
    onSuccess: () => {
      message.success("Đã khôi phục chiến dịch thành công.");
      setReopenCampaignOpen(false);
      reopenCampaignForm.resetFields();
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => message.error(err.message || "Không thể khôi phục chiến dịch."),
  });

  const scheduleMutation = useMutation({
    mutationFn: (payload: { fundingStart: string; fundingEnd: string; applicationStart: string; applicationEnd: string; timelineMode?: "SEQUENTIAL" | "PARALLEL" }) =>
      campaignService.updateCampaign(campaignId || "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      message.success("Đã lưu lịch chiến dịch.");
    },
  });

  const openScheduleModal = (publishAfterSave: boolean) => {
    scheduleForm.setFieldsValue({
      fundingStart: campaign?.fundingStart ? dayjs(campaign.fundingStart) : undefined,
      fundingEnd: campaign?.fundingEnd ? dayjs(campaign.fundingEnd) : undefined,
      applicationStart: campaign?.applicationStart ? dayjs(campaign.applicationStart) : undefined,
      applicationEnd: campaign?.applicationEnd ? dayjs(campaign.applicationEnd) : undefined,
    });
    setScheduleAndPublish(publishAfterSave);
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!campaign) return;
    try {
      const values = await scheduleForm.validateFields();
      await scheduleMutation.mutateAsync({
        fundingStart: values.fundingStart ? values.fundingStart.toISOString() : "",
        fundingEnd: values.fundingEnd ? values.fundingEnd.toISOString() : "",
        applicationStart: values.applicationStart ? values.applicationStart.toISOString() : "",
        applicationEnd: values.applicationEnd ? values.applicationEnd.toISOString() : "",
        timelineMode: "SEQUENTIAL",
      });
      if (scheduleAndPublish) await publishMutation.mutateAsync(campaign.id);
      setScheduleOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.message || "Không thể lưu lịch hoặc phát hành chiến dịch.");
    }
  };

  const scheduleComplete = Boolean(
    campaign?.fundingStart && campaign?.fundingEnd && campaign?.applicationStart && campaign?.applicationEnd
  );

  if (isLoadingCampaign) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <Alert
          type="error"
          message="Không tìm thấy chiến dịch"
          description="Chiến dịch học bổng không tồn tại trên hệ thống."
          showIcon
        />
        <Link to={ROUTES.ADMIN.CAMPAIGNS}>
          <Button icon={<ArrowLeftOutlined />}>Quay lại danh sách chiến dịch</Button>
        </Link>
      </div>
    );
  }

  const contributions = contributionsData?.items || [];
  const totalContributions = contributionsData?.total || 0;

  const sponsorColumns: ColumnsType<SponsorContribution> = [
    {
      title: "Nhà tài trợ",
      dataIndex: "sponsorEmail",
      key: "sponsorEmail",
      render: (email: string, record) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-teal-50 text-teal-800 border border-teal-200 font-bold">
            {(email || record.sponsorId || "SP").substring(0, 2).toUpperCase()}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-800 text-sm">
              {email || "Nhà tài trợ"}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              ID: {record.sponsorId.slice(0, 8)}...
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Số tiền tài trợ",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (val: number) => (
        <span className="font-bold text-emerald-600 text-sm">{formatVND(val)}</span>
      ),
    },
    {
      title: "Mã đối soát",
      dataIndex: "paymentReference",
      key: "paymentReference",
      render: (ref: string) => (
        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {ref || "-"}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      align: "center",
      render: (status: ContributionStatus) => (
        <Tag color={CONTRIBUTION_STATUS_COLORS[status] || "default"} className="font-medium">
          {CONTRIBUTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      render: (date: string) => (
        <span className="text-xs text-slate-500">
          {new Date(date).toLocaleString("vi-VN")}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto p-4 md:p-8">
      <Breadcrumb
        className="mb-2 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</Link> },
          { title: campaign.title },
        ]}
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Tag color={CAMPAIGN_STATUS_COLORS[campaign.status]} className="font-semibold text-xs px-2.5 py-0.5 rounded-full">
              {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
            </Tag>
            {campaign.status !== "DRAFT" && campaign.fundingStatus && (
              <Tag color={FUNDING_STATUS_COLORS[campaign.fundingStatus]} className="text-xs px-2.5 py-0.5 rounded-full">
                Gây quỹ: {FUNDING_STATUS_LABELS[campaign.fundingStatus] || campaign.fundingStatus}
              </Tag>
            )}
            {campaign.status !== "DRAFT" && campaign.applicationStatus && (
              <Tag color={APPLICATION_STATUS_COLORS[campaign.applicationStatus]} className="text-xs px-2.5 py-0.5 rounded-full">
                Hồ sơ: {APPLICATION_STATUS_LABELS[campaign.applicationStatus] || campaign.applicationStatus}
              </Tag>
            )}
            <span className="text-xs text-slate-400 font-mono">ID: #{campaign.id}</span>
          </div>
          <Title level={2} className="!m-0 text-slate-900 font-bold">
            {campaign.title}
          </Title>
        </div>

        <div className="flex items-center gap-3">
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            className="rounded-xl"
          >
            Làm mới
          </Button>

          {campaign.status === "DRAFT" && scheduleComplete && (
            <>
              <Button onClick={() => openScheduleModal(false)} className="rounded-xl">Sửa lịch</Button>
              <Popconfirm
                title="Phát hành chiến dịch?"
                description="Chiến dịch sẽ được chuyển sang trạng thái OPEN_FOR_FUNDING và công khai để nhận tài trợ."
                onConfirm={() => publishMutation.mutate(campaign.id)}
                okText="Phát hành"
                cancelText="Hủy"
              >
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  loading={publishMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold shadow-xs"
                >
                  Phát hành chiến dịch
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Xóa chiến dịch nháp?"
                description="Bạn có chắc chắn muốn xóa chiến dịch nháp này không? Hành động này không thể hoàn tác."
                onConfirm={() => deleteMutation.mutate(campaign.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteMutation.isPending}
                  className="rounded-xl font-semibold shadow-xs"
                >
                  Xóa chiến dịch
                </Button>
              </Popconfirm>
            </>
          )}

          {campaign.status === "DRAFT" && !scheduleComplete && (
            <>
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={() => openScheduleModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold shadow-xs"
              >
                Cấu hình lịch và phát hành
              </Button>
              <Popconfirm
                title="Xóa chiến dịch nháp?"
                description="Bạn có chắc chắn muốn xóa chiến dịch nháp này không? Hành động này không thể hoàn tác."
                onConfirm={() => deleteMutation.mutate(campaign.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteMutation.isPending}
                  className="rounded-xl font-semibold shadow-xs"
                >
                  Xóa chiến dịch
                </Button>
              </Popconfirm>
            </>
          )}

          {campaign.status === "OPEN_FOR_FUNDING" && (
            <Popconfirm
              title="Đóng chính thức chiến dịch?"
              description="Hành động này sẽ kết thúc hoàn toàn chiến dịch, bao gồm cả đóng cổng gây quỹ và tiếp nhận hồ sơ."
              onConfirm={() => closeMutation.mutate(campaign.id)}
              okText="Đóng chính thức"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<StopOutlined />}
                loading={closeMutation.isPending}
                className="rounded-xl font-semibold shadow-xs"
              >
                Đóng chiến dịch
              </Button>
            </Popconfirm>
          )}

          {campaign.status === "CLOSED" && (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => setReopenCampaignOpen(true)}
              className="rounded-xl font-semibold bg-teal-600 hover:bg-teal-500 shadow-xs"
            >
              Khôi phục chiến dịch
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Mục tiêu ngân sách</div>
            <div className="text-xl font-black text-slate-900">{formatVND(campaign.targetBudget)}</div>
            <div className="text-xs text-slate-400 mt-2">Định mức: {formatVND(campaign.awardAmountPerStudent)}/học viên</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-teal-200/80 shadow-xs bg-teal-50/50">
            <div className="text-xs text-teal-800 uppercase font-bold tracking-wider mb-1">Đã huy động được</div>
            <div className="text-xl font-black text-teal-700">{formatVND(campaign.fundedAmount)}</div>
            <div className="text-xs text-teal-600 mt-2">Đạt {campaign.fundingProgress}% mục tiêu</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Đã cấp học bổng</div>
            <div className="text-xl font-black text-slate-900">{formatVND(campaign.allocatedAmount)}</div>
            <div className="text-xs text-slate-400 mt-2">Đã giải ngân học phí: {formatVND(campaign.usedAmount)}</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/40 border-emerald-200">
            <div className="text-xs text-emerald-800 uppercase font-bold tracking-wider mb-1">Quỹ còn khả dụng</div>
            <div className="text-xl font-black text-emerald-600">{formatVND(campaign.availableFund)}</div>
            <div className="text-xs text-emerald-600/80 mt-2">Quy mô: {campaign.expectedSlots} suất học bổng</div>
          </Card>
        </Col>
      </Row>

      {campaign.status !== "DRAFT" && (
        <Card className="rounded-2xl border-slate-200/80 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-slate-800">Đối soát nguồn tài trợ và chốt số suất</div>
              <div className="text-sm text-slate-500 mt-1">
                Dự kiến: {campaign.projectedSlots ?? 0} suất · Chính thức: {campaign.officialSlotCount ?? "Chưa chốt"}
                {campaign.fundingReconciledAt && ` · Chốt lúc ${new Date(campaign.fundingReconciledAt).toLocaleString("vi-VN")}`}
              </div>
              <div className="text-xs text-slate-500 mt-2 space-y-1">
                <div>
                  Chờ đối soát: {formatVND(campaign.pendingFund ?? 0)} · Đã hoàn trả: {formatVND(campaign.refundedFund ?? 0)}
                  {Boolean(campaign.approvedPendingRefund && campaign.approvedPendingRefund > 0) && (
                    <span> · Chờ chuyển hoàn: {formatVND(campaign.approvedPendingRefund)}</span>
                  )}
                </div>
                <div>Nguồn đủ điều kiện: {formatVND(campaign.officialEligibleFunding ?? campaign.netEligibleFund ?? 0)} · Học bổng đã cấp: {campaign.awardedScholarshipCount ?? 0}</div>
                {campaign.officialSlotCount !== null && campaign.officialSlotCount !== undefined && (
                  <div>Còn có thể cấp: {Math.max(0, campaign.officialSlotCount - (campaign.awardedScholarshipCount ?? 0))} suất · Số dư chưa phân bổ: {formatVND(Math.max(0, (campaign.officialEligibleFunding ?? 0) - campaign.allocatedAmount))}</div>
                )}
              </div>
            </div>
            <Button
              type="primary"
              disabled={campaign.status !== "CLOSED" && (!campaign.fundingEnd || new Date(campaign.fundingEnd).getTime() > Date.now())}
              loading={reconcileMutation.isPending}
              onClick={() => setReconcileOpen(true)}
            >
              {campaign.fundingReconciledAt ? "Đối soát & chốt bổ sung" : "Đối soát & chốt suất"}
            </Button>
          </div>
        </Card>
      )}

      {(campaign.priorityCriteria || []).length > 0 && (
        <Card className="rounded-2xl border-slate-200/80 shadow-xs" title={`Tiêu chí xếp hạng ưu tiên · phiên bản ${campaign.priorityPolicyVersion || 0}`}>
          <div className="text-xs text-slate-500 mb-3">Điểm được tính theo chính sách chiến dịch; nhóm loại trừ chỉ lấy tiêu chí có điểm cao nhất. Điểm không tự quyết định kết quả.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(campaign.priorityCriteria || []).map((criterion) => (
              <div key={criterion.code} className="rounded-lg bg-slate-50 border border-slate-100 p-3 flex justify-between gap-3 text-sm">
                <span>{criterion.label}{criterion.enabled === false ? " · Tắt" : ""}</span>
                <strong>{criterion.points} điểm</strong>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Card Quản lý Vòng đời Gây quỹ & Tiếp nhận hồ sơ độc lập */}
      {campaign.status !== "DRAFT" && (
        <Card
          className="rounded-2xl border-slate-200/80 shadow-xs"
          title={
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <ClockCircleOutlined className="text-teal-700" />
              <span>Quản lý Vòng đời Gây quỹ & Tiếp nhận hồ sơ độc lập</span>
            </div>
          }
        >
          <Row gutter={[24, 24]}>
            {/* Cột 1: Cổng Gây quỹ */}
            <Col xs={24} md={12}>
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm">Cổng Gây quỹ (Nhà hảo tâm)</span>
                  <Tag color={FUNDING_STATUS_COLORS[campaign.fundingStatus || "NOT_STARTED"]} className="font-semibold">
                    {FUNDING_STATUS_LABELS[campaign.fundingStatus || "NOT_STARTED"]}
                  </Tag>
                </div>
                <div className="text-xs text-slate-500">
                  Thời hạn: {campaign.fundingStart ? new Date(campaign.fundingStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.fundingEnd ? new Date(campaign.fundingEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                </div>
                {campaign.fundingPauseReason && (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    Lý do tạm dừng: {campaign.fundingPauseReason}
                  </div>
                )}
                {campaign.status === "OPEN_FOR_FUNDING" && (
                  <Space wrap size="small" className="pt-1">
                    {campaign.fundingStatus === "OPEN" && (
                      <>
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          onClick={() => pauseFundingMutation.mutate()}
                          loading={pauseFundingMutation.isPending}
                          className="text-amber-600 border-amber-300 hover:text-amber-500 hover:border-amber-400"
                        >
                          Tạm dừng gây quỹ
                        </Button>
                        <Popconfirm
                          title="Đóng cổng gây quỹ?"
                          description="Nhà hảo tâm sẽ không thể quyên góp thêm cho chiến dịch này."
                          onConfirm={() => closeFundingMutation.mutate()}
                          okText="Đóng gây quỹ"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<StopOutlined />}
                            loading={closeFundingMutation.isPending}
                          >
                            Đóng gây quỹ
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {campaign.fundingStatus === "PAUSED" && (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={() => {
                            const now = new Date();
                            if (campaign.fundingEnd && new Date(campaign.fundingEnd) <= now) {
                              setReopenFundingOpen(true);
                            } else {
                              resumeFundingMutation.mutate();
                            }
                          }}
                          loading={resumeFundingMutation.isPending}
                          className="bg-emerald-600 hover:bg-emerald-500"
                        >
                          Tiếp tục gây quỹ
                        </Button>
                        <Popconfirm
                          title="Đóng cổng gây quỹ?"
                          description="Nhà hảo tâm sẽ không thể quyên góp thêm cho chiến dịch này."
                          onConfirm={() => closeFundingMutation.mutate()}
                          okText="Đóng gây quỹ"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<StopOutlined />}
                            loading={closeFundingMutation.isPending}
                          >
                            Đóng gây quỹ
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {campaign.fundingStatus === "CLOSED" && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<RedoOutlined />}
                        onClick={() => setReopenFundingOpen(true)}
                        loading={resumeFundingMutation.isPending}
                        className="bg-teal-600 hover:bg-teal-500"
                      >
                        Mở lại gây quỹ
                      </Button>
                    )}
                  </Space>
                )}
                {campaign.status === "CLOSED" && (
                  <div className="text-xs text-slate-400 italic">Chiến dịch đã đóng chính thức toàn bộ.</div>
                )}
              </div>
            </Col>

            {/* Cột 2: Cổng Nhận Hồ sơ */}
            <Col xs={24} md={12}>
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm">Cổng Tiếp nhận Hồ sơ (Học sinh)</span>
                  <Tag color={APPLICATION_STATUS_COLORS[campaign.applicationStatus || "NOT_STARTED"]} className="font-semibold">
                    {APPLICATION_STATUS_LABELS[campaign.applicationStatus || "NOT_STARTED"]}
                  </Tag>
                </div>
                <div className="text-xs text-slate-500">
                  Thời hạn: {campaign.applicationStart ? new Date(campaign.applicationStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.applicationEnd ? new Date(campaign.applicationEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                </div>
                {campaign.applicationPauseReason && (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    Lý do tạm dừng: {campaign.applicationPauseReason}
                  </div>
                )}
                {campaign.status === "OPEN_FOR_FUNDING" && (
                  <Space wrap size="small" className="pt-1">
                    {campaign.applicationStatus === "OPEN" && (
                      <>
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          onClick={() => pauseApplicationsMutation.mutate()}
                          loading={pauseApplicationsMutation.isPending}
                          className="text-amber-600 border-amber-300 hover:text-amber-500 hover:border-amber-400"
                        >
                          Tạm dừng nhận hồ sơ
                        </Button>
                        <Popconfirm
                          title="Đóng cổng tiếp nhận hồ sơ?"
                          description="Học sinh mới sẽ không thể nộp hồ sơ. Các hồ sơ đã nộp vẫn được xét duyệt bình thường."
                          onConfirm={() => closeApplicationsMutation.mutate()}
                          okText="Đóng nhận hồ sơ"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<StopOutlined />}
                            loading={closeApplicationsMutation.isPending}
                          >
                            Đóng nhận hồ sơ
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {campaign.applicationStatus === "PAUSED" && (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={() => {
                            const now = new Date();
                            if (campaign.applicationEnd && new Date(campaign.applicationEnd) <= now) {
                              setReopenApplicationOpen(true);
                            } else {
                              resumeApplicationsMutation.mutate();
                            }
                          }}
                          loading={resumeApplicationsMutation.isPending}
                          className="bg-emerald-600 hover:bg-emerald-500"
                        >
                          Tiếp tục nhận hồ sơ
                        </Button>
                        <Popconfirm
                          title="Đóng cổng tiếp nhận hồ sơ?"
                          description="Học sinh mới sẽ không thể nộp hồ sơ. Các hồ sơ đã nộp vẫn được xét duyệt bình thường."
                          onConfirm={() => closeApplicationsMutation.mutate()}
                          okText="Đóng nhận hồ sơ"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            danger
                            icon={<StopOutlined />}
                            loading={closeApplicationsMutation.isPending}
                          >
                            Đóng nhận hồ sơ
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {campaign.applicationStatus === "CLOSED" && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<RedoOutlined />}
                        onClick={() => setReopenApplicationOpen(true)}
                        loading={resumeApplicationsMutation.isPending}
                        className="bg-teal-600 hover:bg-teal-500"
                      >
                        Mở lại nhận hồ sơ
                      </Button>
                    )}
                  </Space>
                )}
                {campaign.status === "CLOSED" && (
                  <div className="text-xs text-slate-400 italic">Chiến dịch đã đóng chính thức toàn bộ.</div>
                )}
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Tabs */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "overview",
              label: "Tổng quan & Tiến độ",
              children: (
                <div className="space-y-6 pt-2">
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center text-sm font-semibold text-slate-700">
                      <span>Tiến độ huy động quỹ</span>
                      <span className="text-teal-700 font-bold">{campaign.fundingProgress}%</span>
                    </div>
                    <Progress
                      percent={campaign.fundingProgress}
                      showInfo={false}
                      strokeColor={{ "0%": "#6366f1", "100%": "#3b82f6" }}
                      size={["100%", 10]}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Mô tả chiến dịch
                        </div>
                        <Paragraph className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                          {campaign.description || "Chưa có mô tả chi tiết."}
                        </Paragraph>
                      </div>

                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Tiêu chí xét duyệt (Điều kiện cần)
                        </div>
                        <Paragraph className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                          {campaign.eligibilityCriteria || "Không có tiêu chí đặc biệt."}
                        </Paragraph>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 text-xs">
                        <div className="font-bold text-slate-700 uppercase">Khung thời gian hoạt động</div>
                        <div>
                          <span className="text-slate-500">Thời gian nhận tài trợ (Sponsor):</span>
                          <div className="font-semibold text-slate-800 mt-0.5">
                            {campaign.fundingStart ? new Date(campaign.fundingStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.fundingEnd ? new Date(campaign.fundingEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Thời gian nhận hồ sơ (Student):</span>
                          <div className="font-semibold text-slate-800 mt-0.5">
                            {campaign.applicationStart ? new Date(campaign.applicationStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.applicationEnd ? new Date(campaign.applicationEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "contributions",
              label: `Danh sách tài trợ (${campaign.contributionCount || totalContributions})`,
              children: (
                <div className="pt-2">
                  <Table<SponsorContribution>
                    columns={sponsorColumns}
                    dataSource={contributions}
                    rowKey="id"
                    loading={isLoadingContributions}
                    pagination={{
                      current: contribPage,
                      pageSize: contribPageSize,
                      total: totalContributions,
                      showSizeChanger: true,
                      pageSizeOptions: ["10", "20", "50"],
                      onChange: (p, ps) => {
                        setContribPage(p);
                        setContribPageSize(ps);
                      },
                      showTotal: (t) => `Tổng cộng ${t} giao dịch tài trợ`,
                    }}
                  />
                </div>
              ),
            },
            {
              key: "applications",
              label: `Hồ sơ ứng tuyển (${applicationsData?.total ?? 0})`,
              children: (
                <div className="pt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-slate-500">
                      Danh sách hồ sơ thuộc chiến dịch này. Chọn một hồ sơ để xem và xét duyệt.
                    </div>
                    <Select
                      value={applicationStatus}
                      onChange={(value) => {
                        setApplicationStatus(value);
                        setApplicationPage(1);
                      }}
                      className="w-full sm:w-56"
                      options={[
                        { value: "ALL", label: "Tất cả trạng thái" },
                        ...Object.entries(SCHOLARSHIP_APP_STATUS_LABELS).map(([value, label]) => ({ value, label })),
                      ]}
                    />
                  </div>
                  <Table<ScholarshipApplication>
                    columns={[
                      {
                        title: "Học sinh",
                        key: "student",
                        render: (_, record) => (
                          <div>
                            <div className="font-semibold text-slate-800">{record.studentName || "Học viên"}</div>
                            <div className="text-xs text-slate-500">{record.studentEmail || "—"}</div>
                          </div>
                        ),
                      },
                      {
                        title: "Mã hồ sơ",
                        dataIndex: "applicationCode",
                        key: "applicationCode",
                        render: (code: string | null | undefined) => code || "—",
                      },
                      {
                        title: "Hình thức",
                        dataIndex: "submissionMode",
                        key: "submissionMode",
                        render: (mode: string | undefined) => mode === "PAPER" ? "Bản giấy" : mode === "HYBRID" ? "Kết hợp" : "Trực tuyến",
                      },
                      {
                        title: "Ngày nộp",
                        dataIndex: "submittedAt",
                        key: "submittedAt",
                        render: (date: string | null) => date ? new Date(date).toLocaleDateString("vi-VN") : "—",
                      },
                      {
                        title: "Trạng thái",
                        dataIndex: "status",
                        key: "status",
                        render: (status: ScholarshipApplicationStatus) => (
                          <Tag color={SCHOLARSHIP_APP_STATUS_COLORS[status]}>
                            {SCHOLARSHIP_APP_STATUS_LABELS[status] || status}
                          </Tag>
                        ),
                      },
                      {
                        title: "Thao tác",
                        key: "action",
                        render: (_, record) => (
                          <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATION_REVIEW.replace(":applicationId", record.id)}>
                            <Button size="small" type="primary" ghost>Xem hồ sơ</Button>
                          </Link>
                        ),
                      },
                    ]}
                    dataSource={applicationsData?.items || []}
                    rowKey="id"
                    loading={isLoadingApplications}
                    locale={{ emptyText: "Chiến dịch chưa có hồ sơ ứng tuyển." }}
                    pagination={{
                      current: applicationPage,
                      pageSize: applicationPageSize,
                      total: applicationsData?.total || 0,
                      onChange: setApplicationPage,
                      showSizeChanger: false,
                      showTotal: (total) => `Tổng ${total} hồ sơ`,
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={campaign?.fundingReconciledAt ? "Đối soát & chốt bổ sung nguồn tài trợ" : "Đối soát & chốt số suất học bổng"}
        open={reconcileOpen}
        okText={campaign?.fundingReconciledAt ? "Chốt bổ sung" : "Chốt số suất"}
        cancelText="Hủy"
        confirmLoading={reconcileMutation.isPending}
        okButtonProps={{ disabled: reconcileReason.trim().length < 8 }}
        onCancel={() => setReconcileOpen(false)}
        onOk={() => reconcileMutation.mutate()}
      >
        <p className="text-sm text-slate-600">Hệ thống tính theo tài trợ đã xác nhận, trừ khoản hoàn trả. Lần chốt mới sẽ lưu lịch sử và không xóa bản đối soát trước.</p>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          value={reconcileReason}
          onChange={(event) => setReconcileReason(event.target.value)}
          placeholder="Ghi căn cứ đối soát và lý do chốt số suất (ít nhất 8 ký tự)"
        />
      </Modal>
      <Modal
        title="Lịch vận hành chiến dịch (Tuần tự: Gây quỹ → Nhận hồ sơ)"
        open={scheduleOpen}
        okText={scheduleAndPublish ? "Lưu lịch và phát hành" : "Lưu lịch"}
        cancelText="Hủy"
        confirmLoading={scheduleMutation.isPending || publishMutation.isPending}
        onCancel={() => setScheduleOpen(false)}
        onOk={() => void saveSchedule()}
        destroyOnHidden
        width={640}
      >
        <p className="text-xs text-slate-500 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <strong>Quy tắc tuần tự:</strong> Gây quỹ kết thúc trước khi mở nhận hồ sơ. Thời gian hiển thị theo giờ Việt Nam (dd/MM/yyyy HH:mm).
        </p>
        <Form form={scheduleForm} layout="vertical">
          <div className="font-semibold text-slate-700 text-xs uppercase mb-2 text-teal-700">1. Giai đoạn Gây quỹ</div>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="fundingStart"
                label="Bắt đầu gây quỹ"
                rules={[{ required: true, message: "Chọn ngày giờ bắt đầu gây quỹ" }]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  className="w-full"
                  placeholder="dd/MM/yyyy HH:mm"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="fundingEnd"
                label="Kết thúc gây quỹ"
                dependencies={["fundingStart"]}
                rules={[
                  { required: true, message: "Chọn ngày giờ kết thúc gây quỹ" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const start = getFieldValue("fundingStart");
                      if (!value || !start || value.isAfter(start)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Thời gian kết thúc gây quỹ phải sau thời gian bắt đầu"));
                    },
                  }),
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  className="w-full"
                  placeholder="dd/MM/yyyy HH:mm"
                />
              </Form.Item>
            </Col>
          </Row>

          <div className="font-semibold text-slate-700 text-xs uppercase mb-2 text-indigo-700">2. Giai đoạn Nhận hồ sơ</div>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="applicationStart"
                label="Mở nhận hồ sơ"
                dependencies={["fundingEnd"]}
                rules={[
                  { required: true, message: "Chọn ngày giờ mở nhận hồ sơ" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const fEnd = getFieldValue("fundingEnd");
                      if (!value || !fEnd || value.isAfter(fEnd) || value.isSame(fEnd)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Ngày mở nhận hồ sơ phải sau ngày kết thúc gây quỹ"));
                    },
                  }),
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  className="w-full"
                  placeholder="dd/MM/yyyy HH:mm"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="applicationEnd"
                label="Đóng nhận hồ sơ"
                dependencies={["applicationStart"]}
                rules={[
                  { required: true, message: "Chọn ngày giờ đóng nhận hồ sơ" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const aStart = getFieldValue("applicationStart");
                      if (!value || !aStart || value.isAfter(aStart)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Ngày đóng nhận hồ sơ phải sau ngày mở nhận hồ sơ"));
                    },
                  }),
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YYYY HH:mm"
                  className="w-full"
                  placeholder="dd/MM/yyyy HH:mm"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Mở lại / Tiếp tục nhận tài trợ gây quỹ"
        open={reopenFundingOpen}
        okText="Xác nhận mở lại gây quỹ"
        cancelText="Hủy"
        confirmLoading={resumeFundingMutation.isPending}
        onCancel={() => {
          setReopenFundingOpen(false);
          setReopenFundingDate(null);
        }}
        onOk={() => {
          const payload = reopenFundingDate
            ? { newFundingEnd: toVietnamCampaignBoundary(reopenFundingDate, true) || "" }
            : {};
          resumeFundingMutation.mutate(payload);
        }}
      >
        <p className="text-sm text-slate-600 mb-3">
          Nếu thời hạn gây quỹ cũ đã kết thúc, bạn cần chọn thời hạn kết thúc gây quỹ mới (sau thời điểm hiện tại).
        </p>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Thời hạn kết thúc gây quỹ mới (tùy chọn hoặc bắt buộc nếu đã hết hạn):</label>
          <DatePicker
            className="w-full"
            format="DD/MM/YYYY"
            value={reopenFundingDate}
            onChange={(date) => setReopenFundingDate(date)}
            placeholder="Chọn ngày kết thúc gây quỹ mới"
          />
        </div>
      </Modal>

      <Modal
        title="Mở lại / Tiếp tục tiếp nhận hồ sơ"
        open={reopenApplicationOpen}
        okText="Xác nhận mở lại nhận hồ sơ"
        cancelText="Hủy"
        confirmLoading={resumeApplicationsMutation.isPending}
        onCancel={() => {
          setReopenApplicationOpen(false);
          setReopenApplicationDate(null);
        }}
        onOk={() => {
          const payload = reopenApplicationDate
            ? { newApplicationEnd: toVietnamCampaignBoundary(reopenApplicationDate, true) || "" }
            : {};
          resumeApplicationsMutation.mutate(payload);
        }}
      >
        <p className="text-sm text-slate-600 mb-3">
          Nếu thời hạn nhận hồ sơ cũ đã kết thúc, bạn cần chọn thời hạn kết thúc mới (sau thời điểm hiện tại).
        </p>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Thời hạn kết thúc nhận hồ sơ mới (tùy chọn hoặc bắt buộc nếu đã hết hạn):</label>
          <DatePicker
            className="w-full"
            format="DD/MM/YYYY"
            value={reopenApplicationDate}
            onChange={(date) => setReopenApplicationDate(date)}
            placeholder="Chọn ngày kết thúc nhận hồ sơ mới"
          />
        </div>
      </Modal>

      {/* Modal Khôi phục Chiến dịch đã CLOSED */}
      <Modal
        title={
          <span className="flex items-center gap-2 text-teal-800">
            <ReloadOutlined className="text-teal-600" /> Khôi phục chiến dịch đã kết thúc
          </span>
        }
        open={reopenCampaignOpen}
        onCancel={() => {
          setReopenCampaignOpen(false);
          reopenCampaignForm.resetFields();
        }}
        onOk={() => reopenCampaignForm.submit()}
        confirmLoading={reopenCampaignMutation.isPending}
        okText="Khôi phục chiến dịch"
        cancelText="Hủy"
        okButtonProps={{ className: "bg-teal-600 hover:bg-teal-500" }}
      >
        <Alert
          type="info"
          showIcon
          className="mb-4 text-xs"
          message="Cơ chế khôi phục có kiểm soát"
          description="Chiến dịch sẽ được chuyển từ CLOSED về OPEN_FOR_FUNDING. Bạn có thể chọn mở lại gây quỹ hoặc mở lại nhận hồ sơ kèm thời hạn kết thúc mới."
        />
        {campaign?.fundingReconciledAt && (
          <Alert
            type="warning"
            showIcon
            className="mb-4 text-xs"
            message="Chiến dịch đã hoàn tất đối soát tài chính"
            description="Chiến dịch này đã có biên bản đối soát tài chính. Khôi phục lại chiến dịch có thể ảnh hưởng đến số liệu kế toán đã chốt."
          />
        )}
        <Form
          form={reopenCampaignForm}
          layout="vertical"
          onFinish={(values) => {
            const payload: any = {
              reason: values.reason,
              reopenFunding: values.reopenFunding,
              reopenApplications: values.reopenApplications,
              confirmReopenReconciled: values.confirmReopenReconciled,
            };
            if (values.newFundingEnd) {
              payload.newFundingEnd = toVietnamCampaignBoundary(values.newFundingEnd, true);
            }
            if (values.newApplicationEnd) {
              payload.newApplicationEnd = toVietnamCampaignBoundary(values.newApplicationEnd, true);
            }
            reopenCampaignMutation.mutate(payload);
          }}
          initialValues={{
            reopenFunding: true,
            reopenApplications: true,
          }}
        >
          <Form.Item
            name="reason"
            label="Lý do khôi phục chiến dịch"
            rules={[
              { required: true, message: "Vui lòng nhập lý do" },
              { min: 8, message: "Lý do phải có ít nhất 8 ký tự" },
            ]}
          >
            <Input.TextArea rows={3} placeholder="Ví dụ: Mở lại tiếp nhận tài trợ bổ sung từ Mạnh Thường Quân..." />
          </Form.Item>
          <Form.Item name="reopenFunding" valuePropName="checked" className="!mb-2">
            <Checkbox>Mở lại cổng gây quỹ</Checkbox>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.reopenFunding !== cur.reopenFunding}
          >
            {({ getFieldValue }) =>
              getFieldValue("reopenFunding") ? (
                <Form.Item
                  name="newFundingEnd"
                  label="Thời hạn gây quỹ mới (tùy chọn hoặc nếu đã hết hạn)"
                  className="pl-6"
                >
                  <DatePicker format="DD/MM/YYYY" className="w-full" placeholder="Chọn ngày kết thúc gây quỹ mới" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="reopenApplications" valuePropName="checked" className="!mb-2">
            <Checkbox>Mở lại cổng nhận hồ sơ học sinh</Checkbox>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.reopenApplications !== cur.reopenApplications}
          >
            {({ getFieldValue }) =>
              getFieldValue("reopenApplications") ? (
                <Form.Item
                  name="newApplicationEnd"
                  label="Thời hạn nhận hồ sơ mới (tùy chọn hoặc nếu đã hết hạn)"
                  className="pl-6"
                >
                  <DatePicker format="DD/MM/YYYY" className="w-full" placeholder="Chọn ngày kết thúc nhận hồ sơ mới" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          {campaign?.fundingReconciledAt && (
            <Form.Item
              name="confirmReopenReconciled"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value ? Promise.resolve() : Promise.reject(new Error("Cần xác nhận rủi ro đối soát")),
                },
              ]}
            >
              <Checkbox className="text-amber-700 font-medium">
                Tôi hiểu và đồng ý khôi phục chiến dịch dù đã hoàn tất đối soát tài chính
              </Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
