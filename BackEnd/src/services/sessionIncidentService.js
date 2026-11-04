const mongoose = require("mongoose");
const {
  Session,
  Class,
  Enrollment,
  Payment,
  SessionAttendance,
  TeacherViolation,
  TeacherDisciplineCase,
  TeacherIncidentReport,
  SessionRescheduleRequest,
  SessionRefundReview,
  AuditLog,
} = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { validationError, parseDate, isBlank, paged } = require("../utils/http");
const storageService = require("./storageService");
const { notifyOnce, notifyAdminsOnce } = require("./notificationService");
const { issueSessionRefund } = require("./settlementService");

const SEVERITY_RANK = {
  YELLOW: 1,
  RED: 2,
  EARLY_LEAVE: 3,
  NO_SHOW: 4,
};

const getIncidentWindowAfterEndMs = () =>
  (Number(process.env.INCIDENT_REPORT_DEADLINE_HOURS) || 24) * 60 * 60 * 1000;
const INCIDENT_WINDOW_AFTER_END_MS = getIncidentWindowAfterEndMs(); // Proposed 24h window (configurable)

const logAudit = async ({
  actorId,
  action,
  targetType,
  targetId,
  reason = null,
  metadata = {},
}) => {
  try {
    if (!actorId || !mongoose.isValidObjectId(actorId)) return;
    await AuditLog.create({
      actorId,
      action,
      targetType,
      actorAdminId: actorId,
      action,
      targetType,
      targetId,
      beforeState: metadata.beforeState || null,
      afterState: { reason, ...metadata },
      reason,
      metadata,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
};

const getEnrolledStudentIds = async (classId) => {
  const enrollments = await Enrollment.find({
    classId,
    enrollmentStatus: "CONFIRMED",
  })
    .select("_id studentId paidAmount scholarshipApplied")
    .lean();
  return enrollments;
};

/**
 * Creates safe SessionRefundReview records for all confirmed enrollments of a session
 * (or a single enrollment when a student declines a makeup session).
 * Never modifies Payment, Transaction, or TeacherEarning directly.
 */
const createSafeRefundReviewsForSession = async (
  session,
  triggerReason,
  specificEnrollmentId = null,
) => {
  const enrollments = specificEnrollmentId
    ? await Enrollment.find({
        _id: specificEnrollmentId,
        enrollmentStatus: "CONFIRMED",
      }).lean()
    : await getEnrolledStudentIds(session.classId);

  if (!enrollments.length) return [];

  const cls = await Class.findById(session.classId).select("courseId").lean();
  const enrollmentIds = enrollments.map((e) => e._id);
  const payments = await Payment.find({
    enrollmentId: { $in: enrollmentIds },
    paymentStatus: "COMPLETED", // Payment has no SUCCESS status: COMPLETED is a successful payment
  })
    .select("_id enrollmentId amount")
    .lean();
  const paymentByEnrollment = new Map(
    payments.map((p) => [p.enrollmentId.toString(), p]),
  );

  const createdOrUpdated = [];
  for (const enrollment of enrollments) {
    const payment = paymentByEnrollment.get(enrollment._id.toString());
    const paidAmount =
      Number((enrollment.amountPaidViaPayment || 0).toString()) +
      Number((enrollment.amountPaidViaScholarship || 0).toString());

    const doc = await SessionRefundReview.findOneAndUpdate(
      { sessionId: session._id, enrollmentId: enrollment._id },
      {
        $setOnInsert: {
          sessionId: session._id,
          classId: session.classId,
          courseId: cls?.courseId || null,
          studentId: enrollment.studentId,
          teacherId: session.teacherId,
          enrollmentId: enrollment._id,
          paymentId: payment?._id || null,
          paidAmountSnapshot: paidAmount,
          scholarshipAppliedSnapshot: Number((enrollment.amountPaidViaScholarship || 0).toString()) > 0,
          // A review already decided by an Admin is never reopened by a repeated trigger (no double refund)
          status: "NEEDS_FINANCIAL_REVIEW",
          earningReconciliationStatus: "HOLD_RECOMMENDED",
        },
        $set: {
          triggerReason,
        },
      },
      { upsert: true, returnDocument: "after" },
    ).lean();
    createdOrUpdated.push(doc);
  }

  await notifyAdminsOnce(
    "Yêu cầu rà soát hoàn tiền / thù lao buổi học",
    `Buổi học "${session.title}" (${session.className}) phát sinh lý do ${triggerReason}. Cần Admin & Payment Team rà soát hoàn phí/thù lao.`,
    "SESSION_REFUND_REVIEW_CREATED",
    `session:${session._id}:refund_review:${triggerReason}`,
    session._id,
  );

  return createdOrUpdated;
};

/**
 * Evaluates confirmed TeacherViolations for a teacher and opens/updates
 * safe TeacherDisciplineCase records for Admin review without auto-executing
 * financial deductions or contract termination.
 */
const evaluateTeacherDiscipline = async (teacherId, actorId = null) => {
  const confirmedViolations = await TeacherViolation.find({
    teacherId,
    reviewStatus: "CONFIRMED",
    countsTowardDiscipline: true,
  })
    .sort({ detectedAt: 1 })
    .lean();

  const yellowViolations = confirmedViolations.filter(
    (v) => v.severity === "YELLOW",
  );
  const redViolations = confirmedViolations.filter((v) => v.severity === "RED");
  const noShowViolations = confirmedViolations.filter(
    (v) => v.severity === "NO_SHOW",
  );
  const earlyLeaveViolations = confirmedViolations.filter(
    (v) => v.severity === "EARLY_LEAVE",
  );

  const cases = [];

  const upsertDisciplineCase = async (
    triggerRule,
    recommendedAction,
    violationDocs,
    titleForNotice,
  ) => {
    const triggerViolationIds = violationDocs.map((v) => v._id);
    const existing = await TeacherDisciplineCase.findOne({
      teacherId,
      triggerRule,
      status: { $in: ["OPEN_ADMIN_REVIEW", "NEEDS_POLICY_CONFIGURATION"] },
    });

    let disciplineCase;
    if (existing) {
      existing.triggerViolationIds = triggerViolationIds;
      await existing.save();
      disciplineCase = existing.toObject();
    } else {
      const created = await TeacherDisciplineCase.create({
        teacherId,
        triggerRule,
        recommendedAction,
        triggerViolationIds,
        status: "OPEN_ADMIN_REVIEW",
        autoExecutionBlocked: true,
      });
      disciplineCase = created.toObject();
    }

    await notifyOnce(
      teacherId,
      "Thông báo hồ sơ rà soát kỷ luật giảng dạy",
      `${titleForNotice}. Hồ sơ đã được chuyển tới Admin để xem xét theo quy chế.`,
      "TEACHER_DISCIPLINE_CASE",
      `teacher:${teacherId}:discipline:${triggerRule}:${triggerViolationIds.length}`,
    );

    await notifyAdminsOnce(
      "Hồ sơ kỷ luật giáo viên cần phê duyệt",
      `Giáo viên (${teacherId}) đạt ngưỡng ${triggerRule} (${triggerViolationIds.length} vi phạm đã xác nhận). Cần Admin xem xét.`,
      "ADMIN_DISCIPLINE_CASE_OPENED",
      `admin:discipline:${teacherId}:${triggerRule}:${triggerViolationIds.length}`,
    );

    if (actorId) {
      await logAudit({
        actorId,
        action: "TEACHER_DISCIPLINE_CASE_EVALUATED",
        targetType: "TeacherDisciplineCase",
        targetId: disciplineCase._id,
        metadata: {
          teacherId: String(teacherId),
          triggerRule,
          count: triggerViolationIds.length,
        },
      });
    }

    cases.push(disciplineCase);
  };

  if (yellowViolations.length >= 3) {
    await upsertDisciplineCase(
      "THREE_YELLOW_WARNINGS",
      "REPUTATION_AND_REMUNERATION_REVIEW",
      yellowViolations,
      `Bạn đã tích lũy ${yellowViolations.length} nhắc nhở mức Vàng (YELLOW) được xác nhận`,
    );
  }

  if (redViolations.length >= 1) {
    await upsertDisciplineCase(
      "ONE_RED_VIOLATION",
      "REPUTATION_AND_REMUNERATION_REVIEW",
      redViolations,
      `Bạn có ${redViolations.length} vi phạm mức Đỏ (RED) được xác nhận`,
    );
  }

  if (noShowViolations.length >= 3) {
    await upsertDisciplineCase(
      "THREE_NO_SHOW_VIOLATIONS",
      "CONTRACT_TERMINATION_REVIEW",
      noShowViolations,
      `Bạn đã có ${noShowViolations.length} buổi vắng dạy không phép (NO_SHOW) được xác nhận — đề xuất rà soát chấm dứt hợp đồng`,
    );
  }

  if (earlyLeaveViolations.length >= 1) {
    await upsertDisciplineCase(
      "EARLY_LEAVE_REVIEW",
      "ADMIN_DISCIPLINE_REVIEW",
      earlyLeaveViolations,
      `Bạn có ${earlyLeaveViolations.length} vi phạm rời lớp sớm quá 30 phút (TEACHER_LEFT_EARLY) được xác nhận`,
    );
  }

  return cases;
};

/**
 * Records or escalates a single canonical TeacherViolation per (sessionId, teacherId, violationCategory).
 * Avoids duplicate violations when a session escalates 10m YELLOW -> 20m RED -> 30m NO_SHOW.
 */
const recordOrEscalateTeacherViolation = async ({
  session,
  violationCategory,
  violationType,
  severity,
  detectedAt = new Date(),
  absenceDurationSeconds = 0,
  note = null,
}) => {
  const existing = await TeacherViolation.findOne({
    sessionId: session._id,
    teacherId: session.teacherId,
    violationCategory,
  });

  const incidentReport = await TeacherIncidentReport.findOne({
    sessionId: session._id,
    teacherId: session.teacherId,
  }).lean();

  let reviewStatus = "PENDING_INCIDENT_WINDOW";
  let countsTowardDiscipline = false;
  if (incidentReport) {
    if (incidentReport.reviewStatus === "APPROVED") {
      reviewStatus = "WAIVED";
      countsTowardDiscipline = false;
    } else if (incidentReport.reviewStatus === "PENDING") {
      reviewStatus = "UNDER_INCIDENT_REVIEW";
    } else if (incidentReport.reviewStatus === "REJECTED") {
      reviewStatus = "CONFIRMED";
      countsTowardDiscipline = true;
    }
  }

  const escalationEvent = {
    severity,
    violationType,
    detectedAt,
    note,
  };

  if (!existing) {
    try {
      const created = await TeacherViolation.create({
        sessionId: session._id,
        classId: session.classId,
        teacherId: session.teacherId,
        violationCategory,
        violationType,
        severity,
        detectedAt,
        scheduledStartAt: session.startDatetime,
        teacherJoinedAt: session.teacherPresence?.firstTeachingJoinAt || null,
        absenceDurationSeconds,
        escalationHistory: [escalationEvent],
        reviewStatus,
        linkedIncidentReportId: incidentReport?._id || null,
        countsTowardDiscipline,
      });
      if (countsTowardDiscipline) {
        await evaluateTeacherDiscipline(session.teacherId);
      }
      return created.toObject();
    } catch (err) {
      if (err && err.code !== 11000) throw err;
    }
  }

  const doc =
    existing ||
    (await TeacherViolation.findOne({
      sessionId: session._id,
      teacherId: session.teacherId,
      violationCategory,
    }));
  if (!doc) return null;

  const alreadyLogged = (doc.escalationHistory || []).some(
    (e) => e.violationType === violationType && e.severity === severity,
  );

  if (SEVERITY_RANK[severity] >= SEVERITY_RANK[doc.severity]) {
    doc.severity = severity;
    doc.violationType = violationType;
    doc.detectedAt = detectedAt;
  }
  if (absenceDurationSeconds > (doc.absenceDurationSeconds || 0)) {
    doc.absenceDurationSeconds = absenceDurationSeconds;
  }
  if (session.teacherPresence?.firstTeachingJoinAt && !doc.teacherJoinedAt) {
    doc.teacherJoinedAt = session.teacherPresence.firstTeachingJoinAt;
  }
  if (!alreadyLogged) {
    doc.escalationHistory.push(escalationEvent);
  }
  if (incidentReport && !doc.linkedIncidentReportId) {
    doc.linkedIncidentReportId = incidentReport._id;
  }

  await doc.save();
  return doc.toObject();
};

/**
 * Confirms any PENDING_INCIDENT_WINDOW violations whose 24-hour incident submission window
 * has expired without an approved or pending incident report.
 */
const finalizeExpiredPendingViolations = async (now = new Date()) => {
  const pendingViolations = await TeacherViolation.find({
    reviewStatus: "PENDING_INCIDENT_WINDOW",
  }).lean();

  const confirmedIds = [];
  for (const v of pendingViolations) {
    const session = await Session.findById(v.sessionId)
      .select("endDatetime")
      .lean();
    if (!session) continue;
    const windowDeadline = new Date(
      session.endDatetime.getTime() + getIncidentWindowAfterEndMs(),
    );
    if (now < windowDeadline) continue;

    const report = await TeacherIncidentReport.findOne({
      sessionId: v.sessionId,
      teacherId: v.teacherId,
    }).lean();

    if (report && report.reviewStatus === "PENDING") {
      await TeacherViolation.updateOne(
        { _id: v._id },
        {
          $set: {
            reviewStatus: "UNDER_INCIDENT_REVIEW",
            linkedIncidentReportId: report._id,
          },
        },
      );
      continue;
    }
    if (report && report.reviewStatus === "APPROVED") {
      await TeacherViolation.updateOne(
        { _id: v._id },
        {
          $set: {
            reviewStatus: "WAIVED",
            countsTowardDiscipline: false,
            linkedIncidentReportId: report._id,
          },
        },
      );
      continue;
    }

    await TeacherViolation.updateOne(
      { _id: v._id, reviewStatus: "PENDING_INCIDENT_WINDOW" },
      { $set: { reviewStatus: "CONFIRMED", countsTowardDiscipline: true } },
    );
    confirmedIds.push(v._id);
    await evaluateTeacherDiscipline(v.teacherId);
  }

  return confirmedIds;
};

/**
 * Validates whether a proposed makeup schedule conflicts with existing teacher or class sessions.
 */
const assertNoScheduleConflict = async ({
  teacherId,
  classId,
  startDatetime,
  endDatetime,
  excludeSessionId = null,
}) => {
  if (
    !(startDatetime instanceof Date) ||
    !(endDatetime instanceof Date) ||
    startDatetime >= endDatetime
  ) {
    throw validationError(
      "proposedStartDatetime must be before proposedEndDatetime",
    );
  }

  const baseFilter = {
    status: { $nin: ["CANCELLED"] },
    lifecycleState: { $nin: ["CANCELLED", "RESCHEDULED"] },
    startDatetime: { $lt: endDatetime },
    endDatetime: { $gt: startDatetime },
  };
  if (excludeSessionId) {
    baseFilter._id = { $ne: excludeSessionId };
  }

  const [teacherConflict, classConflict] = await Promise.all([
    Session.findOne({ ...baseFilter, teacherId })
      .select("_id title startDatetime endDatetime")
      .lean(),
    Session.findOne({ ...baseFilter, classId })
      .select("_id title startDatetime endDatetime")
      .lean(),
  ]);

  if (teacherConflict) {
    throw new AppError(
      `Proposed schedule conflicts with teacher session "${teacherConflict.title}"`,
      "TEACHER_SCHEDULE_CONFLICT",
      409,
    );
  }
  if (classConflict) {
    throw new AppError(
      `Proposed schedule conflicts with class session "${classConflict.title}"`,
      "CLASS_SCHEDULE_CONFLICT",
      409,
    );
  }
};

/**
 * Teacher submits an Incident Report (Phase 9) before, during, or within 24 hours after a session.
 */
const submitIncidentReport = async (teacherId, sessionId, body) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  }
  const session = await Session.findById(sessionId);
  if (!session)
    throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  if (session.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only report incidents for your own sessions");
  }

  const validTypes = [
    "DEVICE_FAILURE",
    "INTERNET_FAILURE",
    "POWER_OUTAGE",
    "HEALTH_ISSUE",
    "PERSONAL_EMERGENCY",
    "PLATFORM_FAILURE",
    "OTHER",
  ];
  const validActions = [
    "EXCUSE_LATE",
    "CANCEL_SESSION",
    "RESCHEDULE_SESSION",
    "EXCUSE_INTERRUPTION",
  ];

  if (!body || !validTypes.includes(body.incidentType)) {
    throw validationError(
      `incidentType must be one of ${validTypes.join(", ")}`,
    );
  }
  if (isBlank(body.description)) {
    throw validationError("description is required");
  }
  if (!validActions.includes(body.requestedAction)) {
    throw validationError(
      `requestedAction must be one of ${validActions.join(", ")}`,
    );
  }

  const rawEvidence = Array.isArray(body.evidenceFiles)
    ? body.evidenceFiles
    : [];
  const storageKeys = rawEvidence.map((item) =>
    typeof item === "string" ? item : item?.storageKey,
  );
  if (storageKeys.some((k) => !k)) {
    throw validationError("Each evidence file must include a valid storageKey");
  }
  if (storageKeys.length > 0) {
    await storageService.assertOwnedKeys(teacherId, storageKeys);
  }

  const evidenceFiles = rawEvidence.map((item) =>
    typeof item === "string"
      ? { storageKey: item, uploadedAt: new Date() }
      : {
          storageKey: item.storageKey,
          originalName: item.originalName || null,
          mimeType: item.mimeType || null,
          uploadedAt: new Date(),
        },
  );

  const now = new Date();
  let submissionTiming = "DURING_SESSION";
  let submittedWithinWindow = true;
  if (now < session.startDatetime) {
    submissionTiming = "BEFORE_SESSION";
  } else if (now <= session.endDatetime) {
    submissionTiming = "DURING_SESSION";
  } else if (
    now.getTime() <=
    session.endDatetime.getTime() + getIncidentWindowAfterEndMs()
  ) {
    submissionTiming = "WITHIN_24H_AFTER";
  } else {
    submissionTiming = "LATE_SUBMISSION";
    submittedWithinWindow = false;
  }

  if (!submittedWithinWindow && process.env.STRICT_INCIDENT_DEADLINE === "true") {
    throw new AppError(
      "Incident reports must be submitted before, during, or within 24 hours after the session ends",
      "INCIDENT_REPORT_WINDOW_EXPIRED",
      409,
    );
  }

  let proposedSchedule = {
    startDatetime: null,
    endDatetime: null,
    title: null,
  };
  if (
    body.proposedSchedule &&
    body.proposedSchedule.startDatetime &&
    body.proposedSchedule.endDatetime
  ) {
    const startDt = parseDate(
      body.proposedSchedule.startDatetime,
      "proposedSchedule.startDatetime",
    );
    const endDt = parseDate(
      body.proposedSchedule.endDatetime,
      "proposedSchedule.endDatetime",
    );
    await assertNoScheduleConflict({
      teacherId,
      classId: session.classId,
      startDatetime: startDt,
      endDatetime: endDt,
      excludeSessionId: session._id,
    });
    proposedSchedule = {
      startDatetime: startDt,
      endDatetime: endDt,
      title: body.proposedSchedule.title || `${session.title} (Buổi học bù)`,
    };
  } else if (body.requestedAction === "RESCHEDULE_SESSION") {
    throw validationError(
      "proposedSchedule.startDatetime and proposedSchedule.endDatetime are required when requestedAction is RESCHEDULE_SESSION",
    );
  }

  const existingViolation = await TeacherViolation.findOne({
    sessionId: session._id,
    teacherId,
  });

  const report = await TeacherIncidentReport.create({
    sessionId: session._id,
    classId: session.classId,
    teacherId,
    incidentType: body.incidentType,
    description: body.description.trim(),
    evidenceFiles,
    requestedAction: body.requestedAction,
    proposedSchedule,
    submittedWithinWindow,
    submissionTiming,
    reviewStatus: "PENDING",
    linkedViolationId: existingViolation?._id || null,
    decisionHistory: [
      {
        actorId: teacherId,
        action: "SUBMITTED",
        previousStatus: null,
        newStatus: "PENDING",
        reason: body.description.trim(),
      },
    ],
  });

  if (
    existingViolation &&
    existingViolation.reviewStatus === "PENDING_INCIDENT_WINDOW"
  ) {
    existingViolation.reviewStatus = "UNDER_INCIDENT_REVIEW";
    existingViolation.linkedIncidentReportId = report._id;
    await existingViolation.save();
  }

  if (
    body.requestedAction === "RESCHEDULE_SESSION" &&
    proposedSchedule.startDatetime
  ) {
    const existingReschedule = await SessionRescheduleRequest.findOne({
      originalSessionId: session._id,
      status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] },
    });
    if (!existingReschedule) {
      const rescheduleReq = await SessionRescheduleRequest.create({
        originalSessionId: session._id,
        classId: session.classId,
        teacherId,
        requestedBy: teacherId,
        incidentReportId: report._id,
        proposedStartDatetime: proposedSchedule.startDatetime,
        proposedEndDatetime: proposedSchedule.endDatetime,
        proposedTitle: proposedSchedule.title,
        reason: body.description.trim(),
        status: "PENDING_ADMIN_APPROVAL",
      });
      report.linkedRescheduleRequestId = rescheduleReq._id;
      await report.save();
    }
  }

  await notifyAdminsOnce(
    "Báo cáo sự cố giáo viên mới cần duyệt",
    `Giáo viên đã gửi báo cáo sự cố (${body.incidentType}) cho buổi học "${session.title}".`,
    "TEACHER_INCIDENT_REPORT_SUBMITTED",
    `incident:submitted:${report._id}`,
    session._id,
  );

  await logAudit({
    actorId: teacherId,
    action: "TEACHER_INCIDENT_REPORT_SUBMITTED",
    targetType: "TeacherIncidentReport",
    targetId: report._id,
    reason: body.description.trim(),
    metadata: {
      sessionId: session._id.toString(),
      incidentType: body.incidentType,
      requestedAction: body.requestedAction,
    },
  });

  return withSignedEvidence(report.toObject());
};

