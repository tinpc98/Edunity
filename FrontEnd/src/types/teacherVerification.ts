export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
export type DocumentType = "IDENTITY" | "QUALIFICATION";
export type FileSide = "FRONT" | "BACK" | "SINGLE";

export interface VerificationFile {
  storageKey: string;
  side: FileSide;
  mimeType?: string;
  url?: string;
  urlExpiresAt?: string;
}

export type VerificationDocumentStatus = "PENDING" | "APPROVED" | "REJECTED";

/** One submitted document. Backend returns every submission (newest first), each reviewed as a batch. */
export interface VerificationDocument {
  _id?: string;
  documentType: DocumentType;
  files: VerificationFile[];
  status?: VerificationDocumentStatus;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  uploadedAt?: string;
  createdAt?: string;
}

export interface TeacherVerificationStatus {
  teacherId: string;
  email: string;
  accountStatus: string;
  fullName: string;
  biography?: string;
  qualificationSummary?: string;
  verificationStatus: VerificationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  documents: VerificationDocument[];
}

export interface SubmitVerificationDocument {
  documentType: DocumentType;
  files: {
    storageKey: string;
    side: FileSide;
    mimeType?: string;
  }[];
}

export interface SubmitVerificationRequest {
  documents: SubmitVerificationDocument[];
  qualificationSummary?: string;
  biography?: string;
}

export interface AdminTeacherVerificationListItem {
  teacherId: string;
  email: string;
  accountStatus: string;
  fullName: string;
  qualificationSummary?: string;
  verificationStatus: VerificationStatus;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
