import type {
  CreatePaymentPayload,
  PaymentEntity,
  PaymentStatus,
} from "../types/payment";
import type { EnrollmentEntity } from "../types/enrollment";
import {
  enrollmentService,
  saveClassEnrolledCountIncrement,
} from "./enrollment.service";

const PAYMENTS_STORAGE_KEY = "edunity_mock_payments";
const SCENARIO_STORAGE_KEY = "edunity_mock_payment_scenario";

export type MockPaymentScenario = "SUCCESS" | "FAILED";

function getStoredPayments(): PaymentEntity[] {
  try {
    const raw = localStorage.getItem(PAYMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to parse payments from localStorage:", error);
    return [];
  }
}

function saveStoredPayments(payments: PaymentEntity[]): void {
  try {
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments));
  } catch (error) {
    console.error("Failed to save payments to localStorage:", error);
  }
}

export class PaymentError extends Error {
  payment?: PaymentEntity;
  constructor(message: string, payment?: PaymentEntity) {
    super(message);
    this.name = "PaymentError";
    this.payment = payment;
  }
}

class PaymentService {
  getMockScenario(): MockPaymentScenario {
    try {
      const saved = localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (saved === "FAILED" || saved === "SUCCESS") {
        return saved;
      }
    } catch {}
    return "SUCCESS";
  }

  setMockScenario(scenario: MockPaymentScenario): void {
    try {
      localStorage.setItem(SCENARIO_STORAGE_KEY, scenario);
    } catch {}
  }

  async getPaymentsByEnrollmentId(enrollmentId: string): Promise<PaymentEntity[]> {
    await new Promise((res) => setTimeout(res, 100));
    const all = getStoredPayments();
    return all.filter((p) => p.enrollmentId === enrollmentId);
  }

  async getMyPayments(userId: string) {
    await new Promise((res) => setTimeout(res, 300));
    const all = getStoredPayments();
    const myPayments = all.filter((p) => p.payerUserId === userId);
    
    // Sort by createdAt desc
    myPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Resolve enrollment and class data
    const result = await Promise.all(
      myPayments.map(async (payment) => {
        let className = "Unknown Class";
        let enrollmentStatus = "UNKNOWN";

        try {
          const enrollment = await enrollmentService.getEnrollmentById(payment.enrollmentId);
          if (enrollment) {
            enrollmentStatus = enrollment.enrollmentStatus;
            
            // In a real app we might have to fetch class details, 
            // but for now we'll do our best with what we have in enrollment mock data.
            // Enrollment usually has classId, we can get it from classDiscoveryService
            const { classDiscoveryService } = await import("./classDiscovery.service");
            const cls = await classDiscoveryService.fetchClassById(enrollment.classId);
            if (cls) {
              className = cls.title;
            }
          }
        } catch (error) {
          console.error("Error resolving enrollment for payment", error);
        }

        return {
          ...payment,
          className,
          enrollmentStatus,
        };
      })
    );

    return result;
  }

  async getPaymentById(id: string): Promise<PaymentEntity | null> {
    await new Promise((res) => setTimeout(res, 100));
    const all = getStoredPayments();
    return all.find((p) => p.id === id) || null;
  }

  /**
   * Creates a new Payment attempt for an enrollment.
   * If scenario is SUCCESS: Payment COMPLETED, Enrollment CONFIRMED.
   * If scenario is FAILED: Payment FAILED, Enrollment remains PENDING_PAYMENT, throws PaymentError.
   */
  async createPaymentAttempt(
    payload: CreatePaymentPayload
  ): Promise<{ payment: PaymentEntity; enrollment: EnrollmentEntity }> {
    // Simulate real network/gateway latency
    await new Promise((res) => setTimeout(res, 800));

    const enrollment = await enrollmentService.getEnrollmentById(payload.enrollmentId);
    if (!enrollment) {
      throw new Error("Không tìm thấy thông tin đăng ký lớp học.");
    }

    if (enrollment.enrollmentStatus === "CONFIRMED" || enrollment.enrollmentStatus === "COMPLETED") {
      throw new Error("Đăng ký này đã được thanh toán thành công trước đó.");
    }

    if (enrollment.enrollmentStatus === "EXPIRED") {
      throw new Error("Thời gian giữ chỗ đã hết. Vui lòng quay lại trang lớp học để đăng ký lại.");
    }

    // Check expiration timestamp
    if (
      enrollment.holdExpiresAt &&
      new Date(enrollment.holdExpiresAt).getTime() <= Date.now()
    ) {
      await enrollmentService.updateEnrollmentStatus(enrollment.id, "EXPIRED");
      throw new Error("Thời gian giữ chỗ đã hết. Vui lòng quay lại trang lớp học để đăng ký lại.");
    }

    const scenario = this.getMockScenario();
    const allPayments = getStoredPayments();
    const now = new Date();

    const paymentId = `pay_${Date.now()}`;
    const gatewayReference = `MOCK_TXN_${Date.now()}`;

    if (scenario === "FAILED") {
      const failedPayment: PaymentEntity = {
        id: paymentId,
        enrollmentId: enrollment.id,
        payerUserId: payload.payerUserId,
        gateway: "MOCK_DIRECT",
        gatewayReference,
        amount: enrollment.tuitionAmount,
        paymentStatus: "FAILED" as PaymentStatus,
        errorMessage: "Thanh toán chưa thành công. Vui lòng thử lại.",
        createdAt: now.toISOString(),
      };

      allPayments.push(failedPayment);
      saveStoredPayments(allPayments);

      throw new PaymentError("Thanh toán chưa thành công. Vui lòng thử lại.", failedPayment);
    }

    // SUCCESS scenario
    const completedPayment: PaymentEntity = {
      id: paymentId,
      enrollmentId: enrollment.id,
      payerUserId: payload.payerUserId,
      gateway: "MOCK_DIRECT",
      gatewayReference,
      amount: enrollment.tuitionAmount,
      paymentStatus: "COMPLETED" as PaymentStatus,
      paidAt: now.toISOString(),
      createdAt: now.toISOString(),
    };

    allPayments.push(completedPayment);
    saveStoredPayments(allPayments);

    // Confirm enrollment and increment class enrolled count
    const updatedEnrollment = await enrollmentService.updateEnrollmentStatus(
      enrollment.id,
      "CONFIRMED",
      enrollment.tuitionAmount
    );

    saveClassEnrolledCountIncrement(enrollment.classId);

    return {
      payment: completedPayment,
      enrollment: updatedEnrollment,
    };
  }
}

export const paymentService = new PaymentService();
