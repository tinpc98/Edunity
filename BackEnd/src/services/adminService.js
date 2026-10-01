const mongoose = require("mongoose");
const {
  User,
  Course,
  Class,
  CourseProposal,
  Enrollment,
  Transaction,
  TeacherEarning,
  ScholarshipCampaign,
  ScholarshipApplication,
  Scholarship,
  SponsorContribution,
  Report,
  AuditLog,
} = require("../models");
const { AppError } = require("../utils/errors");
const { paged, validationError, escapeRegex, isBlank } = require("../utils/http");
const { toNum, toDec } = require("../utils/money");
const { getDisplayProfile } = require("../utils/userProfile");
const { audit } = require("./auditService");
const { notify } = require("./notificationService");
const authTokenService = require("./authTokenService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const ROLES = ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"];
const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"];
const SETTABLE_STATUSES = ["ACTIVE", "SUSPENDED", "BANNED"];

const userNotFound = () => new AppError("User not found", "USER_NOT_FOUND", 404);

const presentUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  role: user.role,
  status: user.status,
  ...getDisplayProfile(user),
  verificationStatus: user.teacherProfile ? user.teacherProfile.verificationStatus : undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// ---------- User management (FR-ADM-01) ----------

const listUsers = async (query, paging) => {
  const filter = { ...NOT_DELETED };
  if (query.role) {
    if (!ROLES.includes(query.role)) throw validationError("role is invalid");
    filter.role = query.role;
  }
  if (query.status) {
    if (!USER_STATUSES.includes(query.status)) throw validationError("status is invalid");
    filter.status = query.status;
  }
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [
      { email: pattern },
      { "studentProfile.fullName": pattern },
      { "teacherProfile.fullName": pattern },
      { "sponsorProfile.representativeName": pattern },
      { "sponsorProfile.organizationName": pattern },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter).select("-passwordHash").sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    User.countDocuments(filter),
  ]);
  return paged(items.map(presentUser), total, paging);
};

const getUserOrThrow = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) throw userNotFound();
  const user = await User.findOne({ _id: userId, ...NOT_DELETED }).select("-passwordHash");
  if (!user) throw userNotFound();
  return user;
};

const getUser = async (userId) => {
  const user = (await getUserOrThrow(userId)).toObject();
  const activity = {};
  if (user.role === "STUDENT") {
    activity.enrollments = await Enrollment.countDocuments({ studentId: user._id, enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] } });
    activity.scholarships = await Scholarship.countDocuments({ studentId: user._id });
  } else if (user.role === "TEACHER") {
    activity.classes = await Class.countDocuments({ teacherId: user._id, ...NOT_DELETED });
    activity.students = await Enrollment.countDocuments({ teacherId: user._id, enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] } });
  } else if (user.role === "SPONSOR") {
    activity.contributions = await SponsorContribution.countDocuments({ sponsorId: user._id, contributionStatus: "COMPLETED" });
  }
  activity.reportsAgainst = await Report.countDocuments({ reportedUserId: user._id });

  return {
    ...presentUser(user),
    profile: user.studentProfile || user.teacherProfile || user.sponsorProfile || null,
    activity,
  };
};

/**
 * Suspend / ban / reactivate an account. A blocked account is rejected by the auth middleware
 * on its next request and all its refresh tokens are revoked (force logout).
 */
const updateUserStatus = async (adminId, userId, body) => {
  const { status } = body;
  if (!SETTABLE_STATUSES.includes(status)) throw validationError(`status must be one of ${SETTABLE_STATUSES.join(", ")}`);
  if (status !== "ACTIVE" && isBlank(body.reason)) throw validationError("reason is required when suspending or banning an account");

  const user = await getUserOrThrow(userId);
  if (user._id.toString() === adminId.toString()) throw validationError("You cannot change the status of your own account");
  if (user.role === "ADMIN") throw new AppError("Admin accounts cannot be suspended or banned here", "FORBIDDEN", 403);
  if (user.status === status) return presentUser(user.toObject());

  const before = user.status;
  user.status = status;
  await user.save();
  if (status !== "ACTIVE") await authTokenService.revokeAllForUser(user._id);

  await audit({
    actorAdminId: adminId,
    action: `USER_${status}`,
    targetType: "User",
    targetId: user._id,
    beforeState: { status: before },
    afterState: { status, reason: body.reason || null },
  });
  if (status === "ACTIVE") await notify(user._id, "Tài khoản đã được kích hoạt lại", "Bạn có thể tiếp tục sử dụng Edunity.", "ACCOUNT_REACTIVATED");

  return presentUser(user.toObject());
};

// ---------- Dashboard (FR-ADM-21) ----------

const sumDecimal = async (Model, match, field) => {
  const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return row ? toNum(row.total) : 0;
};

const countBy = async (Model, match, field) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

