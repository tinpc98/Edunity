import { apiClient } from "../api/apiClient";
import type {
  CreateContributionResponse,
  SponsorContributionsResponse,
  CampaignImpactResponse,
  ApiSponsorContribution,
} from "../types/campaign";
import {
  adaptContributions,
  adaptCampaignImpact,
} from "../api/campaignAdapters";

export const contributionKeys = {
  all: ["contributions"] as const,
  myList: (params?: Record<string, any>) => ["contributions", "myList", params] as const,
  impact: (campaignId: string) => ["contributions", "impact", campaignId] as const,
};

export const sponsorContributionService = {
  /**
   * Sponsor: Create a new contribution intent for an open campaign.
   * POST /api/campaigns/:id/contributions
   * Body: { amount: number }
   * Returns: PENDING contribution with gatewayReference
   */
  async createContribution(
    campaignId: string,
    payload: { amount: number }
  ): Promise<CreateContributionResponse> {
    const data = await apiClient<{
      contributionId: string;
      campaignId: string;
      amount: number | string | { $numberDecimal?: string };
      contributionStatus: "PENDING" | "COMPLETED" | "FAILED";
      gateway: string;
      gatewayReference: string;
    }>(`/campaigns/${campaignId}/contributions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const amountNum =
      typeof data.amount === "number"
        ? data.amount
        : typeof data.amount === "string"
        ? parseFloat(data.amount) || 0
        : data.amount?.$numberDecimal
        ? parseFloat(data.amount.$numberDecimal) || 0
        : 0;

    return {
      contributionId: data.contributionId,
      campaignId: data.campaignId,
      amount: amountNum,
      contributionStatus: data.contributionStatus,
      gateway: data.gateway,
      gatewayReference: data.gatewayReference,
    };
  },

  /**
   * Sponsor: Get authenticated sponsor's contribution history and total contributed.
   * GET /api/sponsor/contributions?page=...&pageSize=...&status=...
   */
  async getMyContributions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    campaignId?: string;
  }): Promise<SponsorContributionsResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.status) query.set("status", params.status);
    if (params?.campaignId) query.set("campaignId", params.campaignId);

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiSponsorContribution[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      totalContributed?: number | string | { $numberDecimal?: string };
    }>(`/sponsor/contributions${qs ? `?${qs}` : ""}`);

    const totalContributedNum =
      typeof data.totalContributed === "number"
        ? data.totalContributed
        : typeof data.totalContributed === "string"
        ? parseFloat(data.totalContributed) || 0
        : data.totalContributed?.$numberDecimal
        ? parseFloat(data.totalContributed.$numberDecimal) || 0
        : 0;

    return {
      items: adaptContributions(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
      totalContributed: totalContributedNum,
    };
  },

  /**
   * Sponsor: Get impact report of a campaign the sponsor has funded.
   * GET /api/sponsor/campaigns/:id/impact
   */
  async getCampaignImpact(campaignId: string): Promise<CampaignImpactResponse> {
    const data = await apiClient<any>(`/sponsor/campaigns/${campaignId}/impact`);
    return adaptCampaignImpact(data);
  },

  /**
   * Sandbox only: Simulate gateway webhook to confirm or fail a contribution.
   * POST /api/payments/sandbox/webhook
   * Body: { gatewayReference, status: "SUCCESS" | "FAILED" }
   */
  async triggerSandboxWebhook(
    gatewayReference: string,
    status: "SUCCESS" | "FAILED"
  ): Promise<{
    contributionStatus: "COMPLETED" | "FAILED";
    result: string;
  }> {
    const data = await apiClient<{
      contributionStatus: "COMPLETED" | "FAILED";
      result: string;
    }>(`/payments/sandbox/webhook`, {
      method: "POST",
      body: JSON.stringify({ gatewayReference, status }),
    });
    return data;
  },
};
