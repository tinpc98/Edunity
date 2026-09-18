export type VerificationStatus = 'PENDING' | 'NEEDS_INFO' | 'VERIFIED' | 'REJECTED';

export interface VerificationDocument {
  id: string;
  name: string;
  type: string;
  issueDate?: string;
  url: string;
}

export interface TeacherVerification {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  experience: string;
  bio: string;
  workplace: string;
  dateSubmitted: string;
  status: VerificationStatus;
  documents: VerificationDocument[];
}

export type CampaignStatus = 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';

export interface ScholarshipCampaignAdmin {
  id: string;
  title: string;
  description: string;
  status: CampaignStatus;
  targetBudget: number;
  fundedAmount: number;
  allocatedAmount: number;
  usedAmount: number;
  expectedSlots: number;
  allocatedSlots: number;
  awardPerStudent: number;
  fundingStartDate: string;
  fundingEndDate: string;
  appStartDate: string;
  appEndDate: string;
  eligibility: string[];
  scope: string[];
}

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'FAILED';

export interface SponsorContributionAdmin {
  id: string;
  sponsorName: string;
  amount: number;
  date: string;
  status: TransactionStatus;
  campaignId: string;
}

export type ScholarshipApplicationStatus = 'SUBMITTED' | 'NEED_MORE_INFORMATION' | 'APPROVED' | 'REJECTED';

export interface ApplicationDocument {
  id: string;
  name: string;
  type: string;
  url: string;
  verified: boolean;
}

export interface ScholarshipApplicationAdmin {
  id: string;
  studentName: string;
  grade: string;
  school: string;
  email: string;
  phone: string;
  campaignId: string;
  campaignTitle: string;
  awardAmount: number;
  status: ScholarshipApplicationStatus;
  submittedDate: string;
  reason: string;
  familySituation: string;
  learningGoal: string;
  additionalStatement: string;
  documents: ApplicationDocument[];
}

export interface CampaignActivity {
  id: string;
  type: 'SYSTEM' | 'SPONSOR' | 'STUDENT' | 'ADMIN';
  action: string;
  date: string;
  details?: string;
}
