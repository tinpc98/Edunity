import { mockRegister } from "../data/auth.mock";
import type { RegisterPayload, RegisterResponse } from "../types/auth";

export function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  return mockRegister(payload);
}
