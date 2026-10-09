import { apiClient } from "../api/apiClient";
import type { AdminDashboardData } from "../types/adminDashboard";

export const adminDashboardKeys = {
  all: ["admin-dashboard"] as const,
};

export const adminDashboardService = {
  /**
   * Admin: Get aggregated dashboard statistics, queues, finance, and activities.
   * GET /api/admin/dashboard
   */
  async getDashboard(): Promise<AdminDashboardData> {
    const raw = await apiClient<any>("/admin/dashboard");
    return {
      users: {
        total: Number(raw?.users?.total || 0),
        students: Number(raw?.users?.students || 0),
        teachers: Number(raw?.users?.teachers || 0),
        sponsors: Number(raw?.users?.sponsors || 0),
        verifiedTeachers: Number(raw?.users?.verifiedTeachers || 0),
        newThisMonth: Number(raw?.users?.newThisMonth || 0),
      },
      pending: {
        teacherVerifications: Number(raw?.pending?.teacherVerifications || 0),
        classApprovals: Number(raw?.pending?.classApprovals || 0),
        courseProposals: Number(raw?.pending?.courseProposals || 0),
        scholarshipApplications: Number(raw?.pending?.scholarshipApplications || 0),
        reports: Number(raw?.pending?.reports || 0),
        refundsRequired: Number(raw?.pending?.refundsRequired || 0),
      },
      training: {
        courses: Number(raw?.training?.courses || 0),
        classes: Number(raw?.training?.classes || 0),
        activeClasses: Number(raw?.training?.activeClasses || 0),
        upcomingClasses: Number(raw?.training?.upcomingClasses || 0),
        classesByStatus: raw?.training?.classesByStatus || {},
        confirmedEnrollments: Number(raw?.training?.confirmedEnrollments || 0),
      },
      finance: {
        revenue: parseFloat(String(raw?.finance?.revenue || 0)),
        commission: parseFloat(String(raw?.finance?.commission || 0)),
        revenueThisMonth: parseFloat(String(raw?.finance?.revenueThisMonth || 0)),
        transactions: Number(raw?.finance?.transactions || 0),
        refunds: Number(raw?.finance?.refunds || 0),
        monthly: Array.isArray(raw?.finance?.monthly)
          ? raw.finance.monthly.map((m: any) => ({
              month: String(m.month || ""),
              revenue: parseFloat(String(m.revenue || 0)),
              commission: parseFloat(String(m.commission || 0)),
            }))
          : [],
      },
      scholarship: {
        openCampaigns: Number(raw?.scholarship?.openCampaigns || 0),
        totalFund: parseFloat(String(raw?.scholarship?.totalFund || 0)),
        allocatedFund: parseFloat(String(raw?.scholarship?.allocatedFund || 0)),
        usedFund: parseFloat(String(raw?.scholarship?.usedFund || 0)),
        allocatedPercent: Number(raw?.scholarship?.allocatedPercent || 0),
        studentsReceived: Number(raw?.scholarship?.studentsReceived || 0),
        newApplications: Number(raw?.scholarship?.newApplications || 0),
      },
      recentActivities: Array.isArray(raw?.recentActivities)
        ? raw.recentActivities.map((a: any) => ({
            id: String(a.id || a._id || ""),
            action: String(a.action || ""),
            targetType: String(a.targetType || ""),
            targetId: String(a.targetId || ""),
            actorEmail: a.actorEmail || null,
            createdAt: a.createdAt,
          }))
        : [],
    };
  },
};
