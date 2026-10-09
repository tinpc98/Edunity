import { apiClient } from "../api/apiClient";
import type {
  ApiEnrollment,
  Enrollment,
  ClassAvailability,
  PagedEnrollmentsResponse,
} from "../types/enrollment";
import { adaptEnrollment, adaptEnrollments } from "../api/enrollmentAdapters";

export const enrollmentKeys = {
  all: ["enrollments"] as const,
  myList: (page = 1, limit = 20) => ["enrollments", "myList", page, limit] as const,
  detail: (id: string) => ["enrollments", "detail", id] as const,
  availability: (classId: string) => ["classes", "availability", classId] as const,
};

export const enrollmentService = {
  /**
   * Public: Get real class capacity, enrolledCount, remaining seats and open window.
   * GET /api/classes/:classId/availability
   */
  async getClassAvailability(classId: string): Promise<ClassAvailability> {
    const data = await apiClient<ClassAvailability>(`/classes/${classId}/availability`);
    return {
      capacity: Number(data.capacity) || 0,
      enrolledCount: Number(data.enrolledCount) || 0,
      remaining: Math.max(0, Number(data.remaining) || 0),
      enrollmentOpen: Boolean(data.enrollmentOpen),
      classType: data.classType || "FREE",
      price: Number(data.price) || 0,
    };
  },

  /**
   * Student: Create enrollment in a class.
   * POST /api/classes/:classId/enrollments
   * - FREE class: returns CONFIRMED immediately.
   * - PAID class: returns PENDING_PAYMENT with 15-minute holdExpiresAt.
   */
  async createEnrollment(classId: string): Promise<Enrollment> {
    const data = await apiClient<ApiEnrollment>(`/classes/${classId}/enrollments`, {
      method: "POST",
    });
    return adaptEnrollment(data);
  },

  /**
   * Student: Get authenticated student's enrollments.
   * GET /api/me/enrollments?page=...&limit=...&include=class
   */
  async getMyEnrollments(
    page = 1,
    limit = 20,
    include = "class"
  ): Promise<PagedEnrollmentsResponse> {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (include) {
      query.set("include", include);
    }
    const data = await apiClient<{
      items: ApiEnrollment[];
      page: number;
      limit: number;
      total: number;
    }>(`/me/enrollments?${query.toString()}`);

    return {
      items: adaptEnrollments(data.items || []),
      page: data.page || page,
      limit: data.limit || limit,
      total: data.total || 0,
    };
  },

  /**
   * Student: Get single enrollment detail by ID.
   * GET /api/enrollments/:id
   */
  async getEnrollmentById(id: string): Promise<Enrollment> {
    const data = await apiClient<ApiEnrollment>(`/enrollments/${id}`);
    return adaptEnrollment(data);
  },

  /**
   * Student: Cancel a PENDING_PAYMENT enrollment to release reserved seat.
   * POST /api/enrollments/:id/cancel
   */
  async cancelEnrollment(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(`/enrollments/${id}/cancel`, {
      method: "POST",
    });
  },

  /**
   * Helper for student learning view: fetches all active enrollments with class details.
   */
  async getEnrollmentsByStudent(_studentId?: string): Promise<Enrollment[]> {
    const res = await this.getMyEnrollments(1, 100, "class");
    return res.items;
  },

  /**
   * Compatibility wrapper for existing hooks:
   */
  async createOrGetPendingEnrollment(payload: { classId: string; studentId?: string }): Promise<Enrollment> {
    return this.createEnrollment(payload.classId);
  },

  async createFreeEnrollment(payload: { classId: string; studentId?: string }): Promise<Enrollment> {
    return this.createEnrollment(payload.classId);
  },

  async updateEnrollmentStatus(
    enrollmentId: string,
    status: Enrollment["enrollmentStatus"],
    amountPaid?: number
  ): Promise<Enrollment> {
    const enrollment = await this.getEnrollmentById(enrollmentId);
    return {
      ...enrollment,
      enrollmentStatus: status,
      amountPaidViaPayment: amountPaid ?? enrollment.amountPaidViaPayment,
    };
  },
};

export function saveClassEnrolledCountIncrement(_classId: string): void {
  // Mock compatibility stub for payment service
}

