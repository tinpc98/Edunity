/**
 * Backend-aligned Scholarship & Application Types
 * Matching BackEnd/src/models/ScholarshipApplication.js,
 * BackEnd/src/models/Scholarship.js,
 * BackEnd/src/models/ScholarshipUsage.js,
 * BackEnd/src/services/scholarshipService.js,
 * BackEnd/src/services/scholarshipPaymentService.js
 */

export type ScholarshipApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEED_MORE_INFORMATION"
  | "DOSSIER_VERIFIED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type DossierSubmissionMode = "ONLINE" | "PAPER" | "HYBRID";

export interface ScholarshipGuardianInfo {
  fullName: string;
  relationship: "FATHER" | "MOTHER" | "GRANDPARENT" | "SIBLING" | "LEGAL_GUARDIAN" | "OTHER";
  phone: string;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  nationalIdLast4?: string | null;
  householdCircumstance?: string | null;
}

export interface ScholarshipSchoolInfo {
  schoolName: string;
  gradeLevel: string;
  className: string;
  studentCode?: string | null;
  academicYear?: string | null;
  province?: string | null;
  district?: string | null;
  schoolAddress?: string | null;
}

export interface ScholarshipChecklistItem {
  code: string;
  title: string;
  description?: string;
  required: boolean;
  acceptedMode: "ONLINE" | "PAPER" | "EITHER" | "BOTH";
  acceptedDocumentTypes: string[];
  maxFiles: number;
  order: number;
}

export interface ScholarshipDossierPolicy {
  requireGuardianInfo: boolean;
  requireSchoolInfo: boolean;
  allowPaperDossier: boolean;
  allowDraftSave: boolean;
  requireGuardianConsentForMinor: boolean;
}

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
  id?: string;
  userId?: string;
  applicationId?: string;
  checklistItemCode?: string | null;
  title?: string | null;
  documentType: string;
  files: VerificationDocumentFile[];
  status?: string;
  uploadedAt?: string;
}

export interface ScholarshipChecklistProgress {
  code: string;
  title?: string;
  required?: boolean;
  acceptedMode?: string;
  onlineDocumentIds?: string[];
  paperReceiptId?: string | null;
  paperItemStatus?: string | null;
  satisfied?: boolean;
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
  documentChecklist?: ScholarshipChecklistItem[];
  dossierPolicy?: ScholarshipDossierPolicy;
}

