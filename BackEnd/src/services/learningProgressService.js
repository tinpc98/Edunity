const mongoose = require("mongoose");
const {
  Class,
  Session,
  SessionAttendance,
  Enrollment,
  Assignment,
  Submission,
  Grade,
  Assessment,
  Attempt,
  PlacementResult,
  StudentProgressReview,
  User,
} = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, escapeRegex } = require("../utils/http");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const ELIGIBLE_ENROLLMENT_STATUSES = ["CONFIRMED", "COMPLETED"];
const PRESENT_ATTENDANCE_STATUSES = ["PRESENT", "LATE", "EXCUSED"];

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const round2 = (num) => Math.round(num * 100) / 100;

const pairKey = (classId, studentId) => `${toId(classId)}:${toId(studentId)}`;

const averageNullable = (numbers) => {
  const valid = numbers.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (valid.length === 0) return null;
  return round2(valid.reduce((sum, n) => sum + n, 0) / valid.length);
};

/**
 * Core real-data aggregation engine for (classDoc, enrollmentDoc) pairs.
 * Computes honest attendance, assignments, grades, assessments, placement, and LMS-12 reviews.
 * Never fabricates default percentages (returns `null` when denominator is 0 or data is ungraded).
 */
const buildStudentClassMetricsMap = async (pairs, { includeItemDetails = false } = {}) => {
  if (!pairs || pairs.length === 0) return new Map();

  const classMap = new Map();
  const studentIdSet = new Set();
  const courseIdSet = new Set();

  for (const pair of pairs) {
    const cls = pair.classDoc;
    const cid = toId(cls._id);
    if (!classMap.has(cid)) classMap.set(cid, cls);
    if (cls.courseId) courseIdSet.add(toId(cls.courseId));
    studentIdSet.add(toId(pair.enrollmentDoc.studentId));
  }

  const classIds = [...classMap.keys()];
  const courseIds = [...courseIdSet];
  const studentIds = [...studentIdSet];

  const [
    sessions,
    attendances,
    assignments,
    submissions,
    grades,
    assessments,
    placements,
    progressReviews,
  ] = await Promise.all([
    Session.find({ classId: { $in: classIds } })
      .sort({ startDatetime: 1 })
      .select(
        "classId title sessionNumber startDatetime endDatetime status lifecycleState endReason attendanceFinalizedAt scheduleSource rescheduleMetadata"
      )
      .lean(),
    SessionAttendance.find({ classId: { $in: classIds }, studentId: { $in: studentIds } })
      .select(
        "sessionId classId studentId attendanceStatus evaluationStatus attendancePercentage hasVerifiedConnection finalizedAt"
      )
      .lean(),
    Assignment.find({
      classId: { $in: classIds },
      ...NOT_DELETED,
      status: { $in: ["PUBLISHED", "CLOSED"] },
    })
      .sort({ dueAt: 1, createdAt: 1 })
      .select("classId courseId sessionId title dueAt allowLateSubmission maxScore status publishedAt")
      .lean(),
    Submission.find({
      classId: { $in: classIds },
      studentId: { $in: studentIds },
    })
      .sort({ attemptNumber: 1, submittedAt: 1 })
      .select("assignmentId classId studentId attemptNumber submittedAt isLate status currentScore maxScoreSnapshot latestGradeId gradedAt")
      .lean(),
    Grade.find({
      classId: { $in: classIds },
      studentId: { $in: studentIds },
    })
      .select("submissionId assignmentId classId studentId score maxScore status revisionNumber gradedAt lastUpdatedAt")
      .lean(),
    Assessment.find({
      ...NOT_DELETED,
      status: "PUBLISHED",
      purpose: { $ne: "PLACEMENT" },
      $or: [
        { scopeType: { $in: ["CLASS", "SESSION"] }, classId: { $in: classIds } },
        ...(courseIds.length > 0 ? [{ scopeType: "COURSE", courseId: { $in: courseIds } }] : []),
      ],
    })
      .select("title purpose scopeType courseId classId sessionId totalMaxScore passingScore gradingMode maxAttempts")
      .lean(),
    PlacementResult.find({ studentId: { $in: studentIds }, status: "GENERATED" })
      .sort({ evaluatedAt: -1 })
      .select("studentId assessmentId subjectId courseId gradeLevel rawScore maxScore percentage recommendedLevel evaluatedAt")
      .lean(),
    StudentProgressReview.find({
      classId: { $in: classIds },
      studentId: { $in: studentIds },
    })
      .sort({ reviewedAt: -1, createdAt: -1 })
      .select(
        "classId studentId teacherId periodType milestoneRef progressRating masteryScore strengths areasForImprovement actionPlan comment reviewedAt lastUpdatedAt revisionNumber"
      )
      .lean(),
  ]);

  const assessmentIds = assessments.map((a) => a._id);
  const attempts = assessmentIds.length
    ? await Attempt.find({
        assessmentId: { $in: assessmentIds },
        studentId: { $in: studentIds },
      })
        .sort({ attemptNumber: 1, createdAt: 1 })
        .select(
          "assessmentId classId courseId studentId attemptNumber status gradingStatus totalScore maxScoreSnapshot percentage passed submittedAt gradedAt"
        )
        .lean()
    : [];

  // Index data for O(1) lookup per pair
  const sessionsByClass = new Map();
  for (const s of sessions) {
    const cid = toId(s.classId);
    if (!sessionsByClass.has(cid)) sessionsByClass.set(cid, []);
    sessionsByClass.get(cid).push(s);
  }

  const attendanceByPairSession = new Map();
  for (const a of attendances) {
    attendanceByPairSession.set(`${toId(a.classId)}:${toId(a.studentId)}:${toId(a.sessionId)}`, a);
  }

  const assignmentsByClass = new Map();
  for (const a of assignments) {
    const cid = toId(a.classId);
    if (!assignmentsByClass.has(cid)) assignmentsByClass.set(cid, []);
    assignmentsByClass.get(cid).push(a);
  }

  const submissionsByPairAssignment = new Map();
  for (const sub of submissions) {
    const key = `${toId(sub.classId)}:${toId(sub.studentId)}:${toId(sub.assignmentId)}`;
    if (!submissionsByPairAssignment.has(key)) submissionsByPairAssignment.set(key, []);
    submissionsByPairAssignment.get(key).push(sub);
  }

  const gradeBySubmissionId = new Map();
  for (const g of grades) {
    gradeBySubmissionId.set(toId(g.submissionId), g);
  }

  const assessmentsByClass = new Map();
  const assessmentsByCourse = new Map();
  for (const asmt of assessments) {
    if (["CLASS", "SESSION"].includes(asmt.scopeType) && asmt.classId) {
      const cid = toId(asmt.classId);
      if (!assessmentsByClass.has(cid)) assessmentsByClass.set(cid, []);
      assessmentsByClass.get(cid).push(asmt);
    } else if (asmt.scopeType === "COURSE" && asmt.courseId) {
      const crId = toId(asmt.courseId);
      if (!assessmentsByCourse.has(crId)) assessmentsByCourse.set(crId, []);
      assessmentsByCourse.get(crId).push(asmt);
    }
  }

  const attemptsByStudentAssessment = new Map();
  for (const att of attempts) {
    const key = `${toId(att.studentId)}:${toId(att.assessmentId)}`;
    if (!attemptsByStudentAssessment.has(key)) attemptsByStudentAssessment.set(key, []);
    attemptsByStudentAssessment.get(key).push(att);
  }

  const placementsByStudent = new Map();
  for (const pl of placements) {
    const sid = toId(pl.studentId);
    if (!placementsByStudent.has(sid)) placementsByStudent.set(sid, []);
    placementsByStudent.get(sid).push(pl);
  }

  const reviewsByPair = new Map();
  for (const rv of progressReviews) {
    const k = pairKey(rv.classId, rv.studentId);
    if (!reviewsByPair.has(k)) reviewsByPair.set(k, []);
    reviewsByPair.get(k).push(rv);
  }

  const resultMap = new Map();

  for (const { classDoc, enrollmentDoc } of pairs) {
    const cid = toId(classDoc._id);
    const sid = toId(enrollmentDoc.studentId);
    const crId = toId(classDoc.courseId);
    const enrolledAtMs = enrollmentDoc.enrolledAt ? new Date(enrollmentDoc.enrolledAt).getTime() : null;

    // 1. Attendance & Sessions
    const classSessions = sessionsByClass.get(cid) || [];
    const activeSessions = classSessions.filter(
      (s) => s.status !== "CANCELLED" && s.lifecycleState !== "RESCHEDULED"
    );
    const cancelledSessionsCount = classSessions.length - activeSessions.length;
    const completedSessionsCount = activeSessions.filter((s) => s.status === "COMPLETED").length;
    const upcomingOrLiveSessionsCount = activeSessions.length - completedSessionsCount;

    let presentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;
    let absentCount = 0;
    let implicitAbsentCount = 0;
    let notEvaluatedCount = 0;
    let pendingAttendanceCount = 0;
    const attendancePercentages = [];
    const sessionBreakdown = [];

    for (const s of activeSessions) {
      const attDoc = attendanceByPairSession.get(`${cid}:${sid}:${toId(s._id)}`) || null;
      const isCompleted = s.status === "COMPLETED";
      const isFinalizedSession = isCompleted && Boolean(s.attendanceFinalizedAt);
      const enrolledBeforeEnd =
        !enrolledAtMs || !s.endDatetime || new Date(s.endDatetime).getTime() >= enrolledAtMs;

      let effectiveStatus = "PENDING";
      let attPct = null;

      if (attDoc) {
        if (attDoc.attendanceStatus === "NOT_EVALUATED" || attDoc.evaluationStatus === "NOT_EVALUATED") {
          notEvaluatedCount += 1;
          effectiveStatus = "NOT_EVALUATED";
        } else if (
          isCompleted ||
          attDoc.evaluationStatus === "FINALIZED" ||
          attDoc.evaluationStatus === "EXCUSED"
        ) {
          if (attDoc.attendanceStatus === "PRESENT") presentCount += 1;
          else if (attDoc.attendanceStatus === "LATE") lateCount += 1;
          else if (attDoc.attendanceStatus === "EXCUSED") excusedCount += 1;
          else absentCount += 1;
          effectiveStatus = attDoc.attendanceStatus;
          if (typeof attDoc.attendancePercentage === "number" && attDoc.attendanceStatus !== "EXCUSED") {
            attPct = attDoc.attendancePercentage;
            attendancePercentages.push(attDoc.attendancePercentage);
          }
        } else {
          pendingAttendanceCount += 1;
          effectiveStatus = "PENDING";
        }
      } else if (isFinalizedSession && enrolledBeforeEnd) {
        absentCount += 1;
        implicitAbsentCount += 1;
        effectiveStatus = "ABSENT";
        attPct = 0;
        attendancePercentages.push(0);
      } else {
        pendingAttendanceCount += 1;
        effectiveStatus = "PENDING";
      }

      if (includeItemDetails) {
        sessionBreakdown.push({
          sessionId: toId(s._id),
          title: s.title,
          sessionNumber: s.sessionNumber ?? null,
          startDatetime: s.startDatetime,
          endDatetime: s.endDatetime,
          sessionStatus: s.status,
          attendanceStatus: effectiveStatus,
          attendancePercentage: attPct,
          evaluationStatus: attDoc ? attDoc.evaluationStatus : isFinalizedSession ? "FINALIZED" : "PENDING",
        });
      }
    }

    const attendedSessionsCount = presentCount + lateCount + excusedCount;
    const evaluatedAttendanceCount = attendedSessionsCount + absentCount;
    const attendanceRate =
      evaluatedAttendanceCount > 0 ? round2((attendedSessionsCount / evaluatedAttendanceCount) * 100) : null;
    const physicalPresenceRate =
      evaluatedAttendanceCount > 0 ? round2(((presentCount + lateCount) / evaluatedAttendanceCount) * 100) : null;
    const averagePresenceDurationPercentage = averageNullable(attendancePercentages);

    // 2. Assignments & Grades
    const classAssignments = assignmentsByClass.get(cid) || [];
    let submittedAssignmentsCount = 0;
    let gradedAssignmentsCount = 0;
    let pendingAssignmentGradingCount = 0;
    let lateSubmissionsCount = 0;
    let unsubmittedAssignmentsCount = 0;
    const assignmentPercentages = [];
    const assignmentBreakdown = [];

    for (const asgn of classAssignments) {
      const subList = submissionsByPairAssignment.get(`${cid}:${sid}:${toId(asgn._id)}`) || [];
      const latestSub = subList.length ? subList[subList.length - 1] : null;

      // Prefer latest graded submission/grade if any
      let resolvedGrade = null;
      if (subList.length) {
        submittedAssignmentsCount += 1;
        for (let i = subList.length - 1; i >= 0; i -= 1) {
          const g = gradeBySubmissionId.get(toId(subList[i]._id));
          if (g) {
            resolvedGrade = g;
            break;
          }
        }
        if (latestSub && latestSub.isLate) {
          lateSubmissionsCount += 1;
        }
        if (resolvedGrade) {
          gradedAssignmentsCount += 1;
          const pct = round2((resolvedGrade.score / resolvedGrade.maxScore) * 100);
          assignmentPercentages.push(pct);
        } else {
          pendingAssignmentGradingCount += 1;
        }
      } else {
        unsubmittedAssignmentsCount += 1;
      }

      if (includeItemDetails) {
        let studentStatus = "open";
        if (resolvedGrade) studentStatus = "graded";
        else if (latestSub) studentStatus = latestSub.isLate ? "late" : "submitted";

        assignmentBreakdown.push({
          assignmentId: toId(asgn._id),
          title: asgn.title,
          assignmentStatus: asgn.status,
          dueAt: asgn.dueAt || null,
          maxScore: asgn.maxScore,
          submissionStatus: studentStatus,
          attemptsUsed: subList.length,
          latestSubmittedAt: latestSub ? latestSub.submittedAt : null,
          isLate: latestSub ? Boolean(latestSub.isLate) : false,
          score: resolvedGrade ? resolvedGrade.score : null,
          maxScoreEvaluated: resolvedGrade ? resolvedGrade.maxScore : asgn.maxScore,
          percentage: resolvedGrade ? round2((resolvedGrade.score / resolvedGrade.maxScore) * 100) : null,
          gradeStatus: resolvedGrade ? resolvedGrade.status : null,
          gradedAt: resolvedGrade ? resolvedGrade.gradedAt : null,
        });
      }
    }

    const totalPublishedAssignments = classAssignments.length;
    const assignmentSubmissionRate =
      totalPublishedAssignments > 0 ? round2((submittedAssignmentsCount / totalPublishedAssignments) * 100) : null;
    const averageAssignmentScorePercentage = averageNullable(assignmentPercentages);

    // 3. Assessments & Placement
    const scopedMap = new Map();
    for (const a of assessmentsByClass.get(cid) || []) scopedMap.set(toId(a._id), a);
    for (const a of assessmentsByCourse.get(crId) || []) scopedMap.set(toId(a._id), a);
    const classAssessments = [...scopedMap.values()];

    let attemptedAssessmentsCount = 0;
    let gradedAssessmentsCount = 0;
    let pendingAssessmentManualGradingCount = 0;
    let inProgressAttemptsCount = 0;
    const assessmentPercentages = [];
    const assessmentBreakdown = [];

    for (const asmt of classAssessments) {
      const attList = attemptsByStudentAssessment.get(`${sid}:${toId(asmt._id)}`) || [];
      const submittedOrFinal = attList.filter((a) => a.status !== "IN_PROGRESS");
      if (attList.some((a) => a.status === "IN_PROGRESS")) {
        inProgressAttemptsCount += 1;
      }
      if (submittedOrFinal.length > 0) {
        attemptedAssessmentsCount += 1;
      }

      const gradedAttempts = submittedOrFinal.filter((a) =>
        ["AUTO_GRADED", "GRADED"].includes(a.gradingStatus)
      );
      const latestGraded = gradedAttempts.length ? gradedAttempts[gradedAttempts.length - 1] : null;
      const latestSubmitted = submittedOrFinal.length ? submittedOrFinal[submittedOrFinal.length - 1] : null;

      if (latestGraded) {
        gradedAssessmentsCount += 1;
        assessmentPercentages.push(latestGraded.percentage);
      } else if (submittedOrFinal.some((a) => a.gradingStatus === "PENDING_MANUAL")) {
        pendingAssessmentManualGradingCount += 1;
      }

      if (includeItemDetails) {
        assessmentBreakdown.push({
          assessmentId: toId(asmt._id),
          title: asmt.title,
          purpose: asmt.purpose,
          scopeType: asmt.scopeType,
          gradingMode: asmt.gradingMode,
          totalMaxScore: asmt.totalMaxScore,
          attemptsCount: attList.length,
          latestAttemptStatus: latestSubmitted ? latestSubmitted.status : attList.length ? attList[attList.length - 1].status : "NOT_STARTED",
          latestGradingStatus: latestGraded
            ? latestGraded.gradingStatus
            : latestSubmitted
              ? latestSubmitted.gradingStatus
              : null,
          totalScore: latestGraded ? latestGraded.totalScore : null,
          maxScore: latestGraded ? latestGraded.maxScoreSnapshot : asmt.totalMaxScore,
          percentage: latestGraded ? latestGraded.percentage : null,
          passed: latestGraded ? latestGraded.passed : null,
          gradedAt: latestGraded ? latestGraded.gradedAt : null,
        });
      }
    }

    const totalPublishedAssessments = classAssessments.length;
    const assessmentCompletionRate =
      totalPublishedAssessments > 0 ? round2((attemptedAssessmentsCount / totalPublishedAssessments) * 100) : null;
    const averageAssessmentPercentage = averageNullable(assessmentPercentages);

    const studentPlacements = placementsByStudent.get(sid) || [];
    const matchingSubjectPlacement =
      studentPlacements.find((p) => toId(p.subjectId) === toId(classDoc.subjectId)) || studentPlacements[0] || null;
    const latestPlacementResult = matchingSubjectPlacement
      ? {
          id: toId(matchingSubjectPlacement._id),
          assessmentId: toId(matchingSubjectPlacement.assessmentId),
          subjectId: toId(matchingSubjectPlacement.subjectId),
          gradeLevel: matchingSubjectPlacement.gradeLevel || null,
          rawScore: matchingSubjectPlacement.rawScore,
          maxScore: matchingSubjectPlacement.maxScore,
          percentage: matchingSubjectPlacement.percentage,
          recommendedLevel: matchingSubjectPlacement.recommendedLevel,
          evaluatedAt: matchingSubjectPlacement.evaluatedAt,
        }
      : null;

    // 4. Composite Graded Score & LMS-12 Reviews
    const allGradedItemPercentages = [...assignmentPercentages, ...assessmentPercentages];
    const overallGradedScorePercentage = averageNullable(allGradedItemPercentages);
    const sessionDeliveryProgress =
      activeSessions.length > 0 ? round2((completedSessionsCount / activeSessions.length) * 100) : null;

    const studentReviews = reviewsByPair.get(pairKey(cid, sid)) || [];
    const latestRv = studentReviews[0] || null;
    const latestProgressReview = latestRv
      ? {
          id: toId(latestRv._id),
          periodType: latestRv.periodType,
          milestoneRef: latestRv.milestoneRef || null,
          progressRating: latestRv.progressRating,
          masteryScore: latestRv.masteryScore ?? null,
          strengths: latestRv.strengths || "",
          areasForImprovement: latestRv.areasForImprovement || "",
          actionPlan: latestRv.actionPlan || "",
          comment: latestRv.comment || "",
          reviewedAt: latestRv.reviewedAt,
          lastUpdatedAt: latestRv.lastUpdatedAt || null,
          revisionNumber: latestRv.revisionNumber,
        }
      : null;

    const completenessNotes = [];
    if (classDoc.status !== "COMPLETED") completenessNotes.push("CLASS_IN_PROGRESS");
    if (activeSessions.length === 0) completenessNotes.push("NO_ACTIVE_SESSIONS");
    else if (evaluatedAttendanceCount === 0) completenessNotes.push("ATTENDANCE_PENDING_FINALIZATION");
    if (totalPublishedAssignments === 0) completenessNotes.push("NO_PUBLISHED_ASSIGNMENTS");
    else if (gradedAssignmentsCount === 0) completenessNotes.push("NO_GRADED_ASSIGNMENTS_YET");
    if (pendingAssignmentGradingCount > 0) completenessNotes.push("ASSIGNMENT_GRADING_PENDING");
    if (totalPublishedAssessments === 0) completenessNotes.push("NO_PUBLISHED_ASSESSMENTS");
    else if (gradedAssessmentsCount === 0) completenessNotes.push("NO_GRADED_ASSESSMENTS_YET");
    if (pendingAssessmentManualGradingCount > 0) completenessNotes.push("MANUAL_ASSESSMENT_GRADING_PENDING");
    if (studentReviews.length === 0) completenessNotes.push("NO_TEACHER_PROGRESS_REVIEW_YET");

    const metrics = {
      classId: cid,
      className: classDoc.className,
      classStatus: classDoc.status,
      courseId: crId,
      courseTitle: classDoc.courseTitle,
      subjectId: toId(classDoc.subjectId),
      gradeLevel: classDoc.gradeLevel || null,
      level: classDoc.level || null,
      teacherId: toId(classDoc.teacherId),
      teacherName: classDoc.teacherName || null,
      startDate: classDoc.startDate || null,
      endDate: classDoc.endDate || null,

      enrollmentId: toId(enrollmentDoc._id),
      enrollmentStatus: enrollmentDoc.enrollmentStatus,
      enrolledAt: enrollmentDoc.enrolledAt || null,

      attendance: {
        totalScheduledSessions: activeSessions.length,
        completedSessionsCount,
        upcomingOrLiveSessionsCount,
        cancelledSessionsCount,
        evaluatedAttendanceCount,
        pendingEvaluationCount: pendingAttendanceCount,
        notEvaluatedCount,
        presentCount,
        lateCount,
        excusedCount,
        absentCount,
        implicitAbsentCount,
        attendedSessionsCount,
        attendanceRate,
        physicalPresenceRate,
        averagePresenceDurationPercentage,
      },
      assignments: {
        totalPublishedAssignments,
        submittedAssignmentsCount,
        unsubmittedAssignmentsCount,
        lateSubmissionsCount,
        gradedAssignmentsCount,
        pendingGradingCount: pendingAssignmentGradingCount,
        submissionRate: assignmentSubmissionRate,
        averageScorePercentage: averageAssignmentScorePercentage,
      },
      assessments: {
        totalPublishedAssessments,
        attemptedAssessmentsCount,
        gradedAssessmentsCount,
        pendingManualGradingCount: pendingAssessmentManualGradingCount,
        inProgressAttemptsCount,
        completionRate: assessmentCompletionRate,
        averageScorePercentage: averageAssessmentPercentage,
      },
      overall: {
        overallGradedScorePercentage,
        gradedItemsCount: allGradedItemPercentages.length,
        pendingGradingTotalCount: pendingAssignmentGradingCount + pendingAssessmentManualGradingCount,
        sessionDeliveryProgress,
        progressReviewsCount: studentReviews.length,
        latestProgressReview,
        latestPlacementResult,
      },
      completeness: {
        isClassCompleted: classDoc.status === "COMPLETED",
        hasSessions: activeSessions.length > 0,
        hasAttendanceData: evaluatedAttendanceCount > 0,
        hasAssignments: totalPublishedAssignments > 0,
        hasAssignmentGrades: gradedAssignmentsCount > 0,
        hasAssessments: totalPublishedAssessments > 0,
        hasAssessmentGrades: gradedAssessmentsCount > 0,
        hasPendingGrading: pendingAssignmentGradingCount + pendingAssessmentManualGradingCount > 0,
        hasTeacherReviews: studentReviews.length > 0,
        notes: completenessNotes,
      },
    };

    if (includeItemDetails) {
      metrics.details = {
        sessions: sessionBreakdown,
        assignments: assignmentBreakdown,
        assessments: assessmentBreakdown,
        progressReviews: studentReviews.map((rv) => ({
          id: toId(rv._id),
          periodType: rv.periodType,
          milestoneRef: rv.milestoneRef || null,
          progressRating: rv.progressRating,
          masteryScore: rv.masteryScore ?? null,
          strengths: rv.strengths || "",
          areasForImprovement: rv.areasForImprovement || "",
          actionPlan: rv.actionPlan || "",
          comment: rv.comment || "",
          reviewedAt: rv.reviewedAt,
          lastUpdatedAt: rv.lastUpdatedAt || null,
          revisionNumber: rv.revisionNumber,
        })),
      };
    }

    resultMap.set(pairKey(cid, sid), metrics);
  }

  return resultMap;
};

