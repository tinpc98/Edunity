import {
  DollarCircleOutlined,
  HeartOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Tooltip } from "antd";
import type { FinanceOverviewKpis } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";

interface FinanceKpiGridProps {
  kpis?: FinanceOverviewKpis;
}

export default function FinanceKpiGrid({ kpis }: FinanceKpiGridProps) {
  if (!kpis) return null;

  const cards = [
    {
      key: "tuitionRevenue",
      title: "Doanh thu Học phí",
      tooltip: "Tổng số tiền học phí thực tế đã được xác nhận ghi danh trong kỳ lọc.",
      value: formatVND(kpis.tuitionRevenue.value || "0"),
      icon: <DollarCircleOutlined className="text-[#0D9488]" />,
      badgeBg: "bg-[#CCFBF1]",
      borderCol: "border-[#99F6E4]",
      delta: kpis.tuitionRevenue.hasComparison ? kpis.tuitionRevenue.deltaPercent : null,
      deltaLabel: kpis.tuitionRevenue.trendLabel,
      trendDir: kpis.tuitionRevenue.trendDirection,
      subtext: kpis.tuitionRevenue.subtext || "Khoản thu học phí hợp lệ trong kỳ",
    },
    {
      key: "donationRevenue",
      title: "Quỹ Tài trợ Học bổng",
      tooltip: "Khoản tài trợ từ Mạnh Thường Quân được hạch toán độc lập phục vụ quỹ học bổng.",
      value: formatVND(kpis.donationRevenue.value || "0"),
      icon: <HeartOutlined className="text-[#0F766E]" />,
      badgeBg: "bg-[#E5F5F1]",
      borderCol: "border-[#A7F3D0]",
      delta: kpis.donationRevenue.hasComparison ? kpis.donationRevenue.deltaPercent : null,
      deltaLabel: kpis.donationRevenue.trendLabel,
      trendDir: kpis.donationRevenue.trendDirection,
      subtext: kpis.donationRevenue.subtext || "Nguồn quỹ học bổng độc lập",
    },
    {
      key: "reconciliationPending",
      title: "Khoản cần Đối soát",
      tooltip: "Số tiền giao dịch ngân hàng đang cần kiểm tra bất thường (sai lệch, đến muộn). Tính đến hiện tại.",
      value: formatVND(kpis.reconciliationPending.value || "0"),
      icon: <AuditOutlined className="text-[#D97706]" />,
      badgeBg: "bg-[#FEF3C7]",
      borderCol: "border-[#FDE68A]",
      snapshotNote: "Thời điểm hiện tại",
      subtext: kpis.reconciliationPending.subtext || "Chờ xử lý bất thường",
    },
    {
      key: "refundLiability",
      title: "Nghĩa vụ Hoàn tiền",
      tooltip: "Khoản hoàn tiền phát sinh đang chờ thực hiện hoàn trả cho học viên hoặc MTQ.",
      value: formatVND(kpis.refundLiability.value || "0"),
      icon: <ClockCircleOutlined className="text-[#DC2626]" />,
      badgeBg: "bg-[#FEE2E2]",
      borderCol: "border-[#FECACA]",
      snapshotNote: "Nợ phải hoàn",
      subtext: kpis.refundLiability.subtext || "Đang chờ hoàn tất",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {cards.map((c) => {
        return (
          <div
            key={c.key}
            className={`p-5 rounded-2xl bg-white border ${c.borderCol} shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between`}
          >
            {/* Top row: Title & Icon */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs sm:text-sm font-bold text-[#64748B] truncate">
                  {c.title}
                </span>
                <Tooltip title={c.tooltip}>
                  <InfoCircleOutlined className="text-[#94A3B8] text-xs cursor-pointer hover:text-[#0D9488]" />
                </Tooltip>
              </div>
              <div
                className={`w-9 h-9 rounded-xl ${c.badgeBg} flex items-center justify-center shrink-0 text-lg`}
              >
                {c.icon}
              </div>
            </div>

            {/* Middle row: Big Amount Value */}
            <div className="my-3">
              <div className="text-xl sm:text-2xl font-black text-[#163B40] tracking-tight font-mono truncate">
                {c.value}
              </div>
            </div>

            {/* Bottom row: Delta trend or Snapshot status */}
            <div className="pt-2.5 border-t border-[#F0F8F6] flex flex-col gap-1">
              {c.delta !== undefined && c.delta !== null ? (
                <div className="flex items-center gap-1 text-xs font-bold">
                  {c.trendDir === "up" ? (
                    <span className="inline-flex items-center gap-1 text-[#15803D]">
                      <ArrowUpOutlined className="text-[10px]" />
                      <span>{c.deltaLabel}</span>
                    </span>
                  ) : c.trendDir === "down" ? (
                    <span className="inline-flex items-center gap-1 text-[#DC2626]">
                      <ArrowDownOutlined className="text-[10px]" />
                      <span>{c.deltaLabel}</span>
                    </span>
                  ) : (
                    <span className="text-[#64748B]">{c.deltaLabel}</span>
                  )}
                </div>
              ) : c.deltaLabel ? (
                <span className="text-xs text-[#64748B] italic">
                  {c.deltaLabel}
                </span>
              ) : (
                <span className="text-xs font-semibold text-[#0F766E] bg-[#F0F8F6] px-2 py-0.5 rounded-md w-fit">
                  {c.snapshotNote}
                </span>
              )}
              <span className="text-xs text-[#94A3B8] truncate">
                {c.subtext}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
