import { apiClient } from "../api/apiClient";
import type {
  Payment,
  ApiPayment,
  Transaction,
  ApiTransaction,
  TeacherEarningsResponse,
  FinanceOverviewData,
  BankTransferEventItem,
  PaymentReconciliationItem,
  PayoutStatus,
  TeacherSettlementSummaryResponse,
} from "../types/payment";
import {
  adaptPayments,
  adaptTransactions,
  adaptTeacherEarnings,
} from "../api/paymentAdapters";

export type { PayoutStatus };

export interface Payout {
  id: string;
  teacherId: string;
  teacherName?: string | null;
  teacherEmail?: string | null;
  amount: string;
  status: PayoutStatus;
  bankAccountSnapshot: { bankName: string; accountNumber: string; accountHolderName: string };
  requestedAt: string;
  approvedAt?: string | null;
  scheduledAt?: string | null;
  processedAt?: string | null;
  reviewNote?: string | null;
  bankTransferProof?: {
    bankReference?: string | null;
    transferProofImage?: string | null;
    paidAt?: string | null;
    executedBy?: any;
    note?: string | null;
  };
  attachedEarningsCount?: number;
}

/** Bank details are never sent: the payout goes to the teacher's verified bank account (BAO-09). */
export interface PayoutRequestPayload {
  amount?: number;
}

export interface TransactionFilterParams {
  page?: number;
  limit?: number;
  type?: string;
  transactionType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  orderCode?: string;
}

export interface BankEventFilterParams {
  page?: number;
  limit?: number;
  channelKey?: string;
  eventStatus?: string;
  dispatchStatus?: string;
  provider?: string;
  isExhausted?: boolean | string;
  orderCode?: string;
  providerReference?: string;
  startDate?: string;
  endDate?: string;
}

export interface ReconciliationFilterParams {
  page?: number;
  limit?: number;
  status?: string;
  reason?: string;
  channelKey?: string;
  purpose?: string;
  orderCode?: string;
  assignedTo?: string;
  startDate?: string;
  endDate?: string;
}

export const financeKeys = {
  all: ["finance"] as const,
  overview: () => ["finance", "overview"] as const,
  teacherPayouts: () => ["finance", "teacherPayouts"] as const,
  teacherSettlements: () => ["finance", "teacherSettlements"] as const,
  adminPayouts: (page = 1, status?: string) => ["finance", "adminPayouts", page, status] as const,
  adminPayoutDetail: (id: string) => ["finance", "adminPayoutDetail", id] as const,
  teacherEarnings: () => ["finance", "teacherEarnings"] as const,
  adminPayments: (page = 1, limit = 20, status?: string) =>
    ["finance", "adminPayments", page, limit, status] as const,
  adminTransactions: (params?: TransactionFilterParams) =>
    ["finance", "adminTransactions", params] as const,
  adminBankEvents: (params?: BankEventFilterParams) =>
    ["finance", "adminBankEvents", params] as const,
  adminBankEventDetail: (id: string) => ["finance", "adminBankEventDetail", id] as const,
  adminReconciliations: (params?: ReconciliationFilterParams) =>
    ["finance", "adminReconciliations", params] as const,
  adminReconciliationDetail: (id: string) => ["finance", "adminReconciliationDetail", id] as const,
};

