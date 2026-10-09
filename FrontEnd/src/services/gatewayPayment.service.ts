import { apiClient } from "../api/apiClient";
import type {
  Payment,
  ApiPayment,
  CreatePaymentResponse,
  WebhookResult,
} from "../types/payment";
import { adaptPayment, adaptPayments } from "../api/paymentAdapters";

export const paymentKeys = {
  all: ["payments"] as const,
  history: (enrollmentId: string) => ["payments", "history", enrollmentId] as const,
  myPayments: () => ["payments", "myPayments"] as const,
  detail: (id: string) => ["payments", "detail", id] as const,
};

export const gatewayPaymentService = {
  /**
   * Student: Create or retrieve existing PENDING payment for an enrollment.
   * POST /api/enrollments/:id/payments
   * Backend calculates amount canonically from Class.price.
   */
  async createPayment(enrollmentId: string): Promise<CreatePaymentResponse> {
    const data = await apiClient<{
      paymentId: string;
      gatewayReference: string;
      amount: number | string;
      enrollmentId: string;
      holdExpiresAt?: string | null;
    }>(`/enrollments/${enrollmentId}/payments`, {
      method: "POST",
    });

    return {
      paymentId: data.paymentId,
      gatewayReference: data.gatewayReference,
      amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount as string) || 0,
      enrollmentId: data.enrollmentId,
      holdExpiresAt: data.holdExpiresAt || null,
    };
  },

  /**
   * Get single Payment by ID.
   * GET /api/payments/:id
   */
  async getPaymentById(paymentId: string): Promise<Payment> {
    const data = await apiClient<ApiPayment>(`/payments/${paymentId}`);
    return adaptPayment(data);
  },

  /**
   * Student: Get payment attempts history for a specific enrollment.
   * GET /api/enrollments/:id/payments
   */
  async getPaymentHistory(enrollmentId: string): Promise<Payment[]> {
    const data = await apiClient<ApiPayment[]>(`/enrollments/${enrollmentId}/payments`);
    return adaptPayments(data);
  },

  /**
   * Student: Get full payment history for authenticated student.
   * GET /api/me/payments
   */
  async getMyPayments(): Promise<Payment[]> {
    const data = await apiClient<ApiPayment[]>(`/me/payments`);
    return adaptPayments(data);
  },

  /**
   * Sandbox only: Simulate gateway webhook to confirm or fail a payment.
   * POST /api/payments/sandbox/webhook
   * Body: { gatewayReference, status: "SUCCESS" | "FAILED" }
   */
  async triggerSandboxWebhook(
    gatewayReference: string,
    status: "SUCCESS" | "FAILED"
  ): Promise<WebhookResult> {
    const data = await apiClient<WebhookResult>(`/payments/sandbox/webhook`, {
      method: "POST",
      body: JSON.stringify({ gatewayReference, status }),
    });
    return data;
  },

  /**
   * Backward compatibility helper for existing checkout page
   */
  async createPaymentAttempt(payload: { enrollmentId: string }): Promise<CreatePaymentResponse> {
    return this.createPayment(payload.enrollmentId);
  },
};

export const paymentService = gatewayPaymentService;
