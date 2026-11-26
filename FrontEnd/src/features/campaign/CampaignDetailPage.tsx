import { formatSubjectLabel } from "../../utils/subjectLabel";
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Button,
  Input,
  InputNumber,
  Breadcrumb,
  Alert,
  Skeleton,
  Modal,
  Radio,
  message,
  Divider,
  Space,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  HeartOutlined,
  ArrowLeftOutlined,
  WalletOutlined,
  CloseCircleOutlined,
  EyeInvisibleOutlined,
  GlobalOutlined,
  ExperimentOutlined,
  ShareAltOutlined,
  CopyOutlined,
  FacebookOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../services/campaign.service";
import {
  sponsorContributionService,
  contributionKeys,
} from "../../services/sponsorContribution.service";
import { paymentKeys } from "../../services/gatewayPayment.service";
import { financeKeys } from "../../services/finance.service";
import { useAuthStore } from "../../stores/auth.store";
import { usePaymentPolling, derivePaymentUiState } from "../../hooks/usePaymentPolling";
import {
  PaymentQrPanel,
  PaymentInstructions,
  PaymentResult,
  PaymentErrorState,
} from "../../components/payment";
import type { CreateContributionResponse } from "../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "../../types/campaign";
import ApplyScholarshipModal from "./components/ApplyScholarshipModal";
import { formatVND } from "../../types/payment";
import { ROUTES } from "../../routes/routePaths";

const { Title, Text, Paragraph } = Typography;

const PRESET_AMOUNTS = [
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
];

const IS_DEV_OR_TEST =
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.DEV || import.meta.env?.MODE === "test");

