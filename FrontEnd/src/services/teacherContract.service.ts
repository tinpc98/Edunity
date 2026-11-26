import { apiClient } from "../api/apiClient";

export type TeacherContractStatus =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "ACTIVE"
  | "SIGNED"
  | "EXPIRED"
  | "DECLINED"
  | "REJECTED"
  | "CANCELLED"
  | "TERMINATED";

export type ContractLifecycleStatus =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "SIGNED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type SigningMethod = "DRAWN_SIGNATURE" | "TYPED_SIGNATURE" | "CLICK_TO_SIGN" | "WEBHOOK";

export interface ContractRevenueSharing {
  teacherSharePercent: number;
  platformSharePercent: number;
  currency: string;
  basisDescription: string;
  settlementCycleDescription: string;
}

export interface ContractClause {
  number: number;
  title: string;
  paragraphs: string[];
}

export interface TeacherContractSnapshot {
  templateVersion: string;
  contractType: string;
  contractTitle: string;
  contractCode: string;
  verificationCode: string;
  capturedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  company: {
    companyName: string;
    representativeName: string;
    representativeTitle: string;
    taxCode: string;
    address: string;
    email: string;
    phone: string;
    website: string;
  };
  teacher: {
    teacherId: string;
    teacherCode: string;
    fullName: string;
    email: string;
    phone: string | null;
    dateOfBirth: string | null;
    idNumberLast4: string | null;
    idNumberMasked: string | null;
    addressMasked: string | null;
    qualificationSummary: string | null;
    specialtySummary: string | null;
    degree: string | null;
    degreeLabel: string | null;
    major: string | null;
    school: string | null;
    yearsOfExperience: number | null;
    subjects: string[];
    gradeLevels: string[];
    gradeLevelLabels: string[];
    verificationStatus: string;
    verificationReviewedAt: string | null;
  };
  revenueSharing: ContractRevenueSharing;
  legalBasis: string[];
  clauses: ContractClause[];
}

export interface TeacherContractSignatureSummary {
  signerName: string | null;
  signerEmail: string | null;
  signingMethod: SigningMethod;
  signatureText: string | null;
  hasSignatureImage: boolean;
  signedAt: string;
  documentHashAtSigning: string | null;
  finalDocumentHash: string | null;
}

export interface TeacherContractPdfInfo {
  fileName: string;
  size: number;
  sha256Hash: string;
  pageCount: number;
  generatedAt: string;
  url: string | null;
}

