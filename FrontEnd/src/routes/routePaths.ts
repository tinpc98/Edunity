export const ROUTES = {
  HOME: "/",
  CLASSES: "/classes",
  CLASS_DETAIL: "/classes/:classId",
  ENROLLMENT: "/enrollment/:classId",
  AUTH: {
    LOGIN: "/login",
    REGISTER: "/register",
    TEACHER_REGISTER: "/register/teacher",
    TEACHER_QUALIFICATION: "/register/teacher/qualification",
    TEACHER_PENDING: "/register/teacher/pending",
  },
  STUDENT: {
    HOME: "/student",
  },
  TEACHER: {
    HOME: "/teacher",
    CLASSES: "/teacher/classes",
    CREATE_CLASS: "/teacher/classes/create",
    CLASS_DETAIL: "/teacher/classes/:classId",
  },
  ADMIN: {
    HOME: "/admin",
    TEACHER_VERIFICATIONS: "/admin/teachers/verifications",
    TEACHER_VERIFICATION_DETAIL: "/admin/teachers/verifications/:teacherId",
    CAMPAIGNS: "/admin/campaigns",
    CREATE_CAMPAIGN: "/admin/campaigns/create",
    CAMPAIGN_DETAIL: "/admin/campaigns/:campaignId",
    SCHOLARSHIP_APPLICATIONS: "/admin/scholarship-applications",
    SCHOLARSHIP_APPLICATION_REVIEW: "/admin/scholarship-applications/:applicationId",
  },
  SPONSOR: {
    HOME: "/sponsor",
  },
} as const;
