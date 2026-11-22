import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RollbackOutlined,
  PieChartOutlined,
} from "@ant-design/icons";
import type { TransactionStatusItem } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";

interface TransactionStatusChartProps {
  distribution?: TransactionStatusItem[];
}

export default function TransactionStatusChart({
  distribution = [],
}: TransactionStatusChartProps) {
  const totalCount = distribution.reduce((sum, item) => sum + item.count, 0);
  const hasData = totalCount > 0;

  const getIcon = (key: string) => {
    switch (key) {
      case "completed":
        return <CheckCircleOutlined className="text-[#0D9488]" />;
      case "pending":
        return <ClockCircleOutlined className="text-[#D97706]" />;
      case "reconciliation":
        return <ExclamationCircleOutlined className="text-[#DC2626]" />;
      case "refund":
        return <RollbackOutlined className="text-[#7C3AED]" />;
      default:
        return <CheckCircleOutlined className="text-[#0D9488]" />;
    }
  };

  const getBgClass = (key: string) => {
    switch (key) {
      case "completed":
        return "bg-[#F0F8F6] border-[#CCFBF1]";
      case "pending":
        return "bg-[#FEF3C7]/40 border-[#FDE68A]";
      case "reconciliation":
        return "bg-[#FEE2E2]/40 border-[#FECACA]";
      case "refund":
        return "bg-[#F3E8FF]/40 border-[#E9D5FF]";
      default:
        return "bg-[#F8FAFC] border-[#E2E8F0]";
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-base">
              <PieChartOutlined />
            </span>
            <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
              Phân loại giao dịch trong kỳ
            </span>
          </div>
          {hasData && (
            <span className="text-xs font-bold text-[#0F766E] bg-[#CCFBF1] px-2.5 py-0.5 rounded-lg border border-[#99F6E4] font-mono">
              {totalCount} giao dịch
            </span>
          )}
        </div>
        <span className="text-xs text-[#64748B] block mt-0.5">
          Tình hình vận hành và phân bổ trạng thái các giao dịch tài chính
        </span>
      </div>

      {/* Multi-segment proportional bar */}
      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center rounded-2xl bg-[#F8FAFC] border border-dashed border-[#D6E5E2] text-center p-6 my-3">
          <div className="w-12 h-12 rounded-2xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-2xl mb-3 shadow-2xs">
            <PieChartOutlined />
          </div>
          <span className="font-extrabold text-sm text-[#163B40]">
            Chưa có dữ liệu trong khoảng thời gian đã chọn
          </span>
          <span className="text-xs text-[#64748B] mt-1 max-w-xs">
            Không có giao dịch tài chính phát sinh. Thử chọn 30 ngày để xem các giao dịch trước đó.
          </span>
        </div>
      ) : (
        <div className="my-4 space-y-4">
          {/* Proportional visual bar */}
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
            {distribution.map((item) => {
              if (item.count === 0) return null;
              return (
                <div
                  key={item.key}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(item.percent, 3)}%`,
                    backgroundColor: item.color,
                  }}
                  title={`${item.label}: ${item.count} (${item.percent}%)`}
                />
              );
            })}
          </div>

          {/* 4 Status Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {distribution.map((item) => {
              return (
                <div
                  key={item.key}
                  className={`p-3 rounded-xl border ${getBgClass(item.key)} transition-all flex flex-col justify-between`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">{getIcon(item.key)}</span>
                      <span className="text-xs font-bold text-[#163B40] truncate">
                        {item.label}
                      </span>
                    </div>
                    <span
                      className="text-xs font-extrabold px-1.5 py-0.2 rounded-md font-mono"
                      style={{ color: item.color }}
                    >
                      {item.percent}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="text-base font-black text-[#163B40] font-mono">
                      {item.count}{" "}
                      <span className="text-[11px] font-semibold text-[#64748B]">
                        GD
                      </span>
                    </span>
                    <span className="text-[11px] font-bold text-[#64748B] font-mono">
                      {formatVND(item.amount)}
                    </span>
                  </div>

                  <span className="text-[10px] text-[#94A3B8] mt-1 truncate">
                    {item.subtext}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Insight */}
      <div className="pt-3 border-t border-[#F0F8F6] flex items-center justify-between text-xs text-[#64748B]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
          <span>Xanh ngọc: Giao dịch ổn định</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
          <span>Đỏ/Tím: Cần kiểm tra xử lý</span>
        </span>
      </div>
    </div>
  );
}
