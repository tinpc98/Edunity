import { apiClient } from "../api/apiClient";
import type {
  ApiScholarshipApplication,
  ScholarshipApplication,
  VerifierScholarshipApplicationDetail,
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

  async declarePaperDispatch(id: string, payload: { sentAt: string; carrier: string; trackingNumber?: string; proofStorageKey?: string }): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/me/scholarship-applications/${id}/paper-dispatch`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /**
   * Admin: List scholarship applications with filters
   * GET /api/admin/scholarship-applications?status=...&campaignId=...&page=...&pageSize=...
   */
  async adminListApplications(params?: {
    status?: string;
    campaignId?: string;
    submissionMode?: string;
    search?: string;
    province?: string;
    residenceProvince?: string;
    schoolName?: string;
    gradeLevel?: string;
    hasPovertyCertificate?: string;
    isDisadvantaged?: string;
    hardshipCategory?: string;
    paperStatus?: string;
    minPriorityScore?: number;
    maxPriorityScore?: number;
    sortByPriority?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: ScholarshipApplication[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    counts?: {
      all: number;
      submitted: number;
      needMoreInfo: number;
      dossierVerified: number;
      approved: number;
      rejected: number;
      withdrawn: number;
    };
  }> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== "ALL") query.set("status", params.status);
    if (params?.campaignId && params.campaignId !== "ALL") query.set("campaignId", params.campaignId);
    if (params?.submissionMode && params.submissionMode !== "ALL") query.set("submissionMode", params.submissionMode);
    if (params?.search) query.set("search", params.search);
    if (params?.province) query.set("province", params.province);
    if (params?.residenceProvince) query.set("residenceProvince", params.residenceProvince);
    if (params?.schoolName) query.set("schoolName", params.schoolName);
    if (params?.gradeLevel) query.set("gradeLevel", params.gradeLevel);
    if (params?.hasPovertyCertificate) query.set("hasPovertyCertificate", params.hasPovertyCertificate);
    if (params?.isDisadvantaged) query.set("isDisadvantaged", params.isDisadvantaged);
    if (params?.hardshipCategory) query.set("hardshipCategory", params.hardshipCategory);
    if (params?.paperStatus) query.set("paperStatus", params.paperStatus);
    if (params?.minPriorityScore !== undefined) query.set("minPriorityScore", String(params.minPriorityScore));
    if (params?.maxPriorityScore !== undefined) query.set("maxPriorityScore", String(params.maxPriorityScore));
    if (params?.sortByPriority) query.set("sortByPriority", "true");
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const qs = query.toString();
    const data = await apiClient<{
      items: ApiScholarshipApplication[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      counts?: {
        all: number;
        submitted: number;
        needMoreInfo: number;
        dossierVerified: number;
        approved: number;
        rejected: number;
        withdrawn: number;
      };
    }>(`/admin/scholarship-applications${qs ? `?${qs}` : ""}`);

    return {
      items: adaptScholarshipApplications(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
      counts: data.counts,
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

  /** Admin: create paper dossier receipt (alias for adminIntakePaperDossier). */
  async adminCreatePaperReceipt(payload: PaperDossierReceiptPayload): Promise<PaperDossierReceipt> {
    return this.adminIntakePaperDossier(payload);
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
   * Admin: Review and verify/reject individual document
   * PATCH /api/admin/scholarship-applications/:id/documents/:documentId/review
   */
  async adminReviewDocument(
    applicationId: string,
    documentId: string,
    payload: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string }
  ): Promise<any> {
    return apiClient(`/admin/scholarship-applications/${applicationId}/documents/${documentId}/review`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
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

  /** Admin: Screen application (Layer 1 + Layer 2) and optionally assign verifier */
  async adminScreenApplication(id: string, payload: {
    layer1Passed: boolean;
    notes?: string;
    assignedVerifierId?: string;
  }): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/admin/scholarship-applications/${id}/screen`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Admin: Assign a verifier to application */
  async adminAssignVerifier(
    id: string,
    payload: { verifierId: string; note?: string } | string
  ): Promise<ScholarshipApplication> {
    const body = typeof payload === "string" ? { verifierId: payload } : payload;
    const raw = await apiClient<ApiScholarshipApplication>(`/admin/scholarship-applications/${id}/assign-verifier`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Admin: List eligible verifiers */
  async adminListVerifiers(): Promise<{ id: string; email: string; role: string; name: string }[]> {
    return apiClient("/admin/verifiers");
  },

  /** Verifier: Submit field/dossier verification report */
  async verifierSubmitResult(id: string, payload: {
    status: "VERIFIED_MATCHED" | "DISCREPANCY" | "SUPPLEMENT_REQUIRED" | "UNABLE_TO_VERIFY";
    notes?: string;
  }): Promise<ScholarshipApplication> {
    const raw = await apiClient<ApiScholarshipApplication>(`/verifier/scholarship-applications/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptScholarshipApplication(raw);
  },

  /** Verifier: List applications assigned for verification */
  async getVerifierApplications(params?: { status?: string; page?: number; pageSize?: number }): Promise<{
    items: ScholarshipApplication[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    const data = await apiClient<{
      items: ApiScholarshipApplication[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/verifier/scholarship-applications${qs ? `?${qs}` : ""}`);

    return {
      items: adaptScholarshipApplications(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /** Verifier: Open only a dossier assigned to the current verifier. */
  async verifierGetApplication(id: string): Promise<VerifierScholarshipApplicationDetail> {
    return apiClient<VerifierScholarshipApplicationDetail>(`/verifier/scholarship-applications/${id}`);
  },

  /** Student: Toggle or revoke public transparency consent */
  async setPublicConsent(id: string, consented: boolean): Promise<{
    applicationId: string;
    consented: boolean;
    consentedAt?: string | null;
    revokedAt?: string | null;
  }> {
    return apiClient(`/me/scholarship-applications/${id}/public-consent`, {
      method: "POST",
      body: JSON.stringify({ consented }),
    });
  },
};
