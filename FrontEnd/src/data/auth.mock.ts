import type { RegisterPayload, RegisterResponse } from "../types/auth";

export type { RegisterPayload, RegisterResponse } from "../types/auth";

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
