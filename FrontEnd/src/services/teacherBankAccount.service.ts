import { apiClient } from "../api/apiClient";
import type { Paged } from "../types/teacherVerification";

export const TEACHER_BANK_ACCOUNT_KEY = ["teacher-bank-account"];

export type BankAccountStatus = "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
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

export const BANK_STATUS_META: Record<BankAccountStatus, { label: string; color: string }> = {
  PENDING_REVIEW: { label: "Chờ duyệt", color: "processing" },
  VERIFIED: { label: "Đã duyệt", color: "success" },
  REJECTED: { label: "Bị từ chối", color: "error" },
};

export const teacherBankAccountService = {
  getMine: () => apiClient<TeacherBankAccount | null>("/teacher/bank-account"),
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
