/**
 * Backend-aligned Enrollment Types matching BackEnd/src/models/Enrollment.js
 * and BackEnd/src/controllers/enrollmentController.js
 */

export type EnrollmentStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type PaymentSource = "FREE" | "DIRECT_PAYMENT" | "SCHOLARSHIP" | "MIXED";

export interface PopulatedClassSummary {
  id: string;
  className: string;
  courseTitle: string;
  teacherName: string;
  subjectName?: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  classType?: "FREE" | "PAID";
  price?: number;
  capacity?: number;
  enrolledCount?: number;
}

export interface ApiEnrollment {
  _id: string;
  classId: string | any;
  courseId: string | any;
  teacherId: string | any;
  studentId: string | any;
  enrollmentStatus: EnrollmentStatus;
  paymentSource: PaymentSource;
  tuitionAmount: number | { $numberDecimal?: string } | string;
  amountPaidViaPayment: number | { $numberDecimal?: string } | string;
  amountPaidViaScholarship: number | { $numberDecimal?: string } | string;
  enrolledAt: string;
  holdExpiresAt: string | null;
  createdAt: string;
  updatedAt?: string;
  class?: PopulatedClassSummary;
  nextSession?: any;
}

export interface Enrollment {
  id: string;
  classId: string;
  courseId: string;
  teacherId: string;
  studentId: string;
  enrollmentStatus: EnrollmentStatus;
  paymentSource: PaymentSource;
  tuitionAmount: number;
  amountPaidViaPayment: number;
  amountPaidViaScholarship: number;
  enrolledAt: string;
  holdExpiresAt: string | null;
  createdAt: string;
  updatedAt?: string;
  class?: PopulatedClassSummary;
  nextSession?: any;
}

export interface ClassAvailability {
  capacity: number;
  enrolledCount: number;
  remaining: number;
  enrollmentOpen: boolean;
  classType: "FREE" | "PAID";
  price: number;
}

export interface PagedEnrollmentsResponse {
  items: Enrollment[];
  page: number;
  limit: number;
  total: number;
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  COMPLETED: "Hoàn thành",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
};

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  PENDING_PAYMENT: "gold",
  CONFIRMED: "green",
  COMPLETED: "blue",
  FAILED: "red",
  CANCELLED: "default",
  EXPIRED: "volcano",
};

export type EnrollmentEntity = Enrollment;

export interface CreateEnrollmentPayload {
  classId: string;
  studentId?: string;
}

