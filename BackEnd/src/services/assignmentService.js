const crypto = require("crypto");
const mongoose = require("mongoose");
const { Assignment, Submission, Class, Session, Enrollment, User } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, parseDate, isBlank } = require("../utils/http");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");
const storageService = require("./storageService");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const assignmentNotFound = () => new AppError("Assignment not found", "ASSIGNMENT_NOT_FOUND", 404);
const submissionNotFound = () => new AppError("Submission not found", "SUBMISSION_NOT_FOUND", 404);

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
    if (!item || isBlank(item.storageKey)) {
      throw validationError(`attachments[${idx}].storageKey is required`);
    }
    return {
      storageKey: String(item.storageKey).trim(),
      mimeType: item.mimeType ? String(item.mimeType).trim() : null,
      originalName: item.originalName ? String(item.originalName).trim() : null,
      title: item.title ? String(item.title).trim() : null,
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
    if (!item || isBlank(item.criterionCode) || isBlank(item.title)) {
      throw validationError(`rubricCriteria[${idx}] requires criterionCode and title`);
    }
    const criterionCode = String(item.criterionCode).trim().toUpperCase();
    if (seenCodes.has(criterionCode)) {
      throw validationError(`Duplicate criterionCode "${criterionCode}" in rubricCriteria`);
    }
    seenCodes.add(criterionCode);
    const maxPoints = Number(item.maxPoints);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      throw validationError(`rubricCriteria[${idx}].maxPoints must be > 0`);
    }
    sum += maxPoints;
    return {
      criterionCode,
      title: String(item.title).trim(),
      description: item.description ? String(item.description).trim() : "",
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
  const includeKey = role === "ADMIN" || role === "TEACHER" || role === "STUDENT";
  // Notice: for Student viewing OWN submission attachments, signed URLs allow safe access;
  // staff internal IDs never leak because GradedBy isn't exposed raw if Admin.
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
  const title = String(body.title).trim();

  let sessionId = null;
  if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== "") {
    assertId(body.sessionId, "Session not found", "SESSION_NOT_FOUND");
    const session = await Session.findOne({ _id: body.sessionId, classId: cls._id }).lean();
    if (!session) throw new AppError("Session does not belong to this class", "SESSION_NOT_FOUND", 404);
    sessionId = session._id;
  }

  const dueAt = parseDate(body.dueAt, "dueAt");
  const allowLateSubmission = body.allowLateSubmission !== undefined ? Boolean(body.allowLateSubmission) : true;

  const maxAttempts = body.maxAttempts !== undefined ? Number(body.maxAttempts) : 1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw validationError("maxAttempts must be an integer between 1 and 20");
  }

  const maxScore = body.maxScore !== undefined ? Number(body.maxScore) : 100;
  if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) {
    throw validationError("maxScore must be a number between 1 and 1000");
  }

  const rubricCriteria = parseRubricCriteria(body.rubricCriteria, maxScore);
  const attachments = await parseAttachments(teacherId, body.attachments);

  let status = "DRAFT";
  let publishedAt = null;
  if (body.status !== undefined) {
    const requested = String(body.status).trim().toUpperCase();
    if (!["DRAFT", "PUBLISHED"].includes(requested)) {
      throw validationError("status on create must be DRAFT or PUBLISHED");
    }
    status = requested;
    if (status === "PUBLISHED") publishedAt = new Date();
  } else if (body.publishNow === true) {
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
      description: body.description ? String(body.description).trim() : "",
      instructions: body.instructions ? String(body.instructions).trim() : "",
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

const getOwnAssignmentOrThrow = async (teacherId, assignmentId) => {
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({ _id: assignmentId, ...NOT_DELETED });
  if (!assignment) throw assignmentNotFound();
  if (String(assignment.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only manage assignments of your own classes");
  }
  return assignment;
};

const updateAssignment = async (teacherId, assignmentId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  if (assignment.status === "CLOSED") {
    throw new AppError("Closed assignment cannot be edited", "ASSIGNMENT_CLOSED", 409);
  }

  const submissionCount = await Submission.countDocuments({ assignmentId: assignment._id });
  const highestAttemptDoc = submissionCount
    ? await Submission.findOne({ assignmentId: assignment._id }).sort({ attemptNumber: -1 }).select("attemptNumber").lean()
    : null;

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    assignment.title = String(body.title).trim();
  }
  if (body.description !== undefined) {
    assignment.description = body.description ? String(body.description).trim() : "";
  }
  if (body.instructions !== undefined) {
    assignment.instructions = body.instructions ? String(body.instructions).trim() : "";
  }
  if (body.dueAt !== undefined) {
    assignment.dueAt = parseDate(body.dueAt, "dueAt");
  }
  if (body.allowLateSubmission !== undefined) {
    assignment.allowLateSubmission = Boolean(body.allowLateSubmission);
  }
  if (body.maxAttempts !== undefined) {
    const nextMaxAttempts = Number(body.maxAttempts);
    if (!Number.isInteger(nextMaxAttempts) || nextMaxAttempts < 1 || nextMaxAttempts > 20) {
      throw validationError("maxAttempts must be an integer between 1 and 20");
    }
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
    const nextMaxScore = body.maxScore !== undefined ? Number(body.maxScore) : assignment.maxScore;
    if (!Number.isFinite(nextMaxScore) || nextMaxScore < 1 || nextMaxScore > 1000) {
      throw validationError("maxScore must be a number between 1 and 1000");
    }
    assignment.maxScore = nextMaxScore;
    assignment.rubricCriteria =
      body.rubricCriteria !== undefined
        ? parseRubricCriteria(body.rubricCriteria, nextMaxScore)
        : parseRubricCriteria(assignment.rubricCriteria, nextMaxScore);
  }

  if (body.attachments !== undefined) {
    assignment.attachments = await parseAttachments(teacherId, body.attachments);
  }

  assignment.updatedBy = teacherId;
  await assignment.save();
  return presentAssignmentForTeacher(assignment);
};

const publishAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  if (assignment.status === "CLOSED") {
    throw new AppError("Closed assignment cannot be published", "ASSIGNMENT_CLOSED", 409);
  }
  if (assignment.status === "PUBLISHED") {
    return presentAssignmentForTeacher(assignment);
  }
  assignment.status = "PUBLISHED";
  assignment.publishedAt = new Date();
  assignment.updatedBy = teacherId;
  await assignment.save();
  return presentAssignmentForTeacher(assignment);
};

const closeAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  if (assignment.status === "CLOSED") {
    return presentAssignmentForTeacher(assignment);
  }
  assignment.status = "CLOSED";
  assignment.closedAt = new Date();
  assignment.updatedBy = teacherId;
  await assignment.save();
  return presentAssignmentForTeacher(assignment);
};

const deleteAssignment = async (teacherId, assignmentId) => {
  await getVerifiedTeacher(teacherId);
  const assignment = await getOwnAssignmentOrThrow(teacherId, assignmentId);
  const submissionCount = await Submission.countDocuments({ assignmentId: assignment._id });
  if (submissionCount > 0) {
    throw new AppError("Cannot delete assignment with existing submissions; close it instead", "ASSIGNMENT_HAS_SUBMISSIONS", 409);
  }
  assignment.isDeleted = true;
  assignment.deletedAt = new Date();
  assignment.deletedBy = teacherId;
  assignment.updatedBy = teacherId;
  await assignment.save();
  return { deleted: true, id: assignment._id.toString() };
};

const listTeacherAssignments = async (teacherId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const filter = { teacherId, ...NOT_DELETED };
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    await getOwnClass(teacherId, query.classId);
    filter.classId = query.classId;
  }
  if (query.status) filter.status = String(query.status).trim().toUpperCase();

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
  if (query.status) filter.status = String(query.status).trim().toLowerCase();

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
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    filter.classId = query.classId;
  }
  if (query.status) filter.status = String(query.status).trim().toUpperCase();
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
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
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
  if (query.status) {
    const target = String(query.status).trim().toLowerCase();
    presented = presented.filter((item) => item.studentStatus === target);
  }

  const total = presented.length;
  const pageItems = presented.slice(paging.skip, paging.skip + paging.pageSize);
  return paged(pageItems, total, paging);
};

const listMyAssignments = async (studentId, query = {}, paging) => {
  if (query.classId) {
    return listMyClassAssignments(studentId, query.classId, query, paging);
  }
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
  if (query.status) {
    const target = String(query.status).trim().toLowerCase();
    presented = presented.filter((item) => item.studentStatus === target);
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

  const textAnswer =
    body.textAnswer !== undefined && body.textAnswer !== null && !isBlank(body.textAnswer)
      ? String(body.textAnswer).trim()
      : null;
  const linkUrl =
    body.linkUrl !== undefined && body.linkUrl !== null && !isBlank(body.linkUrl)
      ? validateHttpUrl(body.linkUrl, "linkUrl")
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

  const now = new Date();
  const dueAt = assignment.dueAt ? new Date(assignment.dueAt) : null;
  const isLate = Boolean(dueAt && now > dueAt);
  if (isLate && !assignment.allowLateSubmission) {
    throw new AppError("Submission deadline has passed and late submissions are not allowed", "LATE_SUBMISSION_NOT_ALLOWED", 409);
  }
  const lateSeconds = isLate ? Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / 1000)) : 0;

  let created;
  let idempotentReplay = false;
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

      const latestSub = await Submission.findOne({
        assignmentId: assignment._id,
        studentId,
      })
        .sort({ attemptNumber: -1 })
        .select("attemptNumber")
        .session(dbSession);

      const nextAttemptNumber = (latestSub ? latestSub.attemptNumber : 0) + 1;
      if (nextAttemptNumber > assignment.maxAttempts) {
        throw new AppError(
          `Maximum submission attempts (${assignment.maxAttempts}) exceeded`,
          "MAX_ATTEMPTS_EXCEEDED",
          409
        );
      }

      const [sub] = await Submission.create(
        [
          {
            assignmentId: assignment._id,
            classId: assignment.classId,
            courseId: assignment.courseId,
            teacherId: assignment.teacherId,
            studentId,
            enrollmentId: enrollment._id,
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
            submittedAt: now,
            isLate,
            lateSeconds,
            status: isLate ? "late" : "submitted",
            currentScore: null,
            maxScoreSnapshot: assignment.maxScore,
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
      assignment.teacherId,
      "Bài nộp mới",
      `Lớp "${cls.className}" vừa nhận được bài nộp cho bài tập "${assignment.title}" (lần ${created.attemptNumber}).`,
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

