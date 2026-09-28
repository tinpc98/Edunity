/**
 * Backend-aligned Enrollment Types matching BackEnd/src/models/Enrollment.js
 */

export type EnrollmentStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type PaymentSource = "FREE" | "DIRECT_PAYMENT" | "SCHOLARSHIP" | "MIXED";

export interface EnrollmentEntity {
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
}

export interface CreateEnrollmentPayload {
  classId: string;
  studentId: string;
}
