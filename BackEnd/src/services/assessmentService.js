const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  Assessment,
  Question,
  Attempt,
  Course,
  Class,
  Session,
  Subject,
  Enrollment,
  TeacherSubjectAuthorization,
} = require("../models");
const {
  ASSESSMENT_PURPOSES,
  ASSESSMENT_SCOPES,
  ASSESSMENT_STATUSES,
  QUESTION_TYPES,
  COURSE_LEVELS,
  GRADE_LEVELS,
} = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, parseDate, isBlank } = require("../utils/http");
const { getVerifiedTeacher } = require("./teacherClassService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const assessmentNotFound = () => new AppError("Assessment not found", "ASSESSMENT_NOT_FOUND", 404);
const questionNotFound = () => new AppError("Question not found", "QUESTION_NOT_FOUND", 404);
const attemptNotFound = () => new AppError("Attempt not found", "ATTEMPT_NOT_FOUND", 404);

const round2 = (n) => Math.round(n * 100) / 100;

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};

const normalizeIdempotencyKey = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw validationError("Idempotency-Key must be a non-empty string");
  }
  const key = raw.trim();
  if (key.length > 128) throw validationError("Idempotency-Key must not exceed 128 characters");
  return key;
};

const parsePlacementConfig = (rawConfig) => {
  if (rawConfig === undefined || rawConfig === null) {
    return { bands: [], recommendedCourseIds: [], autoRecommendCourses: true };
  }
  if (typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw validationError("placementConfig must be an object");
  }
  const bandsRaw = rawConfig.bands === undefined ? [] : rawConfig.bands;
  if (!Array.isArray(bandsRaw)) throw validationError("placementConfig.bands must be an array");

  const bands = bandsRaw.map((band, idx) => {
    const minPercentage = Number(band && band.minPercentage);
    const maxPercentage = Number(band && band.maxPercentage);
    const recommendedLevel = band && band.recommendedLevel ? String(band.recommendedLevel).trim().toUpperCase() : "";
    if (!Number.isFinite(minPercentage) || !Number.isFinite(maxPercentage) || minPercentage < 0 || maxPercentage > 100 || minPercentage > maxPercentage) {
      throw validationError(`placementConfig.bands[${idx}] minPercentage/maxPercentage must satisfy 0 <= min <= max <= 100`);
    }
    if (!COURSE_LEVELS.includes(recommendedLevel)) {
      throw validationError(`placementConfig.bands[${idx}].recommendedLevel must be one of ${COURSE_LEVELS.join(", ")}`);
    }
    return {
      minPercentage: round2(minPercentage),
      maxPercentage: round2(maxPercentage),
      recommendedLevel,
      summary: band.summary ? String(band.summary).trim() : "",
    };
  });

  // Ensure bands do not overlap
  const sorted = [...bands].sort((a, b) => a.minPercentage - b.minPercentage);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPercentage <= sorted[i - 1].maxPercentage) {
      throw validationError("placementConfig.bands ranges must not overlap");
    }
  }

  let recommendedCourseIds = [];
  if (rawConfig.recommendedCourseIds !== undefined && rawConfig.recommendedCourseIds !== null) {
    if (!Array.isArray(rawConfig.recommendedCourseIds)) {
      throw validationError("placementConfig.recommendedCourseIds must be an array");
    }
    recommendedCourseIds = rawConfig.recommendedCourseIds.map((id) => {
      assertId(id, "Course not found", "COURSE_NOT_FOUND");
      return id;
    });
  }

  return {
    bands: sorted,
    recommendedCourseIds,
    autoRecommendCourses: rawConfig.autoRecommendCourses !== undefined ? Boolean(rawConfig.autoRecommendCourses) : true,
  };
};

const presentQuestionForStudent = (q) => ({
  id: (q._id || q.questionId).toString(),
  questionOrder: q.questionOrder,
  questionType: q.questionType,
  prompt: q.prompt,
  options: (q.options || []).map((o) => ({ optionId: o.optionId, text: o.text })),
  points: q.points,
});

const presentQuestionForStaff = (q) => ({
  ...q,
  id: q._id ? q._id.toString() : q.id,
});

const presentAssessmentForStudent = (assessment, questions = []) => ({
  id: assessment._id.toString(),
  title: assessment.title,
  description: assessment.description || "",
  instructions: assessment.instructions || "",
  purpose: assessment.purpose,
  scopeType: assessment.scopeType,
  courseId: assessment.courseId ? assessment.courseId.toString() : null,
  classId: assessment.classId ? assessment.classId.toString() : null,
  sessionId: assessment.sessionId ? assessment.sessionId.toString() : null,
  subjectId: assessment.subjectId ? assessment.subjectId.toString() : null,
  gradeLevel: assessment.gradeLevel || null,
  targetCourseLevels: assessment.targetCourseLevels || [],
  status: assessment.status,
  timeLimitMinutes: assessment.timeLimitMinutes ?? null,
  maxAttempts: assessment.maxAttempts,
  totalMaxScore: assessment.totalMaxScore,
  passingScore: assessment.passingScore ?? null,
  gradingMode: assessment.gradingMode,
  showResultImmediately: Boolean(assessment.showResultImmediately),
  availableFrom: assessment.availableFrom || null,
  availableUntil: assessment.availableUntil || null,
  questions: questions.map(presentQuestionForStudent),
});

const presentAttemptForStudent = (attempt, assessment = null) => {
  const showDetail =
    attempt.status !== "IN_PROGRESS" &&
    attempt.status !== "EXPIRED" &&
    (attempt.status === "GRADED" || (assessment ? assessment.showResultImmediately : true));

  return {
    id: attempt._id.toString(),
    assessmentId: attempt.assessmentId.toString(),
    purpose: attempt.purpose,
    classId: attempt.classId ? attempt.classId.toString() : null,
    courseId: attempt.courseId ? attempt.courseId.toString() : null,
    sessionId: attempt.sessionId ? attempt.sessionId.toString() : null,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    gradingStatus: attempt.gradingStatus,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    questionSnapshots: (attempt.questionSnapshots || []).map((q) => ({
      questionId: q.questionId.toString(),
      questionOrder: q.questionOrder,
      questionType: q.questionType,
      prompt: q.prompt,
      options: q.options || [],
      points: q.points,
    })),
    answers: (attempt.answers || []).map((a) => ({
      questionId: a.questionId.toString(),
      selectedOptionIds: a.selectedOptionIds || [],
      textAnswer: a.textAnswer || null,
      ...(showDetail
        ? {
            awardedPoints: a.awardedPoints,
            maxPoints: a.maxPoints,
            isCorrect: a.isCorrect,
            requiresManualGrading: Boolean(a.requiresManualGrading),
            graderComment: a.graderComment || "",
          }
        : {}),
    })),
    ...(showDetail
      ? {
          autoScore: attempt.autoScore,
          manualScore: attempt.manualScore,
          totalScore: attempt.totalScore,
          maxScoreSnapshot: attempt.maxScoreSnapshot,
          percentage: attempt.percentage,
          passed: attempt.passed,
          gradedAt: attempt.gradedAt,
          feedback: attempt.feedback || "",
        }
      : {
          maxScoreSnapshot: attempt.maxScoreSnapshot,
          feedback: attempt.status === "EXPIRED" ? attempt.feedback || "" : "",
        }),
  };
};

