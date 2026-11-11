import { useEffect, useMemo, useState } from "react";
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
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  HeartOutlined,
  ArrowLeftOutlined,
  WalletOutlined,
  CloseCircleOutlined,
  EyeInvisibleOutlined,
  GlobalOutlined,
  ExperimentOutlined,
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

  // Only refresh campaign fundedAmount from Backend AFTER webhook confirms COMPLETED
  useEffect(() => {
    if (
      effectiveUiState === "COMPLETED" ||
      effectiveUiState === "RECONCILIATION_REQUIRED"
    ) {
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

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { title: <Link to="/">Trang chủ</Link> },
            { title: <Link to="/campaigns">Chiến dịch học bổng</Link> },
            { title: campaign.title },
          ]}
        />

        {/* Top Header Card */}
        <Card className="rounded-3xl border-slate-200/80 shadow-sm p-2 md:p-6">
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
                    color="cyan"
                    className="rounded-full px-3 py-1 font-semibold text-xs border-0"
                  >
                    Đang tiếp nhận đóng góp
                  </Tag>
                )}
              </div>

              <Title
                level={2}
                className="!mb-2 !text-slate-900 font-black tracking-tight text-2xl md:text-4xl"
              >
                {campaign.title}
              </Title>

              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
                {campaign.fundingStart && campaign.fundingEnd && (
                  <span className="flex items-center gap-1.5">
                    <CalendarOutlined className="text-indigo-500" />
                    Thời gian gây quỹ:{" "}
                    {new Date(campaign.fundingStart).toLocaleDateString("vi-VN")} -{" "}
                    {new Date(campaign.fundingEnd).toLocaleDateString("vi-VN")}
                  </span>
                )}
                {campaign.contributionCount > 0 && (
                  <span className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                    <HeartOutlined /> {campaign.contributionCount} lượt tài trợ đã hoàn
                    thành
                  </span>
                )}
              </div>
            </div>

            <Link to="/campaigns">
              <Button icon={<ArrowLeftOutlined />} className="rounded-xl">
                Tất cả chiến dịch
              </Button>
            </Link>
          </div>

          <Divider className="my-6" />

          {/* Funding Progress Banner */}
          <div className="space-y-3 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 p-6 rounded-2xl border border-indigo-100">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-indigo-700">
                  Tiến độ quyên góp quỹ (Chỉ cộng khi cổng thanh toán xác thực)
                </span>
                <div
                  className="text-2xl sm:text-3xl font-black text-slate-900 mt-1"
                  data-testid="campaign-funded-amount"
                >
                  {formatVND(campaign.fundedAmount)}
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    / mục tiêu {formatVND(campaign.targetBudget)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-indigo-600">
                  {campaign.fundingProgress}%
                </span>
              </div>
            </div>

            <Progress
              percent={campaign.fundingProgress}
              showInfo={false}
              strokeColor={{ "0%": "#6366f1", "100%": "#2563eb" }}
              size={["100%", 12]}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-indigo-100/60 text-xs">
              <div>
                <div className="text-slate-500">Đã cấp học bổng</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  {formatVND(campaign.allocatedAmount)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Đã giải ngân học phí</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  {formatVND(campaign.usedAmount)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Quỹ còn khả dụng</div>
                <div className="font-bold text-emerald-600 text-sm mt-0.5">
                  {formatVND(campaign.availableFund)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Tổng suất học bổng</div>
                <div className="font-bold text-indigo-700 text-sm mt-0.5">
                  {campaign.expectedSlots} suất
                </div>
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
                                {s.name}
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
            </div>
          </Col>

          {/* Right Column: Sponsor Contribution Box */}
          <Col xs={24} lg={9}>
            <Card className="rounded-3xl border-slate-200/80 shadow-md sticky top-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-lg">
                    <HeartOutlined />
                  </div>
                  <div>
                    <Title level={4} className="!mb-0 !text-slate-900 font-bold">
                      Đóng góp tài trợ (VietQR)
                    </Title>
                    <Text type="secondary" className="text-xs">
                      Kênh thanh toán độc lập dành riêng cho Quỹ Học Bổng
                    </Text>
                  </div>
                </div>

                <Divider className="my-2" />

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
                        className="h-11 rounded-xl bg-indigo-600 font-semibold"
                      >
                        Đăng nhập để tài trợ
                      </Button>
                    </Link>
                  </div>
                ) : user?.role === "STUDENT" ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag color="indigo" className="font-bold border-none">
                          DÀNH CHO HỌC SINH
                        </Tag>
                        <span className="text-xs text-indigo-700 font-semibold">
                          Cơ hội nhận học bổng
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Chiến dịch hỗ trợ suất học bổng trị giá{" "}
                        <strong className="text-indigo-700 text-sm">
                          {formatVND(campaign.awardAmountPerStudent)}
                        </strong>{" "}
                        để chi trả học phí các lớp học.
                      </div>
                      {campaign.isAcceptingApplications ? (
                        <Button
                          type="primary"
                          block
                          onClick={() => setIsApplyScholarshipModalOpen(true)}
                          className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-sm shadow-xs"
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
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
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
                              <GlobalOutlined className="text-indigo-600" />
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
                      className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm shadow-sm"
                      data-testid="donation-create-qr-btn"
                    >
                      Tạo mã VietQR tài trợ ngay
                    </Button>
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
            <div className="flex items-center gap-2 text-base font-bold text-slate-800">
              <WalletOutlined className="text-indigo-600" />
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
              {effectiveUiState === "COMPLETED" ||
              effectiveUiState === "RECONCILIATION_REQUIRED" ? (
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
      </div>
    </div>
  );
}
