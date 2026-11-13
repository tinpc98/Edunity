import type { Course } from "../types/catalog";
import type { TeacherSubjectAuthorization } from "../types/teacherSubjectAuthorization";

export function isCourseAuthorizedForTeacher(
  course: Course,
  authorizations: TeacherSubjectAuthorization[]
): boolean {
  return authorizations.some(
    (authorization) =>
      authorization.status === "APPROVED" &&
      authorization.subjectId === course.subjectId &&
      authorization.gradeLevel === (course.gradeLevel ?? null) &&
      authorization.level === course.level
  );
}
