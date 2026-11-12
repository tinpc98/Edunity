const crypto = require("crypto");
const mongoose = require("mongoose");
const { Assignment, Submission, Class, Session, Enrollment, User } = require("../models");
const { ASSIGNMENT_STATUSES, SUBMISSION_STATUSES } = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, parseDate, isBlank } = require("../utils/http");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");
const storageService = require("./storageService");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const assignmentNotFound = () => new AppError("Assignment not found", "ASSIGNMENT_NOT_FOUND", 404);
const submissionNotFound = () => new AppError("Submission not found", "SUBMISSION_NOT_FOUND", 404);

const assertOptionalString = (value, field) => {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  return value;
};

const assertOptionalBoolean = (value, field) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw validationError(`${field} must be a boolean`);
  }
  return value;
};

const assertOptionalEnum = (value, allowed, field, upper = true) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const normalized = upper ? value.trim().toUpperCase() : value.trim().toLowerCase();
  if (!normalized) return null;
  if (!allowed.includes(normalized)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return normalized;
};

const assertQueryObjectId = (value, message, code, field = "id") => {
  if (typeof value !== "string" && !(value instanceof mongoose.Types.ObjectId)) {
    throw validationError(`${field} must be a valid identifier string`);
  }
  assertId(value, message, code);
  return value;
};

const assertFiniteNumeric = (value, field) => {
  if (
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null) ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw validationError(`${field} must be a finite number`);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw validationError(`${field} must be a finite number`);
  }
  return num;
};

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};

const normalizeIdempotencyKey = (options = {}, body = {}) => {
  const raw = options?.idempotencyKey !== undefined ? options.idempotencyKey : body?.idempotencyKey;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw validationError("Idempotency-Key must be a non-empty string");
  }
  const key = raw.trim();
  if (key.length > 128) throw validationError("Idempotency-Key must not exceed 128 characters");
  return key;
};

const validateHttpUrl = (value, field = "linkUrl") => {
  if (typeof value !== "string" || !/^https?:\/\/\S+$/i.test(value.trim())) {
    throw validationError(`${field} must be a valid http(s) URL`);
  }
  return value.trim();
};

const parseAttachments = async (ownerId, rawList) => {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList)) throw validationError("attachments must be an array");
  const normalized = rawList.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || isBlank(item.storageKey)) {
      throw validationError(`attachments[${idx}].storageKey is required`);
    }
    const mimeRaw = assertOptionalString(item.mimeType, `attachments[${idx}].mimeType`);
    const origRaw = assertOptionalString(item.originalName, `attachments[${idx}].originalName`);
    const titleRaw = assertOptionalString(item.title, `attachments[${idx}].title`);
    return {
      storageKey: item.storageKey.trim(),
      mimeType: mimeRaw ? mimeRaw.trim() : null,
      originalName: origRaw ? origRaw.trim() : null,
      title: titleRaw ? titleRaw.trim() : null,
    };
  });
  if (normalized.length > 0) {
    await storageService.assertOwnedKeys(
      ownerId,
      normalized.map((a) => a.storageKey)
    );
  }
  return normalized;
};

const parseRubricCriteria = (rawCriteria, maxScore) => {
  if (rawCriteria === undefined || rawCriteria === null) return [];
  if (!Array.isArray(rawCriteria)) throw validationError("rubricCriteria must be an array");
  if (rawCriteria.length === 0) return [];

  const seenCodes = new Set();
  let sum = 0;
  const parsed = rawCriteria.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || isBlank(item.criterionCode) || isBlank(item.title)) {
      throw validationError(`rubricCriteria[${idx}] requires criterionCode and title`);
    }
    const criterionCode = item.criterionCode.trim().toUpperCase();
    if (seenCodes.has(criterionCode)) {
      throw validationError(`Duplicate criterionCode "${criterionCode}" in rubricCriteria`);
    }
    seenCodes.add(criterionCode);
    const maxPoints = assertFiniteNumeric(item.maxPoints, `rubricCriteria[${idx}].maxPoints`);
    if (maxPoints <= 0) {
      throw validationError(`rubricCriteria[${idx}].maxPoints must be > 0`);
    }
    const descRaw = assertOptionalString(item.description, `rubricCriteria[${idx}].description`);
    sum += maxPoints;
    return {
      criterionCode,
      title: item.title.trim(),
      description: descRaw ? descRaw.trim() : "",
      maxPoints: Math.round(maxPoints * 100) / 100,
    };
  });

  if (Math.abs(sum - maxScore) > 1e-6) {
    throw validationError(`Sum of rubricCriteria maxPoints (${sum}) must equal assignment maxScore (${maxScore})`);
  }
  return parsed;
};

