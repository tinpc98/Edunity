import { apiClient } from "../api/apiClient";
import type { Paged } from "../types/teacherVerification";

export const TEACHER_BANK_ACCOUNT_KEY = ["teacher-bank-account"];

export type BankAccountStatus = "PENDING_REVIEW" | "PENDING" | "VERIFIED" | "APPROVED" | "REJECTED" | "DISABLED" | "INACTIVE";
export type BankAccountFilterStatus = "ALL" | BankAccountStatus;

export interface TeacherBankAccount {
  bankName: string;
  accountNumberMasked: string;
  accountNumber?: string; // admin review only
  accountHolderName: string;
  status: BankAccountStatus;
  submittedAt: string;
  payoutLockedUntil: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

export interface AdminBankAccountItem {
  teacherId: string;
  email: string;
  fullName: string;
  identityName: string | null;
  bankAccount: TeacherBankAccount;
}

export const BANK_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: "Chờ duyệt", color: "processing" },
  PENDING: { label: "Chờ duyệt", color: "processing" },
  VERIFIED: { label: "Đã duyệt", color: "success" },
  APPROVED: { label: "Đã duyệt", color: "success" },
  REJECTED: { label: "Bị từ chối", color: "error" },
  DISABLED: { label: "Vô hiệu hóa", color: "default" },
  INACTIVE: { label: "Không hoạt động", color: "default" },
};

export const getBankStatusMeta = (status?: string | null): { label: string; color: string } => {
  if (!status) return { label: "Chưa xác minh", color: "default" };
  const key = String(status).trim().toUpperCase();
  return BANK_STATUS_META[key] || { label: status, color: "default" };
};

export const teacherBankAccountService = {
  getMine: async (): Promise<TeacherBankAccount | null> => {
    const raw = await apiClient<any>("/teacher/bank-account");
    if (!raw || typeof raw !== "object") return null;
    if ("success" in raw && "data" in raw && !raw.bankName) {
      return (raw.data && raw.data.bankName ? raw.data : null) as TeacherBankAccount | null;
    }
    if (!raw.bankName || !raw.status) return null;
    return raw as TeacherBankAccount;
  },
  submit: (payload: { bankName: string; accountNumber: string; accountHolderName: string }) =>
    apiClient<TeacherBankAccount>("/teacher/bank-account", { method: "PUT", body: JSON.stringify(payload) }),

  adminList: (status: BankAccountFilterStatus | string = "PENDING_REVIEW", page = 1, pageSize = 20, search = "") => {
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search && search.trim()) {
      params.append("search", search.trim());
    }
    return apiClient<Paged<AdminBankAccountItem>>(`/admin/teacher-bank-accounts?${params.toString()}`);
  },
  adminApprove: (teacherId: string) =>
    apiClient<TeacherBankAccount>(`/admin/teacher-bank-accounts/${teacherId}/approve`, { method: "POST", body: "{}" }),
  adminReject: (teacherId: string, reviewNote: string) =>
    apiClient<TeacherBankAccount>(`/admin/teacher-bank-accounts/${teacherId}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }),
};
