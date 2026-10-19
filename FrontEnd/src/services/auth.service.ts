import { apiClient } from "../api/apiClient";
import type {
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  TeacherRegisterRequest,
  AuthUser,
} from "../types/auth";

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

/**
 * POST /api/auth/register with role TEACHER. The backend only stores fullName/email/password here;
 * qualificationSummary and biography are submitted later with POST /api/teacher/verification.
 */
export function registerTeacher(payload: TeacherRegisterRequest): Promise<RegisterResponse> {
  return apiClient<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      role: "TEACHER",
    }),
  });
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
