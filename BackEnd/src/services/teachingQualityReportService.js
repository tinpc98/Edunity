const {
  Class,
  Session,
  TeacherViolation,
  TeacherIncidentReport,
  TeacherDisciplineCase,
  Report,
  Review,
  SessionReview,
  SessionRefundReview,
  User,
} = require("../models");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError, parseDate } = require("../utils/http");

const NOT_DELETED = { isDeleted: { $ne: true } };
const MAX_TRACE_IDS = 1000;

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const round2 = (num) => Math.round(num * 100) / 100;

const buildDateRangeFilter = (from, to) => {
  if (!from && !to) return null;
  const cond = {};
  if (from) cond.$gte = from;
  if (to) cond.$lte = to;
  return cond;
};

const countByKey = (docs, keyGetter) => {
  const counts = {};
  for (const d of docs) {
    const k = keyGetter(d) || "UNKNOWN";
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
};

const summarizeRatings = (reviews) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!reviews.length) {
    return { count: 0, averageRating: null, ratingDistribution: distribution };
  }
  let sum = 0;
  for (const r of reviews) {
    const val = Number(r.rating);
    if (Number.isFinite(val)) {
      sum += val;
      const bucket = Math.min(5, Math.max(1, Math.round(val)));
      distribution[bucket] += 1;
    }
  }
  return {
    count: reviews.length,
    averageRating: round2(sum / reviews.length),
    ratingDistribution: distribution,
  };
};

