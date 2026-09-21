import type { LoginPayload, LoginResponse, RegisterPayload, RegisterResponse } from "../types/auth";

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
