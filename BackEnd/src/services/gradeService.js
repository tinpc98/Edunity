const mongoose = require("mongoose");
const { Assignment, Submission, Grade, GradeHistory, Class } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { getVerifiedTeacher } = require("./teacherClassService");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const submissionNotFound = () => new AppError("Submission not found", "SUBMISSION_NOT_FOUND", 404);
const gradeNotFound = () => new AppError("Grade not found", "GRADE_NOT_FOUND", 404);

const round2 = (n) => Math.round(n * 100) / 100;

const parseGradePayload = (assignment, body = {}, { requireReason = false } = {}) => {
  const maxScore = assignment.maxScore;
  const feedback = body.feedback !== undefined && body.feedback !== null ? String(body.feedback).trim() : "";
  const reason = body.reason !== undefined && body.reason !== null ? String(body.reason).trim() : "";
  if (requireReason && isBlank(reason)) {
    throw validationError("reason is required when regrading a submission");
  }

  let rubricBreakdown = [];
  let computedScoreFromRubric = null;

  const hasConfiguredRubric = Array.isArray(assignment.rubricCriteria) && assignment.rubricCriteria.length > 0;
  if (body.rubricBreakdown !== undefined && body.rubricBreakdown !== null) {
    if (!Array.isArray(body.rubricBreakdown)) {
      throw validationError("rubricBreakdown must be an array");
    }

    if (hasConfiguredRubric && body.rubricBreakdown.length > 0) {
      const criterionMap = new Map(
        assignment.rubricCriteria.map((c) => [String(c.criterionCode).toUpperCase(), c])
      );
      const seen = new Set();
      let sum = 0;

      rubricBreakdown = body.rubricBreakdown.map((entry, idx) => {
        if (!entry || isBlank(entry.criterionCode)) {
          throw validationError(`rubricBreakdown[${idx}].criterionCode is required`);
        }
        const code = String(entry.criterionCode).trim().toUpperCase();
        const criterion = criterionMap.get(code);
        if (!criterion) {
          throw validationError(`Unknown rubric criterionCode "${code}" for this assignment`);
        }
        if (seen.has(code)) {
          throw validationError(`Duplicate criterionCode "${code}" in rubricBreakdown`);
        }
        seen.add(code);

        const itemScore = Number(entry.score);
        if (!Number.isFinite(itemScore) || itemScore < 0 || itemScore > criterion.maxPoints) {
          throw validationError(
            `rubricBreakdown[${idx}].score must be between 0 and ${criterion.maxPoints} for criterion "${code}"`
          );
        }
        const rounded = round2(itemScore);
        sum += rounded;
        return {
          criterionCode: code,
          title: criterion.title,
          score: rounded,
          maxPoints: criterion.maxPoints,
          comment: entry.comment ? String(entry.comment).trim() : "",
        };
      });

      if (seen.size !== criterionMap.size) {
        throw validationError("rubricBreakdown must cover all rubric criteria defined on the assignment");
      }
      computedScoreFromRubric = round2(sum);
    } else if (body.rubricBreakdown.length > 0) {
      // Optional ad-hoc criteria without cross-scale weights
      const seen = new Set();
      let sum = 0;
      rubricBreakdown = body.rubricBreakdown.map((entry, idx) => {
        if (!entry || isBlank(entry.title)) {
          throw validationError(`rubricBreakdown[${idx}].title is required`);
        }
        const code = !isBlank(entry.criterionCode)
          ? String(entry.criterionCode).trim().toUpperCase()
          : `CRIT_${idx + 1}`;
        if (seen.has(code)) throw validationError(`Duplicate criterionCode "${code}" in rubricBreakdown`);
        seen.add(code);

        const maxPoints = Number(entry.maxPoints);
        const itemScore = Number(entry.score);
        if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
          throw validationError(`rubricBreakdown[${idx}].maxPoints must be > 0`);
        }
        if (!Number.isFinite(itemScore) || itemScore < 0 || itemScore > maxPoints) {
          throw validationError(`rubricBreakdown[${idx}].score must be between 0 and maxPoints`);
        }
        const rounded = round2(itemScore);
        sum += rounded;
        return {
          criterionCode: code,
          title: String(entry.title).trim(),
          score: rounded,
          maxPoints: round2(maxPoints),
          comment: entry.comment ? String(entry.comment).trim() : "",
        };
      });
      computedScoreFromRubric = round2(sum);
    }
  }

  let score;
  if (body.score !== undefined && body.score !== null) {
    const num = Number(body.score);
    if (!Number.isFinite(num) || num < 0 || num > maxScore) {
      throw validationError(`score must be a finite number between 0 and ${maxScore}`);
    }
    score = round2(num);
    if (computedScoreFromRubric !== null && Math.abs(score - computedScoreFromRubric) > 1e-6) {
      throw new AppError(
        `score (${score}) must match sum of rubricBreakdown (${computedScoreFromRubric})`,
        "RUBRIC_SCORE_MISMATCH",
        400
      );
    }
  } else if (computedScoreFromRubric !== null) {
    if (computedScoreFromRubric > maxScore) {
      throw validationError(`Computed rubric score (${computedScoreFromRubric}) exceeds maxScore (${maxScore})`);
    }
    score = computedScoreFromRubric;
  } else {
    throw validationError("score or rubricBreakdown is required");
  }

  return { score, maxScore, feedback, rubricBreakdown, reason };
};

