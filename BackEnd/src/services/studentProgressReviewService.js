const mongoose = require("mongoose");
const { StudentProgressReview, Class, Session, Enrollment, Submission, Attempt, SessionAttendance, User } = require("../models");
const { PROGRESS_REVIEW_RATINGS, PROGRESS_REVIEW_PERIOD_TYPES } = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");
const { computeStudentClassMetricsSnapshot } = require("./learningProgressService");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const ELIGIBLE_CLASS_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED"];
const ELIGIBLE_ENROLLMENT_STATUSES = ["CONFIRMED", "COMPLETED"];

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const reviewNotFound = () => new AppError("Progress review not found", "PROGRESS_REVIEW_NOT_FOUND", 404);

const parseOptionalText = (value, field, maxLen = 2000) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw validationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLen) throw validationError(`${field} must not exceed ${maxLen} characters`);
  return trimmed;
};

const parseMasteryScore = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "boolean" || typeof value === "object") {
    throw validationError("masteryScore must be a number between 0 and 100");
  }
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw validationError("masteryScore must be a number between 0 and 100");
  }
  return Math.round(num * 100) / 100;
};

const isNonStringObjectOrArray = (v) =>
  v !== undefined && v !== null && typeof v === "object" && !(v instanceof mongoose.Types.ObjectId);

