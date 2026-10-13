export type UserRole = "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  role: "STUDENT";
}

/** POST /api/auth/register response (same shape for every registrable role). */
export interface RegisterResponse {
  userId: string;
  status: "ACTIVE";
  email: string;
  fullName: string;
  role: UserRole;
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
  role: UserRole;
  avatarUrl?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: AuthUser;
}

export type TeacherVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface TeacherRegisterRequest {
  fullName: string;
  email: string;
  password: string;
  /** Not stored by /auth/register: kept client-side and sent with the verification request (step 2). */
  qualificationSummary: string;
  biography?: string;
}

/** Step 1 data carried over to step 2 (verification documents). */
export interface TeacherRegistrationDraft {
  userId: string;
  fullName: string;
  email: string;
  qualificationSummary: string;
  biography?: string;
}
