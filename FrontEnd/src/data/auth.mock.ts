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

export type { LoginPayload, LoginResponse, RegisterPayload, RegisterResponse } from "../types/auth";

export const mockRegisteredUser: RegisterResponse = {
  userId: "usr_student_001",
  fullName: "Nguyen Minh Anh",
  email: "minhanh@example.com",
  role: "STUDENT",
  status: "ACTIVE",
};

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email này đã được sử dụng.");
    this.name = "DuplicateEmailError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không chính xác.");
    this.name = "InvalidCredentialsError";
  }
}

export async function mockRegister(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));

  if (payload.email.trim().toLowerCase() === "student@edunity.vn") {
    throw new DuplicateEmailError();
  }

  return {
    ...mockRegisteredUser,
    userId: `usr_student_${Date.now()}`,
    fullName: payload.fullName.trim(),
    email: payload.email.trim(),
    role: payload.role,
  };
}

export async function mockLogin(payload: LoginPayload): Promise<LoginResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  if (
    payload.email.trim().toLowerCase() !== "student@edunity.vn" ||
    payload.password !== "Student123"
  ) {
    throw new InvalidCredentialsError();
  }

  return {
    accessToken: "mock_access_token_student",
    user: {
      userId: "usr_student_001",
      fullName: "Nguyễn Minh Anh",
      email: "student@edunity.vn",
      role: "STUDENT",
    },
  };
}

export async function mockTeacherRegister(
  payload: TeacherRegisterRequest,
): Promise<TeacherRegisterResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));

  return {
    teacherId: `mock_teacher_${Date.now()}`,
    email: payload.email.trim().toLowerCase(),
    fullName: payload.fullName.trim(),
    role: "TEACHER",
    verificationStatus: "UNVERIFIED",
  };
}

export async function mockSubmitQualification(
  payload: SubmitQualificationRequest,
): Promise<SubmitQualificationResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));

  return {
    document: {
      id: `mock_qualification_${Date.now()}`,
      teacherId: payload.teacherId,
      qualificationTitle: payload.qualificationTitle.trim(),
      institution: payload.institution.trim(),
      graduationYear: payload.graduationYear,
      fileName: payload.documentFile.name,
      fileType: payload.documentFile.type,
      submittedAt: new Date().toISOString(),
      status: "SUBMITTED",
    },
    verificationStatus: "PENDING",
  };
}