/**
 * Snapshot compact cho StudentProgressReview (LMS-12).
 */
const computeStudentClassMetricsSnapshot = async (studentId, classDoc, enrollmentDoc) => {
  const map = await buildStudentClassMetricsMap([{ classDoc, enrollmentDoc }], { includeItemDetails: false });
  const m = map.get(pairKey(classDoc._id, studentId));
  return {
    capturedAt: new Date(),
    attendanceRate: m ? m.attendance.attendanceRate : null,
    attendedSessionsCount: m ? m.attendance.attendedSessionsCount : 0,
    absentSessionsCount: m ? m.attendance.absentCount : 0,
    evaluatedAttendanceCount: m ? m.attendance.evaluatedAttendanceCount : 0,
    assignmentAveragePercentage: m ? m.assignments.averageScorePercentage : null,
    assignmentsGradedCount: m ? m.assignments.gradedAssignmentsCount : 0,
    assignmentsSubmittedCount: m ? m.assignments.submittedAssignmentsCount : 0,
    assignmentsPublishedCount: m ? m.assignments.totalPublishedAssignments : 0,
    assessmentAveragePercentage: m ? m.assessments.averageScorePercentage : null,
    assessmentsGradedCount: m ? m.assessments.gradedAssessmentsCount : 0,
  };
};

