import type {
  ApiScholarshipApplication,
  ScholarshipApplication,
  ApiScholarship,
  Scholarship,
  ApiScholarshipUsage,
  ScholarshipUsage,
} from "../types/scholarship";

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

export function adaptScholarshipApplication(api: ApiScholarshipApplication): ScholarshipApplication {
  const campaignTitle = api.campaignTitle || api.campaign?.title || "";
  const awardAmount = parseDecimal(api.awardAmountPerStudent || api.campaign?.awardAmountPerStudent);

  return {
    id: api._id || (api as any).id || "",
    campaignId: resolveId(api.campaignId),
    studentId: resolveId(api.studentId),
    statement: api.statement || "",
    status: api.status,
    submittedAt: api.submittedAt,
    reviewedBy: api.reviewedBy,
    reviewedAt: api.reviewedAt,
    reviewNote: api.reviewNote,
    campaignTitle,
    awardAmountPerStudent: awardAmount,
    studentName: api.studentName || api.student?.fullName || "",
    studentEmail: api.studentEmail || api.student?.email || "",
    student: api.student,
    documents: api.documents,
    campaign: api.campaign,
    scholarship: api.scholarship ? adaptScholarship(api.scholarship) : undefined,
  };
}

export function adaptScholarshipApplications(apis: ApiScholarshipApplication[]): ScholarshipApplication[] {
  if (!Array.isArray(apis)) return [];
  return apis.map(adaptScholarshipApplication);
}

export function adaptScholarship(api: ApiScholarship): Scholarship {
  const allocated = parseDecimal(api.allocatedAmount);
  const remaining = parseDecimal(api.remainingAmount);
  const used = Math.max(0, allocated - remaining);

  return {
    id: api._id || (api as any).id || "",
    campaignId: resolveId(api.campaignId),
    applicationId: resolveId(api.applicationId),
    studentId: resolveId(api.studentId),
    allocatedAmount: allocated,
    remainingAmount: remaining,
    usedAmount: used,
    validFrom: api.validFrom,
    expiresAt: api.expiresAt,
    status: api.status,
    campaignTitle: api.campaign?.title || "",
    campaign: api.campaign,
    isUsable: Boolean(api.isUsable),
  };
}

export function adaptScholarships(apis: ApiScholarship[]): Scholarship[] {
  if (!Array.isArray(apis)) return [];
  return apis.map(adaptScholarship);
}

export function adaptScholarshipUsage(api: ApiScholarshipUsage): ScholarshipUsage {
  return {
    id: api._id || (api as any).id || "",
    scholarshipId: resolveId(api.scholarshipId),
    enrollmentId: resolveId(api.enrollmentId),
    classId: resolveId(api.classId),
    amount: parseDecimal(api.amount),
    usedAt: api.usedAt,
    status: api.status,
  };
}
