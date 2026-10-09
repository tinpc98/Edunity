import type { ApiEnrollment, Enrollment } from "../types/enrollment";

function parseDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  if (typeof value === "object" && "$numberDecimal" in (value as any)) {
    return parseFloat((value as any).$numberDecimal) || 0;
  }
  return 0;
}

function resolveId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object") {
    return (ref as any)._id?.toString() || (ref as any).id?.toString() || "";
  }
  return "";
}

export function adaptEnrollment(api: ApiEnrollment): Enrollment {
  const classId = resolveId(api.classId);
  const courseId = resolveId(api.courseId);
  const teacherId = resolveId(api.teacherId);
  const studentId = resolveId(api.studentId);

  // If class is populated directly as api.class or inside api.classId object
  let classSummary = api.class;
  if (!classSummary && typeof api.classId === "object" && api.classId !== null) {
    const rawClass = api.classId as any;
    classSummary = {
      id: rawClass._id?.toString() || rawClass.id || classId,
      className: rawClass.className || "",
      courseTitle: rawClass.courseTitle || "",
      teacherName: rawClass.teacherName || "",
      subjectName: rawClass.subjectName,
      coverImage: rawClass.coverImage,
      startDate: rawClass.startDate,
      endDate: rawClass.endDate,
      status: rawClass.status,
      classType: rawClass.classType,
      price: parseDecimal(rawClass.price),
      capacity: rawClass.capacity,
      enrolledCount: rawClass.enrolledCount,
    };
  }

  return {
    id: api._id || (api as any).id || "",
    classId: classId || (classSummary?.id ?? ""),
    courseId,
    teacherId,
    studentId,
    enrollmentStatus: api.enrollmentStatus,
    paymentSource: api.paymentSource,
    tuitionAmount: parseDecimal(api.tuitionAmount),
    amountPaidViaPayment: parseDecimal(api.amountPaidViaPayment),
    amountPaidViaScholarship: parseDecimal(api.amountPaidViaScholarship),
    enrolledAt: api.enrolledAt,
    holdExpiresAt: api.holdExpiresAt || null,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    class: classSummary,
    nextSession: api.nextSession,
  };
}

export function adaptEnrollments(apis: ApiEnrollment[]): Enrollment[] {
  if (!Array.isArray(apis)) return [];
  return apis.map(adaptEnrollment);
}