// ---------- LMS-14 APIs ----------

/**
 * Student portfolio dashboard across confirmed/completed enrollments.
 */
const getMyLearningProgress = async (studentId, query = {}, paging) => {
  const enrollmentFilter = {
    studentId,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  };
  if (query.enrollmentStatus) {
    const reqStatus = String(query.enrollmentStatus).trim().toUpperCase();
    if (!ELIGIBLE_ENROLLMENT_STATUSES.includes(reqStatus)) {
      throw validationError(`enrollmentStatus must be one of ${ELIGIBLE_ENROLLMENT_STATUSES.join(", ")}`);
    }
    enrollmentFilter.enrollmentStatus = reqStatus;
  }
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    enrollmentFilter.classId = query.classId;
  }

  const allEnrollments = await Enrollment.find(enrollmentFilter).sort({ createdAt: -1 }).lean();
  const classIds = [...new Set(allEnrollments.map((e) => toId(e.classId)))];
  const classes = classIds.length ? await Class.find({ _id: { $in: classIds }, ...NOT_DELETED }).lean() : [];
  const classById = new Map(classes.map((c) => [toId(c._id), c]));

  const validPairs = allEnrollments
    .map((e) => ({ enrollmentDoc: e, classDoc: classById.get(toId(e.classId)) }))
    .filter((p) => Boolean(p.classDoc));

  const metricsMap = await buildStudentClassMetricsMap(validPairs, { includeItemDetails: false });
  const allClassMetrics = validPairs.map((p) => metricsMap.get(pairKey(p.classDoc._id, studentId))).filter(Boolean);

  const placementLatest = await PlacementResult.findOne({ studentId, status: "GENERATED" })
    .sort({ evaluatedAt: -1 })
    .select("assessmentId subjectId gradeLevel rawScore maxScore percentage recommendedLevel evaluatedAt")
    .lean();

  const total = allClassMetrics.length;
  const pagedItems = allClassMetrics.slice(paging.skip, paging.skip + paging.pageSize);

  const summary = {
    enrolledClassesCount: total,
    completedClassesCount: allClassMetrics.filter((c) => c.completeness.isClassCompleted).length,
    inProgressClassesCount: allClassMetrics.filter((c) => !c.completeness.isClassCompleted).length,
    averageAttendanceRate: averageNullable(allClassMetrics.map((c) => c.attendance.attendanceRate)),
    averageAssignmentScorePercentage: averageNullable(allClassMetrics.map((c) => c.assignments.averageScorePercentage)),
    averageAssessmentScorePercentage: averageNullable(allClassMetrics.map((c) => c.assessments.averageScorePercentage)),
    overallGradedScorePercentage: averageNullable(allClassMetrics.map((c) => c.overall.overallGradedScorePercentage)),
    pendingGradingTotalCount: allClassMetrics.reduce((sum, c) => sum + c.overall.pendingGradingTotalCount, 0),
    latestPlacementResult: placementLatest
      ? {
          id: toId(placementLatest._id),
          assessmentId: toId(placementLatest.assessmentId),
          subjectId: toId(placementLatest.subjectId),
          gradeLevel: placementLatest.gradeLevel || null,
          rawScore: placementLatest.rawScore,
          maxScore: placementLatest.maxScore,
          percentage: placementLatest.percentage,
          recommendedLevel: placementLatest.recommendedLevel,
          evaluatedAt: placementLatest.evaluatedAt,
        }
      : null,
  };

  return {
    summary,
    classes: paged(pagedItems, total, paging),
  };
};