const signAttachment = (att, includeStorageKey) => {
  const signed = storageService.createSignedUrl(att.storageKey);
  const out = {
    mimeType: att.mimeType || null,
    originalName: att.originalName || null,
    title: att.title || null,
    downloadUrl: signed ? signed.url : null,
    urlExpiresAt: signed ? signed.expiresAt : null,
  };
  if (includeStorageKey) out.storageKey = att.storageKey;
  return out;
};

const presentSubmission = (doc, role, studentMap = null) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const id = plain._id ? plain._id.toString() : plain.id;
  // Raw internal storageKey stays hidden from STUDENT views; students access files via signed downloadUrl.
  const includeKey = role === "ADMIN" || role === "TEACHER";
  const out = {
    id,
    assignmentId: plain.assignmentId.toString(),
    classId: plain.classId.toString(),
    courseId: plain.courseId.toString(),
    studentId: plain.studentId.toString(),
    enrollmentId: plain.enrollmentId.toString(),
    attemptNumber: plain.attemptNumber,
    textAnswer: plain.textAnswer || null,
    linkUrl: plain.linkUrl || null,
    attachments: (plain.attachments || []).map((a) => signAttachment(a, includeKey)),
    submittedAt: plain.submittedAt,
    isLate: Boolean(plain.isLate),
    lateSeconds: plain.lateSeconds || 0,
    status: plain.status,
    currentScore: plain.currentScore,
    maxScoreSnapshot: plain.maxScoreSnapshot,
    latestFeedback: plain.latestFeedback || null,
    latestGradeId: plain.latestGradeId ? plain.latestGradeId.toString() : null,
    gradedAt: plain.gradedAt || null,
    rubricScores: plain.rubricScores || [],
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
  if (studentMap) {
    const s = studentMap.get(plain.studentId.toString());
    out.student = s
      ? {
          id: s._id.toString(),
          fullName: (s.studentProfile && s.studentProfile.fullName) || null,
          avatarUrl: (s.studentProfile && s.studentProfile.avatarUrl) || null,
        }
      : null;
  }
  return out;
};

const presentAssignmentForTeacher = (doc) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    ...plain,
    id: plain._id ? plain._id.toString() : plain.id,
    attachments: (plain.attachments || []).map((a) => signAttachment(a, true)),
  };
};

const presentAssignmentForStudent = (doc, submissionsForStudent = []) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const sorted = [...submissionsForStudent].sort((a, b) => b.attemptNumber - a.attemptNumber);
  const latest = sorted[0] || null;
  const studentStatus = latest ? latest.status : "open";
  const now = new Date();
  const isPastDue = Boolean(plain.dueAt && now > new Date(plain.dueAt));
  const attemptsUsed = sorted.length;
  const attemptsRemaining = Math.max(0, (plain.maxAttempts || 1) - attemptsUsed);
  const canSubmit =
    plain.status === "PUBLISHED" &&
    attemptsRemaining > 0 &&
    (!isPastDue || Boolean(plain.allowLateSubmission));

  return {
    id: plain._id ? plain._id.toString() : plain.id,
    classId: plain.classId.toString(),
    courseId: plain.courseId.toString(),
    sessionId: plain.sessionId ? plain.sessionId.toString() : null,
    teacherId: plain.teacherId.toString(),
    title: plain.title,
    description: plain.description || "",
    instructions: plain.instructions || "",
    attachments: (plain.attachments || []).map((a) => signAttachment(a, false)),
    dueAt: plain.dueAt || null,
    allowLateSubmission: Boolean(plain.allowLateSubmission),
    maxAttempts: plain.maxAttempts,
    maxScore: plain.maxScore,
    rubricCriteria: plain.rubricCriteria || [],
    status: plain.status,
    publishedAt: plain.publishedAt || null,
    closedAt: plain.closedAt || null,
    studentStatus,
    isPastDue,
    attemptsUsed,
    attemptsRemaining,
    canSubmit,
    latestSubmission: latest ? presentSubmission(latest, "STUDENT") : null,
  };
};

/**
 * LMS-05: Teacher tạo bài tập cho lớp của mình.
 */
