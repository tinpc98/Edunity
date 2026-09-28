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

/**
 * Mock User Account structure for local FE simulation.
 * NOTE: Storing the mock password here is strictly for front-end development
 * and testing without a real backend. It MUST NEVER be exposed in API responses,
 * auth store, or production code.
 */
export interface MockUserAccount {
  userId: string;
  fullName: string;
  email: string;
  normalizedEmail: string;
  password: string; // ONLY for FE mock testing
  role: "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED";
  createdAt: string;
  avatarUrl?: string;
}

const MOCK_USERS_STORAGE_KEY = "edunity_mock_users";

export const DEFAULT_MOCK_STUDENT: MockUserAccount = {
  userId: "usr_student_001",
  fullName: "Nguyễn Minh Anh",
  email: "student@edunity.vn",
  normalizedEmail: "student@edunity.vn",
  password: "Student123",
  role: "STUDENT",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const mockRegisteredUser: RegisterResponse = {
  userId: DEFAULT_MOCK_STUDENT.userId,
  fullName: DEFAULT_MOCK_STUDENT.fullName,
  email: DEFAULT_MOCK_STUDENT.email,
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

export class MockAuthRepository {
  private getStorage(): MockUserAccount[] {
    try {
      const raw = localStorage.getItem(MOCK_USERS_STORAGE_KEY);
      if (!raw) {
        this.saveStorage([DEFAULT_MOCK_STUDENT]);
        return [DEFAULT_MOCK_STUDENT];
      }
      const users: MockUserAccount[] = JSON.parse(raw);
      // Ensure default mock student is always present for testing
      if (!users.some((u) => u.normalizedEmail === DEFAULT_MOCK_STUDENT.normalizedEmail)) {
        users.unshift(DEFAULT_MOCK_STUDENT);
        this.saveStorage(users);
      }
      return users;
    } catch (e) {
      console.error("Failed to parse mock users from localStorage, resetting to default:", e);
      this.saveStorage([DEFAULT_MOCK_STUDENT]);
      return [DEFAULT_MOCK_STUDENT];
    }
  }

  private saveStorage(users: MockUserAccount[]): void {
    try {
      localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      console.error("Failed to save mock users to localStorage:", e);
    }
  }

  getUsers(): MockUserAccount[] {
    return this.getStorage();
  }

  findByEmail(email: string): MockUserAccount | undefined {
    const normalized = email.trim().toLowerCase();
    return this.getStorage().find((u) => u.normalizedEmail === normalized);
  }

  createUser(payload: {
    fullName: string;
    email: string;
    password: string;
    role?: "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";
  }): MockUserAccount {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const users = this.getStorage();

    if (users.some((u) => u.normalizedEmail === normalizedEmail)) {
      throw new DuplicateEmailError();
    }

    const newUser: MockUserAccount = {
      userId: `usr_${(payload.role || "student").toLowerCase()}_${Date.now()}`,
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      normalizedEmail,
      password: payload.password,
      role: payload.role || "STUDENT",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveStorage(users);
    return newUser;
  }
}

export const mockAuthRepository = new MockAuthRepository();

export async function mockRegister(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  // Realistic network latency simulation
  await new Promise((resolve) => window.setTimeout(resolve, 650));

  const user = mockAuthRepository.createUser({
    fullName: payload.fullName,
    email: payload.email,
    password: payload.password,
    role: payload.role,
  });

  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    role: user.role as "STUDENT",
    status: user.status as "ACTIVE",
  };
}

export async function mockLogin(payload: LoginPayload): Promise<LoginResponse> {
  // Realistic network latency simulation
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  const normalized = payload.email.trim().toLowerCase();
  const account = mockAuthRepository.findByEmail(normalized);

  if (!account || account.password !== payload.password) {
    throw new InvalidCredentialsError();
  }

  return {
    accessToken: `mock_access_token_${account.userId}`,
    user: {
      userId: account.userId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      avatarUrl: account.avatarUrl,
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