const averageField = (docs, field) => {
  const vals = docs.map((d) => d[field]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return null;
  return round2(vals.reduce((s, v) => s + v, 0) / vals.length);
};

const computeMetricsBundle = ({
  sessions,
  violations,
  incidentReports,
  disciplineCases,
  complaints,
  classReviews,
  sessionReviews,
  refundReviews,
}) => {
  const completedCount = sessions.filter((s) => s.status === "COMPLETED").length;
  const autoCompletedCount = sessions.filter((s) => s.lifecycleState === "AUTO_COMPLETED").length;
  const cancelledCount = sessions.filter((s) => s.status === "CANCELLED").length;
  const rescheduledCount = sessions.filter((s) => s.lifecycleState === "RESCHEDULED").length;
  const interruptedCount = sessions.filter((s) => s.status === "INTERRUPTED").length;
  const upcomingOrActiveCount = sessions.filter((s) =>
    ["SCHEDULED", "WAITING", "IN_PROGRESS"].includes(s.status)
  ).length;
  const teacherNoShowCancelledCount = sessions.filter((s) => s.endReason === "TEACHER_NO_SHOW").length;
  const teacherLeftEarlyCount = sessions.filter((s) => s.endReason === "TEACHER_LEFT_EARLY").length;
  const incidentCancelledCount = sessions.filter((s) => s.endReason === "INCIDENT_CANCELLED").length;
  const adminCancelledCount = sessions.filter((s) => s.endReason === "ADMIN_CANCELLED").length;
  const makeupSessionsCount = sessions.filter(
    (s) => s.scheduleSource === "MAKEUP" || (s.rescheduleMetadata && s.rescheduleMetadata.isMakeupSession)
  ).length;
  const finalizedSessions = completedCount + cancelledCount;
  const deliveryCompletionRate = finalizedSessions > 0 ? round2((completedCount / finalizedSessions) * 100) : null;

  const classReviewSummary = summarizeRatings(classReviews);
  const sessionReviewBase = summarizeRatings(sessionReviews);
  const sessionReviewSummary = {
    ...sessionReviewBase,
    averagePreparednessRating: averageField(sessionReviews, "teacherPreparednessRating"),
    averageClarityRating: averageField(sessionReviews, "clarityRating"),
  };

  const allReviewCount = classReviewSummary.count + sessionReviewSummary.count;
  const weightedSum =
    (classReviewSummary.averageRating !== null
      ? classReviews.reduce((s, r) => s + Number(r.rating || 0), 0)
      : 0) +
    (sessionReviewSummary.averageRating !== null
      ? sessionReviews.reduce((s, r) => s + Number(r.rating || 0), 0)
      : 0);
  const combinedReviewSummary = {
    totalReviewsCount: allReviewCount,
    weightedAverageRating: allReviewCount > 0 ? round2(weightedSum / allReviewCount) : null,
  };

  const problematicSessions = sessions.filter(
    (s) =>
      s.status === "CANCELLED" ||
      s.status === "INTERRUPTED" ||
      ["TEACHER_NO_SHOW", "TEACHER_LEFT_EARLY", "INCIDENT_CANCELLED"].includes(s.endReason)
  );

  return {
    sessions: {
      totalCount: sessions.length,
      completedCount,
      autoCompletedCount,
      cancelledCount,
      rescheduledCount,
      interruptedCount,
      upcomingOrActiveCount,
      teacherNoShowCancelledCount,
      teacherLeftEarlyCount,
      incidentCancelledCount,
      adminCancelledCount,
      makeupSessionsCount,
      deliveryCompletionRate,
    },
    violations: {
      totalCount: violations.length,
      countsTowardDisciplineCount: violations.filter((v) => Boolean(v.countsTowardDiscipline)).length,
      confirmedCount: violations.filter((v) => v.reviewStatus === "CONFIRMED").length,
      waivedCount: violations.filter((v) => v.reviewStatus === "WAIVED").length,
      pendingReviewCount: violations.filter((v) =>
        ["PENDING_INCIDENT_WINDOW", "UNDER_INCIDENT_REVIEW"].includes(v.reviewStatus)
      ).length,
      bySeverity: countByKey(violations, (v) => v.severity),
      byReviewStatus: countByKey(violations, (v) => v.reviewStatus),
    },
    incidentReports: {
      totalCount: incidentReports.length,
      lateSubmissionsCount: incidentReports.filter((r) => r.submittedWithinWindow === false).length,
      appealsCount: incidentReports.reduce(
        (sum, r) => sum + (Array.isArray(r.appeals) ? r.appeals.length : 0),
        0
      ),
      byReviewStatus: countByKey(incidentReports, (r) => r.reviewStatus),
      byIncidentType: countByKey(incidentReports, (r) => r.incidentType),
    },
    disciplineCases: {
      totalCount: disciplineCases.length,
      openCount: disciplineCases.filter((c) =>
        ["OPEN_ADMIN_REVIEW", "NEEDS_POLICY_CONFIGURATION"].includes(c.status)
      ).length,
      autoExecutionBlockedCount: disciplineCases.filter((c) => Boolean(c.autoExecutionBlocked)).length,
      byStatus: countByKey(disciplineCases, (c) => c.status),
      byTriggerRule: countByKey(disciplineCases, (c) => c.triggerRule),
      byRecommendedAction: countByKey(disciplineCases, (c) => c.recommendedAction),
    },
    complaints: {
      totalCount: complaints.length,
      openOrInReviewCount: complaints.filter((c) => ["OPEN", "IN_REVIEW"].includes(c.status)).length,
      resolvedCount: complaints.filter((c) => c.status === "RESOLVED").length,
      rejectedCount: complaints.filter((c) => c.status === "REJECTED").length,
      byType: countByKey(complaints, (c) => c.type),
      byStatus: countByKey(complaints, (c) => c.status),
    },
    reviews: {
      classReviews: classReviewSummary,
      sessionReviews: sessionReviewSummary,
      combined: combinedReviewSummary,
    },
    refundReviews: {
      totalCount: refundReviews.length,
      needsFinancialReviewCount: refundReviews.filter((r) => r.status === "NEEDS_FINANCIAL_REVIEW").length,
      byStatus: countByKey(refundReviews, (r) => r.status),
      byTriggerReason: countByKey(refundReviews, (r) => r.triggerReason),
    },
    traceability: {
      sourceCollections: [
        "Session",
        "TeacherViolation",
        "TeacherIncidentReport",
        "TeacherDisciplineCase",
        "Report",
        "Review",
        "SessionReview",
        "SessionRefundReview",
      ],
      timestampFields: {
        Session: "startDatetime",
        TeacherViolation: "detectedAt",
        TeacherIncidentReport: "createdAt",
        TeacherDisciplineCase: "createdAt",
        Report: "createdAt",
        Review: "createdAt",
        SessionReview: "createdAt",
        SessionRefundReview: "createdAt",
      },
      sourceTotals: {
        sessions: sessions.length,
        problematicSessions: problematicSessions.length,
        violations: violations.length,
        incidentReports: incidentReports.length,
        disciplineCases: disciplineCases.length,
        complaints: complaints.length,
        classReviews: classReviews.length,
        sessionReviews: sessionReviews.length,
        refundReviews: refundReviews.length,
      },
      sourceIds: {
        sessionIds: sessions.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        problematicSessionIds: problematicSessions.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        violationIds: violations.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        incidentReportIds: incidentReports.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        disciplineCaseIds: disciplineCases.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        complaintReportIds: complaints.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        classReviewIds: classReviews.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        sessionReviewIds: sessionReviews.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
        refundReviewIds: refundReviews.slice(0, MAX_TRACE_IDS).map((d) => toId(d._id)),
      },
      truncated: {
        sessions: sessions.length > MAX_TRACE_IDS,
        violations: violations.length > MAX_TRACE_IDS,
        incidentReports: incidentReports.length > MAX_TRACE_IDS,
        disciplineCases: disciplineCases.length > MAX_TRACE_IDS,
        complaints: complaints.length > MAX_TRACE_IDS,
        classReviews: classReviews.length > MAX_TRACE_IDS,
        sessionReviews: sessionReviews.length > MAX_TRACE_IDS,
        refundReviews: refundReviews.length > MAX_TRACE_IDS,
      },
      sideEffectsPolicy: {
        readOnly: true,
        mutatedFinancialLedgers: false,
        autoIssuedDiscipline: false,
      },
    },
  };
};

const fetchScopedQualitySources = async (query = {}) => {
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");
  if (from && to && from > to) {
    throw validationError("from must be before or equal to to");
  }
  const dateRange = buildDateRangeFilter(from, to);

  let teacherFilterId = null;
  if (query.teacherId) {
    assertId(query.teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
    const teacherExists = await User.exists({ _id: query.teacherId, role: "TEACHER", ...NOT_DELETED });
    if (!teacherExists) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);
    teacherFilterId = query.teacherId;
  }

  let hasClassScopeFilter = false;
  const classQuery = {};
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    classQuery._id = query.classId;
    hasClassScopeFilter = true;
  }
  if (query.subjectId) {
    assertId(query.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    classQuery.subjectId = query.subjectId;
    hasClassScopeFilter = true;
  }
  if (query.categoryId) {
    assertId(query.categoryId, "Category not found", "CATEGORY_NOT_FOUND");
    classQuery.categoryId = query.categoryId;
    hasClassScopeFilter = true;
  }
  if (teacherFilterId) {
    classQuery.teacherId = teacherFilterId;
  }

  const scopedClasses = await Class.find(classQuery)
    .select("_id teacherId subjectId categoryId courseId className")
    .lean();
  const scopedClassIds = scopedClasses.map((c) => c._id);
  const classTeacherMap = new Map(scopedClasses.map((c) => [toId(c._id), toId(c.teacherId)]));

  // Common scope helpers
  const scopeDocFilter = (extra = {}) => {
    const f = { ...extra };
    if (teacherFilterId) f.teacherId = teacherFilterId;
    if (hasClassScopeFilter) f.classId = { $in: scopedClassIds };
    return f;
  };

  const sessionFilter = scopeDocFilter(dateRange ? { startDatetime: dateRange } : {});
  const violationFilter = scopeDocFilter(dateRange ? { detectedAt: dateRange } : {});
  const incidentFilter = scopeDocFilter(dateRange ? { createdAt: dateRange } : {});
  const refundFilter = scopeDocFilter(dateRange ? { createdAt: dateRange } : {});
  const classReviewFilter = scopeDocFilter({ ...NOT_DELETED, ...(dateRange ? { createdAt: dateRange } : {}) });
  const sessionReviewFilter = scopeDocFilter({ ...NOT_DELETED, ...(dateRange ? { createdAt: dateRange } : {}) });

  const reportFilter = { ...(dateRange ? { createdAt: dateRange } : {}) };
  if (query.reportType) {
    reportFilter.type = String(query.reportType).trim().toUpperCase();
  }
  if (hasClassScopeFilter) {
    reportFilter.classId = { $in: scopedClassIds };
  } else if (teacherFilterId) {
    reportFilter.$or = [{ reportedUserId: teacherFilterId }, { classId: { $in: scopedClassIds } }];
  }

  const disciplineFilter = { ...(dateRange ? { createdAt: dateRange } : {}) };
  if (teacherFilterId) disciplineFilter.teacherId = teacherFilterId;

  const [
    sessions,
    violations,
    incidentReports,
    disciplineCasesRaw,
    reportsRaw,
    classReviews,
    sessionReviews,
    refundReviews,
  ] = await Promise.all([
    Session.find(sessionFilter)
      .select(
        "classId teacherId status lifecycleState endReason scheduleSource rescheduleMetadata startDatetime endDatetime"
      )
      .lean(),
    TeacherViolation.find(violationFilter)
      .select("sessionId classId teacherId severity violationCategory violationType reviewStatus countsTowardDiscipline detectedAt")
      .lean(),
    TeacherIncidentReport.find(incidentFilter)
      .select("sessionId classId teacherId incidentType requestedAction reviewStatus submittedWithinWindow appeals createdAt")
      .lean(),
    TeacherDisciplineCase.find(disciplineFilter)
      .select("teacherId triggerRule recommendedAction status autoExecutionBlocked triggerViolationIds createdAt")
      .lean(),
    Report.find(reportFilter).select("reportedUserId classId type status createdAt").lean(),
    Review.find(classReviewFilter).select("classId teacherId studentId rating createdAt").lean(),
    SessionReview.find(sessionReviewFilter)
      .select("sessionId classId teacherId studentId rating teacherPreparednessRating clarityRating createdAt")
      .lean(),
    SessionRefundReview.find(refundFilter).select("sessionId classId teacherId triggerReason status createdAt").lean(),
  ]);

  // Intersect discipline cases if scoped by class/subject/category
  let disciplineCases = disciplineCasesRaw;
  if (hasClassScopeFilter) {
    const scopedViolationIds = new Set(violations.map((v) => toId(v._id)));
    disciplineCases = disciplineCasesRaw.filter((dc) =>
      (dc.triggerViolationIds || []).some((vid) => scopedViolationIds.has(toId(vid)))
    );
  }

  // Collect all teacher IDs across every source so we can attribute complaints cleanly
  const reportClassIds = [...new Set(reportsRaw.map((r) => toId(r.classId)).filter(Boolean))];
  const missingClassIds = reportClassIds.filter((cid) => !classTeacherMap.has(cid));
  if (missingClassIds.length) {
    const extraClasses = await Class.find({ _id: { $in: missingClassIds } }).select("_id teacherId").lean();
    for (const c of extraClasses) classTeacherMap.set(toId(c._id), toId(c.teacherId));
  }

  const candidateTeacherIds = new Set([
    ...scopedClasses.map((c) => toId(c.teacherId)),
    ...sessions.map((s) => toId(s.teacherId)),
    ...violations.map((v) => toId(v.teacherId)),
    ...incidentReports.map((i) => toId(i.teacherId)),
    ...disciplineCases.map((d) => toId(d.teacherId)),
    ...classReviews.map((r) => toId(r.teacherId)),
    ...sessionReviews.map((r) => toId(r.teacherId)),
    ...refundReviews.map((r) => toId(r.teacherId)),
  ]);
  if (teacherFilterId) candidateTeacherIds.add(toId(teacherFilterId));

  const reportedUserIds = [...new Set(reportsRaw.map((r) => toId(r.reportedUserId)).filter(Boolean))];
  const knownTeachers = reportedUserIds.length
    ? await User.find({ _id: { $in: reportedUserIds }, role: "TEACHER", ...NOT_DELETED })
        .select("_id")
        .lean()
    : [];
  const reportedTeacherIdSet = new Set(knownTeachers.map((u) => toId(u._id)));

  // Filter & deduplicate complaints attributed to teaching/teacher/class scope
  const complaintMap = new Map();
  const complaintTeacherAttribution = new Map();
  for (const r of reportsRaw) {
    const rid = toId(r._id);
    const directTeacher = r.reportedUserId && reportedTeacherIdSet.has(toId(r.reportedUserId)) ? toId(r.reportedUserId) : null;
    const classTeacher = r.classId ? classTeacherMap.get(toId(r.classId)) || null : null;
    const attributedTeacher = directTeacher || classTeacher;

    if (!attributedTeacher) continue;
    if (teacherFilterId && attributedTeacher !== toId(teacherFilterId)) continue;
    complaintMap.set(rid, r);
    complaintTeacherAttribution.set(rid, attributedTeacher);
    candidateTeacherIds.add(attributedTeacher);
  }
  const complaints = [...complaintMap.values()];

  return {
    filtersApplied: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      teacherId: teacherFilterId ? toId(teacherFilterId) : null,
      classId: query.classId ? toId(query.classId) : null,
      subjectId: query.subjectId ? toId(query.subjectId) : null,
      categoryId: query.categoryId ? toId(query.categoryId) : null,
      reportType: query.reportType ? String(query.reportType).trim().toUpperCase() : null,
    },
    candidateTeacherIds: [...candidateTeacherIds].filter(Boolean),
    sessions,
    violations,
    incidentReports,
    disciplineCases,
    complaints,
    complaintTeacherAttribution,
    classReviews,
    sessionReviews,
    refundReviews,
  };
};

