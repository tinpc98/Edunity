// ============================================================
// Phase 3 Catalog + Course Types
// Derived from Backend source. DO NOT invent fields.
// ============================================================

// ─── GRADE / COURSE LEVEL ENUMS ─────────────────────────────
export const GRADE_LEVELS = [
  "PRE_PRIMARY",
  "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5",
  "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9",
  "GRADE_10", "GRADE_11", "GRADE_12",
  "UNIVERSITY",
  "COLLEGE",
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const CATALOG_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const PROPOSAL_STATUSES = ["PENDING_REVIEW", "NEED_CHANGES", "APPROVED", "REJECTED"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// ─── GRADE LEVEL LABELS ──────────────────────────────────────
export const GRADE_LEVEL_LABELS: Record<GradeLevel, string> = {
  PRE_PRIMARY: "Mầm non",
  GRADE_1: "Lớp 1",
  GRADE_2: "Lớp 2",
  GRADE_3: "Lớp 3",
  GRADE_4: "Lớp 4",
  GRADE_5: "Lớp 5",
  GRADE_6: "Lớp 6",
  GRADE_7: "Lớp 7",
  GRADE_8: "Lớp 8",
  GRADE_9: "Lớp 9",
  GRADE_10: "Lớp 10",
  GRADE_11: "Lớp 11",
  GRADE_12: "Lớp 12",
  UNIVERSITY: "Đại học",
  COLLEGE: "Cao đẳng",
};

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  BEGINNER: "Cơ bản",
  INTERMEDIATE: "Trung cấp",
  ADVANCED: "Nâng cao",
};

// ─── RAW API DTOs (shape returned by Backend) ────────────────

/** Raw Category from GET /categories */
export interface ApiCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  /** Computed by Backend from category name/slug  */
  allowedGradeLevels: GradeLevel[] | null;
}

/** Raw Subject from GET /categories/:id/subjects or GET /subjects/:id */
export interface ApiSubject {
  _id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description?: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  /** Only present in getSubject (single) endpoint */
  courses?: ApiCourseRef[];
}

export interface ApiCourseRef {
  _id: string;
  title: string;
  slug: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
}

/** Raw Course from GET /courses or GET /courses/:id */
export interface ApiCourse {
  _id: string;
  subjectId: string;
  subjectName: string;
  categoryId: string;
  categoryName: string;
  title: string;
  slug: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  status: CatalogStatus;
  sourceProposalId?: string | null;
  /** Only present in GET /courses/:id */
  openClassCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Raw CourseProposal from teacher or admin endpoints */
export interface ApiCourseProposal {
  _id: string;
  teacherId: string;
  categoryId: string;
  subjectId: string;
  title: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  estimatedDuration?: string;
  status: ProposalStatus;
  approvedCourseId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  /** Enriched by Backend present() in admin endpoints */
  teacherName?: string | null;
  teacherEmail?: string | null;
  categoryName?: string | null;
  subjectName?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── FRONTEND DOMAIN MODELS (normalized _id → id) ───────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: CatalogStatus;
  allowedGradeLevels: GradeLevel[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description?: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  courses?: CourseRef[];
}

export interface CourseRef {
  id: string;
  title: string;
  slug: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
}

export interface Course {
  id: string;
  subjectId: string;
  subjectName: string;
  categoryId: string;
  categoryName: string;
  title: string;
  slug: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  status: CatalogStatus;
  sourceProposalId?: string | null;
  openClassCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseProposal {
  id: string;
  teacherId: string;
  categoryId: string;
  subjectId: string;
  title: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  estimatedDuration?: string;
  status: ProposalStatus;
  approvedCourseId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  teacherName?: string | null;
  teacherEmail?: string | null;
  categoryName?: string | null;
  subjectName?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── PAGINATION ──────────────────────────────────────────────
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── FORM PAYLOADS ───────────────────────────────────────────
export interface CreateCategoryPayload {
  name: string;
  slug?: string;
  description?: string;
  status?: CatalogStatus;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
  status?: CatalogStatus;
}

export interface CreateSubjectPayload {
  categoryId: string;
  name: string;
  slug?: string;
  description?: string;
  status?: CatalogStatus;
}

export interface UpdateSubjectPayload {
  name?: string;
  description?: string;
  status?: CatalogStatus;
}

export interface CreateCoursePayload {
  subjectId: string;
  title: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
}

export interface UpdateCoursePayload {
  title?: string;
  description?: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  status?: CatalogStatus;
}

export interface CreateProposalPayload {
  categoryId: string;
  subjectId: string;
  title: string;
  description: string;
  learningObjectives?: string;
  syllabus?: string;
  level?: CourseLevel;
  gradeLevel?: GradeLevel | null;
  prerequisites?: string;
  estimatedDuration?: string;
}

export interface UpdateProposalPayload extends Partial<CreateProposalPayload> {}

export interface ApproveProposalPayload {
  gradeLevel?: GradeLevel | null;
  reviewNote?: string;
}

export interface ReviewProposalPayload {
  reviewNote?: string;
}

// ─── SEARCH PARAMS ───────────────────────────────────────────
export interface CourseSearchParams {
  search?: string;
  categoryId?: string;
  subjectId?: string;
  gradeLevel?: GradeLevel;
  level?: CourseLevel;
  page?: number;
  pageSize?: number;
}

export interface ProposalListParams {
  status?: ProposalStatus;
  page?: number;
  pageSize?: number;
}
