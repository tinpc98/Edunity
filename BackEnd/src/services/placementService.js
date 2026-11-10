const mongoose = require("mongoose");
const { Assessment, Attempt, Course, PlacementResult, Subject } = require("../models");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError } = require("../utils/http");

const NOT_DELETED = { isDeleted: { $ne: true } };
const attemptNotFound = () => new AppError("Attempt not found", "ATTEMPT_NOT_FOUND", 404);
const assessmentNotFound = () => new AppError("Placement assessment not found", "ASSESSMENT_NOT_FOUND", 404);
const resultNotFound = () => new AppError("Placement result not found", "PLACEMENT_RESULT_NOT_FOUND", 404);

const matchPlacementBand = (bands = [], percentage) => {
  for (const band of bands) {
    if (percentage >= band.minPercentage && percentage <= band.maxPercentage) {
      return band;
    }
  }
  return null;
};

const findSuggestedCourses = async (assessment, recommendedLevel) => {
  const recommendedIds = (assessment.placementConfig && assessment.placementConfig.recommendedCourseIds) || [];
  const autoRecommend = assessment.placementConfig ? assessment.placementConfig.autoRecommendCourses !== false : true;

  const curatedCourses = recommendedIds.length
    ? await Course.find({
        _id: { $in: recommendedIds },
        status: "ACTIVE",
        level: recommendedLevel,
        ...NOT_DELETED,
      })
        .select("title slug level gradeLevel subjectId subjectName categoryName description learningObjectives")
        .lean()
    : [];

  let dynamicCourses = [];
  if (autoRecommend) {
    const query = {
      status: "ACTIVE",
      level: recommendedLevel,
      ...NOT_DELETED,
    };
    if (assessment.subjectId) query.subjectId = assessment.subjectId;
    if (assessment.gradeLevel) query.gradeLevel = assessment.gradeLevel;

    dynamicCourses = await Course.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .select("title slug level gradeLevel subjectId subjectName categoryName description learningObjectives")
      .lean();
  }

  const merged = [];
  const seen = new Set();
  for (const c of [...curatedCourses, ...dynamicCourses]) {
    const id = c._id.toString();
    if (!seen.has(id)) {
      seen.add(id);
      merged.push({ ...c, id });
    }
  }
  return merged;
};

