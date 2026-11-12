import { SafetyCertificateOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { PaymentPurpose } from "../../types/payment";

export interface PaymentInstructionsProps {
  purpose?: PaymentPurpose;
}

export function PaymentInstructions({ purpose = "TUITION" }: PaymentInstructionsProps) {
  const purposeLabel = purpose === "DONATION" ? "khoản tài trợ học bổng" : "học phí lớp học";

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5 text-xs text-slate-600"
      data-testid="payment-instructions"
    >
      <div className="font-bold text-slate-800 flex items-center gap-1.5 text-[13px]">
        <InfoCircleOutlined className="text-indigo-600" />
        Hướng dẫn chuyển khoản VietQR an toàn
      </div>
      <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
        <li>
          Mở ứng dụng <strong>Ngân hàng</strong> hoặc <strong>Ví điện tử hỗ trợ VietQR / Napas247</strong> trên điện thoại.
        </li>
        <li>
          Chọn tính năng <strong>Quét mã QR</strong> và quét mã VietQR hiển thị trên màn hình (hoặc mở trang thanh toán payOS).
        </li>
        <li>
          Kiểm tra đúng <strong>số tiền</strong> và <strong>giữ nguyên nội dung chuyển khoản</strong> để hệ thống tự động đối khớp {purposeLabel}.
        </li>
        <li>
          Sau khi hoàn tất chuyển khoản, vui lòng <strong>giữ nguyên màn hình trong vài giây</strong> — hệ thống tự động kiểm tra và cập nhật trạng thái khoảng 3 giây/lần. Không chuyển khoản lặp lại lần 2 khi giao dịch đang được xác minh.
        </li>
      </ol>
      <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-500 border-t border-slate-200/60">
        <SafetyCertificateOutlined className="text-emerald-600 shrink-0" />
        <span>
          Trạng thái chỉ được xác nhận khi hệ thống nhận thông báo xác thực từ cổng thanh toán ngân hàng.
        </span>
      </div>
    </div>
  );
}

export default PaymentInstructions;