const parseOptionalEnum = (value, allowed, field, defaultVal = null) => {
  if (value === undefined || value === null || value === "") return defaultVal;
  if (typeof value !== "string") throw validationError(`${field} must be a string`);
  const normalized = value.trim().toUpperCase();
  if (!normalized) return defaultVal;
  if (!allowed.includes(normalized)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return normalized;
};

const assertQueryIdIfPresent = (value, message, code) => {
  if (value === undefined || value === null || value === "") return null;
  if (isNonStringObjectOrArray(value) || typeof value === "boolean") {
    throw validationError("Invalid identifier format");
  }
  assertId(value, message, code);
  return String(value);
};

const assertStudentInClass = async (classDoc, studentId) => {
  assertId(studentId, "Student not found", "USER_NOT_FOUND");
  const student = await User.findOne({ _id: studentId, role: "STUDENT", ...NOT_DELETED })
    .select("email studentProfile.fullName studentProfile.avatarUrl")
    .lean();
  if (!student) throw new AppError("Student not found", "USER_NOT_FOUND", 404);

  const enrollment = await Enrollment.findOne({
    studentId: student._id,
    classId: classDoc._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  }).lean();

  if (!enrollment) {
    throw new AppError(
      "Student is outside this class or does not have a confirmed/completed enrollment",
      "NOT_ENROLLED",
      403
    );
  }
  return { student, enrollment };
};

const assertClassAndTimingEligible = async (classDoc, studentId, { periodType, sessionId = null }, now = new Date(), dbSession = null) => {
  if (!ELIGIBLE_CLASS_STATUSES.includes(classDoc.status)) {
    throw new AppError(
      `Cannot review student progress when class status is ${classDoc.status}`,
      "PROGRESS_REVIEW_NOT_ALLOWED",
      409
    );
  }

  const sessQuery = Session.find({ classId: classDoc._id });
  if (dbSession) sessQuery.session(dbSession);
  const classSessions = await sessQuery.lean();
  const activeSessions = classSessions.filter(
    (s) => s.status !== "CANCELLED" && s.lifecycleState !== "RESCHEDULED"
  );

  let validatedSession = null;
  if (sessionId) {
    if (isNonStringObjectOrArray(sessionId) || typeof sessionId === "boolean") {
      throw validationError("sessionId must be a valid session ID");
    }
    assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
    validatedSession = classSessions.find((s) => toId(s._id) === toId(sessionId));
    if (!validatedSession) {
      const lookupQ = Session.findById(sessionId);
      if (dbSession) lookupQ.session(dbSession);
      validatedSession = await lookupQ.lean();
    }
    if (!validatedSession) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }
    if (toId(validatedSession.classId) !== toId(classDoc._id)) {
      throw new AppError("sessionId does not belong to this class", "SESSION_CLASS_MISMATCH", 400);
    }
    if (validatedSession.status === "CANCELLED" || validatedSession.lifecycleState === "RESCHEDULED") {
      throw new AppError("Cannot review student progress against a cancelled or rescheduled session", "SESSION_CANCELLED", 409);
    }
    if (validatedSession.status === "SCHEDULED" && new Date(validatedSession.startDatetime) > now) {
      throw new AppError("Cannot evaluate progress for a session that has not started yet", "SESSION_NOT_STARTED", 409);
    }
  }

  // Timing guard: do not allow reviewing before learning has started
  const startsInFuture = classDoc.startDate && new Date(classDoc.startDate) > now;
  const hasStartedSession = activeSessions.some(
    (s) =>
      ["WAITING", "IN_PROGRESS", "INTERRUPTED", "COMPLETED"].includes(s.status) ||
      new Date(s.startDatetime) <= now
  );

  if (startsInFuture && !hasStartedSession) {
    let hasAttendance;
    let hasSubmission;
    let hasAttempt;
    if (dbSession) {
      hasAttendance = await SessionAttendance.exists({ classId: classDoc._id, studentId }).session(dbSession);
      hasSubmission = await Submission.exists({ classId: classDoc._id, studentId }).session(dbSession);
      hasAttempt = await Attempt.exists({ classId: classDoc._id, studentId, status: { $ne: "IN_PROGRESS" } }).session(dbSession);
    } else {
      [hasAttendance, hasSubmission, hasAttempt] = await Promise.all([
        SessionAttendance.exists({ classId: classDoc._id, studentId }),
        Submission.exists({ classId: classDoc._id, studentId }),
        Attempt.exists({ classId: classDoc._id, studentId, status: { $ne: "IN_PROGRESS" } }),
      ]);
    }
    if (!hasAttendance && !hasSubmission && !hasAttempt) {
      throw new AppError(
        "Cannot create student progress review before the class has started or any session/LMS activity occurred",
        "PROGRESS_REVIEW_TOO_EARLY",
        409
      );
    }
  }

  if (periodType === "END_OF_CLASS") {
    const allActiveSessionsCompleted =
      activeSessions.length > 0 && activeSessions.every((s) => s.status === "COMPLETED");
    const pastEndDate = classDoc.endDate && now >= new Date(classDoc.endDate);
    if (classDoc.status !== "COMPLETED" && !allActiveSessionsCompleted && !pastEndDate) {
      throw new AppError(
        "END_OF_CLASS progress review can only be submitted after the class has completed or reached its end date",
        "END_OF_CLASS_REVIEW_NOT_READY",
        409
      );
    }
  }

  return validatedSession;
};

