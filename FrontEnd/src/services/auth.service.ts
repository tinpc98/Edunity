import { mockLogin, mockRegister } from "../data/auth.mock";
import type { LoginPayload, LoginResponse, RegisterPayload, RegisterResponse } from "../types/auth";

export function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  return mockRegister(payload);
}

export function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return mockLogin(payload);
}
