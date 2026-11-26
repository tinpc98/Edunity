/**
 * Backend-aligned Scholarship Campaign and Sponsor Contribution Types
 * matching BackEnd models: ScholarshipCampaign.js, SponsorContribution.js
 */

export type CampaignStatus = "DRAFT" | "OPEN_FOR_FUNDING" | "CLOSED";
export type OperationalFundingStatus = "NOT_STARTED" | "OPEN" | "PAUSED" | "CLOSED";
export type OperationalApplicationStatus = "NOT_STARTED" | "OPEN" | "PAUSED" | "CLOSED";

export interface CampaignScope {
  categoryIds?: string[];
  subjectIds?: string[];
  courseIds?: string[];
}

export interface CampaignScopeDetail {
  categories?: { _id: string; name: string }[];
  subjects?: { _id: string; name: string; slug?: string }[];
  courses?: { _id: string; title: string }[];
}

export type ScholarshipPrioritySourceField =
  | "HAS_POVERTY_CERTIFICATE"
  | "HARDSHIP_CATEGORY"
  | "IS_DISADVANTAGED"
  | "GRADE_LEVEL"
  | "STUDENT_PROVINCE"
  | "STUDENT_COMMUNE"
  | "SCHOOL_PROVINCE"
  | "SCHOOL_COMMUNE"
  | "SCHOOL_NAME";

export interface ScholarshipPriorityCriterion {
  code: string;
  label: string;
  sourceField: ScholarshipPrioritySourceField;
  matchValue: string;
  points: number;
  exclusiveGroup?: string | null;
  enabled?: boolean;
  order?: number;
}

export interface ApiScholarshipCampaign {
  _id: string;
  dossierPolicy?: import("./scholarship").ScholarshipDossierPolicy;
  createdBy: string | any;
  updatedBy?: string | any;
  title: string;
  description?: string;
  eligibilityCriteria?: string;
  scope?: CampaignScope;
  priorityCriteria?: ScholarshipPriorityCriterion[];
  priorityPolicyVersion?: number;
  targetBudget: number | string | { $numberDecimal?: string };
  fundedAmount?: number | string | { $numberDecimal?: string };
  allocatedAmount?: number | string | { $numberDecimal?: string };
  usedAmount?: number | string | { $numberDecimal?: string };
  expectedSlots: number;
  awardAmountPerStudent: number | string | { $numberDecimal?: string };
  allowSlotExpansion?: boolean;
  paperDeliveryGraceDays?: number;
  projectedSlots?: number;
  officialSlotCount?: number | null;
  officialEligibleFunding?: number | string | { $numberDecimal?: string } | null;
  fundingReconciledAt?: string | null;
  fundingStart?: string | null;
  fundingEnd?: string | null;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  timelineMode?: "SEQUENTIAL" | "PARALLEL";
  status: CampaignStatus;
  createdAt: string;
  updatedAt?: string;
  // Augmented properties from campaignService.present
  availableFund?: number | string | { $numberDecimal?: string };
  approvedPendingRefund?: number | string | { $numberDecimal?: string };
  fundingProgress?: number;
  isAcceptingFunding?: boolean;
  isAcceptingApplications?: boolean;
  isFundingPaused?: boolean;
  fundingClosed?: boolean;
  fundingClosedAt?: string | null;
  fundingPauseReason?: string | null;
  isApplicationPaused?: boolean;
  applicationClosed?: boolean;
  applicationClosedAt?: string | null;
  applicationPauseReason?: string | null;
  fundingStatus?: OperationalFundingStatus;
  applicationStatus?: OperationalApplicationStatus;
  lifecycleHistory?: Array<{
    action: string;
    performedBy?: any;
    timestamp: string;
    note?: string;
    previousState?: any;
    newState?: any;
  }>;
  // Detail properties from withDetail
  scopeDetail?: CampaignScopeDetail;
  awardedScholarshipCount?: number;
  contributionCount?: number;
}