const resolveAssessmentScope = async (actor, body = {}, existing = null) => {
  const purpose = (body.purpose !== undefined ? String(body.purpose) : existing?.purpose || "QUIZ").trim().toUpperCase();
  if (!ASSESSMENT_PURPOSES.includes(purpose)) {
    throw validationError(`purpose must be one of ${ASSESSMENT_PURPOSES.join(", ")}`);
  }

  const defaultScope = purpose === "PLACEMENT" ? "GLOBAL_PLACEMENT" : "CLASS";
  const scopeType = (body.scopeType !== undefined ? String(body.scopeType) : existing?.scopeType || defaultScope)
    .trim()
    .toUpperCase();
  if (!ASSESSMENT_SCOPES.includes(scopeType)) {
    throw validationError(`scopeType must be one of ${ASSESSMENT_SCOPES.join(", ")}`);
  }

  if (actor.role === "TEACHER") {
    await getVerifiedTeacher(actor.id);
    if (purpose === "PLACEMENT") {
      throw FORBIDDEN("Teachers cannot create or manage PLACEMENT assessments");
    }
    if (!["CLASS", "SESSION"].includes(scopeType)) {
      throw FORBIDDEN("Teachers can only manage assessments scoped to their own CLASS or SESSION");
    }
  }

  let courseId = body.courseId !== undefined ? body.courseId : existing?.courseId || null;
  let classId = body.classId !== undefined ? body.classId : existing?.classId || null;
  let sessionId = body.sessionId !== undefined ? body.sessionId : existing?.sessionId || null;
  let subjectId = body.subjectId !== undefined ? body.subjectId : existing?.subjectId || null;
  let gradeLevel = body.gradeLevel !== undefined ? body.gradeLevel : existing?.gradeLevel || null;
  let teacherId = existing?.teacherId || null;

  if (scopeType === "CLASS") {
    if (!classId) throw validationError("classId is required when scopeType is CLASS");
    assertId(classId, "Class not found", "CLASS_NOT_FOUND");
    const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (actor.role === "TEACHER" && String(cls.teacherId) !== String(actor.id)) {
      throw FORBIDDEN("You can only manage assessments of your own classes");
    }
    classId = cls._id;
    courseId = cls.courseId;
    teacherId = cls.teacherId;
    subjectId = subjectId || cls.subjectId;
    gradeLevel = gradeLevel || cls.gradeLevel || null;
    sessionId = null;
  } else if (scopeType === "SESSION") {
    if (!sessionId) throw validationError("sessionId is required when scopeType is SESSION");
    assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
    const session = await Session.findById(sessionId).lean();
    if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    const cls = await Class.findOne({ _id: session.classId, ...NOT_DELETED }).lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (actor.role === "TEACHER" && String(cls.teacherId) !== String(actor.id)) {
      throw FORBIDDEN("You can only manage assessments of your own classes");
    }
    sessionId = session._id;
    classId = cls._id;
    courseId = cls.courseId;
    teacherId = cls.teacherId;
    subjectId = subjectId || cls.subjectId;
    gradeLevel = gradeLevel || cls.gradeLevel || null;
  } else if (scopeType === "COURSE") {
    if (!courseId) throw validationError("courseId is required when scopeType is COURSE");
    assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
    const course = await Course.findOne({ _id: courseId, ...NOT_DELETED }).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    courseId = course._id;
    subjectId = subjectId || course.subjectId;
    gradeLevel = gradeLevel || course.gradeLevel || null;
    classId = null;
    sessionId = null;
    teacherId = null;
  } else {
    // GLOBAL_PLACEMENT
    classId = null;
    sessionId = null;
    teacherId = null;
    if (courseId) {
      assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
      const course = await Course.findOne({ _id: courseId, ...NOT_DELETED }).lean();
      if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
      courseId = course._id;
      subjectId = subjectId || course.subjectId;
      gradeLevel = gradeLevel || course.gradeLevel || null;
    }
  }

  if (subjectId) {
    assertId(subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    const subject = await Subject.findOne({ _id: subjectId, ...NOT_DELETED }).lean();
    if (!subject) throw new AppError("Subject not found", "SUBJECT_NOT_FOUND", 404);
    subjectId = subject._id;
  }

  if (gradeLevel !== null && gradeLevel !== undefined && gradeLevel !== "") {
    gradeLevel = String(gradeLevel).trim().toUpperCase();
    if (!GRADE_LEVELS.includes(gradeLevel)) {
      throw new AppError(`gradeLevel must be one of ${GRADE_LEVELS.join(", ")}`, "INVALID_GRADE_LEVEL", 400);
    }
  } else {
    gradeLevel = null;
  }

  let targetCourseLevels = existing?.targetCourseLevels || [];
  if (body.targetCourseLevels !== undefined) {
    if (!Array.isArray(body.targetCourseLevels)) {
      throw validationError("targetCourseLevels must be an array");
    }
    targetCourseLevels = [...new Set(body.targetCourseLevels.map((l) => String(l).trim().toUpperCase()))];
    for (const lvl of targetCourseLevels) {
      if (!COURSE_LEVELS.includes(lvl)) {
        throw validationError(`targetCourseLevels contains invalid level "${lvl}"`);
      }
    }
  }

  return { purpose, scopeType, courseId, classId, sessionId, teacherId, subjectId, gradeLevel, targetCourseLevels };
};

const syncAssessmentMetadataFromQuestions = async (assessment, dbSession = null) => {
  const q = Question.find({ assessmentId: assessment._id, ...NOT_DELETED }).sort({ questionOrder: 1 });
  if (dbSession) q.session(dbSession);
  const questions = await q.lean();

  const totalMaxScore = round2(questions.reduce((acc, item) => acc + Number(item.points || 0), 0));
  const hasAuto = questions.some(
    (item) =>
      ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(item.questionType) ||
      (item.questionType === "SHORT_TEXT" && Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length > 0)
  );
  const hasManual = questions.some(
    (item) =>
      item.questionType === "ESSAY" ||
      (item.questionType === "SHORT_TEXT" && (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0))
  );

  let gradingMode = "AUTO";
  if (hasAuto && hasManual) gradingMode = "MIXED";
  else if (!hasAuto && hasManual) gradingMode = "MANUAL";

  assessment.totalMaxScore = totalMaxScore;
  assessment.gradingMode = gradingMode;
  await assessment.save(dbSession ? { session: dbSession } : undefined);
  return { totalMaxScore, gradingMode, questionCount: questions.length };
};

const assertManageableAssessment = async (actor, assessmentId) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can manage assessments");
  }
  assertId(assessmentId, "Assessment not found", "ASSESSMENT_NOT_FOUND");
  const assessment = await Assessment.findOne({ _id: assessmentId, ...NOT_DELETED });
  if (!assessment) throw assessmentNotFound();

  if (actor.role === "TEACHER") {
    await getVerifiedTeacher(actor.id);
    if (assessment.purpose === "PLACEMENT" || !["CLASS", "SESSION"].includes(assessment.scopeType)) {
      throw FORBIDDEN("Teachers can only manage assessments for their own classes");
    }
    if (!assessment.teacherId || String(assessment.teacherId) !== String(actor.id)) {
      throw FORBIDDEN("You can only manage assessments of your own classes");
    }
  }
  return assessment;
};

