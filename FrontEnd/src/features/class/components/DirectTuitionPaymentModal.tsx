import { useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Button, Alert, Tooltip, message } from "antd";
import {
  CopyOutlined,
  CheckCircleOutlined,
  BankOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import type { CreatePaymentResponse } from "../../../types/payment";
import { formatVND } from "../../../types/payment";
import { PaymentQrPanel } from "../../../components/payment/PaymentQrPanel";
import { usePaymentPolling, derivePaymentUiState } from "../../../hooks/usePaymentPolling";
import { enrollmentKeys } from "../../../services/enrollment.service";
import { classKeys } from "../../../services/class.service";
import { paymentKeys } from "../../../services/gatewayPayment.service";
import { sessionKeys } from "../../../services/session.service";
import { ROUTES } from "../../../routes/routePaths";

interface DirectTuitionPaymentModalProps {
  open: boolean;
  onClose: () => void;
  item: ClassDiscoveryItem;
  paymentIntent: CreatePaymentResponse | null;
  onSuccess?: () => void;
}

export default function DirectTuitionPaymentModal({
  open,
  onClose,
  item,
  paymentIntent,
  onSuccess,
}: DirectTuitionPaymentModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const activePaymentId = paymentIntent?.paymentId || null;

  // Poll payment status every 3s in background
  const {
    payment: polledPayment,
    uiState: polledUiState,
    isPolling,
    refetch: refetchPayment,
  } = usePaymentPolling({
    paymentId: activePaymentId,
    enabled: open && Boolean(activePaymentId),
  });

  // Effective UI state
  const effectiveUiState = useMemo(() => {
    if (polledPayment) return polledUiState;
    if (paymentIntent) return derivePaymentUiState(paymentIntent as any, false);
    return "PENDING";
  }, [polledPayment, polledUiState, paymentIntent]);

  const isCompleted = effectiveUiState === "COMPLETED";

  // Merge payment details
  const activePayment = useMemo(() => {
    if (polledPayment) {
      return {
        ...paymentIntent,
        ...polledPayment,
        qrCode: polledPayment.qrCode || paymentIntent?.qrCode || null,
        checkoutUrl: polledPayment.checkoutUrl || paymentIntent?.checkoutUrl || null,
        orderCode: polledPayment.orderCode ?? paymentIntent?.orderCode ?? null,
      };
    }
    return paymentIntent;
  }, [paymentIntent, polledPayment]);

  const targetClassRoute = useMemo(() => {
    return ROUTES.STUDENT.CLASS_SESSIONS.replace(":classId", item.id);
  }, [item.id]);

  // When payment succeeds, refresh all relevant caches and auto-redirect to registered class
  useEffect(() => {
    if (isCompleted) {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: ["classDetail", item.id] });
      queryClient.invalidateQueries({ queryKey: ["classDiscovery"] });
      onSuccess?.();

      const timer = setTimeout(() => {
        onClose();
        navigate(targetClassRoute);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isCompleted, queryClient, item.id, onSuccess, onClose, navigate, targetClassRoute]);

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

  const amount = activePayment?.amount || item.price;
  const orderCode = activePayment?.orderCode;
  const transferContent = orderCode ? `EDUNITY HP ${orderCode}` : "";
  const metadata = activePayment?.providerMetadata;
  const bankName =
    metadata?.bin === "970422" || !metadata?.bin
      ? "MBBank (Ngân hàng TMCP Quân Đội)"
      : `Ngân hàng (BIN: ${metadata.bin})`;
  const accountNumber = metadata?.accountNumber || null;
  const accountName = metadata?.accountName || "CỔNG THANH TOÁN PAYOS / EDUNITY";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={500}
      destroyOnClose={false}
      title={
        <div className="pb-2 border-b border-slate-100 pr-6">
          <h3 className="font-extrabold text-slate-900 text-base m-0">Thanh toán học phí</h3>
          <p className="text-xs text-slate-500 m-0 mt-0.5">
            Quét mã QR bằng ứng dụng ngân hàng để hoàn tất đăng ký lớp học.
          </p>
        </div>
      }
    >
      <div className="pt-3 space-y-4 max-h-[85vh] overflow-y-auto pr-0.5">
        {/* Class Overview Banner */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lớp học</div>
            <div className="font-bold text-slate-900 text-sm mt-0.5">{item.className || item.title}</div>
            <div className="text-slate-500 mt-0.5">Giáo viên: {item.teacherName}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Học phí</div>
            <div className="font-black text-[#0D9488] text-base mt-0.5">{formatVND(amount)}</div>
          </div>
        </div>

        {/* Success State */}
        {isCompleted ? (
          <div className="space-y-4 py-4 text-center">
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined className="text-emerald-600 text-xl" />}
              message={<span className="font-bold text-base text-emerald-900">Thanh toán thành công!</span>}
              description={
                <div className="text-xs text-emerald-800 space-y-1.5 mt-2">
                  <p>Hệ thống đã nhận được học phí và xác nhận ghi danh lớp học cho bạn.</p>
                  <p className="font-semibold text-emerald-700">Đang tự động chuyển đến lớp học...</p>
                </div>
              }
              className="rounded-xl border-emerald-200 bg-emerald-50/80 text-left"
            />

            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={() => {
                onClose();
                navigate(targetClassRoute);
              }}
              className="w-full h-11 rounded-xl font-bold text-sm bg-[#0D9488] hover:bg-[#0B746C] border-none shadow-xs"
            >
              Vào lớp học của tôi ngay
            </Button>
          </div>
        ) : (
          <>
            {/* Primary QR Panel (Clean minimal mode: no channel badges, no external buttons, no visible polling row) */}
            <PaymentQrPanel
              minimal={true}
              purpose="TUITION"
              uiState={effectiveUiState}
              amount={amount}
              tuitionAmount={item.price}
              qrCode={activePayment?.qrCode}
              checkoutUrl={activePayment?.checkoutUrl}
              orderCode={orderCode}
              gatewayReference={activePayment?.gatewayReference}
              provider={activePayment?.provider || "PAYOS"}
              gateway={activePayment?.gateway || "PAYOS"}
              expiredAt={activePayment?.expiredAt || activePayment?.holdExpiresAt}
              isPolling={isPolling}
              onManualRefresh={refetchPayment}
            />

            {/* Bank Transfer Information */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200 text-slate-800 font-bold text-xs">
                <BankOutlined className="text-[#0D9488]" />
                <span>Thông tin chuyển khoản ngân hàng</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-medium">Ngân hàng nhận</div>
                  <div className="font-semibold text-slate-800 mt-0.5 truncate">{bankName}</div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div className="overflow-hidden">
                    <div className="text-[10px] text-slate-400 font-medium">Số tài khoản</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5 truncate">
                      {accountNumber || "Quét QR để lấy STK"}
                    </div>
                  </div>
                  {accountNumber && (
                    <Tooltip title="Sao chép số tài khoản">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(accountNumber, "số tài khoản")}
                        className="text-slate-500 hover:text-[#0D9488]"
                      />
                    </Tooltip>
                  )}
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-medium">Người thụ hưởng</div>
                  <div className="font-semibold text-slate-900 mt-0.5 uppercase truncate">
                    {accountName}
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium">Số tiền</div>
                    <div className="font-bold text-[#0D9488] mt-0.5">{formatVND(amount)}</div>
                  </div>
                  <Tooltip title="Sao chép số tiền">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(String(amount), "số tiền")}
                      className="text-slate-500 hover:text-[#0D9488]"
                    />
                  </Tooltip>
                </div>
              </div>

              {transferContent && (
                <div className="bg-teal-50/60 border border-teal-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div className="overflow-hidden">
                    <div className="text-[10px] font-bold text-teal-800">
                      Nội dung chuyển khoản (bắt buộc chính xác):
                    </div>
                    <div className="font-mono font-black text-xs text-teal-950 mt-0.5">
                      {transferContent}
                    </div>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopy(transferContent, "nội dung chuyển khoản")}
                    className="bg-[#0D9488] hover:bg-[#0B746C] border-none font-semibold text-xs shrink-0"
                  >
                    Sao chép
                  </Button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-1 text-center text-[11px] text-slate-500">
              Vui lòng chuyển đúng số tiền và nội dung để hệ thống xác nhận.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