export default function PublicCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [contributionAmount, setContributionAmount] = useState<number>(500_000);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [donorDisplayName, setDonorDisplayName] = useState<string>("");
  const [pendingContribution, setPendingContribution] =
    useState<CreateContributionResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isClientTimerZero, setIsClientTimerZero] = useState<boolean>(false);
  const [isApplyScholarshipModalOpen, setIsApplyScholarshipModalOpen] =
    useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCopyingShareLink, setIsCopyingShareLink] = useState(false);

  // Fetch campaign detail
  const {
    data: campaign,
    isLoading,
    isError,
    refetch: refetchCampaign,
  } = useQuery({
    queryKey: campaignKeys.detail(campaignId || ""),
    queryFn: () => (campaignId ? campaignService.getCampaign(campaignId) : null),
    enabled: Boolean(campaignId),
  });

  // Fetch public recipients for campaign transparency
  const { data: publicRecipientsData, isLoading: isLoadingRecipients } = useQuery({
    queryKey: ['campaignPublicRecipients', campaignId],
    queryFn: () => (campaignId ? campaignService.getPublicRecipients(campaignId) : null),
    enabled: Boolean(campaignId),
  });

  // Poll active donation payment status every 3s when modal is open
  const activePaymentId = pendingContribution?.paymentId || null;
  const {
    payment: polledDonation,
    uiState: polledUiState,
    isPolling,
    isFetching: isPollingFetching,
    refetch: refetchDonationPayment,
  } = usePaymentPolling({
    paymentId: activePaymentId,
    enabled: Boolean(isModalOpen && activePaymentId),
    isClientTimerZero,
  });

  const activeDonation = useMemo(() => {
    if (polledDonation && pendingContribution) {
      return {
        ...pendingContribution,
        ...polledDonation,
        qrCode: polledDonation.qrCode || pendingContribution.qrCode || null,
        checkoutUrl:
          polledDonation.checkoutUrl || pendingContribution.checkoutUrl || null,
        orderCode: polledDonation.orderCode ?? pendingContribution.orderCode ?? null,
      };
    }
    return pendingContribution;
  }, [pendingContribution, polledDonation]);

  const effectiveUiState = useMemo(() => {
    if (polledDonation) return polledUiState;
    if (pendingContribution) {
      return derivePaymentUiState(pendingContribution as any, isClientTimerZero);
    }
    return "PENDING";
  }, [polledDonation, polledUiState, pendingContribution, isClientTimerZero]);

  const hasNotifiedSuccessRef = useRef(false);

  // Only refresh campaign fundedAmount from Backend AFTER webhook confirms COMPLETED
  useEffect(() => {
    if (
      effectiveUiState === "COMPLETED" ||
      effectiveUiState === "RECONCILIATION_REQUIRED"
    ) {
      if (effectiveUiState === "COMPLETED" && !hasNotifiedSuccessRef.current) {
        hasNotifiedSuccessRef.current = true;
        message.success("Quyên góp thành công! Cảm ơn bạn đã đồng hành cùng quỹ học bổng Edunity.");
      }
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: contributionKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      refetchCampaign();
    }
  }, [effectiveUiState, queryClient, refetchCampaign]);

  // Mutation to create contribution intent via Unified Payment Engine (DONATION channel)
  const createContributionMutation = useMutation({
    mutationFn: () => {
      if (!campaignId) throw new Error("Mã chiến dịch không hợp lệ.");
      if (!Number.isFinite(contributionAmount) || contributionAmount <= 0) {
        throw new Error("Vui lòng nhập số tiền tài trợ hợp lệ (> 0 VNĐ).");
      }
      return sponsorContributionService.createContribution(campaignId, {
        amount: Math.round(contributionAmount),
        isAnonymous,
        donorDisplayName: isAnonymous ? null : donorDisplayName.trim() || null,
      });
    },
    onSuccess: (data) => {
      hasNotifiedSuccessRef.current = false;
      setPendingContribution(data);
      setIsClientTimerZero(false);
      setIsModalOpen(true);
    },
    onError: (err: any) => {
      const errMsg =
        err?.code === "PAYMENT_PROVIDER_DISABLED" || err?.status === 503
          ? "Cổng thanh toán chưa được kích hoạt."
          : err?.message || "Không thể khởi tạo mã VietQR tài trợ. Vui lòng thử lại.";
      message.error(errMsg);
    },
  });

  // Mutation to confirm sandbox webhook (DEV/TEST + SANDBOX only)
  const confirmWebhookMutation = useMutation({
    mutationFn: (status: "SUCCESS" | "FAILED") => {
      if (!activeDonation?.gatewayReference) {
        throw new Error("Không tìm thấy mã đối soát thanh toán.");
      }
      return sponsorContributionService.triggerSandboxWebhook(
        activeDonation.gatewayReference,
        status
      );
    },
    onSuccess: async () => {
      await refetchDonationPayment();
      await refetchCampaign();
    },
    onError: (err: any) => {
      message.error(err.message || "Lỗi xử lý xác nhận tài trợ.");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 space-y-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <Alert
          type="error"
          message="Không tìm thấy chiến dịch"
          description="Chiến dịch học bổng không tồn tại hoặc chưa được công khai."
          showIcon
        />
        <Link to="/campaigns">
          <Button icon={<ArrowLeftOutlined />}>Quay lại danh sách chiến dịch</Button>
        </Link>
      </div>
    );
  }

  const isClosed = campaign.status === "CLOSED";
  const isAcceptingFunding = campaign.isAcceptingFunding && !isClosed;

  const canShowSandboxControls =
    IS_DEV_OR_TEST &&
    import.meta.env.VITE_ENABLE_PAYMENT_SANDBOX === "true" &&
    Boolean(activeDonation?.gatewayReference) &&
    (activeDonation?.provider === "SANDBOX" ||
      activeDonation?.gateway === "SANDBOX" ||
      activeDonation?.gatewayReference?.startsWith("SBX-"));
  const campaignShareUrl = `${window.location.origin}${ROUTES.CAMPAIGN_DETAIL.replace(
    ":campaignId",
    encodeURIComponent(campaign.id),
  )}`;
  const campaignShareText = [campaign.title, campaign.description?.trim()]
    .filter(Boolean)
    .join("\n\n");

  const handleCopyCampaignLink = async () => {
    setIsCopyingShareLink(true);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Trình duyệt không hỗ trợ sao chép tự động.");
      }
      await navigator.clipboard.writeText(campaignShareUrl);
      message.success("Đã sao chép liên kết chiến dịch.");
    } catch {
      message.error("Không thể sao chép tự động. Hãy chọn và sao chép liên kết bên dưới.");
    } finally {
      setIsCopyingShareLink(false);
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      await handleCopyCampaignLink();
      return;
    }
    try {
      await navigator.share({
        title: campaign.title,
        text: campaignShareText,
        url: campaignShareUrl,
      });
      message.success("Đã mở bảng chia sẻ.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      message.error("Không thể mở bảng chia sẻ. Bạn có thể sao chép liên kết thay thế.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F5FAF9] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { title: <Link to="/" className="text-[#64748B] hover:text-[#0D9488]">Trang chủ</Link> },
            { title: <Link to="/campaigns" className="text-[#64748B] hover:text-[#0D9488]">Chiến dịch học bổng</Link> },
            { title: <span className="text-[#163B40] font-semibold">{campaign.title}</span> },
          ]}
        />

        {/* Top Header Card */}
        <Card className="rounded-3xl border-[#D6E5E2] shadow-xs p-2 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag
                  color={CAMPAIGN_STATUS_COLORS[campaign.status]}
                  className="rounded-full px-3 py-1 font-semibold text-xs"
                >
                  {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
                </Tag>
                {isAcceptingFunding && (
                  <Tag
                    className="rounded-full px-3 py-1 font-semibold text-xs border-0 bg-[#CCFBF1] text-[#0F766E]"
                  >
                    Đang tiếp nhận đóng góp
                  </Tag>
                )}
              </div>

              <Title
                level={2}
                className="!mb-2 !text-[#163B40] font-black tracking-tight text-2xl md:text-4xl"
              >
                {campaign.title}
              </Title>

              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
                {campaign.fundingStart && campaign.fundingEnd && (
                  <span className="flex items-center gap-1.5">
                    <CalendarOutlined className="text-[#0D9488]" />
                    Thời gian gây quỹ:{" "}
                    {new Date(campaign.fundingStart).toLocaleDateString("vi-VN")} -{" "}
                    {new Date(campaign.fundingEnd).toLocaleDateString("vi-VN")}
                  </span>
                )}
                {campaign.contributionCount > 0 && (
                  <span className="flex items-center gap-1.5 text-[#0D9488] font-semibold">
                    <HeartOutlined /> {campaign.contributionCount} lượt tài trợ đã hoàn
                    thành
                  </span>
                )}
              </div>
            </div>

            <Space wrap>
              <Button
                icon={<ShareAltOutlined />}
                onClick={() => setIsShareModalOpen(true)}
                className="rounded-xl border-[#D6E5E2] text-[#334155] hover:text-[#0D9488] hover:border-[#0D9488]"
              >
                Chia sẻ
              </Button>
              <Link to="/campaigns">
                <Button icon={<ArrowLeftOutlined />} className="rounded-xl border-[#D6E5E2] text-[#334155] hover:text-[#0D9488] hover:border-[#0D9488]">
                  Tất cả chiến dịch
                </Button>
              </Link>
            </Space>
          </div>

          <Divider className="my-6 border-[#D6E5E2]/60" />

          {/* Funding Progress Banner */}
          <div className="space-y-3 bg-gradient-to-r from-[#F0FDFA] to-[#CCFBF1]/40 p-6 rounded-2xl border border-[#99F6E4]">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-[#0F766E]">
                  Tiến độ quyên góp quỹ (Chỉ cộng khi cổng thanh toán xác thực)
                </span>
                <div
                  className="text-2xl sm:text-3xl font-black text-[#163B40] mt-1"
                  data-testid="campaign-funded-amount"
                >
                  {formatVND(campaign.fundedAmount)}
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    / mục tiêu {formatVND(campaign.targetBudget)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-[#0D9488]">
                  {campaign.fundingProgress}%
                </span>
              </div>
            </div>

            <Progress
              percent={campaign.fundingProgress}
              showInfo={false}
              strokeColor={{ "0%": "#0D9488", "100%": "#14B8A6" }}
              size={["100%", 12]}
            />

            {/* 6 Core Financial Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-4 border-t border-[#99F6E4]/50 text-xs">
              <div className="bg-white/80 p-2.5 rounded-xl border border-teal-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">1. Đã nhận thực tế</div>
                <div className="font-bold text-[#163B40] text-sm mt-0.5">
                  {formatVND(campaign.receivedFund ?? campaign.fundedAmount)}
                </div>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-teal-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">2. Đã xác nhận & đủ ĐK</div>
                <div className="font-bold text-[#0F766E] text-sm mt-0.5">
                  {formatVND(campaign.confirmedFund ?? campaign.fundedAmount)}
                </div>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">3. Chờ đối soát</div>
                <div className="font-bold text-amber-700 text-sm mt-0.5">
                  {formatVND(campaign.pendingFund ?? 0)}
                </div>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-rose-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">4. Đã hoàn trả</div>
                <div className="font-bold text-rose-600 text-sm mt-0.5">
                  {formatVND(campaign.refundedFund ?? 0)}
                </div>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-teal-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">5. Đã cấp học bổng</div>
                <div className="font-bold text-[#163B40] text-sm mt-0.5">
                  {formatVND(campaign.allocatedAmount)}
                </div>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-teal-100/70 shadow-2xs">
                <div className="text-slate-500 text-[11px] font-medium">6. Đã dùng học phí</div>
                <div className="font-bold text-[#163B40] text-sm mt-0.5">
                  {formatVND(campaign.usedAmount)}
                </div>
              </div>
            </div>

            {/* Available fund & slot summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 bg-white/60 p-3 rounded-xl border border-teal-200/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">Quỹ khả dụng để cấp mới:</span>
                <span className="font-extrabold text-base text-[#0D9488]">
                  {formatVND(campaign.availableFund)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-600">Suất dự kiến còn có thể cấp ({formatVND(campaign.awardAmountPerStudent)}/suất):</span>
                <Tag color="cyan" className="font-bold text-xs px-2.5 py-0.5 !m-0 rounded-full border-0">
                  {campaign.standardSlotsAvailable ?? (campaign.awardAmountPerStudent > 0 ? Math.floor(campaign.availableFund / campaign.awardAmountPerStudent) : 0)} suất
                </Tag>
              </div>
              <div className="w-full text-[11px] text-slate-500 pt-1">
                Suất dự kiến thay đổi theo tài trợ đủ điều kiện. Số suất chính thức chỉ được chốt sau khi kết thúc và đối soát chiến dịch.
                {campaign.officialSlotCount !== null && campaign.officialSlotCount !== undefined && ` Số suất chính thức: ${campaign.officialSlotCount}.`}
              </div>
            </div>
          </div>
        </Card>

        {/* Content & Contribution Grid */}
        <Row gutter={[24, 24]}>
          {/* Left Column: Details & Criteria */}
          <Col xs={24} lg={15}>
            <div className="space-y-6">
              <Card
                className="rounded-2xl border-slate-200/80 shadow-xs"
                title="Ý nghĩa & Mục tiêu chương trình"
              >
                <Paragraph className="text-slate-700 leading-relaxed whitespace-pre-line text-sm">
                  {campaign.description || "Chưa có mô tả chi tiết."}
                </Paragraph>
              </Card>

              <Card
                className="rounded-2xl border-slate-200/80 shadow-xs"
                title="Tiêu chí xét duyệt học bổng"
              >
                <Paragraph className="text-slate-700 leading-relaxed whitespace-pre-line text-sm">
                  {campaign.eligibilityCriteria ||
                    "Áp dụng theo quy chế xét duyệt học bổng chung của Edunity."}
                </Paragraph>
              </Card>

              <Card
                className="rounded-2xl border-slate-200/80 shadow-xs"
                title="Xếp hạng ưu tiên"
              >
                {campaign.priorityCriteria?.filter((criterion) => criterion.enabled !== false).length ? (
                  <>
                    <Paragraph className="text-xs text-slate-500">Áp dụng phiên bản {campaign.priorityPolicyVersion || 0}. Điểm hỗ trợ sắp xếp hồ sơ; hội đồng vẫn xác minh và quyết định thủ công.</Paragraph>
                    <div className="space-y-2">
                      {campaign.priorityCriteria.filter((criterion) => criterion.enabled !== false).map((criterion) => (
                        <div key={criterion.code} className="flex justify-between gap-3 text-sm border-b border-slate-100 pb-2">
                          <span>{criterion.label}</span><strong>{criterion.points} điểm</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Paragraph className="text-sm text-slate-500 !mb-0">Chiến dịch chưa công bố bộ điểm ưu tiên. Hồ sơ được xét theo điều kiện và quy trình xác minh đã nêu.</Paragraph>
                )}
              </Card>

              {campaign.scopeDetail && (
                <Card
                  className="rounded-2xl border-slate-200/80 shadow-xs"
                  title="Phạm vi môn học & Khóa học hỗ trợ"
                >
                  <div className="space-y-4">
                    {campaign.scopeDetail.categories &&
                      campaign.scopeDetail.categories.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            Danh mục:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {campaign.scopeDetail.categories.map((c) => (
                              <Tag key={c._id} color="blue">
                                {c.name}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}

                    {campaign.scopeDetail.subjects &&
                      campaign.scopeDetail.subjects.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            Môn học:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {campaign.scopeDetail.subjects.map((s) => (
                              <Tag key={s._id} color="purple">
                                {formatSubjectLabel(s.name, s.slug)}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}

                    {campaign.scopeDetail.courses &&
                      campaign.scopeDetail.courses.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                            Khóa học cụ thể:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {campaign.scopeDetail.courses.map((cr) => (
                              <Tag key={cr._id} color="cyan">
                                {cr.title}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </Card>
              )}

              {/* Public Transparency: Awarded Recipients */}
              <Card
                className="rounded-2xl border-slate-200/80 shadow-xs"
                title={
                  <span className="font-bold flex items-center gap-2 text-slate-800">
                    <SafetyCertificateOutlined className="text-teal-600" /> Danh sách học sinh nhận học bổng (Minh bạch cộng đồng)
                  </span>
                }
              >
                {isLoadingRecipients ? (
                  <Skeleton active paragraph={{ rows: 3 }} />
                ) : !publicRecipientsData?.isPublished ? (
                  <Alert
                    type="info"
                    showIcon
                    message="Danh sách nhận học bổng chưa đến ngày công bố"
                    description={
                      publicRecipientsData?.resultPublicationDate
                        ? `Kết quả xét duyệt sẽ được công khai tự động sau ngày ${new Date(publicRecipientsData.resultPublicationDate).toLocaleDateString('vi-VN')} theo quy chế công khai minh bạch.`
                        : 'Hội đồng xét duyệt đang thẩm định hồ sơ. Kết quả sẽ được công khai sau ngày công bố kết quả chiến dịch.'
                    }
                    className="rounded-xl text-xs"
                  />
                ) : ((publicRecipientsData?.items || (publicRecipientsData as any)?.recipients || []).length === 0) ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    Chưa có hồ sơ được công bố hoặc các em học sinh chưa kích hoạt chia sẻ thông tin công khai.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Mã hồ sơ</th>
                          <th className="py-2.5 px-3">Học sinh</th>
                          <th className="py-2.5 px-3">Trường học</th>
                          <th className="py-2.5 px-3">Tỉnh/Thành</th>
                          <th className="py-2.5 px-3 text-right">Định mức</th>
                          <th className="py-2.5 px-3 text-right">Ngày cấp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(publicRecipientsData?.items || (publicRecipientsData as any)?.recipients || []).map((rec: any, i: number) => (
                          <tr key={rec.id || rec.applicationId || i} className="hover:bg-teal-50/30">
                            <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">
                              {rec.applicationCode || (rec.id || rec.applicationId || '').slice(-6).toUpperCase()}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {rec.displayName || rec.studentNameMasked}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {rec.schoolName || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {rec.province || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-teal-700">
                              {formatVND(rec.awardAmount ?? campaign.awardAmountPerStudent)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500">
                              {rec.awardedAt ? new Date(rec.awardedAt).toLocaleDateString('vi-VN') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </Col>

          {/* Right Column: Sponsor Contribution Box */}
          <Col xs={24} lg={9}>
            <Card className="rounded-3xl border-slate-200/80 shadow-md sticky top-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-lg">
                    <HeartOutlined />
                  </div>
                  <div>
                    <Title level={4} className="!mb-0 !text-[#163B40] font-bold">
                      Đóng góp tài trợ (VietQR)
                    </Title>
                    <Text type="secondary" className="text-xs">
                      Kênh thanh toán độc lập dành riêng cho Quỹ Học Bổng
                    </Text>
                  </div>
                </div>

                <Divider className="my-2 border-[#D6E5E2]/60" />

                {/* Role / Auth Check */}
                {!isAuthenticated ? (
                  <div className="space-y-4 text-center py-4">
                    <Paragraph className="text-slate-600 text-sm">
                      Bạn cần đăng nhập tài khoản{" "}
                      <strong>Nhà tài trợ (Sponsor)</strong> để tạo mã VietQR đóng góp cho
                      chiến dịch này.
                    </Paragraph>
                    <Link to={`${ROUTES.AUTH.LOGIN}?redirect=/campaigns/${campaign.id}`}>
                      <Button
                        type="primary"
                        block
                        className="h-11 rounded-xl bg-[#0D9488] hover:bg-[#0B746C] font-semibold border-none shadow-xs"
                      >
                        Đăng nhập để tài trợ
                      </Button>
                    </Link>
                  </div>
                ) : user?.role === "STUDENT" ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-[#F0FDFA] border border-[#99F6E4] space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag className="font-bold border-none bg-[#CCFBF1] text-[#0F766E]">
                          DÀNH CHO HỌC SINH
                        </Tag>
                        <span className="text-xs text-[#0F766E] font-semibold">
                          Cơ hội nhận học bổng
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Mỗi suất ghi có số dư học bổng{" "}
                        <strong className="text-[#0F766E] text-sm">
                          {formatVND(campaign.awardAmountPerStudent)}
                        </strong>{" "}
                        vào tài khoản học sinh. Số dư dùng để thanh toán mọi khóa học EDUNITY; phần chưa dùng vẫn còn và không hết hạn.
                      </div>
                      {campaign.isAcceptingApplications ? (
                        <Button
                          type="primary"
                          block
                          onClick={() => setIsApplyScholarshipModalOpen(true)}
                          className="h-11 rounded-xl bg-[#0D9488] hover:bg-[#0B746C] font-bold text-sm shadow-xs border-none"
                        >
                          Nộp hồ sơ xin học bổng
                        </Button>
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Chưa tiếp nhận hồ sơ"
                          description="Chiến dịch hiện không nằm trong khung thời gian nhận hồ sơ học bổng."
                          className="rounded-xl text-xs"
                        />
                      )}
                      <div className="text-center pt-1">
                        <Link
                          to={ROUTES.STUDENT.HOME + "/scholarships/applications"}
                          className="text-xs font-semibold text-[#0D9488] hover:text-[#0F766E]"
                        >
                          Xem các hồ sơ bạn đã nộp →
                        </Link>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 text-center">
                      * Phần đóng góp tài trợ chỉ dành cho Nhà tài trợ (SPONSOR).
                    </div>
                  </div>
                ) : user?.role !== "SPONSOR" ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="Quyền đóng góp tài trợ"
                    description={
                      <span>
                        Tài khoản của bạn có vai trò <strong>{user?.role}</strong>. Chỉ
                        tài khoản <strong>Nhà tài trợ (SPONSOR)</strong> mới có thể tạo
                        giao dịch đóng góp vào quỹ.
                      </span>
                    }
                  />
                ) : !isAcceptingFunding ? (
                  <PaymentErrorState
                    kind="CAMPAIGN_CLOSED"
                    purpose="DONATION"
                    message={
                      isClosed
                        ? "Chiến dịch học bổng đã đóng"
                        : "Chiến dịch hiện tạm ngưng tiếp nhận tài trợ"
                    }
                    description={
                      isClosed
                        ? "Chiến dịch đã đóng lại sau khi hoàn thành đợt gây quỹ nên không thể tạo mã QR đóng góp mới."
                        : "Chiến dịch hiện không nằm trong khung thời gian nhận tài trợ."
                    }
                  />
                ) : (
                  /* Active Contribution Form for Sponsor */
                  <div className="space-y-4" data-testid="sponsor-donation-form">
                    {/* Amount Presets */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-2 uppercase">
                        Chọn nhanh mức tài trợ:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {PRESET_AMOUNTS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setContributionAmount(amt)}
                            className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all text-center cursor-pointer ${
                              contributionAmount === amt
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                : "bg-white text-slate-700 border-slate-200 hover:border-indigo-400"
                            }`}
                          >
                            {formatVND(amt)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Amount Input */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5 uppercase">
                        Số tiền tài trợ tùy chỉnh (VNĐ):
                      </label>
                      <InputNumber
                        value={contributionAmount}
                        onChange={(val) => setContributionAmount(Number(val) || 0)}
                        min={10_000}
                        step={100_000}
                        className="w-full rounded-xl text-base font-bold text-slate-900"
                        formatter={(value) =>
                          `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                        }
                        parser={(value) =>
                          (value ? Number(value.replace(/\$\s?|(,*)/g, "")) : 0) as any
                        }
                        data-testid="donation-amount-input"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Tối thiểu 10.000 đ • Nguyên dương VNĐ
                      </span>
                    </div>

                    {/* Donor Anonymity Selection */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <label className="text-xs font-bold text-slate-800 block">
                        Chế độ hiển thị tên Nhà tài trợ:
                      </label>
                      <Radio.Group
                        value={isAnonymous ? "ANONYMOUS" : "PUBLIC"}
                        onChange={(e) => setIsAnonymous(e.target.value === "ANONYMOUS")}
                        className="w-full space-y-2"
                        data-testid="donation-anonymity-radio"
                      >
                        <div className="flex items-start gap-2">
                          <Radio value="PUBLIC" className="text-xs">
                            <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                              <GlobalOutlined className="text-[#0D9488]" />
                              Tài trợ công khai
                            </span>
                            <div className="text-[11px] text-slate-500">
                              Ghi nhận tên nhà tài trợ trên bảng vinh danh chiến dịch.
                            </div>
                          </Radio>
                        </div>
                        <div className="flex items-start gap-2">
                          <Radio value="ANONYMOUS" className="text-xs">
                            <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                              <EyeInvisibleOutlined className="text-slate-600" />
                              Tài trợ ẩn danh
                            </span>
                            <div className="text-[11px] text-slate-500">
                              Hiển thị là &ldquo;Nhà tài trợ ẩn danh&rdquo; trên giao diện công khai (hệ thống chỉ lưu đối soát nội bộ).
                            </div>
                          </Radio>
                        </div>
                      </Radio.Group>

                      {!isAnonymous && (
                        <div className="pt-1">
                          <Input
                            placeholder="Tên hiển thị vinh danh (tùy chọn)"
                            value={donorDisplayName}
                            maxLength={100}
                            onChange={(e) => setDonorDisplayName(e.target.value)}
                            className="rounded-xl text-xs"
                            data-testid="donation-display-name-input"
                          />
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="primary"
                      block
                      size="large"
                      loading={createContributionMutation.isPending}
                      onClick={() => createContributionMutation.mutate()}
                      disabled={!contributionAmount || contributionAmount <= 0}
                      className="h-12 rounded-xl bg-[#0D9488] hover:bg-[#0B746C] font-bold text-sm shadow-sm border-none"
                      data-testid="donation-create-qr-btn"
                    >
                      Tạo mã VietQR tài trợ ngay
                    </Button>

                    {createContributionMutation.isError && (
                      <Alert
                        type="warning"
                        showIcon
                        message="Cổng thanh toán tài trợ trực tuyến tạm thời chưa kích hoạt"
                        description={
                          (createContributionMutation.error as any)?.code === "PAYMENT_PROVIDER_DISABLED" ||
                          (createContributionMutation.error as any)?.status === 503
                            ? "Kênh tiếp nhận tài trợ qua VietQR (payOS) hiện đang tạm dừng hoặc chưa được mở giao dịch trực tuyến trên hệ thống thử nghiệm này. Vui lòng liên hệ ban quản trị Edunity để biết thêm thông tin."
                            : (createContributionMutation.error as any)?.message ||
                              "Không thể tạo mã VietQR lúc này. Vui lòng thử lại sau ít phút."
                        }
                        className="rounded-xl text-xs"
                        closable
                        onClose={() => createContributionMutation.reset()}
                      />
                    )}
                  </div>
                )}

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Cam kết minh bạch:</div>
                  <div>
                    • Tiền tài trợ đi qua kênh tài khoản Quỹ Học Bổng độc lập với học phí.
                  </div>
                  <div>
                    • Quỹ chỉ tăng khi nhận được xác nhận chuyển khoản hợp lệ từ ngân hàng.
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Unified VietQR Donation Modal */}
        <Modal
          title={
            <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
              <WalletOutlined className="text-[#0D9488]" />
              <span>Thanh toán Tài trợ Quỹ Học Bổng (VietQR)</span>
            </div>
          }
          open={isModalOpen}
          onCancel={() => setIsModalOpen(false)}
          footer={null}
          width={620}
          destroyOnClose
        >
          {activeDonation && (
            <div className="py-3 space-y-4" data-testid="donation-qr-modal">
              {effectiveUiState === "COMPLETED" ? (
                <div className="text-center py-6 px-4 space-y-5" data-testid="donation-thank-you-popup">
                  <div className="w-20 h-20 mx-auto rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
                    <CheckCircleFilled className="text-5xl text-teal-600" />
                  </div>
                  <div className="space-y-2">
                    <Tag color="cyan" className="font-bold text-xs uppercase px-3 py-1 rounded-full border-teal-200 bg-teal-50 text-teal-700">
                      Quyên góp thành công
                    </Tag>
                    <Title level={2} className="!mb-1 !text-2xl font-black text-[#163B40]">
                      Cảm ơn bạn đã góp sức!
                    </Title>
                    <Paragraph className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                      Sự đóng góp của bạn đang giúp các em học sinh tiến gần hơn đến ước mơ học tập.
                    </Paragraph>
                  </div>

                  <div className="bg-[#F5FAF9] border border-[#D6E5E2] rounded-2xl p-4 text-xs space-y-2.5 text-left max-w-md mx-auto">
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E5E2]">
                      <span className="text-slate-500 font-medium">Số tiền quyên góp:</span>
                      <span className="font-extrabold text-base text-teal-700">
                        {formatVND(activeDonation.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E5E2]">
                      <span className="text-slate-500 font-medium">Chiến dịch học bổng:</span>
                      <span className="font-bold text-slate-800 text-right truncate max-w-[220px]" title={campaign.title}>
                        {campaign.title}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E5E2]">
                      <span className="text-slate-500 font-medium">Mã giao dịch:</span>
                      <span className="font-mono font-bold text-slate-700">
                        {activeDonation.orderCode ? `CONTRIB-${activeDonation.orderCode}` : activeDonation.gatewayReference || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-500 font-medium">Thời gian thanh toán:</span>
                      <span className="text-slate-700 font-medium">
                        {new Date().toLocaleString("vi-VN")}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
                    <Button
                      type="primary"
                      size="large"
                      onClick={() => {
                        setIsModalOpen(false);
                        refetchCampaign();
                      }}
                      className="flex-1 w-full rounded-xl font-bold bg-[#0D9488] hover:bg-[#0B746C] h-11 text-sm shadow-sm"
                    >
                      Hoàn tất
                    </Button>
                    <Button
                      size="large"
                      onClick={() => {
                        setIsModalOpen(false);
                        navigate(ROUTES.SPONSOR.CONTRIBUTIONS);
                      }}
                      className="flex-1 w-full rounded-xl font-semibold border-[#D6E5E2] text-slate-700 hover:text-teal-700 h-11 text-sm"
                    >
                      Xem lịch sử tài trợ
                    </Button>
                  </div>
                </div>
              ) : effectiveUiState === "RECONCILIATION_REQUIRED" ? (
                <PaymentResult
                  payment={{
                    ...(activeDonation as any),
                    purpose: "DONATION",
                    campaignTitle: campaign.title,
                  }}
                  uiState={effectiveUiState}
                  purpose="DONATION"
                  campaignTitle={campaign.title}
                  onPrimaryAction={() => {
                    setIsModalOpen(false);
                    navigate(ROUTES.SPONSOR.CONTRIBUTIONS);
                  }}
                  primaryActionLabel="Xem lịch sử đóng góp"
                  onSecondaryAction={() => setIsModalOpen(false)}
                  secondaryActionLabel="Đóng cửa sổ"
                />
              ) : (
                <>
                  <PaymentQrPanel
                    purpose="DONATION"
                    uiState={effectiveUiState}
                    amount={activeDonation.amount}
                    qrCode={activeDonation.qrCode}
                    checkoutUrl={activeDonation.checkoutUrl}
                    orderCode={activeDonation.orderCode}
                    gatewayReference={activeDonation.gatewayReference}
                    provider={activeDonation.provider}
                    gateway={activeDonation.gateway}
                    expiredAt={activeDonation.expiredAt}
                    isAnonymous={activeDonation.isAnonymous}
                    donorDisplayName={activeDonation.donorDisplayName}
                    title={campaign.title}
                    subtitle="Quỹ chỉ ghi nhận tăng sau khi cổng thanh toán xác thực giao dịch thành công"
                    isPolling={isPolling}
                    isRefreshing={isPollingFetching}
                    onExpire={() => {
                      setIsClientTimerZero(true);
                      refetchDonationPayment();
                    }}
                    onManualRefresh={() => refetchDonationPayment()}
                    onRecreateIntent={() => createContributionMutation.mutate()}
                    recreateLoading={createContributionMutation.isPending}
                  />

                  <PaymentInstructions purpose="DONATION" />

                  {/* Developer Sandbox Controls (Strictly DEV/TEST + SANDBOX only) */}
                  {canShowSandboxControls && effectiveUiState === "PENDING" && (
                    <Card
                      size="small"
                      className="rounded-2xl border-dashed border-amber-300 bg-amber-50/40"
                      data-testid="donation-sandbox-simulator"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                            <ExperimentOutlined />
                            Mô phỏng Webhook Tài trợ (Chỉ hiển thị ở SANDBOX / DEV)
                          </div>
                          <div className="text-[11px] text-amber-700">
                            Giả lập callback từ cổng thanh toán cho kênh DONATION.
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="small"
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            loading={confirmWebhookMutation.isPending}
                            onClick={() => confirmWebhookMutation.mutate("SUCCESS")}
                            className="bg-emerald-600 hover:bg-emerald-500 border-none font-semibold text-xs rounded-lg"
                            data-testid="donation-sandbox-success-btn"
                          >
                            Giả lập Thành công
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<CloseCircleOutlined />}
                            loading={confirmWebhookMutation.isPending}
                            onClick={() => confirmWebhookMutation.mutate("FAILED")}
                            className="font-semibold text-xs rounded-lg"
                            data-testid="donation-sandbox-failed-btn"
                          >
                            Giả lập Thất bại
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}
        </Modal>

        {campaign && (
          <ApplyScholarshipModal
            open={isApplyScholarshipModalOpen}
            onClose={() => setIsApplyScholarshipModalOpen(false)}
            campaign={campaign}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaign.id) });
            }}
          />
        )}

        <Modal
          title={<span><ShareAltOutlined className="mr-2 text-indigo-600" />Chia sẻ chiến dịch</span>}
          open={isShareModalOpen}
          onCancel={() => setIsShareModalOpen(false)}
          footer={null}
          width={560}
          destroyOnHidden
        >
          <div className="space-y-4">
            <Card className="overflow-hidden rounded-xl border-slate-200" bodyStyle={{ padding: 0 }}>
              <div className="h-28 bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-500 flex items-center justify-center">
                <HeartOutlined className="text-4xl text-white/90" />
              </div>
              <div className="space-y-2 p-4">
                <div className="text-xs font-medium text-slate-500">{window.location.host}</div>
                <div className="text-lg font-bold text-slate-900">{campaign.title}</div>
                <Paragraph
                  ellipsis={{ rows: 3, expandable: true, symbol: "Xem thêm" }}
                  className="!mb-0 whitespace-pre-line text-sm text-slate-600"
                >
                  {campaign.description || "Khám phá và đồng hành cùng chiến dịch học bổng này."}
                </Paragraph>
              </div>
            </Card>

            <div className="space-y-2">
              <Text strong className="text-xs">Liên kết công khai của chiến dịch</Text>
              <Input value={campaignShareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={() => void handleNativeShare()}
                className="flex-1 bg-indigo-600"
              >
                Chia sẻ...
              </Button>
              <Button
                icon={<FacebookOutlined />}
                onClick={() => {
                  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(campaignShareUrl)}`;
                  const shareWindow = window.open(facebookUrl, "_blank");
                  if (shareWindow) {
                    shareWindow.opener = null;
                    message.success("Đã mở Facebook để chia sẻ chiến dịch.");
                  } else {
                    message.error("Trình duyệt đã chặn cửa sổ Facebook. Hãy sao chép liên kết để chia sẻ.");
                  }
                }}
                className="flex-1"
              >
                Facebook
              </Button>
              <Button
                icon={<CopyOutlined />}
                loading={isCopyingShareLink}
                onClick={() => void handleCopyCampaignLink()}
                className="flex-1"
              >
                Sao chép liên kết
              </Button>
            </div>
            <Alert
              type="info"
              showIcon
              message="Chỉ chia sẻ thông tin chiến dịch"
              description="Không bao gồm thông tin Sponsor, hồ sơ ứng viên hoặc dữ liệu người thụ hưởng. Facebook sẽ tạo preview theo metadata công khai của trang; hiện Backend chưa cung cấp ảnh riêng cho từng chiến dịch."
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}
