import { ClockCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useHoldCountdown } from "../../hooks/useHoldCountdown";
import { formatCountdownMMSS } from "../../hooks/usePaymentPolling";

export interface PaymentCountdownProps {
  expiredAt: string | null | undefined;
  onExpire?: () => void;
  disabled?: boolean;
  label?: string;
}

export function PaymentCountdown({
  expiredAt,
  onExpire,
  disabled = false,
  label = "Thời gian hiệu lực mã QR",
}: PaymentCountdownProps) {
  const { timeLeft, isExpired } = useHoldCountdown(disabled ? null : expiredAt, onExpire);

  if (!expiredAt) {
    return null;
  }

  const formatted = formatCountdownMMSS(timeLeft);

  if (isExpired || timeLeft <= 0) {
    return (
      <div
        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700"
        data-testid="payment-countdown-expired"
      >
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <CloseCircleOutlined />
          Mã QR đã hết hạn
        </span>
        <span className="font-mono text-sm font-black">00:00</span>
      </div>
    );
  }

  const isUrgent = timeLeft <= 180; // Last 3 minutes

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border transition-colors ${
        isUrgent
          ? "bg-rose-50/80 border-rose-200 text-rose-800"
          : "bg-amber-50/80 border-amber-200 text-amber-900"
      }`}
      data-testid="payment-countdown-active"
    >
      <span className="text-xs font-medium flex items-center gap-1.5">
        <ClockCircleOutlined className={isUrgent ? "text-rose-600 animate-pulse" : "text-amber-600"} />
        {label}
      </span>
      <span
        className={`font-mono text-base font-black tracking-wider ${
          isUrgent ? "text-rose-600" : "text-amber-700"
        }`}
        data-testid="payment-countdown-value"
      >
        {formatted}
      </span>
    </div>
  );
}

export default PaymentCountdown;

