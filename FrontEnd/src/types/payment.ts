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
  teacherName?: string;
  classPrice?: number | string | null;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  payerName?: string | null;
  isRefundPending?: boolean;
  refundCase?: {
    caseNumber: string;
    status: string;
    reason: string;
    eligibleAmount?: number | string | null;
    approvedAmount?: number | string | null;
    beneficiaryBankAccount?: {
      bankName?: string;
      accountNumber?: string;
      accountHolderName?: string;
    };
    notes?: string;
  } | null;
  reconciliation?: {
    status: string;
    reason: string;
    resolutionAction?: string;
  } | null;
  campaignTitle?: string | null;
  campaignStatus?: string | null;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  reconciliationRequired?: boolean;
  reconciliationReason?: string | null;
  reconciliationStatus?: string | null;
  providerMetadata?: any;
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
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  payerName?: string | null;
  teacherName?: string;
  classPrice?: number | string | null;
  isRefundPending?: boolean;
  refundCase?: {
    caseNumber: string;
    status: string;
    reason: string;
    eligibleAmount?: number | string | null;
    approvedAmount?: number | string | null;
    beneficiaryBankAccount?: {
      bankName?: string;
      accountNumber?: string;
      accountHolderName?: string;
    };
    notes?: string;
  } | null;
  reconciliation?: {
    status: string;
    reason: string;
    resolutionAction?: string;
  } | null;
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
  providerMetadata?: {
    bin?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    description?: string | null;
  } | null;
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
  providerMetadata?: {
    bin?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    description?: string | null;
  } | null;
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
  _id?: string;
  transactionType: TransactionType;
  sourceUserId: string | any;
  sourceUser?: {
    email?: string;
    fullName?: string;
    role?: string;
    studentProfile?: { fullName?: string };
    teacherProfile?: { fullName?: string };
    sponsorProfile?: { representativeName?: string; organizationName?: string };
  };
  destinationUserId?: string | any;
  destinationUser?: {
    email?: string;
    fullName?: string;
    role?: string;
    studentProfile?: { fullName?: string };
    teacherProfile?: { fullName?: string };
    sponsorProfile?: { representativeName?: string; organizationName?: string };
  };
  relatedEnrollmentId?: any;
  relatedPaymentId?: any;
  relatedContributionId?: any;
  relatedBankEventId?: any;
  relatedScholarshipUsageId?: any;
  orderCode?: number | string | null;
  refundCase?: any;
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
  ENROLLMENT_PAYMENT: "Thu học phí",
  UNAPPLIED_TUITION_RECEIPT: "Thu học phí chờ xử lý",
  SCHOLARSHIP_USAGE: "Sử dụng học bổng",
  SPONSOR_CONTRIBUTION: "Nhận tài trợ",
  TEACHER_PAYOUT: "Chi trả giáo viên",
  REFUND: "Hoàn tiền",
};

export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  ENROLLMENT_PAYMENT: "teal",
  UNAPPLIED_TUITION_RECEIPT: "gold",
  SCHOLARSHIP_USAGE: "cyan",
  SPONSOR_CONTRIBUTION: "blue",
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
  normalizedError?: string | null;
  receivedAt: string;
  processedAt?: string;
  dispatchedAt?: string | null;
  linkedPaymentId?: any;
  contributionId?: any;
  metadata?: any;
  reconciliation?: {
    _id: string;
    status: string;
    reason?: string;
    orderCode?: number | null;
    resolutionNote?: string | null;
  } | null;
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
  refundCase?: any;
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

export type FinancePeriodType = "today" | "yesterday" | "3d" | "7d" | "30d" | "custom";

export interface FinanceOverviewParams {
  period?: FinancePeriodType;
  from?: string;
  to?: string;
}

export interface FinanceAnalyticsKpi {
  title: string;
  value: string;
  previousValue?: string;
  deltaPercent?: number | null;
  hasComparison?: boolean;
  trendDirection?: "up" | "down" | "neutral";
  trendLabel?: string;
  subtext?: string;
  variant?: "teal" | "mint" | "amber" | "rose" | "indigo" | "emerald";
  isSnapshot?: boolean;
  count?: number;
  openCasesCount?: number;
  completedValue?: string;
  pendingHold?: string;
  availableToWithdraw?: string;
}

export interface FinanceOverviewKpis {
  tuitionRevenue: FinanceAnalyticsKpi;
  donationRevenue: FinanceAnalyticsKpi;
  reconciliationPending: FinanceAnalyticsKpi;
  refundLiability: FinanceAnalyticsKpi;
  teacherPendingPayout: FinanceAnalyticsKpi;
  teacherPaidOut: FinanceAnalyticsKpi;
  platformFee: FinanceAnalyticsKpi;
}

export interface RevenueTimeSeriesPoint {
  key: string;
  label: string;
  tuition: number;
  donation: number;
  total: number;
}

