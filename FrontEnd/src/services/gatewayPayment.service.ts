import { apiClient } from "../api/apiClient";
import type {
  ApiPayment,
  Payment,
  CreatePaymentResponse,
  WebhookResult,
} from "../types/payment";
import { adaptPayment, adaptPayments } from "../api/paymentAdapters";

export const paymentKeys = {
  all: ["payments"] as const,
  detail: (id: string) => ["payments", "detail", id] as const,
  intent: (id: string) => ["payments", "intent", id] as const,
  byEnrollment: (enrollmentId: string) => ["payments", "enrollment", enrollmentId] as const,
  myPayments: (userId: string) => ["payments", "my", userId] as const,
  myPaymentPage: (userId: string, page: number) => ["payments", "my", userId, page] as const,
};

export const gatewayPaymentService = {
  /**
   * Student: Create a Payment Intent (payOS VietQR / Sandbox fallback) for a PENDING_PAYMENT enrollment.
   * POST /api/enrollments/:id/payments
   */
  async createPayment(enrollmentId: string): Promise<CreatePaymentResponse> {
    const data = await apiClient<any>(`/enrollments/${enrollmentId}/payments`, {
      method: "POST",
    });
    const adapted = adaptPayment(data);
    return {
      paymentId: adapted.paymentId,
      purpose: adapted.purpose,
      channelKey: adapted.channelKey,
      provider: adapted.provider,
      gateway: adapted.gateway,
      gatewayReference: adapted.gatewayReference,
      orderCode: adapted.orderCode,
      paymentLinkId: adapted.paymentLinkId,
      qrCode: adapted.qrCode,
      checkoutUrl: adapted.checkoutUrl,
      currency: adapted.currency,
      amount: adapted.amount,
      tuitionAmount: adapted.tuitionAmount,
      scholarshipAmount: adapted.scholarshipAmount,
      enrollmentId: adapted.enrollmentId || enrollmentId,
      campaignId: adapted.campaignId,
      contributionId: adapted.contributionId,
      holdExpiresAt: adapted.holdExpiresAt,
      expiredAt: adapted.expiredAt,
      remainingSeconds: adapted.remainingSeconds,
      paymentStatus: adapted.paymentStatus,
      providerStatus: adapted.providerStatus,
      enrollmentStatus: adapted.enrollmentStatus,
      paymentSource: adapted.paymentSource,
      isAnonymous: adapted.isAnonymous,
      donorDisplayName: adapted.donorDisplayName,
      providerMetadata: adapted.providerMetadata || null,
    };
  },

  /**
   * Student / Sponsor / Admin: Get single payment or donation intent status & details by ID.
   * GET /api/payments/:id
   */
  async getPaymentById(paymentId: string): Promise<Payment> {
    const data = await apiClient<ApiPayment>(`/payments/${paymentId}`);
    return adaptPayment(data);
  },

  /**
   * Student: Get payment history for a specific enrollment.
   * GET /api/enrollments/:id/payments
   */
  async getPaymentHistory(enrollmentId: string): Promise<Payment[]> {
    const data = await apiClient<ApiPayment[]>(`/enrollments/${enrollmentId}/payments`);
    return adaptPayments(data);
  },

  /**
   * Student: read the authenticated student's tuition payments.
   */
  async getMyPayments(): Promise<Payment[]> {
    return adaptPayments(await apiClient<ApiPayment[]>("/me/payments"));
  },

  async getMyPaymentPage(page: number, pageSize = 10) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const result = await apiClient<{ items: ApiPayment[]; total: number; page: number; pageSize: number; totalPages: number }>(
      `/me/payments?${query}`
    );
    return { ...result, items: result.items.map(adaptPayment) };
  },

  /**
   * Simulate payment webhook result in development/test environment only.
   * POST /api/payments/sandbox/webhook
   */
  async simulateWebhook(
    gatewayReference: string,
    status: "SUCCESS" | "FAILED"
  ): Promise<WebhookResult> {
    return apiClient<WebhookResult>("/payments/sandbox/webhook", {
      method: "POST",
      body: JSON.stringify({ gatewayReference, status }),
    });
  },
};