const createAssessment = async (actor, body = {}) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can create assessments");
  }
  if (isBlank(body.title)) throw validationError("title is required");

  const scope = await resolveAssessmentScope(actor, body);
  const timeLimitMinutes =
    body.timeLimitMinutes !== undefined && body.timeLimitMinutes !== null && body.timeLimitMinutes !== ""
      ? Number(body.timeLimitMinutes)
      : null;
  if (timeLimitMinutes !== null && (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 300)) {
    throw validationError("timeLimitMinutes must be an integer between 1 and 300");
  }

  const maxAttempts = body.maxAttempts !== undefined ? Number(body.maxAttempts) : 1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw validationError("maxAttempts must be an integer between 1 and 20");
  }

  const passingScore =
    body.passingScore !== undefined && body.passingScore !== null && body.passingScore !== ""
      ? Number(body.passingScore)
      : null;
  if (passingScore !== null && (!Number.isFinite(passingScore) || passingScore < 0)) {
    throw validationError("passingScore must be >= 0");
  }

  const availableFrom = parseDate(body.availableFrom, "availableFrom");
  const availableUntil = parseDate(body.availableUntil, "availableUntil");
  if (availableFrom && availableUntil && availableFrom >= availableUntil) {
    throw validationError("availableFrom must be before availableUntil");
  }

  const placementConfig = parsePlacementConfig(body.placementConfig);

  const [created] = await Assessment.create([
    {
      title: String(body.title).trim(),
      description: body.description ? String(body.description).trim() : "",
      instructions: body.instructions ? String(body.instructions).trim() : "",
      ...scope,
      status: "DRAFT",
      timeLimitMinutes,
      maxAttempts,
      totalMaxScore: 0,
      passingScore,
      gradingMode: "AUTO",
      shuffleQuestions: Boolean(body.shuffleQuestions),
      showResultImmediately: body.showResultImmediately !== undefined ? Boolean(body.showResultImmediately) : true,
      availableFrom,
      availableUntil,
      placementConfig,
      createdBy: actor.id,
    },
  ]);

  if (actor.role === "ADMIN") {
    await audit({
      actorAdminId: actor.id,
      action: "ASSESSMENT_CREATE",
      targetType: "Assessment",
      targetId: created._id,
      beforeState: null,
      afterState: { title: created.title, purpose: created.purpose, scopeType: created.scopeType, status: created.status },
    });
  }

  return { ...created.toObject(), id: created._id.toString() };
};

const updateAssessment = async (actor, assessmentId, body = {}) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status !== "DRAFT") {
    throw new AppError("Only DRAFT assessments can be modified", "ASSESSMENT_NOT_EDITABLE", 409);
  }

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    assessment.title = String(body.title).trim();
  }
  if (body.description !== undefined) assessment.description = body.description ? String(body.description).trim() : "";
  if (body.instructions !== undefined) assessment.instructions = body.instructions ? String(body.instructions).trim() : "";

  if (
    body.purpose !== undefined ||
    body.scopeType !== undefined ||
    body.courseId !== undefined ||
    body.classId !== undefined ||
    body.sessionId !== undefined ||
    body.subjectId !== undefined ||
    body.gradeLevel !== undefined ||
    body.targetCourseLevels !== undefined
  ) {
    const scope = await resolveAssessmentScope(actor, body, assessment);
    Object.assign(assessment, scope);
  }

  if (body.timeLimitMinutes !== undefined) {
    const val = body.timeLimitMinutes === null || body.timeLimitMinutes === "" ? null : Number(body.timeLimitMinutes);
    if (val !== null && (!Number.isInteger(val) || val < 1 || val > 300)) {
      throw validationError("timeLimitMinutes must be an integer between 1 and 300");
    }
    assessment.timeLimitMinutes = val;
  }
  if (body.maxAttempts !== undefined) {
    const val = Number(body.maxAttempts);
    if (!Number.isInteger(val) || val < 1 || val > 20) {
      throw validationError("maxAttempts must be an integer between 1 and 20");
    }
    assessment.maxAttempts = val;
  }
  if (body.passingScore !== undefined) {
    const val = body.passingScore === null || body.passingScore === "" ? null : Number(body.passingScore);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      throw validationError("passingScore must be >= 0");
    }
    assessment.passingScore = val;
  }
  if (body.shuffleQuestions !== undefined) assessment.shuffleQuestions = Boolean(body.shuffleQuestions);
  if (body.showResultImmediately !== undefined) assessment.showResultImmediately = Boolean(body.showResultImmediately);
  if (body.availableFrom !== undefined) assessment.availableFrom = parseDate(body.availableFrom, "availableFrom");
  if (body.availableUntil !== undefined) assessment.availableUntil = parseDate(body.availableUntil, "availableUntil");
  if (assessment.availableFrom && assessment.availableUntil && assessment.availableFrom >= assessment.availableUntil) {
    throw validationError("availableFrom must be before availableUntil");
  }
  if (body.placementConfig !== undefined) {
    assessment.placementConfig = parsePlacementConfig(body.placementConfig);
  }

  assessment.updatedBy = actor.id;
  await assessment.save();
  return { ...assessment.toObject(), id: assessment._id.toString() };
};