export const financeService = {
  /** Admin: Financial Dashboard Overview */
  async getFinanceOverview(): Promise<FinanceOverviewData> {
    return apiClient<FinanceOverviewData>(`/admin/overview`);
  },

  /** Teacher: payout requests. GET /api/teacher/payouts */
  async getMyPayouts(): Promise<Payout[]> {
    return apiClient<Payout[]>(`/teacher/payouts`);
  },

  /** Teacher: settlements & withdrawal window. GET /api/teacher/settlements */
  async getTeacherSettlements(): Promise<TeacherSettlementSummaryResponse> {
    return apiClient<TeacherSettlementSummaryResponse>(`/teacher/settlements`);
  },

  /** Teacher/Admin: get payout details. GET /api/teacher/payouts/:id */
  async getPayoutDetails(id: string): Promise<Payout> {
    return apiClient<Payout>(`/teacher/payouts/${id}`);
  },

  /** Teacher: request a payout. POST /api/teacher/payouts */
  async requestPayout(payload: PayoutRequestPayload): Promise<Payout> {
    return apiClient<Payout>(`/teacher/payouts`, { method: "POST", body: JSON.stringify(payload) });
  },

  /** Admin: payout queue. GET /api/admin/payouts */
  async getAdminPayouts(page = 1, status?: string): Promise<{ items: Payout[]; total: number; page: number; totalPages: number }> {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status && status !== "ALL") query.set("status", status);
    return apiClient(`/admin/payouts?${query.toString()}`);
  },

  /** Admin: approve payout & schedule Friday payout. POST /api/admin/payouts/:id/approve */
  async approvePayout(id: string, note?: string): Promise<Payout> {
    return apiClient<Payout>(`/admin/payouts/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
  },

  /** Admin: bank transfer done with proof. POST /api/admin/payouts/:id/complete */
  async completePayout(
    id: string,
    payload: { bankReference?: string; transferProofImage?: string; note?: string } | string = {}
  ): Promise<Payout> {
    const body = typeof payload === "string" ? { note: payload } : payload;
    return apiClient<Payout>(`/admin/payouts/${id}/complete`, { method: "POST", body: JSON.stringify(body) });
  },

  /** Admin: reject (earnings are released for a new request). POST /api/admin/payouts/:id/reject */
  async rejectPayout(id: string, note: string): Promise<Payout> {
    return apiClient<Payout>(`/admin/payouts/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
  },

  /** Admin: manual trigger settlement evaluation. POST /api/admin/finance/settlements/evaluate */
  async evaluateSettlements(): Promise<any> {
    return apiClient<any>(`/admin/finance/settlements/evaluate`, { method: "POST" });
  },

  /** Teacher: Get teacher's earnings breakdown. GET /api/teacher/earnings */
  async getTeacherEarnings(): Promise<TeacherEarningsResponse> {
    const data = await apiClient<any>(`/teacher/earnings`);
    return adaptTeacherEarnings(data);
  },

  /** Admin: List all payments. GET /api/admin/payments */
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
   * Admin: List all ledger transactions with advanced filters.
   * GET /api/admin/transactions
   */
  async getAdminTransactions(
    paramsOrPage: TransactionFilterParams | number = 1,
    limit = 20,
    type?: string,
    status?: string
  ): Promise<{
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary?: any;
  }> {
    const query = new URLSearchParams();

    if (typeof paramsOrPage === "object" && paramsOrPage !== null) {
      if (paramsOrPage.page) query.set("page", String(paramsOrPage.page));
      if (paramsOrPage.limit) query.set("limit", String(paramsOrPage.limit));
      const t = paramsOrPage.transactionType || paramsOrPage.type;
      if (t && t !== "ALL") query.set("type", t);
      if (paramsOrPage.status && paramsOrPage.status !== "ALL") query.set("status", paramsOrPage.status);
      if (paramsOrPage.startDate) query.set("startDate", paramsOrPage.startDate);
      if (paramsOrPage.endDate) query.set("endDate", paramsOrPage.endDate);
      if (paramsOrPage.orderCode) query.set("orderCode", paramsOrPage.orderCode);
    } else {
      query.set("page", String(paramsOrPage));
      query.set("limit", String(limit));
      if (type && type !== "ALL") query.set("type", type);
      if (status && status !== "ALL") query.set("status", status);
    }

    const data = await apiClient<{
      items: ApiTransaction[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      summary?: any;
    }>(`/admin/transactions?${query.toString()}`);

    return {
      items: adaptTransactions(data.items || []),
      total: data.total || 0,
      page: data.page || 1,
      limit: data.limit || limit,
      totalPages: data.totalPages || 1,
      summary: data.summary,
    };
  },

  /**
   * Admin: List BankTransferEvents (Gateway Webhooks & Outbox monitoring).
   * GET /api/admin/bank-events
   */
  async getAdminBankEvents(
    params: BankEventFilterParams = {}
  ): Promise<{
    items: BankTransferEventItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.channelKey && params.channelKey !== "ALL") query.set("channelKey", params.channelKey);
    if (params.eventStatus && params.eventStatus !== "ALL") query.set("eventStatus", params.eventStatus);
    if (params.dispatchStatus && params.dispatchStatus !== "ALL") query.set("dispatchStatus", params.dispatchStatus);
    if (params.provider && params.provider !== "ALL") query.set("provider", params.provider);
    if (params.isExhausted) query.set("isExhausted", "true");
    if (params.orderCode) query.set("orderCode", params.orderCode);
    if (params.providerReference) query.set("providerReference", params.providerReference);
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);

    return apiClient(`/admin/bank-events?${query.toString()}`);
  },

  /** Admin: Get BankTransferEvent details. GET /api/admin/bank-events/:id */
  async getAdminBankEventById(id: string): Promise<BankTransferEventItem> {
    return apiClient<BankTransferEventItem>(`/admin/bank-events/${id}`);
  },

  /**
   * Admin: List PaymentReconciliations.
   * GET /api/admin/reconciliations
   */
  async getAdminReconciliations(
    params: ReconciliationFilterParams = {}
  ): Promise<{
    items: PaymentReconciliationItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.status && params.status !== "ALL") query.set("status", params.status);
    if (params.reason && params.reason !== "ALL") query.set("reason", params.reason);
    if (params.channelKey && params.channelKey !== "ALL") query.set("channelKey", params.channelKey);
    if (params.orderCode) query.set("orderCode", params.orderCode);
    if (params.assignedTo) query.set("assignedTo", params.assignedTo);
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);

    return apiClient(`/admin/reconciliations?${query.toString()}`);
  },

  /** Admin: Get PaymentReconciliation details. GET /api/admin/reconciliations/:id */
  async getAdminReconciliationById(id: string): Promise<PaymentReconciliationItem> {
    return apiClient<PaymentReconciliationItem>(`/admin/reconciliations/${id}`);
  },

  /**
   * Admin: Assign reconciliation to admin.
   * PATCH /api/admin/reconciliations/:id/assign
   */
  async assignReconciliation(
    id: string,
    payload: { assignedTo?: string; note?: string }
  ): Promise<PaymentReconciliationItem> {
    return apiClient<PaymentReconciliationItem>(`/admin/reconciliations/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin: Add audit note to reconciliation.
   * POST /api/admin/reconciliations/:id/notes
   */
  async addReconciliationNote(
    id: string,
    payload: { note: string; action?: string }
  ): Promise<PaymentReconciliationItem> {
    return apiClient<PaymentReconciliationItem>(`/admin/reconciliations/${id}/notes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Admin: Verify payout bank proof (Four-Eyes Principle / Independent Verification).
   * POST /api/admin/payouts/:id/verify
   */
  async verifyPayoutProof(
    payoutId: string,
    payload: { bankReference?: string; enforceDifferentAdmin?: boolean } = {}
  ): Promise<{ success: boolean; data: Payout }> {
    return apiClient<{ success: boolean; data: Payout }>(`/admin/payouts/${payoutId}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ==========================================
  // Safe Refund APIs (PR8)
  // ==========================================

  /** Admin: List refund cases with filtering and pagination. GET /api/admin/finance/refunds */
  async listRefundCases(params: Record<string, any> = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.status && params.status !== "ALL") query.set("status", params.status);
    if (params.purpose && params.purpose !== "ALL") query.set("purpose", params.purpose);
    if (params.channelKey && params.channelKey !== "ALL") query.set("channelKey", params.channelKey);
    if (params.search) query.set("search", params.search);

    return apiClient(`/admin/finance/refunds?${query.toString()}`);
  },

  /** Admin: Get refund case detail. GET /api/admin/finance/refunds/:id */
  async getRefundCaseById(id: string): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}`);
  },

  /** Admin: Create refund case. POST /api/admin/finance/refunds */
  async createRefundCase(payload: any): Promise<any> {
    return apiClient(`/admin/finance/refunds`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Admin: Review refund case (IN_REVIEW). POST /api/admin/finance/refunds/:id/review */
  async reviewRefundCase(id: string, payload: { note?: string } = {}): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Admin: Approve refund case. POST /api/admin/finance/refunds/:id/approve */
  async approveRefundCase(id: string, payload: { approvedAmount?: number; note?: string } = {}): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Admin: Reject refund case. POST /api/admin/finance/refunds/:id/reject */
  async rejectRefundCase(id: string, payload: { rejectionNote: string }): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Admin: Submit bank transfer evidence for refund. POST /api/admin/finance/refunds/:id/evidence */
  async submitRefundProof(id: string, payload: { bankReference: string; transferProofImage?: string; notes?: string; autoVerify?: boolean }): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}/evidence`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Admin: Verify bank proof and complete refund. POST /api/admin/finance/refunds/:id/verify */
  async verifyAndCompleteRefund(id: string, payload: { bankReference?: string; enforceDifferentAdmin?: boolean } = {}): Promise<any> {
    return apiClient(`/admin/finance/refunds/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
