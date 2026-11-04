import { ROUTES } from "../../routes/routePaths";

type Role = "STUDENT" | "TEACHER" | "ADMIN" | "SPONSOR" | string | undefined;

/**
 * Where clicking a notification leads. The target depends on the recipient's role as well as the type:
 * the same event family (reports, scholarships, sessions...) is handled on a different page per portal,
 * so matching on a substring of the type alone sent admins and teachers to pages they cannot use.
 */
export function getNotificationRoute(type: string | undefined, role: Role): string {
  const t = type || "";

  // Exact types first
  switch (t) {
    case "NEW_MESSAGE":
      return ROUTES.MESSAGES;
    case "TEACHER_VERIFIED":
    case "TEACHER_VERIFICATION_REJECTED":
      return role === "TEACHER" ? ROUTES.TEACHER.PROFILE : ROUTES.NOTIFICATIONS;
    case "TEACHER_VERIFICATION_SUBMITTED":
      return role === "ADMIN" ? ROUTES.ADMIN.TEACHER_VERIFICATIONS : ROUTES.NOTIFICATIONS;
    case "ENROLLMENT_CONFIRMED":
      return role === "STUDENT" ? ROUTES.STUDENT.ENROLLMENTS : ROUTES.NOTIFICATIONS;
    case "REVIEW_CREATED":
      return role === "TEACHER" ? ROUTES.TEACHER.REVIEWS : ROUTES.NOTIFICATIONS;
    case "CONTRIBUTION_RECEIPT":
      return role === "SPONSOR" ? ROUTES.SPONSOR.CONTRIBUTIONS : ROUTES.NOTIFICATIONS;
    case "CLASS_SUBMITTED":
      return role === "ADMIN" ? ROUTES.ADMIN.CLASSES : ROUTES.NOTIFICATIONS;
    case "REPORT_CREATED":
      return role === "ADMIN" ? ROUTES.ADMIN.REPORTS : ROUTES.REPORTS;
    case "NEW_ENROLLMENT":
      return role === "TEACHER" ? ROUTES.TEACHER.CLASSES : ROUTES.NOTIFICATIONS;
    case "PAYMENT_FAILED":
    case "SESSION_REFUND_APPROVED":
      return role === "STUDENT" ? ROUTES.STUDENT.PAYMENTS : ROUTES.NOTIFICATIONS;
  }
  if (t.startsWith("PAYOUT_")) {
    if (role === "TEACHER") return ROUTES.TEACHER.REVENUE;
    if (role === "ADMIN") return ROUTES.ADMIN.PAYOUTS;
  }

  if (role === "ADMIN") {
    if (t.startsWith("SCHOLARSHIP_")) return ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS;
    if (t.startsWith("COURSE_PROPOSAL_")) return ROUTES.ADMIN.COURSE_PROPOSALS;
    if (t.startsWith("CLASS_")) return ROUTES.ADMIN.CLASSES;
    // Incidents, violations, discipline cases, refund reviews and reschedule requests are reviewed there
    if (
      t.startsWith("ADMIN_") ||
      t.startsWith("TEACHER_") ||
      t.startsWith("SESSION_") ||
      t.startsWith("INCIDENT_") ||
      t.startsWith("RESCHEDULE_")
    ) {
      return ROUTES.ADMIN.REPORTS;
    }
    return ROUTES.NOTIFICATIONS;
  }

  if (role === "TEACHER") {
    if (t.startsWith("CLASS_")) return ROUTES.TEACHER.CLASSES;
    if (t.startsWith("COURSE_PROPOSAL_")) return ROUTES.TEACHER.COURSE_PROPOSALS;
    // Session lifecycle, lateness/absence warnings, incident reports and reschedules live on the schedule page
    if (
      t.startsWith("SESSION_") ||
      t.startsWith("TEACHER_") ||
      t.startsWith("INCIDENT_") ||
      t.startsWith("RESCHEDULE_")
    ) {
      return ROUTES.TEACHER.SCHEDULE;
    }
    return ROUTES.NOTIFICATIONS;
  }

  if (role === "STUDENT") {
    if (t.startsWith("SCHOLARSHIP_")) return ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS;
    if (t.startsWith("REPORT_")) return ROUTES.REPORTS;
    if (t.startsWith("SESSION_") || t.startsWith("RESCHEDULE_")) return ROUTES.STUDENT.SCHEDULE;
    return ROUTES.NOTIFICATIONS;
  }

  if (t.startsWith("REPORT_")) return ROUTES.REPORTS;
  return ROUTES.NOTIFICATIONS;
}

/** Short Vietnamese category shown next to a notification instead of its raw type code */
export function getNotificationLabel(type: string | undefined): string {
  const t = type || "";
  if (t === "NEW_MESSAGE") return "Tin nhắn";
  if (t.includes("RECORDING")) return "Bản ghi";
  if (t.includes("ENROLLMENT")) return "Đăng ký học";
  if (t.startsWith("PAYMENT_") || t.startsWith("PAYOUT_") || t.includes("REFUND")) return "Thanh toán";
  if (t.startsWith("SCHOLARSHIP_") || t === "CONTRIBUTION_RECEIPT") return "Học bổng";
  if (t.startsWith("REPORT_")) return "Khiếu nại";
  if (t.startsWith("REVIEW_")) return "Đánh giá";
  if (t.startsWith("CLASS_") || t.startsWith("COURSE_PROPOSAL_")) return "Lớp học";
  if (t.startsWith("TEACHER_VERIF")) return "Xác minh giáo viên";
  if (t.includes("YELLOW") || t.includes("_RED") || t.includes("NO_SHOW") || t.includes("VIOLATION") || t.includes("DISCIPLINE")) {
    return "Cảnh báo";
  }
  if (t.includes("INCIDENT")) return "Sự cố";
  if (t.includes("RESCHEDULE")) return "Dời lịch";
  if (t.startsWith("SESSION_") || t.startsWith("TEACHER_") || t.startsWith("ADMIN_")) return "Buổi học";
  if (t.startsWith("ACCOUNT_")) return "Tài khoản";
  return "Hệ thống";
}