const parseQuestionPayload = (body = {}, defaultOrder = 1, existing = null) => {
  const questionType = (body.questionType !== undefined ? String(body.questionType) : existing?.questionType || "")
    .trim()
    .toUpperCase();
  if (!QUESTION_TYPES.includes(questionType)) {
    throw validationError(`questionType must be one of ${QUESTION_TYPES.join(", ")}`);
  }

  const promptRaw = body.prompt !== undefined ? body.prompt : existing?.prompt;
  if (isBlank(promptRaw)) throw validationError("prompt is required");
  const prompt = String(promptRaw).trim();

  const questionOrder =
    body.questionOrder !== undefined ? Number(body.questionOrder) : existing?.questionOrder || defaultOrder;
  if (!Number.isInteger(questionOrder) || questionOrder < 1) {
    throw validationError("questionOrder must be an integer >= 1");
  }

  const pointsRaw = body.points !== undefined ? body.points : existing?.points ?? 1;
  const points = Number(pointsRaw);
  if (!Number.isFinite(points) || points < 0.5 || points > 1000) {
    throw validationError("points must be a number between 0.5 and 1000");
  }

  let options = [];
  let correctOptionIds = [];
  let acceptedAnswers = [];
  const caseSensitive =
    body.caseSensitive !== undefined ? Boolean(body.caseSensitive) : Boolean(existing?.caseSensitive);

  if (["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType)) {
    const rawOptions = body.options !== undefined ? body.options : existing?.options || [];
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      throw validationError(`${questionType} requires at least 2 options`);
    }
    const seenOptionIds = new Set();
    options = rawOptions.map((opt, idx) => {
      if (!opt || isBlank(opt.optionId) || isBlank(opt.text)) {
        throw validationError(`options[${idx}] requires non-empty optionId and text`);
      }
      const optionId = String(opt.optionId).trim();
      if (seenOptionIds.has(optionId)) {
        throw validationError(`Duplicate optionId "${optionId}" in options`);
      }
      seenOptionIds.add(optionId);
      return { optionId, text: String(opt.text).trim() };
    });

    const rawCorrect = body.correctOptionIds !== undefined ? body.correctOptionIds : existing?.correctOptionIds || [];
    if (!Array.isArray(rawCorrect) || rawCorrect.length === 0) {
      throw validationError(`${questionType} requires correctOptionIds`);
    }
    correctOptionIds = [...new Set(rawCorrect.map((id) => String(id).trim()))];
    for (const cid of correctOptionIds) {
      if (!seenOptionIds.has(cid)) {
        throw validationError(`correctOptionId "${cid}" does not match any optionId`);
      }
    }
    if ((questionType === "SINGLE_CHOICE" || questionType === "TRUE_FALSE") && correctOptionIds.length !== 1) {
      throw validationError(`${questionType} requires exactly 1 correctOptionId`);
    }
  } else if (questionType === "SHORT_TEXT") {
    const rawAccepted = body.acceptedAnswers !== undefined ? body.acceptedAnswers : existing?.acceptedAnswers || [];
    if (!Array.isArray(rawAccepted)) throw validationError("acceptedAnswers must be an array");
    acceptedAnswers = rawAccepted.map((ans) => String(ans).trim()).filter((ans) => ans !== "");
  }

  const explanation =
    body.explanation !== undefined ? (body.explanation ? String(body.explanation).trim() : "") : existing?.explanation || "";
  const tags =
    body.tags !== undefined && Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : existing?.tags || [];

  return {
    questionOrder,
    questionType,
    prompt,
    options,
    correctOptionIds,
    acceptedAnswers,
    caseSensitive,
    points: round2(points),
    explanation,
    tags,
  };
};

const addQuestion = async (actor, assessmentId, body = {}) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status !== "DRAFT") {
    throw new AppError("Questions can only be added while assessment is DRAFT", "ASSESSMENT_NOT_EDITABLE", 409);
  }

  const maxOrderDoc = await Question.findOne({ assessmentId: assessment._id, ...NOT_DELETED })
    .sort({ questionOrder: -1 })
    .select("questionOrder")
    .lean();
  const defaultOrder = (maxOrderDoc ? maxOrderDoc.questionOrder : 0) + 1;
  const parsed = parseQuestionPayload(body, defaultOrder);

  let question;
  try {
    [question] = await Question.create([
      {
        assessmentId: assessment._id,
        ...parsed,
        createdBy: actor.id,
      },
    ]);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(`questionOrder ${parsed.questionOrder} is already in use in this assessment`, "DUPLICATE_QUESTION_ORDER", 409);
    }
    throw err;
  }

  await syncAssessmentMetadataFromQuestions(assessment);
  return presentQuestionForStaff(question.toObject());
};

const updateQuestion = async (actor, assessmentId, questionId, body = {}) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status !== "DRAFT") {
    throw new AppError("Questions can only be modified while assessment is DRAFT", "ASSESSMENT_NOT_EDITABLE", 409);
  }
  assertId(questionId, "Question not found", "QUESTION_NOT_FOUND");
  const question = await Question.findOne({ _id: questionId, assessmentId: assessment._id, ...NOT_DELETED });
  if (!question) throw questionNotFound();

  const parsed = parseQuestionPayload(body, question.questionOrder, question);
  Object.assign(question, parsed);
  question.updatedBy = actor.id;

  try {
    await question.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(`questionOrder ${parsed.questionOrder} is already in use`, "DUPLICATE_QUESTION_ORDER", 409);
    }
    throw err;
  }

  await syncAssessmentMetadataFromQuestions(assessment);
  return presentQuestionForStaff(question.toObject());
};

const deleteQuestion = async (actor, assessmentId, questionId) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status !== "DRAFT") {
    throw new AppError("Questions can only be removed while assessment is DRAFT", "ASSESSMENT_NOT_EDITABLE", 409);
  }
  assertId(questionId, "Question not found", "QUESTION_NOT_FOUND");
  const question = await Question.findOne({ _id: questionId, assessmentId: assessment._id, ...NOT_DELETED });
  if (!question) throw questionNotFound();

  question.isDeleted = true;
  question.deletedAt = new Date();
  question.deletedBy = actor.id;
  question.updatedBy = actor.id;
  await question.save();

  await syncAssessmentMetadataFromQuestions(assessment);
  return { deleted: true, id: question._id.toString() };
};

const publishAssessment = async (actor, assessmentId) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status === "ARCHIVED") {
    throw new AppError("Archived assessment cannot be published", "ASSESSMENT_ARCHIVED", 409);
  }
  if (assessment.status === "PUBLISHED") {
    return { ...assessment.toObject(), id: assessment._id.toString() };
  }

  const { totalMaxScore, questionCount } = await syncAssessmentMetadataFromQuestions(assessment);
  if (questionCount === 0 || totalMaxScore <= 0) {
    throw validationError("Assessment must have at least one active question before publishing");
  }
  if (assessment.passingScore !== null && assessment.passingScore > totalMaxScore) {
    throw validationError(`passingScore (${assessment.passingScore}) cannot exceed totalMaxScore (${totalMaxScore})`);
  }
  if (assessment.purpose === "PLACEMENT") {
    const bands = assessment.placementConfig && assessment.placementConfig.bands;
    if (!Array.isArray(bands) || bands.length === 0) {
      throw validationError("PLACEMENT assessment requires at least one placementConfig.bands entry before publishing");
    }
  }

  assessment.status = "PUBLISHED";
  assessment.publishedAt = new Date();
  assessment.publishedBy = actor.id;
  assessment.updatedBy = actor.id;
  await assessment.save();

  if (actor.role === "ADMIN") {
    await audit({
      actorAdminId: actor.id,
      action: "ASSESSMENT_PUBLISH",
      targetType: "Assessment",
      targetId: assessment._id,
      beforeState: { status: "DRAFT" },
      afterState: { status: "PUBLISHED", totalMaxScore },
    });
  }

  return { ...assessment.toObject(), id: assessment._id.toString() };
};