/**
 * Student detailed learning progress within a specific enrolled Class.
 */
const getMyClassLearningProgress = async (studentId, classId) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const enrollment = await Enrollment.findOne({
    studentId,
    classId: cls._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  }).lean();
  if (!enrollment) {
    throw new AppError("You do not have an active or completed enrollment in this class", "NOT_ENROLLED", 403);
  }

  const metricsMap = await buildStudentClassMetricsMap([{ classDoc: cls, enrollmentDoc: enrollment }], {
    includeItemDetails: true,
  });
  return metricsMap.get(pairKey(cls._id, studentId));
};

const summarizeClassMetricsAcrossStudents = async (cls, enrollments, searchQuery = "", paging = { page: 1, pageSize: 20, skip: 0 }) => {
  const studentIds = [...new Set(enrollments.map((e) => toId(e.studentId)))];
  const users = studentIds.length
    ? await User.find({ _id: { $in: studentIds }, ...NOT_DELETED })
        .select("email studentProfile.fullName studentProfile.avatarUrl")
        .lean()
    : [];
  const userMap = new Map(users.map((u) => [toId(u._id), u]));

  const metricsMap = await buildStudentClassMetricsMap(
    enrollments.map((e) => ({ classDoc: cls, enrollmentDoc: e })),
    { includeItemDetails: false }
  );

  const allStudentRows = enrollments.map((e) => {
    const sid = toId(e.studentId);
    const u = userMap.get(sid);
    const profile = (u && u.studentProfile) || {};
    const m = metricsMap.get(pairKey(cls._id, sid));
    return {
      student: {
        id: sid,
        fullName: profile.fullName || null,
        avatarUrl: profile.avatarUrl || null,
        email: u ? u.email : null,
      },
      enrollmentId: toId(e._id),
      enrollmentStatus: e.enrollmentStatus,
      enrolledAt: e.enrolledAt || null,
      attendance: m.attendance,
      assignments: m.assignments,
      assessments: m.assessments,
      overall: m.overall,
      completeness: m.completeness,
    };
  });

  // Class-level aggregates computed across ALL enrolled students (before search/paging filter)
  const firstSample = metricsMap.values().next().value || null;
  const classSummary = {
    classId: toId(cls._id),
    className: cls.className,
    classStatus: cls.status,
    courseId: toId(cls.courseId),
    courseTitle: cls.courseTitle,
    teacherId: toId(cls.teacherId),
    teacherName: cls.teacherName || null,
    enrolledStudentsCount: allStudentRows.length,
    totalScheduledSessions: firstSample ? firstSample.attendance.totalScheduledSessions : 0,
    completedSessionsCount: firstSample ? firstSample.attendance.completedSessionsCount : 0,
    cancelledSessionsCount: firstSample ? firstSample.attendance.cancelledSessionsCount : 0,
    sessionDeliveryProgress: firstSample ? firstSample.overall.sessionDeliveryProgress : null,
    totalPublishedAssignments: firstSample ? firstSample.assignments.totalPublishedAssignments : 0,
    totalPublishedAssessments: firstSample ? firstSample.assessments.totalPublishedAssessments : 0,
    classAverageAttendanceRate: averageNullable(allStudentRows.map((r) => r.attendance.attendanceRate)),
    classAverageAssignmentScorePercentage: averageNullable(
      allStudentRows.map((r) => r.assignments.averageScorePercentage)
    ),
    classAverageAssessmentScorePercentage: averageNullable(
      allStudentRows.map((r) => r.assessments.averageScorePercentage)
    ),
    classOverallGradedScorePercentage: averageNullable(
      allStudentRows.map((r) => r.overall.overallGradedScorePercentage)
    ),
    pendingGradingTotalCount: allStudentRows.reduce((sum, r) => sum + r.overall.pendingGradingTotalCount, 0),
    reviewedStudentsCount: allStudentRows.filter((r) => r.overall.progressReviewsCount > 0).length,
    isClassCompleted: cls.status === "COMPLETED",
  };

  let filtered = allStudentRows;
  if (searchQuery) {
    const regex = new RegExp(escapeRegex(searchQuery), "i");
    filtered = allStudentRows.filter(
      (r) => regex.test(r.student.fullName || "") || regex.test(r.student.email || "")
    );
  }

  const total = filtered.length;
  const pagedStudents = filtered.slice(paging.skip, paging.skip + paging.pageSize);

  return {
    classSummary,
    students: paged(pagedStudents, total, paging),
  };
};

