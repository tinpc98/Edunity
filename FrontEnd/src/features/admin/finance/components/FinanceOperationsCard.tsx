import {
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WalletOutlined,
  ArrowRightOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { FinanceOperationsSummary } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";
import { ROUTES } from "../../../../routes/routePaths";

interface FinanceOperationsCardProps {
  operations?: FinanceOperationsSummary;
  teacherEarnings?: {
    pending: string;
    available: string;
    paidOut: string;
  };
}

export default function FinanceOperationsCard({
  operations,
  teacherEarnings,
}: FinanceOperationsCardProps) {
  const syncStatus = operations?.syncStatus || "Đang hoạt động";
  const syncStatusType = operations?.syncStatusType || "success";

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-base">
              <SyncOutlined spin={operations?.isRunning} />
            </span>
            <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
              Vận hành & Thù lao giáo viên
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              syncStatusType === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : syncStatusType === "error"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncStatusType === "success"
                  ? "bg-[#15803D] animate-pulse"
                  : syncStatusType === "error"
                  ? "bg-[#DC2626] animate-pulse"
                  : "bg-slate-400"
              }`}
            />
            <span>{syncStatus}</span>
          </span>
        </div>
        <span className="text-xs text-[#64748B] block mt-0.5">
          Tiến trình hạch toán tự động và nghĩa vụ thù lao giảng viên
        </span>
      </div>

      {/* Sổ cái thù lao giáo viên — Khối phụ tinh gọn */}
      <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] space-y-2.5 my-3">
        <div className="flex items-center justify-between text-xs font-bold text-[#163B40]">
          <span className="flex items-center gap-1.5">
            <WalletOutlined className="text-[#0D9488]" />
            <span>Sổ cái thù lao giáo viên</span>
          </span>
          <Link
            to={ROUTES.ADMIN.PAYOUTS}
            className="text-[11px] text-[#0F766E] hover:underline inline-flex items-center gap-0.5 font-bold"
          >
            <span>Xem rút tiền</span>
            <ArrowRightOutlined className="text-[9px]" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-[#D6E5E2]/70">
          <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
            <span className="text-[10px] font-medium text-[#64748B] block">Tạm giữ</span>
            <span className="text-xs font-black text-[#D97706] font-mono truncate block mt-0.5">
              {formatVND(teacherEarnings?.pending || "0")}
            </span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
            <span className="text-[10px] font-medium text-[#64748B] block">Khả dụng</span>
            <span className="text-xs font-black text-[#15803D] font-mono truncate block mt-0.5">
              {formatVND(teacherEarnings?.available || "0")}
            </span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
            <span className="text-[10px] font-medium text-[#64748B] block">Đã chi</span>
            <span className="text-xs font-black text-[#163B40] font-mono truncate block mt-0.5">
              {formatVND(teacherEarnings?.paidOut || "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Operational Metrics List */}
      <div className="space-y-2 mb-3 text-xs">
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="flex items-center gap-1.5 text-[#163B40] font-medium">
            <CheckCircleOutlined className="text-[#0D9488]" />
            <span>Giao dịch ngân hàng đã xử lý:</span>
          </span>
          <span className="font-bold font-mono text-[#0F766E]">
            {operations?.processedCount || 0}
          </span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="flex items-center gap-1.5 text-[#64748B] font-medium">
            <SyncOutlined className="text-[#64748B]" />
            <span>Hàng đợi chờ hạch toán:</span>
          </span>
          <span className="font-bold font-mono text-[#163B40]">
            {operations?.pendingCount || 0} sự kiện
          </span>
        </div>

        {operations && operations.attentionCount > 0 ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
            <span className="flex items-center gap-1.5 text-[#DC2626] font-medium">
              <ExclamationCircleOutlined className="text-[#DC2626]" />
              <span>Sự kiện lỗi cần kiểm tra:</span>
            </span>
            <span className="font-extrabold font-mono text-[#DC2626]">
              {operations.attentionCount} sự kiện
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="flex items-center gap-1.5 text-[#64748B] font-medium">
              <CheckCircleOutlined className="text-[#15803D]" />
              <span>Sự kiện lỗi cần kiểm tra:</span>
            </span>
            <span className="font-bold text-[#15803D]">0 sự kiện</span>
          </div>
        )}
      </div>

      {/* Bottom Link */}
      <div className="pt-2.5 border-t border-[#F0F8F6] flex items-center justify-between text-xs">
        <Link
          to={ROUTES.ADMIN.BANK_EVENTS}
          className="font-bold text-[#64748B] hover:text-[#0F766E] inline-flex items-center gap-1"
        >
          <BankOutlined />
          <span>Theo dõi cổng thanh toán & ngân hàng</span>
          <ArrowRightOutlined className="text-[10px]" />
        </Link>
      </div>
    </div>
  );
}