const archiveAssessment = async (actor, assessmentId) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  if (assessment.status === "ARCHIVED") {
    return { ...assessment.toObject(), id: assessment._id.toString() };
  }
  const prev = assessment.status;
  assessment.status = "ARCHIVED";
  assessment.archivedAt = new Date();
  assessment.archivedBy = actor.id;
  assessment.updatedBy = actor.id;
  await assessment.save();

  if (actor.role === "ADMIN") {
    await audit({
      actorAdminId: actor.id,
      action: "ASSESSMENT_ARCHIVE",
      targetType: "Assessment",
      targetId: assessment._id,
      beforeState: { status: prev },
      afterState: { status: "ARCHIVED" },
    });
  }
  return { ...assessment.toObject(), id: assessment._id.toString() };
};

const listStaffAssessments = async (actor, query = {}, paging) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can list staff assessments");
  }
  const filter = { ...NOT_DELETED };
  if (actor.role === "TEACHER") {
    await getVerifiedTeacher(actor.id);
    filter.teacherId = actor.id;
    filter.scopeType = { $in: ["CLASS", "SESSION"] };
  } else {
    if (query.scopeType) filter.scopeType = String(query.scopeType).trim().toUpperCase();
  }
  if (query.purpose) filter.purpose = String(query.purpose).trim().toUpperCase();
  if (query.status) filter.status = String(query.status).trim().toUpperCase();
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    filter.classId = query.classId;
  }

  const [items, total] = await Promise.all([
    Assessment.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Assessment.countDocuments(filter),
  ]);
  return paged(items.map((a) => ({ ...a, id: a._id.toString() })), total, paging);
};

const getStaffAssessment = async (actor, assessmentId) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  const questions = await Question.find({ assessmentId: assessment._id, ...NOT_DELETED })
    .sort({ questionOrder: 1 })
    .lean();
  return {
    ...assessment.toObject(),
    id: assessment._id.toString(),
    questions: questions.map(presentQuestionForStaff),
  };
};

const listStaffAssessmentAttempts = async (actor, assessmentId, query = {}, paging) => {
  const assessment = await assertManageableAssessment(actor, assessmentId);
  const filter = { assessmentId: assessment._id };
  if (query.status) filter.status = String(query.status).trim().toUpperCase();
  if (query.gradingStatus) filter.gradingStatus = String(query.gradingStatus).trim().toUpperCase();

  const [items, total] = await Promise.all([
    Attempt.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Attempt.countDocuments(filter),
  ]);
  return paged(items.map((a) => ({ ...a, id: a._id.toString() })), total, paging);
};

// ---------- Student Eligibility & Taking Attempts ----------

const verifyStudentAssessmentEligibility = async (studentId, assessment) => {
  if (assessment.scopeType === "GLOBAL_PLACEMENT") {
    return { enrollmentId: null };
  }
  if (assessment.scopeType === "CLASS" || assessment.scopeType === "SESSION") {
    const enrollment = await Enrollment.findOne({
      studentId,
      classId: assessment.classId,
      enrollmentStatus: "CONFIRMED",
    })
      .select("_id")
      .lean();
    if (!enrollment) {
      throw new AppError("Active confirmed enrollment in this class is required", "NOT_ENROLLED", 403);
    }
    return { enrollmentId: enrollment._id };
  }
  if (assessment.scopeType === "COURSE") {
    const classes = await Class.find({ courseId: assessment.courseId, ...NOT_DELETED }).select("_id").lean();
    const classIds = classes.map((c) => c._id);
    const enrollment = classIds.length
      ? await Enrollment.findOne({
          studentId,
          classId: { $in: classIds },
          enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
        })
          .select("_id")
          .lean()
      : null;
    if (!enrollment) {
      throw new AppError("Enrollment in a class of this course is required", "NOT_ENROLLED", 403);
    }
    return { enrollmentId: enrollment._id };
  }
  throw FORBIDDEN("Invalid assessment scope");
};

const listMyAssessments = async (studentId, query = {}, paging) => {
  const enrollments = await Enrollment.find({
    studentId,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  })
    .select("classId courseId enrollmentStatus")
    .lean();

  const confirmedClassIds = enrollments.filter((e) => e.enrollmentStatus === "CONFIRMED").map((e) => e.classId);
  const courseIds = [...new Set(enrollments.map((e) => e.courseId).filter(Boolean))];

  const filter = {
    status: "PUBLISHED",
    ...NOT_DELETED,
    $or: [
      { scopeType: "GLOBAL_PLACEMENT" },
      ...(confirmedClassIds.length ? [{ scopeType: { $in: ["CLASS", "SESSION"] }, classId: { $in: confirmedClassIds } }] : []),
      ...(courseIds.length ? [{ scopeType: "COURSE", courseId: { $in: courseIds } }] : []),
    ],
  };

  if (query.purpose) filter.purpose = String(query.purpose).trim().toUpperCase();
  if (query.subjectId) {
    assertId(query.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    filter.subjectId = query.subjectId;
  }
  if (query.gradeLevel) {
    filter.gradeLevel = String(query.gradeLevel).trim().toUpperCase();
  }
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    if (!confirmedClassIds.some((id) => String(id) === String(query.classId))) {
      throw new AppError("You must have confirmed enrollment in this class", "NOT_ENROLLED", 403);
    }
    filter.$or = [{ scopeType: { $in: ["CLASS", "SESSION"] }, classId: query.classId }];
  }

  const [items, total] = await Promise.all([
    Assessment.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Assessment.countDocuments(filter),
  ]);

  return paged(items.map((a) => presentAssessmentForStudent(a, [])), total, paging);
};

const getMyAssessment = async (studentId, assessmentId) => {
  assertId(assessmentId, "Assessment not found", "ASSESSMENT_NOT_FOUND");
  const assessment = await Assessment.findOne({ _id: assessmentId, status: "PUBLISHED", ...NOT_DELETED }).lean();
  if (!assessment) throw assessmentNotFound();

  await verifyStudentAssessmentEligibility(studentId, assessment);
  const questions = await Question.find({ assessmentId: assessment._id, ...NOT_DELETED })
    .sort({ questionOrder: 1 })
    .lean();

  // Strictly redact answer keys & explanations on student views!
  return presentAssessmentForStudent(assessment, questions);
};

/**
 * LMS-08: Học viên bắt đầu lượt làm bài (Attempt).
 * - Đóng các lượt IN_PROGRESS đã hết hạn (EXPIRED) trước khi kiểm tra lượt active.
 * - Ngăn chặn tạo trùng lượt active nhờ partial unique index `{ assessmentId, studentId }` (`status: "IN_PROGRESS"`).
 * - Hỗ trợ `Idempotency-Key` và kiểm tra `maxAttempts`, `availableFrom`/`availableUntil`.
 */
