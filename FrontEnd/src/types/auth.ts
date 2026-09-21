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
