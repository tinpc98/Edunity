import { Button, Card, Tag, Typography } from "antd";
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  CloseCircleFilled,
  ArrowRightOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import type { Payment, PaymentPurpose, PaymentUiState } from "../../types/payment";
import { formatVND } from "../../types/payment";
import PaymentStatusBadge from "./PaymentStatusBadge";

const { Title, Text } = Typography;

export interface PaymentResultProps {
  payment: Partial<Payment>;
  uiState: PaymentUiState;
  purpose?: PaymentPurpose;
  classTitle?: string;
  campaignTitle?: string;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
}

export function PaymentResult({
  payment,
  uiState,
  purpose = payment.purpose || "TUITION",
  classTitle,
  campaignTitle,
  onPrimaryAction,
  primaryActionLabel,
  onSecondaryAction,
  secondaryActionLabel,
}: PaymentResultProps) {
  const isTuition = purpose === "TUITION";
  const isConfirmedTuition =
    isTuition &&
    uiState === "COMPLETED" &&
    (payment.enrollmentStatus === "CONFIRMED" || payment.enrollmentStatus === "COMPLETED");

  const isConfirmedDonation =
    !isTuition &&
    uiState === "COMPLETED" &&
    !payment.reconciliationRequired &&
    (payment.contributionStatus === "COMPLETED" || payment.paymentStatus === "COMPLETED");

  const isReconciliationOrLate =
    uiState === "LATE_PAYMENT_REVIEW" ||
    uiState === "RECONCILIATION_REQUIRED" ||
    Boolean(payment.reconciliationRequired) ||
    (isTuition &&
      payment.paymentStatus === "COMPLETED" &&
      payment.enrollmentStatus !== "CONFIRMED" &&
      payment.enrollmentStatus !== "COMPLETED");

  const resolvedTitle = isConfirmedTuition
    ? "Đăng ký lớp thành công"
    : isConfirmedDonation
    ? "Tài trợ học bổng đã được ghi nhận"
    : isReconciliationOrLate
    ? uiState === "LATE_PAYMENT_REVIEW"
      ? "Đã nhận tiền — đang đối soát (Khoản tiền đến sau hạn)"
      : "Đã ghi nhận giao dịch cần đối soát"
    : uiState === "EXPIRED"
    ? "Mã QR đã hết hạn thanh toán"
    : "Thanh toán chưa thành công";

  const resolvedDescription = isConfirmedTuition
    ? "Hệ thống đã xác thực khoản thanh toán học phí và kích hoạt quyền vào lớp học của bạn."
    : isConfirmedDonation
    ? "Cảm ơn tấm lòng vàng của bạn! Khoản đóng góp đã được cộng vào Quỹ học bổng sau khi xác thực từ cổng thanh toán."
    : isReconciliationOrLate
    ? isTuition
      ? "Ngân hàng đã báo có nhưng thời hạn giữ chỗ 15 phút của đơn đăng ký đã kết thúc hoặc cần kiểm tra đối soát. Hệ thống đã tự động ghi nhận hồ sơ đối soát/hoàn tiền — tuyệt đối không cấp quyền vào lớp tự động khi đơn đã hết hạn."
      : "Giao dịch chuyển khoản của bạn đến sau khi chiến dịch đóng hoặc cần đối soát thủ công. Bộ phận tài chính Edunity đã ghi nhận để kiểm tra."
    : uiState === "EXPIRED"
    ? "Đơn thanh toán đã hết thời gian hiệu lực 15 phút."
    : "Giao dịch chưa được xác nhận hoàn tất từ cổng thanh toán.";

  const showClassroomButton = isConfirmedTuition;

  return (
    <Card
      className="rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
      data-testid="payment-result-card"
      data-ui-state={uiState}
    >
      <div className="text-center space-y-3 pb-6 border-b border-slate-100">
        <div className="inline-flex items-center justify-center">
          {isConfirmedTuition || isConfirmedDonation ? (
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <CheckCircleFilled className="text-4xl text-emerald-600" />
            </div>
          ) : isReconciliationOrLate ? (
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
              <ExclamationCircleFilled className="text-4xl text-amber-500" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
              <CloseCircleFilled className="text-4xl text-rose-600" />
            </div>
          )}
        </div>

        <div>
          <PaymentStatusBadge uiState={uiState} purpose={purpose} />
        </div>

        <Title
          level={3}
          className="!mb-1 !text-xl font-black text-slate-900"
          data-testid="payment-result-title"
        >
          {resolvedTitle}
        </Title>

        <Text className="text-xs text-slate-600 block max-w-lg mx-auto leading-relaxed">
          {resolvedDescription}
        </Text>
      </div>

      {/* Receipt / Transaction Summary */}
      <div className="py-5 space-y-3 text-xs">
        {(classTitle || payment.className) && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Lớp học:</span>
            <span className="font-bold text-slate-900">{classTitle || payment.className}</span>
          </div>
        )}

        {(campaignTitle || payment.campaignTitle) && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Chiến dịch học bổng:</span>
            <span className="font-bold text-slate-900">
              {campaignTitle || payment.campaignTitle}
            </span>
          </div>
        )}

        {!isTuition && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500"> Chế độ hiển thị nhà tài trợ:</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              {payment.isAnonymous ? (
                <Tag icon={<EyeInvisibleOutlined />} className="m-0 text-[11px]">
                  Nhà tài trợ ẩn danh
                </Tag>
              ) : (
                payment.donorDisplayName || "Công khai"
              )}
            </span>
          </div>
        )}

        {isTuition &&
          typeof payment.tuitionAmount === "number" &&
          typeof payment.scholarshipAmount === "number" &&
          payment.scholarshipAmount > 0 && (
            <>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tổng học phí gốc:</span>
                <span className="font-semibold text-slate-800">
                  {formatVND(payment.tuitionAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Học bổng đồng chi trả:</span>
                <span className="font-bold text-emerald-600">
                  - {formatVND(payment.scholarshipAmount)}
                </span>
              </div>
            </>
          )}

        <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
          <span className="text-slate-500">
            {isTuition ? "Số tiền thanh toán:" : "Số tiền đóng góp:"}
          </span>
          <span className="text-base font-black text-indigo-700" data-testid="payment-result-amount">
            {formatVND(payment.amount || 0)}
          </span>
        </div>

        {payment.orderCode != null && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Mã đơn payOS (orderCode):</span>
            <code className="font-mono font-bold text-slate-800">{payment.orderCode}</code>
          </div>
        )}

        {payment.gatewayReference && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Mã tham chiếu giao dịch:</span>
            <code className="font-mono text-slate-700">{payment.gatewayReference}</code>
          </div>
        )}

        {payment.paidAt && (
          <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Thời gian ghi nhận:</span>
            <span className="font-medium text-slate-800">
              {new Date(payment.paidAt).toLocaleString("vi-VN")}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        {onPrimaryAction && (showClassroomButton || !isTuition || !isReconciliationOrLate) && (
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={onPrimaryAction}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 font-bold text-xs rounded-xl h-10 px-6 border-none"
            data-testid="payment-result-primary-btn"
          >
            {primaryActionLabel ||
              (showClassroomButton
                ? "Vào lớp của tôi"
                : isConfirmedDonation
                ? "Xem lịch sử tài trợ"
                : "Tiếp tục")}
          </Button>
        )}

        {onSecondaryAction && (
          <Button
            size="large"
            icon={<HistoryOutlined />}
            onClick={onSecondaryAction}
            className="w-full sm:w-auto font-semibold text-xs rounded-xl h-10 px-5"
            data-testid="payment-result-secondary-btn"
          >
            {secondaryActionLabel || "Lịch sử giao dịch"}
          </Button>
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-slate-100 text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <SafetyCertificateOutlined className="text-emerald-600" />
        <span>Biên nhận điện tử xác thực từ dữ liệu máy chủ Edunity</span>
      </div>
    </Card>
  );
}

export default PaymentResult;

