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

export type AuthUser = Omit<RegisterResponse, "status">;
