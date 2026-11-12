import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Skeleton } from "antd";
import { ReloadOutlined, ArrowLeftOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { usePaymentPolling } from "../../hooks/usePaymentPolling";
import {
  PaymentResult,
  PaymentQrPanel,
  PaymentErrorState,
} from "../../components/payment";
import { FetchError } from "../../api/apiClient";
import { ROUTES } from "../../routes/routePaths";

export default function PaymentSuccessPage() {
  const { paymentId: paramPaymentId } = useParams<{ paymentId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve paymentId from route param OR returnUrl/cancelUrl query string.
  // SECURITY RULE: NEVER trust ?status=PAID or ?code=00 in the URL query string.
  // Always verify payment state directly from Backend via GET /api/payments/:id.
  const queryPaymentId =
    searchParams.get("paymentId") ||
    searchParams.get("contributionId") ||
    searchParams.get("id") ||
    null;

  const resolvedPaymentId = paramPaymentId || queryPaymentId;
  const isCancelRoute = location.pathname.includes("/cancel");
  const isSponsorRoute = location.pathname.includes("/sponsor/");

  const {
    payment,
    uiState,
    isLoading,
    isError,
    error,
    isPolling,
    isFetching,
    refetch,
  } = usePaymentPolling({
    paymentId: resolvedPaymentId,
    enabled: Boolean(resolvedPaymentId),
  });

  if (!resolvedPaymentId) {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-8 space-y-4">
        <PaymentErrorState
          kind="NOT_FOUND"
          purpose={isSponsorRoute ? "DONATION" : "TUITION"}
          message={
            isCancelRoute
              ? "Giao dịch thanh toán đã được hủy hoặc tạm dừng"
              : "Không tìm thấy mã định danh giao dịch cần kiểm tra"
          }
          description="Hệ thống không xác nhận thanh toán qua tham số đường dẫn (URL). Vui lòng kiểm tra trạng thái thực tế trong danh sách đơn đăng ký hoặc lịch sử đóng góp của bạn."
          onBack={() =>
            navigate(isSponsorRoute ? ROUTES.SPONSOR.CONTRIBUTIONS : ROUTES.STUDENT.ENROLLMENTS)
          }
          backLabel={isSponsorRoute ? "Về lịch sử tài trợ" : "Về đơn đăng ký của tôi"}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <Card className="rounded-2xl border border-slate-200 p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    );
  }

  if (isError || !payment) {
    const status = error instanceof FetchError ? error.status : 0;
    const kind =
      status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "NETWORK_ERROR";
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <PaymentErrorState
          kind={kind}
          purpose={isSponsorRoute ? "DONATION" : "TUITION"}
          onRetry={() => refetch()}
          retryLoading={isFetching}
          onBack={() =>
            navigate(isSponsorRoute ? ROUTES.SPONSOR.CONTRIBUTIONS : ROUTES.STUDENT.ENROLLMENTS)
          }
          backLabel={isSponsorRoute ? "Về lịch sử tài trợ" : "Về đơn đăng ký của tôi"}
        />
      </div>
    );
  }

  const purpose = payment.purpose || (isSponsorRoute ? "DONATION" : "TUITION");

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-5" data-testid="payment-verification-page">
      {/* Return/Cancel URL Security Notice */}
      {isCancelRoute && uiState === "PENDING" && (
        <Alert
          type="warning"
          showIcon
          message="Bạn đã rời khỏi trang cổng thanh toán"
          description="Giao dịch của bạn hiện vẫn đang ở trạng thái Chờ thanh toán. Nếu thời gian hiệu lực 15 phút vẫn còn, bạn có thể tiếp tục quét mã VietQR bên dưới."
          className="rounded-2xl"
        />
      )}

      {!isCancelRoute && (uiState === "PENDING" || uiState === "PROCESSING") && (
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Đang xác minh giao dịch từ máy chủ ngân hàng..."
          description="Edunity chỉ xác nhận thành công sau khi nhận và kiểm tra chữ ký Webhook hợp lệ từ cổng thanh toán. Hệ thống đang tự động kiểm tra 3 giây/lần."
          action={
            <Button
              size="small"
              icon={<ReloadOutlined spin={isFetching} />}
              onClick={() => refetch()}
            >
              Kiểm tra ngay
            </Button>
          }
          className="rounded-2xl"
        />
      )}

      {uiState === "PENDING" || uiState === "PROCESSING" ? (
        <PaymentQrPanel
          purpose={purpose}
          uiState={uiState}
          amount={payment.amount}
          tuitionAmount={payment.tuitionAmount}
          scholarshipAmount={payment.scholarshipAmount}
          qrCode={payment.qrCode}
          checkoutUrl={payment.checkoutUrl}
          orderCode={payment.orderCode}
          gatewayReference={payment.gatewayReference}
          provider={payment.provider}
          gateway={payment.gateway}
          expiredAt={payment.expiredAt || payment.holdExpiresAt}
          isAnonymous={payment.isAnonymous}
          donorDisplayName={payment.donorDisplayName}
          title={
            purpose === "DONATION"
              ? "Đang chờ xác nhận khoản tài trợ học bổng"
              : "Đang chờ xác nhận thanh toán học phí"
          }
          isPolling={isPolling}
          isRefreshing={isFetching}
          onManualRefresh={() => refetch()}
          onExpire={() => refetch()}
        />
      ) : (
        <PaymentResult
          payment={payment}
          uiState={uiState}
          purpose={purpose}
          onPrimaryAction={
            purpose === "TUITION" && uiState === "COMPLETED" && payment.classId
              ? () => navigate(`/student/classes/${payment.classId}`)
              : purpose === "TUITION" &&
                (uiState === "FAILED" || uiState === "EXPIRED") &&
                payment.enrollmentId
              ? () => navigate(`/checkout/${payment.enrollmentId}`)
              : purpose === "DONATION"
              ? () => navigate(ROUTES.SPONSOR.CONTRIBUTIONS)
              : undefined
          }
          primaryActionLabel={
            purpose === "TUITION" && uiState === "COMPLETED"
              ? "Vào lớp của tôi"
              : purpose === "TUITION" && (uiState === "FAILED" || uiState === "EXPIRED")
              ? "Quay lại trang thanh toán"
              : "Xem lịch sử tài trợ"
          }
          onSecondaryAction={() =>
            navigate(
              purpose === "DONATION" ? ROUTES.CAMPAIGNS : ROUTES.STUDENT.PAYMENTS
            )
          }
          secondaryActionLabel={
            purpose === "DONATION" ? "Khám phá chiến dịch" : "Lịch sử thanh toán"
          }
        />
      )}

      <div className="flex justify-center">
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() =>
            navigate(
              purpose === "DONATION"
                ? ROUTES.SPONSOR.CONTRIBUTIONS
                : ROUTES.STUDENT.ENROLLMENTS
            )
          }
          className="text-xs text-slate-500"
        >
          {purpose === "DONATION"
            ? "Quay về trang đóng góp của Nhà tài trợ"
            : "Quay về danh sách đơn đăng ký của Học viên"}
        </Button>
      </div>
    </div>
  );
}
