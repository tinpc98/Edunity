import type { ScholarshipCampaign } from "../types/campaign";

/**
 * Application window of a campaign, derived the same way as the backend
 * (campaignService.isAcceptingApplications): status OPEN_FOR_FUNDING + applicationStart/End.
 */
export type ApplicationPhase = "UPCOMING" | "OPEN" | "ENDED" | "CLOSED";

export const APPLICATION_PHASE_LABELS: Record<ApplicationPhase, string> = {
  UPCOMING: "Sắp mở nhận hồ sơ",
  OPEN: "Đang nhận hồ sơ",
  ENDED: "Hết hạn nhận hồ sơ",
  CLOSED: "Đã đóng",
};

export const APPLICATION_PHASE_COLORS: Record<ApplicationPhase, string> = {
  UPCOMING: "blue",
  OPEN: "green",
  ENDED: "default",
  CLOSED: "red",
};

export function getApplicationPhase(campaign: ScholarshipCampaign, now: Date = new Date()): ApplicationPhase {
  if (campaign.status === "CLOSED") return "CLOSED";
  if (campaign.isAcceptingApplications) return "OPEN";
  if (campaign.applicationStart && new Date(campaign.applicationStart) > now) return "UPCOMING";
  return "ENDED";
}

/** Whole days left until `date` (0 on the last day), or null when there is no date. */
export function daysUntil(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export function formatDateVN(date: string | null | undefined): string {
  if (!date) return "Chưa xác định";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "Chưa xác định" : d.toLocaleDateString("vi-VN");
}

/** 3.200.000.000 → "3,2 Tỷ", 2.000.000 → "2 Tr". */
export function formatCompactVND(amount: number): string {
  const format = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (amount >= 1_000_000_000) return `${format(amount / 1_000_000_000)} Tỷ`;
  if (amount >= 1_000_000) return `${format(amount / 1_000_000)} Tr`;
  return `${amount.toLocaleString("vi-VN")} đ`;
}
