import { apiClient } from "../api/apiClient";
import type {
  ScholarshipCampaign,
  ApiScholarshipCampaign,
  ScholarshipCampaignChecklist,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  SponsorContribution,
  ApiSponsorContribution,
} from "../types/campaign";
import {
  adaptCampaign,
  adaptCampaigns,
  adaptContributions,
} from "../api/campaignAdapters";

export const campaignKeys = {
  all: ["campaigns"] as const,
  list: (params?: Record<string, any>) => ["campaigns", "list", params] as const,
  detail: (id: string) => ["campaigns", "detail", id] as const,
  checklist: (id: string) => ["campaigns", "checklist", id] as const,
  adminList: (params?: Record<string, any>) => ["campaigns", "adminList", params] as const,
  adminDetail: (id: string) => ["campaigns", "adminDetail", id] as const,
  adminContributions: (id: string, params?: Record<string, any>) =>
    ["campaigns", "adminContributions", id, params] as const,
};

export const campaignService = {
  /**
   * Public: List published campaigns (OPEN_FOR_FUNDING by default, or CLOSED).
   * GET /api/campaigns?page=...&pageSize=...&status=...
   */
  async listCampaigns(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<{
    items: ScholarshipCampaign[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.status) query.set("status", params.status);

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiScholarshipCampaign[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/campaigns${qs ? `?${qs}` : ""}`);

    return {
      items: adaptCampaigns(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * Public: Get published campaign details.
   * GET /api/campaigns/:id
   */
  async getCampaign(id: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/campaigns/${id}`);
    return adaptCampaign(data);
  },

  /** Student/Admin: read the campaign's configured dossier checklist and policy. */
  async getCampaignChecklist(id: string): Promise<ScholarshipCampaignChecklist> {
    return apiClient<ScholarshipCampaignChecklist>(`/campaigns/${id}/checklist`);
  },

  /**
   * Admin: List all campaigns including DRAFT, OPEN_FOR_FUNDING, CLOSED.
   * GET /api/admin/campaigns?page=...&pageSize=...&status=...
   */
  async adminListCampaigns(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<{
    items: ScholarshipCampaign[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.status) query.set("status", params.status);

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiScholarshipCampaign[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/admin/campaigns${qs ? `?${qs}` : ""}`);

    return {
      items: adaptCampaigns(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * Admin: Get campaign details including draft status.
   * GET /api/admin/campaigns/:id
   */
  async adminGetCampaign(id: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}`);
    return adaptCampaign(data);
  },

  /**
   * Admin: Create a new scholarship campaign (creates in DRAFT).
   * POST /api/admin/campaigns
   */
  async createCampaign(payload: CreateCampaignPayload): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptCampaign(data);
  },

  /**
   * Admin: Update campaign fields.
   * PATCH /api/admin/campaigns/:id
   */
  async updateCampaign(id: string, payload: UpdateCampaignPayload): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptCampaign(data);
  },

  /**
   * Admin: Publish a DRAFT campaign to OPEN_FOR_FUNDING.
   * POST /api/admin/campaigns/:id/publish
   */
  async publishCampaign(id: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/publish`, {
      method: "POST",
    });
    return adaptCampaign(data);
  },

  /**
   * Admin: Close an OPEN_FOR_FUNDING campaign.
   * POST /api/admin/campaigns/:id/close
   */
  async closeCampaign(id: string, note?: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    return adaptCampaign(data);
  },

  /**
   * Admin: Delete a draft campaign (only if DRAFT and no linked data).
   * DELETE /api/admin/campaigns/:id
   */
  async deleteCampaign(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(`/admin/campaigns/${id}`, {
      method: "DELETE",
    });
  },

  /** Admin: Pause funding */
  async pauseFunding(id: string, note?: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/pause-funding`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    return adaptCampaign(data);
  },

  /** Admin: Resume funding */
  async resumeFunding(id: string, payload?: { newFundingEnd?: string; note?: string }): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/resume-funding`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return adaptCampaign(data);
  },

  /** Admin: Reopen funding */
  async reopenFunding(id: string, payload?: { newFundingEnd?: string; note?: string }): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/reopen-funding`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return adaptCampaign(data);
  },

  /** Admin: Close funding */
  async closeFunding(id: string, note?: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/close-funding`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    return adaptCampaign(data);
  },

  /** Admin: Pause applications */
  async pauseApplications(id: string, note?: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/pause-applications`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    return adaptCampaign(data);
  },

  /** Admin: Resume applications */
  async resumeApplications(id: string, payload?: { newApplicationEnd?: string; note?: string }): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/resume-applications`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return adaptCampaign(data);
  },

  /** Admin: Close applications */
  async closeApplications(id: string, note?: string): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/close-applications`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    return adaptCampaign(data);
  },

  /** Admin: Reopen a closed campaign with controlled safety checks */
  async reopenCampaign(
    id: string,
    payload: {
      reason: string;
      newFundingEnd?: string;
      newApplicationEnd?: string;
      reopenFunding?: boolean;
      reopenApplications?: boolean;
      confirmReopenReconciled?: boolean;
    }
  ): Promise<ScholarshipCampaign> {
    const data = await apiClient<ApiScholarshipCampaign>(`/admin/campaigns/${id}/reopen`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptCampaign(data);
  },

  async reconcileFunding(id: string, reason: string) {
    return apiClient<any>(`/admin/campaigns/${id}/reconcile-funding`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Admin: Monitor sponsor contributions for a specific campaign.
   * GET /api/admin/campaigns/:id/contributions?page=...&pageSize=...&status=...
   */
  async adminListContributions(
    campaignId: string,
    params?: { page?: number; pageSize?: number; status?: string }
  ): Promise<{
    items: SponsorContribution[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.status) query.set("status", params.status);

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiSponsorContribution[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/admin/campaigns/${campaignId}/contributions${qs ? `?${qs}` : ""}`);

    return {
      items: adaptContributions(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * Public: List campaign scholarship recipients (after announcement date & with consent)
   * GET /api/campaigns/:id/recipients?page=...&pageSize=...
   */
  async getPublicRecipients(
    campaignId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<{
    items: import("../types/campaign").PublicRecipient[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    isPublished: boolean;
    resultPublicationDate?: string | null;
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return apiClient(`/campaigns/${campaignId}/recipients${qs ? `?${qs}` : ""}`);
  },
};
