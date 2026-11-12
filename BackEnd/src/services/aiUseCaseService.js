const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  AiGeneratedDraft,
  LearningResource,
  Class,
  Course,
  Enrollment,
  TeacherSubjectAuthorization,
  SyllabusVersion,
  PlacementResult,
  Assessment,
  Question,
  User,
} = require("../models");
const { AI_DRAFT_TYPES, AI_DRAFT_STATUSES } = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { toNum } = require("../utils/money");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");
const adminService = require("./adminService");
const learningProgressService = require("./learningProgressService");
const teachingQualityReportService = require("./teachingQualityReportService");
const contributionService = require("./contributionService");
const { executeGovernedAi, detectPromptInjection } = require("./aiGovernanceService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const LIVE_ENROLLMENT_STATUSES = ["CONFIRMED", "COMPLETED"];

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const isValidIdValue = (val) =>
  (typeof val === "string" ||
    val instanceof mongoose.Types.ObjectId ||
    Boolean(val && typeof val === "object" && val._bsontype === "ObjectId")) &&
  mongoose.isValidObjectId(val);
const assertScalarIdInput = (val, field, notFoundMsg, notFoundCode) => {
  if (val === undefined || val === null || val === "") return null;
  if (!isValidIdValue(val)) {
    if (Array.isArray(val) || typeof val === "object") {
      throw validationError(`${field} must be a valid ID`);
    }
    throw new AppError(notFoundMsg, notFoundCode, 404);
  }
  assertId(val, notFoundMsg, notFoundCode);
  return toId(val);
};
const assertOptionalString = (val, field, maxLen = 1000) => {
  if (val === undefined || val === null) return "";
  if (typeof val !== "string") {
    throw validationError(`${field} must be a string`);
  }
  return val.trim().slice(0, maxLen);
};
const assertOptionalQueryEnum = (val, allowed, field) => {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "string") {
    throw validationError(`${field} query parameter must be a string`);
  }
  const upper = val.trim().toUpperCase();
  if (!upper) return null;
  if (!allowed.includes(upper)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return upper;
};
const parseBoundedInteger = (raw, field, { defaultValue, min, max }) => {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  if (typeof raw === "boolean" || (typeof raw === "object" && raw !== null)) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  if (typeof raw === "string" && !/^-?\d+$/.test(raw.trim())) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
};
const runInTx = async (work) => {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => work(dbSession));
  } finally {
    await dbSession.endSession();
  }
};
const getOwnClassInTx = async (teacherId, classId, dbSession) => {
  if (!isValidIdValue(classId)) {
    if (Array.isArray(classId) || (classId && typeof classId === "object")) {
      throw validationError("classId must be a valid ID");
    }
    throw CLASS_NOT_FOUND();
  }
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).session(dbSession);
  if (!cls) throw CLASS_NOT_FOUND();
  if (cls.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only manage your own classes");
  }
  return cls;
};
const draftNotFound = () => new AppError("AI draft not found", "AI_DRAFT_NOT_FOUND", 404);
const generateDraftCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AID-${datePart}-${randPart}`;
};

// ============================================================================
// AI-01: Student AI Learning Resource Recommendations (Fallback + Whitelist)
// ============================================================================

const presentStudentResourceRecommendation = (resDoc, reason, score) => ({
  id: toId(resDoc._id),
  scopeType: resDoc.scopeType,
  courseId: resDoc.courseId ? toId(resDoc.courseId) : null,
  classId: resDoc.classId ? toId(resDoc.classId) : null,
  sessionId: resDoc.sessionId ? toId(resDoc.sessionId) : null,
  title: resDoc.title,
  description: resDoc.description || "",
  resourceKind: resDoc.resourceKind,
  sourceType: resDoc.sourceType,
  hasFile: resDoc.sourceType === "STORAGE_FILE" && Boolean(resDoc.storageKey),
  externalUrl: resDoc.externalUrl || null,
  isDownloadable: resDoc.isDownloadable !== false,
  order: resDoc.order,
  recommendationReason: reason,
  relevanceScore: score,
});

const scoreResourceDeterministically = (resource, { topicWords, preferredSubjectIds, preferredCourseId, preferredClassId }) => {
  let score = 0;
  if (preferredClassId && toId(resource.classId) === toId(preferredClassId)) score += 30;
  if (preferredCourseId && toId(resource.courseId) === toId(preferredCourseId)) score += 20;
  if (resource.scopeType === "SESSION") score += 10;
  else if (resource.scopeType === "CLASS") score += 8;
  else if (resource.scopeType === "COURSE") score += 5;

  if (resource.courseId && preferredSubjectIds.has(toId(resource.courseId))) score += 6;

  const haystack = `${resource.title || ""} ${resource.description || ""}`.toLowerCase();
  for (const w of topicWords) {
    if (haystack.includes(w)) score += 15;
  }
  return score;
};

const recommendLearningResourcesForStudent = async (studentUser, params = {}) => {
  const limit = parseBoundedInteger(params.limit, "limit", { defaultValue: 5, min: 1, max: 20 });
  const topic = assertOptionalString(params.topic, "topic", 300);
  if (detectPromptInjection(topic)) {
    throw new AppError(
      "Input contains disallowed instruction-override or data-exfiltration patterns",
      "PROMPT_INJECTION_DETECTED",
      400
    );
  }

  const requestedClassId = assertScalarIdInput(params.classId, "classId", "Class not found", "CLASS_NOT_FOUND");
  const requestedCourseId = assertScalarIdInput(params.courseId, "courseId", "Course not found", "COURSE_NOT_FOUND");

  const enrollments = await Enrollment.find({
    studentId: studentUser.id,
    enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES },
  })
    .select("classId courseId")
    .lean();

  let enrolledClassIds = [...new Set(enrollments.map((e) => toId(e.classId)))];
  let enrolledCourseIds = [...new Set(enrollments.map((e) => toId(e.courseId)).filter(Boolean))];

  if (requestedClassId) {
    if (!enrolledClassIds.includes(requestedClassId)) {
      throw new AppError("You must be enrolled in this class to get resource recommendations", "NOT_ENROLLED", 403);
    }
    enrolledClassIds = [requestedClassId];
  }
  if (requestedCourseId) {
    if (!enrolledCourseIds.includes(requestedCourseId)) {
      throw new AppError("You must be enrolled in this course to get resource recommendations", "NOT_ENROLLED", 403);
    }
    enrolledCourseIds = [requestedCourseId];
  }

  // Only consider non-deleted classes
  const activeEnrolledClasses = enrolledClassIds.length
    ? await Class.find({ _id: { $in: enrolledClassIds }, ...NOT_DELETED })
        .select("_id courseId level subjectId")
        .lean()
    : [];
  const validClassIds = activeEnrolledClasses.map((c) => c._id);
  const validCourseIds = [
    ...new Set([
      ...activeEnrolledClasses.map((c) => c.courseId).filter(Boolean).map(toId),
      ...(params.classId ? [] : enrolledCourseIds),
    ]),
  ];

  // Fetch ONLY PUBLISHED, non-deleted, accessible resources; NEVER expose storageKey to AI or student JSON
  const resources =
    validClassIds.length || validCourseIds.length
      ? await LearningResource.find({
          ...NOT_DELETED,
          status: "PUBLISHED",
          $or: [
            ...(validClassIds.length
              ? [{ scopeType: { $in: ["CLASS", "SESSION"] }, classId: { $in: validClassIds } }]
              : []),
            ...(validCourseIds.length ? [{ scopeType: "COURSE", courseId: { $in: validCourseIds } }] : []),
          ],
        })
          .sort({ order: 1, createdAt: -1 })
          .select("-storageKey")
          .lean()
      : [];

  const placements = await PlacementResult.find({ studentId: studentUser.id, status: "GENERATED" })
    .sort({ evaluatedAt: -1 })
    .limit(5)
    .select("subjectId courseId recommendedLevel recommendedCourseIds")
    .lean();

  const studentDoc = await User.findById(studentUser.id).select("email studentProfile.fullName").lean();
  const forbiddenValues = [];
  if (studentDoc?.email) forbiddenValues.push(studentDoc.email);

  const topicWords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const preferredSubjectCourseIds = new Set(placements.map((p) => toId(p.courseId)).filter(Boolean));

  const ranked = resources
    .map((r) => ({
      doc: r,
      score: scoreResourceDeterministically(r, {
        topicWords,
        preferredSubjectIds: preferredSubjectCourseIds,
        preferredCourseId: params.courseId,
        preferredClassId: params.classId,
      }),
    }))
    .sort((a, b) => b.score - a.score || (a.doc.order || 1) - (b.doc.order || 1));

  const deterministicTop = ranked.slice(0, limit).map((item) =>
    presentStudentResourceRecommendation(
      item.doc,
      topicWords.length
        ? "Phù hợp chủ đề học tập và khóa/lớp bạn đang tham gia (xếp hạng quy tắc không dùng AI)"
        : "Tài liệu chính thức thuộc lớp/khóa bạn đang theo học (xếp hạng quy tắc không dùng AI)",
      item.score
    )
  );

  // If the student has zero accessible PUBLISHED resources, return empty deterministic result without wasting provider quota
  if (resources.length === 0) {
    return {
      aiUsed: false,
      mode: "DETERMINISTIC_FALLBACK",
      providerStatus: "NO_ACCESSIBLE_RESOURCES",
      blockers: [],
      auditLogId: null,
      recommendations: [],
      totalAccessibleCount: 0,
    };
  }

  const accessibleById = new Map(resources.map((r) => [toId(r._id), r]));
  const anonymizedCandidates = ranked.slice(0, 25).map(({ doc, score }) => ({
    resourceId: toId(doc._id),
    title: doc.title,
    resourceKind: doc.resourceKind,
    scopeType: doc.scopeType,
    deterministicScore: score,
  }));

  const execution = await executeGovernedAi({
    actorUser: studentUser,
    featureCode: "AI_01_RESOURCE_RECOMMENDATION",
    operation: "RECOMMEND_LEARNING_RESOURCES",
    targetType: params.classId ? "Class" : params.courseId ? "Course" : null,
    targetId: params.classId || params.courseId || null,
    userPrompt: topic || "Recommend accessible published learning resources for my active enrollments",
    systemPrompt:
      "You are an educational assistant. Recommend ONLY resourceId values present in the provided candidates whitelist. Never invent URLs, resources, or student data.",
    contextData: {
      topicFocus: topic || null,
      limit,
      placementLevels: placements.map((p) => p.recommendedLevel),
      candidates: anonymizedCandidates,
    },
    forbiddenOutputValues: forbiddenValues,
    fallbackHandler: async () => ({
      recommendations: deterministicTop,
      fallbackReason: "AI provider unavailable; deterministic accessible-resource ranking applied",
    }),
  });

  if (!execution.aiUsed) {
    return {
      aiUsed: false,
      mode: execution.mode,
      providerStatus: execution.providerStatus,
      blockers: execution.blockers,
      auditLogId: execution.auditLogId,
      recommendations: execution.result.recommendations,
      totalAccessibleCount: resources.length,
    };
  }

  // Strictly enforce candidate whitelist: discard any fabricated/inaccessible resourceIds!
  const rawItems = Array.isArray(execution.result?.recommendations)
    ? execution.result.recommendations
    : Array.isArray(execution.result?.data?.recommendations)
      ? execution.result.data.recommendations
      : [];

  let discardedOutOfWhitelistCount = 0;
  const seenIds = new Set();
  const whitelistedRecommendations = [];

  for (const item of rawItems) {
    const rid = item && (item.resourceId || item.id) ? String(item.resourceId || item.id) : null;
    if (!rid || !accessibleById.has(rid)) {
      discardedOutOfWhitelistCount += 1;
      continue;
    }
    if (seenIds.has(rid)) continue;
    seenIds.add(rid);
    const doc = accessibleById.get(rid);
    whitelistedRecommendations.push(
      presentStudentResourceRecommendation(
        doc,
        item.reason ? String(item.reason).trim().slice(0, 300) : "Đề xuất từ AI trong phạm vi tài liệu hợp lệ của bạn",
        typeof item.score === "number" ? item.score : 100
      )
    );
    if (whitelistedRecommendations.length >= limit) break;
  }

  // If AI only returned invalid/hallucinated IDs, fall back honestly to deterministic accessible results
  const finalList = whitelistedRecommendations.length ? whitelistedRecommendations : deterministicTop;

  return {
    aiUsed: whitelistedRecommendations.length > 0,
    mode: whitelistedRecommendations.length > 0 ? "AI_GENERATED" : "DETERMINISTIC_FALLBACK",
    providerStatus: execution.providerStatus,
    providerId: execution.providerId,
    modelId: execution.modelId,
    auditLogId: execution.auditLogId,
    filteredHallucinatedCount: discardedOutOfWhitelistCount,
    recommendations: finalList,
    totalAccessibleCount: resources.length,
  };
};

// ============================================================================
// AI-02: Teacher AI Lesson Planning & Quiz Question Draft Authoring
// ============================================================================

const assertTeacherAuthoringScope = async (teacherId, body = {}) => {
  await getVerifiedTeacher(teacherId);

  if (body.status !== undefined && body.status !== null && typeof body.status !== "string") {
    throw validationError("status must be a string");
  }
  const reqStatus = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
  if (body.autoPublish === true || body.publishImmediately === true || reqStatus === "PUBLISHED") {
    throw new AppError(
      "AI-generated teaching materials cannot be auto-published; they must be saved as DRAFT_PENDING_REVIEW first",
      "AI_AUTO_PUBLISH_FORBIDDEN",
      403
    );
  }
  if (body.mutateSyllabus === true || body.applyToSyllabus === true) {
    throw new AppError(
      "AI cannot directly modify SyllabusVersion records",
      "SYLLABUS_VERSION_IMMUTABLE",
      409
    );
  }

  let cls = null;
  let course = null;
  let syllabusVersion = null;

  const classId = assertScalarIdInput(body.classId, "classId", "Class not found", "CLASS_NOT_FOUND");
  const courseId = assertScalarIdInput(body.courseId, "courseId", "Course not found", "COURSE_NOT_FOUND");
  const syllabusVersionId = assertScalarIdInput(
    body.syllabusVersionId,
    "syllabusVersionId",
    "Syllabus version not found",
    "SYLLABUS_VERSION_NOT_FOUND"
  );

  if (classId) {
    cls = await getOwnClass(teacherId, classId);
    course = await Course.findOne({ _id: cls.courseId, ...NOT_DELETED }).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  } else if (courseId) {
    course = await Course.findOne({ _id: courseId, ...NOT_DELETED }).lean();
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

    const teachesCourse = await Class.exists({ courseId: course._id, teacherId, ...NOT_DELETED });
    if (!teachesCourse) {
      const hasSubjectAuth = await TeacherSubjectAuthorization.exists({
        teacherId,
        subjectId: course.subjectId,
        level: course.level,
        ...(course.gradeLevel ? { gradeLevel: course.gradeLevel } : {}),
        status: "APPROVED",
      });
      if (!hasSubjectAuth) {
        throw new AppError(
          "You must own a class in this course or hold APPROVED subject authorization to author AI drafts for it",
          "SUBJECT_NOT_AUTHORIZED",
          403
        );
      }
    }
  } else {
    throw validationError("Either classId or courseId is required");
  }

  if (syllabusVersionId) {
    syllabusVersion = await SyllabusVersion.findOne({ _id: syllabusVersionId, ...NOT_DELETED }).lean();
    if (!syllabusVersion || toId(syllabusVersion.courseId) !== toId(course._id)) {
      throw new AppError("Syllabus version does not belong to target course", "SYLLABUS_VERSION_NOT_FOUND", 404);
    }
  }

  return { cls, course, syllabusVersion };
};

const presentAiDraft = (doc) => ({
  id: toId(doc._id),
  draftCode: doc.draftCode,
  teacherId: toId(doc.teacherId),
  draftType: doc.draftType,
  courseId: doc.courseId ? toId(doc.courseId) : null,
  classId: doc.classId ? toId(doc.classId) : null,
  syllabusVersionId: doc.syllabusVersionId ? toId(doc.syllabusVersionId) : null,
  subjectId: doc.subjectId ? toId(doc.subjectId) : null,
  gradeLevel: doc.gradeLevel || null,
  level: doc.level || null,
  title: doc.title,
  topic: doc.topic,
  generatedPayload: doc.generatedPayload,
  status: doc.status,
  isPublished: false,
  providerId: doc.providerId,
  modelId: doc.modelId,
  aiAuditLogId: doc.aiAuditLogId ? toId(doc.aiAuditLogId) : null,
  approvedAt: doc.approvedAt || null,
  approvalNote: doc.approvalNote || null,
  materializedTargetType: doc.materializedTargetType || null,
  materializedTargetId: doc.materializedTargetId ? toId(doc.materializedTargetId) : null,
  rejectedAt: doc.rejectedAt || null,
  rejectionReason: doc.rejectionReason || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const generateTeacherLessonDraft = async (teacherUser, body = {}) => {
  const scope = await assertTeacherAuthoringScope(teacherUser.id, body);
  if (isBlank(body.topic)) throw validationError("topic is required");
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
    throw validationError("title must be a string");
  }
  const topic = body.topic.trim().slice(0, 500);
  const title = isBlank(body.title) ? `Kế hoạch bài giảng: ${topic.slice(0, 120)}` : body.title.trim().slice(0, 200);
  const instructions = assertOptionalString(body.instructions, "instructions", 1000);
  const durationMinutes = parseBoundedInteger(body.durationMinutes, "durationMinutes", {
    defaultValue: 60,
    min: 5,
    max: 480,
  });

  const execution = await executeGovernedAi({
    actorUser: teacherUser,
    featureCode: "AI_02_LESSON_AUTHORING",
    operation: "GENERATE_LESSON_PLAN_DRAFT",
    targetType: scope.cls ? "Class" : "Course",
    targetId: scope.cls ? scope.cls._id : scope.course._id,
    userPrompt: `Topic: ${topic}\n${instructions}`,
    systemPrompt:
      "You are an academic curriculum assistant drafting an UNPUBLISHED lesson plan outline for teacher review. Return structured lesson sections without PII.",
    contextData: {
      draftType: "LESSON_PLAN",
      courseTitle: scope.course.title,
      subjectName: scope.course.subjectName,
      level: scope.cls?.level || scope.course.level || null,
      gradeLevel: scope.cls?.gradeLevel || scope.course.gradeLevel || null,
      syllabusSummary: scope.syllabusVersion ? scope.syllabusVersion.summary : scope.course.learningObjectives || "",
      durationMinutes,
    },
  });

  const payload = execution.result?.lessonPlan || execution.result?.data || {
    outline: execution.result?.text || String(execution.result || ""),
    objectives: execution.result?.objectives || [],
    activities: execution.result?.activities || [],
  };

  const draft = await AiGeneratedDraft.create({
    draftCode: generateDraftCode(),
    teacherId: teacherUser.id,
    draftType: "LESSON_PLAN",
    courseId: scope.course._id,
    classId: scope.cls ? scope.cls._id : null,
    syllabusVersionId: scope.syllabusVersion ? scope.syllabusVersion._id : null,
    subjectId: scope.course.subjectId,
    gradeLevel: scope.cls?.gradeLevel || scope.course.gradeLevel || null,
    level: scope.cls?.level || scope.course.level || null,
    title,
    topic,
    sanitizedPromptSummary: topic.slice(0, 300),
    generatedPayload: payload,
    status: "DRAFT_PENDING_REVIEW",
    isPublished: false,
    providerId: execution.providerId,
    modelId: execution.modelId,
    aiAuditLogId: execution.auditLogId,
  });

  return presentAiDraft(draft);
};

const normalizeAiQuestions = (rawQuestions) => {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new AppError("AI response did not produce valid quiz questions", "AI_INVALID_STRUCTURED_OUTPUT", 502);
  }
  return rawQuestions.slice(0, 30).map((q, idx) => {
    const qType = (q.questionType ? String(q.questionType).trim().toUpperCase() : "SINGLE_CHOICE");
    if (!["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT", "ESSAY"].includes(qType)) {
      throw new AppError(`Invalid questionType returned by AI at index ${idx}`, "AI_INVALID_STRUCTURED_OUTPUT", 502);
    }
    if (isBlank(q.prompt)) {
      throw new AppError(`Missing prompt in AI question at index ${idx}`, "AI_INVALID_STRUCTURED_OUTPUT", 502);
    }
    return {
      questionOrder: idx + 1,
      questionType: qType,
      prompt: String(q.prompt).trim().slice(0, 4000),
      options: Array.isArray(q.options)
        ? q.options.map((o) => ({ optionId: String(o.optionId).trim(), text: String(o.text).trim() }))
        : [],
      correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds.map((id) => String(id).trim()) : [],
      acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.map((a) => String(a).trim()) : [],
      points: Number.isFinite(Number(q.points)) && Number(q.points) >= 0.5 ? Number(q.points) : 1,
      explanation: q.explanation ? String(q.explanation).trim().slice(0, 2000) : "",
    };
  });
};

const generateTeacherQuizDraft = async (teacherUser, body = {}) => {
  const scope = await assertTeacherAuthoringScope(teacherUser.id, body);
  if (isBlank(body.topic)) throw validationError("topic is required");
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
    throw validationError("title must be a string");
  }
  const topic = body.topic.trim().slice(0, 500);
  const questionCount = parseBoundedInteger(body.questionCount, "questionCount", {
    defaultValue: 5,
    min: 1,
    max: 20,
  });
  const title = isBlank(body.title) ? `Ngân hàng câu hỏi dự kiến: ${topic.slice(0, 100)}` : body.title.trim().slice(0, 200);
  const instructions = assertOptionalString(body.instructions, "instructions", 1000);

  const execution = await executeGovernedAi({
    actorUser: teacherUser,
    featureCode: "AI_02_LESSON_AUTHORING",
    operation: "GENERATE_QUIZ_QUESTIONS_DRAFT",
    targetType: scope.cls ? "Class" : "Course",
    targetId: scope.cls ? scope.cls._id : scope.course._id,
    userPrompt: `Topic: ${topic}\nQuestion count: ${questionCount}\n${instructions}`,
    systemPrompt:
      "You are an assessment authoring assistant. Generate DRAFT quiz questions only for teacher verification. Do not include PII.",
    contextData: {
      draftType: "QUIZ_QUESTIONS",
      courseTitle: scope.course.title,
      subjectName: scope.course.subjectName,
      level: scope.cls?.level || scope.course.level || null,
      gradeLevel: scope.cls?.gradeLevel || scope.course.gradeLevel || null,
      questionCount,
    },
  });

  const rawQuestions = execution.result?.questions || execution.result?.data?.questions;
  const normalizedQuestions = normalizeAiQuestions(rawQuestions);

  const draft = await AiGeneratedDraft.create({
    draftCode: generateDraftCode(),
    teacherId: teacherUser.id,
    draftType: "QUIZ_QUESTIONS",
    courseId: scope.course._id,
    classId: scope.cls ? scope.cls._id : null,
    syllabusVersionId: scope.syllabusVersion ? scope.syllabusVersion._id : null,
    subjectId: scope.course.subjectId,
    gradeLevel: scope.cls?.gradeLevel || scope.course.gradeLevel || null,
    level: scope.cls?.level || scope.course.level || null,
    title,
    topic,
    sanitizedPromptSummary: topic.slice(0, 300),
    generatedPayload: { questions: normalizedQuestions },
    status: "DRAFT_PENDING_REVIEW",
    isPublished: false,
    providerId: execution.providerId,
    modelId: execution.modelId,
    aiAuditLogId: execution.auditLogId,
  });

  return presentAiDraft(draft);
};

const listTeacherAiDrafts = async (teacherId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const filter = { teacherId, ...NOT_DELETED };
  const status = assertOptionalQueryEnum(query.status, AI_DRAFT_STATUSES, "status");
  if (status) filter.status = status;
  const draftType = assertOptionalQueryEnum(query.draftType, AI_DRAFT_TYPES, "draftType");
  if (draftType) filter.draftType = draftType;

  const [items, total] = await Promise.all([
    AiGeneratedDraft.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    AiGeneratedDraft.countDocuments(filter),
  ]);
  return paged(items.map(presentAiDraft), total, paging);
};

const getTeacherAiDraft = async (teacherId, draftId) => {
  await getVerifiedTeacher(teacherId);
  if (!isValidIdValue(draftId)) throw draftNotFound();
  const draft = await AiGeneratedDraft.findOne({ _id: draftId, teacherId, ...NOT_DELETED }).lean();
  if (!draft) throw draftNotFound();
  return presentAiDraft(draft);
};

const approveTeacherAiDraft = async (teacherUser, draftId, body = {}) => {
  await getVerifiedTeacher(teacherUser.id);
  if (!isValidIdValue(draftId)) throw draftNotFound();
  if (body.targetStatus !== undefined && body.targetStatus !== null && typeof body.targetStatus !== "string") {
    throw validationError("targetStatus must be a string");
  }
  const requestedTargetStatus = typeof body.targetStatus === "string" ? body.targetStatus.trim().toUpperCase() : "";
  if (requestedTargetStatus === "PUBLISHED" || body.publishImmediately === true) {
    throw new AppError(
      "Approved AI drafts can only materialize into DRAFT targets; teacher must explicitly publish afterwards",
      "AI_AUTO_PUBLISH_FORBIDDEN",
      403
    );
  }
  if (body.confirmReviewed !== true) {
    throw validationError("confirmReviewed=true is required to confirm teacher verification before saving draft");
  }
  if (body.targetAction !== undefined && body.targetAction !== null && typeof body.targetAction !== "string") {
    throw validationError("targetAction must be a string");
  }
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
    throw validationError("title must be a string");
  }
  const approvalNote = body.approvalNote !== undefined && body.approvalNote !== null
    ? assertOptionalString(body.approvalNote, "approvalNote", 1000) || null
    : null;
  const explicitClassId =
    body.classId !== undefined && body.classId !== null && body.classId !== ""
      ? assertScalarIdInput(body.classId, "classId", "Class not found", "CLASS_NOT_FOUND")
      : null;

  return runInTx(async (dbSession) => {
    const existing = await AiGeneratedDraft.findOne({ _id: draftId, teacherId: teacherUser.id, ...NOT_DELETED }).session(dbSession);
    if (!existing) throw draftNotFound();
    if (existing.status !== "DRAFT_PENDING_REVIEW") {
      throw new AppError(`Draft in status ${existing.status} cannot be approved again`, "INVALID_DRAFT_STATUS", 409);
    }

    const targetAction =
      typeof body.targetAction === "string" && body.targetAction.trim()
        ? body.targetAction.trim().toUpperCase()
        : existing.draftType === "QUIZ_QUESTIONS"
          ? "CREATE_DRAFT_ASSESSMENT"
          : "CREATE_DRAFT_LEARNING_RESOURCE";

    if (targetAction === "UPDATE_PUBLISHED_SYLLABUS") {
      throw new AppError("Published syllabus versions are immutable and cannot be modified", "SYLLABUS_VERSION_IMMUTABLE", 409);
    }

    // Acquire atomic CAS transition lock FIRST inside transaction so concurrent approvals/rejections serialize & fail cleanly
    const now = new Date();
    const locked = await AiGeneratedDraft.findOneAndUpdate(
      { _id: draftId, teacherId: teacherUser.id, status: "DRAFT_PENDING_REVIEW", ...NOT_DELETED },
      {
        $set: {
          status: "APPROVED_TO_TARGET_DRAFT",
          approvedBy: teacherUser.id,
          approvedAt: now,
          approvalNote,
        },
      },
      { session: dbSession, returnDocument: "after" }
    );
    if (!locked) {
      throw new AppError("Draft status changed concurrently", "INVALID_DRAFT_STATUS", 409);
    }

    let materializedTargetType = null;
    let materializedTargetId = null;

    if (locked.draftType === "LESSON_PLAN" && targetAction === "CREATE_DRAFT_LEARNING_RESOURCE") {
      const classId = explicitClassId || locked.classId;
      if (!classId) {
        throw validationError("classId is required to save lesson plan draft as a Class LearningResource DRAFT");
      }
      const cls = await getOwnClassInTx(teacherUser.id, classId, dbSession);
      const contentText =
        typeof locked.generatedPayload?.outline === "string"
          ? locked.generatedPayload.outline
          : JSON.stringify(locked.generatedPayload, null, 2);

      const [resource] = await LearningResource.create(
        [
          {
            scopeType: "CLASS",
            courseId: cls.courseId,
            classId: cls._id,
            teacherId: teacherUser.id,
            syllabusVersionId: locked.syllabusVersionId || null,
            title: isBlank(body.title) ? locked.title : body.title.trim().slice(0, 200),
            description: `AI Lesson Plan Draft (${locked.draftCode}) verified by teacher`,
            resourceKind: "LESSON_NOTE",
            sourceType: "TEXT_CONTENT",
            contentText,
            status: "DRAFT", // ALWAYS DRAFT; teacher must publish separately
            createdBy: teacherUser.id,
          },
        ],
        { session: dbSession }
      );
      materializedTargetType = "LearningResource";
      materializedTargetId = resource._id;
    } else if (locked.draftType === "QUIZ_QUESTIONS" && targetAction === "CREATE_DRAFT_ASSESSMENT") {
      const classId = explicitClassId || locked.classId;
      if (!classId) {
        throw validationError("classId is required to create a DRAFT Assessment from AI quiz questions");
      }
      const cls = await getOwnClassInTx(teacherUser.id, classId, dbSession);
      const questions = Array.isArray(locked.generatedPayload?.questions) ? locked.generatedPayload.questions : [];
      const totalMaxScore = questions.reduce((sum, q) => sum + Number(q.points || 1), 0);

      const [assessment] = await Assessment.create(
        [
          {
            title: isBlank(body.title) ? locked.title : body.title.trim().slice(0, 200),
            description: `AI Quiz Draft (${locked.draftCode}) verified by teacher`,
            purpose: "QUIZ",
            scopeType: "CLASS",
            courseId: cls.courseId,
            classId: cls._id,
            teacherId: teacherUser.id,
            subjectId: cls.subjectId,
            gradeLevel: cls.gradeLevel || null,
            status: "DRAFT", // ALWAYS DRAFT; teacher must verify & publish explicitly
            totalMaxScore,
            gradingMode: questions.some((q) => q.questionType === "ESSAY") ? "MIXED" : "AUTO",
            createdBy: teacherUser.id,
          },
        ],
        { session: dbSession }
      );

      if (questions.length) {
        await Question.insertMany(
          questions.map((q, idx) => ({
            assessmentId: assessment._id,
            questionOrder: idx + 1,
            questionType: q.questionType,
            prompt: q.prompt,
            options: q.options || [],
            correctOptionIds: q.correctOptionIds || [],
            acceptedAnswers: q.acceptedAnswers || [],
            points: q.points || 1,
            explanation: q.explanation || "",
            createdBy: teacherUser.id,
          })),
          { session: dbSession }
        );
      }

      materializedTargetType = "Assessment";
      materializedTargetId = assessment._id;
    } else if (targetAction !== "REVIEW_ONLY") {
      throw validationError(`Unsupported targetAction "${targetAction}" for draftType ${locked.draftType}`);
    }

    const updatedDraft = await AiGeneratedDraft.findByIdAndUpdate(
      locked._id,
      { $set: { materializedTargetType, materializedTargetId } },
      { session: dbSession, returnDocument: "after" }
    );
    return presentAiDraft(updatedDraft);
  });
};

const rejectTeacherAiDraft = async (teacherId, draftId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  if (!isValidIdValue(draftId)) throw draftNotFound();
  if (isBlank(body.reason)) throw validationError("reason is required when rejecting an AI draft");
  const rejectionReason = body.reason.trim().slice(0, 1000);

  return runInTx(async (dbSession) => {
    const updated = await AiGeneratedDraft.findOneAndUpdate(
      { _id: draftId, teacherId, status: "DRAFT_PENDING_REVIEW", ...NOT_DELETED },
      {
        $set: {
          status: "REJECTED",
          rejectedBy: teacherId,
          rejectedAt: new Date(),
          rejectionReason,
        },
      },
      { session: dbSession, returnDocument: "after" }
    );

    if (!updated) {
      const existing = await AiGeneratedDraft.findOne({ _id: draftId, teacherId, ...NOT_DELETED })
        .select("status")
        .session(dbSession)
        .lean();
      if (!existing) throw draftNotFound();
      throw new AppError(`Draft in status ${existing.status} cannot be rejected`, "INVALID_DRAFT_STATUS", 409);
    }

    return presentAiDraft(updated);
  });
};

// ============================================================================
// AI-03: Admin AI Aggregate Operational & Quality Reporting (Zero PII, Read-Only)
// ============================================================================

const adminGenerateReportSummary = async (adminUser, body = {}) => {
  const focus = assertOptionalString(body.focus, "focus", 400);
  const query = {};
  if (body.from !== undefined && body.from !== null && body.from !== "") {
    if (typeof body.from !== "string") throw validationError("from must be a valid date string");
    query.from = body.from;
  }
  if (body.to !== undefined && body.to !== null && body.to !== "") {
    if (typeof body.to !== "string") throw validationError("to must be a valid date string");
    query.to = body.to;
  }
  const subjectId = assertScalarIdInput(body.subjectId, "subjectId", "Subject not found", "SUBJECT_NOT_FOUND");
  if (subjectId) query.subjectId = subjectId;
  const categoryId = assertScalarIdInput(body.categoryId, "categoryId", "Category not found", "CATEGORY_NOT_FOUND");
  if (categoryId) query.categoryId = categoryId;

  const [dashboard, learningOverview, qualityReport] = await Promise.all([
    adminService.getDashboard(),
    learningProgressService.adminGetLearningProgressOverview(query, { page: 1, pageSize: 1, skip: 0 }),
    teachingQualityReportService.adminGetTeachingQualityReport(query, { page: 1, pageSize: 1, skip: 0 }),
  ]);

  // Strictly build anonymized, PII-free aggregate numbers ONLY (NO emails, NO teacher/student names, NO sourceIds)
  const sanitizedAggregateSnapshot = {
    users: dashboard.users,
    pending: dashboard.pending,
    training: {
      courses: dashboard.training.courses,
      classes: dashboard.training.classes,
      activeClasses: dashboard.training.activeClasses,
      upcomingClasses: dashboard.training.upcomingClasses,
      confirmedEnrollments: dashboard.training.confirmedEnrollments,
    },
    finance: {
      revenue: toNum(dashboard.finance.revenue),
      commission: toNum(dashboard.finance.commission),
      revenueThisMonth: toNum(dashboard.finance.revenueThisMonth),
      transactions: dashboard.finance.transactions,
      refunds: dashboard.finance.refunds,
    },
    scholarship: {
      openCampaigns: dashboard.scholarship.openCampaigns,
      totalFund: toNum(dashboard.scholarship.totalFund),
      allocatedFund: toNum(dashboard.scholarship.allocatedFund),
      usedFund: toNum(dashboard.scholarship.usedFund),
      allocatedPercent: dashboard.scholarship.allocatedPercent,
      studentsReceived: dashboard.scholarship.studentsReceived,
    },
    learningProgressSummary: learningOverview.summary,
    teachingQualitySummary: qualityReport.summary,
  };

  const execution = await executeGovernedAi({
    actorUser: adminUser,
    featureCode: "AI_03_ADMIN_REPORT_SUMMARY",
    operation: "SUMMARIZE_AGGREGATE_ADMIN_REPORTS",
    userPrompt: focus || "Summarize verified platform training, learning progress, and teaching quality aggregates.",
    systemPrompt:
      "You are an executive analytics assistant. Summarize ONLY the provided verified aggregate numbers. NEVER invent numbers, NEVER mention PII or individual teachers/students, and NEVER issue automated decisions.",
    contextData: sanitizedAggregateSnapshot,
    requireNumericGrounding: true,
    metadata: { queryFilters: qualityReport.filtersApplied },
  });

  const narrative =
    typeof execution.result === "string"
      ? execution.result
      : execution.result?.narrative || execution.result?.text || JSON.stringify(execution.result);

  return {
    aiUsed: true,
    mode: execution.mode,
    providerId: execution.providerId,
    modelId: execution.modelId,
    auditLogId: execution.auditLogId,
    requiresHumanReview: true,
    sideEffects: {
      reportMutated: false,
      disciplineTriggered: false,
      financialModified: false,
    },
    narrative,
    verifiedAggregateSnapshot: sanitizedAggregateSnapshot,
  };
};

// ============================================================================
// AI-04: Sponsor AI Campaign Impact Narrative (Aggregate Only, Verified Donor)
// ============================================================================

const sponsorGenerateImpactNarrative = async (sponsorUser, campaignId, body = {}) => {
  const focus = assertOptionalString(body.focus, "focus", 400);
  // Enforces campaign existence & Sponsor having >= 1 COMPLETED SponsorContribution (403 otherwise)
  const impactReport = await contributionService.getCampaignImpact(sponsorUser.id, campaignId);

  const safeAggregateContext = {
    campaignTitle: impactReport.campaign?.title || "",
    campaignStatus: impactReport.campaign?.status || "",
    expectedSlots: impactReport.campaign?.expectedSlots ?? 0,
    myContribution: {
      total: toNum(impactReport.myContribution.total),
      count: impactReport.myContribution.count,
      shareOfFund: impactReport.myContribution.shareOfFund,
    },
    fundUsage: {
      fundedAmount: toNum(impactReport.fundUsage.fundedAmount),
      allocatedAmount: toNum(impactReport.fundUsage.allocatedAmount),
      usedAmount: toNum(impactReport.fundUsage.usedAmount),
      unallocatedAmount: toNum(impactReport.fundUsage.unallocatedAmount),
      usedPercent: impactReport.fundUsage.usedPercent,
    },
    impact: impactReport.impact,
  };

  const execution = await executeGovernedAi({
    actorUser: sponsorUser,
    featureCode: "AI_04_SPONSOR_IMPACT_NARRATIVE",
    operation: "NARRATE_CAMPAIGN_IMPACT",
    targetType: "ScholarshipCampaign",
    targetId: campaignId,
    userPrompt: focus || "Write a transparent aggregate impact narrative for this scholarship campaign.",
    systemPrompt:
      "You are a nonprofit philanthropy reporting assistant. Describe ONLY the verified aggregate impact metrics provided. NEVER invent or alter financial numbers, NEVER fabricate student stories or PII.",
    contextData: safeAggregateContext,
    requireNumericGrounding: true,
    metadata: { campaignId: String(campaignId) },
  });

  const narrative =
    typeof execution.result === "string"
      ? execution.result
      : execution.result?.narrative || execution.result?.text || JSON.stringify(execution.result);

  return {
    aiUsed: true,
    mode: execution.mode,
    providerId: execution.providerId,
    modelId: execution.modelId,
    auditLogId: execution.auditLogId,
    financialDataModified: false,
    privacyPolicy: "AGGREGATE_METRICS_ONLY_ZERO_PII",
    narrative,
    verifiedImpactMetrics: safeAggregateContext,
  };
};

module.exports = {
  recommendLearningResourcesForStudent,
  generateTeacherLessonDraft,
  generateTeacherQuizDraft,
  listTeacherAiDrafts,
  getTeacherAiDraft,
  approveTeacherAiDraft,
  rejectTeacherAiDraft,
  adminGenerateReportSummary,
  sponsorGenerateImpactNarrative,
};

