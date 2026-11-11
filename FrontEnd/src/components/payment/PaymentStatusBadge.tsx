import { Tag } from "antd";
import {
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { PaymentPurpose, PaymentUiState } from "../../types/payment";
import { PAYMENT_UI_STATE_COLORS, PAYMENT_UI_STATE_LABELS } from "../../types/payment";

export interface PaymentStatusBadgeProps {
  uiState: PaymentUiState;
  purpose?: PaymentPurpose;
  className?: string;
}

export function getPaymentStatusDisplayLabel(
  uiState: PaymentUiState,
  purpose: PaymentPurpose = "TUITION"
): string {
  if (uiState === "COMPLETED") {
    return purpose === "DONATION" ? "Tài trợ đã được ghi nhận" : "Đăng ký lớp thành công";
  }
  return PAYMENT_UI_STATE_LABELS[uiState] || PAYMENT_UI_STATE_LABELS.PENDING;
}

export function PaymentStatusBadge({
  uiState,
  purpose = "TUITION",
  className = "",
}: PaymentStatusBadgeProps) {
  const label = getPaymentStatusDisplayLabel(uiState, purpose);
  const color = PAYMENT_UI_STATE_COLORS[uiState] || "default";

  const iconMap: Record<PaymentUiState, React.ReactNode> = {
    PENDING: <ClockCircleOutlined />,
    PROCESSING: <SyncOutlined spin />,
    COMPLETED: <CheckCircleOutlined />,
    FAILED: <CloseCircleOutlined />,
    EXPIRED: <StopOutlined />,
    RECONCILIATION_REQUIRED: <ExclamationCircleOutlined />,
    LATE_PAYMENT_REVIEW: <ExclamationCircleOutlined />,
    REFUND_PENDING: <SyncOutlined />,
  };

  return (
    <Tag
      color={color}
      icon={iconMap[uiState]}
      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${className}`}
      data-testid="payment-status-badge"
      data-ui-state={uiState}
    >
      {label}
    </Tag>
  );
}

export default PaymentStatusBadge;