export interface TeacherContractAuditEntry {
  eventType: string;
  actorRole: string;
  actorId?: string | null;
  timestamp: string;
  signingMethod?: string | null;
  documentHash?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TeacherContract {
  id: string;
  contractCode: string;
  verificationCode?: string;
  contractType?: string;
  contractTitle?: string;
  templateVersion?: string;
  teacherId: string;
  teacherName?: string | null;
  teacherEmail?: string | null;
  status: TeacherContractStatus;
  lifecycleStatus?: ContractLifecycleStatus;
  effectiveFrom: string;
  expiresAt: string;
  sentAt: string;
  viewedAt?: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  provider: "SANDBOX" | "FPT_ECONTRACT" | "INTERNAL_ECONTRACT";
  canSign?: boolean;
  canSignInSandbox: boolean;
  revenueSharing?: ContractRevenueSharing;
  documentHash?: string | null;
  hasInitialPdf?: boolean;
  hasSignedPdf?: boolean;
  initialPdfUrl?: string | null;
  signedPdfUrl?: string | null;
  currentPdfUrl?: string | null;
  signatureSummary?: TeacherContractSignatureSummary | null;
}

export interface TeacherContractDetail extends TeacherContract {
  snapshot: TeacherContractSnapshot | null;
  renderedHtml: string | null;
  initialPdf: TeacherContractPdfInfo | null;
  signedPdf: TeacherContractPdfInfo | null;
  auditLogs: TeacherContractAuditEntry[];
}

export interface ContractPdfDownloadInfo {
  contractId: string;
  contractCode: string;
  version: "INITIAL" | "SIGNED";
  fileName: string;
  mimeType: string;
  size: number;
  sha256Hash: string;
  pageCount: number;
  url: string | null;
  expiresAt: string | null;
}

export interface PublicContractVerificationResult {
  contractCode: string;
  verificationCode: string;
  contractType: string;
  contractTitle: string;
  templateVersion: string;
  status: TeacherContractStatus;
  lifecycleStatus: ContractLifecycleStatus;
  companyName: string;
  companyRepresentative: string;
  teacherDisplayNameMasked: string;
  teacherCode: string | null;
  createdAt: string;
  effectiveFrom: string;
  expiresAt: string;
  signedAt: string | null;
  signingMethod: SigningMethod | null;
  integrity: {
    algorithm: string;
    documentHash: string | null;
    initialDocumentHash: string | null;
    signedDocumentHash: string | null;
    hashCheck: { matched: boolean; matchedVersion: "INITIAL" | "SIGNED" | null } | null;
    disclaimer: string;
  };
}

export interface SignTeacherContractPayload {
  readConfirmed: boolean;
  agreedToTerms: boolean;
  signingMethod?: "DRAWN_SIGNATURE" | "TYPED_SIGNATURE" | "CLICK_TO_SIGN";
  signatureDataUrl?: string | null;
  signatureText?: string | null;
}

export const CONTRACT_STATUS_META: Record<
  TeacherContractStatus,
  { label: string; color: string; lifecycleLabel: string }
> = {
  DRAFT: { label: "Bản nháp", color: "default", lifecycleLabel: "DRAFT" },
  PENDING_SIGNATURE: { label: "Chờ ký điện tử", color: "processing", lifecycleLabel: "PENDING_SIGNATURE" },
  ACTIVE: { label: "Đã ký (Đang hiệu lực)", color: "success", lifecycleLabel: "SIGNED" },
  SIGNED: { label: "Đã ký (Đang hiệu lực)", color: "success", lifecycleLabel: "SIGNED" },
  EXPIRED: { label: "Hết hạn", color: "default", lifecycleLabel: "EXPIRED" },
  DECLINED: { label: "Từ chối ký", color: "warning", lifecycleLabel: "REJECTED" },
  REJECTED: { label: "Từ chối ký", color: "warning", lifecycleLabel: "REJECTED" },
  CANCELLED: { label: "Đã huỷ", color: "default", lifecycleLabel: "CANCELLED" },
  TERMINATED: { label: "Đã chấm dứt", color: "error", lifecycleLabel: "CANCELLED" },
};

export const teacherContractService = {
  listMine: () => apiClient<TeacherContract[]>("/teacher/contracts"),
  getMyDetail: (id: string) => apiClient<TeacherContractDetail>(`/teacher/contracts/${id}`),
  getMyPdf: (id: string, version: "initial" | "signed" | "latest" = "latest") =>
    apiClient<ContractPdfDownloadInfo>(`/teacher/contracts/${id}/pdf?version=${version}`),
  signContract: (id: string, payload: SignTeacherContractPayload) =>
    apiClient<TeacherContractDetail>(`/teacher/contracts/${id}/sign`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rejectContract: (id: string, reason?: string) =>
    apiClient<TeacherContractDetail>(`/teacher/contracts/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  sandboxSign: (id: string, decision: "SIGN" | "DECLINE") =>
    apiClient<TeacherContract>(`/teacher/contracts/${id}/sandbox-sign`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  adminList: (teacherId: string) => apiClient<TeacherContract[]>(`/admin/teachers/${teacherId}/contracts`),
  adminGetDetail: (id: string) => apiClient<TeacherContractDetail>(`/admin/contracts/${id}`),
  adminGetPdf: (id: string, version: "initial" | "signed" | "latest" = "latest") =>
    apiClient<ContractPdfDownloadInfo>(`/admin/contracts/${id}/pdf?version=${version}`),
  adminSend: (teacherId: string, payload: { effectiveFrom?: string; expiresAt?: string; note?: string }) =>
    apiClient<TeacherContract>(`/admin/teachers/${teacherId}/contracts`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminRetry: (teacherId: string, note?: string) =>
    apiClient<{ outcome: "CREATED" | "EXISTING"; contract: TeacherContractDetail }>(
      `/admin/teachers/${teacherId}/contracts/retry`,
      {
        method: "POST",
        body: JSON.stringify({ note }),
      }
    ),
  adminEnd: (id: string, reason: string) =>
    apiClient<TeacherContract>(`/admin/contracts/${id}/end`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  verifyPublic: (code: string, hash?: string) => {
    const query = hash ? `?hash=${encodeURIComponent(hash.trim())}` : "";
    return apiClient<PublicContractVerificationResult>(
      `/contracts/verify/${encodeURIComponent(code.trim())}${query}`
    );
  },
};