const createAssignment = async (teacherId, classId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (["CANCELLED", "REJECTED"].includes(cls.status)) {
    throw new AppError("Cannot create assignments for a cancelled or rejected class", "CLASS_CLOSED", 409);
  }

  if (isBlank(body.title)) throw validationError("title is required");
  const title = body.title.trim();
  const descRaw = assertOptionalString(body.description, "description");
  const instrRaw = assertOptionalString(body.instructions, "instructions");

  let sessionId = null;
  if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== "") {
    assertQueryObjectId(body.sessionId, "Session not found", "SESSION_NOT_FOUND", "sessionId");
    const session = await Session.findOne({ _id: body.sessionId, classId: cls._id }).lean();
    if (!session) throw new AppError("Session does not belong to this class", "SESSION_NOT_FOUND", 404);
    sessionId = session._id;
  }

  const dueAt = parseDate(body.dueAt, "dueAt");
  const allowLateRaw = assertOptionalBoolean(body.allowLateSubmission, "allowLateSubmission");
  const allowLateSubmission = allowLateRaw !== undefined ? allowLateRaw : true;

  const maxAttempts = body.maxAttempts !== undefined ? assertFiniteNumeric(body.maxAttempts, "maxAttempts") : 1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw validationError("maxAttempts must be an integer between 1 and 20");
  }

  const maxScore = body.maxScore !== undefined ? assertFiniteNumeric(body.maxScore, "maxScore") : 100;
  if (maxScore < 1 || maxScore > 1000) {
    throw validationError("maxScore must be a number between 1 and 1000");
  }

  const rubricCriteria = parseRubricCriteria(body.rubricCriteria, maxScore);
  const attachments = await parseAttachments(teacherId, body.attachments);

  let status = "DRAFT";
  let publishedAt = null;
  const publishNowFlag = assertOptionalBoolean(body.publishNow, "publishNow");
  if (body.status !== undefined) {
    if (typeof body.status !== "string") throw validationError("status must be a string");
    const requested = body.status.trim().toUpperCase();
    if (!["DRAFT", "PUBLISHED"].includes(requested)) {
      throw validationError("status on create must be DRAFT or PUBLISHED");
    }
    status = requested;
    if (status === "PUBLISHED") publishedAt = new Date();
  } else if (publishNowFlag === true) {
    status = "PUBLISHED";
    publishedAt = new Date();
  }

  const [created] = await Assignment.create([
    {
      classId: cls._id,
      courseId: cls.courseId,
      sessionId,
      teacherId,
      title,
      description: descRaw ? descRaw.trim() : "",
      instructions: instrRaw ? instrRaw.trim() : "",
      attachments,
      dueAt,
      allowLateSubmission,
      maxAttempts,
      maxScore,
      rubricCriteria,
      status,
      publishedAt,
      createdBy: teacherId,
    },
  ]);

  return presentAssignmentForTeacher(created);
};

const getOwnAssignmentOrThrow = async (teacherId, assignmentId, dbSession = null) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const q = Assignment.findOne({ _id: assignmentId, ...NOT_DELETED });
  if (dbSession) q.session(dbSession);
  const assignment = await q;
  if (!assignment) throw assignmentNotFound();
  if (String(assignment.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only manage assignments of your own classes");
  }
  return assignment;
};