export interface ScholarshipCampaignChecklist {
  campaignId: string;
  title: string;
  status: CampaignStatus;
  documentChecklist: import("./scholarship").ScholarshipChecklistItem[];
  dossierPolicy: import("./scholarship").ScholarshipDossierPolicy;
}

export interface ScholarshipCampaign {
  id: string;
  dossierPolicy?: import("./scholarship").ScholarshipDossierPolicy;
  createdBy: string;
  updatedBy?: string | null;
  title: string;
  description?: string;
  eligibilityCriteria?: string;
  scope?: CampaignScope;
  priorityCriteria?: ScholarshipPriorityCriterion[];
  priorityPolicyVersion?: number;
  targetBudget: number;
  fundedAmount: number;
  allocatedAmount: number;
  usedAmount: number;
  expectedSlots: number;
  awardAmountPerStudent: number;
  allowSlotExpansion?: boolean;
  paperDeliveryGraceDays?: number;
  projectedSlots?: number;
  officialSlotCount?: number | null;
  officialEligibleFunding?: number | null;
  fundingReconciledAt?: string | null;
  fundingStart?: string | null;
  fundingEnd?: string | null;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  timelineMode?: "SEQUENTIAL" | "PARALLEL";
  status: CampaignStatus;
  createdAt: string;
  updatedAt?: string;
  availableFund: number;
  receivedFund?: number;
  confirmedFund?: number;
  pendingFund?: number;
  refundedFund?: number;
  approvedPendingRefund?: number;
  netEligibleFund?: number;
  standardSlotValue?: number;
  standardSlotsAvailable?: number;
  resultPublicationDate?: string | null;
  fundingProgress: number;
  isAcceptingFunding: boolean;
  isAcceptingApplications: boolean;
  isFundingPaused?: boolean;
  fundingClosed?: boolean;
  fundingClosedAt?: string | null;
  fundingPauseReason?: string | null;
  isApplicationPaused?: boolean;
  applicationClosed?: boolean;
  applicationClosedAt?: string | null;
  applicationPauseReason?: string | null;
  fundingStatus?: OperationalFundingStatus;
  applicationStatus?: OperationalApplicationStatus;
  lifecycleHistory?: Array<{
    action: string;
    performedBy?: any;
    timestamp: string;
    note?: string;
    previousState?: any;
    newState?: any;
  }>;
  scopeDetail?: CampaignScopeDetail;
  awardedScholarshipCount: number;
  contributionCount: number;
}

export interface CreateCampaignPayload {
  title: string;
  description?: string;
  eligibilityCriteria?: string;
  targetBudget: number;
  expectedSlots: number;
  awardAmountPerStudent: number;
  allowSlotExpansion?: boolean;
  paperDeliveryGraceDays?: number;
  fundingStart?: string | null;
  fundingEnd?: string | null;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  timelineMode?: "SEQUENTIAL" | "PARALLEL";
  scope?: CampaignScope;
  priorityCriteria?: ScholarshipPriorityCriterion[];
}

export interface UpdateCampaignPayload {
  title?: string;
  description?: string;
  eligibilityCriteria?: string;
  targetBudget?: number;
  expectedSlots?: number;
  awardAmountPerStudent?: number;
  allowSlotExpansion?: boolean;
  paperDeliveryGraceDays?: number;
  fundingStart?: string | null;
  fundingEnd?: string | null;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  timelineMode?: "SEQUENTIAL" | "PARALLEL";
  scope?: CampaignScope;
  priorityCriteria?: ScholarshipPriorityCriterion[];
}