const presentReview = (doc, { audience = "TEACHER", studentMap = null, classMap = null, teacherMap = null } = {}) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const id = toId(plain._id);
  const classIdStr = toId(plain.classId);
  const studentIdStr = toId(plain.studentId);
  const teacherIdStr = toId(plain.teacherId);

  const studentUser = studentMap ? studentMap.get(studentIdStr) : null;
  const teacherUser = teacherMap ? teacherMap.get(teacherIdStr) : null;
  const classInfo = classMap ? classMap.get(classIdStr) : null;

  const history = (plain.revisionHistory || []).map((entry) => {
    const baseEntry = {
      id: toId(entry._id),
      revisionNumber: entry.revisionNumber,
      action: entry.action,
      previousRating: entry.previousRating ?? null,
      newRating: entry.newRating,
      progressRating: entry.progressRating,
      masteryScore: entry.masteryScore ?? null,
      strengths: entry.strengths || "",
      areasForImprovement: entry.areasForImprovement || "",
      actionPlan: entry.actionPlan || "",
      comment: entry.comment || "",
      reason: entry.reason,
      classStatusSnapshot: entry.classStatusSnapshot,
      metricsSnapshot: entry.metricsSnapshot,
      recordedAt: entry.recordedAt,
    };
    if (audience !== "STUDENT") {
      baseEntry.recordedBy = toId(entry.recordedBy);
    }
    return baseEntry;
  });

  const out = {
    id,
    classId: classIdStr,
    courseId: toId(plain.courseId),
    teacherId: teacherIdStr,
    studentId: studentIdStr,
    enrollmentId: toId(plain.enrollmentId),
    sessionId: toId(plain.sessionId),
    periodType: plain.periodType,
    milestoneRef: plain.milestoneRef || null,
    progressRating: plain.progressRating,
    masteryScore: plain.masteryScore ?? null,
    strengths: plain.strengths || "",
    areasForImprovement: plain.areasForImprovement || "",
    actionPlan: plain.actionPlan || "",
    comment: plain.comment || "",
    classStatusSnapshot: plain.classStatusSnapshot,
    enrollmentStatusSnapshot: plain.enrollmentStatusSnapshot,
    metricsSnapshot: plain.metricsSnapshot,
    reviewedAt: plain.reviewedAt,
    lastUpdatedAt: plain.lastUpdatedAt || null,
    revisionNumber: plain.revisionNumber,
    historyCount: history.length,
    revisionHistory: history,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };

  if (classInfo) {
    out.class = {
      id: toId(classInfo._id),
      className: classInfo.className,
      status: classInfo.status,
      courseTitle: classInfo.courseTitle,
    };
  }
  if (studentUser && audience !== "STUDENT") {
    const profile = studentUser.studentProfile || {};
    out.student = {
      id: toId(studentUser._id),
      fullName: profile.fullName || null,
      avatarUrl: profile.avatarUrl || null,
      email: studentUser.email,
    };
  }
  if (teacherUser) {
    const tProfile = teacherUser.teacherProfile || {};
    out.teacher = {
      id: toId(teacherUser._id),
      fullName: tProfile.fullName || null,
    };
  }
  if (audience === "ADMIN") {
    out.createdBy = toId(plain.createdBy);
    out.updatedBy = toId(plain.updatedBy);
  }
  return out;
};

const hydrateAndPresentList = async (items, audience) => {
  if (!items.length) return [];
  const studentIds = [...new Set(items.map((r) => toId(r.studentId)))];
  const teacherIds = [...new Set(items.map((r) => toId(r.teacherId)))];
  const classIds = [...new Set(items.map((r) => toId(r.classId)))];

  const [students, teachers, classes] = await Promise.all([
    audience !== "STUDENT"
      ? User.find({ _id: { $in: studentIds } }).select("email studentProfile.fullName studentProfile.avatarUrl").lean()
      : [],
    User.find({ _id: { $in: teacherIds } }).select("teacherProfile.fullName").lean(),
    Class.find({ _id: { $in: classIds } }).select("className status courseTitle").lean(),
  ]);

  const studentMap = new Map(students.map((s) => [toId(s._id), s]));
  const teacherMap = new Map(teachers.map((t) => [toId(t._id), t]));
  const classMap = new Map(classes.map((c) => [toId(c._id), c]));

  return items.map((doc) => presentReview(doc, { audience, studentMap, classMap, teacherMap }));
};

/**
 * LMS-12: Teacher tạo đánh giá tiến bộ cho 1 học viên trong lớp phụ trách.
 */