const presentHistoryForStudent = (entry) => ({
  id: entry._id.toString(),
  revisionNumber: entry.revisionNumber,
  action: entry.action,
  previousScore: entry.previousScore,
  newScore: entry.newScore,
  maxScore: entry.maxScore,
  previousFeedback: entry.previousFeedback,
  newFeedback: entry.newFeedback,
  previousRubricBreakdown: entry.previousRubricBreakdown || [],
  newRubricBreakdown: entry.newRubricBreakdown || [],
  reason: entry.reason || "",
  gradedAt: entry.gradedAt,
});

const presentGradeForStudent = (grade, history = [], teacherName = null) => ({
  id: grade._id.toString(),
  submissionId: grade.submissionId.toString(),
  assignmentId: grade.assignmentId.toString(),
  classId: grade.classId.toString(),
  teacherName,
  score: grade.score,
  maxScore: grade.maxScore,
  feedback: grade.feedback || "",
  rubricBreakdown: grade.rubricBreakdown || [],
  status: grade.status,
  revisionNumber: grade.revisionNumber,
  gradedAt: grade.gradedAt,
  lastUpdatedAt: grade.lastUpdatedAt,
  history: history.map(presentHistoryForStudent),
});

/**
 * LMS-07: Giáo viên chấm điểm lần đầu cho Submission của lớp mình phụ trách.
 */
