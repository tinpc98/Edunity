import type { ReactNode } from "react";

export type AdminBadgeType =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "teal"
  | "purple"
  | "neutral";

interface AdminStatusBadgeProps {
  label: string;
  type?: AdminBadgeType;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
}

const badgeStyles: Record<AdminBadgeType, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-[#DCFCE7] border-[#BBF7D0]",
    text: "text-[#15803D]",
    dot: "bg-[#16A34A]",
  },
  warning: {
    bg: "bg-[#FEF3C7] border-[#FDE68A]",
    text: "text-[#B45309]",
    dot: "bg-[#D97706]",
  },
  error: {
    bg: "bg-[#FEE2E2] border-[#FECACA]",
    text: "text-[#DC2626]",
    dot: "bg-[#EF4444]",
  },
  info: {
    bg: "bg-[#E0F2FE] border-[#BAE6FD]",
    text: "text-[#0284C7]",
    dot: "bg-[#0EA5E9]",
  },
  teal: {
    bg: "bg-[#CCFBF1] border-[#99F6E4]",
    text: "text-[#0F766E]",
    dot: "bg-[#0D9488]",
  },
  purple: {
    bg: "bg-[#F3E8FF] border-[#E9D5FF]",
    text: "text-[#7E22CE]",
    dot: "bg-[#9333EA]",
  },
  neutral: {
    bg: "bg-[#F1F5F9] border-[#CBD5E1]",
    text: "text-[#334155]",
    dot: "bg-[#64748B]",
  },
};

export default function AdminStatusBadge({
  label,
  type = "neutral",
  icon,
  pulse = false,
  className = "",
}: AdminStatusBadgeProps) {
  const style = badgeStyles[type] || badgeStyles.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold tracking-wide ${style.bg} ${style.text} ${className}`}
    >
      {pulse ? (
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
      ) : icon ? (
        <span className="text-[12px]">{icon}</span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}