const withSignedEvidence = (reportObj) => {
  if (!reportObj) return reportObj;
  const mapFiles = (files = []) =>
    files.map((f) => {
      const signed = storageService.createSignedUrl(f.storageKey);
      return {
        ...f,
        url: signed ? signed.url : null,
        urlExpiresAt: signed ? signed.expiresAt : null,
      };
    });
  return {
    ...reportObj,
    evidenceFiles: mapFiles(reportObj.evidenceFiles),
    appeals: (reportObj.appeals || []).map((a) => ({
      ...a,
      evidenceFiles: mapFiles(a.evidenceFiles),
    })),
  };
};

/**
 * Teacher submits a Reschedule Request directly or via Incident Report (Phase 11).
 */
const requestSessionReschedule = async (teacherId, sessionId, body) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  }
  const session = await Session.findById(sessionId);
  if (!session)
    throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  if (session.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only reschedule your own sessions");
  }

  if (!body || isBlank(body.reason)) {
    throw validationError("reason is required");
  }
  const proposedStartDatetime = parseDate(
    body.proposedStartDatetime,
    "proposedStartDatetime",
  );
  const proposedEndDatetime = parseDate(
    body.proposedEndDatetime,
    "proposedEndDatetime",
  );

  await assertNoScheduleConflict({
    teacherId,
    classId: session.classId,
    startDatetime: proposedStartDatetime,
    endDatetime: proposedEndDatetime,
    excludeSessionId: session._id,
  });

  const existingActive = await SessionRescheduleRequest.findOne({
    originalSessionId: session._id,
    status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] },
  });
  if (existingActive) {
    throw new AppError(
      "An active reschedule request already exists for this session",
      "DUPLICATE_RESCHEDULE_REQUEST",
      409,
    );
  }

  const request = await SessionRescheduleRequest.create({
    originalSessionId: session._id,
    classId: session.classId,
    teacherId,
    requestedBy: teacherId,
    incidentReportId: body.incidentReportId || null,
    proposedStartDatetime,
    proposedEndDatetime,
    proposedTitle: body.proposedTitle || `${session.title} (Buổi học bù)`,
    reason: body.reason.trim(),
    status: "PENDING_ADMIN_APPROVAL",
  });

  await notifyAdminsOnce(
    "Yêu cầu học bù / đổi lịch buổi học",
    `Giáo viên đề xuất lịch học bù cho buổi "${session.title}" vào ${proposedStartDatetime.toISOString()}.`,
    "SESSION_RESCHEDULE_REQUESTED",
    `reschedule:requested:${request._id}`,
    session._id,
  );

  await logAudit({
    actorId: teacherId,
    action: "SESSION_RESCHEDULE_REQUESTED",
    targetType: "SessionRescheduleRequest",
    targetId: request._id,
    reason: body.reason.trim(),
    metadata: {
      originalSessionId: session._id.toString(),
      proposedStartDatetime: proposedStartDatetime.toISOString(),
      proposedEndDatetime: proposedEndDatetime.toISOString(),
    },
  });

  return request.toObject();
};

