import type { ReactNode } from "react";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";

export interface AdminKpiCardProps {
  title: string;
  value: string | number;
  suffix?: string;
  icon: ReactNode;
  trend?: string;
  trendDirection?: "up" | "down" | "neutral";
  trendSubtext?: string;
  detail?: string;
  variant?: "teal" | "mint" | "amber" | "rose" | "sky" | "indigo";
  onClick?: () => void;
}

const variantStyles: Record<
  string,
  { iconBg: string; iconColor: string; pillBg: string; pillColor: string }
> = {
  teal: {
    iconBg: "bg-[#E5F5F1] border border-[#99F6E4]",
    iconColor: "text-[#0F766E]",
    pillBg: "bg-[#CCFBF1]",
    pillColor: "text-[#0F766E]",
  },
  mint: {
    iconBg: "bg-[#DCFCE7] border border-[#86EFAC]",
    iconColor: "text-[#15803D]",
    pillBg: "bg-[#DCFCE7]",
    pillColor: "text-[#15803D]",
  },
  amber: {
    iconBg: "bg-[#FEF3C7] border border-[#FDE68A]",
    iconColor: "text-[#B45309]",
    pillBg: "bg-[#FEF3C7]",
    pillColor: "text-[#B45309]",
  },
  rose: {
    iconBg: "bg-[#FEE2E2] border border-[#FECACA]",
    iconColor: "text-[#DC2626]",
    pillBg: "bg-[#FEE2E2]",
    pillColor: "text-[#DC2626]",
  },
  sky: {
    iconBg: "bg-[#E0F2FE] border border-[#BAE6FD]",
    iconColor: "text-[#0284C7]",
    pillBg: "bg-[#E0F2FE]",
    pillColor: "text-[#0284C7]",
  },
  indigo: {
    iconBg: "bg-[#EEF2FF] border border-[#C7D2FE]",
    iconColor: "text-[#4338CA]",
    pillBg: "bg-[#EEF2FF]",
    pillColor: "text-[#4338CA]",
  },
};

export default function AdminKpiCard({
  title,
  value,
  suffix,
  icon,
  trend,
  trendDirection,
  trendSubtext,
  detail,
  variant = "teal",
  onClick,
}: AdminKpiCardProps) {
  const styles = variantStyles[variant] || variantStyles.teal;

  const isUp = trendDirection === "up" || (trend && trend.includes("+"));
  const isDown = trendDirection === "down" || (trend && trend.includes("-"));

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white p-5 border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.06)] hover:shadow-md transition-all duration-300 flex flex-col justify-between group ${
        onClick ? "cursor-pointer hover:border-teal-500" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            {title}
          </span>
          <div
            className={`w-11 h-11 rounded-xl ${styles.iconBg} ${styles.iconColor} flex items-center justify-center text-xl group-hover:scale-105 transition-transform shadow-2xs`}
          >
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-1 my-1">
          <span className="text-2xl sm:text-[28px] font-extrabold text-[#163B40] tracking-tight leading-none">
            {value}
          </span>
          {suffix && <span className="text-base font-bold text-[#0D9488]">{suffix}</span>}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[#D6E5E2] flex flex-wrap items-center gap-2">
        {trend && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              isUp
                ? "bg-[#DCFCE7] text-[#15803D]"
                : isDown
                ? "bg-[#FEE2E2] text-[#DC2626]"
                : `${styles.pillBg} ${styles.pillColor}`
            }`}
          >
            {isUp && <ArrowUpOutlined className="text-[10px]" />}
            {isDown && <ArrowDownOutlined className="text-[10px]" />}
            {trend}
          </span>
        )}
        {trendSubtext && (
          <span className="text-xs text-[#64748B] font-medium">{trendSubtext}</span>
        )}
        {detail && !trendSubtext && (
          <span className="text-xs text-[#64748B] font-medium truncate">{detail}</span>
        )}
      </div>
    </div>
  );
}