const listPlacementAssessments = async (query = {}, paging) => {
  const filter = {
    purpose: "PLACEMENT",
    status: "PUBLISHED",
    ...NOT_DELETED,
  };
  if (query.subjectId) {
    assertId(query.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    filter.subjectId = query.subjectId;
  }
  if (query.gradeLevel) {
    const grade = String(query.gradeLevel).trim().toUpperCase();
    if (!GRADE_LEVELS.includes(grade)) {
      throw new AppError(`gradeLevel must be one of ${GRADE_LEVELS.join(", ")}`, "INVALID_GRADE_LEVEL", 400);
    }
    filter.gradeLevel = grade;
  }
  if (query.courseLevel) {
    const lvl = String(query.courseLevel).trim().toUpperCase();
    if (!COURSE_LEVELS.includes(lvl)) {
      throw validationError(`courseLevel must be one of ${COURSE_LEVELS.join(", ")}`);
    }
    filter.targetCourseLevels = lvl;
  }

  const [items, total] = await Promise.all([
    Assessment.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .select("title description instructions purpose scopeType courseId subjectId gradeLevel targetCourseLevels timeLimitMinutes maxAttempts totalMaxScore passingScore gradingMode availableFrom availableUntil")
      .lean(),
    Assessment.countDocuments(filter),
  ]);

  return paged(items.map((a) => ({ ...a, id: a._id.toString() })), total, paging);
};

/**
 * LMS-01: Sinh PlacementResult từ kết quả Attempt đã chấm thực tế (status === "GRADED").
 * Tuyệt đối không mock kết quả hoặc tự ý can thiệp Enrollment/Class gate.
 */
const evaluatePlacementFromAttempt = async (studentId, attemptId) => {
  assertId(attemptId, "Attempt not found", "ATTEMPT_NOT_FOUND");
  const attempt = await Attempt.findOne({ _id: attemptId, studentId }).lean();
  if (!attempt) throw attemptNotFound();

  const assessment = await Assessment.findOne({ _id: attempt.assessmentId, ...NOT_DELETED }).lean();
  if (!assessment || assessment.purpose !== "PLACEMENT") {
    throw assessmentNotFound();
  }

  if (attempt.status !== "GRADED") {
    throw new AppError(
      `Cannot generate placement result while attempt status is "${attempt.status}" (must be GRADED)`,
      "PLACEMENT_ATTEMPT_NOT_GRADED",
      409
    );
  }

  const existing = await PlacementResult.findOne({ attemptId: attempt._id }).lean();
  if (existing) {
    const suggestedCourses = await findSuggestedCourses(assessment, existing.recommendedLevel);
    return {
      ...existing,
      id: existing._id.toString(),
      suggestedCourses,
      idempotent: true,
    };
  }

  const bands = (assessment.placementConfig && assessment.placementConfig.bands) || [];
  const matchedBand = matchPlacementBand(bands, attempt.percentage);
  if (!matchedBand) {
    throw new AppError(
      `No placement band matched score percentage ${attempt.percentage}%`,
      "PLACEMENT_BAND_NOT_CONFIGURED",
      409
    );
  }

  const suggestedCourses = await findSuggestedCourses(assessment, matchedBand.recommendedLevel);
  const recommendedCourseIds = suggestedCourses.map((c) => c._id);
  const now = new Date();

  let resultDoc;
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const existingInTx = await PlacementResult.findOne({ attemptId: attempt._id }).session(dbSession);
      if (existingInTx) {
        resultDoc = existingInTx;
        return;
      }

      // Supersede prior GENERATED placement results for same (student, subject, gradeLevel) while preserving history
      await PlacementResult.updateMany(
        {
          studentId,
          subjectId: assessment.subjectId || null,
          gradeLevel: assessment.gradeLevel || null,
          status: "GENERATED",
        },
        { $set: { status: "SUPERSEDED" } },
        { session: dbSession }
      );

      [resultDoc] = await PlacementResult.create(
        [
          {
            studentId,
            assessmentId: assessment._id,
            attemptId: attempt._id,
            subjectId: assessment.subjectId || null,
            courseId: assessment.courseId || null,
            gradeLevel: assessment.gradeLevel || null,
            rawScore: attempt.totalScore,
            maxScore: attempt.maxScoreSnapshot,
            percentage: attempt.percentage,
            recommendedLevel: matchedBand.recommendedLevel,
            recommendedCourseIds,
            matchedBandSummary: matchedBand.summary || "",
            status: "GENERATED",
            evaluatedAt: now,
          },
        ],
        { session: dbSession }
      );
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const dup = await PlacementResult.findOne({ attemptId: attempt._id }).lean();
      if (dup) {
        return {
          ...dup,
          id: dup._id.toString(),
          suggestedCourses,
          idempotent: true,
        };
      }
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  return {
    ...resultDoc.toObject(),
    id: resultDoc._id.toString(),
    suggestedCourses,
    idempotent: false,
  };
};

const listMyPlacementResults = async (studentId, query = {}, paging) => {
  const filter = { studentId };
  if (query.subjectId) {
    assertId(query.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    filter.subjectId = query.subjectId;
  }
  if (query.gradeLevel) {
    filter.gradeLevel = String(query.gradeLevel).trim().toUpperCase();
  }
  if (query.status) filter.status = String(query.status).trim().toUpperCase();

  const [items, total] = await Promise.all([
    PlacementResult.find(filter).sort({ evaluatedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    PlacementResult.countDocuments(filter),
  ]);

  const allCourseIds = [...new Set(items.flatMap((r) => r.recommendedCourseIds || []))];
  const courses = allCourseIds.length
    ? await Course.find({ _id: { $in: allCourseIds }, status: "ACTIVE", ...NOT_DELETED })
        .select("title slug level gradeLevel subjectName categoryName")
        .lean()
    : [];
  const courseMap = new Map(courses.map((c) => [c._id.toString(), { ...c, id: c._id.toString() }]));

  const subjectIds = [...new Set(items.map((r) => r.subjectId).filter(Boolean))];
  const subjects = subjectIds.length ? await Subject.find({ _id: { $in: subjectIds } }).select("name slug").lean() : [];
  const subjectMap = new Map(subjects.map((s) => [s._id.toString(), s.name]));

  return paged(
    items.map((r) => ({
      ...r,
      id: r._id.toString(),
      subjectName: r.subjectId ? subjectMap.get(r.subjectId.toString()) || null : null,
      suggestedCourses: (r.recommendedCourseIds || []).map((cid) => courseMap.get(cid.toString())).filter(Boolean),
    })),
    total,
    paging
  );
};

const getMyPlacementResult = async (studentId, resultId) => {
  assertId(resultId, "Placement result not found", "PLACEMENT_RESULT_NOT_FOUND");
  const result = await PlacementResult.findOne({ _id: resultId, studentId }).lean();
  if (!result) throw resultNotFound();

  const suggestedCourses = result.recommendedCourseIds && result.recommendedCourseIds.length
    ? await Course.find({
        _id: { $in: result.recommendedCourseIds },
        status: "ACTIVE",
        ...NOT_DELETED,
      })
        .select("title slug level gradeLevel subjectName categoryName description learningObjectives")
        .lean()
    : [];

  return {
    ...result,
    id: result._id.toString(),
    suggestedCourses: suggestedCourses.map((c) => ({ ...c, id: c._id.toString() })),
  };
};

const adminListPlacementResults = async (query = {}, paging) => {
  const filter = {};
  if (query.assessmentId) {
    assertId(query.assessmentId, "Assessment not found", "ASSESSMENT_NOT_FOUND");
    filter.assessmentId = query.assessmentId;
  }
  if (query.studentId) {
    assertId(query.studentId, "Student not found", "NOT_FOUND");
    filter.studentId = query.studentId;
  }
  if (query.recommendedLevel) {
    filter.recommendedLevel = String(query.recommendedLevel).trim().toUpperCase();
  }

  const [items, total] = await Promise.all([
    PlacementResult.find(filter).sort({ evaluatedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    PlacementResult.countDocuments(filter),
  ]);
  return paged(items.map((r) => ({ ...r, id: r._id.toString() })), total, paging);
};

module.exports = {
  listPlacementAssessments,
  evaluatePlacementFromAttempt,
  listMyPlacementResults,
  getMyPlacementResult,
  adminListPlacementResults,
};

