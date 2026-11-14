import { apiClient } from "../api/apiClient";

export type TeacherContractStatus = "PENDING_SIGNATURE" | "ACTIVE" | "EXPIRED" | "DECLINED" | "CANCELLED" | "TERMINATED";

export interface TeacherContract {
  id: string;
  contractCode: string;
  teacherId: string;
  status: TeacherContractStatus;
  effectiveFrom: string;
  expiresAt: string;
  sentAt: string;
  signedAt: string | null;
  declinedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  provider: "SANDBOX" | "FPT_ECONTRACT";
  canSignInSandbox: boolean;
}

export const CONTRACT_STATUS_META: Record<TeacherContractStatus, { label: string; color: string }> = {
  PENDING_SIGNATURE: { label: "Chờ ký", color: "processing" },
  ACTIVE: { label: "Đang hiệu lực", color: "success" },
  EXPIRED: { label: "Hết hạn", color: "default" },
  DECLINED: { label: "Từ chối ký", color: "warning" },
  CANCELLED: { label: "Đã huỷ", color: "default" },
  TERMINATED: { label: "Đã chấm dứt", color: "error" },
};

export const teacherContractService = {
  listMine: () => apiClient<TeacherContract[]>("/teacher/contracts"),
  sandboxSign: (id: string, decision: "SIGN" | "DECLINE") =>
    apiClient<TeacherContract>(`/teacher/contracts/${id}/sandbox-sign`, { method: "POST", body: JSON.stringify({ decision }) }),

  adminList: (teacherId: string) => apiClient<TeacherContract[]>(`/admin/teachers/${teacherId}/contracts`),
  adminSend: (teacherId: string, payload: { effectiveFrom?: string; expiresAt?: string; note?: string }) =>
    apiClient<TeacherContract>(`/admin/teachers/${teacherId}/contracts`, { method: "POST", body: JSON.stringify(payload) }),
  adminEnd: (id: string, reason: string) =>
    apiClient<TeacherContract>(`/admin/contracts/${id}/end`, { method: "POST", body: JSON.stringify({ reason }) }),
};