export type ContributionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ApiSponsorContribution {
  _id: string;
  paymentId?: string;
  contributionId?: string;
  campaignId: string | any;
  campaignTitle?: string;
  campaignStatus?: CampaignStatus;
  sponsorId?: string | any;
  amount: number | string | { $numberDecimal?: string };
  contributionStatus: ContributionStatus;
  paymentReference?: string | null;
  gatewayReference?: string | null;
  purpose?: "DONATION" | "TUITION";
  channelKey?: "DONATION" | "TUITION";
  provider?: string;
  gateway?: string;
  orderCode?: number | null;
  paymentLinkId?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  expiredAt?: string | null;
  remainingSeconds?: number;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  contributedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SponsorContribution {
  id: string;
  paymentId: string;
  campaignId: string;
  campaignTitle?: string;
  campaignStatus?: CampaignStatus;
  sponsorId: string;
  sponsorEmail?: string;
  amount: number;
  contributionStatus: ContributionStatus;
  paymentReference?: string | null;
  purpose?: "DONATION" | "TUITION";
  channelKey?: "DONATION" | "TUITION";
  provider?: string;
  gateway?: string;
  orderCode?: number | null;
  paymentLinkId?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  expiredAt?: string | null;
  remainingSeconds?: number;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
  contributedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateContributionPayload {
  amount: number;
  isAnonymous?: boolean;
  donorDisplayName?: string | null;
}

export interface CreateContributionResponse {
  paymentId: string;
  contributionId: string;
  campaignId: string;
  campaignTitle?: string | null;
  campaignStatus?: CampaignStatus | string | null;
  purpose: "DONATION";
  channelKey: "DONATION";
  provider: string;
  amount: number;
  currency: string;
  contributionStatus: ContributionStatus;
  paymentStatus: ContributionStatus;
  gateway: string;
  gatewayReference: string;
  orderCode: number | null;
  paymentLinkId: string | null;
  qrCode: string | null;
  checkoutUrl: string | null;
  expiredAt: string | null;
  remainingSeconds: number;
  isAnonymous: boolean;
  donorDisplayName: string | null;
}

export interface SponsorContributionsResponse {
  items: SponsorContribution[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalContributed: number;
}

export interface CampaignImpactResponse {
  campaign: ScholarshipCampaign;
  myContribution: {
    total: number;
    count: number;
    shareOfFund: number;
  };
  fundUsage: {
    fundedAmount: number;
    allocatedAmount: number;
    usedAmount: number;
    unallocatedAmount: number;
    usedPercent: number;
  };
  impact: {
    sponsoredStudentCount: number;
    studentsUsingScholarshipCount: number;
    enrollmentsFundedCount: number;
    classesSupportedCount: number;
  };
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Bản nháp",
  OPEN_FOR_FUNDING: "Đang gây quỹ",
  CLOSED: "Đã đóng",
};

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  DRAFT: "default",
  OPEN_FOR_FUNDING: "green",
  CLOSED: "red",
};

export const FUNDING_STATUS_LABELS: Record<OperationalFundingStatus, string> = {
  NOT_STARTED: "Chưa mở gây quỹ",
  OPEN: "Đang mở gây quỹ",
  PAUSED: "Tạm dừng gây quỹ",
  CLOSED: "Đã đóng gây quỹ",
};

export const FUNDING_STATUS_COLORS: Record<OperationalFundingStatus, string> = {
  NOT_STARTED: "default",
  OPEN: "cyan",
  PAUSED: "gold",
  CLOSED: "purple",
};

export const APPLICATION_STATUS_LABELS: Record<OperationalApplicationStatus, string> = {
  NOT_STARTED: "Chưa nhận hồ sơ",
  OPEN: "Đang nhận hồ sơ",
  PAUSED: "Tạm dừng nhận hồ sơ",
  CLOSED: "Đã đóng nhận hồ sơ",
};

export const APPLICATION_STATUS_COLORS: Record<OperationalApplicationStatus, string> = {
  NOT_STARTED: "default",
  OPEN: "blue",
  PAUSED: "warning",
  CLOSED: "default",
};

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  PENDING: "Chờ thanh toán",
  COMPLETED: "Hoàn thành",
  FAILED: "Thất bại",
};

export const CONTRIBUTION_STATUS_COLORS: Record<ContributionStatus, string> = {
  PENDING: "gold",
  COMPLETED: "green",
  FAILED: "red",
};

export interface PublicRecipient {
  id: string;
  applicationCode?: string | null;
  displayName: string;
  schoolName?: string | null;
  gradeLevel?: string | null;
  province?: string | null;
  awardAmount: number;
  awardedAt?: string | null;
}
