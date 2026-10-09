import type {
  ApiScholarshipCampaign,
  ScholarshipCampaign,
  ApiSponsorContribution,
  SponsorContribution,
  CampaignImpactResponse,
} from "../types/campaign";

/**
 * Safely parse numbers from possible Decimal128, string, or number values.
 */
function parseDecimal(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  if (typeof val === "object" && val.$numberDecimal) {
    const parsed = parseFloat(val.$numberDecimal);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export function adaptCampaign(raw: ApiScholarshipCampaign): ScholarshipCampaign {
  const targetBudget = parseDecimal(raw.targetBudget);
  const fundedAmount = parseDecimal(raw.fundedAmount);
  const allocatedAmount = parseDecimal(raw.allocatedAmount);
  const usedAmount = parseDecimal(raw.usedAmount);
  const awardAmountPerStudent = parseDecimal(raw.awardAmountPerStudent);
  const availableFund = parseDecimal(raw.availableFund, fundedAmount - allocatedAmount);

  // Derived funding progress percentage
  const fundingProgress =
    typeof raw.fundingProgress === "number"
      ? raw.fundingProgress
      : targetBudget > 0
      ? Math.min(Math.round((fundedAmount / targetBudget) * 10000) / 100, 100)
      : 0;

  return {
    id: raw._id || (raw as any).id,
    createdBy: typeof raw.createdBy === "object" ? raw.createdBy._id || raw.createdBy.id : String(raw.createdBy || ""),
    updatedBy: raw.updatedBy ? (typeof raw.updatedBy === "object" ? raw.updatedBy._id : String(raw.updatedBy)) : null,
    title: raw.title || "",
    description: raw.description || "",
    eligibilityCriteria: raw.eligibilityCriteria || "",
    scope: raw.scope || {},
    targetBudget,
    fundedAmount,
    allocatedAmount,
    usedAmount,
    expectedSlots: raw.expectedSlots || 0,
    awardAmountPerStudent,
    fundingStart: raw.fundingStart || null,
    fundingEnd: raw.fundingEnd || null,
    applicationStart: raw.applicationStart || null,
    applicationEnd: raw.applicationEnd || null,
    status: raw.status || "DRAFT",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt,
    availableFund,
    fundingProgress,
    isAcceptingFunding: Boolean(raw.isAcceptingFunding),
    isAcceptingApplications: Boolean(raw.isAcceptingApplications),
    scopeDetail: raw.scopeDetail,
    awardedScholarshipCount: raw.awardedScholarshipCount || 0,
    contributionCount: raw.contributionCount || 0,
  };
}

export function adaptCampaigns(rawList: ApiScholarshipCampaign[]): ScholarshipCampaign[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(adaptCampaign);
}

export function adaptContribution(raw: ApiSponsorContribution): SponsorContribution {
  const sponsorId =
    typeof raw.sponsorId === "object"
      ? raw.sponsorId._id || raw.sponsorId.id || ""
      : String(raw.sponsorId || "");
  const sponsorEmail =
    typeof raw.sponsorId === "object" ? raw.sponsorId.email : undefined;

  const campaignId =
    typeof raw.campaignId === "object"
      ? raw.campaignId._id || raw.campaignId.id || ""
      : String(raw.campaignId || "");
  const campaignTitle =
    raw.campaignTitle ||
    (typeof raw.campaignId === "object" ? raw.campaignId.title : undefined);
  const campaignStatus =
    raw.campaignStatus ||
    (typeof raw.campaignId === "object" ? raw.campaignId.status : undefined);

  return {
    id: raw._id || (raw as any).id,
    campaignId,
    campaignTitle,
    campaignStatus,
    sponsorId,
    sponsorEmail,
    amount: parseDecimal(raw.amount),
    contributionStatus: raw.contributionStatus || "PENDING",
    paymentReference: raw.paymentReference || null,
    contributedAt: raw.contributedAt || raw.createdAt || new Date().toISOString(),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function adaptContributions(rawList: ApiSponsorContribution[]): SponsorContribution[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(adaptContribution);
}

export function adaptCampaignImpact(raw: any): CampaignImpactResponse {
  return {
    campaign: adaptCampaign(raw.campaign),
    myContribution: {
      total: parseDecimal(raw.myContribution?.total),
      count: raw.myContribution?.count || 0,
      shareOfFund: raw.myContribution?.shareOfFund || 0,
    },
    fundUsage: {
      fundedAmount: parseDecimal(raw.fundUsage?.fundedAmount),
      allocatedAmount: parseDecimal(raw.fundUsage?.allocatedAmount),
      usedAmount: parseDecimal(raw.fundUsage?.usedAmount),
      unallocatedAmount: parseDecimal(raw.fundUsage?.unallocatedAmount),
      usedPercent: raw.fundUsage?.usedPercent || 0,
    },
    impact: {
      sponsoredStudentCount: raw.impact?.sponsoredStudentCount || 0,
      studentsUsingScholarshipCount: raw.impact?.studentsUsingScholarshipCount || 0,
      enrollmentsFundedCount: raw.impact?.enrollmentsFundedCount || 0,
      classesSupportedCount: raw.impact?.classesSupportedCount || 0,
    },
  };
}