/**
 * Admin reviews a Reschedule Request (`APPROVED` or `REJECTED`).
 * When approved, creates a linked makeup Session while preserving the original Session,
 * attendance history, and recording history.
 */
const reviewRescheduleRequest = async (adminId, requestId, body) => {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new AppError(
      "Reschedule request not found",
      "RESCHEDULE_REQUEST_NOT_FOUND",
      404,
    );
  }
  const reqDoc = await SessionRescheduleRequest.findById(requestId);
  if (!reqDoc) {
    throw new AppError(
      "Reschedule request not found",
      "RESCHEDULE_REQUEST_NOT_FOUND",
      404,
    );
  }
  if (reqDoc.status !== "PENDING_ADMIN_APPROVAL") {
    throw new AppError(
      "Reschedule request has already been reviewed",
      "RESCHEDULE_ALREADY_REVIEWED",
      409,
    );
  }

  const decision = body?.decision;
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    throw validationError("decision must be APPROVED or REJECTED");
  }

  const originalSession = await Session.findById(reqDoc.originalSessionId);
  if (!originalSession) {
    throw new AppError("Original session not found", "SESSION_NOT_FOUND", 404);
  }

  const enrollments = await getEnrolledStudentIds(originalSession.classId);

  if (decision === "APPROVED") {
    await assertNoScheduleConflict({
      teacherId: originalSession.teacherId,
      classId: originalSession.classId,
      startDatetime: reqDoc.proposedStartDatetime,
      endDatetime: reqDoc.proposedEndDatetime,
      excludeSessionId: originalSession._id,
    });

    const makeupSession = await Session.create({
      classId: originalSession.classId,
      className: originalSession.className,
      teacherId: originalSession.teacherId,
      title: reqDoc.proposedTitle || `${originalSession.title} (Buổi học bù)`,
      description: originalSession.description,
      contents: originalSession.contents || [],
      startDatetime: reqDoc.proposedStartDatetime,
      endDatetime: reqDoc.proposedEndDatetime,
      status: "SCHEDULED",
      roomState: "NOT_OPEN",
      lifecycleState: "SCHEDULED",
      rescheduleMetadata: {
        rescheduledFromSessionId: originalSession._id,
        rescheduleRequestId: reqDoc._id,
        isMakeupSession: true,
        rescheduleCount:
          (originalSession.rescheduleMetadata?.rescheduleCount || 0) + 1,
      },
    });

    originalSession.lifecycleState = "RESCHEDULED";
    if (!originalSession.endReason) {
      originalSession.endReason = "RESCHEDULED";
    }
    originalSession.rescheduleMetadata = {
      ...(originalSession.rescheduleMetadata?.toObject?.() ||
        originalSession.rescheduleMetadata ||
        {}),
      rescheduledToSessionId: makeupSession._id,
      rescheduleRequestId: reqDoc._id,
      rescheduleCount:
        (originalSession.rescheduleMetadata?.rescheduleCount || 0) + 1,
    };
    await originalSession.save();

    // Excuse students on the original session without deleting their attendance/presence logs
    await SessionAttendance.updateMany(
      { sessionId: originalSession._id, attendanceStatus: "ABSENT" },
      {
        $set: {
          attendanceStatus: "EXCUSED",
          evaluationStatus: "EXCUSED",
          evaluationReason: "Session rescheduled to makeup session",
        },
      },
    );

    reqDoc.status = "APPROVED";
    reqDoc.makeupSessionId = makeupSession._id;
    reqDoc.reviewedBy = adminId;
    reqDoc.reviewedAt = new Date();
    reqDoc.adminNote = body?.note || null;
    reqDoc.studentConfirmations = enrollments.map((e) => ({
      studentId: e.studentId,
      status: "PENDING",
      respondedAt: null,
    }));
    await reqDoc.save();

    // Clear any pending refund reviews on the original session because makeup session is scheduled
    await SessionRefundReview.updateMany(
      { sessionId: originalSession._id, status: "NEEDS_FINANCIAL_REVIEW" },
      {
        $set: {
          status: "RESCHEDULED_WAIVED",
          earningReconciliationStatus: "CLEARED_AFTER_MAKEUP",
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: "Makeup session approved and scheduled",
        },
      },
    );

    await notifyOnce(
      originalSession.teacherId,
      "Lịch dạy bù đã được Admin phê duyệt",
      `Buổi học bù "${makeupSession.title}" đã được tạo vào ${makeupSession.startDatetime.toISOString()}.`,
      "RESCHEDULE_APPROVED",
      `reschedule:approved:teacher:${reqDoc._id}`,
      makeupSession._id,
    );

    await Promise.all(
      enrollments.map((e) =>
        notifyOnce(
          e.studentId,
          "Thông báo lịch học bù mới",
          `Buổi học "${originalSession.title}" đã được xếp lịch học bù vào ${makeupSession.startDatetime.toISOString()}. Vui lòng xác nhận tham gia.`,
          "SESSION_RESCHEDULED",
          `reschedule:approved:student:${reqDoc._id}:${e.studentId.toString()}`,
          makeupSession._id,
        ),
      ),
    );
  } else {
    reqDoc.status = "REJECTED";
    reqDoc.reviewedBy = adminId;
    reqDoc.reviewedAt = new Date();
    reqDoc.adminNote = body?.note || null;
    await reqDoc.save();

    await notifyOnce(
      originalSession.teacherId,
      "Yêu cầu đổi lịch / dạy bù bị từ chối",
      `Yêu cầu dạy bù cho buổi "${originalSession.title}" đã bị từ chối. Lý do: ${body?.note || "Không đạt điều kiện"}.`,
      "RESCHEDULE_REJECTED",
      `reschedule:rejected:teacher:${reqDoc._id}`,
      originalSession._id,
    );
  }

  await logAudit({
    actorId: adminId,
    action: `SESSION_RESCHEDULE_${decision}`,
    targetType: "SessionRescheduleRequest",
    targetId: reqDoc._id,
    reason: body?.note || null,
    metadata: {
      originalSessionId: originalSession._id.toString(),
      makeupSessionId: reqDoc.makeupSessionId
        ? reqDoc.makeupSessionId.toString()
        : null,
    },
  });

  return reqDoc.toObject();
};

