import {
  mockLogin,
  mockRegister,
  mockSubmitQualification,
  mockTeacherRegister,
} from "../data/auth.mock";
import type {
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  SubmitQualificationRequest,
  SubmitQualificationResponse,
  TeacherRegisterRequest,
  TeacherRegisterResponse,
} from "../types/auth";

export function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  return mockRegister(payload);
}

export function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return mockLogin(payload);
}

export function registerTeacher(payload: TeacherRegisterRequest): Promise<TeacherRegisterResponse> {
  return mockTeacherRegister(payload);
}

export function submitTeacherQualification(
  payload: SubmitQualificationRequest,
): Promise<SubmitQualificationResponse> {
  return mockSubmitQualification(payload);
}
