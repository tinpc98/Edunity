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
const tokenRevocationService = require("./tokenRevocationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const ROLES = ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"];
const USER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"];
const SETTABLE_STATUSES = ["ACTIVE", "SUSPENDED", "BANNED"];

const userNotFound = () => new AppError("User not found", "USER_NOT_FOUND", 404);

const formatStatusChangedBy = (changedBy) => {
  if (!changedBy) return null;
  if (typeof changedBy === "object") {
    if (changedBy._id) {
      return {
        id: changedBy._id.toString(),
        email: changedBy.email || null,
        fullName:
          changedBy.studentProfile?.fullName ||
          changedBy.teacherProfile?.fullName ||
          "Admin",
      };
    }
    if (changedBy.id) {
      return changedBy;
    }
  }
  return { id: changedBy.toString() };
};

const presentUser = (user) => ({
  id: (user._id || user.id).toString(),
  email: user.email,
  role: user.role,
  status: user.status,
  ...getDisplayProfile(user),
  verificationStatus: user.teacherProfile ? user.teacherProfile.verificationStatus : undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  statusReason: user.statusReason || null,
  statusChangedAt: user.statusChangedAt || null,
  statusChangedBy: formatStatusChangedBy(user.statusChangedBy),
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
    User.find(filter)
      .select("-passwordHash")
      .populate("statusChangedBy", "email studentProfile teacherProfile")
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
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

  let statusReason = user.statusReason || null;
  let statusChangedAt = user.statusChangedAt || null;
  let statusChangedBy = user.statusChangedBy || null;

  // Legacy data fallback for accounts locked before new fields were added
  // FIX-01: Cross-check against the user's chronologically latest status change action.
  // Only extract reason if that latest status audit transitioned the user to their CURRENT status.
  if ((user.status === "SUSPENDED" || user.status === "BANNED") && !statusReason) {
    const latestStatusAudit = await AuditLog.findOne({
      targetType: "User",
      targetId: user._id,
      action: { $in: ["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"] },
    })
      .sort({ createdAt: -1 })
      .populate("actorAdminId", "email studentProfile teacherProfile")
      .lean();

    if (
      latestStatusAudit &&
      latestStatusAudit.action === `USER_${user.status}` &&
      latestStatusAudit.afterState &&
      latestStatusAudit.afterState.status === user.status &&
      latestStatusAudit.afterState.reason
    ) {
      statusReason = latestStatusAudit.afterState.reason;
      if (!statusChangedAt) {
        statusChangedAt = latestStatusAudit.createdAt;
      }
      if (!statusChangedBy && latestStatusAudit.actorAdminId) {
        statusChangedBy = latestStatusAudit.actorAdminId;
      }
    }
  }

  if (statusChangedBy && mongoose.isValidObjectId(statusChangedBy) && !statusChangedBy.email) {
    const adminUser = await User.findById(statusChangedBy).select("_id email studentProfile teacherProfile").lean();
    if (adminUser) {
      statusChangedBy = adminUser;
    }
  }

  user.statusReason = statusReason;
  user.statusChangedAt = statusChangedAt;
  user.statusChangedBy = statusChangedBy;

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
 * Runs within a MongoDB Multi-document Transaction with conditional update for concurrency safety.
 */
const updateUserStatus = async (adminId, userId, body) => {
  const { status } = body;
  if (!SETTABLE_STATUSES.includes(status)) {
    throw validationError(`status must be one of ${SETTABLE_STATUSES.join(", ")}`);
  }

  let reason = null;
  if (status !== "ACTIVE") {
    if (typeof body.reason !== "string" || isBlank(body.reason)) {
      throw validationError("reason is required when suspending or banning an account");
    }
    reason = body.reason.trim();
    if (reason.length > 500) {
      throw validationError("reason cannot exceed 500 characters");
    }
  }

  // Pre-checks
  if (adminId && userId.toString() === adminId.toString()) {
    throw validationError("You cannot change the status of your own account");
  }

  const existingUser = await getUserOrThrow(userId);
  if (existingUser.role === "ADMIN") {
    throw new AppError("Admin accounts cannot be suspended or banned here", "FORBIDDEN", 403);
  }

  // Idempotency: repeated request with same status
  if (existingUser.status === status) {
    // Durable idempotent recovery - flush any pending tasks or unrevoked tokens
    if (status !== "ACTIVE") {
      await tokenRevocationService.processPendingTasksForUser(existingUser._id);
    }
    let populatedUser = existingUser.toObject();
    if (populatedUser.statusChangedBy && mongoose.isValidObjectId(populatedUser.statusChangedBy)) {
      const adminActor = await User.findById(populatedUser.statusChangedBy).select("_id email studentProfile teacherProfile").lean();
      if (adminActor) populatedUser.statusChangedBy = adminActor;
    }
    return presentUser(populatedUser);
  }

  const session = await mongoose.startSession();
  let committedDoc = null;
  let actuallyChanged = false;
  try {
    await session.withTransaction(async () => {
      const currentUser = await User.findOne({ _id: existingUser._id, ...NOT_DELETED }).session(session);
      if (!currentUser) throw userNotFound();

      if (currentUser.role === "ADMIN") {
        throw new AppError("Admin accounts cannot be suspended or banned here", "FORBIDDEN", 403);
      }

      if (currentUser.status === status) {
        committedDoc = currentUser.toObject();
        return;
      }

      const beforeState = {
        status: currentUser.status,
        statusReason: currentUser.statusReason || null,
        statusChangedAt: currentUser.statusChangedAt || null,
        statusChangedBy: currentUser.statusChangedBy || null,
      };

      const now = new Date();
      const updateFields = {
        status,
        statusReason: status === "ACTIVE" ? null : reason,
        statusChangedAt: now,
        statusChangedBy: adminId,
      };

      const updated = await User.findOneAndUpdate(
        { _id: currentUser._id, status: currentUser.status, ...NOT_DELETED },
        { $set: updateFields },
        { session, returnDocument: "after" }
      );

      if (!updated) {
        throw new AppError(
          "Concurrent user status update detected. Please retry.",
          "CONCURRENT_UPDATE_CONFLICT",
          409
        );
      }

      await audit(
        {
          actorAdminId: adminId,
          action: `USER_${status}`,
          targetType: "User",
          targetId: updated._id,
          beforeState,
          afterState: {
            status,
            reason: status === "ACTIVE" ? null : reason,
            statusChangedAt: now,
            statusChangedBy: adminId,
          },
        },
        session
      );

      // BE-USER-FIX-02: Atomically record durable TokenRevocationTask within the same transaction
      if (status !== "ACTIVE") {
        await tokenRevocationService.recordRevocationTask(
          {
            userId: updated._id,
            targetStatus: status,
            reason,
            revokeBefore: now,
          },
          session
        );
      }

      committedDoc = updated.toObject();
      actuallyChanged = true;
    });
  } finally {
    await session.endSession();
  }

  // BE-USER-FIX-02: Post-commit side-effects (cannot be rolled back if placed inside transaction)
  // Status change has already committed in DB. Ensure side-effect errors do not fail the request with 500.
  if (status !== "ACTIVE") {
    try {
      await tokenRevocationService.processPendingTasksForUser(committedDoc._id);
    } catch (err) {
      console.error(
        `[adminService] Immediate token revocation sweep failed for userId=${committedDoc._id}:`,
        err
      );
    }
  } else if (actuallyChanged) {
    try {
      await notify(
        committedDoc._id,
        "Tài khoản đã được kích hoạt lại",
        "Bạn có thể tiếp tục sử dụng Edunity.",
        "ACCOUNT_REACTIVATED"
      );
    } catch (notifErr) {
      console.error(`[adminService] Post-commit notification failed for userId=${committedDoc._id}:`, notifErr);
    }
  }

  // Populate statusChangedBy admin info
  if (committedDoc.statusChangedBy && mongoose.isValidObjectId(committedDoc.statusChangedBy)) {
    const adminActor = await User.findById(committedDoc.statusChangedBy).select("_id email studentProfile teacherProfile").lean();
    if (adminActor) {
      committedDoc.statusChangedBy = adminActor;
    }
  }

  return presentUser(committedDoc);
};

const getUserStatusHistory = async (userId, paging) => {
  if (!mongoose.isValidObjectId(userId)) throw userNotFound();
  const user = await User.findOne({ _id: userId, ...NOT_DELETED });
  if (!user) throw userNotFound();

  const filter = {
    targetType: "User",
    targetId: user._id,
    action: { $in: ["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"] },
  };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("actorAdminId", "email studentProfile teacherProfile")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const items = logs.map((log) => {
    let performedBy = null;
    if (log.actorAdminId) {
      const actor = log.actorAdminId;
      performedBy = {
        id: (actor._id || actor).toString(),
        email: actor.email || null,
        fullName: actor.studentProfile?.fullName || actor.teacherProfile?.fullName || "Admin",
      };
    }

    const actionStatus = log.action.replace("USER_", "");
    const toStatus = log.afterState?.status || actionStatus;
    const fromStatus = log.beforeState?.status || null;
    const reason = log.afterState?.reason || null;

    return {
      id: log._id.toString(),
      action: log.action,
      fromStatus,
      toStatus,
      reason,
      performedBy,
      performedAt: log.createdAt,
    };
  });

  return paged(items, total, paging);
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

module.exports = { listUsers, getUser, updateUserStatus, getDashboard, getUserStatusHistory };
