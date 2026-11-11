/**
 * Backend-aligned Payment, Transaction, and Finance Types
 * matching BackEnd models: Payment.js, SponsorContribution.js, Transaction.js, TeacherEarning.js
 */

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type PaymentPurpose = "TUITION" | "DONATION";
export type PaymentChannelKey = "TUITION" | "DONATION";

export type PaymentUiState =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "RECONCILIATION_REQUIRED"
  | "LATE_PAYMENT_REVIEW"
  | "REFUND_PENDING";

export interface ApiPayment {
  _id: string;
  paymentId?: string;
  purpose?: PaymentPurpose;
  channelKey?: PaymentChannelKey;
  provider?: string;
  enrollmentId?: string | any;
  campaignId?: string | any;
  contributionId?: string | any;
  payerUserId?: string | any;
  sponsorId?: string | any;
  gateway: string;
  gatewayReference?: string;
  paymentReference?: string;
  orderCode?: number | null;
  paymentLinkId?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  currency?: string;
  amount: number | { $numberDecimal?: string } | string;
  tuitionAmount?: number | { $numberDecimal?: string } | string;
  scholarshipAmount?: number | { $numberDecimal?: string } | string;
  paymentStatus: PaymentStatus;
  contributionStatus?: "PENDING" | "COMPLETED" | "FAILED";
  providerStatus?: string;
  paidAt?: string;
  contributedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  enrollmentStatus?: string | null;
  paymentSource?: string | null;
  holdExpiresAt?: string | null;
  expiredAt?: string | null;
  remainingSeconds?: number;
  classId?: string | null;
  className?: string;
  campaignTitle?: string | null;
  campaignStatus?: string | null;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  reconciliationRequired?: boolean;
  reconciliationReason?: string | null;
  reconciliationStatus?: string | null;
}

export interface Payment {
  id: string;
  paymentId: string;
  purpose: PaymentPurpose;
  channelKey: PaymentChannelKey;
  provider: string;
  enrollmentId: string;
  campaignId?: string | null;
  contributionId?: string | null;
  payerUserId: string;
  gateway: string;
  gatewayReference: string;
  orderCode: number | null;
  paymentLinkId: string | null;
  qrCode: string | null;
  checkoutUrl: string | null;
  currency: string;
  amount: number;
  tuitionAmount?: number;
  scholarshipAmount?: number;
  paymentStatus: PaymentStatus;
  contributionStatus?: "PENDING" | "COMPLETED" | "FAILED";
  providerStatus?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
  enrollmentStatus?: string | null;
  paymentSource?: string | null;
  holdExpiresAt?: string | null;
  expiredAt?: string | null;
  remainingSeconds?: number;
  classId?: string | null;
  className?: string;
  campaignTitle?: string | null;
  campaignStatus?: string | null;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  reconciliationRequired?: boolean;
  reconciliationReason?: string | null;
  reconciliationStatus?: string | null;
  errorMessage?: string;
}

export type PaymentEntity = Payment;

export interface CreatePaymentPayload {
  enrollmentId: string;
  payerUserId?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  purpose: PaymentPurpose;
  channelKey: PaymentChannelKey;
  provider: string;
  gateway: string;
  gatewayReference: string;
  orderCode: number | null;
  paymentLinkId: string | null;
  qrCode: string | null;
  checkoutUrl: string | null;
  currency: string;
  amount: number;
  tuitionAmount?: number;
  scholarshipAmount?: number;
  enrollmentId: string;
  campaignId?: string | null;
  contributionId?: string | null;
  holdExpiresAt?: string | null;
  expiredAt?: string | null;
  remainingSeconds?: number;
  paymentStatus: PaymentStatus;
  providerStatus?: string;
  enrollmentStatus?: string | null;
  paymentSource?: string | null;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
}

export interface WebhookResult {
  paymentStatus: PaymentStatus;
  enrollmentStatus?: string | null;
  result: "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "IDEMPOTENT" | "LATE_PAYMENT_REFUND_REQUIRED" | string;
}