/**
 * Student confirms or declines attending an approved makeup session.
 * If the student cannot attend the makeup schedule, opens a safe SessionRefundReview.
 */
const respondToRescheduleAsStudent = async (studentId, requestId, body) => {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new AppError(
      "Reschedule request not found",
      "RESCHEDULE_REQUEST_NOT_FOUND",
      404,
    );
  }
  const reqDoc = await SessionRescheduleRequest.findById(requestId);
  if (!reqDoc || reqDoc.status !== "APPROVED") {
    throw new AppError(
      "Approved reschedule request not found",
      "RESCHEDULE_REQUEST_NOT_FOUND",
      404,
    );
  }

  const status = body?.status;
  if (!["ACCEPTED", "CANNOT_ATTEND"].includes(status)) {
    throw validationError("status must be ACCEPTED or CANNOT_ATTEND");
  }

  const enrollment = await Enrollment.findOne({
    classId: reqDoc.classId,
    studentId,
    enrollmentStatus: "CONFIRMED",
  }).lean();
  if (!enrollment) {
    throw FORBIDDEN("You are not enrolled in this class");
  }

  const existingEntry = (reqDoc.studentConfirmations || []).find(
    (c) => c.studentId.toString() === studentId.toString(),
  );
  if (existingEntry) {
    existingEntry.status = status;
    existingEntry.respondedAt = new Date();
    existingEntry.note = body?.note || null;
  } else {
    reqDoc.studentConfirmations.push({
      studentId,
      status,
      respondedAt: new Date(),
      note: body?.note || null,
    });
  }
  await reqDoc.save();

  if (status === "CANNOT_ATTEND") {
    const originalSession = await Session.findById(
      reqDoc.originalSessionId,
    ).lean();
    if (originalSession) {
      await createSafeRefundReviewsForSession(
        originalSession,
        "RESCHEDULE_DECLINED_BY_STUDENT",
        enrollment._id,
      );
    }
  }

  return reqDoc.toObject();
};