const gradeSubmission = async (teacherId, submissionId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");

  const preSubmission = await Submission.findById(submissionId).lean();
  if (!preSubmission) throw submissionNotFound();
  if (String(preSubmission.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only grade submissions of your own classes");
  }

  const assignment = await Assignment.findOne({ _id: preSubmission.assignmentId, ...NOT_DELETED }).lean();
  if (!assignment) throw new AppError("Assignment not found", "ASSIGNMENT_NOT_FOUND", 404);

  const parsed = parseGradePayload(assignment, body, { requireReason: false });
  const now = new Date();

  let gradeDoc;
  let historyDoc;
  let updatedSubmission;

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const submission = await Submission.findById(preSubmission._id).session(dbSession);
      if (!submission) throw submissionNotFound();

      const existingGrade = await Grade.findOne({ submissionId: submission._id }).session(dbSession);
      if (existingGrade) {
        throw new AppError(
          "Submission is already graded; use regrade endpoint with a reason to update the score",
          "ALREADY_GRADED",
          409
        );
      }

      [gradeDoc] = await Grade.create(
        [
          {
            submissionId: submission._id,
            assignmentId: submission.assignmentId,
            classId: submission.classId,
            courseId: submission.courseId,
            studentId: submission.studentId,
            enrollmentId: submission.enrollmentId,
            score: parsed.score,
            maxScore: parsed.maxScore,
            feedback: parsed.feedback,
            rubricBreakdown: parsed.rubricBreakdown,
            status: "GRADED",
            revisionNumber: 1,
            gradedBy: teacherId,
            gradedAt: now,
          },
        ],
        { session: dbSession }
      );

      [historyDoc] = await GradeHistory.create(
        [
          {
            gradeId: gradeDoc._id,
            submissionId: submission._id,
            assignmentId: submission.assignmentId,
            classId: submission.classId,
            studentId: submission.studentId,
            revisionNumber: 1,
            action: "INITIAL_GRADE",
            previousScore: null,
            newScore: parsed.score,
            maxScore: parsed.maxScore,
            previousFeedback: null,
            newFeedback: parsed.feedback,
            previousRubricBreakdown: [],
            newRubricBreakdown: parsed.rubricBreakdown,
            reason: parsed.reason || "Initial grading",
            gradedBy: teacherId,
            graderRole: "TEACHER",
            gradedAt: now,
          },
        ],
        { session: dbSession }
      );

      submission.status = "graded";
      submission.currentScore = parsed.score;
      submission.maxScoreSnapshot = parsed.maxScore;
      submission.latestFeedback = parsed.feedback;
      submission.latestGradeId = gradeDoc._id;
      submission.gradedAt = now;
      submission.rubricScores = parsed.rubricBreakdown;
      await submission.save({ session: dbSession });
      updatedSubmission = submission;
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError("Submission is already graded", "ALREADY_GRADED", 409);
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  await notify(
    preSubmission.studentId,
    "Bài tập đã được chấm điểm",
    `Bài tập "${assignment.title}" của bạn đạt ${parsed.score}/${parsed.maxScore} điểm.`,
    "ASSIGNMENT_GRADED",
    { dedupeKey: `grade:${gradeDoc._id}:rev:1` }
  );

  return {
    grade: { ...gradeDoc.toObject(), id: gradeDoc._id.toString() },
    latestHistoryEntry: { ...historyDoc.toObject(), id: historyDoc._id.toString() },
    submissionStatus: updatedSubmission.status,
  };
};

/**
 * LMS-07: Sửa điểm / chấm lại bài nộp (bắt buộc reason), đồng bộ Grade + Submission + append GradeHistory.
 */
const regradeSubmission = async (teacherId, submissionId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");

  const preSubmission = await Submission.findById(submissionId).lean();
  if (!preSubmission) throw submissionNotFound();
  if (String(preSubmission.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only regrade submissions of your own classes");
  }

  const assignment = await Assignment.findOne({ _id: preSubmission.assignmentId, ...NOT_DELETED }).lean();
  if (!assignment) throw new AppError("Assignment not found", "ASSIGNMENT_NOT_FOUND", 404);

  const parsed = parseGradePayload(assignment, body, { requireReason: true });
  const now = new Date();

  let gradeDoc;
  let historyDoc;
  let updatedSubmission;

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const submission = await Submission.findById(preSubmission._id).session(dbSession);
      if (!submission) throw submissionNotFound();

      const grade = await Grade.findOne({ submissionId: submission._id }).session(dbSession);
      if (!grade) {
        throw gradeNotFound();
      }

      const nextRev = grade.revisionNumber + 1;
      const previousScore = grade.score;
      const previousFeedback = grade.feedback;
      const previousRubricBreakdown = grade.rubricBreakdown ? [...grade.rubricBreakdown] : [];

      grade.score = parsed.score;
      grade.feedback = parsed.feedback;
      grade.rubricBreakdown = parsed.rubricBreakdown;
      grade.status = "REGRADED";
      grade.revisionNumber = nextRev;
      grade.lastUpdatedBy = teacherId;
      grade.lastUpdatedAt = now;
      await grade.save({ session: dbSession });
      gradeDoc = grade;

      [historyDoc] = await GradeHistory.create(
        [
          {
            gradeId: grade._id,
            submissionId: submission._id,
            assignmentId: submission.assignmentId,
            classId: submission.classId,
            studentId: submission.studentId,
            revisionNumber: nextRev,
            action: "REGRADE",
            previousScore,
            newScore: parsed.score,
            maxScore: parsed.maxScore,
            previousFeedback,
            newFeedback: parsed.feedback,
            previousRubricBreakdown,
            newRubricBreakdown: parsed.rubricBreakdown,
            reason: parsed.reason,
            gradedBy: teacherId,
            graderRole: "TEACHER",
            gradedAt: now,
          },
        ],
        { session: dbSession }
      );

      submission.status = "graded";
      submission.currentScore = parsed.score;
      submission.maxScoreSnapshot = parsed.maxScore;
      submission.latestFeedback = parsed.feedback;
      submission.latestGradeId = grade._id;
      submission.gradedAt = now;
      submission.rubricScores = parsed.rubricBreakdown;
      await submission.save({ session: dbSession });
      updatedSubmission = submission;
    });
  } finally {
    await dbSession.endSession();
  }

  await notify(
    preSubmission.studentId,
    "Điểm bài tập đã được cập nhật",
    `Bài tập "${assignment.title}" đã được chấm lại: ${parsed.score}/${parsed.maxScore} điểm.`,
    "ASSIGNMENT_REGRADED",
    { dedupeKey: `grade:${gradeDoc._id}:rev:${gradeDoc.revisionNumber}` }
  );

  return {
    grade: { ...gradeDoc.toObject(), id: gradeDoc._id.toString() },
    latestHistoryEntry: { ...historyDoc.toObject(), id: historyDoc._id.toString() },
    submissionStatus: updatedSubmission.status,
  };
};