const updateAssignment = async (teacherId, assignmentId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const pre = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  if (pre.status === "CLOSED") {
    throw new AppError("Closed assignment cannot be edited", "ASSIGNMENT_CLOSED", 409);
  }

  if (body.title !== undefined && isBlank(body.title)) {
    throw validationError("title must not be empty");
  }
  const descRaw = assertOptionalString(body.description, "description");
  const instrRaw = assertOptionalString(body.instructions, "instructions");
  const dueAt = body.dueAt !== undefined ? parseDate(body.dueAt, "dueAt") : undefined;
  const allowLate = assertOptionalBoolean(body.allowLateSubmission, "allowLateSubmission");
  const nextMaxAttempts =
    body.maxAttempts !== undefined ? assertFiniteNumeric(body.maxAttempts, "maxAttempts") : undefined;
  if (nextMaxAttempts !== undefined && (!Number.isInteger(nextMaxAttempts) || nextMaxAttempts < 1 || nextMaxAttempts > 20)) {
    throw validationError("maxAttempts must be an integer between 1 and 20");
  }

  let nextMaxScore;
  if (body.maxScore !== undefined) {
    nextMaxScore = assertFiniteNumeric(body.maxScore, "maxScore");
    if (nextMaxScore < 1 || nextMaxScore > 1000) {
      throw validationError("maxScore must be a number between 1 and 1000");
    }
  }

  const parsedAttachments = body.attachments !== undefined ? await parseAttachments(teacherId, body.attachments) : undefined;

  const dbSession = await mongoose.startSession();
  let updated;
  try {
    await dbSession.withTransaction(async () => {
      const assignment = await Assignment.findOneAndUpdate(
        { _id: assignmentId, ...NOT_DELETED, status: { $ne: "CLOSED" } },
        { $inc: { __v: 1 } },
        { session: dbSession, returnDocument: "after" }
      );
      if (!assignment) {
        const current = await Assignment.findOne({ _id: assignmentId, ...NOT_DELETED }).session(dbSession).lean();
        if (!current) throw assignmentNotFound();
        if (String(current.teacherId) !== String(teacherId)) {
          throw FORBIDDEN("You can only manage assignments of your own classes");
        }
        throw new AppError("Closed assignment cannot be edited", "ASSIGNMENT_CLOSED", 409);
      }
      if (String(assignment.teacherId) !== String(teacherId)) {
        throw FORBIDDEN("You can only manage assignments of your own classes");
      }

      const submissionCount = await Submission.countDocuments({ assignmentId: assignment._id }).session(dbSession);
      const highestAttemptDoc = submissionCount
        ? await Submission.findOne({ assignmentId: assignment._id })
            .sort({ attemptNumber: -1 })
            .select("attemptNumber")
            .session(dbSession)
            .lean()
        : null;

      if (body.title !== undefined) assignment.title = body.title.trim();
      if (body.description !== undefined) assignment.description = descRaw ? descRaw.trim() : "";
      if (body.instructions !== undefined) assignment.instructions = instrRaw ? instrRaw.trim() : "";
      if (dueAt !== undefined) assignment.dueAt = dueAt;
      if (allowLate !== undefined) assignment.allowLateSubmission = allowLate;
      if (nextMaxAttempts !== undefined) {
        if (highestAttemptDoc && nextMaxAttempts < highestAttemptDoc.attemptNumber) {
          throw new AppError(
            `Cannot reduce maxAttempts below existing submission attempt (${highestAttemptDoc.attemptNumber})`,
            "ASSIGNMENT_HAS_SUBMISSIONS",
            409
          );
        }
        assignment.maxAttempts = nextMaxAttempts;
      }

      if (body.maxScore !== undefined || body.rubricCriteria !== undefined) {
        if (submissionCount > 0) {
          throw new AppError("Cannot change maxScore or rubricCriteria after students have submitted", "ASSIGNMENT_HAS_SUBMISSIONS", 409);
        }
        const effectiveMaxScore = nextMaxScore !== undefined ? nextMaxScore : assignment.maxScore;
        assignment.maxScore = effectiveMaxScore;
        assignment.rubricCriteria =
          body.rubricCriteria !== undefined
            ? parseRubricCriteria(body.rubricCriteria, effectiveMaxScore)
            : parseRubricCriteria(assignment.rubricCriteria, effectiveMaxScore);
      }

      if (parsedAttachments !== undefined) {
        assignment.attachments = parsedAttachments;
      }

      assignment.updatedBy = teacherId;
      await assignment.save({ session: dbSession });
      updated = assignment;
    });
  } finally {
    await dbSession.endSession();
  }

  return presentAssignmentForTeacher(updated);
};

const publishAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  await getOwnAssignmentOrThrow(teacherId, assignmentId);

  const updated = await Assignment.findOneAndUpdate(
    { _id: assignmentId, teacherId, ...NOT_DELETED, status: "DRAFT" },
    { $set: { status: "PUBLISHED", publishedAt: new Date(), updatedBy: teacherId } },
    { returnDocument: "after" }
  );
  if (updated) return presentAssignmentForTeacher(updated);

  const current = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  if (current.status === "CLOSED") {
    throw new AppError("Closed assignment cannot be published", "ASSIGNMENT_CLOSED", 409);
  }
  return presentAssignmentForTeacher(current);
};

const closeAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  await getOwnAssignmentOrThrow(teacherId, assignmentId);

  const updated = await Assignment.findOneAndUpdate(
    { _id: assignmentId, teacherId, ...NOT_DELETED, status: { $in: ["DRAFT", "PUBLISHED"] } },
    { $set: { status: "CLOSED", closedAt: new Date(), updatedBy: teacherId } },
    { returnDocument: "after" }
  );
  if (updated) return presentAssignmentForTeacher(updated);

  const current = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  return presentAssignmentForTeacher(current);
};

const deleteAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  await getOwnAssignmentOrThrow(teacherId, assignmentId);

  const dbSession = await mongoose.startSession();
  let deletedId;
  try {
    await dbSession.withTransaction(async () => {
      const assignment = await Assignment.findOneAndUpdate(
        { _id: assignmentId, teacherId, ...NOT_DELETED },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: teacherId,
            updatedBy: teacherId,
          },
        },
        { session: dbSession, returnDocument: "after" }
      );
      if (!assignment) {
        await getOwnAssignmentOrThrow(teacherId, assignmentId, dbSession);
      }

      const submissionCount = await Submission.countDocuments({ assignmentId: assignment._id }).session(dbSession);
      if (submissionCount > 0) {
        throw new AppError("Cannot delete assignment with existing submissions; close it instead", "ASSIGNMENT_HAS_SUBMISSIONS", 409);
      }
      deletedId = assignment._id.toString();
    });
  } finally {
    await dbSession.endSession();
  }

  return { deleted: true, id: deletedId };
};

const listTeacherAssignments = async (teacherId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const filter = { teacherId, ...NOT_DELETED };
  if (query.classId !== undefined && query.classId !== "") {
    assertQueryObjectId(query.classId, "Class not found", "CLASS_NOT_FOUND", "classId");
    await getOwnClass(teacherId, query.classId);
    filter.classId = query.classId;
  }
  const status = assertOptionalEnum(query.status, ASSIGNMENT_STATUSES, "status", true);
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Assignment.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Assignment.countDocuments(filter),
  ]);
  return paged(items.map(presentAssignmentForTeacher), total, paging);
};

const getTeacherAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  return presentAssignmentForTeacher(assignment);
};

const listTeacherAssignmentSubmissions = async (teacherId, assignmentId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);

  const filter = { assignmentId: assignment._id };
  const status = assertOptionalEnum(query.status, SUBMISSION_STATUSES, "status", false);
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Submission.find(filter).sort({ submittedAt: -1, attemptNumber: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Submission.countDocuments(filter),
  ]);

  const studentIds = [...new Set(items.map((i) => i.studentId))];
  const students = studentIds.length
    ? await User.find({ _id: { $in: studentIds } }).select("studentProfile.fullName studentProfile.avatarUrl").lean()
    : [];
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

  return paged(items.map((item) => presentSubmission(item, "TEACHER", studentMap)), total, paging);
};

const getTeacherSubmission = async (teacherId, submissionId) => {
  await getVerifiedTeacher(teacherId);
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");
  const sub = await Submission.findById(submissionId).lean();
  if (!sub) throw submissionNotFound();
  if (String(sub.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only view submissions for your own classes");
  }
  const student = await User.findById(sub.studentId).select("studentProfile.fullName studentProfile.avatarUrl").lean();
  const studentMap = student ? new Map([[student._id.toString(), student]]) : new Map();
  return presentSubmission(sub, "TEACHER", studentMap);
};

const adminListAssignments = async (query = {}, paging) => {
  const filter = { ...NOT_DELETED };
  if (query.classId !== undefined && query.classId !== "") {
    filter.classId = assertQueryObjectId(query.classId, "Class not found", "CLASS_NOT_FOUND", "classId");
  }
  const status = assertOptionalEnum(query.status, ASSIGNMENT_STATUSES, "status", true);
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Assignment.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Assignment.countDocuments(filter),
  ]);
  return paged(items.map((doc) => ({ ...doc, id: doc._id.toString() })), total, paging);
};

