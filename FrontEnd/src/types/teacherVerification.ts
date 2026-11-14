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

/** OCR of the CCCD front compared with the declared identity (admin view only). */
export interface VerificationOcr {
  status: "MATCHED" | "MISMATCHED" | "UNAVAILABLE";
  provider?: string | null;
  mismatches: Array<"fullName" | "idNumber" | "dateOfBirth" | "expiryDate" | "cardExpired">;
  readFullName?: string | null;
  readIdNumberLast4?: string | null;
  note?: string | null;
  checkedAt: string;
}

/** One submitted document. Backend returns every submission (newest first), each reviewed as a batch. */
export interface VerificationDocument {
  _id?: string;
  documentType: DocumentType;
  files: VerificationFile[];
  status?: VerificationDocumentStatus;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  ocr?: VerificationOcr;
  reviewedAt?: string | null;
  uploadedAt?: string;
  createdAt?: string;
}

/** Masked view: the full CCCD number and address are only returned by the audited admin reveal. */
export interface TeacherIdentity {
  fullName: string;
  dateOfBirth: string;
  idNumberMasked: string;
  addressMasked: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
}

export interface SubmitIdentity {
  fullName: string;
  idNumber: string;
  dateOfBirth: string;
  address: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface TeacherVerificationStatus {
  teacherId: string;
  email: string;
  accountStatus: string;
  fullName: string;
  biography?: string;
  qualificationSummary?: string;
  identity?: TeacherIdentity | null;
  verificationStatus: VerificationStatus;
  /** BAO-10: verification lasts 6 months; re-verification keeps the teacher VERIFIED while reviewed */
  verifiedUntil?: string | null;
  reverificationStatus?: "PENDING" | "REJECTED" | null;
  reverificationOpen?: boolean;
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
  identity: SubmitIdentity;
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
  isReverification?: boolean;
  verifiedUntil?: string | null;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
