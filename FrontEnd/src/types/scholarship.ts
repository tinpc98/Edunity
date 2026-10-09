/**
 * Backend-aligned Scholarship & Application Types
 * Matching BackEnd/src/models/ScholarshipApplication.js,
 * BackEnd/src/models/Scholarship.js,
 * BackEnd/src/models/ScholarshipUsage.js,
 * BackEnd/src/services/scholarshipService.js,
 * BackEnd/src/services/scholarshipPaymentService.js
 */

export type ScholarshipApplicationStatus =
  | "SUBMITTED"
  | "NEED_MORE_INFORMATION"
  | "APPROVED"
  | "REJECTED";

export type ScholarshipStatus =
  | "ACTIVE"
  | "EXHAUSTED"
  | "EXPIRED"
  | "REVOKED";

export type ScholarshipUsageStatus =
  | "PENDING"
  | "CONFIRMED"
  | "RELEASED";

export type DocumentSide = "FRONT" | "BACK" | "SINGLE";

export interface VerificationDocumentFile {
  side: DocumentSide;
  storageKey: string;
  mimeType?: string;
  url?: string | null;
  urlExpiresAt?: string | null;
  signedUrl?: string;
}

export interface VerificationDocumentGroup {
  files: VerificationDocumentFile[];
}

export interface VerificationDocumentRecord {
  _id?: string;
  userId?: string;
  applicationId?: string;
  documentType: string;
  files: VerificationDocumentFile[];
  status?: string;
  uploadedAt?: string;
}

export interface CampaignSummaryInScholarship {
  _id?: string;
  id?: string;
  title: string;
  status: string;
  awardAmountPerStudent: number | { $numberDecimal?: string } | string;
  scope?: {
    categoryIds?: string[];
    subjectIds?: string[];
    courseIds?: string[];
  };
}

export interface ApiScholarshipApplication {
  _id: string;
  campaignId: string | any;
  studentId: string | any;
  statement: string;
  status: ScholarshipApplicationStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt?: string;
  updatedAt?: string;
  campaign?: CampaignSummaryInScholarship;
  // Fields present in adminListApplications
  studentName?: string;
  studentEmail?: string;
  campaignTitle?: string;
  awardAmountPerStudent?: number | { $numberDecimal?: string } | string;
  // Fields present in adminGetApplication
  student?: {
    id: string;
    email: string;
    status: string;
    fullName?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    school?: string;
    grade?: string;
  };
  documents?: VerificationDocumentRecord[];
  scholarship?: ApiScholarship;
}

export interface ScholarshipApplication {
  id: string;
  campaignId: string;
  studentId: string;
  statement: string;
  status: ScholarshipApplicationStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  campaignTitle?: string;
  awardAmountPerStudent: number;
  studentName?: string;
  studentEmail?: string;
  student?: {
    id: string;
    email: string;
    status: string;
    fullName?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    school?: string;
    grade?: string;
  };
  documents?: VerificationDocumentRecord[];
  campaign?: CampaignSummaryInScholarship;
  scholarship?: Scholarship;
}

export interface ApiScholarship {
  _id: string;
  campaignId: string | any;
  applicationId: string | any;
  studentId: string | any;
  allocatedAmount: number | { $numberDecimal?: string } | string;
  remainingAmount: number | { $numberDecimal?: string } | string;
  validFrom: string;
  expiresAt: string;
  status: ScholarshipStatus;
  campaign?: CampaignSummaryInScholarship;
  isUsable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Scholarship {
  id: string;
  campaignId: string;
  applicationId: string;
  studentId: string;
  allocatedAmount: number;
  remainingAmount: number;
  usedAmount: number;
  validFrom: string;
  expiresAt: string;
  status: ScholarshipStatus;
  campaignTitle?: string;
  campaign?: CampaignSummaryInScholarship;
  isUsable: boolean;
}

export interface ApiScholarshipUsage {
  _id: string;
  scholarshipId: string;
  enrollmentId: string;
  classId: string;
  amount: number | { $numberDecimal?: string } | string;
  usedAt: string;
  status: ScholarshipUsageStatus;
}

export interface ScholarshipUsage {
  id: string;
  scholarshipId: string;
  enrollmentId: string;
  classId: string;
  amount: number;
  usedAt: string;
  status: ScholarshipUsageStatus;
}

export interface PayWithScholarshipResult {
  enrollmentId: string;
  enrollmentStatus: string;
  paymentSource: "SCHOLARSHIP" | "MIXED";
  tuitionAmount: number;
  scholarshipId: string;
  scholarshipUsageId: string;
  scholarshipAmount: number;
  remainingDue: number;
  holdExpiresAt: string | null;
}

export interface ApplyScholarshipPayload {
  statement: string;
  documents: {
    files: {
      side?: DocumentSide;
      storageKey: string;
      mimeType?: string;
    }[];
  }[];
}

export interface ResubmitScholarshipPayload {
  statement?: string;
  documents?: {
    files: {
      side?: DocumentSide;
      storageKey: string;
      mimeType?: string;
    }[];
  }[];
}

export interface AdminReviewPayload {
  reviewNote?: string;
}

export const SCHOLARSHIP_APP_STATUS_LABELS: Record<ScholarshipApplicationStatus, string> = {
  SUBMITTED: "Chờ xét duyệt",
  NEED_MORE_INFORMATION: "Cần bổ sung thông tin",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối",
};

export const SCHOLARSHIP_APP_STATUS_COLORS: Record<ScholarshipApplicationStatus, string> = {
  SUBMITTED: "processing",
  NEED_MORE_INFORMATION: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export const SCHOLARSHIP_STATUS_LABELS: Record<ScholarshipStatus, string> = {
  ACTIVE: "Đang hiệu lực",
  EXHAUSTED: "Đã sử dụng hết",
  EXPIRED: "Đã hết hạn",
  REVOKED: "Đã thu hồi",
};

export const SCHOLARSHIP_STATUS_COLORS: Record<ScholarshipStatus, string> = {
  ACTIVE: "green",
  EXHAUSTED: "default",
  EXPIRED: "volcano",
  REVOKED: "red",
};