export interface FundStructureDonut {
  tuition: number;
  donation: number;
  other: number;
  total: number;
  tuitionPercent: number;
  donationPercent: number;
  otherPercent: number;
}

export interface ReconciliationDistributionItem {
  key: string;
  status: string;
  label: string;
  count: number;
  amount: number;
  percent: number;
  color: string;
}

export interface RecentFinanceTransaction {
  id: string;
  code: string;
  type: string;
  rawType: string;
  amount: number;
  formattedAmount: string;
  isDebit: boolean;
  isCredit: boolean;
  createdAt: string;
  formattedDate: string;
  status: string;
  statusType: "success" | "warning" | "error" | "neutral";
  actorName?: string;
}

export interface FinanceOperationsSummary {
  syncStatus: string;
  syncStatusType: "success" | "warning" | "error" | "neutral";
  isRunning: boolean;
  processedCount: number;
  pendingCount: number;
  attentionCount: number;
  refundCasesOpen: number;
}

export interface TransactionStatusItem {
  key: string;
  label: string;
  count: number;
  amount: number;
  percent: number;
  color: string;
  subtext: string;
}

export interface FinanceOverviewData {
  period?: {
    key: string;
    from: string;
    to: string;
    label: string;
    granularity: string;
  };
  kpis?: FinanceOverviewKpis;
  charts?: {
    revenueTimeSeries: RevenueTimeSeriesPoint[];
    fundStructure: FundStructureDonut;
    reconciliationDistribution: ReconciliationDistributionItem[];
    transactionStatusDistribution?: TransactionStatusItem[];
  };
  recentTransactions?: RecentFinanceTransaction[];
  operationsSummary?: FinanceOperationsSummary;
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
    totalRuns?: number;
    totalDispatched?: number;
    totalReconciled?: number;
    totalFailed?: number;
    backlogCount?: number;
    exhaustedCount?: number;
  };
  disclaimer?: {
    receiptVsRevenue?: string;
    donationVsTuition?: string;
    refundExecution?: string;
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

export const ADMIN_PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Chờ phê duyệt",
  PROCESSING: "Đang xử lý",
  APPROVED: "Chờ chuyển tiền",
  SCHEDULED: "Chờ chuyển tiền (Thứ Sáu)",
  PENDING_BANK_TRANSFER: "Chờ xác nhận CK",
  COMPLETED: "Đã chi trả",
  FAILED: "Thất bại",
  REJECTED: "Đã từ chối",
};

export const TEACHER_PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Chờ Admin duyệt",
  PROCESSING: "Đang xử lý",
  APPROVED: "Chờ nhận tiền",
  SCHEDULED: "Chờ nhận tiền",
  PENDING_BANK_TRANSFER: "Chờ nhận tiền",
  COMPLETED: "Đã nhận tiền",
  FAILED: "Thất bại",
  REJECTED: "Bị từ chối",
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

export const parseAmountValue = (amount: any): number => {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === "number") return isNaN(amount) ? 0 : amount;
  if (typeof amount === "object") {
    if (amount.$numberDecimal !== undefined) {
      const parsed = parseFloat(amount.$numberDecimal);
      return isNaN(parsed) ? 0 : parsed;
    }
  }
  const parsed = parseFloat(String(amount));
  return isNaN(parsed) ? 0 : parsed;
};

export const formatVND = (amount: number | string | any | undefined | null): string => {
  const num = parseAmountValue(amount);
  return `${num.toLocaleString("vi-VN")} đ`;
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
  APPROVED: "Chờ chuyển tiền",
  PENDING_BANK_TRANSFER: "Chờ chuyển tiền",
  AWAITING_BANK_VERIFICATION: "Chờ xác minh hoàn tiền",
  COMPLETED: "Đã hoàn tất",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};

export const REFUND_STATUS_COLORS: Record<RefundStatus, string> = {
  NEEDS_REVIEW: "gold",
  IN_REVIEW: "blue",
  APPROVED: "orange",
  PENDING_BANK_TRANSFER: "orange",
  AWAITING_BANK_VERIFICATION: "purple",
  COMPLETED: "green",
  REJECTED: "red",
  CANCELLED: "default",
};

export const REFUND_REASON_LABELS: Record<string, string> = {
  OVERPAYMENT: "Thanh toán trùng",
  LATE_PAYMENT: "Thanh toán trễ",
  CLASS_CANCELLED: "Hủy lớp",
  STUDENT_DROPPED: "Học viên rút lui",
  TEACHER_NO_SHOW: "Giảng viên vắng",
  SESSION_CANCELLED: "Hủy buổi học",
  DISPUTE_SETTLED: "Giải quyết khiếu nại",
  CAMPAIGN_CLOSED: "Đóng chiến dịch",
  PURPOSE_MISMATCH: "Sai mục đích thanh toán",
  OTHER: "Lý do khác",
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
