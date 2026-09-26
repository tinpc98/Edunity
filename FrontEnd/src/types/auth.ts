export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  role: "STUDENT";
}

export interface RegisterResponse {
  userId: string;
  status: "ACTIVE";
  email: string;
  fullName: string;
  role: "STUDENT";
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthUser {
  userId: string;
  fullName: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export type TeacherVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface TeacherRegisterRequest {
  fullName: string;
  email: string;
  password: string;
  qualificationSummary: string;
  biography?: string;
}

export interface TeacherRegisterResponse {
  teacherId: string;
  email: string;
  fullName: string;
  role: "TEACHER";
  verificationStatus: "UNVERIFIED";
}

export interface QualificationDocument {
  id: string;
  teacherId: string;
  qualificationTitle: string;
  institution: string;
  graduationYear?: number;
  fileName: string;
  fileType: string;
  submittedAt?: string;
  status: "DRAFT" | "SUBMITTED";
}

export interface SubmitQualificationRequest {
  teacherId: string;
  qualificationTitle: string;
  institution: string;
  graduationYear?: number;
  documentFile: {
    name: string;
    type: string;
  };
}

export interface SubmitQualificationResponse {
  document: QualificationDocument;
  verificationStatus: "PENDING";
}
