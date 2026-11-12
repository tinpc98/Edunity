const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  User,
  TeacherSubjectAuthorization,
  TeacherDisciplineCase,
  TeacherViolation,
  TeacherIncidentReport,
  SessionRefundReview,
  TeacherContractReviewPacket,
  AuditLog,
} = require("../models");
const {
  CONTRACT_REVIEW_PACKET_STATUSES,
  CONTRACT_REVIEW_RECOMMENDED_ACTIONS,
  CONTRACT_REVIEW_TRIGGER_SOURCES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { getDependencyStatus, assertTeacherContractGate } = require("./classCreationGateService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);

const assertOptionalString = (val, fieldName, { max = 2000 } = {}) => {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") {
    throw validationError(`${fieldName} must be a string`);
  }
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw validationError(`${fieldName} must not exceed ${max} characters`);
  }
  return trimmed;
};

const TRANSITIONS = {
  DRAFT: ["READY_FOR_CONTRACT_TEAM", "ON_HOLD", "CLOSED"],
  READY_FOR_CONTRACT_TEAM: ["ACKNOWLEDGED_PENDING_TEA12", "ON_HOLD", "CLOSED"],
  ACKNOWLEDGED_PENDING_TEA12: ["ON_HOLD", "CLOSED", "READY_FOR_CONTRACT_TEAM"],
  ON_HOLD: ["READY_FOR_CONTRACT_TEAM", "ACKNOWLEDGED_PENDING_TEA12", "CLOSED"],
  CLOSED: [],
};

const generatePacketCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CRP-${datePart}-${randPart}`;
};

const resolveTea12Dependency = async (teacher, options = {}) => {
  const gateStatus = getDependencyStatus();
  const hasExternalVerifier =
    typeof options.contractVerifier === "function" || Boolean(gateStatus && gateStatus.tea12ContractReady);

  if (!hasExternalVerifier) {
    return {
      tea12DependencyStatus: "BLOCKED",
      tea12Dependency: {
        dependency: "TEA-12",
        owner: "Bao",
        status: "BLOCKED",
        code: "CONTRACT_DEPENDENCY_BLOCKED",
        note: "TEA-12 (TeacherContract module by Bao) is not integrated in this codebase. Contract termination/suspension requires TEA-12 handoff.",
      },
      contractSnapshot: null,
    };
  }

  try {
    const contract = await assertTeacherContractGate({
      teacher,
      contractVerifier: options.contractVerifier,
    });
    return {
      tea12DependencyStatus: "VERIFIED",
      tea12Dependency: {
        dependency: "TEA-12",
        owner: "Bao",
        status: "VERIFIED",
        code: null,
        note: "TEA-12 contract verifier is active; automated contract mutation remains disabled inside TEA-16.",
      },
      contractSnapshot: contract
        ? {
            contractId: contract.id || (contract._id ? String(contract._id) : null),
            status: contract.status || null,
            expiresAt: contract.expiresAt || null,
          }
        : null,
    };
  } catch (err) {
    if (err.code === "CONTRACT_DEPENDENCY_BLOCKED") {
      return {
        tea12DependencyStatus: "BLOCKED",
        tea12Dependency: {
          dependency: "TEA-12",
          owner: "Bao",
          status: "BLOCKED",
          code: "CONTRACT_DEPENDENCY_BLOCKED",
          note: err.message,
        },
        contractSnapshot: null,
      };
    }
    return {
      tea12DependencyStatus: "VERIFIED",
      tea12Dependency: {
        dependency: "TEA-12",
        owner: "Bao",
        status: "VERIFIED",
        code: err.code || null,
        note: err.message,
      },
      contractSnapshot: {
        status: err.details?.contractStatus || (err.code === "TEACHER_CONTRACT_NOT_FOUND" ? "NOT_FOUND" : "INVALID"),
      },
    };
  }
};

const gatherTeacherCorrelationData = async (teacherId, options = {}) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED })
    .select("email status teacherProfile.fullName teacherProfile.verificationStatus teacherProfile.ratingAverage")
    .lean();
  if (!teacher) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);

  const [
    subjectAuthorizations,
    disciplineCases,
    violations,
    incidentReports,
    refundReviews,
    existingPackets,
    tea12State,
  ] = await Promise.all([
    TeacherSubjectAuthorization.find({ teacherId: teacher._id })
      .populate("subjectId", "name slug")
      .populate("categoryId", "name slug")
      .sort({ createdAt: -1 })
      .lean(),
    TeacherDisciplineCase.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).lean(),
    TeacherViolation.find({ teacherId: teacher._id })
      .populate("sessionId", "title className startDatetime endDatetime status")
      .sort({ detectedAt: -1 })
      .lean(),
    TeacherIncidentReport.find({ teacherId: teacher._id })
      .populate("sessionId", "title className startDatetime endDatetime status")
      .sort({ createdAt: -1 })
      .lean(),
    SessionRefundReview.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).lean(),
    TeacherContractReviewPacket.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).lean(),
    resolveTea12Dependency(teacher, options),
  ]);

  const targetIds = [
    ...subjectAuthorizations.map((d) => d._id),
    ...disciplineCases.map((d) => d._id),
    ...violations.map((d) => d._id),
    ...incidentReports.map((d) => d._id),
    ...refundReviews.map((d) => d._id),
    ...existingPackets.map((d) => d._id),
  ];

  const auditLogs = targetIds.length
    ? await AuditLog.find({ targetId: { $in: targetIds } })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    : [];

  const confirmedViolations = violations.filter((v) => v.reviewStatus === "CONFIRMED");
  const confirmedYellowCount = confirmedViolations.filter((v) => v.severity === "YELLOW").length;
  const confirmedRedCount = confirmedViolations.filter((v) => v.severity === "RED").length;
  const confirmedNoShowCount = confirmedViolations.filter((v) => v.severity === "NO_SHOW").length;
  const confirmedEarlyLeaveCount = confirmedViolations.filter((v) => v.severity === "EARLY_LEAVE").length;

  const openDisciplineCases = disciplineCases.filter((c) =>
    ["OPEN_ADMIN_REVIEW", "NEEDS_POLICY_CONFIGURATION"].includes(c.status)
  );
  const terminationCasesCount = openDisciplineCases.filter(
    (c) => c.recommendedAction === "CONTRACT_TERMINATION_REVIEW"
  ).length;
  const pendingIncidentsCount = incidentReports.filter((r) =>
    ["PENDING", "NEEDS_MORE_EVIDENCE"].includes(r.reviewStatus)
  ).length;
  const approvedSubjectAuthCount = subjectAuthorizations.filter((a) => a.status === "APPROVED").length;
  const suspendedSubjectAuthCount = subjectAuthorizations.filter((a) => a.status === "SUSPENDED").length;
  const pendingRefundReviewCount = refundReviews.filter(
    (r) => r.status === "NEEDS_FINANCIAL_REVIEW"
  ).length;

  let suggestedRecommendedAction = "NO_ACTION";
  if (terminationCasesCount > 0 || confirmedNoShowCount >= 3) {
    suggestedRecommendedAction = "TERMINATION_REVIEW";
  } else if (
    openDisciplineCases.length > 0 ||
    confirmedRedCount > 0 ||
    confirmedEarlyLeaveCount > 0 ||
    (suspendedSubjectAuthCount > 0 && confirmedViolations.length > 0)
  ) {
    suggestedRecommendedAction = "SUSPENSION_REVIEW";
  } else if (confirmedYellowCount > 0 || pendingIncidentsCount > 0 || suspendedSubjectAuthCount > 0) {
    suggestedRecommendedAction = "WARNING_NOTICE";
  }

  const requiresContractReview = suggestedRecommendedAction !== "NO_ACTION";

  const metricsSnapshot = {
    capturedAt: new Date(),
    confirmedYellowCount,
    confirmedRedCount,
    confirmedNoShowCount,
    confirmedEarlyLeaveCount,
    openDisciplineCasesCount: openDisciplineCases.length,
    pendingIncidentsCount,
    approvedSubjectAuthCount,
    suspendedSubjectAuthCount,
    pendingRefundReviewCount,
  };

  return {
    teacher,
    subjectAuthorizations,
    disciplineCases,
    violations,
    incidentReports,
    refundReviews,
    existingPackets,
    auditLogs,
    tea12State,
    metricsSnapshot,
    suggestedRecommendedAction,
    requiresContractReview,
  };
};

const presentPacket = (packet, { audience = "ADMIN", teacherMap = null } = {}) => {
  const plain = typeof packet.toObject === "function" ? packet.toObject() : { ...packet };
  const teacherDoc = teacherMap ? teacherMap.get(toId(plain.teacherId)) : null;

  const history = (plain.history || []).map((h) => {
    const entry = {
      id: toId(h._id),
      action: h.action,
      previousStatus: h.previousStatus ?? null,
      newStatus: h.newStatus,
      note: h.note || null,
      tea12DependencyStatus: h.tea12DependencyStatus,
      actorRole: h.actorRole,
      recordedAt: h.recordedAt,
    };
    if (audience === "ADMIN") {
      entry.actorId = toId(h.actorId);
    }
    return entry;
  });

  const out = {
    id: toId(plain._id),
    packetCode: plain.packetCode,
    teacherId: toId(plain.teacherId),
    triggerSource: plain.triggerSource,
    recommendedContractAction: plain.recommendedContractAction,
    severitySummary: plain.severitySummary || "",
    coordinationSummary: plain.coordinationSummary,
    status: plain.status,
    tea12DependencyStatus: plain.tea12DependencyStatus,
    tea12BlockerCode: plain.tea12BlockerCode || null,
    tea12BlockerNote: plain.tea12BlockerNote || null,
    contractSnapshot: plain.contractSnapshot || null,
    autoExecutionBlocked: Boolean(plain.autoExecutionBlocked),
    autoContractMutationApplied: Boolean(plain.autoContractMutationApplied),
    linkedDisciplineCaseIds: (plain.linkedDisciplineCaseIds || []).map(toId),
    linkedViolationIds: (plain.linkedViolationIds || []).map(toId),
    linkedIncidentReportIds: (plain.linkedIncidentReportIds || []).map(toId),
    linkedSubjectAuthIds: (plain.linkedSubjectAuthIds || []).map(toId),
    linkedRefundReviewIds: (plain.linkedRefundReviewIds || []).map(toId),
    metricsSnapshot: plain.metricsSnapshot,
    history,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    closedAt: plain.closedAt || null,
    resolutionNote: plain.resolutionNote || null,
  };

  if (teacherDoc) {
    out.teacher = {
      id: toId(teacherDoc._id),
      fullName: (teacherDoc.teacherProfile && teacherDoc.teacherProfile.fullName) || null,
      email: audience === "ADMIN" ? teacherDoc.email : undefined,
      verificationStatus:
        (teacherDoc.teacherProfile && teacherDoc.teacherProfile.verificationStatus) || null,
    };
  }

  if (audience === "ADMIN") {
    out.auditTrailSnapshot = (plain.auditTrailSnapshot || []).map((a) => ({
      auditLogId: toId(a.auditLogId),
      action: a.action,
      targetType: a.targetType,
      targetId: toId(a.targetId),
      createdAt: a.createdAt,
    }));
    out.createdBy = toId(plain.createdBy);
    out.updatedBy = toId(plain.updatedBy);
    out.reviewedBy = toId(plain.reviewedBy);
    out.reviewedAt = plain.reviewedAt || null;
  }

  return out;
};

const verifyOwnedIds = (requestedIds, availableDocs, fieldLabel) => {
  if (requestedIds === undefined) return null;
  if (!Array.isArray(requestedIds)) {
    throw validationError(`${fieldLabel} must be an array`);
  }
  const availableSet = new Set(availableDocs.map((d) => toId(d._id)));
  const cleaned = [];
  for (const rawId of requestedIds) {
    if (!mongoose.isValidObjectId(rawId) || !availableSet.has(String(rawId))) {
      throw new AppError(
        `${fieldLabel} contains ID "${rawId}" that does not belong to this teacher`,
        "LINKED_RECORD_MISMATCH",
        400
      );
    }
    if (!cleaned.some((id) => String(id) === String(rawId))) {
      cleaned.push(new mongoose.Types.ObjectId(rawId));
    }
  }
  return cleaned;
};

/**
 * Admin: lấy toàn bộ readiness & correlation packet context của 1 giáo viên.
 */
const adminGetTeacherContractReviewReadiness = async (teacherId, options = {}) => {
  const data = await gatherTeacherCorrelationData(teacherId, options);
  const teacherMap = new Map([[toId(data.teacher._id), data.teacher]]);

  return {
    teacher: {
      id: toId(data.teacher._id),
      email: data.teacher.email,
      status: data.teacher.status,
      fullName: (data.teacher.teacherProfile && data.teacher.teacherProfile.fullName) || null,
      verificationStatus:
        (data.teacher.teacherProfile && data.teacher.teacherProfile.verificationStatus) || null,
    },
    tea12Dependency: data.tea12State.tea12Dependency,
    tea12DependencyStatus: data.tea12State.tea12DependencyStatus,
    contractSnapshot: data.tea12State.contractSnapshot,
    autoExecutionBlocked: true,
    requiresContractReview: data.requiresContractReview,
    suggestedRecommendedAction: data.suggestedRecommendedAction,
    metrics: data.metricsSnapshot,
    subjectAuthorizations: data.subjectAuthorizations.map((a) => ({
      id: toId(a._id),
      subjectId: toId(a.subjectId),
      subjectName: a.subjectId && a.subjectId.name ? a.subjectId.name : null,
      categoryName: a.categoryId && a.categoryId.name ? a.categoryId.name : null,
      gradeLevel: a.gradeLevel || null,
      level: a.level,
      status: a.status,
      suspensionReason: a.suspensionReason || null,
      approvedAt: a.approvedAt || null,
      suspendedAt: a.suspendedAt || null,
    })),
    disciplineCases: data.disciplineCases.map((c) => ({
      id: toId(c._id),
      triggerRule: c.triggerRule,
      recommendedAction: c.recommendedAction,
      status: c.status,
      autoExecutionBlocked: Boolean(c.autoExecutionBlocked),
      triggerViolationIds: (c.triggerViolationIds || []).map(toId),
      createdAt: c.createdAt,
    })),
    violations: data.violations.map((v) => ({
      id: toId(v._id),
      sessionId: toId(v.sessionId),
      sessionTitle: v.sessionId && v.sessionId.title ? v.sessionId.title : null,
      violationCategory: v.violationCategory,
      violationType: v.violationType,
      severity: v.severity,
      reviewStatus: v.reviewStatus,
      countsTowardDiscipline: Boolean(v.countsTowardDiscipline),
      detectedAt: v.detectedAt,
    })),
    incidentReports: data.incidentReports.map((r) => ({
      id: toId(r._id),
      sessionId: toId(r.sessionId),
      sessionTitle: r.sessionId && r.sessionId.title ? r.sessionId.title : null,
      incidentType: r.incidentType,
      requestedAction: r.requestedAction,
      reviewStatus: r.reviewStatus,
      submittedWithinWindow: Boolean(r.submittedWithinWindow),
      appealsCount: Array.isArray(r.appeals) ? r.appeals.length : 0,
      createdAt: r.createdAt,
    })),
    refundReviews: data.refundReviews.map((r) => ({
      id: toId(r._id),
      sessionId: toId(r.sessionId),
      triggerReason: r.triggerReason,
      status: r.status,
      earningReconciliationStatus: r.earningReconciliationStatus,
    })),
    auditTrail: data.auditLogs.map((l) => ({
      id: toId(l._id),
      action: l.action,
      targetType: l.targetType,
      targetId: toId(l.targetId),
      actorAdminId: toId(l.actorAdminId),
      createdAt: l.createdAt,
    })),
    existingPackets: data.existingPackets.map((p) => presentPacket(p, { audience: "ADMIN", teacherMap })),
  };
};

/**
 * Admin: danh sách hàng đợi điều phối rà soát hợp đồng + danh sách giáo viên có hồ sơ kỷ luật chưa lập packet.
 */
const adminListContractReviewQueue = async (query = {}, paging, options = {}) => {
  const filter = {};
  if (query.teacherId) {
    assertId(query.teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
    filter.teacherId = query.teacherId;
  }
  if (query.status !== undefined && query.status !== null && query.status !== "") {
    if (typeof query.status !== "string") throw validationError("status must be a string");
    const status = query.status.trim().toUpperCase();
    if (!CONTRACT_REVIEW_PACKET_STATUSES.includes(status)) {
      throw validationError(`status must be one of ${CONTRACT_REVIEW_PACKET_STATUSES.join(", ")}`);
    }
    filter.status = status;
  }
  if (query.triggerSource !== undefined && query.triggerSource !== null && query.triggerSource !== "") {
    if (typeof query.triggerSource !== "string") throw validationError("triggerSource must be a string");
    const triggerSource = query.triggerSource.trim().toUpperCase();
    if (!CONTRACT_REVIEW_TRIGGER_SOURCES.includes(triggerSource)) {
      throw validationError(`triggerSource must be one of ${CONTRACT_REVIEW_TRIGGER_SOURCES.join(", ")}`);
    }
    filter.triggerSource = triggerSource;
  }
  if (query.recommendedContractAction !== undefined && query.recommendedContractAction !== null && query.recommendedContractAction !== "") {
    if (typeof query.recommendedContractAction !== "string") {
      throw validationError("recommendedContractAction must be a string");
    }
    const action = query.recommendedContractAction.trim().toUpperCase();
    if (!CONTRACT_REVIEW_RECOMMENDED_ACTIONS.includes(action)) {
      throw validationError(
        `recommendedContractAction must be one of ${CONTRACT_REVIEW_RECOMMENDED_ACTIONS.join(", ")}`
      );
    }
    filter.recommendedContractAction = action;
  }

  const [packets, total, openDisciplineCases, suspendedAuths] = await Promise.all([
    TeacherContractReviewPacket.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    TeacherContractReviewPacket.countDocuments(filter),
    TeacherDisciplineCase.find({ status: { $in: ["OPEN_ADMIN_REVIEW", "NEEDS_POLICY_CONFIGURATION"] } }).lean(),
    TeacherSubjectAuthorization.find({ status: "SUSPENDED" }).lean(),
  ]);

  const activePacketTeacherIds = new Set(
    (
      await TeacherContractReviewPacket.find({ status: { $ne: "CLOSED" } })
        .select("teacherId")
        .lean()
    ).map((p) => toId(p.teacherId))
  );

  const flaggedTeachersMap = new Map();
  for (const dc of openDisciplineCases) {
    const tid = toId(dc.teacherId);
    if (!flaggedTeachersMap.has(tid)) {
      flaggedTeachersMap.set(tid, {
        teacherId: tid,
        openDisciplineCasesCount: 0,
        suspendedAuthsCount: 0,
        hasActivePacket: activePacketTeacherIds.has(tid),
        hasTerminationRecommendation: false,
      });
    }
    const row = flaggedTeachersMap.get(tid);
    row.openDisciplineCasesCount += 1;
    if (dc.recommendedAction === "CONTRACT_TERMINATION_REVIEW") {
      row.hasTerminationRecommendation = true;
    }
  }
  for (const sa of suspendedAuths) {
    const tid = toId(sa.teacherId);
    if (!flaggedTeachersMap.has(tid)) {
      flaggedTeachersMap.set(tid, {
        teacherId: tid,
        openDisciplineCasesCount: 0,
        suspendedAuthsCount: 0,
        hasActivePacket: activePacketTeacherIds.has(tid),
        hasTerminationRecommendation: false,
      });
    }
    flaggedTeachersMap.get(tid).suspendedAuthsCount += 1;
  }

  const allTeacherIds = [
    ...new Set([...packets.map((p) => toId(p.teacherId)), ...flaggedTeachersMap.keys()]),
  ];
  const teachers = allTeacherIds.length
    ? await User.find({ _id: { $in: allTeacherIds } })
        .select("email teacherProfile.fullName teacherProfile.verificationStatus")
        .lean()
    : [];
  const teacherMap = new Map(teachers.map((t) => [toId(t._id), t]));

  const gateStatus = getDependencyStatus();
  const tea12Dependency =
    typeof options.contractVerifier === "function" || (gateStatus && gateStatus.tea12ContractReady)
      ? { dependency: "TEA-12", owner: "Bao", status: "VERIFIED" }
      : {
          dependency: "TEA-12",
          owner: "Bao",
          status: "BLOCKED",
          code: "CONTRACT_DEPENDENCY_BLOCKED",
        };

  return {
    tea12Dependency,
    packets: paged(
      packets.map((p) => presentPacket(p, { audience: "ADMIN", teacherMap })),
      total,
      paging
    ),
    flaggedTeachers: [...flaggedTeachersMap.values()].map((item) => {
      const t = teacherMap.get(item.teacherId);
      return {
        ...item,
        teacherName: (t && t.teacherProfile && t.teacherProfile.fullName) || null,
        teacherEmail: t ? t.email : null,
      };
    }),
  };
};

/**
 * Admin: tạo hồ sơ điều phối rà soát hợp đồng (TeacherContractReviewPacket) gắn bằng chứng TIN-05E & TEA-07.
 * Tuyệt đối không tự động thay đổi trạng thái hợp đồng TEA-12 hoặc trừ thù lao.
 */
const adminCreateContractReviewPacket = async (adminId, body = {}, options = {}) => {
  if (!body.teacherId) throw validationError("teacherId is required");
  const data = await gatherTeacherCorrelationData(body.teacherId, options);

  if (body.triggerSource !== undefined && body.triggerSource !== null && body.triggerSource !== "" && typeof body.triggerSource !== "string") {
    throw validationError("triggerSource must be a string");
  }
  const triggerSource = body.triggerSource
    ? body.triggerSource.trim().toUpperCase()
    : data.disciplineCases.some((c) => ["OPEN_ADMIN_REVIEW", "NEEDS_POLICY_CONFIGURATION"].includes(c.status))
      ? "DISCIPLINE_CASE"
      : "MANUAL_ADMIN_COORDINATION";
  if (!CONTRACT_REVIEW_TRIGGER_SOURCES.includes(triggerSource)) {
    throw validationError(`triggerSource must be one of ${CONTRACT_REVIEW_TRIGGER_SOURCES.join(", ")}`);
  }

  if (
    body.recommendedContractAction !== undefined &&
    body.recommendedContractAction !== null &&
    body.recommendedContractAction !== "" &&
    typeof body.recommendedContractAction !== "string"
  ) {
    throw validationError("recommendedContractAction must be a string");
  }
  const recommendedContractAction = body.recommendedContractAction
    ? body.recommendedContractAction.trim().toUpperCase()
    : data.suggestedRecommendedAction;
  if (!CONTRACT_REVIEW_RECOMMENDED_ACTIONS.includes(recommendedContractAction)) {
    throw validationError(
      `recommendedContractAction must be one of ${CONTRACT_REVIEW_RECOMMENDED_ACTIONS.join(", ")}`
    );
  }

  if (typeof body.coordinationSummary !== "string" || isBlank(body.coordinationSummary)) {
    throw validationError("coordinationSummary is required");
  }
  const coordinationSummary = body.coordinationSummary.trim();
  if (coordinationSummary.length > 4000) {
    throw validationError("coordinationSummary must not exceed 4000 characters");
  }
  const severitySummary = assertOptionalString(body.severitySummary, "severitySummary", { max: 2000 }) || "";

  const autoCorrelate = body.autoCorrelate !== false;

  const linkedDisciplineCaseIds =
    verifyOwnedIds(body.linkedDisciplineCaseIds, data.disciplineCases, "linkedDisciplineCaseIds") ??
    (autoCorrelate ? data.disciplineCases.map((d) => d._id) : []);
  const linkedViolationIds =
    verifyOwnedIds(body.linkedViolationIds, data.violations, "linkedViolationIds") ??
    (autoCorrelate ? data.violations.map((v) => v._id) : []);
  const linkedIncidentReportIds =
    verifyOwnedIds(body.linkedIncidentReportIds, data.incidentReports, "linkedIncidentReportIds") ??
    (autoCorrelate ? data.incidentReports.map((i) => i._id) : []);
  const linkedSubjectAuthIds =
    verifyOwnedIds(body.linkedSubjectAuthIds, data.subjectAuthorizations, "linkedSubjectAuthIds") ??
    (autoCorrelate ? data.subjectAuthorizations.map((a) => a._id) : []);
  const linkedRefundReviewIds =
    verifyOwnedIds(body.linkedRefundReviewIds, data.refundReviews, "linkedRefundReviewIds") ??
    (autoCorrelate ? data.refundReviews.map((r) => r._id) : []);

  if (
    linkedDisciplineCaseIds.length === 0 &&
    linkedViolationIds.length === 0 &&
    linkedIncidentReportIds.length === 0 &&
    linkedSubjectAuthIds.length === 0 &&
    body.allowUnlinkedPacket !== true
  ) {
    throw validationError(
      "At least one linked TIN-05E or TEA-07 record is required to open a contract review coordination packet"
    );
  }

  if (body.status !== undefined && body.status !== null && body.status !== "" && typeof body.status !== "string") {
    throw validationError("status must be a string");
  }
  const initialStatus = body.status ? body.status.trim().toUpperCase() : "DRAFT";
  if (!["DRAFT", "READY_FOR_CONTRACT_TEAM", "ACKNOWLEDGED_PENDING_TEA12"].includes(initialStatus)) {
    throw validationError(
      "Initial status must be DRAFT, READY_FOR_CONTRACT_TEAM, or ACKNOWLEDGED_PENDING_TEA12"
    );
  }

  const activeExisting = data.existingPackets.find((p) => p.status !== "CLOSED");
  if (activeExisting) {
    const err = new AppError(
      "An active contract review packet already exists for this teacher",
      "ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS",
      409
    );
    err.details = {
      existingPacketId: toId(activeExisting._id),
      packetCode: activeExisting.packetCode,
      status: activeExisting.status,
    };
    throw err;
  }

  const auditTrailSnapshot = data.auditLogs.slice(0, 50).map((log) => ({
    auditLogId: log._id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    createdAt: log.createdAt,
  }));

  const session = await mongoose.startSession();
  let packet;
  try {
    await session.withTransaction(async () => {
      const concurrentActive = await TeacherContractReviewPacket.findOne({
        teacherId: data.teacher._id,
        status: { $ne: "CLOSED" },
      })
        .select("_id packetCode status")
        .session(session)
        .lean();
      if (concurrentActive) {
        const err = new AppError(
          "An active contract review packet already exists for this teacher",
          "ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS",
          409
        );
        err.details = {
          existingPacketId: toId(concurrentActive._id),
          packetCode: concurrentActive.packetCode,
          status: concurrentActive.status,
        };
        throw err;
      }

      const now = new Date();
      const [created] = await TeacherContractReviewPacket.create(
        [
          {
            packetCode: generatePacketCode(),
            teacherId: data.teacher._id,
            triggerSource,
            recommendedContractAction,
            severitySummary,
            coordinationSummary,
            status: initialStatus,
            tea12DependencyStatus: data.tea12State.tea12DependencyStatus,
            tea12BlockerCode: data.tea12State.tea12Dependency.code || null,
            tea12BlockerNote: data.tea12State.tea12Dependency.note,
            contractSnapshot: data.tea12State.contractSnapshot,
            autoExecutionBlocked: true,
            autoContractMutationApplied: false,
            linkedDisciplineCaseIds,
            linkedViolationIds,
            linkedIncidentReportIds,
            linkedSubjectAuthIds,
            linkedRefundReviewIds,
            metricsSnapshot: data.metricsSnapshot,
            auditTrailSnapshot,
            history: [
              {
                action: "CREATED",
                previousStatus: null,
                newStatus: initialStatus,
                note: coordinationSummary,
                tea12DependencyStatus: data.tea12State.tea12DependencyStatus,
                actorId: adminId,
                actorRole: "ADMIN",
                recordedAt: now,
              },
            ],
            createdBy: adminId,
          },
        ],
        { session }
      );
      packet = created;

      await audit(
        {
          actorAdminId: adminId,
          action: "CONTRACT_REVIEW_PACKET_CREATED",
          targetType: "TeacherContractReviewPacket",
          targetId: packet._id,
          beforeState: null,
          afterState: {
            packetCode: packet.packetCode,
            teacherId: toId(packet.teacherId),
            status: packet.status,
            recommendedContractAction: packet.recommendedContractAction,
            tea12DependencyStatus: packet.tea12DependencyStatus,
            autoExecutionBlocked: true,
          },
        },
        session
      );
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(
        "An active contract review packet already exists for this teacher",
        "ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS",
        409
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  const teacherMap = new Map([[toId(data.teacher._id), data.teacher]]);
  return presentPacket(packet.toObject(), { audience: "ADMIN", teacherMap });
};

const adminGetContractReviewPacket = async (packetId) => {
  assertId(packetId, "Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND");
  const packet = await TeacherContractReviewPacket.findById(packetId).lean();
  if (!packet) {
    throw new AppError("Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND", 404);
  }
  const teacher = await User.findById(packet.teacherId)
    .select("email teacherProfile.fullName teacherProfile.verificationStatus")
    .lean();
  const teacherMap = teacher ? new Map([[toId(teacher._id), teacher]]) : new Map();
  return presentPacket(packet, { audience: "ADMIN", teacherMap });
};

const adminUpdateContractReviewPacketStatus = async (adminId, packetId, body = {}, options = {}) => {
  assertId(packetId, "Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND");
  const packet = await TeacherContractReviewPacket.findById(packetId);
  if (!packet) {
    throw new AppError("Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND", 404);
  }

  if (typeof body.status !== "string" || isBlank(body.status)) {
    throw validationError(`status must be one of ${CONTRACT_REVIEW_PACKET_STATUSES.join(", ")}`);
  }
  const nextStatus = body.status.trim().toUpperCase();
  if (!CONTRACT_REVIEW_PACKET_STATUSES.includes(nextStatus)) {
    throw validationError(`status must be one of ${CONTRACT_REVIEW_PACKET_STATUSES.join(", ")}`);
  }

  const allowedNext = TRANSITIONS[packet.status] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw new AppError(
      `Contract review packet cannot transition from ${packet.status} to ${nextStatus}`,
      "INVALID_PACKET_STATUS_TRANSITION",
      409
    );
  }

  const parsedResolutionNote = assertOptionalString(body.resolutionNote, "resolutionNote", { max: 2000 });
  const parsedNote = assertOptionalString(body.note, "note", { max: 2000 });
  const noteText = parsedResolutionNote || parsedNote || null;
  if (nextStatus === "CLOSED" && !noteText) {
    throw validationError("resolutionNote is required when closing a contract review packet");
  }

  const teacher = await User.findById(packet.teacherId).lean();
  const tea12State = await resolveTea12Dependency(teacher || { _id: packet.teacherId }, options);

  const prevStatus = packet.status;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const setUpdate = {
        status: nextStatus,
        tea12DependencyStatus: tea12State.tea12DependencyStatus,
        tea12BlockerCode: tea12State.tea12Dependency.code || null,
        tea12BlockerNote: tea12State.tea12Dependency.note,
        contractSnapshot: tea12State.contractSnapshot,
        autoExecutionBlocked: true,
        autoContractMutationApplied: false,
        updatedBy: adminId,
        reviewedBy: adminId,
        reviewedAt: now,
      };
      if (nextStatus === "CLOSED") {
        setUpdate.closedAt = now;
        setUpdate.resolutionNote = noteText;
      }

      updated = await TeacherContractReviewPacket.findOneAndUpdate(
        { _id: packet._id, status: prevStatus },
        {
          $set: setUpdate,
          $push: {
            history: {
              action: "STATUS_UPDATED",
              previousStatus: prevStatus,
              newStatus: nextStatus,
              note: noteText,
              tea12DependencyStatus: tea12State.tea12DependencyStatus,
              actorId: adminId,
              actorRole: "ADMIN",
              recordedAt: now,
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError(
          "Contract review packet status changed concurrently",
          "INVALID_PACKET_STATUS_TRANSITION",
          409
        );
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "CONTRACT_REVIEW_PACKET_STATUS_UPDATED",
          targetType: "TeacherContractReviewPacket",
          targetId: packet._id,
          beforeState: { status: prevStatus },
          afterState: {
            status: nextStatus,
            tea12DependencyStatus: tea12State.tea12DependencyStatus,
            note: noteText,
            autoContractMutationApplied: false,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  const teacherMap = teacher ? new Map([[toId(teacher._id), teacher]]) : new Map();
  return presentPacket(updated, { audience: "ADMIN", teacherMap });
};

/**
 * Guard fail-closed khi cố thực thi thay đổi trạng thái hợp đồng trực tiếp từ TEA-16.
 * Luôn ghi nhận AuditLog + history trong transaction TRƯỚC KHI fail-closed, KHÔNG bao giờ tự chấm dứt hoặc sửa hợp đồng.
 */
const adminAttemptContractExecutionHandoff = async (adminId, packetId, body = {}, options = {}) => {
  assertId(packetId, "Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND");
  const packet = await TeacherContractReviewPacket.findById(packetId);
  if (!packet) {
    throw new AppError("Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND", 404);
  }

  const parsedNote = assertOptionalString(body.note, "note", { max: 2000 });
  const note = parsedNote || "Attempted contract lifecycle execution via TEA-16";

  const teacher = await User.findById(packet.teacherId).lean();
  const tea12State = await resolveTea12Dependency(teacher || { _id: packet.teacherId }, options);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const freshPacket = await TeacherContractReviewPacket.findOneAndUpdate(
        { _id: packet._id },
        {
          $set: {
            tea12DependencyStatus: tea12State.tea12DependencyStatus,
            tea12BlockerCode: tea12State.tea12Dependency.code || null,
            tea12BlockerNote: tea12State.tea12Dependency.note,
            autoExecutionBlocked: true,
            autoContractMutationApplied: false,
            updatedBy: adminId,
          },
          $push: {
            history: {
              action: "EXECUTION_BLOCKED",
              previousStatus: packet.status,
              newStatus: packet.status,
              note,
              tea12DependencyStatus: tea12State.tea12DependencyStatus,
              actorId: adminId,
              actorRole: "ADMIN",
              recordedAt: now,
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!freshPacket) {
        throw new AppError("Contract review packet not found", "CONTRACT_REVIEW_PACKET_NOT_FOUND", 404);
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "CONTRACT_REVIEW_EXECUTION_BLOCKED",
          targetType: "TeacherContractReviewPacket",
          targetId: packet._id,
          beforeState: { status: freshPacket.status },
          afterState: {
            tea12DependencyStatus: tea12State.tea12DependencyStatus,
            autoContractMutationApplied: false,
            note,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  if (tea12State.tea12DependencyStatus === "BLOCKED") {
    const err = new AppError(
      "Contract lifecycle execution is blocked because TEA-12 (TeacherContract by Bao) is not available in this codebase",
      "CONTRACT_DEPENDENCY_BLOCKED",
      503
    );
    err.details = {
      dependency: "TEA-12",
      owner: "Bao",
      status: "BLOCKED",
      packetId: toId(packet._id),
      packetCode: packet.packetCode,
    };
    throw err;
  }

  const err = new AppError(
    "TEA-16 coordination packets cannot automatically terminate or modify contracts; handoff must be finalized inside TEA-12",
    "CONTRACT_MUTATION_OUT_OF_AUTHORITY",
    409
  );
  err.details = {
    packetId: toId(packet._id),
    packetCode: packet.packetCode,
    autoExecutionBlocked: true,
    recommendedContractAction: packet.recommendedContractAction,
  };
  throw err;
};

/**
 * Teacher self-view of correlated TIN-05E + TEA-07 readiness (strictly strips all admin IDs & internal notes).
 */
const getTeacherContractReviewReadiness = async (teacherId, options = {}) => {
  const data = await gatherTeacherCorrelationData(teacherId, options);
  const teacherMap = new Map([[toId(data.teacher._id), data.teacher]]);

  return {
    tea12Dependency: {
      dependency: data.tea12State.tea12Dependency.dependency,
      status: data.tea12State.tea12Dependency.status,
      code: data.tea12State.tea12Dependency.code || null,
    },
    autoExecutionBlocked: true,
    requiresContractReview: data.requiresContractReview,
    metrics: data.metricsSnapshot,
    subjectAuthorizations: data.subjectAuthorizations.map((a) => ({
      id: toId(a._id),
      subjectId: toId(a.subjectId),
      subjectName: a.subjectId && a.subjectId.name ? a.subjectId.name : null,
      gradeLevel: a.gradeLevel || null,
      level: a.level,
      status: a.status,
      suspensionReason: a.suspensionReason || null,
    })),
    openDisciplineCases: data.disciplineCases.map((c) => ({
      id: toId(c._id),
      triggerRule: c.triggerRule,
      recommendedAction: c.recommendedAction,
      status: c.status,
      autoExecutionBlocked: Boolean(c.autoExecutionBlocked),
      createdAt: c.createdAt,
    })),
    reviewPackets: data.existingPackets.map((p) => presentPacket(p, { audience: "TEACHER", teacherMap })),
  };
};

module.exports = {
  adminGetTeacherContractReviewReadiness,
  adminListContractReviewQueue,
  adminCreateContractReviewPacket,
  adminGetContractReviewPacket,
  adminUpdateContractReviewPacketStatus,
  adminAttemptContractExecutionHandoff,
  getTeacherContractReviewReadiness,
};

