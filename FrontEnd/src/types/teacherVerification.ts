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

export interface VerificationDocument {
  documentType: DocumentType;
  files: VerificationFile[];
  status?: "PENDING" | "APPROVED" | "REJECTED";
  reviewedNote?: string;
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
  data: T[];
  paging: {
    page: number;
    pageSize: number;
    total: number;
  };
}
