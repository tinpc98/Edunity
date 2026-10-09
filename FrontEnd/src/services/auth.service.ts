import { apiClient } from "../api/apiClient";
import type {
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  SubmitQualificationRequest,
  SubmitQualificationResponse,
  TeacherRegisterRequest,
  TeacherRegisterResponse,
  AuthUser,
} from "../types/auth";
import { mockSubmitQualification } from "../data/auth.mock";

export function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  return apiClient<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: payload.email, password: payload.password }),
  });
}

export function registerTeacher(payload: TeacherRegisterRequest): Promise<TeacherRegisterResponse> {
  return apiClient<TeacherRegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...payload, role: "TEACHER" }),
  });
}

export function submitTeacherQualification(
  payload: SubmitQualificationRequest,
): Promise<SubmitQualificationResponse> {
  // Mock fallback for Phase 2 Verification, as per instructions.
  return mockSubmitQualification(payload);
}

export function logoutUser(refreshToken: string | null): Promise<{ loggedOut: boolean }> {
  return apiClient<{ loggedOut: boolean }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>("/auth/me", {
    method: "GET",
  });
}