export interface ApiScholarshipApplication {
  _id: string;
  campaignId: string | any;
  studentId: string | any;
  statement: string;
  status: ScholarshipApplicationStatus;
  submittedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  applicationCode?: string | null;
  submissionMode?: DossierSubmissionMode;
  guardianInfo?: ScholarshipGuardianInfo | null;
  schoolInfo?: ScholarshipSchoolInfo | null;
  checklistProgress?: ScholarshipChecklistProgress[];
  dossierVerification?: {
    status?: string;
    verifiedAt?: string | null;
    note?: string | null;
    checklistVerified?: boolean;
  };
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  campaign?: CampaignSummaryInScholarship;
  paperReceipts?: PaperDossierReceipt[];
  checklistSummary?: Record<string, unknown> | null;
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
  submittedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  applicationCode?: string | null;
  submissionMode?: DossierSubmissionMode;
  guardianInfo?: ScholarshipGuardianInfo | null;
  schoolInfo?: ScholarshipSchoolInfo | null;
  checklistProgress?: ScholarshipChecklistProgress[];
  dossierVerification?: ApiScholarshipApplication["dossierVerification"];
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
  paperReceipts?: PaperDossierReceipt[];
  checklistSummary?: Record<string, unknown> | null;
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

export interface ScholarshipDossierPayload {
  statement?: string;
  submissionMode?: DossierSubmissionMode;
  guardianInfo?: ScholarshipGuardianInfo;
  schoolInfo?: ScholarshipSchoolInfo;
  documents?: {
    checklistItemCode?: string | null;
    title?: string | null;
    documentType?: string;
    files: {
      side?: DocumentSide;
      storageKey: string;
      mimeType?: string;
    }[];
  }[];
}

export interface CreateScholarshipDossierPayload extends ScholarshipDossierPayload {
  saveAsDraft: boolean;
}

export interface PaperDossierReceipt {
  _id?: string;
  id?: string;
  receiptCode: string;
  applicationId?: string | { _id?: string; applicationCode?: string; status?: ScholarshipApplicationStatus } | null;
  declaredApplicationCode?: string | null;
  campaignId?: string | null;
  studentId?: string | null;
  postalInfo: {
    deliveryMethod: "POSTAL_MAIL" | "COURIER" | "IN_PERSON_DROP_OFF";
    carrierName: string;
    trackingNumber?: string | null;
    senderName: string;
    senderPhone?: string | null;
    senderAddress?: string | null;
    sentAt?: string | null;
    postmarkDate?: string | null;
    envelopeSealed?: boolean;
    packageCondition?: "INTACT" | "DAMAGED" | "TORN" | "WET" | "PARTIAL";
  };
  receivedBy?: string | { _id?: string; email?: string };
  receivedByName?: string | null;
  receivedAt: string;
  receivingLocation?: string;
  intakeNote?: string | null;
  status: "RECEIVED" | "IN_RECONCILIATION" | "DISCREPANCY" | "RECONCILED" | "REJECTED" | "CANCELLED";
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  reconciliationNote?: string | null;
  discrepancyReason?: string | null;
  reconciledItems?: {
    checklistItemCode: string;
    itemStatus: "MATCHED" | "MISSING" | "MISMATCH" | "DAMAGED" | "NOT_APPLICABLE";
    documentTitle?: string | null;
    pageCount?: number;
    isOriginal?: boolean;
    hasOfficialStamp?: boolean;
    note?: string | null;
    verifiedBy?: string | null;
    verifiedAt?: string | null;
  }[];
  history?: {
    action: string;
    actorAdminId?: string;
    fromStatus?: string | null;
    toStatus: string;
    note?: string | null;
    recordedAt: string;
  }[];
  application?: {
    _id?: string;
    applicationCode?: string;
    status?: ScholarshipApplicationStatus;
    submissionMode?: DossierSubmissionMode;
    schoolInfo?: ScholarshipSchoolInfo;
    submittedAt?: string | null;
    checklistProgress?: ScholarshipChecklistProgress[];
  } | null;
  student?: { id: string; email?: string; fullName?: string | null } | null;
  campaign?: {
    _id?: string;
    title?: string;
    status?: string;
    documentChecklist?: ScholarshipChecklistItem[];
  } | null;
}

export interface PaperDossierReceiptPayload {
  applicationId?: string;
  applicationCode?: string;
  campaignId?: string;
  studentId?: string;
  declaredApplicationCode?: string;
  receiptCode?: string;
  receivedAt?: string;
  receivingLocation?: string;
  intakeNote?: string;
  postalInfo: PaperDossierReceipt["postalInfo"];
}

export interface ResubmitScholarshipPayload {
  statement?: string;
  submissionMode?: DossierSubmissionMode;
  guardianInfo?: ScholarshipGuardianInfo;
  schoolInfo?: ScholarshipSchoolInfo;
  documents?: {
    checklistItemCode?: string | null;
    title?: string | null;
    documentType?: string;
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
  DRAFT: "Bản nháp",
  SUBMITTED: "Chờ xét duyệt",
  NEED_MORE_INFORMATION: "Cần bổ sung thông tin",
  DOSSIER_VERIFIED: "Đã xác minh hồ sơ",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối",
  WITHDRAWN: "Đã rút hồ sơ",
};

export const SCHOLARSHIP_APP_STATUS_COLORS: Record<ScholarshipApplicationStatus, string> = {
  DRAFT: "default",
  SUBMITTED: "processing",
  NEED_MORE_INFORMATION: "warning",
  DOSSIER_VERIFIED: "cyan",
  APPROVED: "success",
  REJECTED: "error",
  WITHDRAWN: "default",
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
