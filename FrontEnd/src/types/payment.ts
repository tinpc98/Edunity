/**
 * Backend-aligned Payment Types matching BackEnd/src/models/Payment.js
 */

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export interface PaymentEntity {
  id: string;
  enrollmentId: string;
  payerUserId: string;
  gateway: string;
  gatewayReference: string;
  amount: number;
  paymentStatus: PaymentStatus;
  paidAt?: string;
  createdAt: string;
  errorMessage?: string;
}

export interface CreatePaymentPayload {
  enrollmentId: string;
  payerUserId: string;
}
