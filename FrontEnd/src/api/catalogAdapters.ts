// ============================================================
// Adapter: Backend API DTOs → Frontend Domain Models
// Normalizes _id → id centrally so pages never touch _id
// ============================================================

import type {
  ApiCategory,
  ApiSubject,
  ApiCourse,
  ApiCourseProposal,
  ApiCourseRef,
  Category,
  Subject,
  Course,
  CourseProposal,
  CourseRef,
  PagedResult,
} from "../types/catalog";

export function adaptCategory(raw: ApiCategory): Category {
  return {
    id: raw._id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    status: raw.status,
    allowedGradeLevels: raw.allowedGradeLevels,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function adaptCourseRef(raw: ApiCourseRef): CourseRef {
  return {
    id: raw._id,
    title: raw.title,
    slug: raw.slug,
    level: raw.level,
    gradeLevel: raw.gradeLevel,
  };
}

export function adaptSubject(raw: ApiSubject): Subject {
  return {
    id: raw._id,
    categoryId: raw.categoryId,
    categoryName: raw.categoryName,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    courses: raw.courses ? raw.courses.map(adaptCourseRef) : undefined,
  };
}

export function adaptCourse(raw: ApiCourse): Course {
  return {
    id: raw._id,
    subjectId: raw.subjectId,
    subjectName: raw.subjectName,
    categoryId: raw.categoryId,
    categoryName: raw.categoryName,
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    learningObjectives: raw.learningObjectives,
    syllabus: raw.syllabus,
    level: raw.level,
    gradeLevel: raw.gradeLevel,
    prerequisites: raw.prerequisites,
    status: raw.status,
    sourceProposalId: raw.sourceProposalId,
    openClassCount: raw.openClassCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function adaptProposal(raw: ApiCourseProposal): CourseProposal {
  return {
    id: raw._id,
    teacherId: raw.teacherId,
    categoryId: raw.categoryId,
    subjectId: raw.subjectId,
    title: raw.title,
    description: raw.description,
    learningObjectives: raw.learningObjectives,
    syllabus: raw.syllabus,
    level: raw.level,
    gradeLevel: raw.gradeLevel,
    prerequisites: raw.prerequisites,
    estimatedDuration: raw.estimatedDuration,
    status: raw.status,
    approvedCourseId: raw.approvedCourseId,
    reviewedBy: raw.reviewedBy,
    reviewedAt: raw.reviewedAt,
    reviewNote: raw.reviewNote,
    teacherName: raw.teacherName,
    teacherEmail: raw.teacherEmail,
    categoryName: raw.categoryName,
    subjectName: raw.subjectName,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Adapts a paged Backend response (which uses `items`) to a typed PagedResult */
export function adaptPaged<TRaw, TDomain>(
  raw: { items: TRaw[]; total: number; page: number; pageSize: number; totalPages: number },
  adaptItem: (r: TRaw) => TDomain
): PagedResult<TDomain> {
  return {
    items: raw.items.map(adaptItem),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    totalPages: raw.totalPages,
  };
}
