import { AuditOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { ReconciliationDistributionItem } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";
import { ROUTES } from "../../../../routes/routePaths";

interface ReconciliationStatusChartProps {
  distribution?: ReconciliationDistributionItem[];
  totalOpen?: number;
}

export default function ReconciliationStatusChart({
  distribution = [],
  totalOpen = 0,
}: ReconciliationStatusChartProps) {
  const totalCount = distribution.reduce((acc, curr) => acc + curr.count, 0) || 0;

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488]">
              <AuditOutlined />
            </span>
            <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
              Tình trạng đối soát
            </span>
          </div>
          <Link
            to={ROUTES.ADMIN.RECONCILIATIONS}
            className="text-xs font-bold text-[#0F766E] hover:text-[#0D9488] inline-flex items-center gap-1"
          >
            <span>Mở hàng đợi</span>
            <ArrowRightOutlined className="text-[10px]" />
          </Link>
        </div>
        <span className="text-xs text-[#64748B] block">
          Tiến độ rà soát {totalCount} sự vụ phát sinh trong hệ thống
        </span>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="my-4">
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
          {distribution.map((item) => {
            if (item.count === 0) return null;
            return (
              <div
                key={item.key}
                className="h-full transition-all duration-300"
                style={{
                  width: `${item.percent}%`,
                  backgroundColor: item.color,
                }}
                title={`${item.label}: ${item.count} sự vụ (${item.percent}%)`}
              />
            );
          })}
        </div>

        {totalOpen > 0 && (
          <div className="mt-2 text-xs font-bold text-[#DC2626] bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />
            <span>Có {totalOpen} sự vụ đang cần Admin xử lý</span>
          </div>
        )}
      </div>

      {/* Status Distribution List */}
      <div className="space-y-2 pt-3 border-t border-[#F0F8F6] text-xs">
        {distribution.map((item) => {
          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-0.5 hover:bg-[#F8FAFC] px-1.5 rounded transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold text-[#163B40]">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-[#163B40]">{item.count}</span>
                <span className="text-[#64748B] text-[11px]">({item.percent}%)</span>
                {item.amount > 0 && (
                  <span className="text-[11px] text-[#0F766E] font-medium hidden sm:inline">
                    [{formatVND(item.amount)}]
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
