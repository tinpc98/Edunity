import { apiClient } from "../api/apiClient";
import type { Paged } from "../types/teacherVerification";

export type GuardianConsentStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";

export interface GuardianConsent {
  id: string;
  campaignId: string;
  guardian: { fullName: string; relationship: string; phone: string };
  allowPublicStory: boolean;
  status: GuardianConsentStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  // admin view only
  studentId?: string;
  documentStorageKey?: string;
  student?: { email: string; fullName?: string; dateOfBirth?: string | null } | null;
}

export interface CampaignStory {
  displayName: string;
  gradeLevel: string | null;
  province: string | null;
  story: string;
}

export const GUARDIAN_CONSENT_STATUS_META: Record<GuardianConsentStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ duyệt", color: "processing" },
  VERIFIED: { label: "Đã xác nhận", color: "success" },
  REJECTED: { label: "Bị từ chối", color: "error" },
  REVOKED: { label: "Đã rút", color: "default" },
};

export const GUARDIAN_CONSENTS_KEY = ["student-guardian-consents"];

export const scholarshipPrivacyService = {
  listMyConsents: () => apiClient<GuardianConsent[]>("/student/guardian-consents"),
  submitConsent: (payload: {
    campaignId: string;
    guardian: { fullName: string; relationship: string; phone: string };
    documentStorageKey: string;
    allowPublicStory: boolean;
  }) => apiClient<GuardianConsent>("/student/guardian-consents", { method: "POST", body: JSON.stringify(payload) }),
  revokeConsent: (id: string) => apiClient<GuardianConsent>(`/student/guardian-consents/${id}/revoke`, { method: "POST" }),
  setPublicStory: (applicationId: string, payload: { consent: boolean; text?: string }) =>
    apiClient<{ consent: boolean }>(`/student/scholarship-applications/${applicationId}/public-story`, { method: "PUT", body: JSON.stringify(payload) }),

  campaignStories: (campaignId: string) => apiClient<CampaignStory[]>(`/sponsor/campaigns/${campaignId}/stories`),

  adminList: (status: GuardianConsentStatus = "PENDING") => apiClient<Paged<GuardianConsent>>(`/admin/guardian-consents?status=${status}&pageSize=50`),
  adminVerify: (id: string) => apiClient<GuardianConsent>(`/admin/guardian-consents/${id}/verify`, { method: "POST", body: "{}" }),
  adminReject: (id: string, reviewNote: string) =>
    apiClient<GuardianConsent>(`/admin/guardian-consents/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }),
  // Each Admin opening of a private file is audited server-side (BAO-04)
  openPrivateFile: (storageKey: string) =>
    apiClient<{ url: string; expiresAt: string }>("/files/signed-url", { method: "POST", body: JSON.stringify({ storageKey }) }),
};