const adminListAssignmentSubmissions = async (assignmentId, paging) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({ _id: assignmentId, ...NOT_DELETED }).lean();
  if (!assignment) throw assignmentNotFound();
  const filter = { assignmentId: assignment._id };
  const [items, total] = await Promise.all([
    Submission.find(filter).sort({ submittedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Submission.countDocuments(filter),
  ]);
  return paged(items.map((item) => presentSubmission(item, "ADMIN")), total, paging);
};

// ---------- Student endpoints ----------

const listMyClassAssignments = async (studentId, classId, query = {}, paging) => {
  assertQueryObjectId(classId, "Class not found", "CLASS_NOT_FOUND", "classId");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const enrolled = await Enrollment.exists({
    studentId,
    classId: cls._id,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  });
  if (!enrolled) {
    throw new AppError("You must be enrolled in this class to view assignments", "NOT_ENROLLED", 403);
  }

  const targetStatus = assertOptionalEnum(query.status, ["open", ...SUBMISSION_STATUSES], "status", false);

  const assignments = await Assignment.find({
    classId: cls._id,
    status: { $in: ["PUBLISHED", "CLOSED"] },
    ...NOT_DELETED,
  })
    .sort({ dueAt: 1, createdAt: -1 })
    .lean();

  const assignmentIds = assignments.map((a) => a._id);
  const subs = assignmentIds.length
    ? await Submission.find({ assignmentId: { $in: assignmentIds }, studentId }).lean()
    : [];

  const subsByAssignment = new Map();
  for (const s of subs) {
    const k = String(s.assignmentId);
    if (!subsByAssignment.has(k)) subsByAssignment.set(k, []);
    subsByAssignment.get(k).push(s);
  }

  let presented = assignments.map((a) => presentAssignmentForStudent(a, subsByAssignment.get(String(a._id)) || []));
  if (targetStatus) {
    presented = presented.filter((item) => item.studentStatus === targetStatus);
  }

  const total = presented.length;
  const pageItems = presented.slice(paging.skip, paging.skip + paging.pageSize);
  return paged(pageItems, total, paging);
};

const listMyAssignments = async (studentId, query = {}, paging) => {
  if (query.classId !== undefined && query.classId !== "") {
    return listMyClassAssignments(studentId, query.classId, query, paging);
  }
  const targetStatus = assertOptionalEnum(query.status, ["open", ...SUBMISSION_STATUSES], "status", false);

  const enrollments = await Enrollment.find({
    studentId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  })
    .select("classId")
    .lean();
  const classIds = enrollments.map((e) => e.classId);
  if (!classIds.length) return paged([], 0, paging);

  const assignments = await Assignment.find({
    classId: { $in: classIds },
    status: { $in: ["PUBLISHED", "CLOSED"] },
    ...NOT_DELETED,
  })
    .sort({ dueAt: 1, createdAt: -1 })
    .lean();

  const assignmentIds = assignments.map((a) => a._id);
  const subs = assignmentIds.length
    ? await Submission.find({ assignmentId: { $in: assignmentIds }, studentId }).lean()
    : [];
  const subsByAssignment = new Map();
  for (const s of subs) {
    const k = String(s.assignmentId);
    if (!subsByAssignment.has(k)) subsByAssignment.set(k, []);
    subsByAssignment.get(k).push(s);
  }

  let presented = assignments.map((a) => presentAssignmentForStudent(a, subsByAssignment.get(String(a._id)) || []));
  if (targetStatus) {
    presented = presented.filter((item) => item.studentStatus === targetStatus);
  }

  const total = presented.length;
  const pageItems = presented.slice(paging.skip, paging.skip + paging.pageSize);
  return paged(pageItems, total, paging);
};

const getMyAssignment = async (studentId, assignmentId) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    status: { $in: ["PUBLISHED", "CLOSED"] },
    ...NOT_DELETED,
  }).lean();
  if (!assignment) throw assignmentNotFound();

  const enrolled = await Enrollment.exists({
    studentId,
    classId: assignment.classId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  });
  if (!enrolled) {
    throw new AppError("You must be enrolled in this class to view this assignment", "NOT_ENROLLED", 403);
  }

  const subs = await Submission.find({ assignmentId: assignment._id, studentId }).sort({ attemptNumber: -1 }).lean();
  return presentAssignmentForStudent(assignment, subs);
};

/**
 * LMS-05: Student nộp bài tập.
 * - Kiểm tra Enrollment CONFIRMED.
 * - Hỗ trợ cấu hình hạn nộp, allowLateSubmission (nếu nộp muộn hợp lệ -> status "late", KHÔNG tự trừ điểm).
 * - Hỗ trợ maxAttempts, Idempotency-Key & khóa unique (assignmentId, studentId, attemptNumber) chống nộp trùng.
 * - Kiểm tra quyền sở hữu private storageKey cho toàn bộ file đính kèm.
 */