export type TransactionType =
  | "ENROLLMENT_PAYMENT"
  | "UNAPPLIED_TUITION_RECEIPT"
  | "SCHOLARSHIP_USAGE"
  | "SPONSOR_CONTRIBUTION"
  | "TEACHER_PAYOUT"
  | "REFUND";

export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ApiTransaction {
  _id: string;
  transactionType: TransactionType;
  sourceUserId: string | any;
  destinationUserId?: string | any;
  relatedEnrollmentId?: string | any;
  relatedPaymentId?: string | any;
  relatedContributionId?: string | any;
  relatedBankEventId?: string | any;
  relatedScholarshipUsageId?: string | any;
  amount: number | { $numberDecimal?: string } | string;
  status: TransactionStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  transactionType: TransactionType;
  sourceUserId: string;
  sourceUser?: { email?: string; fullName?: string; role?: string };
  destinationUserId?: string;
  destinationUser?: { email?: string; fullName?: string; role?: string };
  relatedEnrollmentId?: string;
  relatedPaymentId?: string;
  relatedContributionId?: string;
  relatedBankEventId?: string;
  orderCode?: number | null;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
}

export type TeacherEarningStatus = "PENDING" | "AVAILABLE" | "PAID_OUT";

export interface TeacherEarningItem {
  id: string;
  classId?: string;
  className?: string;
  enrollmentId: string;
  grossAmount: number;
  commissionRate?: number;
  commissionAmount: number;
  netAmount: number;
  status: TeacherEarningStatus;
  createdAt: string;
}

export interface TeacherEarningsSummary {
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  pending: number;
  available: number;
  paidOut: number;
}

export interface TeacherEarningsResponse {
  items: TeacherEarningItem[];
  summary: TeacherEarningsSummary;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Chờ thanh toán",
  COMPLETED: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: "gold",
  COMPLETED: "green",
  FAILED: "red",
  REFUNDED: "purple",
};

export const PAYMENT_UI_STATE_LABELS: Record<PaymentUiState, string> = {
  PENDING: "Đang chờ thanh toán",
  PROCESSING: "Đang xác minh giao dịch",
  COMPLETED: "Đã ghi nhận thanh toán",
  FAILED: "Thanh toán chưa thành công",
  EXPIRED: "Mã QR đã hết hạn",
  RECONCILIATION_REQUIRED: "Đã ghi nhận giao dịch cần đối soát",
  LATE_PAYMENT_REVIEW: "Khoản tiền đến sau hạn, đang được kiểm tra",
  REFUND_PENDING: "Đang chờ xử lý hoàn tiền",
};

export const PAYMENT_UI_STATE_COLORS: Record<PaymentUiState, string> = {
  PENDING: "gold",
  PROCESSING: "processing",
  COMPLETED: "success",
  FAILED: "error",
  EXPIRED: "default",
  RECONCILIATION_REQUIRED: "warning",
  LATE_PAYMENT_REVIEW: "warning",
  REFUND_PENDING: "purple",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ENROLLMENT_PAYMENT: "Thanh toán học phí",
  UNAPPLIED_TUITION_RECEIPT: "Khoản thu học phí tạm giữ (đến muộn / cần đối soát)",
  SCHOLARSHIP_USAGE: "Sử dụng học bổng",
  SPONSOR_CONTRIBUTION: "Đóng góp tài trợ",
  TEACHER_PAYOUT: "Rút tiền giảng viên",
  REFUND: "Hoàn tiền",
};

export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  ENROLLMENT_PAYMENT: "blue",
  UNAPPLIED_TUITION_RECEIPT: "volcano",
  SCHOLARSHIP_USAGE: "cyan",
  SPONSOR_CONTRIBUTION: "green",
  TEACHER_PAYOUT: "magenta",
  REFUND: "purple",
};