const getTeacherSubmissionGradeHistory = async (teacherId, submissionId) => {
  await getVerifiedTeacher(teacherId);
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");
  const sub = await Submission.findById(submissionId).lean();
  if (!sub) throw submissionNotFound();
  if (String(sub.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only view grade history for your own classes");
  }

  const grade = await Grade.findOne({ submissionId: sub._id }).lean();
  const history = await GradeHistory.find({ submissionId: sub._id }).sort({ revisionNumber: 1 }).lean();
  return {
    submissionId: sub._id.toString(),
    grade: grade ? { ...grade, id: grade._id.toString() } : null,
    history: history.map((h) => ({ ...h, id: h._id.toString() })),
  };
};

const listTeacherAssignmentGrades = async (teacherId, assignmentId, paging) => {
  await getVerifiedTeacher(teacherId);
  assertId(assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
  const assignment = await Assignment.findOne({ _id: assignmentId, ...NOT_DELETED }).lean();
  if (!assignment) throw new AppError("Assignment not found", "ASSIGNMENT_NOT_FOUND", 404);
  if (String(assignment.teacherId) !== String(teacherId)) {
    throw FORBIDDEN("You can only view grades for your own classes");
  }

  const filter = { assignmentId: assignment._id };
  const [items, total] = await Promise.all([
    Grade.find(filter).sort({ gradedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Grade.countDocuments(filter),
  ]);
  return paged(items.map((g) => ({ ...g, id: g._id.toString() })), total, paging);
};

const adminGetSubmissionGradeHistory = async (submissionId) => {
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");
  const sub = await Submission.findById(submissionId).lean();
  if (!sub) throw submissionNotFound();

  const grade = await Grade.findOne({ submissionId: sub._id }).lean();
  const history = await GradeHistory.find({ submissionId: sub._id }).sort({ revisionNumber: 1 }).lean();
  return {
    submissionId: sub._id.toString(),
    grade: grade ? { ...grade, id: grade._id.toString() } : null,
    history: history.map((h) => ({ ...h, id: h._id.toString() })),
  };
};

const adminListGradeHistory = async (query = {}, paging) => {
  const filter = {};
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    filter.classId = query.classId;
  }
  if (query.assignmentId) {
    assertId(query.assignmentId, "Assignment not found", "ASSIGNMENT_NOT_FOUND");
    filter.assignmentId = query.assignmentId;
  }
  if (query.studentId) {
    assertId(query.studentId, "Student not found", "NOT_FOUND");
    filter.studentId = query.studentId;
  }

  const [items, total] = await Promise.all([
    GradeHistory.find(filter).sort({ gradedAt: -1, revisionNumber: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    GradeHistory.countDocuments(filter),
  ]);
  return paged(items.map((h) => ({ ...h, id: h._id.toString() })), total, paging);
};

const getMySubmissionGrade = async (studentId, submissionId) => {
  assertId(submissionId, "Submission not found", "SUBMISSION_NOT_FOUND");
  const sub = await Submission.findOne({ _id: submissionId, studentId }).lean();
  if (!sub) throw submissionNotFound();

  const grade = await Grade.findOne({ submissionId: sub._id, studentId }).lean();
  if (!grade) {
    return {
      submissionId: sub._id.toString(),
      status: sub.status,
      grade: null,
    };
  }

  const [history, cls] = await Promise.all([
    GradeHistory.find({ submissionId: sub._id, studentId }).sort({ revisionNumber: 1 }).lean(),
    Class.findById(sub.classId).select("teacherName").lean(),
  ]);

  return {
    submissionId: sub._id.toString(),
    status: sub.status,
    grade: presentGradeForStudent(grade, history, cls ? cls.teacherName : null),
  };
};

const listMyGrades = async (studentId, query = {}, paging) => {
  const filter = { studentId };
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    filter.classId = query.classId;
  }

  const [grades, total] = await Promise.all([
    Grade.find(filter).sort({ gradedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Grade.countDocuments(filter),
  ]);

  const classIds = [...new Set(grades.map((g) => g.classId))];
  const classes = classIds.length ? await Class.find({ _id: { $in: classIds } }).select("teacherName className").lean() : [];
  const classMap = new Map(classes.map((c) => [c._id.toString(), c]));

  return paged(
    grades.map((g) => {
      const cls = classMap.get(g.classId.toString());
      return {
        ...presentGradeForStudent(g, [], cls ? cls.teacherName : null),
        className: cls ? cls.className : null,
      };
    }),
    total,
    paging
  );
};

module.exports = {
  gradeSubmission,
  regradeSubmission,
  getTeacherSubmissionGradeHistory,
  listTeacherAssignmentGrades,
  adminGetSubmissionGradeHistory,
  adminListGradeHistory,
  getMySubmissionGrade,
  listMyGrades,
};

