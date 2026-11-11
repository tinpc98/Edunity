import { apiClient } from "../api/apiClient";
import type {
  CreateContributionPayload,
  CreateContributionResponse,
  SponsorContributionsResponse,
  CampaignImpactResponse,
} from "../types/campaign";
import {
  adaptContributions,
  adaptCampaignImpact,
} from "../api/campaignAdapters";

export const sponsorContributionKeys = {
  all: ["sponsor-contributions"] as const,
  myList: (params?: { status?: string; campaignId?: string; page?: number; pageSize?: number }) =>
    ["sponsor-contributions", "myList", params] as const,
  impact: (campaignId: string) => ["sponsor-contributions", "impact", campaignId] as const,
};

export const contributionKeys = sponsorContributionKeys;

function parseDecimal(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  if (val && typeof val === "object" && val.$numberDecimal) {
    return parseFloat(val.$numberDecimal) || 0;
  }
  return 0;
}

export const sponsorContributionService = {
  /**
   * Sponsor: Create a PENDING contribution intent via Unified Payment Engine (DONATION channel).
   * POST /api/campaigns/:id/contributions
   */
  async createContribution(
    campaignId: string,
    payload: CreateContributionPayload
  ): Promise<CreateContributionResponse> {
    const raw = await apiClient<any>(`/campaigns/${campaignId}/contributions`, {
      method: "POST",
      body: JSON.stringify({
        amount: payload.amount,
        isAnonymous: Boolean(payload.isAnonymous),
        ...(payload.donorDisplayName ? { donorDisplayName: payload.donorDisplayName } : {}),
      }),
    });

    const contributionId = String(raw.contributionId || raw.paymentId || raw._id || "");
    const paymentId = String(raw.paymentId || contributionId);

    return {
      paymentId,
      contributionId,
      campaignId: String(raw.campaignId || campaignId),
      campaignTitle: raw.campaignTitle || null,
      campaignStatus: raw.campaignStatus || null,
      purpose: "DONATION",
      channelKey: "DONATION",
      provider: raw.provider || (raw.gateway === "PAYOS" ? "PAYOS" : "SANDBOX"),
      amount: parseDecimal(raw.amount),
      currency: raw.currency || "VND",
      contributionStatus: raw.contributionStatus || "PENDING",
      paymentStatus: raw.paymentStatus || raw.contributionStatus || "PENDING",
      gateway: raw.gateway || "SANDBOX",
      gatewayReference: raw.gatewayReference || raw.paymentReference || "",
      orderCode: typeof raw.orderCode === "number" ? raw.orderCode : null,
      paymentLinkId: raw.paymentLinkId || null,
      qrCode: raw.qrCode || null,
      checkoutUrl: raw.checkoutUrl || null,
      expiredAt: raw.expiredAt || null,
      remainingSeconds:
        typeof raw.remainingSeconds === "number" ? Math.max(0, raw.remainingSeconds) : 900,
      isAnonymous: Boolean(raw.isAnonymous),
      donorDisplayName: raw.donorDisplayName || (raw.isAnonymous ? "Nhà tài trợ ẩn danh" : null),
    };
  },

  /**
   * Sponsor: List own contributions with optional status/campaign filter and totalContributed summary.
   * GET /api/sponsor/contributions
   */
  async getMyContributions(params?: {
    status?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SponsorContributionsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.campaignId) query.set("campaignId", params.campaignId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const qs = query.toString();
    const raw = await apiClient<any>(`/sponsor/contributions${qs ? `?${qs}` : ""}`);

    return {
      items: adaptContributions(raw.items || []),
      total: raw.total || 0,
      page: raw.page || 1,
      pageSize: raw.pageSize || 20,
      totalPages: raw.totalPages || 0,
      totalContributed: parseDecimal(raw.totalContributed),
    };
  },

  /**
   * Sponsor: Get aggregated impact report for a campaign the sponsor has contributed to (FR-SPO-07..10).
   * GET /api/sponsor/campaigns/:id/impact
   */
  async getCampaignImpact(campaignId: string): Promise<CampaignImpactResponse> {
    const raw = await apiClient<any>(`/sponsor/campaigns/${campaignId}/impact`);
    return adaptCampaignImpact(raw);
  },

  /**
   * Simulate Sandbox Webhook for DONATION in DEV/TEST only.
   */
  async triggerSandboxWebhook(
    gatewayReference: string,
    status: "SUCCESS" | "FAILED"
  ): Promise<{ contributionStatus?: string; result?: string }> {
    return apiClient<{ contributionStatus?: string; result?: string }>(
      "/payments/sandbox/webhook",
      {
        method: "POST",
        body: JSON.stringify({ gatewayReference, status }),
      }
    );
  },
};