const createStudentProgressReview = async (teacherId, classId, studentId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const clsDoc = await getOwnClass(teacherId, classId);
  const cls = clsDoc.toObject ? clsDoc.toObject() : clsDoc;

  const { student, enrollment } = await assertStudentInClass(cls, studentId);

  const defaultPeriod = body.sessionId ? "SESSION_MILESTONE" : "AD_HOC";
  const periodTypeRaw = parseOptionalEnum(body.periodType, PROGRESS_REVIEW_PERIOD_TYPES, "periodType", defaultPeriod);
  if (body.periodType !== undefined && body.periodType !== null && typeof body.periodType === "string" && isBlank(body.periodType)) {
    throw validationError(`periodType must be one of ${PROGRESS_REVIEW_PERIOD_TYPES.join(", ")}`);
  }

  if (typeof body.progressRating !== "string" || isBlank(body.progressRating)) {
    throw validationError(`progressRating must be one of ${PROGRESS_REVIEW_RATINGS.join(", ")}`);
  }
  const progressRatingRaw = body.progressRating.trim().toUpperCase();
  if (!PROGRESS_REVIEW_RATINGS.includes(progressRatingRaw)) {
    throw validationError(`progressRating must be one of ${PROGRESS_REVIEW_RATINGS.join(", ")}`);
  }

  const milestoneRef = parseOptionalText(body.milestoneRef, "milestoneRef", 100) || null;
  if (periodTypeRaw === "SESSION_MILESTONE" && !body.sessionId && isBlank(milestoneRef)) {
    throw validationError("sessionId or milestoneRef is required for SESSION_MILESTONE reviews");
  }

  const masteryScore = parseMasteryScore(body.masteryScore);
  const strengths = parseOptionalText(body.strengths, "strengths", 2000) || "";
  const areasForImprovement = parseOptionalText(body.areasForImprovement, "areasForImprovement", 2000) || "";
  const actionPlan = parseOptionalText(body.actionPlan, "actionPlan", 2000) || "";
  const comment = parseOptionalText(body.comment, "comment", 4000) || "";

  if (!strengths && !areasForImprovement && !actionPlan && !comment) {
    throw validationError("At least one evaluation field (comment, strengths, areasForImprovement, or actionPlan) is required");
  }

  const now = new Date();
  await assertClassAndTimingEligible(
    cls,
    student._id,
    { periodType: periodTypeRaw, sessionId: body.sessionId || null },
    now
  );

  const initialReason = parseOptionalText(body.reason, "reason", 1000) || "Initial progress evaluation";
  const metricsSnapshot = await computeStudentClassMetricsSnapshot(student._id, cls, enrollment);

  const dbSession = await mongoose.startSession();
  let created;
  try {
    await dbSession.withTransaction(async () => {
      const txCls = await Class.findOne({ _id: cls._id, ...NOT_DELETED }).session(dbSession).lean();
      if (!txCls) throw CLASS_NOT_FOUND();
      if (toId(txCls.teacherId) !== toId(teacherId)) {
        throw FORBIDDEN("You can only create progress reviews in your own classes");
      }

      const txEnrollment = await Enrollment.findOne({
        _id: enrollment._id,
        studentId: student._id,
        classId: txCls._id,
        enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
      })
        .session(dbSession)
        .lean();
      if (!txEnrollment) {
        throw new AppError(
          "Student is outside this class or does not have a confirmed/completed enrollment",
          "NOT_ENROLLED",
          403
        );
      }

      const txValidatedSession = await assertClassAndTimingEligible(
        txCls,
        student._id,
        { periodType: periodTypeRaw, sessionId: body.sessionId || null },
        now,
        dbSession
      );

      if (["MID_TERM", "END_OF_CLASS"].includes(periodTypeRaw)) {
        const dupPeriod = await StudentProgressReview.exists({
          classId: txCls._id,
          studentId: student._id,
          periodType: periodTypeRaw,
        }).session(dbSession);
        if (dupPeriod) {
          throw new AppError(
            `A ${periodTypeRaw} progress review already exists for this student in this class; use PATCH to update it`,
            "PROGRESS_REVIEW_ALREADY_EXISTS",
            409
          );
        }
      }
      if (txValidatedSession) {
        const dupSession = await StudentProgressReview.exists({
          classId: txCls._id,
          studentId: student._id,
          sessionId: txValidatedSession._id,
        }).session(dbSession);
        if (dupSession) {
          throw new AppError(
            "A progress review already exists for this student and session; use PATCH to update it",
            "PROGRESS_REVIEW_ALREADY_EXISTS",
            409
          );
        }
      }

      [created] = await StudentProgressReview.create(
        [
          {
            classId: txCls._id,
            courseId: txCls.courseId,
            teacherId: txCls.teacherId,
            studentId: student._id,
            enrollmentId: txEnrollment._id,
            sessionId: txValidatedSession ? txValidatedSession._id : null,
            periodType: periodTypeRaw,
            milestoneRef: milestoneRef || (txValidatedSession ? txValidatedSession.title : null),
            progressRating: progressRatingRaw,
            masteryScore: masteryScore ?? null,
            strengths,
            areasForImprovement,
            actionPlan,
            comment,
            classStatusSnapshot: txCls.status,
            enrollmentStatusSnapshot: txEnrollment.enrollmentStatus,
            metricsSnapshot,
            reviewedAt: now,
            lastUpdatedAt: null,
            revisionNumber: 1,
            revisionHistory: [
              {
                revisionNumber: 1,
                action: "CREATED",
                previousRating: null,
                newRating: progressRatingRaw,
                progressRating: progressRatingRaw,
                masteryScore: masteryScore ?? null,
                strengths,
                areasForImprovement,
                actionPlan,
                comment,
                reason: initialReason,
                classStatusSnapshot: txCls.status,
                metricsSnapshot,
                recordedBy: teacherId,
                recordedAt: now,
              },
            ],
            createdBy: teacherId,
          },
        ],
        { session: dbSession }
      );
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(
        "A progress review already exists for this milestone/period; use PATCH to update it",
        "PROGRESS_REVIEW_ALREADY_EXISTS",
        409
      );
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  await notify(
    student._id,
    "Đánh giá tiến bộ học tập mới",
    `Giảng viên lớp "${cls.className}" vừa cập nhật đánh giá tiến bộ học tập của bạn.`,
    "PROGRESS_REVIEW_CREATED"
  );

  const [presented] = await hydrateAndPresentList([created.toObject()], "TEACHER");
  return presented;
};

/**
 * LMS-12: Teacher cập nhật đánh giá hiện có — bảo lưu lịch sử append-only trong revisionHistory
 * với Pinned-Revision CAS trong MongoDB transaction để chống lost-update / VersionError 500.
 */
const updateStudentProgressReview = async (teacherId, reviewId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  assertId(reviewId, "Progress review not found", "PROGRESS_REVIEW_NOT_FOUND");

  const preExisting = await StudentProgressReview.findById(reviewId).lean();
  if (!preExisting) throw reviewNotFound();

  const preCls = await Class.findOne({ _id: preExisting.classId, ...NOT_DELETED }).lean();
  if (!preCls) throw CLASS_NOT_FOUND();
  if (toId(preCls.teacherId) !== toId(teacherId) || toId(preExisting.teacherId) !== toId(teacherId)) {
    throw FORBIDDEN("You can only update progress reviews in your own classes");
  }
  if (!ELIGIBLE_CLASS_STATUSES.includes(preCls.status)) {
    throw new AppError(
      `Cannot update progress review when class status is ${preCls.status}`,
      "PROGRESS_REVIEW_NOT_ALLOWED",
      409
    );
  }

  const preEnrollment = await Enrollment.findOne({
    _id: preExisting.enrollmentId,
    studentId: preExisting.studentId,
    classId: preCls._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  }).lean();
  if (!preEnrollment) {
    throw new AppError(
      "Student enrollment is no longer active/completed in this class",
      "NOT_ENROLLED",
      403
    );
  }

  let expectedRevision = preExisting.revisionNumber || 1;
  if (
    body.expectedRevisionNumber !== undefined &&
    body.expectedRevisionNumber !== null &&
    body.expectedRevisionNumber !== ""
  ) {
    if (typeof body.expectedRevisionNumber === "boolean" || typeof body.expectedRevisionNumber === "object") {
      throw validationError("expectedRevisionNumber must be a positive integer");
    }
    const parsedRev = Number(body.expectedRevisionNumber);
    if (!Number.isInteger(parsedRev) || parsedRev < 1) {
      throw validationError("expectedRevisionNumber must be a positive integer");
    }
    if (parsedRev !== expectedRevision) {
      throw new AppError(
        "Progress review was updated concurrently by another request; reload and retry",
        "PROGRESS_REVIEW_CONFLICT",
        409
      );
    }
    expectedRevision = parsedRev;
  }

  const reason = parseOptionalText(body.reason, "reason", 1000);
  if (isBlank(reason)) {
    throw validationError("reason is required when updating a progress review");
  }

  let nextRating = preExisting.progressRating;
  if (body.progressRating !== undefined) {
    if (typeof body.progressRating !== "string" || isBlank(body.progressRating)) {
      throw validationError(`progressRating must be one of ${PROGRESS_REVIEW_RATINGS.join(", ")}`);
    }
    nextRating = body.progressRating.trim().toUpperCase();
    if (!PROGRESS_REVIEW_RATINGS.includes(nextRating)) {
      throw validationError(`progressRating must be one of ${PROGRESS_REVIEW_RATINGS.join(", ")}`);
    }
  }

  const nextMasteryScore = body.masteryScore !== undefined ? parseMasteryScore(body.masteryScore) : preExisting.masteryScore;
  const nextStrengths =
    body.strengths !== undefined ? parseOptionalText(body.strengths, "strengths", 2000) || "" : preExisting.strengths;
  const nextAreas =
    body.areasForImprovement !== undefined
      ? parseOptionalText(body.areasForImprovement, "areasForImprovement", 2000) || ""
      : preExisting.areasForImprovement;
  const nextActionPlan =
    body.actionPlan !== undefined ? parseOptionalText(body.actionPlan, "actionPlan", 2000) || "" : preExisting.actionPlan;
  const nextComment =
    body.comment !== undefined ? parseOptionalText(body.comment, "comment", 4000) || "" : preExisting.comment;
  const nextMilestoneRef =
    body.milestoneRef !== undefined
      ? parseOptionalText(body.milestoneRef, "milestoneRef", 100) || null
      : preExisting.milestoneRef;

  if (!nextStrengths && !nextAreas && !nextActionPlan && !nextComment) {
    throw validationError("At least one evaluation field (comment, strengths, areasForImprovement, or actionPlan) is required");
  }

  const now = new Date();
  const previousRating = preExisting.progressRating;
  const metricsSnapshot = await computeStudentClassMetricsSnapshot(preExisting.studentId, preCls, preEnrollment);
  const nextRevision = expectedRevision + 1;

  const dbSession = await mongoose.startSession();
  let updatedDoc;
  let notifyClassName = preCls.className;
  try {
    await dbSession.withTransaction(async () => {
      const txCls = await Class.findOne({ _id: preExisting.classId, ...NOT_DELETED }).session(dbSession).lean();
      if (!txCls) throw CLASS_NOT_FOUND();
      if (toId(txCls.teacherId) !== toId(teacherId)) {
        throw FORBIDDEN("You can only update progress reviews in your own classes");
      }
      if (!ELIGIBLE_CLASS_STATUSES.includes(txCls.status)) {
        throw new AppError(
          `Cannot update progress review when class status is ${txCls.status}`,
          "PROGRESS_REVIEW_NOT_ALLOWED",
          409
        );
      }
      notifyClassName = txCls.className;

      const txEnrollment = await Enrollment.findOne({
        _id: preExisting.enrollmentId,
        studentId: preExisting.studentId,
        classId: txCls._id,
        enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
      })
        .session(dbSession)
        .lean();
      if (!txEnrollment) {
        throw new AppError(
          "Student enrollment is no longer active/completed in this class",
          "NOT_ENROLLED",
          403
        );
      }

      updatedDoc = await StudentProgressReview.findOneAndUpdate(
        {
          _id: preExisting._id,
          teacherId,
          revisionNumber: expectedRevision,
        },
        {
          $set: {
            milestoneRef: nextMilestoneRef,
            progressRating: nextRating,
            masteryScore: nextMasteryScore ?? null,
            strengths: nextStrengths,
            areasForImprovement: nextAreas,
            actionPlan: nextActionPlan,
            comment: nextComment,
            classStatusSnapshot: txCls.status,
            enrollmentStatusSnapshot: txEnrollment.enrollmentStatus,
            metricsSnapshot,
            lastUpdatedAt: now,
            revisionNumber: nextRevision,
            updatedBy: teacherId,
          },
          $push: {
            revisionHistory: {
              revisionNumber: nextRevision,
              action: "UPDATED",
              previousRating,
              newRating: nextRating,
              progressRating: nextRating,
              masteryScore: nextMasteryScore ?? null,
              strengths: nextStrengths,
              areasForImprovement: nextAreas,
              actionPlan: nextActionPlan,
              comment: nextComment,
              reason,
              classStatusSnapshot: txCls.status,
              metricsSnapshot,
              recordedBy: teacherId,
              recordedAt: now,
            },
          },
          $inc: { __v: 1 },
        },
        { session: dbSession, returnDocument: "after" }
      );

      if (!updatedDoc) {
        throw new AppError(
          "Progress review was updated concurrently by another request; reload and retry",
          "PROGRESS_REVIEW_CONFLICT",
          409
        );
      }
    });
  } finally {
    await dbSession.endSession();
  }

  await notify(
    preExisting.studentId,
    "Cập nhật đánh giá tiến bộ học tập",
    `Giảng viên lớp "${notifyClassName}" vừa cập nhật nhận xét tiến bộ học tập của bạn.`,
    "PROGRESS_REVIEW_UPDATED"
  );

  const [presented] = await hydrateAndPresentList([updatedDoc.toObject()], "TEACHER");
  return presented;
};

const listTeacherClassProgressReviews = async (teacherId, classId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);

  const filter = { classId: cls._id };
  const qStudentId = assertQueryIdIfPresent(query.studentId, "Student not found", "USER_NOT_FOUND");
  if (qStudentId) filter.studentId = qStudentId;

  const qRating = parseOptionalEnum(query.progressRating, PROGRESS_REVIEW_RATINGS, "progressRating");
  if (qRating) filter.progressRating = qRating;

  const qPeriodType = parseOptionalEnum(query.periodType, PROGRESS_REVIEW_PERIOD_TYPES, "periodType");
  if (qPeriodType) filter.periodType = qPeriodType;

  const [items, total] = await Promise.all([
    StudentProgressReview.find(filter)
      .sort({ reviewedAt: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    StudentProgressReview.countDocuments(filter),
  ]);

  return paged(await hydrateAndPresentList(items, "TEACHER"), total, paging);
};

const listTeacherStudentProgressReviews = async (teacherId, classId, studentId, paging) => {
  await getVerifiedTeacher(teacherId);
  const clsDoc = await getOwnClass(teacherId, classId);
  const cls = clsDoc.toObject ? clsDoc.toObject() : clsDoc;
  await assertStudentInClass(cls, studentId);

  const filter = { classId: cls._id, studentId };
  const [items, total] = await Promise.all([
    StudentProgressReview.find(filter)
      .sort({ reviewedAt: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    StudentProgressReview.countDocuments(filter),
  ]);

  return paged(await hydrateAndPresentList(items, "TEACHER"), total, paging);
};

const getTeacherProgressReviewHistory = async (teacherId, reviewId) => {
  await getVerifiedTeacher(teacherId);
  assertId(reviewId, "Progress review not found", "PROGRESS_REVIEW_NOT_FOUND");
  const review = await StudentProgressReview.findById(reviewId).lean();
  if (!review) throw reviewNotFound();

  const cls = await Class.findOne({ _id: review.classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (toId(cls.teacherId) !== toId(teacherId) || toId(review.teacherId) !== toId(teacherId)) {
    throw FORBIDDEN("You can only view progress review history for your own classes");
  }

  const [presented] = await hydrateAndPresentList([review], "TEACHER");
  return {
    reviewId: presented.id,
    classId: presented.classId,
    studentId: presented.studentId,
    currentRating: presented.progressRating,
    revisionNumber: presented.revisionNumber,
    history: presented.revisionHistory,
  };
};

const listMyProgressReviews = async (studentId, query = {}, paging) => {
  const filter = { studentId };
  const qClassId = assertQueryIdIfPresent(query.classId, "Class not found", "CLASS_NOT_FOUND");
  if (qClassId) {
    const enrolled = await Enrollment.exists({
      studentId,
      classId: qClassId,
      enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
    });
    if (!enrolled) {
      throw new AppError("You do not have an active or completed enrollment in this class", "NOT_ENROLLED", 403);
    }
    filter.classId = qClassId;
  }

  const [items, total] = await Promise.all([
    StudentProgressReview.find(filter)
      .sort({ reviewedAt: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    StudentProgressReview.countDocuments(filter),
  ]);

  return paged(await hydrateAndPresentList(items, "STUDENT"), total, paging);
};

const listMyClassProgressReviews = async (studentId, classId, paging) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const enrolled = await Enrollment.exists({
    studentId,
    classId: cls._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  });
  if (!enrolled) {
    throw new AppError("You do not have an active or completed enrollment in this class", "NOT_ENROLLED", 403);
  }

  const filter = { studentId, classId: cls._id };
  const [items, total] = await Promise.all([
    StudentProgressReview.find(filter)
      .sort({ reviewedAt: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    StudentProgressReview.countDocuments(filter),
  ]);

  return paged(await hydrateAndPresentList(items, "STUDENT"), total, paging);
};

const adminListProgressReviews = async (query = {}, paging) => {
  const filter = {};
  const qClassId = assertQueryIdIfPresent(query.classId, "Class not found", "CLASS_NOT_FOUND");
  if (qClassId) filter.classId = qClassId;

  const qTeacherId = assertQueryIdIfPresent(query.teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  if (qTeacherId) filter.teacherId = qTeacherId;

  const qStudentId = assertQueryIdIfPresent(query.studentId, "Student not found", "USER_NOT_FOUND");
  if (qStudentId) filter.studentId = qStudentId;

  const qRating = parseOptionalEnum(query.progressRating, PROGRESS_REVIEW_RATINGS, "progressRating");
  if (qRating) filter.progressRating = qRating;

  const qPeriodType = parseOptionalEnum(query.periodType, PROGRESS_REVIEW_PERIOD_TYPES, "periodType");
  if (qPeriodType) filter.periodType = qPeriodType;

  const [items, total] = await Promise.all([
    StudentProgressReview.find(filter)
      .sort({ reviewedAt: -1, createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    StudentProgressReview.countDocuments(filter),
  ]);

  return paged(await hydrateAndPresentList(items, "ADMIN"), total, paging);
};

const adminGetProgressReviewHistory = async (reviewId) => {
  assertId(reviewId, "Progress review not found", "PROGRESS_REVIEW_NOT_FOUND");
  const review = await StudentProgressReview.findById(reviewId).lean();
  if (!review) throw reviewNotFound();
  const [presented] = await hydrateAndPresentList([review], "ADMIN");
  return {
    reviewId: presented.id,
    classId: presented.classId,
    studentId: presented.studentId,
    teacherId: presented.teacherId,
    currentRating: presented.progressRating,
    revisionNumber: presented.revisionNumber,
    history: presented.revisionHistory,
  };
};

module.exports = {
  createStudentProgressReview,
  updateStudentProgressReview,
  listTeacherClassProgressReviews,
  listTeacherStudentProgressReviews,
  getTeacherProgressReviewHistory,
  listMyProgressReviews,
  listMyClassProgressReviews,
  adminListProgressReviews,
  adminGetProgressReviewHistory,
};

