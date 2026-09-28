import type {
  CreateEnrollmentPayload,
  EnrollmentEntity,
} from "../types/enrollment";
import { RAW_MOCK_CLASSES } from "../data/mockClassDiscovery";

const ENROLLMENTS_STORAGE_KEY = "edunity_mock_enrollments";
const CLASS_OVERRIDES_STORAGE_KEY = "edunity_mock_class_overrides";

function getStoredEnrollments(): EnrollmentEntity[] {
  try {
    const raw = localStorage.getItem(ENROLLMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to parse enrollments from localStorage:", error);
    return [];
  }
}

function saveStoredEnrollments(enrollments: EnrollmentEntity[]): void {
  try {
    localStorage.setItem(ENROLLMENTS_STORAGE_KEY, JSON.stringify(enrollments));
  } catch (error) {
    console.error("Failed to save enrollments to localStorage:", error);
  }
}

export function getStoredClassEnrolledCountOverride(classId: string): number | null {
  try {
    const raw = localStorage.getItem(CLASS_OVERRIDES_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return typeof map[classId]?.enrolledCount === "number" ? map[classId].enrolledCount : null;
  } catch {
    return null;
  }
}

export function saveClassEnrolledCountIncrement(classId: string): void {
  try {
    const raw = localStorage.getItem(CLASS_OVERRIDES_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const cls = RAW_MOCK_CLASSES.find((c) => c._id === classId);
    const currentCount = typeof map[classId]?.enrolledCount === "number"
      ? map[classId].enrolledCount
      : (cls?.enrolledCount ?? 0);
    map[classId] = {
      ...map[classId],
      enrolledCount: currentCount + 1,
    };
    localStorage.setItem(CLASS_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
    if (cls) {
      cls.enrolledCount = currentCount + 1;
    }
  } catch (error) {
    console.error("Failed to save class enrolledCount override:", error);
  }
}

class EnrollmentService {
  async getEnrollmentById(id: string): Promise<EnrollmentEntity | null> {
    await new Promise((res) => setTimeout(res, 100));
    const all = getStoredEnrollments();
    const enrollment = all.find((e) => e.id === id);
    if (!enrollment) return null;

    // Check if hold has expired
    if (
      enrollment.enrollmentStatus === "PENDING_PAYMENT" &&
      enrollment.holdExpiresAt &&
      new Date(enrollment.holdExpiresAt).getTime() <= Date.now()
    ) {
      enrollment.enrollmentStatus = "EXPIRED";
      enrollment.updatedAt = new Date().toISOString();
      saveStoredEnrollments(all);
    }

    return enrollment;
  }

  async getEnrollmentsByStudent(studentId: string): Promise<EnrollmentEntity[]> {
    await new Promise((res) => setTimeout(res, 150));
    const all = getStoredEnrollments();
    return all.filter((e) => e.studentId === studentId);
  }

  async createOrGetPendingEnrollment(
    payload: CreateEnrollmentPayload
  ): Promise<EnrollmentEntity> {
    await new Promise((res) => setTimeout(res, 200));
    const { classId, studentId } = payload;

    const classEntity = RAW_MOCK_CLASSES.find((c) => c._id === classId);
    if (!classEntity) {
      throw new Error("Lớp học không tồn tại trong hệ thống.");
    }

    const currentEnrolled =
      getStoredClassEnrolledCountOverride(classId) ?? classEntity.enrolledCount;
    if (currentEnrolled >= classEntity.capacity) {
      throw new Error("Lớp học đã đủ số lượng học viên.");
    }

    if (classEntity.status !== "OPEN") {
      throw new Error("Lớp học hiện không mở đăng ký.");
    }

    const all = getStoredEnrollments();

    // 1. Check if student already has a CONFIRMED or COMPLETED enrollment
    const confirmed = all.find(
      (e) =>
        e.classId === classId &&
        e.studentId === studentId &&
        (e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED")
    );
    if (confirmed) {
      throw new Error("Bạn đã đăng ký lớp học này thành công trước đó.");
    }

    // 2. Check if student already has an active PENDING_PAYMENT enrollment
    const existingPending = all.find(
      (e) =>
        e.classId === classId &&
        e.studentId === studentId &&
        e.enrollmentStatus === "PENDING_PAYMENT"
    );

    if (existingPending) {
      const now = Date.now();
      const holdExpiresTime = existingPending.holdExpiresAt
        ? new Date(existingPending.holdExpiresAt).getTime()
        : 0;

      if (holdExpiresTime > now) {
        // Seat hold is still valid, reuse existing pending enrollment
        return existingPending;
      } else {
        // Previous pending enrollment expired
        existingPending.enrollmentStatus = "EXPIRED";
        existingPending.updatedAt = new Date().toISOString();
        saveStoredEnrollments(all);
      }
    }

    // 3. Create new Enrollment with 15-minute seat hold
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const newEnrollment: EnrollmentEntity = {
      id: `enr_${Date.now()}`,
      classId: classEntity._id,
      courseId: classEntity.courseId,
      teacherId: classEntity.teacherId,
      studentId,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: classEntity.price,
      amountPaidViaPayment: 0,
      amountPaidViaScholarship: 0,
      enrolledAt: now.toISOString(),
      holdExpiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    all.push(newEnrollment);
    saveStoredEnrollments(all);

    return newEnrollment;
  }

  async updateEnrollmentStatus(
    enrollmentId: string,
    status: EnrollmentEntity["enrollmentStatus"],
    amountPaid?: number
  ): Promise<EnrollmentEntity> {
    const all = getStoredEnrollments();
    const idx = all.findIndex((e) => e.id === enrollmentId);
    if (idx === -1) {
      throw new Error("Không tìm thấy đơn đăng ký để cập nhật.");
    }

    all[idx].enrollmentStatus = status;
    if (amountPaid !== undefined) {
      all[idx].amountPaidViaPayment = amountPaid;
    }
    all[idx].updatedAt = new Date().toISOString();

    saveStoredEnrollments(all);
    return all[idx];
  }
}

export const enrollmentService = new EnrollmentService();