const submitAssignment = async (studentId, assignmentId, body = {}, options = {}) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({ _id: assignmentId, ...NOT_DELETED }).lean();
  if (!assignment || assignment.status === "DRAFT") throw assignmentNotFound();

  const enrollment = await Enrollment.findOne({
    studentId,
    classId: assignment.classId,
    enrollmentStatus: "CONFIRMED",
  }).lean();
  if (!enrollment) {
    throw new AppError("Active confirmed enrollment is required to submit assignments", "NOT_ENROLLED", 403);
  }

  const cls = await Class.findOne({ _id: assignment.classId, ...NOT_DELETED }).select("status className").lean();
  if (!cls || ["CANCELLED", "REJECTED"].includes(cls.status)) {
    throw new AppError("Class is no longer active for submissions", "CLASS_CLOSED", 409);
  }

  if (assignment.status === "CLOSED") {
    throw new AppError("This assignment has been closed by the teacher", "ASSIGNMENT_CLOSED", 409);
  }

  const idempotencyKey = normalizeIdempotencyKey(options, body);

  const rawTextAnswer = assertOptionalString(body.textAnswer, "textAnswer");
  const textAnswer =
    rawTextAnswer !== undefined && rawTextAnswer !== null && !isBlank(rawTextAnswer)
      ? rawTextAnswer.trim()
      : null;
  const rawLinkUrl = assertOptionalString(body.linkUrl, "linkUrl");
  const linkUrl =
    rawLinkUrl !== undefined && rawLinkUrl !== null && !isBlank(rawLinkUrl)
      ? validateHttpUrl(rawLinkUrl, "linkUrl")
      : null;
  const attachments = await parseAttachments(studentId, body.attachments);

  if (!textAnswer && !linkUrl && attachments.length === 0) {
    throw validationError("Submission requires textAnswer, linkUrl, or at least one attachment");
  }

  const requestHash = crypto
    .createHash("sha256")
    .update(
      stableStringify({
        assignmentId: assignment._id.toString(),
        textAnswer,
        linkUrl,
        attachments: attachments.map((a) => a.storageKey),
      })
    )
    .digest("hex");

  const preNow = new Date();
  const preDueAt = assignment.dueAt ? new Date(assignment.dueAt) : null;
  const preIsLate = Boolean(preDueAt && preNow > preDueAt);
  if (preIsLate && !assignment.allowLateSubmission) {
    throw new AppError("Submission deadline has passed and late submissions are not allowed", "LATE_SUBMISSION_NOT_ALLOWED", 409);
  }

  let created;
  let idempotentReplay = false;
  let txAssignmentTitle = assignment.title;
  let txTeacherId = assignment.teacherId;
  let txClassName = cls.className;

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      if (idempotencyKey) {
        const existingKey = await Submission.findOne({
          assignmentId: assignment._id,
          studentId,
          idempotencyKey,
        }).session(dbSession);

        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            throw new AppError("Idempotency-Key was already used with a different submission payload", "IDEMPOTENCY_KEY_CONFLICT", 409);
          }
          created = existingKey;
          idempotentReplay = true;
          return;
        }
      }

      // Acquire write-lock on Assignment inside tx so deleteAssignment/closeAssignment/updateAssignment cannot race (no write skew)
      const freshAssignment = await Assignment.findOneAndUpdate(
        { _id: assignment._id, ...NOT_DELETED, status: "PUBLISHED" },
        { $inc: { __v: 1 } },
        { session: dbSession, returnDocument: "after" }
      ).lean();
      if (!freshAssignment) {
        const currentAssignment = await Assignment.findOne({ _id: assignment._id, ...NOT_DELETED })
          .session(dbSession)
          .lean();
        if (!currentAssignment || currentAssignment.status === "DRAFT") {
          throw assignmentNotFound();
        }
        if (currentAssignment.status === "CLOSED") {
          throw new AppError("This assignment has been closed by the teacher", "ASSIGNMENT_CLOSED", 409);
        }
        throw assignmentNotFound();
      }

      const freshEnrollment = await Enrollment.findOne({
        studentId,
        classId: freshAssignment.classId,
        enrollmentStatus: "CONFIRMED",
      })
        .session(dbSession)
        .lean();
      if (!freshEnrollment) {
        throw new AppError("Active confirmed enrollment is required to submit assignments", "NOT_ENROLLED", 403);
      }

      const freshClass = await Class.findOne({ _id: freshAssignment.classId, ...NOT_DELETED })
        .select("status className")
        .session(dbSession)
        .lean();
      if (!freshClass || ["CANCELLED", "REJECTED"].includes(freshClass.status)) {
        throw new AppError("Class is no longer active for submissions", "CLASS_CLOSED", 409);
      }

      const txNow = new Date();
      const txDueAt = freshAssignment.dueAt ? new Date(freshAssignment.dueAt) : null;
      const isLate = Boolean(txDueAt && txNow > txDueAt);
      if (isLate && !freshAssignment.allowLateSubmission) {
        throw new AppError(
          "Submission deadline has passed and late submissions are not allowed",
          "LATE_SUBMISSION_NOT_ALLOWED",
          409
        );
      }
      const lateSeconds = isLate ? Math.max(1, Math.floor((txNow.getTime() - txDueAt.getTime()) / 1000)) : 0;

      txAssignmentTitle = freshAssignment.title;
      txTeacherId = freshAssignment.teacherId;
      txClassName = freshClass.className;

      const latestSub = await Submission.findOne({
        assignmentId: freshAssignment._id,
        studentId,
      })
        .sort({ attemptNumber: -1 })
        .select("attemptNumber")
        .session(dbSession);

      const nextAttemptNumber = (latestSub ? latestSub.attemptNumber : 0) + 1;
      if (nextAttemptNumber > freshAssignment.maxAttempts) {
        throw new AppError(
          `Maximum submission attempts (${freshAssignment.maxAttempts}) exceeded`,
          "MAX_ATTEMPTS_EXCEEDED",
          409
        );
      }

      const [sub] = await Submission.create(
        [
          {
            assignmentId: freshAssignment._id,
            classId: freshAssignment.classId,
            courseId: freshAssignment.courseId,
            teacherId: freshAssignment.teacherId,
            studentId,
            enrollmentId: freshEnrollment._id,
            attemptNumber: nextAttemptNumber,
            idempotencyKey,
            requestHash,
            textAnswer,
            linkUrl,
            attachments: attachments.map(({ storageKey, mimeType, originalName }) => ({
              storageKey,
              mimeType,
              originalName,
            })),
            submittedAt: txNow,
            isLate,
            lateSeconds,
            status: isLate ? "late" : "submitted",
            currentScore: null,
            maxScoreSnapshot: freshAssignment.maxScore,
          },
        ],
        { session: dbSession }
      );
      created = sub;
    });
  } catch (err) {
    if (err && err.code === 11000) {
      if (idempotencyKey) {
        const existingKey = await Submission.findOne({
          assignmentId: assignment._id,
          studentId,
          idempotencyKey,
        }).lean();
        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            throw new AppError("Idempotency-Key was already used with a different submission payload", "IDEMPOTENCY_KEY_CONFLICT", 409);
          }
          return { ...presentSubmission(existingKey, "STUDENT"), idempotent: true };
        }
      }
      const totalAttempts = await Submission.countDocuments({ assignmentId: assignment._id, studentId });
      if (totalAttempts >= assignment.maxAttempts) {
        throw new AppError(
          `Maximum submission attempts (${assignment.maxAttempts}) exceeded`,
          "MAX_ATTEMPTS_EXCEEDED",
          409
        );
      }
      throw new AppError("Concurrent submission detected; please retry", "SUBMISSION_CONFLICT", 409);
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  if (!idempotentReplay && created) {
    await notify(
      txTeacherId,
      "Bài nộp mới",
      `Lớp "${txClassName}" vừa nhận được bài nộp cho bài tập "${txAssignmentTitle}" (lần ${created.attemptNumber}).`,
      "ASSIGNMENT_SUBMITTED",
      { dedupeKey: `submission:${created._id}:teacher:submitted` }
    );
  }

  return {
    ...presentSubmission(created, "STUDENT"),
    idempotent: idempotentReplay,
  };
};