export interface BankTransferEventItem {
  _id: string;
  provider: string;
  channelKey: "TUITION" | "DONATION";
  purpose: "TUITION" | "DONATION";
  orderCode: number;
  providerReference: string;
  paymentLinkId?: string | null;
  amount: number | string;
  currency: string;
  eventStatus: string;
  dispatchStatus: string;
  dispatchAttempts: number;
  lastDispatchError?: string | null;
  receivedAt: string;
  processedAt?: string;
  dispatchedAt?: string | null;
  linkedPaymentId?: any;
  contributionId?: any;
  metadata?: any;
}

export interface PaymentReconciliationItem {
  _id: string;
  eventId: any;
  purpose: "TUITION" | "DONATION";
  channelKey: "TUITION" | "DONATION";
  orderCode?: number | null;
  paymentId?: any;
  contributionId?: any;
  enrollmentId?: any;
  campaignId?: any;
  reason: string;
  expectedAmount?: number | string | null;
  receivedAmount: number | string;
  currency: string;
  status: "NEEDS_REVIEW" | "IN_REVIEW" | "RESOLVED_APPROVED" | "RESOLVED_REFUNDED" | "RESOLVED_IGNORED";
  assignedTo?: any;
  resolvedBy?: any;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  auditReferences: Array<{
    action?: string;
    note?: string;
    timestamp?: string;
  }>;
  createdAt: string;
  updatedAt?: string;
}

export interface FinanceOverviewData {
  revenue: {
    confirmedTuitionRevenue: string;
    confirmedDonationRevenue: string;
    unappliedLateReceipts: string;
    pendingRefundLiability: string;
    completedRefunds: string;
  };
  teacherEarnings: {
    pending: string;
    available: string;
    paidOut: string;
    note: string;
  };
  reconciliations: {
    total: number;
    open: number;
    byStatus: {
      needsReview: number;
      inReview: number;
      resolvedApproved: number;
      resolvedRefunded: number;
      resolvedIgnored: number;
    };
    byReason: Record<string, number>;
  };
  bankEvents: {
    total: number;
    byDispatchStatus: {
      pendingDispatch: number;
      dispatching: number;
      dispatched: number;
      dispatchFailed: number;
      reconciliationRequired: number;
      notRequired: number;
    };
    backlogCount: number;
    exhaustedCount: number;
  };
  outboxWorker: {
    jobName: string;
    isEnabled: boolean;
    isRunning: boolean;
    isTickInProgress: boolean;
    intervalMs: number;
    batchSize: number;
    startedAt: string | null;
    stoppedAt: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastRunStatus: string;
    lastError: any;
    lastSummary: any;
    totalRuns: number;
    totalDispatched: number;
    totalReconciled: number;
    totalFailed: number;
    backlogCount: number;
    exhaustedCount: number;
  };
  disclaimer: {
    receiptVsRevenue: string;
    donationVsTuition: string;
    refundExecution: string;
  };
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  FAILED: "Thất bại",
};

export const TRANSACTION_STATUS_COLORS: Record<TransactionStatus, string> = {
  PENDING: "gold",
  COMPLETED: "green",
  FAILED: "red",
};

export const TEACHER_EARNING_STATUS_LABELS: Record<TeacherEarningStatus, string> = {
  PENDING: "Chờ đối soát",
  AVAILABLE: "Khả dụng",
  PAID_OUT: "Đã thanh toán",
};

export const TEACHER_EARNING_STATUS_COLORS: Record<TeacherEarningStatus, string> = {
  PENDING: "gold",
  AVAILABLE: "green",
  PAID_OUT: "blue",
};

export type PayoutStatus =
  | "PENDING"
  | "PROCESSING"
  | "APPROVED"
  | "SCHEDULED"
  | "PENDING_BANK_TRANSFER"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED";

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Chờ phê duyệt",
  PROCESSING: "Đang xử lý",
  APPROVED: "Đã phê duyệt",
  SCHEDULED: "Đã lên lịch chi trả",
  PENDING_BANK_TRANSFER: "Chờ bằng chứng chuyển khoản",
  COMPLETED: "Đã chi trả thành công",
  FAILED: "Thất bại",
  REJECTED: "Đã từ chối",
};

