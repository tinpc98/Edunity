import { apiClient } from "../api/apiClient";
import type {
  Payment,
  ApiPayment,
  Transaction,
  ApiTransaction,
  TeacherEarningsResponse,
} from "../types/payment";
import {
  adaptPayments,
  adaptTransactions,
  adaptTeacherEarnings,
} from "../api/paymentAdapters";

export const financeKeys = {
  all: ["finance"] as const,
  teacherEarnings: () => ["finance", "teacherEarnings"] as const,
  adminPayments: (page = 1, limit = 20, status?: string) =>
    ["finance", "adminPayments", page, limit, status] as const,
  adminTransactions: (page = 1, limit = 20, type?: string, status?: string) =>
    ["finance", "adminTransactions", page, limit, type, status] as const,
};

export const financeService = {
  /**
   * Teacher: Get teacher's earnings breakdown and aggregated summary.
   * GET /api/teacher/earnings
   */
  async getTeacherEarnings(): Promise<TeacherEarningsResponse> {
    const data = await apiClient<any>(`/teacher/earnings`);
    return adaptTeacherEarnings(data);
  },

  /**
   * Admin: List all payments across platform with pagination and status filter.
   * GET /api/admin/payments?page=...&limit=...&status=...
   */
  async getAdminPayments(
    page = 1,
    limit = 20,
    status?: string
  ): Promise<{ items: Payment[]; total: number; page: number; limit: number; totalPages: number }> {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status && status !== "ALL") {
      query.set("status", status);
    }

    const data = await apiClient<{
      items: ApiPayment[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/admin/payments?${query.toString()}`);

    return {
      items: adaptPayments(data.items || []),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * Admin: List all ledger transactions with pagination, type, and status filters.
   * GET /api/admin/transactions?page=...&limit=...&type=...&status=...
   */
  async getAdminTransactions(
    page = 1,
    limit = 20,
    type?: string,
    status?: string
  ): Promise<{ items: Transaction[]; total: number; page: number; limit: number; totalPages: number }> {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (type && type !== "ALL") {
      query.set("type", type);
    }
    if (status && status !== "ALL") {
      query.set("status", status);
    }

    const data = await apiClient<{
      items: ApiTransaction[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/admin/transactions?${query.toString()}`);

    return {
      items: adaptTransactions(data.items || []),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
      totalPages: data.totalPages || 1,
    };
  },
};