/**
 * Admin reviews a TeacherIncidentReport (`APPROVED`, `REJECTED`, `NEEDS_MORE_EVIDENCE`).
 */
const reviewIncidentReport = async (adminId, reportId, body) => {
  if (!mongoose.isValidObjectId(reportId)) {
    throw new AppError(
      "Incident report not found",
      "INCIDENT_REPORT_NOT_FOUND",
      404,
    );
  }
  const report = await TeacherIncidentReport.findById(reportId);
  if (!report) {
    throw new AppError(
      "Incident report not found",
      "INCIDENT_REPORT_NOT_FOUND",
      404,
    );
  }

  const decision = body?.decision;
  if (!["APPROVED", "REJECTED", "NEEDS_MORE_EVIDENCE"].includes(decision)) {
    throw validationError(
      "decision must be APPROVED, REJECTED, or NEEDS_MORE_EVIDENCE",
    );
  }

  const previousStatus = report.reviewStatus;
  report.reviewStatus = decision;
  report.reviewedBy = adminId;
  report.reviewedAt = new Date();
  report.adminDecisionNote = body?.note || null;
  report.decisionHistory.push({
    actorId: adminId,
    action: `ADMIN_REVIEW_${decision}`,
    previousStatus,
    newStatus: decision,
    reason: body?.note || null,
  });
  await report.save();

  const session = await Session.findById(report.sessionId);
  const violations = await TeacherViolation.find({
    sessionId: report.sessionId,
    teacherId: report.teacherId,
  });

  if (decision === "APPROVED") {
    for (const v of violations) {
      v.reviewStatus = body?.downgradeToYellow ? "DOWNGRADED" : "WAIVED";
      if (body?.downgradeToYellow) {
        v.severity = "YELLOW";
        v.countsTowardDiscipline = true;
      } else {
        v.countsTowardDiscipline = false;
      }
      v.reviewedBy = adminId;
      v.reviewedAt = new Date();
      v.adminNote = body?.note || "Excused via approved TeacherIncidentReport";
      await v.save();
    }

    if (session && report.requestedAction === "CANCEL_SESSION") {
      session.status = "CANCELLED";
      session.roomState = "CANCELLED";
      session.lifecycleState = "CANCELLED";
      session.endReason = "INCIDENT_CANCELLED";
      session.actualEndAt = new Date();
      await session.save();

      await SessionAttendance.updateMany(
        { sessionId: session._id },
        {
          $set: {
            attendanceStatus: "EXCUSED",
            evaluationStatus: "EXCUSED",
            evaluationReason:
              "Session cancelled due to approved teacher incident",
          },
        },
      );

      if (!report.linkedRescheduleRequestId) {
        await createSafeRefundReviewsForSession(
          session,
          "INCIDENT_CANCELLED_NO_MAKEUP",
        );
      }
    }

    if (report.linkedRescheduleRequestId && body?.approveReschedule !== false) {
      const rescheduleDoc = await SessionRescheduleRequest.findById(
        report.linkedRescheduleRequestId,
      );
      if (rescheduleDoc && rescheduleDoc.status === "PENDING_ADMIN_APPROVAL") {
        await reviewRescheduleRequest(adminId, rescheduleDoc._id, {
          decision: "APPROVED",
          note: body?.note || "Approved together with incident report",
        });
      }
    }

    await notifyOnce(
      report.teacherId,
      "Báo cáo sự cố đã được chấp thuận",
      `Báo cáo sự cố của bạn cho buổi học "${session?.title || ""}" đã được Admin phê duyệt.`,
      "INCIDENT_REPORT_APPROVED",
      `incident:approved:${report._id}:${report.decisionHistory.length}`,
      report.sessionId,
    );
  } else if (decision === "REJECTED") {
    for (const v of violations) {
      v.reviewStatus = "CONFIRMED";
      v.countsTowardDiscipline = true;
      v.reviewedBy = adminId;
      v.reviewedAt = new Date();
      v.adminNote = body?.note || "Incident report rejected by Admin";
      await v.save();
    }
    await evaluateTeacherDiscipline(report.teacherId, adminId);

    if (
      session &&
      (session.endReason === "TEACHER_NO_SHOW" ||
        session.endReason === "TEACHER_LEFT_EARLY")
    ) {
      await createSafeRefundReviewsForSession(session, session.endReason);
    }

    await notifyOnce(
      report.teacherId,
      "Báo cáo sự cố bị từ chối",
      `Báo cáo sự cố cho buổi học "${session?.title || ""}" không được chấp thuận. Lý do: ${body?.note || "Chứng cứ chưa hợp lệ"}.`,
      "INCIDENT_REPORT_REJECTED",
      `incident:rejected:${report._id}:${report.decisionHistory.length}`,
      report.sessionId,
    );
  } else {
    await notifyOnce(
      report.teacherId,
      "Yêu cầu bổ sung minh chứng sự cố",
      `Admin yêu cầu bổ sung minh chứng cho báo cáo sự cố buổi "${session?.title || ""}": ${body?.note || ""}`,
      "INCIDENT_REPORT_NEEDS_EVIDENCE",
      `incident:needsevidence:${report._id}:${report.decisionHistory.length}`,
      report.sessionId,
    );
  }

  await logAudit({
    actorId: adminId,
    action: `TEACHER_INCIDENT_REPORT_${decision}`,
    targetType: "TeacherIncidentReport",
    targetId: report._id,
    reason: body?.note || null,
    metadata: {
      sessionId: report.sessionId.toString(),
      teacherId: report.teacherId.toString(),
      previousStatus,
      newStatus: decision,
    },
  });

  return withSignedEvidence(report.toObject());
};