/**
 * Teacher class learning progress overview (only own classes).
 */
const getTeacherClassLearningProgress = async (teacherId, classId, query = {}, paging) => {
  await getVerifiedTeacher(teacherId);
  const clsDoc = await getOwnClass(teacherId, classId);
  const cls = clsDoc.toObject ? clsDoc.toObject() : clsDoc;

  const enrollments = await Enrollment.find({
    classId: cls._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  })
    .sort({ createdAt: 1 })
    .lean();

  return summarizeClassMetricsAcrossStudents(cls, enrollments, query.search ? String(query.search).trim() : "", paging);
};

/**
 * Teacher detail view of an enrolled student in their own class.
 */
const getTeacherStudentLearningProgress = async (teacherId, classId, studentId) => {
  await getVerifiedTeacher(teacherId);
  const clsDoc = await getOwnClass(teacherId, classId);
  const cls = clsDoc.toObject ? clsDoc.toObject() : clsDoc;
  assertId(studentId, "Student not found", "USER_NOT_FOUND");

  const [studentUser, enrollment] = await Promise.all([
    User.findOne({ _id: studentId, role: "STUDENT", ...NOT_DELETED })
      .select("email studentProfile.fullName studentProfile.avatarUrl")
      .lean(),
    Enrollment.findOne({
      classId: cls._id,
      studentId,
      enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
    }).lean(),
  ]);
  if (!studentUser) throw new AppError("Student not found", "USER_NOT_FOUND", 404);
  if (!enrollment) {
    throw new AppError("Student does not have an active or completed enrollment in this class", "NOT_ENROLLED", 403);
  }

  const metricsMap = await buildStudentClassMetricsMap([{ classDoc: cls, enrollmentDoc: enrollment }], {
    includeItemDetails: true,
  });
  const metrics = metricsMap.get(pairKey(cls._id, studentId));

  return {
    student: {
      id: toId(studentUser._id),
      fullName: (studentUser.studentProfile && studentUser.studentProfile.fullName) || null,
      avatarUrl: (studentUser.studentProfile && studentUser.studentProfile.avatarUrl) || null,
      email: studentUser.email,
    },
    ...metrics,
  };
};

