import type { CourseLevel, GradeLevel, PagedResult } from "./catalog";

export type TeacherSubjectAuthorizationStatus = "PENDING" | "APPROVED" | "SUSPENDED";

export interface TeacherSubjectAuthorizationDecision {
  action: "REQUESTED" | "CREATED_APPROVED" | "APPROVED" | "SUSPENDED";
  previousStatus: TeacherSubjectAuthorizationStatus | null;
  newStatus: TeacherSubjectAuthorizationStatus;
  reason?: string | null;
  decidedAt: string;
}

export interface TeacherSubjectAuthorization {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectName: string | null;
  categoryId: string;
  categoryName: string | null;
  gradeLevel: GradeLevel | null;
  level: CourseLevel;
  status: TeacherSubjectAuthorizationStatus;
  requestNote?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHistory: TeacherSubjectAuthorizationDecision[];
}

export interface CreateTeacherSubjectAuthorizationPayload {
  subjectId: string;
  categoryId?: string;
  gradeLevel?: GradeLevel | null;
  level: CourseLevel;
  requestNote?: string;
}

export type TeacherSubjectAuthorizationPage = PagedResult<TeacherSubjectAuthorization>;