/**
 * Teacher submits an appeal on a rejected Incident Report or confirmed Violation.
 */
const submitIncidentAppeal = async (teacherId, reportId, body) => {
  if (!mongoose.isValidObjectId(reportId)) {
    throw new AppError(
      "Incident report not found",
      "INCIDENT_REPORT_NOT_FOUND",
      404,
    );
  }
  const report = await TeacherIncidentReport.findById(reportId);
  if (!report)
    throw new AppError(
      "Incident report not found",
      "INCIDENT_REPORT_NOT_FOUND",
      404,
    );
  if (report.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only appeal your own incident reports");
  }
  if (isBlank(body?.reason)) {
    throw validationError("reason is required for appeal");
  }

  const rawEvidence = Array.isArray(body.evidenceFiles)
    ? body.evidenceFiles
    : [];
  const storageKeys = rawEvidence.map((item) =>
    typeof item === "string" ? item : item?.storageKey,
  );
  if (storageKeys.length > 0) {
    await storageService.assertOwnedKeys(teacherId, storageKeys);
  }

  const evidenceFiles = rawEvidence.map((item) =>
    typeof item === "string"
      ? { storageKey: item, uploadedAt: new Date() }
      : {
          storageKey: item.storageKey,
          originalName: item.originalName || null,
          mimeType: item.mimeType || null,
          uploadedAt: new Date(),
        },
  );

  report.appeals.push({
    submittedBy: teacherId,
    reason: body.reason.trim(),
    evidenceFiles,
    status: "PENDING",
  });
  await report.save();

  if (report.linkedViolationId) {
    await TeacherViolation.updateOne(
      { _id: report.linkedViolationId },
      {
        $set: {
          appealStatus: "SUBMITTED",
          appealReason: body.reason.trim(),
          appealedAt: new Date(),
        },
      },
    );
  }

  await notifyAdminsOnce(
    "Kháng cáo báo cáo sự cố từ giáo viên",
    `Giáo viên đã gửi kháng cáo cho báo cáo sự cố #${report._id}.`,
    "TEACHER_INCIDENT_APPEAL_SUBMITTED",
    `incident:appeal:${report._id}:${report.appeals.length}`,
    report.sessionId,
  );

  await logAudit({
    actorId: teacherId,
    action: "TEACHER_INCIDENT_APPEAL_SUBMITTED",
    targetType: "TeacherIncidentReport",
    targetId: report._id,
    reason: body.reason.trim(),
  });

  return withSignedEvidence(report.toObject());
};

