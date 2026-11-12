import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Divider,
  Radio,
  Skeleton,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  BookOutlined,
  CheckCircleOutlined,
  GiftOutlined,
  UserOutlined,
  ExperimentOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { enrollmentService, enrollmentKeys } from "../../services/enrollment.service";
import { classDiscoveryService } from "../../services/classDiscovery.service";
import { classKeys } from "../../services/class.service";
import { sessionKeys } from "../../services/session.service";
import { gatewayPaymentService, paymentKeys } from "../../services/gatewayPayment.service";
import { scholarshipService, scholarshipKeys } from "../../services/scholarship.service";
import { usePaymentPolling, derivePaymentUiState } from "../../hooks/usePaymentPolling";
import {
  PaymentQrPanel,
  PaymentInstructions,
  PaymentErrorState,
  PaymentResult,
} from "../../components/payment";
import { FetchError } from "../../api/apiClient";
import { formatVND, type CreatePaymentResponse } from "../../types/payment";
import { ROUTES } from "../../routes/routePaths";

const { Title, Text } = Typography;

const IS_DEV_OR_TEST =
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.DEV || import.meta.env?.MODE === "test");

export default function CheckoutPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string | null>(null);
  const [appliedScholarshipAmount, setAppliedScholarshipAmount] = useState<number>(0);
  const [intentData, setIntentData] = useState<CreatePaymentResponse | null>(null);
  const [isClientTimerZero, setIsClientTimerZero] = useState<boolean>(false);
  const autoIntentTriggeredRef = useRef<string | null>(null);

  // 1. Fetch Enrollment details
  const {
    data: enrollment,
    isLoading: isEnrollmentLoading,
    isError: isEnrollmentError,
    error: enrollmentError,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: enrollmentKeys.detail(enrollmentId || ""),
    queryFn: () => enrollmentService.getEnrollmentById(enrollmentId!),
    enabled: Boolean(enrollmentId),
  });

  // 2. Fetch Class details
  const { data: classDetail } = useQuery({
    queryKey: ["classDetail", enrollment?.classId],
    queryFn: () => classDiscoveryService.fetchClassById(enrollment!.classId),
    enabled: Boolean(enrollment?.classId),
  });

  // 3. Fetch Student's active scholarships
  const { data: myScholarships = [] } = useQuery({
    queryKey: scholarshipKeys.myList(),
    queryFn: () => scholarshipService.getMyScholarships(),
    enabled: Boolean(
      enrollment &&
        enrollment.enrollmentStatus === "PENDING_PAYMENT" &&
        enrollment.paymentSource === "DIRECT_PAYMENT"
    ),
  });

  // Filter eligible scholarships matching class scope
  const eligibleScholarships = useMemo(() => {
    const now = Date.now();
    return myScholarships.filter((s) => {
      if (s.status !== "ACTIVE" || s.remainingAmount <= 0) return false;
      if (s.expiresAt && new Date(s.expiresAt).getTime() <= now) return false;
      const scope = s.campaign?.scope;
      if (!scope) return true;
      const hasCourseScope = Array.isArray(scope.courseIds) && scope.courseIds.length > 0;
      const hasSubjectScope = Array.isArray(scope.subjectIds) && scope.subjectIds.length > 0;
      const hasCategoryScope = Array.isArray(scope.categoryIds) && scope.categoryIds.length > 0;
      if (!hasCourseScope && !hasSubjectScope && !hasCategoryScope) return true;
      if (hasCourseScope && enrollment?.courseId && scope.courseIds!.includes(enrollment.courseId)) {
        return true;
      }
      if (
        hasSubjectScope &&
        classDetail?.subjectId &&
        scope.subjectIds!.includes(classDetail.subjectId)
      ) {
        return true;
      }
      const detailCategoryId = (classDetail as { categoryId?: string } | null)?.categoryId;
      if (
        hasCategoryScope &&
        detailCategoryId &&
        scope.categoryIds!.includes(detailCategoryId)
      ) {
        return true;
      }
      return !classDetail;
    });
  }, [myScholarships, enrollment?.courseId, classDetail]);

  // 4. Create / reuse Unified TUITION Payment Intent mutation
  const createIntentMutation = useMutation({
    mutationFn: (targetEnrollmentId: string) =>
      gatewayPaymentService.createPayment(targetEnrollmentId),
    onSuccess: (res) => {
      setIntentData(res);
      setIsClientTimerZero(false);
      if (typeof res.scholarshipAmount === "number" && res.scholarshipAmount > 0) {
        setAppliedScholarshipAmount(res.scholarshipAmount);
      }
    },
  });

  // Automatically create/retrieve Payment Intent when Enrollment is PENDING_PAYMENT
  useEffect(() => {
    if (!enrollment || !enrollmentId) return;
    if (enrollment.enrollmentStatus !== "PENDING_PAYMENT") return;
    if (enrollment.paymentSource === "FREE" || enrollment.paymentSource === "SCHOLARSHIP") return;

    const holdExpired =
      enrollment.holdExpiresAt && new Date(enrollment.holdExpiresAt).getTime() <= Date.now();
    if (holdExpired) return;

    const triggerKey = `${enrollment.id}:${enrollment.paymentSource}`;
    if (autoIntentTriggeredRef.current === triggerKey) return;
    autoIntentTriggeredRef.current = triggerKey;

    createIntentMutation.mutate(enrollment.id);
  }, [enrollment?.id, enrollment?.enrollmentStatus, enrollment?.paymentSource]);

  // 5. Apply Scholarship mutation (100% full coverage OR partial MIXED co-pay)
  const applyScholarshipMutation = useMutation({
    mutationFn: (scholarshipId: string) =>
      scholarshipService.payWithScholarship(enrollmentId!, scholarshipId),
    onSuccess: async (res) => {
      setAppliedScholarshipAmount(res.scholarshipAmount || 0);
      await queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      await queryClient.invalidateQueries({ queryKey: scholarshipKeys.all });
      await refetchEnrollment();

      if (res.enrollmentStatus === "CONFIRMED" || res.remainingDue <= 0) {
        message.success("Áp dụng học bổng 100% thành công! Bạn đã được ghi danh vào lớp.");
        setIntentData(null);
      } else {
        message.success(
          `Đã áp dụng học bổng ${formatVND(res.scholarshipAmount)}. Vui lòng quét mã VietQR cho phần đồng chi trả ${formatVND(res.remainingDue)}.`
        );
        autoIntentTriggeredRef.current = `${enrollmentId}:MIXED:${Date.now()}`;
        createIntentMutation.mutate(enrollmentId!);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể áp dụng học bổng cho đơn đăng ký này.");
    },
  });

  // 6. Poll Payment status every 3s via Unified usePaymentPolling hook
  const activePaymentId = intentData?.paymentId || null;
  const {
    payment: polledPayment,
    uiState: polledUiState,
    isPolling,
    isFetching: isPollingFetching,
    refetch: refetchPayment,
  } = usePaymentPolling({
    paymentId: activePaymentId,
    enabled: Boolean(activePaymentId),
    isClientTimerZero,
  });

  // Merge initial intent data with polled status
  const activePayment = useMemo(() => {
    if (polledPayment) {
      return {
        ...intentData,
        ...polledPayment,
        qrCode: polledPayment.qrCode || intentData?.qrCode || null,
        checkoutUrl: polledPayment.checkoutUrl || intentData?.checkoutUrl || null,
        orderCode: polledPayment.orderCode ?? intentData?.orderCode ?? null,
      };
    }
    return intentData;
  }, [intentData, polledPayment]);

  const effectiveUiState = useMemo(() => {
    if (polledPayment) return polledUiState;
    if (intentData) return derivePaymentUiState(intentData as any, isClientTimerZero);
    return "PENDING";
  }, [polledPayment, polledUiState, intentData, isClientTimerZero]);

  // Refresh enrollment & class cache when payment reaches terminal state
  useEffect(() => {
    if (
      effectiveUiState === "COMPLETED" ||
      effectiveUiState === "LATE_PAYMENT_REVIEW" ||
      effectiveUiState === "RECONCILIATION_REQUIRED"
    ) {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      refetchEnrollment();
    }
  }, [effectiveUiState, queryClient, refetchEnrollment]);

  // 7. Sandbox Webhook Simulation (DEV/TEST + SANDBOX provider only)
  const sandboxWebhookMutation = useMutation({
    mutationFn: (status: "SUCCESS" | "FAILED") =>
      gatewayPaymentService.simulateWebhook(activePayment!.gatewayReference, status),
    onSuccess: async () => {
      await refetchPayment();
      await refetchEnrollment();
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể mô phỏng webhook trong môi trường này.");
    },
  });

  // Loading state
  if (isEnrollmentLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-6">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  // Error loading enrollment (403/404/network)
  if (isEnrollmentError || !enrollment) {
    const status = enrollmentError instanceof FetchError ? enrollmentError.status : 0;
    const errorKind =
      status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "NETWORK_ERROR";
    return (
      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <PaymentErrorState
          kind={errorKind}
          purpose="TUITION"
          onRetry={() => refetchEnrollment()}
          onBack={() => navigate(ROUTES.STUDENT.ENROLLMENTS)}
          backLabel="Về danh sách đơn đăng ký"
        />
      </div>
    );
  }

  const classTitle =
    classDetail?.className || enrollment.class?.className || `Lớp học #${enrollment.classId.slice(-6)}`;
  const teacherName = classDetail?.teacherName || enrollment.class?.teacherName || "Giảng viên Edunity";

  // Case A: Full Scholarship (100%) or FREE class already CONFIRMED without needing a QR payment
  const isConfirmedWithoutGateway =
    (enrollment.enrollmentStatus === "CONFIRMED" || enrollment.enrollmentStatus === "COMPLETED") &&
    (enrollment.paymentSource === "SCHOLARSHIP" ||
      enrollment.paymentSource === "FREE" ||
      (!activePayment && enrollment.amountPaidViaPayment === 0));

  if (isConfirmedWithoutGateway) {
    return (
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6" data-testid="checkout-full-scholarship-success">
        <PaymentResult
          payment={{
            purpose: "TUITION",
            paymentStatus: "COMPLETED",
            enrollmentStatus: enrollment.enrollmentStatus,
            paymentSource: enrollment.paymentSource,
            amount: 0,
            tuitionAmount: enrollment.tuitionAmount,
            scholarshipAmount:
              enrollment.amountPaidViaScholarship ||
              appliedScholarshipAmount ||
              enrollment.tuitionAmount,
            className: classTitle,
          }}
          uiState="COMPLETED"
          purpose="TUITION"
          classTitle={classTitle}
          onPrimaryAction={() => navigate(`/student/classes/${enrollment.classId}`)}
          primaryActionLabel="Vào lớp của tôi"
          onSecondaryAction={() => navigate(ROUTES.STUDENT.ENROLLMENTS)}
          secondaryActionLabel="Đơn đăng ký của tôi"
        />
      </div>
    );
  }

  // Case B: Terminal Payment Result (Confirmed Tuition OR Late Payment Review / Reconciliation)
  if (
    activePayment &&
    (effectiveUiState === "COMPLETED" ||
      effectiveUiState === "LATE_PAYMENT_REVIEW" ||
      effectiveUiState === "RECONCILIATION_REQUIRED")
  ) {
    return (
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
        <PaymentResult
          payment={activePayment as any}
          uiState={effectiveUiState}
          purpose="TUITION"
          classTitle={classTitle}
          onPrimaryAction={
            effectiveUiState === "COMPLETED"
              ? () => navigate(`/student/classes/${enrollment.classId}`)
              : undefined
          }
          primaryActionLabel="Vào lớp của tôi"
          onSecondaryAction={() => navigate(ROUTES.STUDENT.PAYMENTS)}
          secondaryActionLabel="Xem lịch sử thanh toán"
        />
      </div>
    );
  }

  // Case C: Enrollment already EXPIRED or CANCELLED before payment
  if (enrollment.enrollmentStatus === "EXPIRED" || enrollment.enrollmentStatus === "CANCELLED") {
    return (
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
        <PaymentErrorState
          kind="EXPIRED"
          purpose="TUITION"
          message={
            enrollment.enrollmentStatus === "CANCELLED"
              ? "Đơn giữ chỗ đã được hủy"
              : "Đơn giữ chỗ đã hết thời hạn 15 phút"
          }
          description="Chỗ ngồi tạm giữ của bạn đã được giải phóng. Nếu lớp vẫn còn chỗ trống, bạn có thể quay lại trang chi tiết lớp để đăng ký lại."
          onBack={() => navigate(`/classes/${enrollment.classId}`)}
          backLabel="Quay lại trang lớp học"
        />
      </div>
    );
  }

  const scholarshipDeduction =
    activePayment?.scholarshipAmount ||
    appliedScholarshipAmount ||
    enrollment.amountPaidViaScholarship ||
    (activePayment ? Math.max(0, enrollment.tuitionAmount - activePayment.amount) : 0);

  const amountDue = activePayment
    ? activePayment.amount
    : Math.max(0, enrollment.tuitionAmount - scholarshipDeduction);

  const canShowSandboxControls =
    IS_DEV_OR_TEST &&
    import.meta.env.VITE_ENABLE_PAYMENT_SANDBOX === "true" &&
    Boolean(activePayment?.gatewayReference) &&
    (activePayment?.provider === "SANDBOX" ||
      activePayment?.gateway === "SANDBOX" ||
      activePayment?.gatewayReference?.startsWith("SBX-"));

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(ROUTES.STUDENT.ENROLLMENTS)}
          className="text-xs font-semibold text-slate-600 hover:text-indigo-600 px-0"
        >
          Quay lại danh sách đơn đăng ký
        </Button>
        <Tag color="indigo" className="font-bold text-xs px-3 py-0.5 rounded-full">
          Thanh toán học phí VietQR (Kênh TUITION)
        </Tag>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Class Info & Scholarship Option */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="rounded-2xl border border-slate-200 shadow-xs">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-lg shrink-0">
                  <BookOutlined />
                </div>
                <div>
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    Thông tin lớp học đăng ký
                  </Text>
                  <Title level={4} className="!m-0 !text-base font-extrabold text-slate-900">
                    {classTitle}
                  </Title>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <UserOutlined />
                    <span>Giảng viên:</span>
                    <strong className="text-slate-700">{teacherName}</strong>
                  </div>
                </div>
              </div>

              <Divider className="!my-3" />

              {/* Pricing Summary */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Học phí niêm yết:</span>
                  <span className="font-bold text-slate-800">
                    {formatVND(enrollment.tuitionAmount)}
                  </span>
                </div>

                {scholarshipDeduction > 0 && (
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Học bổng áp dụng ({enrollment.paymentSource === "MIXED" ? "Đồng chi trả" : "Học bổng"}):</span>
                    <span className="font-bold">- {formatVND(scholarshipDeduction)}</span>
                  </div>
                )}

                <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-800">Số tiền cần thanh toán:</span>
                  <span className="text-lg font-black text-indigo-700">
                    {formatVND(amountDue)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Scholarship Selection Card (when DIRECT_PAYMENT and eligible scholarships exist) */}
          {enrollment.paymentSource === "DIRECT_PAYMENT" && eligibleScholarships.length > 0 && (
            <Card
              className="rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs"
              data-testid="checkout-scholarship-panel"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <GiftOutlined className="text-emerald-600 text-base" />
                  <span>Sử dụng Học bổng của bạn</span>
                </div>
                <p className="text-xs text-slate-600 m-0 leading-relaxed">
                  Bạn có <strong>{eligibleScholarships.length}</strong> suất học bổng khả dụng cho lớp học này. Nếu học bổng đủ 100% học phí, bạn sẽ được xác nhận vào lớp ngay mà không cần quét QR.
                </p>

                <Radio.Group
                  value={selectedScholarshipId}
                  onChange={(e) => setSelectedScholarshipId(e.target.value)}
                  className="w-full space-y-2"
                >
                  {eligibleScholarships.map((sch) => {
                    const coversFull = sch.remainingAmount >= enrollment.tuitionAmount;
                    return (
                      <div
                        key={sch.id}
                        className="p-3 rounded-xl bg-white border border-emerald-200/80 flex items-start justify-between gap-2"
                      >
                        <Radio value={sch.id} className="text-xs">
                          <div className="font-bold text-slate-800">
                            {sch.campaign?.title || "Học bổng Edunity"}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Số dư khả dụng:{" "}
                            <strong className="text-emerald-700">
                              {formatVND(sch.remainingAmount)}
                            </strong>{" "}
                            {coversFull ? "(Đủ 100% học phí)" : "(Hỗ trợ đồng chi trả MIXED)"}
                          </div>
                        </Radio>
                      </div>
                    );
                  })}
                </Radio.Group>

                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!selectedScholarshipId}
                  loading={applyScholarshipMutation.isPending}
                  onClick={() =>
                    selectedScholarshipId && applyScholarshipMutation.mutate(selectedScholarshipId)
                  }
                  className="w-full bg-emerald-600 hover:bg-emerald-700 border-none font-bold text-xs h-9 rounded-xl"
                  data-testid="checkout-apply-scholarship-btn"
                >
                  Áp dụng học bổng đã chọn
                </Button>
              </div>
            </Card>
          )}

          {/* Instructions */}
          <PaymentInstructions purpose="TUITION" />
        </div>

        {/* Right Column: Unified VietQR Panel */}
        <div className="lg:col-span-7 space-y-5">
          {createIntentMutation.isPending && !activePayment ? (
            <Card className="rounded-2xl border border-slate-200 p-6">
              <Skeleton active paragraph={{ rows: 8 }} />
            </Card>
          ) : createIntentMutation.isError && !activePayment ? (
            <PaymentErrorState
              kind={
                (createIntentMutation.error as any)?.code === "PAYMENT_PROVIDER_DISABLED" ||
                (createIntentMutation.error as any)?.status === 503
                  ? "PAYMENT_PROVIDER_DISABLED"
                  : "CREATE_INTENT_ERROR"
              }
              purpose="TUITION"
              message={
                (createIntentMutation.error as any)?.code === "PAYMENT_PROVIDER_DISABLED" ||
                (createIntentMutation.error as any)?.status === 503
                  ? "Cổng thanh toán chưa được kích hoạt"
                  : undefined
              }
              description={
                (createIntentMutation.error as any)?.code === "PAYMENT_PROVIDER_DISABLED" ||
                (createIntentMutation.error as any)?.status === 503
                  ? "Cổng thanh toán chưa được kích hoạt."
                  : (createIntentMutation.error as any)?.message ||
                    "Không thể tạo mã thanh toán học phí lúc này. Vui lòng thử lại."
              }
              onRetry={() => createIntentMutation.mutate(enrollment.id)}
              retryLoading={createIntentMutation.isPending}
            />
          ) : activePayment ? (
            <>
              <PaymentQrPanel
                purpose="TUITION"
                uiState={effectiveUiState}
                amount={activePayment.amount}
                tuitionAmount={enrollment.tuitionAmount}
                scholarshipAmount={scholarshipDeduction}
                qrCode={activePayment.qrCode}
                checkoutUrl={activePayment.checkoutUrl}
                orderCode={activePayment.orderCode}
                gatewayReference={activePayment.gatewayReference}
                provider={activePayment.provider}
                gateway={activePayment.gateway}
                expiredAt={activePayment.expiredAt || enrollment.holdExpiresAt}
                title={`Thanh toán học phí: ${classTitle}`}
                subtitle={
                  scholarshipDeduction > 0
                    ? "Đơn đồng chi trả (MIXED) — Học bổng đã được tạm giữ cho chỗ ngồi của bạn"
                    : "Chỗ ngồi của bạn đang được giữ tạm thời trong 15 phút"
                }
                isPolling={isPolling}
                isRefreshing={isPollingFetching}
                onExpire={() => {
                  setIsClientTimerZero(true);
                  refetchPayment();
                  refetchEnrollment();
                }}
                onManualRefresh={() => {
                  refetchPayment();
                  refetchEnrollment();
                }}
                onRecreateIntent={() => {
                  autoIntentTriggeredRef.current = `${enrollment.id}:RETRY:${Date.now()}`;
                  createIntentMutation.mutate(enrollment.id);
                }}
                recreateLoading={createIntentMutation.isPending}
              />

              {/* Developer Sandbox Controls (Strictly DEV/TEST + SANDBOX only) */}
              {canShowSandboxControls && effectiveUiState === "PENDING" && (
                <Card
                  size="small"
                  className="rounded-2xl border-dashed border-amber-300 bg-amber-50/40"
                  data-testid="checkout-sandbox-simulator"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <ExperimentOutlined />
                        Công cụ mô phỏng Webhook (Chỉ hiển thị ở SANDBOX / DEV)
                      </div>
                      <div className="text-[11px] text-amber-700">
                        Giả lập callback xác nhận từ cổng thanh toán để kiểm thử luồng học phí.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={sandboxWebhookMutation.isPending}
                        onClick={() => sandboxWebhookMutation.mutate("SUCCESS")}
                        className="bg-emerald-600 hover:bg-emerald-700 border-none text-xs font-semibold rounded-lg"
                        data-testid="sandbox-simulate-success-btn"
                      >
                        Giả lập Thành công
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        loading={sandboxWebhookMutation.isPending}
                        onClick={() => sandboxWebhookMutation.mutate("FAILED")}
                        className="text-xs font-semibold rounded-lg"
                        data-testid="sandbox-simulate-failed-btn"
                      >
                        Giả lập Thất bại
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Đang chuẩn bị thông tin thanh toán"
              description="Vui lòng nhấn Tạo mã QR nếu mã thanh toán chưa tự động hiển thị."
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => createIntentMutation.mutate(enrollment.id)}
                  loading={createIntentMutation.isPending}
                >
                  Tạo mã QR
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
