import { apiClient } from "../api/apiClient";
import type {
  ApiPayment,
  Payment,
  CreatePaymentResponse,
  WebhookResult,
} from "../types/payment";
import { adaptPayment, adaptPayments } from "../api/paymentAdapters";
import { enrollmentService } from "./enrollment.service";

export const paymentKeys = {
  all: ["payments"] as const,
  detail: (id: string) => ["payments", "detail", id] as const,
  intent: (id: string) => ["payments", "intent", id] as const,
  byEnrollment: (enrollmentId: string) => ["payments", "enrollment", enrollmentId] as const,
  myPayments: (userId: string) => ["payments", "my", userId] as const,
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
   * Student: Aggregate payment history across all of the student's enrollments.
   */
  async getMyPayments(): Promise<Payment[]> {
    const enrollmentsRes = await enrollmentService.getMyEnrollments(1, 100, "class");
    const enrollments = enrollmentsRes.items;
    if (enrollments.length === 0) return [];

    const results = await Promise.allSettled(
      enrollments.map(async (enr) => {
        const payments = await this.getPaymentHistory(enr.id);
        return payments.map((p) => ({
          ...p,
          classId: enr.classId,
          className: enr.class?.className || `Lớp #${enr.classId.slice(-6)}`,
        }));
      })
    );

    const allPayments: Payment[] = [];
    for (const res of results) {
      if (res.status === "fulfilled") {
        allPayments.push(...res.value);
      }
    }

    return allPayments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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