/**
 * Admin directly reviews a TeacherViolation (`CONFIRMED`, `WAIVED`, `DOWNGRADED`).
 */
const reviewTeacherViolation = async (adminId, violationId, body) => {
  if (!mongoose.isValidObjectId(violationId)) {
    throw new AppError("Violation not found", "VIOLATION_NOT_FOUND", 404);
  }
  const violation = await TeacherViolation.findById(violationId);
  if (!violation)
    throw new AppError("Violation not found", "VIOLATION_NOT_FOUND", 404);

  const decision = body?.reviewStatus;
  if (!["CONFIRMED", "WAIVED", "DOWNGRADED"].includes(decision)) {
    throw validationError(
      "reviewStatus must be CONFIRMED, WAIVED, or DOWNGRADED",
    );
  }

  violation.reviewStatus = decision;
  violation.countsTowardDiscipline =
    decision === "CONFIRMED" || decision === "DOWNGRADED";
  if (
    decision === "DOWNGRADED" &&
    body?.newSeverity &&
    SEVERITY_RANK[body.newSeverity]
  ) {
    violation.severity = body.newSeverity;
  }
  violation.reviewedBy = adminId;
  violation.reviewedAt = new Date();
  violation.adminNote = body?.note || null;
  if (violation.appealStatus === "SUBMITTED") {
    violation.appealStatus =
      decision === "WAIVED" || decision === "DOWNGRADED"
        ? "APPROVED"
        : "REJECTED";
  }
  await violation.save();

  await evaluateTeacherDiscipline(violation.teacherId, adminId);

  await logAudit({
    actorId: adminId,
    action: `TEACHER_VIOLATION_${decision}`,
    targetType: "TeacherViolation",
    targetId: violation._id,
    reason: body?.note || null,
    metadata: {
      sessionId: violation.sessionId.toString(),
      teacherId: violation.teacherId.toString(),
      severity: violation.severity,
    },
  });

  return violation.toObject();
};

/**
 * Admin reviews a TeacherDisciplineCase (`RESOLVED_APPROVED`, `RESOLVED_WAIVED`, `NEEDS_POLICY_CONFIGURATION`).
 */
const reviewDisciplineCase = async (adminId, caseId, body) => {
  if (!mongoose.isValidObjectId(caseId)) {
    throw new AppError(
      "Discipline case not found",
      "DISCIPLINE_CASE_NOT_FOUND",
      404,
    );
  }
  const doc = await TeacherDisciplineCase.findById(caseId);
  if (!doc)
    throw new AppError(
      "Discipline case not found",
      "DISCIPLINE_CASE_NOT_FOUND",
      404,
    );

  const status = body?.status;
  if (
    ![
      "RESOLVED_APPROVED",
      "RESOLVED_WAIVED",
      "NEEDS_POLICY_CONFIGURATION",
    ].includes(status)
  ) {
    throw validationError(
      "status must be RESOLVED_APPROVED, RESOLVED_WAIVED, or NEEDS_POLICY_CONFIGURATION",
    );
  }

  doc.status = status;
  doc.reviewedBy = adminId;
  doc.reviewedAt = new Date();
  doc.resolutionNote = body?.note || null;
  await doc.save();

  await logAudit({
    actorId: adminId,
    action: `TEACHER_DISCIPLINE_CASE_${status}`,
    targetType: "TeacherDisciplineCase",
    targetId: doc._id,
    reason: body?.note || null,
    metadata: {
      teacherId: doc.teacherId.toString(),
      triggerRule: doc.triggerRule,
    },
  });

  return doc.toObject();
};

/**
 * Admin reviews a SessionRefundReview case (`APPROVED_FOR_PAYMENT_TEAM`, `RESCHEDULED_WAIVED`, `REJECTED`).
 */