const listMySubmissionsForAssignment = async (studentId, assignmentId) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    status: { $in: ["PUBLISHED", "CLOSED"] },
    ...NOT_DELETED,
  }).lean();
  if (!assignment) throw assignmentNotFound();

  const enrolled = await Enrollment.exists({
    studentId,
    classId: assignment.classId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  });
  if (!enrolled) {
    throw new AppError("You must be enrolled in this class to view submissions", "NOT_ENROLLED", 403);
  }

  const items = await Submission.find({ assignmentId: assignment._id, studentId }).sort({ attemptNumber: -1 }).lean();
  return items.map((s) => presentSubmission(s, "STUDENT"));
};

const getMySubmission = async (studentId, submissionId) => {
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");
  const sub = await Submission.findOne({ _id: submissionId, studentId }).lean();
  if (!sub) throw submissionNotFound();
  return presentSubmission(sub, "STUDENT");
};

module.exports = {
  createAssignment,
  updateAssignment,
  publishAssignment,
  closeAssignment,
  deleteAssignment,
  listTeacherAssignments,
  getTeacherAssignment,
  listTeacherAssignmentSubmissions,
  getTeacherSubmission,
  adminListAssignments,
  adminListAssignmentSubmissions,
  listMyClassAssignments,
  listMyAssignments,
  getMyAssignment,
  submitAssignment,
  listMySubmissionsForAssignment,
  getMySubmission,
  presentSubmission,
};

