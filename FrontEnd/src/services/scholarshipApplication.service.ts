import { apiClient } from "../api/apiClient";
import type {
  ApiScholarshipApplication,
  ScholarshipApplication,
  ApplyScholarshipPayload,
  CreateScholarshipDossierPayload,
  PaperDossierReceipt,
  PaperDossierReceiptPayload,
  ResubmitScholarshipPayload,
  ScholarshipDossierPayload,
  AdminReviewPayload,
} from "../types/scholarship";
import {
  adaptScholarshipApplication,
  adaptScholarshipApplications,
} from "../api/scholarshipAdapters";

export const scholarshipApplicationKeys = {
  all: ["scholarship-applications"] as const,
  myList: (params?: Record<string, any>) => ["scholarship-applications", "me", params] as const,
  adminList: (params?: Record<string, any>) => ["scholarship-applications", "admin", params] as const,
  detail: (id: string) => ["scholarship-applications", "detail", id] as const,
  paperReceipts: (params?: Record<string, unknown>) =>
    params ? ["scholarship-applications", "paper-receipts", params] as const : ["scholarship-applications", "paper-receipts"] as const,
  paperReceiptDetail: (id: string) => ["scholarship-applications", "paper-receipts", "detail", id] as const,
};

export const scholarshipApplicationService = {
  /**
   * Student: Apply for a scholarship campaign
   * POST /api/campaigns/:id/applications
   */
  async apply(campaignId: string, payload: ApplyScholarshipPayload): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/campaigns/${campaignId}/applications`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Student: create a dossier draft or submit through the existing dossier API. */
  async createDossier(campaignId: string, payload: CreateScholarshipDossierPayload): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/campaigns/${campaignId}/dossiers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Student: update an owned DRAFT or NEED_MORE_INFORMATION dossier. */
  async updateDossier(applicationId: string, payload: ScholarshipDossierPayload & { removeDocumentIds?: string[] }): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/me/scholarship-dossiers/${applicationId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Student: submit an owned DRAFT dossier. */
  async submitDossier(applicationId: string, payload?: ScholarshipDossierPayload): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/me/scholarship-dossiers/${applicationId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return adaptScholarshipApplication(raw);
  },

  /**
   * Student: Resubmit application when status is NEED_MORE_INFORMATION
   * POST /api/me/scholarship-applications/:id/resubmit
   */
  async resubmit(applicationId: string, payload: ResubmitScholarshipPayload): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/me/scholarship-applications/${applicationId}/resubmit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /**
   * Student: Get own scholarship applications
   * GET /api/me/scholarship-applications?page=&pageSize=
   */
  async getMyApplications(page: number = 1, pageSize: number = 20): Promise<{
    items: ScholarshipApplication[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const data = await apiClient<{
      items: ApiScholarshipApplication[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/me/scholarship-applications?page=${page}&pageSize=${pageSize}`);

    return {
      items: adaptScholarshipApplications(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /** Student: retrieve only the current user's dossier, including short-lived private document URLs. */
  async getMyApplicationDetail(id: string): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/me/scholarship-applications/${id}`);
    return adaptScholarshipApplication(raw);
  },

  /**
   * Admin: List scholarship applications with filters
   * GET /api/admin/scholarship-applications?status=...&campaignId=...&page=...&pageSize=...
   */
  async adminListApplications(params?: {
    status?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: ScholarshipApplication[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== "ALL") query.set("status", params.status);
    if (params?.campaignId) query.set("campaignId", params.campaignId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiScholarshipApplication[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/admin/scholarship-applications${qs ? `?${qs}` : ""}`);

    return {
      items: adaptScholarshipApplications(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * Admin: Get application detail
   * GET /api/admin/scholarship-applications/:id
   */
  async adminGetApplication(id: string): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/admin/scholarship-applications/${id}`);
    return adaptScholarshipApplication(raw);
  },

  /** Admin: list paper dossier receipts using the Backend's supported filters. */
  async adminListPaperReceipts(params?: {
    status?: string;
    campaignId?: string;
    applicationId?: string;
    applicationCode?: string;
    receiptCode?: string;
    trackingNumber?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: PaperDossierReceipt[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const query = new URLSearchParams();
    for (const key of ["status", "campaignId", "applicationId", "applicationCode", "receiptCode", "trackingNumber"] as const) {
      const value = params?.[key];
      if (value && !(key === "status" && value === "ALL")) query.set(key, value);
    }
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const queryString = query.toString();
    return apiClient(`/admin/paper-dossiers${queryString ? `?${queryString}` : ""}`);
  },

  /** Admin: get a receipt and its linked student, application, and campaign checklist summary. */
  async adminGetPaperReceipt(id: string): Promise<PaperDossierReceipt> {
    return apiClient<PaperDossierReceipt>(`/admin/paper-dossiers/${id}`);
  },

  /** Admin: log a paper dossier received by the office. */
  async adminIntakePaperDossier(payload: PaperDossierReceiptPayload): Promise<PaperDossierReceipt> {
    return apiClient<PaperDossierReceipt>("/admin/paper-dossiers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async adminLinkPaperDossier(id: string, payload: { applicationId?: string; applicationCode?: string; note?: string }): Promise<PaperDossierReceipt> {
    return apiClient<PaperDossierReceipt>(`/admin/paper-dossiers/${id}/link`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async adminReconcilePaperDossier(
    id: string,
    payload: {
      status: "IN_RECONCILIATION" | "DISCREPANCY" | "RECONCILED";
      reconciliationNote?: string;
      discrepancyReason?: string;
      reconciledItems?: NonNullable<PaperDossierReceipt["reconciledItems"]>;
    },
  ): Promise<PaperDossierReceipt> {
    return apiClient<PaperDossierReceipt>(`/admin/paper-dossiers/${id}/reconcile`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin: Approve application
   * POST /api/admin/scholarship-applications/:id/approve
   */
  async adminApprove(id: string, payload?: AdminReviewPayload): Promise<{
    application: ScholarshipApplication;
    scholarship: any;
  }> {
    const res = await apiClient<{
      application: ApiScholarshipApplication;
      scholarship: any;
    }>(`/admin/scholarship-applications/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });

    return {
      application: adaptScholarshipApplication(res.application),
      scholarship: res.scholarship,
    };
  },

  /**
   * Admin: Reject application
   * POST /api/admin/scholarship-applications/:id/reject
   */
  async adminReject(id: string, payload?: AdminReviewPayload): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/admin/scholarship-applications/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
    return adaptScholarshipApplication(raw);
  },

  /**
   * Admin: Request more information
   * POST /api/admin/scholarship-applications/:id/request-information
   */
  async adminRequestInformation(id: string, reviewNote: string): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/admin/scholarship-applications/${id}/request-information`, {
      method: "POST",
      body: JSON.stringify({ reviewNote }),
    });
    return adaptScholarshipApplication(raw);
  },

  /**
   * Upload private verification document
   * POST /api/uploads/private (purpose: SCHOLARSHIP_PROOF)
   */
  async uploadDocument(file: File): Promise<{
    storageKey: string;
    mimeType: string;
    size: number;
    originalName: string;
  }> {
    const formData = new FormData();
    formData.append("purpose", "SCHOLARSHIP_PROOF");
    formData.append("file", file);

    return apiClient<{
      storageKey: string;
      mimeType: string;
      size: number;
      originalName: string;
    }>("/uploads/private", {
      method: "POST",
      body: formData,
    });
  },
};
