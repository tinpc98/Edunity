import type { CourseLevel, GradeLevel, PagedResult } from "./catalog";

export type SyllabusVersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface CurriculumUnit {
  id: string;
  unitOrder: number;
  title: string;
  description: string;
  learningObjectives: string;
  durationMinutes: number | null;
  topics: string[];
}

export interface SyllabusVersion {
  id: string;
  courseId: string;
  versionNumber: number;
  title: string;
  summary: string;
  status: SyllabusVersionStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  archivedAt?: string | null;
  units?: CurriculumUnit[];
}

export interface SyllabusVersionList {
  courseId: string;
  courseTitle: string;
  publishedSyllabusVersionId: string | null;
  versions: SyllabusVersion[];
}

export interface CreateSyllabusVersionPayload {
  title?: string;
  summary?: string;
  cloneFromVersionId?: string;
}

export interface UpdateSyllabusVersionPayload {
  title?: string;
  summary?: string;
}

export interface CurriculumUnitPayload {
  title: string;
  description?: string;
  learningObjectives?: string;
  durationMinutes?: number | null;
  topics?: string[];
}

export type PricingPolicyScope = "GLOBAL" | "CATEGORY" | "SUBJECT" | "COURSE";
export type PricingPolicyClassType = "ALL" | "FREE" | "PAID";
export type PricingPolicyStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK" | "ARCHIVED";

export interface PricingPolicy {
  id: string;
  policyKey: string;
  version: number;
  name: string;
  description: string;
  scopeType: PricingPolicyScope;
  categoryId: string | null;
  subjectId: string | null;
  courseId: string | null;
  gradeLevel: GradeLevel | null;
  level: CourseLevel | null;
  classType: PricingPolicyClassType;
  allowFree: boolean;
  minPrice: string;
  maxPrice: string;
  minSessions: number;
  maxSessions: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PricingPolicyStatus;
  changeReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPolicyListParams {
  page?: number;
  pageSize?: number;
  scopeType?: PricingPolicyScope;
  status?: PricingPolicyStatus;
}

export interface PricingPolicyPayload {
  name: string;
  description?: string;
  scopeType?: PricingPolicyScope;
  categoryId?: string;
  subjectId?: string;
  courseId?: string;
  gradeLevel?: GradeLevel | null;
  level?: CourseLevel | null;
  classType?: PricingPolicyClassType;
  allowFree?: boolean;
  minPrice: number;
  maxPrice: number;
  minSessions: number;
  maxSessions: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  status?: "DRAFT" | "ACTIVE";
  changeReason?: string;
}

export interface PricingPolicySnapshot {
  policyId?: string | null;
  policyKey?: string | null;
  version?: number | null;
  scopeType?: PricingPolicyScope | null;
  classType?: PricingPolicyClassType | null;
  allowFree?: boolean | null;
  minPrice?: string | number | null;
  maxPrice?: string | number | null;
  minSessions?: number | null;
  maxSessions?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export type PricingPolicyPage = PagedResult<PricingPolicy>;
