import { Alert, Button } from "antd";
import {
  ReloadOutlined,
  ArrowLeftOutlined,
  LinkOutlined,
  WarningOutlined,
  LockOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { PaymentPurpose } from "../../types/payment";

export type PaymentErrorKind =
  | "NETWORK_ERROR"
  | "MISSING_QR"
  | "CREATE_INTENT_ERROR"
  | "PAYMENT_PROVIDER_DISABLED"
  | "EXPIRED"
  | "CAMPAIGN_CLOSED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LATE_PAYMENT_REVIEW"
  | "RECONCILIATION_REQUIRED";

export interface PaymentErrorStateProps {
  kind: PaymentErrorKind;
  purpose?: PaymentPurpose;
  message?: string;
  description?: string;
  checkoutUrl?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
  retryLoading?: boolean;
  backLabel?: string;
}

const DEFAULT_CONTENT: Record<
  PaymentErrorKind,
  {
    type: "error" | "warning" | "info";
    title: string;
    description: string;
  }
> = {
  NETWORK_ERROR: {
    type: "warning",
    title: "Không thể kết nối đến máy chủ thanh toán",
    description:
      "Kết nối mạng đang gián đoạn hoặc máy chủ phản hồi chậm. Nếu bạn đã chuyển khoản, vui lòng không chuyển lại lần 2 và nhấn Kiểm tra lại.",
  },
  MISSING_QR: {
    type: "warning",
    title: "Không thể tải mã VietQR trực tiếp",
    description:
      "Hệ thống đã khởi tạo lệnh thanh toán nhưng chưa nhận được chuỗi hiển thị QR trực tiếp. Bạn có thể mở trang thanh toán payOS hoặc tải lại mã QR.",
  },
  CREATE_INTENT_ERROR: {
    type: "error",
    title: "Không thể khởi tạo giao dịch thanh toán",
    description:
      "Hệ thống tạm thời chưa tạo được mã VietQR từ cổng thanh toán. Vui lòng thử lại sau ít giây.",
  },
  PAYMENT_PROVIDER_DISABLED: {
    type: "warning",
    title: "Cổng thanh toán chưa được kích hoạt",
    description: "Cổng thanh toán chưa được kích hoạt.",
  },
  EXPIRED: {
    type: "warning",
    title: "Mã QR đã hết hạn thanh toán",
    description:
      "Thời gian hiệu lực 15 phút của mã QR đã kết thúc. Vui lòng không quét mã QR đã hết hạn và tạo yêu cầu mới nếu vẫn muốn tiếp tục.",
  },
  CAMPAIGN_CLOSED: {
    type: "warning",
    title: "Chiến dịch học bổng đã ngừng nhận tài trợ",
    description:
      "Chiến dịch này hiện đã đóng hoặc hết thời gian gây quỹ nên không thể tạo mã QR tài trợ mới.",
  },
  FORBIDDEN: {
    type: "error",
    title: "Bạn không có quyền truy cập giao dịch này",
    description:
      "Tài khoản hiện tại không khớp với người sở hữu giao dịch hoặc không có quyền thực hiện thao tác thanh toán này.",
  },
  NOT_FOUND: {
    type: "error",
    title: "Không tìm thấy thông tin giao dịch",
    description:
      "Mã giao dịch hoặc đơn đăng ký không tồn tại hoặc không thuộc tài khoản của bạn.",
  },
  LATE_PAYMENT_REVIEW: {
    type: "warning",
    title: "Đã nhận tiền — đang đối soát (Khoản tiền đến sau hạn)",
    description:
      "Hệ thống ghi nhận ngân hàng đã báo có nhưng thời gian giữ chỗ 15 phút của đơn đăng ký đã hết hạn trước đó. Giao dịch đã được chuyển sang trạng thái chờ đối soát/hoàn tiền an toàn — vui lòng không chuyển khoản thêm.",
  },
  RECONCILIATION_REQUIRED: {
    type: "warning",
    title: "Đã ghi nhận giao dịch cần đối soát",
    description:
      "Hệ thống đã nhận được thông báo giao dịch từ ngân hàng và đang thực hiện đối soát an toàn với bộ phận tài chính Edunity.",
  },
};

export function PaymentErrorState({
  kind,
  message,
  description,
  checkoutUrl,
  onRetry,
  onBack,
  retryLoading = false,
  backLabel = "Quay lại",
}: PaymentErrorStateProps) {
  const defaults = DEFAULT_CONTENT[kind] || DEFAULT_CONTENT.CREATE_INTENT_ERROR;

  const icon =
    kind === "FORBIDDEN" ? (
      <LockOutlined />
    ) : kind === "EXPIRED" || kind === "LATE_PAYMENT_REVIEW" ? (
      <ClockCircleOutlined />
    ) : (
      <WarningOutlined />
    );

  return (
    <div className="space-y-3" data-testid={`payment-error-${kind.toLowerCase()}`}>
      <Alert
        type={defaults.type}
        showIcon
        icon={icon}
        message={<span className="font-bold text-sm">{message || defaults.title}</span>}
        description={
          <div className="space-y-3 mt-1">
            <p className="text-xs leading-relaxed text-slate-700">
              {description || defaults.description}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {checkoutUrl && (
                <Button
                  type="primary"
                  size="small"
                  icon={<LinkOutlined />}
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 font-semibold rounded-lg"
                  data-testid="payment-error-open-checkout-url"
                >
                  Mở trang thanh toán payOS
                </Button>
              )}
              {onRetry && (
                <Button
                  size="small"
                  type={checkoutUrl ? "default" : "primary"}
                  icon={<ReloadOutlined />}
                  loading={retryLoading}
                  onClick={onRetry}
                  className="font-semibold rounded-lg"
                  data-testid="payment-error-retry-button"
                >
                  Thử lại / Kiểm tra trạng thái
                </Button>
              )}
              {onBack && (
                <Button
                  size="small"
                  icon={<ArrowLeftOutlined />}
                  onClick={onBack}
                  className="rounded-lg"
                  data-testid="payment-error-back-button"
                >
                  {backLabel}
                </Button>
              )}
            </div>
          </div>
        }
        className="rounded-2xl border p-4"
      />
    </div>
  );
}

export default PaymentErrorState;

