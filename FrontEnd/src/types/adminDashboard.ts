export interface AdminDashboardUsers {
  total: number;
  students: number;
  teachers: number;
  sponsors: number;
  verifiedTeachers: number;
  newThisMonth: number;
}

export interface AdminDashboardPending {
  teacherVerifications: number;
  classApprovals: number;
  courseProposals: number;
  scholarshipApplications: number;
  reports: number;
  refundsRequired: number;
}

export interface AdminDashboardTraining {
  courses: number;
  classes: number;
  activeClasses: number;
  upcomingClasses: number;
  classesByStatus: Record<string, number>;
  confirmedEnrollments: number;
}

export interface AdminDashboardMonthlyFinance {
  month: string;
  revenue: number;
  commission: number;
}

export interface AdminDashboardFinance {
  revenue: number;
  commission: number;
  revenueThisMonth: number;
  transactions: number;
  refunds: number;
  monthly: AdminDashboardMonthlyFinance[];
}

export interface AdminDashboardScholarship {
  openCampaigns: number;
  totalFund: number;
  allocatedFund: number;
  usedFund: number;
  allocatedPercent: number;
  studentsReceived: number;
  newApplications: number;
}

export interface AdminDashboardActivity {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actorEmail: string | null;
  createdAt: string;
}

export interface AdminDashboardData {
  users: AdminDashboardUsers;
  pending: AdminDashboardPending;
  training: AdminDashboardTraining;
  finance: AdminDashboardFinance;
  scholarship: AdminDashboardScholarship;
  recentActivities: AdminDashboardActivity[];
}