/**
 * SPO-07: Báo cáo chất lượng giảng dạy tổng hợp (Admin only, real sources + source traceability).
 */
const adminGetTeachingQualityReport = async (query = {}, paging) => {
  const data = await fetchScopedQualitySources(query);
  const overallBundle = computeMetricsBundle(data);

  const teacherUsers = data.candidateTeacherIds.length
    ? await User.find({ _id: { $in: data.candidateTeacherIds }, role: "TEACHER", ...NOT_DELETED })
        .select("email status teacherProfile.fullName teacherProfile.verificationStatus")
        .lean()
    : [];
  const teacherMap = new Map(teacherUsers.map((t) => [toId(t._id), t]));

  const groupByTeacher = (docs, getter = (d) => toId(d.teacherId)) => {
    const map = new Map();
    for (const d of docs) {
      const tid = getter(d);
      if (!tid) continue;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid).push(d);
    }
    return map;
  };

  const sessByT = groupByTeacher(data.sessions);
  const violByT = groupByTeacher(data.violations);
  const incByT = groupByTeacher(data.incidentReports);
  const discByT = groupByTeacher(data.disciplineCases);
  const compByT = groupByTeacher(data.complaints, (c) => data.complaintTeacherAttribution.get(toId(c._id)));
  const crByT = groupByTeacher(data.classReviews);
  const srByT = groupByTeacher(data.sessionReviews);
  const rrByT = groupByTeacher(data.refundReviews);

  const teacherBreakdowns = data.candidateTeacherIds
    .map((tid) => {
      const tDoc = teacherMap.get(tid);
      if (!tDoc) return null;
      const metrics = computeMetricsBundle({
        sessions: sessByT.get(tid) || [],
        violations: violByT.get(tid) || [],
        incidentReports: incByT.get(tid) || [],
        disciplineCases: discByT.get(tid) || [],
        complaints: compByT.get(tid) || [],
        classReviews: crByT.get(tid) || [],
        sessionReviews: srByT.get(tid) || [],
        refundReviews: rrByT.get(tid) || [],
      });
      const hasActivity =
        metrics.sessions.totalCount > 0 ||
        metrics.violations.totalCount > 0 ||
        metrics.incidentReports.totalCount > 0 ||
        metrics.disciplineCases.totalCount > 0 ||
        metrics.complaints.totalCount > 0 ||
        metrics.reviews.combined.totalReviewsCount > 0;
      if (!hasActivity && !query.teacherId) return null;

      return {
        teacher: {
          id: tid,
          email: tDoc.email,
          status: tDoc.status,
          fullName: (tDoc.teacherProfile && tDoc.teacherProfile.fullName) || null,
          verificationStatus: (tDoc.teacherProfile && tDoc.teacherProfile.verificationStatus) || null,
        },
        sessions: metrics.sessions,
        violations: metrics.violations,
        incidentReports: metrics.incidentReports,
        disciplineCases: metrics.disciplineCases,
        complaints: metrics.complaints,
        reviews: metrics.reviews,
        refundReviews: metrics.refundReviews,
        sourceTotals: metrics.traceability.sourceTotals,
        sourceIds: metrics.traceability.sourceIds,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const scoreA =
        a.violations.confirmedCount * 3 +
        a.disciplineCases.openCount * 5 +
        a.complaints.totalCount * 2 +
        a.sessions.cancelledCount;
      const scoreB =
        b.violations.confirmedCount * 3 +
        b.disciplineCases.openCount * 5 +
        b.complaints.totalCount * 2 +
        b.sessions.cancelledCount;
      return scoreB - scoreA;
    });

  const totalTeachers = teacherBreakdowns.length;
  const pagedTeachers = teacherBreakdowns.slice(paging.skip, paging.skip + paging.pageSize);

  return {
    generatedAt: new Date().toISOString(),
    filtersApplied: data.filtersApplied,
    summary: {
      teachersEvaluatedCount: totalTeachers,
      sessions: overallBundle.sessions,
      violations: overallBundle.violations,
      incidentReports: overallBundle.incidentReports,
      disciplineCases: overallBundle.disciplineCases,
      complaints: overallBundle.complaints,
      reviews: overallBundle.reviews,
      refundReviews: overallBundle.refundReviews,
    },
    traceability: overallBundle.traceability,
    teachers: paged(pagedTeachers, totalTeachers, paging),
  };
};

/**
 * SPO-07: Báo cáo chất lượng giảng dạy chi tiết của 1 giảng viên (Admin only).
 */
const adminGetTeacherQualityDetail = async (teacherId, query = {}) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED })
    .select("email status teacherProfile.fullName teacherProfile.verificationStatus")
    .lean();
  if (!teacher) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);

  const data = await fetchScopedQualitySources({ ...query, teacherId });
  const bundle = computeMetricsBundle(data);

  return {
    generatedAt: new Date().toISOString(),
    filtersApplied: data.filtersApplied,
    teacher: {
      id: toId(teacher._id),
      email: teacher.email,
      status: teacher.status,
      fullName: (teacher.teacherProfile && teacher.teacherProfile.fullName) || null,
      verificationStatus: (teacher.teacherProfile && teacher.teacherProfile.verificationStatus) || null,
    },
    sessions: bundle.sessions,
    violations: bundle.violations,
    incidentReports: bundle.incidentReports,
    disciplineCases: bundle.disciplineCases,
    complaints: bundle.complaints,
    reviews: bundle.reviews,
    refundReviews: bundle.refundReviews,
    traceability: bundle.traceability,
  };
};

module.exports = {
  adminGetTeachingQualityReport,
  adminGetTeacherQualityDetail,
};

