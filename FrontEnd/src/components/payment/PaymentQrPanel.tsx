import { Alert, Button, QRCode, Tag, Tooltip, Typography, message } from "antd";
import {
  CopyOutlined,
  LinkOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  EyeInvisibleOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import type { PaymentPurpose, PaymentUiState } from "../../types/payment";
import { formatVND } from "../../types/payment";
import PaymentStatusBadge from "./PaymentStatusBadge";
import PaymentCountdown from "./PaymentCountdown";
import PaymentErrorState from "./PaymentErrorState";

const { Text } = Typography;

export interface PaymentQrPanelProps {
  purpose: PaymentPurpose;
  uiState: PaymentUiState;
  amount: number;
  tuitionAmount?: number;
  scholarshipAmount?: number;
  qrCode: string | null | undefined;
  checkoutUrl?: string | null;
  orderCode?: number | null;
  gatewayReference?: string | null;
  provider?: string;
  gateway?: string;
  expiredAt?: string | null;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  title?: string;
  subtitle?: string;
  isPolling?: boolean;
  isRefreshing?: boolean;
  onExpire?: () => void;
  onManualRefresh?: () => void;
  onRecreateIntent?: () => void;
  recreateLoading?: boolean;
}

/**
 * Check if a string is a direct image URL or data URI rather than an EMVCo payload string.
 */
export function isImageSourceUrl(qrCode: string | null | undefined): boolean {
  if (!qrCode || typeof qrCode !== "string") return false;
  const trimmed = qrCode.trim();
  return (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
}

export function PaymentQrPanel({
  purpose,
  uiState,
  amount,
  tuitionAmount,
  scholarshipAmount = 0,
  qrCode,
  checkoutUrl,
  orderCode,
  gatewayReference,
  provider = "PAYOS",
  gateway = "PAYOS",
  expiredAt,
  isAnonymous = false,
  donorDisplayName,
  title,
  subtitle,
  isPolling = false,
  isRefreshing = false,
  onExpire,
  onManualRefresh,
  onRecreateIntent,
  recreateLoading = false,
}: PaymentQrPanelProps) {
  const isSandboxMode =
    provider === "SANDBOX" ||
    gateway === "SANDBOX" ||
    Boolean(gatewayReference && gatewayReference.startsWith("SBX-"));

  const isExpired = uiState === "EXPIRED";
  const isFailed = uiState === "FAILED";
  const hasQr = Boolean(qrCode && qrCode.trim().length > 0);
  const showMixedBreakdown =
    purpose === "TUITION" &&
    typeof tuitionAmount === "number" &&
    tuitionAmount > amount &&
    scholarshipAmount > 0;

  const handleCopy = (value: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(
        () => message.success(`Đã sao chép ${label}`),
        () => message.info(`${label}: ${value}`)
      );
    } else {
      message.info(`${label}: ${value}`);
    }
  };

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
      data-testid="payment-qr-panel"
    >
      {/* Sandbox / Mock Warning Banner */}
      {isSandboxMode && (
        <div
          className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-900"
          data-testid="payment-sandbox-banner"
        >
          <span className="font-semibold flex items-center gap-1.5">
            <ExperimentOutlined className="text-amber-600 text-sm" />
            Chế độ SANDBOX / MOCK (Môi trường kiểm thử) — Tuyệt đối không chuyển tiền thật
          </span>
          <Tag color="orange" className="m-0 font-bold text-[10px]">
            SANDBOX
          </Tag>
        </div>
      )}

      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag
              color={purpose === "DONATION" ? "magenta" : "indigo"}
              className="m-0 text-[11px] font-bold uppercase tracking-wide"
            >
              {purpose === "DONATION" ? "Kênh Quỹ Học Bổng (DONATION)" : "Kênh Học Phí (TUITION)"}
            </Tag>
            {purpose === "DONATION" && (
              <Tag
                color={isAnonymous ? "default" : "cyan"}
                icon={isAnonymous ? <EyeInvisibleOutlined /> : <GlobalOutlined />}
                className="m-0 text-[11px] font-semibold"
                data-testid="payment-anonymity-tag"
              >
                {isAnonymous ? "Tài trợ ẩn danh" : donorDisplayName || "Tài trợ công khai"}
              </Tag>
            )}
          </div>
          {title && <h3 className="text-base font-extrabold text-slate-900 m-0">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 m-0">{subtitle}</p>}
        </div>

        <PaymentStatusBadge uiState={uiState} purpose={purpose} />
      </div>

      {/* Main Content */}
      <div className="p-5 space-y-5">
        {/* Countdown */}
        {expiredAt && (
          <PaymentCountdown
            expiredAt={expiredAt}
            onExpire={onExpire}
            disabled={uiState === "COMPLETED" || uiState === "LATE_PAYMENT_REVIEW"}
            label={
              purpose === "DONATION"
                ? "Thời hạn hiệu lực mã QR quyên góp (15 phút)"
                : "Thời gian giữ chỗ & hiệu lực mã QR (15 phút)"
            }
          />
        )}

        {/* Amount Breakdown */}
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-4 space-y-2">
          {showMixedBreakdown && (
            <>
              <div className="flex justify-between items-center text-xs text-slate-600">
                <span>Tổng học phí gốc:</span>
                <span className="font-semibold text-slate-800" data-testid="payment-tuition-total">
                  {formatVND(tuitionAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-emerald-700">
                <span>Học bổng hỗ trợ (MIXED):</span>
                <span className="font-bold" data-testid="payment-scholarship-deduction">
                  - {formatVND(scholarshipAmount)}
                </span>
              </div>
              <div className="border-t border-indigo-100 pt-2" />
            </>
          )}

          <div className="flex justify-between items-baseline gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {purpose === "DONATION"
                ? "Số tiền tài trợ:"
                : showMixedBreakdown
                ? "Số tiền học viên cần thanh toán:"
                : "Số tiền học phí cần thanh toán:"}
            </span>
            <span
              className="text-xl font-black text-indigo-700 tracking-tight"
              data-testid="payment-amount-due"
            >
              {formatVND(amount)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-indigo-100/80 text-xs text-slate-600">
            {orderCode != null && (
              <div className="flex items-center gap-1.5">
                <span>Mã đơn payOS (orderCode):</span>
                <code
                  className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200"
                  data-testid="payment-order-code"
                >
                  {orderCode}
                </code>
                <Tooltip title="Sao chép mã đơn">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopy(String(orderCode), "mã đơn")}
                    className="!h-6 !w-6 !p-0 text-slate-500"
                  />
                </Tooltip>
              </div>
            )}

            {gatewayReference && (
              <div className="flex items-center gap-1.5">
                <span>Mã tham chiếu:</span>
                <code
                  className="font-mono text-[11px] font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200"
                  data-testid="payment-gateway-reference"
                >
                  {gatewayReference}
                </code>
                <Tooltip title="Sao chép mã tham chiếu">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopy(gatewayReference, "mã tham chiếu")}
                    className="!h-6 !w-6 !p-0 text-slate-500"
                  />
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {/* QR Code Display Area */}
        {isExpired ? (
          <PaymentErrorState
            kind="EXPIRED"
            purpose={purpose}
            onRetry={onRecreateIntent || onManualRefresh}
            retryLoading={recreateLoading || isRefreshing}
          />
        ) : isFailed ? (
          <Alert
            type="error"
            showIcon
            message="Giao dịch chưa thành công"
            description="Lần thanh toán vừa rồi chưa hoàn tất hoặc đã bị hủy. Nếu thời gian hiệu lực vẫn còn, bạn có thể tạo lại mã QR hoặc thử thanh toán lại."
            action={
              onRecreateIntent ? (
                <Button
                  size="small"
                  type="primary"
                  danger
                  loading={recreateLoading}
                  onClick={onRecreateIntent}
                  data-testid="payment-recreate-after-failed"
                >
                  Tạo mã QR mới
                </Button>
              ) : undefined
            }
            className="rounded-xl"
          />
        ) : hasQr ? (
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <QrcodeOutlined className="text-indigo-600 text-base" />
              <span>Quét mã VietQR bằng ứng dụng Ngân hàng</span>
            </div>

            <div
              className="p-3 bg-white rounded-2xl shadow-xs border border-slate-200 inline-flex items-center justify-center"
              data-testid="payment-qr-code-container"
            >
              {isImageSourceUrl(qrCode) ? (
                <img
                  src={qrCode!}
                  alt="Mã thanh toán VietQR"
                  className="w-[220px] h-[220px] object-contain"
                  data-testid="payment-qr-image"
                />
              ) : (
                <QRCode
                  value={qrCode!}
                  size={220}
                  bordered={false}
                  errorLevel="M"
                  data-testid="payment-qr-canvas"
                />
              )}
            </div>

            <Text className="text-[11px] text-slate-500 text-center max-w-sm">
              Mã VietQR chuẩn EMVCo Napas247 đã bao gồm sẵn số tiền{" "}
              <strong>{formatVND(amount)}</strong> và nội dung định danh giao dịch.
            </Text>

            {checkoutUrl && (
              <Button
                type="default"
                size="middle"
                icon={<LinkOutlined />}
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl font-semibold text-xs border-indigo-200 text-indigo-700 hover:border-indigo-400"
                data-testid="payment-open-checkout-url"
              >
                Mở trang cổng thanh toán payOS
              </Button>
            )}
          </div>
        ) : (
          <PaymentErrorState
            kind="MISSING_QR"
            purpose={purpose}
            checkoutUrl={checkoutUrl}
            onRetry={onManualRefresh || onRecreateIntent}
            retryLoading={isRefreshing || recreateLoading}
          />
        )}

        {/* Polling Status & Manual Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2" data-testid="payment-polling-indicator">
            <span
              className={`w-2 h-2 rounded-full ${
                isPolling ? "bg-emerald-500 animate-ping" : "bg-slate-300"
              }`}
            />
            <span>
              {isPolling
                ? "Đang tự động kiểm tra trạng thái thanh toán (3 giây/lần)..."
                : "Đã dừng tự động kiểm tra trạng thái."}
            </span>
          </div>

          {onManualRefresh && (
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined spin={isRefreshing} />}
              onClick={onManualRefresh}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 self-end sm:self-auto"
              data-testid="payment-manual-refresh-btn"
            >
              Kiểm tra ngay
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <SafetyCertificateOutlined className="text-emerald-600" />
          <span>Bảo mật bởi Unified Payment Engine • Không lưu thông tin thẻ/tài khoản ngân hàng</span>
        </div>
      </div>
    </div>
  );
}

export default PaymentQrPanel;