const reviewRefundCase = async (adminId, refundReviewId, body) => {
  if (!mongoose.isValidObjectId(refundReviewId)) {
    throw new AppError(
      "Refund review not found",
      "REFUND_REVIEW_NOT_FOUND",
      404,
    );
  }
  const doc = await SessionRefundReview.findById(refundReviewId);
  if (!doc)
    throw new AppError(
      "Refund review not found",
      "REFUND_REVIEW_NOT_FOUND",
      404,
    );

  const status = body?.status;
  if (
    !["APPROVED_FOR_PAYMENT_TEAM", "RESCHEDULED_WAIVED", "REJECTED"].includes(
      status,
    )
  ) {
    throw validationError(
      "status must be APPROVED_FOR_PAYMENT_TEAM, RESCHEDULED_WAIVED, or REJECTED",
    );
  }

  // A decision is final: re-approving would issue a second refund
  if (doc.status !== "NEEDS_FINANCIAL_REVIEW") {
    throw new AppError("Refund review has already been decided", "REFUND_REVIEW_ALREADY_DECIDED", 409);
  }

  const dbSession = await mongoose.startSession();
  let refund = null;
  try {
    await dbSession.withTransaction(async () => {
      const current = await SessionRefundReview.findOne({ _id: doc._id, status: "NEEDS_FINANCIAL_REVIEW" }).session(dbSession);
      if (!current) {
        throw new AppError("Refund review has already been decided", "REFUND_REVIEW_ALREADY_DECIDED", 409);
      }
      current.status = status;
      if (status === "APPROVED_FOR_PAYMENT_TEAM") {
        refund = await issueSessionRefund(current, dbSession);
        current.refundAmount = refund.refundAmount;
        current.refundTransactionId = refund.transaction ? refund.transaction._id : null;
        // Earning already paid out: the deduction must be reconciled by hand
        current.earningReconciliationStatus =
          refund.refundAmount > 0 && !refund.earningAdjusted ? "PENDING_PAYMENT_TEAM_REVIEW" : "RESOLVED";
      } else if (status === "RESCHEDULED_WAIVED") {
        current.earningReconciliationStatus = "CLEARED_AFTER_MAKEUP";
      } else {
        current.earningReconciliationStatus = "RESOLVED";
      }
      current.reviewedBy = adminId;
      current.reviewedAt = new Date();
      current.reviewNote = body?.note || null;
      await current.save({ session: dbSession });
      Object.assign(doc, current.toObject());
    });
  } finally {
    await dbSession.endSession();
  }

  if (refund && refund.refundAmount > 0) {
    await notifyOnce(
      doc.studentId,
      "Yêu cầu hoàn phí buổi học đã được duyệt",
      `Bạn được hoàn ${refund.refundAmount.toLocaleString("vi-VN")}đ cho buổi học bị ảnh hưởng. Khoản hoàn sẽ được chuyển trong thời gian xử lý của bộ phận thanh toán.`,
      "SESSION_REFUND_APPROVED",
      `refund_review:${doc._id}:student:approved`,
      doc.sessionId
    );
  }

  await logAudit({
    actorId: adminId,
    action: `SESSION_REFUND_REVIEW_${status}`,
    targetType: "SessionRefundReview",
    targetId: doc._id,
    reason: body?.note || null,
    metadata: {
      sessionId: doc.sessionId.toString(),
      enrollmentId: doc.enrollmentId.toString(),
    },
  });

  return doc.toObject();
};

const getTeacherDisciplineOverview = async (teacherId) => {
  const [violations, disciplineCases, incidentReports, rescheduleRequests] =
    await Promise.all([
      TeacherViolation.find({ teacherId })
        .populate(
          "sessionId",
          "title className startDatetime endDatetime status lifecycleState",
        )
        .sort({ detectedAt: -1 })
        .lean(),
      TeacherDisciplineCase.find({ teacherId }).sort({ createdAt: -1 }).lean(),
      TeacherIncidentReport.find({ teacherId })
        .populate(
          "sessionId",
          "title className startDatetime endDatetime status lifecycleState",
        )
        .sort({ createdAt: -1 })
        .lean(),
      SessionRescheduleRequest.find({ teacherId })
        .populate(
          "originalSessionId",
          "title className startDatetime endDatetime",
        )
        .populate(
          "makeupSessionId",
          "title className startDatetime endDatetime status",
        )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  const confirmedCounts = {
    yellow: violations.filter(
      (v) => v.reviewStatus === "CONFIRMED" && v.severity === "YELLOW",
    ).length,
    red: violations.filter(
      (v) => v.reviewStatus === "CONFIRMED" && v.severity === "RED",
    ).length,
    noShow: violations.filter(
      (v) => v.reviewStatus === "CONFIRMED" && v.severity === "NO_SHOW",
    ).length,
    earlyLeave: violations.filter(
      (v) => v.reviewStatus === "CONFIRMED" && v.severity === "EARLY_LEAVE",
    ).length,
  };

  return {
    confirmedCounts,
    violations,
    disciplineCases,
    incidentReports: incidentReports.map(withSignedEvidence),
    rescheduleRequests,
  };
};

const listAdminSmartClassroomOverview = async (
  query = {},
  paging = { page: 1, pageSize: 20, skip: 0 },
) => {
  const filter = {};
  if (query.status) filter.reviewStatus = query.status;

  const [
    incidentReports,
    totalIncidents,
    violations,
    disciplineCases,
    rescheduleRequests,
    refundReviews,
  ] = await Promise.all([
    TeacherIncidentReport.find(filter)
      .populate("teacherId", "email teacherProfile.fullName")
      .populate(
        "sessionId",
        "title className startDatetime endDatetime status lifecycleState",
      )
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    TeacherIncidentReport.countDocuments(filter),
    TeacherViolation.find({})
      .populate("teacherId", "email teacherProfile.fullName")
      .populate(
        "sessionId",
        "title className startDatetime endDatetime status lifecycleState",
      )
      .sort({ detectedAt: -1 })
      .limit(50)
      .lean(),
    TeacherDisciplineCase.find({})
      .populate("teacherId", "email teacherProfile.fullName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    SessionRescheduleRequest.find({})
      .populate("teacherId", "email teacherProfile.fullName")
      .populate(
        "originalSessionId",
        "title className startDatetime endDatetime status",
      )
      .populate(
        "makeupSessionId",
        "title className startDatetime endDatetime status",
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    SessionRefundReview.find({})
      .populate("studentId", "email studentProfile.fullName")
      .populate("teacherId", "email teacherProfile.fullName")
      .populate("sessionId", "title className startDatetime endDatetime status")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  return {
    incidents: paged(
      incidentReports.map(withSignedEvidence),
      totalIncidents,
      paging,
    ),
    violations,
    disciplineCases,
    rescheduleRequests,
    refundReviews,
  };
};

module.exports = {
  SEVERITY_RANK,
  INCIDENT_WINDOW_AFTER_END_MS,
  createSafeRefundReviewsForSession,
  evaluateTeacherDiscipline,
  recordOrEscalateTeacherViolation,
  finalizeExpiredPendingViolations,
  assertNoScheduleConflict,
  submitIncidentReport,
  requestSessionReschedule,
  reviewRescheduleRequest,
  respondToRescheduleAsStudent,
  reviewIncidentReport,
  submitIncidentAppeal,
  reviewTeacherViolation,
  reviewDisciplineCase,
  reviewRefundCase,
  getTeacherDisciplineOverview,
  listAdminSmartClassroomOverview,
};
