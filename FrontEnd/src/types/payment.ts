/**
 * Backend-aligned Payment, Transaction, and Finance Types
 * matching BackEnd models: Payment.js, Transaction.js, TeacherEarning.js
 */

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export interface ApiPayment {
  _id: string;
  enrollmentId: string | any;
  payerUserId: string | any;
  gateway: string;
  gatewayReference: string;
  amount: number | { $numberDecimal?: string } | string;
  paymentStatus: PaymentStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
  enrollmentStatus?: string;
  paymentSource?: string;
  holdExpiresAt?: string | null;
  classId?: string;
  className?: string;
}

export interface Payment {
  id: string;
  enrollmentId: string;
  payerUserId: string;
  gateway: string;
  gatewayReference: string;
  amount: number;
  paymentStatus: PaymentStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
  enrollmentStatus?: string;
  paymentSource?: string;
  holdExpiresAt?: string | null;
  classId?: string;
  className?: string;
  errorMessage?: string;
}

export type PaymentEntity = Payment;

export interface CreatePaymentPayload {
  enrollmentId: string;
  payerUserId?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  gatewayReference: string;
  amount: number;
  enrollmentId: string;
  holdExpiresAt?: string | null;
}

export interface WebhookResult {
  paymentStatus: PaymentStatus;
  enrollmentStatus?: string | null;
  result: "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "IDEMPOTENT" | "LATE_PAYMENT_REFUND_REQUIRED" | string;
}

export type TransactionType =
  | "ENROLLMENT_PAYMENT"
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
  relatedEnrollmentId?: string;
  relatedPaymentId?: string;
  relatedScholarshipUsageId?: string;
  amount: number | { $numberDecimal?: string } | string;
  status: TransactionStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  transactionType: TransactionType;
  sourceUserId: string;
  destinationUserId?: string;
  relatedEnrollmentId?: string;
  relatedPaymentId?: string;
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

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ENROLLMENT_PAYMENT: "Thanh toán học phí",
  SCHOLARSHIP_USAGE: "Sử dụng học bổng",
  SPONSOR_CONTRIBUTION: "Đóng góp tài trợ",
  TEACHER_PAYOUT: "Rút tiền giảng viên",
  REFUND: "Hoàn tiền",
};

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

export const formatVND = (amount: number | string | undefined | null): string => {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
  return `${(isNaN(num) ? 0 : num).toLocaleString("vi-VN")} đ`;
};