const startAttempt = async (studentId, assessmentId, options = {}) => {
  assertId(assessmentId, "Assessment not found", "ASSESSMENT_NOT_FOUND");
  const assessment = await Assessment.findOne({ _id: assessmentId, ...NOT_DELETED }).lean();
  if (!assessment || assessment.status !== "PUBLISHED") {
    throw assessmentNotFound();
  }

  const now = new Date();
  if (assessment.availableFrom && now < new Date(assessment.availableFrom)) {
    throw new AppError("Assessment is not open yet", "ASSESSMENT_NOT_AVAILABLE", 409);
  }
  if (assessment.availableUntil && now > new Date(assessment.availableUntil)) {
    throw new AppError("Assessment availability window has closed", "ASSESSMENT_NOT_AVAILABLE", 409);
  }

  const { enrollmentId } = await verifyStudentAssessmentEligibility(studentId, assessment);
  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);

  // Expire any stale IN_PROGRESS attempt that has already passed expiresAt outside rollback-prone tx
  await Attempt.updateMany(
    {
      assessmentId: assessment._id,
      studentId,
      status: "IN_PROGRESS",
      expiresAt: { $ne: null, $lt: now },
    },
    {
      $set: {
        status: "EXPIRED",
        gradingStatus: "GRADED",
        totalScore: 0,
        percentage: 0,
        passed: false,
        feedback: "Time limit expired before submission",
      },
    }
  );

  const questionsRaw = await Question.find({ assessmentId: assessment._id, ...NOT_DELETED })
    .sort({ questionOrder: 1 })
    .lean();
  if (!questionsRaw.length) {
    throw new AppError("Assessment has no questions", "ASSESSMENT_EMPTY", 409);
  }

  const orderedQuestions = assessment.shuffleQuestions
    ? [...questionsRaw].sort(() => Math.random() - 0.5)
    : questionsRaw;

  const questionSnapshots = orderedQuestions.map((q) => ({
    questionId: q._id,
    questionOrder: q.questionOrder,
    questionType: q.questionType,
    prompt: q.prompt,
    options: (q.options || []).map((o) => ({ optionId: o.optionId, text: o.text })),
    points: q.points,
  }));

  const maxScoreSnapshot = round2(questionSnapshots.reduce((sum, q) => sum + Number(q.points), 0));
  const expiresAt = assessment.timeLimitMinutes
    ? new Date(now.getTime() + Number(assessment.timeLimitMinutes) * 60 * 1000)
    : null;

  let attempt;
  let idempotentReplay = false;
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      if (idempotencyKey) {
        const existingByKey = await Attempt.findOne({
          assessmentId: assessment._id,
          studentId,
          startIdempotencyKey: idempotencyKey,
        }).session(dbSession);
        if (existingByKey) {
          attempt = existingByKey;
          idempotentReplay = true;
          return;
        }
      }

      const activeAttempt = await Attempt.findOne({
        assessmentId: assessment._id,
        studentId,
        status: "IN_PROGRESS",
      }).session(dbSession);
      if (activeAttempt) {
        throw Object.assign(
          new AppError("You already have an active attempt in progress", "ATTEMPT_ALREADY_IN_PROGRESS", 409),
          { details: { attemptId: activeAttempt._id.toString() } }
        );
      }

      const usedCount = await Attempt.countDocuments({
        assessmentId: assessment._id,
        studentId,
      }).session(dbSession);
      if (usedCount >= assessment.maxAttempts) {
        throw new AppError(
          `Maximum attempts (${assessment.maxAttempts}) exceeded for this assessment`,
          "MAX_ATTEMPTS_EXCEEDED",
          409
        );
      }

      const [created] = await Attempt.create(
        [
          {
            assessmentId: assessment._id,
            purpose: assessment.purpose,
            classId: assessment.classId,
            courseId: assessment.courseId,
            sessionId: assessment.sessionId,
            studentId,
            enrollmentId,
            attemptNumber: usedCount + 1,
            startIdempotencyKey: idempotencyKey,
            status: "IN_PROGRESS",
            gradingStatus: "PENDING",
            questionSnapshots,
            answers: [],
            startedAt: now,
            expiresAt,
            maxScoreSnapshot,
          },
        ],
        { session: dbSession }
      );
      attempt = created;
    });
  } catch (err) {
    if (err && err.code === 11000) {
      if (idempotencyKey) {
        const existingByKey = await Attempt.findOne({
          assessmentId: assessment._id,
          studentId,
          startIdempotencyKey: idempotencyKey,
        }).lean();
        if (existingByKey) {
          return { ...presentAttemptForStudent(existingByKey, assessment), idempotent: true };
        }
      }
      const active = await Attempt.findOne({ assessmentId: assessment._id, studentId, status: "IN_PROGRESS" }).lean();
      if (active) {
        throw Object.assign(
          new AppError("You already have an active attempt in progress", "ATTEMPT_ALREADY_IN_PROGRESS", 409),
          { details: { attemptId: active._id.toString() } }
        );
      }
      throw new AppError("Concurrent attempt start conflict; please retry", "ATTEMPT_CONFLICT", 409);
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  return {
    ...presentAttemptForStudent(attempt, assessment),
    idempotent: idempotentReplay,
  };
};

const evaluateObjectiveAnswer = (question, answerInput) => {
  const qType = question.questionType;
  const maxPoints = Number(question.points);
  const selectedOptionIds = answerInput && Array.isArray(answerInput.selectedOptionIds)
    ? [...new Set(answerInput.selectedOptionIds.map((id) => String(id).trim()).filter(Boolean))]
    : [];
  const textAnswer =
    answerInput && answerInput.textAnswer !== undefined && answerInput.textAnswer !== null
      ? String(answerInput.textAnswer).trim()
      : null;

  if (qType === "SINGLE_CHOICE" || qType === "TRUE_FALSE") {
    const isCorrect =
      selectedOptionIds.length === 1 &&
      Array.isArray(question.correctOptionIds) &&
      question.correctOptionIds.length === 1 &&
      selectedOptionIds[0] === question.correctOptionIds[0];
    return {
      questionId: question._id,
      selectedOptionIds,
      textAnswer: null,
      awardedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      isCorrect,
      requiresManualGrading: false,
    };
  }

  if (qType === "MULTIPLE_CHOICE") {
    const expected = [...(question.correctOptionIds || [])].sort();
    const actual = [...selectedOptionIds].sort();
    const isCorrect = expected.length > 0 && actual.length === expected.length && expected.every((v, i) => v === actual[i]);
    return {
      questionId: question._id,
      selectedOptionIds,
      textAnswer: null,
      awardedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      isCorrect,
      requiresManualGrading: false,
    };
  }

  if (qType === "SHORT_TEXT") {
    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    if (accepted.length > 0) {
      const norm = (s) => (question.caseSensitive ? String(s).trim() : String(s).trim().toLowerCase());
      const normActual = textAnswer !== null ? norm(textAnswer) : "";
      const isCorrect = normActual !== "" && accepted.some((ans) => norm(ans) === normActual);
      return {
        questionId: question._id,
        selectedOptionIds: [],
        textAnswer,
        awardedPoints: isCorrect ? maxPoints : 0,
        maxPoints,
        isCorrect,
        requiresManualGrading: false,
      };
    }
    return {
      questionId: question._id,
      selectedOptionIds: [],
      textAnswer,
      awardedPoints: 0,
      maxPoints,
      isCorrect: null,
      requiresManualGrading: true,
    };
  }

  // ESSAY
  return {
    questionId: question._id,
    selectedOptionIds: [],
    textAnswer,
    awardedPoints: 0,
    maxPoints,
    isCorrect: null,
    requiresManualGrading: true,
  };
};

/**
 * LMS-08: Nộp bài và chấm điểm tự động (hoặc chuyển chờ chấm tay nếu có tự luận).
 * Đảm bảo khóa nguyên tử IN_PROGRESS -> SUBMITTED/GRADED, chống double submit & tạo trùng kết quả.
 */
const submitAttempt = async (studentId, attemptId, body = {}, options = {}) => {
  assertId(attemptId, "Attempt not found", "ATTEMPT_NOT_FOUND");
  const idempotencyKey = normalizeIdempotencyKey(
    options?.idempotencyKey !== undefined ? options.idempotencyKey : body?.idempotencyKey
  );

  const preAttempt = await Attempt.findOne({ _id: attemptId, studentId }).lean();
  if (!preAttempt) throw attemptNotFound();

  const assessment = await Assessment.findById(preAttempt.assessmentId).lean();
  if (!assessment) throw assessmentNotFound();

  const rawAnswers = body.answers === undefined ? [] : body.answers;
  if (!Array.isArray(rawAnswers)) throw validationError("answers must be an array");

  const allowedQuestionIds = new Set((preAttempt.questionSnapshots || []).map((q) => String(q.questionId)));
  const seenAnswers = new Set();
  const normalizedInputs = [];
  for (let i = 0; i < rawAnswers.length; i++) {
    const entry = rawAnswers[i];
    if (!entry || !entry.questionId || !mongoose.isValidObjectId(entry.questionId)) {
      throw validationError(`answers[${i}].questionId must be a valid question id`);
    }
    const qid = String(entry.questionId);
    if (!allowedQuestionIds.has(qid)) {
      throw validationError(`answers[${i}].questionId "${qid}" does not belong to this attempt`);
    }
    if (seenAnswers.has(qid)) {
      throw validationError(`Duplicate answer entry for question "${qid}"`);
    }
    seenAnswers.add(qid);
    normalizedInputs.push({
      questionId: qid,
      selectedOptionIds: Array.isArray(entry.selectedOptionIds)
        ? [...new Set(entry.selectedOptionIds.map((x) => String(x).trim()))].sort()
        : [],
      textAnswer: entry.textAnswer !== undefined && entry.textAnswer !== null ? String(entry.textAnswer).trim() : null,
    });
  }

  const requestHash = crypto
    .createHash("sha256")
    .update(stableStringify({ attemptId: preAttempt._id.toString(), answers: [...normalizedInputs].sort((a, b) => a.questionId.localeCompare(b.questionId)) }))
    .digest("hex");

  // Idempotent replay check BEFORE blocking already-submitted
  if (idempotencyKey && preAttempt.submitIdempotencyKey === idempotencyKey && preAttempt.status !== "IN_PROGRESS") {
    if (preAttempt.submitRequestHash !== requestHash) {
      throw new AppError("Idempotency-Key was already used with different answers", "IDEMPOTENCY_KEY_CONFLICT", 409);
    }
    return { ...presentAttemptForStudent(preAttempt, assessment), idempotent: true };
  }

  if (preAttempt.status === "EXPIRED") {
    throw new AppError("Attempt time limit has expired", "ATTEMPT_EXPIRED", 409);
  }
  if (preAttempt.status !== "IN_PROGRESS") {
    throw new AppError("Attempt has already been submitted", "ATTEMPT_ALREADY_SUBMITTED", 409);
  }

  const now = new Date();
  if (preAttempt.expiresAt && now > new Date(preAttempt.expiresAt)) {
    // Persist EXPIRED outside aborted tx so late submission cannot bypass timer cleanly
    await Attempt.findOneAndUpdate(
      { _id: preAttempt._id, studentId, status: "IN_PROGRESS" },
      {
        $set: {
          status: "EXPIRED",
          gradingStatus: "GRADED",
          totalScore: 0,
          percentage: 0,
          passed: false,
          feedback: "Time limit expired",
        },
      }
    );
    throw new AppError("Attempt time limit has expired", "ATTEMPT_EXPIRED", 409);
  }

  const inputByQuestionId = new Map(normalizedInputs.map((a) => [a.questionId, a]));

  let savedAttempt;
  let idempotentReplay = false;
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      // Atomic write-lock on IN_PROGRESS attempt inside transaction
      const claimed = await Attempt.findOneAndUpdate(
        { _id: preAttempt._id, studentId, status: "IN_PROGRESS" },
        { $inc: { __v: 1 } },
        { session: dbSession, returnDocument: "after" }
      );
      if (!claimed) {
        const latest = await Attempt.findById(preAttempt._id).session(dbSession);
        if (latest && idempotencyKey && latest.submitIdempotencyKey === idempotencyKey) {
          if (latest.submitRequestHash !== requestHash) {
            throw new AppError("Idempotency-Key was already used with different answers", "IDEMPOTENCY_KEY_CONFLICT", 409);
          }
          savedAttempt = latest;
          idempotentReplay = true;
          return;
        }
        if (latest && latest.status === "EXPIRED") {
          throw new AppError("Attempt time limit has expired", "ATTEMPT_EXPIRED", 409);
        }
        throw new AppError("Attempt has already been submitted", "ATTEMPT_ALREADY_SUBMITTED", 409);
      }

      if (claimed.expiresAt && now > new Date(claimed.expiresAt)) {
        throw new AppError("Attempt time limit has expired", "ATTEMPT_EXPIRED", 409);
      }

      const questionIds = (claimed.questionSnapshots || []).map((q) => q.questionId);
      const questions = await Question.find({ _id: { $in: questionIds } }).session(dbSession).lean();
      const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

      const evaluatedAnswers = [];
      let autoScore = 0;
      let hasManual = false;

      for (const snap of claimed.questionSnapshots || []) {
        const q = questionMap.get(String(snap.questionId));
        if (!q) throw questionNotFound();
        const ans = evaluateObjectiveAnswer(q, inputByQuestionId.get(String(q._id)));
        if (ans.requiresManualGrading) hasManual = true;
        else autoScore += ans.awardedPoints;
        evaluatedAnswers.push(ans);
      }

      autoScore = round2(autoScore);
      const totalScore = autoScore;
      const percentage = claimed.maxScoreSnapshot > 0 ? round2((totalScore / claimed.maxScoreSnapshot) * 100) : 0;

      claimed.answers = evaluatedAnswers;
      claimed.submittedAt = now;
      claimed.submitIdempotencyKey = idempotencyKey;
      claimed.submitRequestHash = requestHash;
      claimed.autoScore = autoScore;
      claimed.manualScore = 0;
      claimed.totalScore = totalScore;
      claimed.percentage = percentage;

      if (hasManual) {
        claimed.status = "SUBMITTED";
        claimed.gradingStatus = "PENDING_MANUAL";
        claimed.passed = null;
      } else {
        claimed.status = "GRADED";
        claimed.gradingStatus = "AUTO_GRADED";
        claimed.gradedAt = now;
        claimed.passed = assessment.passingScore !== null && assessment.passingScore !== undefined
          ? totalScore >= assessment.passingScore
          : null;
      }

      await claimed.save({ session: dbSession });
      savedAttempt = claimed;
    });
  } catch (err) {
    if (err && err.code === "ATTEMPT_EXPIRED") {
      await Attempt.findOneAndUpdate(
        { _id: preAttempt._id, studentId, status: "IN_PROGRESS" },
        {
          $set: {
            status: "EXPIRED",
            gradingStatus: "GRADED",
            totalScore: 0,
            percentage: 0,
            passed: false,
            feedback: "Time limit expired",
          },
        }
      );
    }
    if (err && err.code === 11000 && idempotencyKey) {
      const existing = await Attempt.findOne({ _id: preAttempt._id, studentId, submitIdempotencyKey: idempotencyKey }).lean();
      if (existing && existing.submitRequestHash === requestHash) {
        return { ...presentAttemptForStudent(existing, assessment), idempotent: true };
      }
      throw new AppError("Idempotency-Key conflict on submit", "IDEMPOTENCY_KEY_CONFLICT", 409);
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  return {
    ...presentAttemptForStudent(savedAttempt, assessment),
    idempotent: idempotentReplay,
  };
};

/**
 * LMS-08: Giáo viên hoặc Admin chấm phần tự luận cho Attempt ở trạng thái SUBMITTED.
 */
const manualGradeAttempt = async (actor, attemptId, body = {}) => {
  if (!actor || !["ADMIN", "TEACHER"].includes(actor.role)) {
    throw FORBIDDEN("Only ADMIN or TEACHER can grade attempts");
  }
  assertId(attemptId, "Attempt not found", "ATTEMPT_NOT_FOUND");
  const preAttempt = await Attempt.findById(attemptId).lean();
  if (!preAttempt) throw attemptNotFound();

  const assessment = await assertManageableAssessment(actor, preAttempt.assessmentId);

  if (preAttempt.status === "IN_PROGRESS") {
    throw new AppError("Cannot grade an in-progress attempt before submission", "ATTEMPT_NOT_SUBMITTED", 409);
  }
  if (preAttempt.status === "EXPIRED") {
    throw new AppError("Expired attempts cannot be manually graded", "ATTEMPT_EXPIRED", 409);
  }

  const questionGrades = body.questionGrades;
  if (!Array.isArray(questionGrades) || questionGrades.length === 0) {
    throw validationError("questionGrades must be a non-empty array");
  }

  const gradesMap = new Map();
  for (let i = 0; i < questionGrades.length; i++) {
    const g = questionGrades[i];
    if (!g || !g.questionId || !mongoose.isValidObjectId(g.questionId)) {
      throw validationError(`questionGrades[${i}].questionId must be valid`);
    }
    const pts = Number(g.awardedPoints);
    if (!Number.isFinite(pts) || pts < 0) {
      throw validationError(`questionGrades[${i}].awardedPoints must be >= 0`);
    }
    gradesMap.set(String(g.questionId), {
      awardedPoints: round2(pts),
      comment: g.comment ? String(g.comment).trim() : "",
    });
  }

  const now = new Date();
  let updated;
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const attempt = await Attempt.findById(preAttempt._id).session(dbSession);
      if (!attempt) throw attemptNotFound();

      let autoScore = 0;
      let manualScore = 0;
      let pendingManualRemaining = false;

      for (const ans of attempt.answers) {
        const override = gradesMap.get(String(ans.questionId));
        if (override) {
          if (override.awardedPoints > ans.maxPoints) {
            throw validationError(
              `awardedPoints (${override.awardedPoints}) cannot exceed maxPoints (${ans.maxPoints}) for question ${ans.questionId}`
            );
          }
          ans.awardedPoints = override.awardedPoints;
          ans.isCorrect = override.awardedPoints === ans.maxPoints;
          ans.requiresManualGrading = false;
          ans.gradedBy = actor.id;
          ans.gradedAt = now;
          ans.graderComment = override.comment;
        }
        if (ans.requiresManualGrading) {
          pendingManualRemaining = true;
        }
        // Check question type from snapshot to aggregate cleanly
        const snap = (attempt.questionSnapshots || []).find((s) => String(s.questionId) === String(ans.questionId));
        if (snap && (snap.questionType === "ESSAY" || (snap.questionType === "SHORT_TEXT" && ans.gradedBy))) {
          manualScore += Number(ans.awardedPoints || 0);
        } else {
          autoScore += Number(ans.awardedPoints || 0);
        }
      }

      if (pendingManualRemaining) {
        throw validationError("All manual-grading questions in this attempt must be scored");
      }

      autoScore = round2(autoScore);
      manualScore = round2(manualScore);
      const totalScore = round2(autoScore + manualScore);
      const percentage = attempt.maxScoreSnapshot > 0 ? round2((totalScore / attempt.maxScoreSnapshot) * 100) : 0;

      attempt.autoScore = autoScore;
      attempt.manualScore = manualScore;
      attempt.totalScore = totalScore;
      attempt.percentage = percentage;
      attempt.status = "GRADED";
      attempt.gradingStatus = "GRADED";
      attempt.gradedBy = actor.id;
      attempt.gradedAt = now;
      if (body.feedback !== undefined) {
        attempt.feedback = body.feedback ? String(body.feedback).trim() : "";
      }
      attempt.passed = assessment.passingScore !== null && assessment.passingScore !== undefined
        ? totalScore >= assessment.passingScore
        : null;

      await attempt.save({ session: dbSession });
      updated = attempt;
    });
  } finally {
    await dbSession.endSession();
  }

  return { ...updated.toObject(), id: updated._id.toString() };
};