const getDashboard = async () => {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [
    usersByRole,
    verifiedTeachers,
    newUsersThisMonth,
    pendingTeacherVerifications,
    classesByStatus,
    upcomingClasses,
    courses,
    pendingCourseProposals,
    pendingScholarshipApplications,
    openReports,
    refundsRequired,
    confirmedEnrollments,
    revenue,
    commission,
    revenueThisMonth,
    completedTransactions,
    refunds,
    monthlyRows,
    campaignTotals,
    openCampaigns,
    studentsReceived,
    recentLogs,
  ] = await Promise.all([
    countBy(User, NOT_DELETED, "role"),
    User.countDocuments({ role: "TEACHER", "teacherProfile.verificationStatus": "VERIFIED", ...NOT_DELETED }),
    User.countDocuments({ createdAt: { $gte: startOfMonth }, ...NOT_DELETED }),
    User.countDocuments({ role: "TEACHER", "teacherProfile.verificationStatus": "PENDING", ...NOT_DELETED }),
    countBy(Class, NOT_DELETED, "status"),
    Class.countDocuments({ status: "OPEN", startDate: { $gt: now }, ...NOT_DELETED }),
    Course.countDocuments({ status: "ACTIVE", ...NOT_DELETED }),
    CourseProposal.countDocuments({ status: "PENDING_REVIEW" }),
    ScholarshipApplication.countDocuments({ status: "SUBMITTED" }),
    Report.countDocuments({ status: { $in: ["OPEN", "IN_REVIEW"] } }),
    Transaction.countDocuments({ transactionType: "REFUND", status: "PENDING" }),
    Enrollment.countDocuments({ enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] } }),
    // Revenue = tuition of confirmed paid enrollments, whatever the payment source (payment, scholarship, mixed)
    sumDecimal(TeacherEarning, {}, "grossAmount"),
    sumDecimal(TeacherEarning, {}, "commissionAmount"),
    sumDecimal(TeacherEarning, { createdAt: { $gte: startOfMonth } }, "grossAmount"),
    Transaction.countDocuments({ status: "COMPLETED" }),
    Transaction.countDocuments({ transactionType: "REFUND" }),
    TeacherEarning.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$grossAmount" },
          commission: { $sum: "$commissionAmount" },
        },
      },
    ]),
    ScholarshipCampaign.aggregate([
      { $match: { status: { $ne: "DRAFT" }, ...NOT_DELETED } },
      { $group: { _id: null, funded: { $sum: "$fundedAmount" }, allocated: { $sum: "$allocatedAmount" }, used: { $sum: "$usedAmount" } } },
    ]),
    ScholarshipCampaign.countDocuments({ status: "OPEN_FOR_FUNDING", ...NOT_DELETED }),
    Scholarship.countDocuments({}),
    AuditLog.find({}).sort({ createdAt: -1 }).limit(10).populate("actorAdminId", "email").lean(),
  ]);

  const monthlyMap = new Map(monthlyRows.map((row) => [row._id, row]));
  const monthly = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7);
    const row = monthlyMap.get(month);
    monthly.push({ month, revenue: toDec(row ? toNum(row.revenue) : 0), commission: toDec(row ? toNum(row.commission) : 0) });
  }

  const totals = campaignTotals[0] || {};
  const funded = toNum(totals.funded);
  const allocated = toNum(totals.allocated);
  const pendingClassApprovals = classesByStatus.PENDING_APPROVAL || 0;

  return {
    users: {
      total: Object.values(usersByRole).reduce((sum, count) => sum + count, 0),
      students: usersByRole.STUDENT || 0,
      teachers: usersByRole.TEACHER || 0,
      sponsors: usersByRole.SPONSOR || 0,
      verifiedTeachers,
      newThisMonth: newUsersThisMonth,
    },
    pending: {
      teacherVerifications: pendingTeacherVerifications,
      classApprovals: pendingClassApprovals,
      courseProposals: pendingCourseProposals,
      scholarshipApplications: pendingScholarshipApplications,
      reports: openReports,
      refundsRequired,
    },
    training: {
      courses,
      classes: Object.values(classesByStatus).reduce((sum, count) => sum + count, 0),
      activeClasses: (classesByStatus.OPEN || 0) + (classesByStatus.IN_PROGRESS || 0),
      upcomingClasses,
      classesByStatus,
      confirmedEnrollments,
    },
    finance: {
      revenue: toDec(revenue),
      commission: toDec(commission),
      revenueThisMonth: toDec(revenueThisMonth),
      transactions: completedTransactions,
      refunds,
      monthly,
    },
    scholarship: {
      openCampaigns,
      totalFund: toDec(funded),
      allocatedFund: toDec(allocated),
      usedFund: toDec(toNum(totals.used)),
      allocatedPercent: funded > 0 ? Math.round((allocated / funded) * 1000) / 10 : 0,
      studentsReceived,
      newApplications: pendingScholarshipApplications,
    },
    recentActivities: recentLogs.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      actorEmail: log.actorAdminId ? log.actorAdminId.email : null,
      createdAt: log.createdAt,
    })),
  };
};

module.exports = { listUsers, getUser, updateUserStatus, getDashboard };
