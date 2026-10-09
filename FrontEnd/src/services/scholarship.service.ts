import { apiClient } from "../api/apiClient";
import type {
  ApiScholarship,
  Scholarship,
  PayWithScholarshipResult,
} from "../types/scholarship";
import {
  adaptScholarships,
} from "../api/scholarshipAdapters";

export const scholarshipKeys = {
  all: ["scholarships"] as const,
  myList: () => ["scholarships", "me"] as const,
  detail: (id: string) => ["scholarships", "detail", id] as const,
};

export const scholarshipService = {
  /**
   * Student: Get all granted scholarships
   * GET /api/me/scholarships
   */
  async getMyScholarships(): Promise<Scholarship[]> {
    const raw = await apiClient<ApiScholarship[]>("/me/scholarships");
    return adaptScholarships(raw || []);
  },

  /**
   * Student: Pay or reserve for an enrollment using scholarship
   * POST /api/enrollments/:id/scholarship-payment
   * - Full coverage: confirms enrollment immediately
   * - Mixed coverage: holds scholarship amount and leaves remainingDue for co-pay
   */
  async payWithScholarship(
    enrollmentId: string,
    scholarshipId?: string
  ): Promise<PayWithScholarshipResult> {
    const raw = await apiClient<any>(`/enrollments/${enrollmentId}/scholarship-payment`, {
      method: "POST",
      body: JSON.stringify(scholarshipId ? { scholarshipId } : {}),
    });

    return {
      enrollmentId: raw.enrollmentId,
      enrollmentStatus: raw.enrollmentStatus,
      paymentSource: raw.paymentSource,
      tuitionAmount: typeof raw.tuitionAmount === "object" ? Number(raw.tuitionAmount.$numberDecimal || raw.tuitionAmount) : Number(raw.tuitionAmount),
      scholarshipId: raw.scholarshipId,
      scholarshipUsageId: raw.scholarshipUsageId,
      scholarshipAmount: typeof raw.scholarshipAmount === "object" ? Number(raw.scholarshipAmount.$numberDecimal || raw.scholarshipAmount) : Number(raw.scholarshipAmount),
      remainingDue: typeof raw.remainingDue === "object" ? Number(raw.remainingDue.$numberDecimal || raw.remainingDue) : Number(raw.remainingDue),
      holdExpiresAt: raw.holdExpiresAt || null,
    };
  },
};