export const PAYOUT_STATUS_COLORS: Record<PayoutStatus, string> = {
  PENDING: "gold",
  PROCESSING: "blue",
  APPROVED: "cyan",
  SCHEDULED: "purple",
  PENDING_BANK_TRANSFER: "orange",
  COMPLETED: "green",
  FAILED: "red",
  REJECTED: "red",
};

export interface TeacherSettlementItem {
  _id: string;
  earningId: any;
  teacherId: any;
  classId: any;
  enrollmentId: any;
  paymentId: any;
  grossAmount: number | string;
  platformFee: number | string;
  netAmount: number | string;
  status: "HELD" | "ELIGIBLE_PENDING_MATURITY" | "SETTLED_AVAILABLE" | "PAID_OUT";
  settlementEligibleSince?: string | null;
  maturationDueDate?: string | null;
  settledAt?: string | null;
  blockers?: Array<{
    code: string;
    message: string;
    detectedAt: string;
    resolved: boolean;
  }>;
  activeBlockersCount?: number;
}

export interface TeacherSettlementSummaryResponse {
  summary: {
    totalGross: number;
    totalCommission: number;
    totalNet: number;
    pendingHeld: number;
    pendingMaturing: number;
    pending: number;
    available: number;
    inPayout: number;
    paidOut: number;
    totalEarned: number;
  };
  window: {
    isMondayWithdrawalWindow: boolean;
    currentServerTime: string;
    vietnamTime: string;
    dayOfWeek: number;
    windowHours: string;
    notice: string;
  };
  items: any[];
}

export const formatVND = (amount: number | string | undefined | null): string => {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
  return `${(isNaN(num) ? 0 : num).toLocaleString("vi-VN")} đ`;
};

// ==========================================
// Safe Refund Types (PR8)
// ==========================================

export type RefundStatus =
  | "NEEDS_REVIEW"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PENDING_BANK_TRANSFER"
  | "AWAITING_BANK_VERIFICATION"
  | "COMPLETED"
  | "CANCELLED";

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  NEEDS_REVIEW: "Chờ xem xét",
  IN_REVIEW: "Đang xem xét",
  APPROVED: "Đã duyệt (Chờ chi)",
  REJECTED: "Đã từ chối",
  PENDING_BANK_TRANSFER: "Chờ chuyển khoản",
  AWAITING_BANK_VERIFICATION: "Chờ xác minh chứng từ",
  COMPLETED: "Đã hoàn tất",
  CANCELLED: "Đã hủy",
};

export const REFUND_STATUS_COLORS: Record<RefundStatus, string> = {
  NEEDS_REVIEW: "gold",
  IN_REVIEW: "blue",
  APPROVED: "cyan",
  REJECTED: "red",
  PENDING_BANK_TRANSFER: "orange",
  AWAITING_BANK_VERIFICATION: "purple",
  COMPLETED: "green",
  CANCELLED: "default",
};

export interface RefundCaseItem {
  _id: string;
  caseNumber: string;
  purpose: "TUITION" | "DONATION";
  channelKey: "TUITION" | "DONATION";
  sourcePaymentId?: any;
  relatedContributionId?: any;
  relatedEnrollmentId?: any;
  relatedClassId?: any;
  recipientUserId?: any;
  beneficiaryBankAccount: {
    bankName: string;
    accountNumber: string;
    accountHolderName: string;
  };
  originalAmount: number | string;
  eligibleAmount: number | string;
  approvedAmount?: number | string | null;
  currency: string;
  reason: string;
  reasonDetails?: string | null;
  status: RefundStatus;
  refundMethod: string;
  bankTransferProof?: {
    referenceNumber?: string | null;
    bankReference?: string | null;
    transferredAt?: string | null;
    transferProofImage?: string | null;
    verifiedBy?: any;
    verifiedAt?: string | null;
    notes?: string | null;
  };
  assignedTo?: any;
  reviewedBy?: any;
  approvedBy?: any;
  rejectionNote?: string | null;
  auditLogs?: Array<{
    action: string;
    actorId?: any;
    actorRole?: string;
    note?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface RefundCasesResponse {
  success: boolean;
  items: RefundCaseItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
