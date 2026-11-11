const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  SessionAttendance,
  Enrollment,
  Assignment,
  Submission,
  Grade,
  Assessment,
  Question,
  Attempt,
  PlacementResult,
  Review,
  SessionReview,
  Report,
  TeacherSubjectAuthorization,
  TeacherViolation,
  TeacherIncidentReport,
  TeacherDisciplineCase,
  SessionRefundReview,
  TeacherContractReviewPacket,
  StudentProgressReview,
  TeacherEarning,
  AuditLog,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const classCreationGateService = require("../src/services/classCreationGateService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("EDUNITY V3 — Stage 5: Learning Progress, Contract Review Coordination & Teaching Quality (LMS-12, LMS-14, TEA-16, SPO-07)", () => {
  let admin;
  let teacherA;
  let teacherB;
  let studentA;
  let studentB;
  let studentOutside;
  let category;
  let subjectMath;
  let subjectEng;
  let courseMath;
  let courseEng;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    classCreationGateService.resetDependencyVerifiers();
    await disconnectDB();
  });

  beforeEach(async () => {
    classCreationGateService.resetDependencyVerifiers();
    await clearDB();

    const passwordHash = hashPassword("password123");
    admin = await User.create({ email: "admin-stage5@test.com", passwordHash, role: "ADMIN" });
    teacherA = await User.create({
      email: "teacherA-stage5@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên A", verificationStatus: "VERIFIED" },
    });
    teacherB = await User.create({
      email: "teacherB-stage5@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên B", verificationStatus: "VERIFIED" },
    });
    studentA = await User.create({
      email: "studentA-stage5@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên A" },
    });
    studentB = await User.create({
      email: "studentB-stage5@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên B" },
    });
    studentOutside = await User.create({
      email: "studentOutside-stage5@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên Ngoài Lớp" },
    });

    category = await Category.create({
      name: "Phổ thông",
      slug: "pho-thong",
      createdBy: admin._id,
      status: "ACTIVE",
      allowedGradeLevels: ["GRADE_9", "GRADE_10"],
    });
    subjectMath = await Subject.create({
      name: "Toán",
      slug: "toan-s5",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    subjectEng = await Subject.create({
      name: "Tiếng Anh",
      slug: "tieng-anh-s5",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseMath = await Course.create({
      title: "Toán 9 Nâng cao",
      slug: "toan-9-nc",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subjectMath._id,
      subjectName: subjectMath.name,
      gradeLevel: "GRADE_9",
      level: "ADVANCED",
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseEng = await Course.create({
      title: "Tiếng Anh 10",
      slug: "anh-10",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subjectEng._id,
      subjectName: subjectEng.name,
      gradeLevel: "GRADE_10",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });
  });

  // =========================================================================
  // 1. LMS-12: Teacher Student Progress Review
  // =========================================================================
  describe("LMS-12: Teacher Student Progress Review & History", () => {
    it("enforces teacher ownership, confirmed enrollment, state/timing guards, and preserves append-only revision history", async () => {
      const now = Date.now();
      const classFutureOpen = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp Sắp Mở",
        classType: "FREE",
        price: 0,
        capacity: 20,
        startDate: new Date(now + 7 * 86400000),
        endDate: new Date(now + 37 * 86400000),
        status: "OPEN",
      });

      const classDraft = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp Nháp",
        classType: "FREE",
        price: 0,
        capacity: 20,
        status: "DRAFT",
      });

      const classActive = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp Toán Đang Học",
        classType: "FREE",
        price: 0,
        capacity: 20,
        startDate: new Date(now - 10 * 86400000),
        endDate: new Date(now + 20 * 86400000),
        status: "IN_PROGRESS",
      });

      const otherClass = await Class.create({
        courseId: courseEng._id,
        courseTitle: courseEng.title,
        categoryId: category._id,
        subjectId: subjectEng._id,
        teacherId: teacherB._id,
        teacherName: "Giáo viên B",
        className: "Lớp B",
        classType: "FREE",
        price: 0,
        capacity: 20,
        startDate: new Date(now - 5 * 86400000),
        endDate: new Date(now + 20 * 86400000),
        status: "IN_PROGRESS",
      });

      await Enrollment.create({
        classId: classFutureOpen._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
        enrolledAt: new Date(now - 86400000),
      });
      await Enrollment.create({
        classId: classDraft._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
      });
      await Enrollment.create({
        classId: classActive._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
        enrolledAt: new Date(now - 10 * 86400000),
      });
      // StudentB only has PENDING_PAYMENT in classActive -> treated as NOT enrolled
      await Enrollment.create({
        classId: classActive._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentB._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "FREE",
      });

      const completedSession = await Session.create({
        classId: classActive._id,
        className: classActive.className,
        teacherId: teacherA._id,
        title: "Buổi 1: Đại số",
        startDatetime: new Date(now - 3 * 86400000),
        endDatetime: new Date(now - 3 * 86400000 + 3600000),
        status: "COMPLETED",
        attendanceFinalizedAt: new Date(now - 3 * 86400000 + 3700000),
      });
      const cancelledSession = await Session.create({
        classId: classActive._id,
        className: classActive.className,
        teacherId: teacherA._id,
        title: "Buổi 2: Hủy",
        startDatetime: new Date(now - 2 * 86400000),
        endDatetime: new Date(now - 2 * 86400000 + 3600000),
        status: "CANCELLED",
        endReason: "INCIDENT_CANCELLED",
      });
      const futureSession = await Session.create({
        classId: classActive._id,
        className: classActive.className,
        teacherId: teacherA._id,
        title: "Buổi 3: Tương lai",
        startDatetime: new Date(now + 2 * 86400000),
        endDatetime: new Date(now + 2 * 86400000 + 3600000),
        status: "SCHEDULED",
      });
      const foreignSession = await Session.create({
        classId: otherClass._id,
        className: otherClass.className,
        teacherId: teacherB._id,
        title: "Buổi Lớp B",
        startDatetime: new Date(now - 2 * 86400000),
        endDatetime: new Date(now - 2 * 86400000 + 3600000),
        status: "COMPLETED",
      });

      await SessionAttendance.create({
        sessionId: completedSession._id,
        classId: classActive._id,
        studentId: studentA._id,
        attendanceStatus: "PRESENT",
        evaluationStatus: "FINALIZED",
        attendancePercentage: 95,
      });

      // Blocks reviewing student outside class or pending payment
      const outsideRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentOutside._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ progressRating: "GOOD", comment: "Không trong lớp" });
      expect(outsideRes.statusCode).toBe(403);
      expect(outsideRes.body.error).toBe("NOT_ENROLLED");

      const pendingEnrRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentB._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ progressRating: "GOOD", comment: "Chưa thanh toán" });
      expect(pendingEnrRes.statusCode).toBe(403);
      expect(pendingEnrRes.body.error).toBe("NOT_ENROLLED");

      // Blocks another teacher
      const wrongTeacherRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherB))
        .send({ progressRating: "GOOD", comment: "Nhầm lớp" });
      expect(wrongTeacherRes.statusCode).toBe(403);

      // Blocks DRAFT class & future class before start
      const draftRes = await request(app)
        .post(`/api/teacher/classes/${classDraft._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ progressRating: "GOOD", comment: "Lớp nháp" });
      expect(draftRes.statusCode).toBe(409);
      expect(draftRes.body.error).toBe("PROGRESS_REVIEW_NOT_ALLOWED");

      const earlyRes = await request(app)
        .post(`/api/teacher/classes/${classFutureOpen._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ progressRating: "GOOD", comment: "Chưa bắt đầu" });
      expect(earlyRes.statusCode).toBe(409);
      expect(earlyRes.body.error).toBe("PROGRESS_REVIEW_TOO_EARLY");

      // Blocks END_OF_CLASS before class finishes (futureSession is still SCHEDULED & class is IN_PROGRESS)
      const endEarlyRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ periodType: "END_OF_CLASS", progressRating: "GOOD", comment: "Chưa kết thúc lớp" });
      expect(endEarlyRes.statusCode).toBe(409);
      expect(endEarlyRes.body.error).toBe("END_OF_CLASS_REVIEW_NOT_READY");

      // Blocks invalid sessionId links
      const foreignSessRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ sessionId: foreignSession._id, progressRating: "GOOD", comment: "Sai lớp" });
      expect(foreignSessRes.statusCode).toBe(400);
      expect(foreignSessRes.body.error).toBe("SESSION_CLASS_MISMATCH");

      const cancelSessRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ sessionId: cancelledSession._id, progressRating: "GOOD", comment: "Buổi hủy" });
      expect(cancelSessRes.statusCode).toBe(409);
      expect(cancelSessRes.body.error).toBe("SESSION_CANCELLED");

      const futureSessRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({ sessionId: futureSession._id, progressRating: "GOOD", comment: "Chưa học" });
      expect(futureSessRes.statusCode).toBe(409);
      expect(futureSessRes.body.error).toBe("SESSION_NOT_STARTED");

      // Valid MID_TERM progress review linked to completedSession
      const createRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({
          periodType: "MID_TERM",
          milestoneRef: "Giữa kỳ",
          progressRating: "NEEDS_ATTENTION",
          masteryScore: 68,
          strengths: "Chuyên cần đầy đủ",
          areasForImprovement: "Cần ôn lại bài tập đại số",
          actionPlan: "Hoàn thành 2 bài tập bổ sung tuần này",
          comment: "Cần theo sát thêm",
        });
      expect(createRes.statusCode).toBe(201);
      const reviewId = createRes.body.data.id;
      expect(createRes.body.data.revisionNumber).toBe(1);
      expect(createRes.body.data.revisionHistory).toHaveLength(1);
      expect(createRes.body.data.revisionHistory[0].action).toBe("CREATED");
      expect(createRes.body.data.metricsSnapshot.attendanceRate).toBe(100);
      expect(createRes.body.data.metricsSnapshot.assignmentAveragePercentage).toBeNull();

      // Duplicate MID_TERM must return 409
      const dupRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({
          periodType: "MID_TERM",
          progressRating: "GOOD",
          comment: "Tạo trùng",
        });
      expect(dupRes.statusCode).toBe(409);
      expect(dupRes.body.error).toBe("PROGRESS_REVIEW_ALREADY_EXISTS");

      // PATCH requires reason & appends immutable revision entry
      const noReasonPatch = await request(app)
        .patch(`/api/teacher/progress-reviews/${reviewId}`)
        .set(as(teacherA))
        .send({ progressRating: "GOOD" });
      expect(noReasonPatch.statusCode).toBe(400);

      const updateRes = await request(app)
        .patch(`/api/teacher/progress-reviews/${reviewId}`)
        .set(as(teacherA))
        .send({
          progressRating: "GOOD",
          masteryScore: 82,
          comment: "Học viên tiến bộ rõ rệt sau khi ôn tập",
          reason: "Cập nhật sau khi học viên cải thiện bài thực hành",
        });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.body.data.progressRating).toBe("GOOD");
      expect(updateRes.body.data.revisionNumber).toBe(2);
      expect(updateRes.body.data.revisionHistory).toHaveLength(2);
      expect(updateRes.body.data.revisionHistory[0].previousRating).toBeNull();
      expect(updateRes.body.data.revisionHistory[0].newRating).toBe("NEEDS_ATTENTION");
      expect(updateRes.body.data.revisionHistory[1].previousRating).toBe("NEEDS_ATTENTION");
      expect(updateRes.body.data.revisionHistory[1].newRating).toBe("GOOD");

      // Student reads own reviews cleanly (no internal createdBy/updatedBy/recordedBy)
      const myReviewsRes = await request(app)
        .get(`/api/me/classes/${classActive._id}/progress-reviews`)
        .set(as(studentA));
      expect(myReviewsRes.statusCode).toBe(200);
      expect(myReviewsRes.body.data.items).toHaveLength(1);
      expect(myReviewsRes.body.data.items[0].createdBy).toBeUndefined();
      expect(myReviewsRes.body.data.items[0].revisionHistory[0].recordedBy).toBeUndefined();

      // Outside student cannot view class progress reviews
      const outsideStudentView = await request(app)
        .get(`/api/me/classes/${classActive._id}/progress-reviews`)
        .set(as(studentOutside));
      expect(outsideStudentView.statusCode).toBe(403);

      // Student lists all own reviews across classes cleanly & non-students are refused 403
      const myAllReviewsRes = await request(app)
        .get("/api/me/progress-reviews")
        .set(as(studentA));
      expect(myAllReviewsRes.statusCode).toBe(200);
      expect(myAllReviewsRes.body.data.total).toBe(1);
      expect(JSON.stringify(myAllReviewsRes.body)).not.toContain(admin._id.toString());

      expect((await request(app).get("/api/me/progress-reviews").set(as(teacherA))).statusCode).toBe(403);
      expect((await request(app).get("/api/me/progress-reviews").set(as(admin))).statusCode).toBe(403);

      // Transition classActive -> COMPLETED allows END_OF_CLASS review (with COMPLETED enrollment also accepted)
      await Class.updateOne({ _id: classActive._id }, { $set: { status: "COMPLETED" } });
      await Enrollment.updateOne({ classId: classActive._id, studentId: studentA._id }, { $set: { enrollmentStatus: "COMPLETED" } });
      const endOfClassRes = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${studentA._id}/progress-reviews`)
        .set(as(teacherA))
        .send({
          periodType: "END_OF_CLASS",
          progressRating: "EXCELLENT",
          masteryScore: 92,
          comment: "Hoàn thành xuất sắc toàn khóa",
        });
      expect(endOfClassRes.statusCode).toBe(201);
      expect(endOfClassRes.body.data.periodType).toBe("END_OF_CLASS");

      // Admin views audit history
      const adminHist = await request(app)
        .get(`/api/admin/progress-reviews/${reviewId}/history`)
        .set(as(admin));
      expect(adminHist.statusCode).toBe(200);
      expect(adminHist.body.data.history).toHaveLength(2);
    });
  });

  // =========================================================================
  // 2. LMS-14: Learning Progress Dashboard API
  // =========================================================================
  describe("LMS-14: Learning Progress Dashboard API (Real Data & Missing/Ongoing Edge Cases)", () => {
    it("handles missing grades/unfinalized attendance with null (never fake 0/100) and computes exact real aggregates once graded", async () => {
      const now = Date.now();
      const cls = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp Dashboard Real",
        classType: "FREE",
        price: 0,
        capacity: 20,
        startDate: new Date(now - 7 * 86400000),
        endDate: new Date(now + 14 * 86400000),
        status: "IN_PROGRESS",
      });

      const enrA = await Enrollment.create({
        classId: cls._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
        enrolledAt: new Date(now - 7 * 86400000),
      });

      // 1 pending session + 1 ungraded submitted assignment + 1 pending manual assessment
      const schedSession = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherA._id,
        title: "Buổi Chưa Chốt",
        startDatetime: new Date(now + 86400000),
        endDatetime: new Date(now + 86400000 + 3600000),
        status: "SCHEDULED",
      });
      await SessionAttendance.create({
        sessionId: schedSession._id,
        classId: cls._id,
        studentId: studentA._id,
        attendanceStatus: "ABSENT",
        evaluationStatus: "PENDING",
      });

      const asgn1 = await Assignment.create({
        classId: cls._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        title: "Bài tập 1",
        maxScore: 100,
        status: "PUBLISHED",
        publishedAt: new Date(now - 3 * 86400000),
        createdBy: teacherA._id,
      });
      const asgn2 = await Assignment.create({
        classId: cls._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        title: "Bài tập 2",
        maxScore: 50,
        status: "PUBLISHED",
        publishedAt: new Date(now - 2 * 86400000),
        createdBy: teacherA._id,
      });

      const sub1 = await Submission.create({
        assignmentId: asgn1._id,
        classId: cls._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentId: enrA._id,
        attemptNumber: 1,
        textAnswer: "Bài giải 1",
        submittedAt: new Date(now - 86400000),
        status: "submitted",
        maxScoreSnapshot: 100,
      });

      const quiz = await Assessment.create({
        title: "Quiz 1",
        purpose: "QUIZ",
        scopeType: "CLASS",
        classId: cls._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        status: "PUBLISHED",
        gradingMode: "MANUAL",
        totalMaxScore: 20,
        createdBy: teacherA._id,
      });
      const attemptPending = await Attempt.create({
        assessmentId: quiz._id,
        purpose: "QUIZ",
        classId: cls._id,
        courseId: courseMath._id,
        studentId: studentA._id,
        enrollmentId: enrA._id,
        attemptNumber: 1,
        status: "SUBMITTED",
        gradingStatus: "PENDING_MANUAL",
        startedAt: new Date(now - 7200000),
        submittedAt: new Date(now - 3600000),
        maxScoreSnapshot: 20,
      });

      // Check Dashboard with ungraded/unfinalized ongoing class
      const ungradedRes = await request(app)
        .get(`/api/me/classes/${cls._id}/learning-progress`)
        .set(as(studentA));
      expect(ungradedRes.statusCode).toBe(200);
      expect(ungradedRes.body.data.attendance.attendanceRate).toBeNull();
      expect(ungradedRes.body.data.attendance.pendingEvaluationCount).toBe(1);
      expect(ungradedRes.body.data.assignments.totalPublishedAssignments).toBe(2);
      expect(ungradedRes.body.data.assignments.submittedAssignmentsCount).toBe(1);
      expect(ungradedRes.body.data.assignments.pendingGradingCount).toBe(1);
      expect(ungradedRes.body.data.assignments.unsubmittedAssignmentsCount).toBe(1);
      expect(ungradedRes.body.data.assignments.submissionRate).toBe(50);
      expect(ungradedRes.body.data.assignments.averageScorePercentage).toBeNull();
      expect(ungradedRes.body.data.assessments.pendingManualGradingCount).toBe(1);
      expect(ungradedRes.body.data.assessments.averageScorePercentage).toBeNull();
      expect(ungradedRes.body.data.overall.overallGradedScorePercentage).toBeNull();
      expect(ungradedRes.body.data.completeness.isClassCompleted).toBe(false);
      expect(ungradedRes.body.data.completeness.hasPendingGrading).toBe(true);
      expect(ungradedRes.body.data.completeness.notes).toEqual(
        expect.arrayContaining([
          "CLASS_IN_PROGRESS",
          "ATTENDANCE_PENDING_FINALIZATION",
          "NO_GRADED_ASSIGNMENTS_YET",
          "MANUAL_ASSESSMENT_GRADING_PENDING",
        ])
      );

      // Now add real graded data + finalized sessions (including 1 cancelled session excluded from denominator)
      const sDone1 = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherA._id,
        title: "Buổi Đã Dạy 1",
        startDatetime: new Date(now - 5 * 86400000),
        endDatetime: new Date(now - 5 * 86400000 + 3600000),
        status: "COMPLETED",
        attendanceFinalizedAt: new Date(now - 5 * 86400000 + 3700000),
      });
      const sDone2 = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherA._id,
        title: "Buổi Đã Dạy 2",
        startDatetime: new Date(now - 4 * 86400000),
        endDatetime: new Date(now - 4 * 86400000 + 3600000),
        status: "COMPLETED",
        attendanceFinalizedAt: new Date(now - 4 * 86400000 + 3700000),
      });
      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherA._id,
        title: "Buổi Bị Hủy Do Sự Cố",
        startDatetime: new Date(now - 3 * 86400000),
        endDatetime: new Date(now - 3 * 86400000 + 3600000),
        status: "CANCELLED",
        endReason: "TEACHER_NO_SHOW",
      });

      await SessionAttendance.create({
        sessionId: sDone1._id,
        classId: cls._id,
        studentId: studentA._id,
        attendanceStatus: "PRESENT",
        evaluationStatus: "FINALIZED",
        attendancePercentage: 100,
      });
      await SessionAttendance.create({
        sessionId: sDone2._id,
        classId: cls._id,
        studentId: studentA._id,
        attendanceStatus: "ABSENT",
        evaluationStatus: "FINALIZED",
        attendancePercentage: 0,
      });

      await Grade.create({
        submissionId: sub1._id,
        assignmentId: asgn1._id,
        classId: cls._id,
        courseId: courseMath._id,
        studentId: studentA._id,
        enrollmentId: enrA._id,
        score: 85,
        maxScore: 100,
        status: "GRADED",
        revisionNumber: 1,
        gradedBy: teacherA._id,
        gradedAt: new Date(now - 10000),
      });

      await Attempt.updateOne(
        { _id: attemptPending._id },
        {
          $set: {
            status: "GRADED",
            gradingStatus: "GRADED",
            manualScore: 18,
            totalScore: 18,
            percentage: 90,
            passed: true,
            gradedBy: teacherA._id,
            gradedAt: new Date(now - 5000),
          },
        }
      );

      const placementAssessment = await Assessment.create({
        title: "Đầu vào Toán",
        purpose: "PLACEMENT",
        scopeType: "GLOBAL_PLACEMENT",
        subjectId: subjectMath._id,
        gradeLevel: "GRADE_9",
        status: "PUBLISHED",
        createdBy: admin._id,
      });
      const placementAttempt = await Attempt.create({
        assessmentId: placementAssessment._id,
        purpose: "PLACEMENT",
        studentId: studentA._id,
        attemptNumber: 1,
        status: "GRADED",
        gradingStatus: "AUTO_GRADED",
        autoScore: 16,
        totalScore: 16,
        maxScoreSnapshot: 20,
        percentage: 80,
        startedAt: new Date(now - 86400000),
        submittedAt: new Date(now - 86000000),
      });
      await PlacementResult.create({
        studentId: studentA._id,
        assessmentId: placementAssessment._id,
        attemptId: placementAttempt._id,
        subjectId: subjectMath._id,
        gradeLevel: "GRADE_9",
        rawScore: 16,
        maxScore: 20,
        percentage: 80,
        recommendedLevel: "ADVANCED",
        status: "GENERATED",
        evaluatedAt: new Date(now - 85000000),
      });

      // Verify Student class detail & portfolio
      const studentDetail = await request(app)
        .get(`/api/me/classes/${cls._id}/learning-progress`)
        .set(as(studentA));
      expect(studentDetail.statusCode).toBe(200);
      expect(studentDetail.body.data.attendance.cancelledSessionsCount).toBe(1);
      expect(studentDetail.body.data.attendance.evaluatedAttendanceCount).toBe(2);
      expect(studentDetail.body.data.attendance.attendanceRate).toBe(50); // 1 present of 2 finalized
      expect(studentDetail.body.data.assignments.averageScorePercentage).toBe(85);
      expect(studentDetail.body.data.assessments.averageScorePercentage).toBe(90);
      expect(studentDetail.body.data.overall.overallGradedScorePercentage).toBe(87.5);
      expect(studentDetail.body.data.overall.latestPlacementResult.recommendedLevel).toBe("ADVANCED");
      expect(JSON.stringify(studentDetail.body)).not.toContain(admin._id.toString());

      const portfolioRes = await request(app).get("/api/me/learning-progress").set(as(studentA));
      expect(portfolioRes.statusCode).toBe(200);
      expect(portfolioRes.body.data.summary.enrolledClassesCount).toBe(1);
      expect(portfolioRes.body.data.summary.averageAttendanceRate).toBe(50);
      expect(portfolioRes.body.data.summary.overallGradedScorePercentage).toBe(87.5);

      // RBAC checks
      expect(
        (await request(app).get(`/api/me/classes/${cls._id}/learning-progress`).set(as(studentOutside))).statusCode
      ).toBe(403);
      expect(
        (await request(app).get(`/api/teacher/classes/${cls._id}/learning-progress`).set(as(teacherB))).statusCode
      ).toBe(403);

      // Teacher class progress & single student progress
      const teacherClassProg = await request(app)
        .get(`/api/teacher/classes/${cls._id}/learning-progress`)
        .set(as(teacherA));
      expect(teacherClassProg.statusCode).toBe(200);
      expect(teacherClassProg.body.data.classSummary.enrolledStudentsCount).toBe(1);
      expect(teacherClassProg.body.data.classSummary.classOverallGradedScorePercentage).toBe(87.5);
      expect(teacherClassProg.body.data.students.items).toHaveLength(1);

      const teacherStudentProg = await request(app)
        .get(`/api/teacher/classes/${cls._id}/students/${studentA._id}/learning-progress`)
        .set(as(teacherA));
      expect(teacherStudentProg.statusCode).toBe(200);
      expect(teacherStudentProg.body.data.details.assignments).toHaveLength(2);

      // Non-STUDENT roles refused 403 on /api/me/learning-progress* & invalid IDs fail cleanly with 404 (not 500)
      expect((await request(app).get("/api/me/learning-progress").set(as(teacherA))).statusCode).toBe(403);
      expect((await request(app).get(`/api/me/classes/${cls._id}/learning-progress`).set(as(admin))).statusCode).toBe(403);
      expect((await request(app).get("/api/me/classes/not-an-id/learning-progress").set(as(studentA))).statusCode).toBe(404);

      // Admin overview & scoping + hostile search safety
      const adminOverview = await request(app)
        .get(`/api/admin/learning-progress/overview?subjectId=${subjectMath._id}`)
        .set(as(admin));
      expect(adminOverview.statusCode).toBe(200);
      expect(adminOverview.body.data.summary.totalClasses).toBe(1);
      expect(adminOverview.body.data.summary.overallGradedScorePercentage).toBe(87.5);

      const hostileSearch = await request(app)
        .get("/api/admin/learning-progress/overview")
        .query({ search: "(a+)+$" })
        .set(as(admin));
      expect(hostileSearch.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // 3. TEA-16: Incident Contract Review Coordination
  // =========================================================================
  describe("TEA-16: Incident Contract Review Coordination & Fail-Closed TEA-12 Guard", () => {
    it("correlates TIN-05E + TEA-07 + AuditLogs cleanly, fails closed when TEA-12 is absent, never mutates contracts, and hides admin IDs from teacher view", async () => {
      const cls = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp TEA-16",
        classType: "FREE",
        price: 0,
        capacity: 15,
        status: "IN_PROGRESS",
      });

      const sess1 = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherA._id,
        title: "Buổi Vi Phạm",
        startDatetime: new Date(Date.now() - 86400000),
        endDatetime: new Date(Date.now() - 82800000),
        status: "CANCELLED",
        endReason: "TEACHER_NO_SHOW",
      });

      const authDoc = await TeacherSubjectAuthorization.create({
        teacherId: teacherA._id,
        subjectId: subjectMath._id,
        categoryId: category._id,
        gradeLevel: "GRADE_9",
        level: "ADVANCED",
        status: "SUSPENDED",
        suspensionReason: "Multiple no-show violations",
        createdBy: admin._id,
      });

      const violationA = await TeacherViolation.create({
        sessionId: sess1._id,
        classId: cls._id,
        teacherId: teacherA._id,
        violationCategory: "START_LATENESS",
        violationType: "TEACHER_NO_SHOW_30M",
        severity: "NO_SHOW",
        detectedAt: new Date(Date.now() - 80000000),
        reviewStatus: "CONFIRMED",
        countsTowardDiscipline: true,
        reviewedBy: admin._id,
      });

      // Another teacher's violation to test cross-teacher link validation
      const sessB = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherB._id,
        title: "Buổi B",
        startDatetime: new Date(Date.now() - 50000000),
        endDatetime: new Date(Date.now() - 46400000),
        status: "COMPLETED",
      });
      const violationB = await TeacherViolation.create({
        sessionId: sessB._id,
        classId: cls._id,
        teacherId: teacherB._id,
        violationCategory: "START_LATENESS",
        violationType: "TEACHER_LATE_10M",
        severity: "YELLOW",
        detectedAt: new Date(Date.now() - 40000000),
        reviewStatus: "CONFIRMED",
        countsTowardDiscipline: true,
      });

      const disciplineCase = await TeacherDisciplineCase.create({
        teacherId: teacherA._id,
        triggerRule: "THREE_NO_SHOW_VIOLATIONS",
        recommendedAction: "CONTRACT_TERMINATION_REVIEW",
        triggerViolationIds: [violationA._id],
        status: "OPEN_ADMIN_REVIEW",
        autoExecutionBlocked: true,
      });

      const existingAudit = await AuditLog.create({
        actorAdminId: admin._id,
        action: "TEACHER_DISCIPLINE_CASE_EVALUATED",
        targetType: "TeacherDisciplineCase",
        targetId: disciplineCase._id,
        beforeState: null,
        afterState: { triggerRule: "THREE_NO_SHOW_VIOLATIONS" },
      });

      // Admin inspects teacher contract review readiness
      const readinessRes = await request(app)
        .get(`/api/admin/contract-reviews/teachers/${teacherA._id}/readiness`)
        .set(as(admin));
      expect(readinessRes.statusCode).toBe(200);
      expect(readinessRes.body.data.tea12DependencyStatus).toBe("BLOCKED");
      expect(readinessRes.body.data.tea12Dependency.code).toBe("CONTRACT_DEPENDENCY_BLOCKED");
      expect(readinessRes.body.data.requiresContractReview).toBe(true);
      expect(readinessRes.body.data.suggestedRecommendedAction).toBe("TERMINATION_REVIEW");
      expect(readinessRes.body.data.auditTrail.map((a) => a.id)).toContain(existingAudit._id.toString());

      // Rejects linking another teacher's violation
      const badLinkRes = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as(admin))
        .send({
          teacherId: teacherA._id,
          linkedViolationIds: [violationB._id],
          coordinationSummary: "Sai giáo viên",
        });
      expect(badLinkRes.statusCode).toBe(400);
      expect(badLinkRes.body.error).toBe("LINKED_RECORD_MISMATCH");

      // Creates packet cleanly
      const packetRes = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as(admin))
        .send({
          teacherId: teacherA._id,
          coordinationSummary: "Đề nghị ban hợp đồng xem xét chấm dứt hợp đồng do vi phạm no-show và bị đình chỉ quyền dạy.",
          severitySummary: "3 NO_SHOW / SUSPENDED TEA-07",
        });
      expect(packetRes.statusCode).toBe(201);
      const packetId = packetRes.body.data.id;
      expect(packetRes.body.data.tea12DependencyStatus).toBe("BLOCKED");
      expect(packetRes.body.data.autoExecutionBlocked).toBe(true);
      expect(packetRes.body.data.autoContractMutationApplied).toBe(false);
      expect(packetRes.body.data.linkedDisciplineCaseIds).toContain(disciplineCase._id.toString());
      expect(packetRes.body.data.linkedSubjectAuthIds).toContain(authDoc._id.toString());

      // Update status to READY_FOR_CONTRACT_TEAM
      const patchRes = await request(app)
        .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
        .set(as(admin))
        .send({
          status: "READY_FOR_CONTRACT_TEAM",
          note: "Hồ sơ bằng chứng đã đầy đủ, chờ TEA-12",
        });
      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.body.data.status).toBe("READY_FOR_CONTRACT_TEAM");

      // Attempt contract execution handoff -> fails closed with 503 CONTRACT_DEPENDENCY_BLOCKED & preserves AuditLog
      const execBlockedRes = await request(app)
        .post(`/api/admin/contract-reviews/packets/${packetId}/execute-contract-action`)
        .set(as(admin))
        .send({ note: "Thử kích hoạt hủy hợp đồng" });
      expect(execBlockedRes.statusCode).toBe(503);
      expect(execBlockedRes.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");

      // Even if TEA-12 contractVerifier IS registered, TEA-16 still refuses auto-mutation (409)
      classCreationGateService.setDependencyVerifiers({
        contractVerifier: async () => ({ id: "contract-1", status: "ACTIVE" }),
      });
      const execAuthorityRes = await request(app)
        .post(`/api/admin/contract-reviews/packets/${packetId}/execute-contract-action`)
        .set(as(admin))
        .send({ note: "Kiểm tra không tự chấm dứt vượt quyền" });
      expect(execAuthorityRes.statusCode).toBe(409);
      expect(execAuthorityRes.body.error).toBe("CONTRACT_MUTATION_OUT_OF_AUTHORITY");
      classCreationGateService.resetDependencyVerifiers();

      // Confirm original Teacher, DisciplineCase, SubjectAuth were NOT auto-mutated and AuditLogs preserved
      expect((await User.findById(teacherA._id)).status).toBe("ACTIVE");
      expect((await TeacherDisciplineCase.findById(disciplineCase._id)).status).toBe("OPEN_ADMIN_REVIEW");
      expect(await AuditLog.countDocuments({ _id: existingAudit._id })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          targetType: "TeacherContractReviewPacket",
          targetId: packetId,
          action: "CONTRACT_REVIEW_EXECUTION_BLOCKED",
        })
      ).toBe(2);

      // Teacher self-readiness MUST NOT leak any admin ID
      const teacherReadiness = await request(app)
        .get("/api/teacher/contract-review-readiness")
        .set(as(teacherA));
      expect(teacherReadiness.statusCode).toBe(200);
      expect(teacherReadiness.body.data.reviewPackets).toHaveLength(1);
      expect(JSON.stringify(teacherReadiness.body)).not.toContain(admin._id.toString());
    });
  });

  // =========================================================================
  // 4. SPO-07: Teaching Quality Reporting
  // =========================================================================
  describe("SPO-07: Admin Teaching Quality Reporting & 1:1 Source Traceability", () => {
    it("aggregates multi-source metrics accurately, handles date/subject filters, reconciles source IDs 1:1, and causes zero financial/disciplinary side effects", async () => {
      const now = Date.now();
      const clsMath = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        teacherId: teacherA._id,
        teacherName: "Giáo viên A",
        className: "Lớp Toán SPO-07",
        classType: "PAID",
        price: 500000,
        capacity: 10,
        status: "IN_PROGRESS",
      });
      const clsEng = await Class.create({
        courseId: courseEng._id,
        courseTitle: courseEng.title,
        categoryId: category._id,
        subjectId: subjectEng._id,
        teacherId: teacherB._id,
        teacherName: "Giáo viên B",
        className: "Lớp Anh SPO-07",
        classType: "PAID",
        price: 500000,
        capacity: 10,
        status: "IN_PROGRESS",
      });

      const enrA = await Enrollment.create({
        classId: clsMath._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "DIRECT_PAYMENT",
      });
      const enrB = await Enrollment.create({
        classId: clsEng._id,
        courseId: courseEng._id,
        teacherId: teacherB._id,
        studentId: studentB._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "DIRECT_PAYMENT",
      });

      // Financial ledger doc that MUST remain untouched
      const earning = await TeacherEarning.create({
        teacherId: teacherA._id,
        classId: clsMath._id,
        enrollmentId: enrA._id,
        grossAmount: 500000,
        commissionRate: 0.1,
        commissionAmount: 50000,
        netAmount: 450000,
        status: "AVAILABLE",
      });

      // Sessions for Teacher A
      const sCompleted = await Session.create({
        classId: clsMath._id,
        className: clsMath.className,
        teacherId: teacherA._id,
        title: "Buổi 1",
        startDatetime: new Date(now - 5 * 86400000),
        endDatetime: new Date(now - 5 * 86400000 + 3600000),
        status: "COMPLETED",
        lifecycleState: "AUTO_COMPLETED",
      });
      const sCancelled = await Session.create({
        classId: clsMath._id,
        className: clsMath.className,
        teacherId: teacherA._id,
        title: "Buổi 2 Vắng",
        startDatetime: new Date(now - 3 * 86400000),
        endDatetime: new Date(now - 3 * 86400000 + 3600000),
        status: "CANCELLED",
        endReason: "TEACHER_NO_SHOW",
      });
      const sMakeup = await Session.create({
        classId: clsMath._id,
        className: clsMath.className,
        teacherId: teacherA._id,
        title: "Buổi Bù",
        scheduleSource: "MAKEUP",
        startDatetime: new Date(now - 2 * 86400000),
        endDatetime: new Date(now - 2 * 86400000 + 3600000),
        status: "COMPLETED",
      });
      // Session for Teacher B (English)
      await Session.create({
        classId: clsEng._id,
        className: clsEng.className,
        teacherId: teacherB._id,
        title: "Buổi Anh 1",
        startDatetime: new Date(now - 2 * 86400000),
        endDatetime: new Date(now - 2 * 86400000 + 3600000),
        status: "COMPLETED",
      });

      const viol = await TeacherViolation.create({
        sessionId: sCancelled._id,
        classId: clsMath._id,
        teacherId: teacherA._id,
        violationCategory: "START_LATENESS",
        violationType: "TEACHER_NO_SHOW_30M",
        severity: "NO_SHOW",
        detectedAt: new Date(now - 3 * 86400000),
        reviewStatus: "CONFIRMED",
        countsTowardDiscipline: true,
      });

      const inc = await TeacherIncidentReport.create({
        sessionId: sCancelled._id,
        classId: clsMath._id,
        teacherId: teacherA._id,
        incidentType: "POWER_OUTAGE",
        description: "Mất điện khu vực",
        requestedAction: "RESCHEDULE_SESSION",
        reviewStatus: "REJECTED",
        appeals: [{ submittedBy: teacherA._id, reason: "Có giấy xác nhận điện lực" }],
      });

      const dc = await TeacherDisciplineCase.create({
        teacherId: teacherA._id,
        triggerRule: "ONE_RED_VIOLATION",
        recommendedAction: "REPUTATION_AND_REMUNERATION_REVIEW",
        triggerViolationIds: [viol._id],
        status: "OPEN_ADMIN_REVIEW",
        autoExecutionBlocked: true,
      });

      const refundRev = await SessionRefundReview.create({
        sessionId: sCancelled._id,
        classId: clsMath._id,
        courseId: courseMath._id,
        studentId: studentA._id,
        teacherId: teacherA._id,
        enrollmentId: enrA._id,
        triggerReason: "TEACHER_NO_SHOW",
        status: "NEEDS_FINANCIAL_REVIEW",
      });

      // Complaint attributed via classId only (reportedUserId = null) + complaint with both
      const compClassOnly = await Report.create({
        reporterId: studentA._id,
        classId: clsMath._id,
        type: "TEACHER_ABSENT",
        description: "Giáo viên vắng buổi 2",
        status: "OPEN",
      });
      const compDirect = await Report.create({
        reporterId: studentA._id,
        reportedUserId: teacherA._id,
        classId: clsMath._id,
        type: "TEACHING_QUALITY",
        description: "Bài giảng nhanh",
        status: "RESOLVED",
      });

      // Reviews (1 class review = 4, 1 active session review = 2, 1 soft-deleted session review = 5 that MUST be ignored)
      const classReview = await Review.create({
        enrollmentId: enrA._id,
        studentId: studentA._id,
        teacherId: teacherA._id,
        classId: clsMath._id,
        rating: 4,
        comment: "Ổn",
      });
      const att = await SessionAttendance.create({
        sessionId: sCompleted._id,
        classId: clsMath._id,
        studentId: studentA._id,
        attendanceStatus: "PRESENT",
      });
      const sessReview = await SessionReview.create({
        sessionId: sCompleted._id,
        classId: clsMath._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentId: enrA._id,
        attendanceId: att._id,
        attendanceStatusSnapshot: "PRESENT",
        reviewedSessionEndedAt: sCompleted.endDatetime,
        rating: 2,
        teacherPreparednessRating: 3,
        clarityRating: 2,
      });
      const attMakeup = await SessionAttendance.create({
        sessionId: sMakeup._id,
        classId: clsMath._id,
        studentId: studentA._id,
        attendanceStatus: "PRESENT",
      });
      await SessionReview.create({
        sessionId: sMakeup._id,
        classId: clsMath._id,
        courseId: courseMath._id,
        teacherId: teacherA._id,
        studentId: studentA._id,
        enrollmentId: enrA._id,
        attendanceId: attMakeup._id,
        attendanceStatusSnapshot: "PRESENT",
        reviewedSessionEndedAt: sMakeup.endDatetime,
        rating: 5,
        isDeleted: true, // Soft-deleted: must NEVER bias report!
      });

      // Review on English class by Student B -> should be excluded when filtering by subjectMath
      await Review.create({
        enrollmentId: enrB._id,
        studentId: studentB._id,
        teacherId: teacherB._id,
        classId: clsEng._id,
        rating: 5,
        comment: "Tuyệt vời",
      });

      // RBAC: non-admin must get 403
      expect((await request(app).get("/api/admin/teaching-quality/report").set(as(teacherA))).statusCode).toBe(403);
      expect((await request(app).get("/api/admin/teaching-quality/report").set(as(studentA))).statusCode).toBe(403);

      // Query scoped to subjectMath
      const reportRes = await request(app)
        .get(`/api/admin/teaching-quality/report?subjectId=${subjectMath._id}`)
        .set(as(admin));
      expect(reportRes.statusCode).toBe(200);
      const { summary, traceability, teachers } = reportRes.body.data;

      expect(summary.teachersEvaluatedCount).toBe(1);
      expect(summary.sessions.totalCount).toBe(3);
      expect(summary.sessions.completedCount).toBe(2);
      expect(summary.sessions.autoCompletedCount).toBe(1);
      expect(summary.sessions.cancelledCount).toBe(1);
      expect(summary.sessions.teacherNoShowCancelledCount).toBe(1);
      expect(summary.sessions.makeupSessionsCount).toBe(1);
      expect(summary.sessions.deliveryCompletionRate).toBe(66.67);

      expect(summary.violations.totalCount).toBe(1);
      expect(summary.incidentReports.appealsCount).toBe(1);
      expect(summary.disciplineCases.totalCount).toBe(1);
      expect(summary.complaints.totalCount).toBe(2);
      expect(summary.reviews.classReviews.count).toBe(1);
      expect(summary.reviews.classReviews.averageRating).toBe(4);
      expect(summary.reviews.sessionReviews.count).toBe(1);
      expect(summary.reviews.sessionReviews.averageRating).toBe(2);
      expect(summary.reviews.combined.totalReviewsCount).toBe(2);
      expect(summary.reviews.combined.weightedAverageRating).toBe(3);

      // 1:1 Source traceability reconciliation
      expect(traceability.sourceIds.violationIds).toEqual([viol._id.toString()]);
      expect(traceability.sourceIds.incidentReportIds).toEqual([inc._id.toString()]);
      expect(traceability.sourceIds.disciplineCaseIds).toEqual([dc._id.toString()]);
      expect(new Set(traceability.sourceIds.complaintReportIds)).toEqual(
        new Set([compClassOnly._id.toString(), compDirect._id.toString()])
      );
      expect(traceability.sourceIds.classReviewIds).toEqual([classReview._id.toString()]);
      expect(traceability.sourceIds.sessionReviewIds).toEqual([sessReview._id.toString()]);
      expect(traceability.sourceIds.refundReviewIds).toEqual([refundRev._id.toString()]);
      expect(traceability.sideEffectsPolicy.readOnly).toBe(true);
      expect(teachers.items).toHaveLength(1);

      // Teacher detail endpoint & date filtering / invalid query handling
      const detailRes = await request(app)
        .get(`/api/admin/teaching-quality/teachers/${teacherA._id}`)
        .set(as(admin));
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.body.data.complaints.totalCount).toBe(2);
      expect(detailRes.body.data.traceability.sourceTotals.complaints).toBe(2);

      // Date-range filtering isolates matching window (exclude sessions older than 4 days)
      const windowedRes = await request(app)
        .get(`/api/admin/teaching-quality/report?subjectId=${subjectMath._id}&from=${new Date(now - 4 * 86400000).toISOString()}`)
        .set(as(admin));
      expect(windowedRes.statusCode).toBe(200);
      expect(windowedRes.body.data.summary.sessions.totalCount).toBe(2);

      // Invalid date range or bad IDs return clean 400 / 404 (never 500)
      expect((await request(app).get("/api/admin/teaching-quality/report?from=bad-date").set(as(admin))).statusCode).toBe(400);
      expect(
        (await request(app).get(`/api/admin/teaching-quality/report?from=${new Date(now).toISOString()}&to=${new Date(now - 86400000).toISOString()}`).set(as(admin))).statusCode
      ).toBe(400);
      expect((await request(app).get("/api/admin/teaching-quality/teachers/not-an-id").set(as(admin))).statusCode).toBe(404);

      // Assert zero mutation to TeacherEarning or TeacherDisciplineCase count
      const refreshedEarning = await TeacherEarning.findById(earning._id).lean();
      expect(Number(refreshedEarning.netAmount.toString())).toBe(450000);
      expect(refreshedEarning.status).toBe("AVAILABLE");
      expect(await TeacherDisciplineCase.countDocuments({})).toBe(1);
    });
  });
});