/**
 * Admin platform-wide learning progress overview (real aggregates, filterable by class/teacher/course/subject/category/status).
 */
const adminGetLearningProgressOverview = async (query = {}, paging) => {
  const filter = { ...NOT_DELETED };
  if (query.classId) {
    assertId(query.classId, "Class not found", "CLASS_NOT_FOUND");
    filter._id = query.classId;
  }
  if (query.teacherId) {
    assertId(query.teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
    filter.teacherId = query.teacherId;
  }
  if (query.courseId) {
    assertId(query.courseId, "Course not found", "COURSE_NOT_FOUND");
    filter.courseId = query.courseId;
  }
  if (query.subjectId) {
    assertId(query.subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
    filter.subjectId = query.subjectId;
  }
  if (query.categoryId) {
    assertId(query.categoryId, "Category not found", "CATEGORY_NOT_FOUND");
    filter.categoryId = query.categoryId;
  }
  if (query.status) {
    filter.status = String(query.status).trim().toUpperCase();
  } else {
    filter.status = { $in: ["OPEN", "IN_PROGRESS", "COMPLETED"] };
  }
  if (query.search) {
    filter.className = { $regex: escapeRegex(query.search), $options: "i" };
  }

  const allClasses = await Class.find(filter).sort({ createdAt: -1 }).lean();
  const classIds = allClasses.map((c) => c._id);
  const allEnrollments = classIds.length
    ? await Enrollment.find({
        classId: { $in: classIds },
        enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
      }).lean()
    : [];

  const classById = new Map(allClasses.map((c) => [toId(c._id), c]));
  const enrollmentsByClass = new Map();
  for (const e of allEnrollments) {
    const cid = toId(e.classId);
    if (!enrollmentsByClass.has(cid)) enrollmentsByClass.set(cid, []);
    enrollmentsByClass.get(cid).push(e);
  }

  const pairs = allEnrollments
    .map((e) => ({ enrollmentDoc: e, classDoc: classById.get(toId(e.classId)) }))
    .filter((p) => Boolean(p.classDoc));
  const metricsMap = await buildStudentClassMetricsMap(pairs, { includeItemDetails: false });

  // Also count sessions/assignments even for classes that currently have 0 confirmed enrollments
  const emptyClassSessions = allClasses.length
    ? await Session.find({
        classId: { $in: allClasses.filter((c) => !(enrollmentsByClass.get(toId(c._id)) || []).length).map((c) => c._id) },
      })
        .select("classId status lifecycleState")
        .lean()
    : [];
  const emptySessionsByClass = new Map();
  for (const s of emptyClassSessions) {
    const cid = toId(s.classId);
    if (!emptySessionsByClass.has(cid)) emptySessionsByClass.set(cid, []);
    emptySessionsByClass.get(cid).push(s);
  }

  const classSummaries = allClasses.map((cls) => {
    const cid = toId(cls._id);
    const classEnrollments = enrollmentsByClass.get(cid) || [];
    const studentMetrics = classEnrollments
      .map((e) => metricsMap.get(pairKey(cid, e.studentId)))
      .filter(Boolean);

    if (studentMetrics.length === 0) {
      const sess = (emptySessionsByClass.get(cid) || []).filter(
        (s) => s.status !== "CANCELLED" && s.lifecycleState !== "RESCHEDULED"
      );
      const completed = sess.filter((s) => s.status === "COMPLETED").length;
      return {
        classId: cid,
        className: cls.className,
        classStatus: cls.status,
        courseId: toId(cls.courseId),
        courseTitle: cls.courseTitle,
        teacherId: toId(cls.teacherId),
        teacherName: cls.teacherName || null,
        enrolledStudentsCount: 0,
        totalScheduledSessions: sess.length,
        completedSessionsCount: completed,
        sessionDeliveryProgress: sess.length > 0 ? round2((completed / sess.length) * 100) : null,
        averageAttendanceRate: null,
        averageAssignmentScorePercentage: null,
        averageAssessmentScorePercentage: null,
        overallGradedScorePercentage: null,
        pendingGradingTotalCount: 0,
        reviewedStudentsCount: 0,
        hasEnrollments: false,
      };
    }

    const sample = studentMetrics[0];
    return {
      classId: cid,
      className: cls.className,
      classStatus: cls.status,
      courseId: toId(cls.courseId),
      courseTitle: cls.courseTitle,
      teacherId: toId(cls.teacherId),
      teacherName: cls.teacherName || null,
      enrolledStudentsCount: studentMetrics.length,
      totalScheduledSessions: sample.attendance.totalScheduledSessions,
      completedSessionsCount: sample.attendance.completedSessionsCount,
      sessionDeliveryProgress: sample.overall.sessionDeliveryProgress,
      averageAttendanceRate: averageNullable(studentMetrics.map((m) => m.attendance.attendanceRate)),
      averageAssignmentScorePercentage: averageNullable(
        studentMetrics.map((m) => m.assignments.averageScorePercentage)
      ),
      averageAssessmentScorePercentage: averageNullable(
        studentMetrics.map((m) => m.assessments.averageScorePercentage)
      ),
      overallGradedScorePercentage: averageNullable(
        studentMetrics.map((m) => m.overall.overallGradedScorePercentage)
      ),
      pendingGradingTotalCount: studentMetrics.reduce((s, m) => s + m.overall.pendingGradingTotalCount, 0),
      reviewedStudentsCount: studentMetrics.filter((m) => m.overall.progressReviewsCount > 0).length,
      hasEnrollments: true,
    };
  });

  const total = classSummaries.length;
  const pagedClasses = classSummaries.slice(paging.skip, paging.skip + paging.pageSize);

  const summary = {
    totalClasses: total,
    completedClassesCount: classSummaries.filter((c) => c.classStatus === "COMPLETED").length,
    activeClassesCount: classSummaries.filter((c) => ["OPEN", "IN_PROGRESS"].includes(c.classStatus)).length,
    totalEnrolledRecords: allEnrollments.length,
    averageAttendanceRate: averageNullable(classSummaries.map((c) => c.averageAttendanceRate)),
    averageAssignmentScorePercentage: averageNullable(
      classSummaries.map((c) => c.averageAssignmentScorePercentage)
    ),
    averageAssessmentScorePercentage: averageNullable(
      classSummaries.map((c) => c.averageAssessmentScorePercentage)
    ),
    overallGradedScorePercentage: averageNullable(classSummaries.map((c) => c.overallGradedScorePercentage)),
    pendingGradingTotalCount: classSummaries.reduce((s, c) => s + c.pendingGradingTotalCount, 0),
    ungradedClassesCount: classSummaries.filter((c) => c.overallGradedScorePercentage === null).length,
    classesWithoutAttendanceDataCount: classSummaries.filter((c) => c.averageAttendanceRate === null).length,
  };

  return {
    summary,
    classes: paged(pagedClasses, total, paging),
  };
};

const adminGetClassLearningProgress = async (classId, query = {}, paging) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const enrollments = await Enrollment.find({
    classId: cls._id,
    enrollmentStatus: { $in: ELIGIBLE_ENROLLMENT_STATUSES },
  })
    .sort({ createdAt: 1 })
    .lean();

  return summarizeClassMetricsAcrossStudents(cls, enrollments, query.search ? String(query.search).trim() : "", paging);
};

const adminGetStudentLearningProgress = async (studentId, query = {}, paging) => {
  assertId(studentId, "Student not found", "USER_NOT_FOUND");
  const studentUser = await User.findOne({ _id: studentId, role: "STUDENT", ...NOT_DELETED })
    .select("email status studentProfile.fullName studentProfile.avatarUrl")
    .lean();
  if (!studentUser) throw new AppError("Student not found", "USER_NOT_FOUND", 404);

  const progress = await getMyLearningProgress(studentId, query, paging);
  return {
    student: {
      id: toId(studentUser._id),
      email: studentUser.email,
      status: studentUser.status,
      fullName: (studentUser.studentProfile && studentUser.studentProfile.fullName) || null,
      avatarUrl: (studentUser.studentProfile && studentUser.studentProfile.avatarUrl) || null,
    },
    ...progress,
  };
};

module.exports = {
  buildStudentClassMetricsMap,
  computeStudentClassMetricsSnapshot,
  getMyLearningProgress,
  getMyClassLearningProgress,
  getTeacherClassLearningProgress,
  getTeacherStudentLearningProgress,
  adminGetLearningProgressOverview,
  adminGetClassLearningProgress,
  adminGetStudentLearningProgress,
};