const listMyAttemptsForAssessment = async (studentId, assessmentId) => {
  assertId(assessmentId, "Assessment not found", "ASSESSMENT_NOT_FOUND");
  const assessment = await Assessment.findOne({ _id: assessmentId, ...NOT_DELETED }).lean();
  if (!assessment) throw assessmentNotFound();

  const items = await Attempt.find({ assessmentId: assessment._id, studentId }).sort({ attemptNumber: -1 }).lean();
  return items.map((a) => presentAttemptForStudent(a, assessment));
};

const getMyAttempt = async (studentId, attemptId) => {
  assertId(attemptId, "Attempt not found", "ATTEMPT_NOT_FOUND");
  const attempt = await Attempt.findOne({ _id: attemptId, studentId }).lean();
  if (!attempt) throw attemptNotFound();
  const assessment = await Assessment.findById(attempt.assessmentId).lean();
  return presentAttemptForStudent(attempt, assessment);
};

module.exports = {
  createAssessment,
  updateAssessment,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  publishAssessment,
  archiveAssessment,
  listStaffAssessments,
  getStaffAssessment,
  listStaffAssessmentAttempts,
  listMyAssessments,
  getMyAssessment,
  startAttempt,
  submitAttempt,
  manualGradeAttempt,
  listMyAttemptsForAssessment,
  getMyAttempt,
};

