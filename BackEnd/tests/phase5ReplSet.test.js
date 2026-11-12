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
  Attempt,
  Review,
  SessionReview,
  StudentProgressReview,
  TeacherViolation,
  TeacherDisciplineCase,
  TeacherEarning,
  AuditLog,
} = require("../src/models");
const reviewService = require("../src/services/reviewService");
const studentProgressReviewService = require("../src/services/studentProgressReviewService");
const learningProgressService = require("../src/services/learningProgressService");
const { hashPassword } = require("../src/utils/password");
const { signAccessToken } = require("../src/utils/jwt");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Phase 5 Real MongoMemoryReplSet Verification (LMS-10, LMS-12, LMS-14)", () => {
  let admin;
  let teacher1;
  let teacher2;
  let student1;
  let student2;
  let tokens;
  let category;
  let subjectMath;
  let courseMath;
  let classActive;
  let completedSession;
  let enrollment1;
  let enrollment2;

  const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(disconnectDB);

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");

    admin = await User.create({ email: "admin-p5@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" });
    teacher1 = await User.create({
      email: "teacher1-p5@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên Phase 5 A", verificationStatus: "VERIFIED" },
    });
    teacher2 = await User.create({
      email: "teacher2-p5@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên Phase 5 B", verificationStatus: "VERIFIED" },
    });
    student1 = await User.create({
      email: "student1-p5@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên Một" },
    });
    student2 = await User.create({
      email: "student2-p5@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên Hai" },
    });

    tokens = {
      admin: signAccessToken(admin),
      teacher1: signAccessToken(teacher1),
      teacher2: signAccessToken(teacher2),
      student1: signAccessToken(student1),
      student2: signAccessToken(student2),
    };

    category = await Category.create({
      name: "Toán học P5",
      slug: "toan-hoc-p5",
      createdBy: admin._id,
      status: "ACTIVE",
      allowedGradeLevels: ["GRADE_10"],
    });
    subjectMath = await Subject.create({
      name: "Đại số P5",
      slug: "dai-so-p5",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseMath = await Course.create({
      title: "Đại số 10 Phase 5",
      slug: "dai-so-10-p5",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subjectMath._id,
      subjectName: subjectMath.name,
      gradeLevel: "GRADE_10",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });

    classActive = await Class.create({
      courseId: courseMath._id,
      courseTitle: courseMath.title,
      categoryId: category._id,
      subjectId: subjectMath._id,
      gradeLevel: "GRADE_10",
      level: "INTERMEDIATE",
      teacherId: teacher1._id,
      teacherName: "Giáo viên Phase 5 A",
      className: "Lớp Đại số 10A",
      classType: "FREE",
      price: 0,
      capacity: 30,
      startDate: new Date(NOW - 10 * DAY),
      endDate: new Date(NOW + 20 * DAY),
      status: "IN_PROGRESS",
    });

    completedSession = await Session.create({
      classId: classActive._id,
      className: classActive.className,
      teacherId: teacher1._id,
      title: "Buổi 1: Mệnh đề & Tập hợp",
      sessionNumber: 1,
      startDatetime: new Date(NOW - 3 * HOUR),
      endDatetime: new Date(NOW - 2 * HOUR),
      actualStartAt: new Date(NOW - 3 * HOUR),
      actualEndAt: new Date(NOW - 2 * HOUR),
      status: "COMPLETED",
      lifecycleState: "COMPLETED",
      attendanceFinalizedAt: new Date(NOW - 2 * HOUR),
    });

    enrollment1 = await Enrollment.create({
      classId: classActive._id,
      courseId: courseMath._id,
      teacherId: teacher1._id,
      studentId: student1._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
      enrolledAt: new Date(NOW - 9 * DAY),
    });
    enrollment2 = await Enrollment.create({
      classId: classActive._id,
      courseId: courseMath._id,
      teacherId: teacher1._id,
      studentId: student2._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
      enrolledAt: new Date(NOW - 9 * DAY),
    });

    await SessionAttendance.create({
      sessionId: completedSession._id,
      classId: classActive._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      hasVerifiedConnection: true,
      evaluationStatus: "FINALIZED",
      attendancePercentage: 100,
    });
    await SessionAttendance.create({
      sessionId: completedSession._id,
      classId: classActive._id,
      studentId: student2._id,
      attendanceStatus: "LATE",
      hasVerifiedConnection: true,
      evaluationStatus: "FINALIZED",
      attendancePercentage: 85,
    });
  });

  // =========================================================================
  // 1. LMS-10: SessionReview & Class Review Concurrency, Partial Unique & Input Guards
  // =========================================================================
  describe("LMS-10: Concurrency, Partial Index Re-Review After Soft Delete & Input Guards", () => {
    it("rejects boolean/array/float rating inputs and non-string admin delete reason with 400 VALIDATION_ERROR", async () => {
      for (const badRating of [true, false, [5], { $gt: 0 }, 3.5, 0, 6]) {
        const res = await request(app)
          .post(`/api/sessions/${completedSession._id}/reviews`)
          .set(as("student1"))
          .send({ rating: badRating, comment: "Bad input" });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");

        const clsRes = await request(app)
          .post(`/api/classes/${classActive._id}/reviews`)
          .set(as("student1"))
          .send({ rating: badRating, comment: "Bad input" });
        expect(clsRes.statusCode).toBe(400);
        expect(clsRes.body.error).toBe("VALIDATION_ERROR");
      }

      const valid = await request(app)
        .post(`/api/sessions/${completedSession._id}/reviews`)
        .set(as("student1"))
        .send({ rating: 4, teacherPreparednessRating: 5, clarityRating: 4, comment: "Ổn" });
      expect(valid.statusCode).toBe(201);

      const badReasonDel = await request(app)
        .delete(`/api/admin/session-reviews/${valid.body.data.id}`)
        .set(as("admin"))
        .send({ reason: { $ne: null } });
      expect(badReasonDel.statusCode).toBe(400);
      expect(badReasonDel.body.error).toBe("VALIDATION_ERROR");
    });

    it("handles concurrent duplicate SessionReview creation ([201, 409]), concurrent admin soft-delete ([200, 404], 1 audit), and allows re-review after soft-delete via partial unique index", async () => {
      // 1. Race duplicate SessionReview from same student -> 1 succeeds (201), 1 fails (409 DUPLICATE_REVIEW)
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/sessions/${completedSession._id}/reviews`)
          .set(as("student1"))
          .send({ rating: 2, comment: "Lần 1A" }),
        request(app)
          .post(`/api/sessions/${completedSession._id}/reviews`)
          .set(as("student1"))
          .send({ rating: 5, comment: "Lần 1B" }),
      ]);
      const statuses = [r1.statusCode, r2.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
      expect(await SessionReview.countDocuments({ sessionId: completedSession._id, studentId: student1._id })).toBe(1);

      const createdId = r1.statusCode === 201 ? r1.body.data.id : r2.body.data.id;

      // 2. Concurrent admin soft-delete -> 1 wins 200, 1 returns 404, exactly 1 AuditLog written
      const [d1, d2] = await Promise.all([
        request(app)
          .delete(`/api/admin/session-reviews/${createdId}`)
          .set(as("admin"))
          .send({ reason: "Vi phạm ngôn từ 1" }),
        request(app)
          .delete(`/api/admin/session-reviews/${createdId}`)
          .set(as("admin"))
          .send({ reason: "Vi phạm ngôn từ 2" }),
      ]);
      expect([d1.statusCode, d2.statusCode].sort()).toEqual([200, 404]);
      expect(await AuditLog.countDocuments({ targetType: "SessionReview", action: "SESSION_REVIEW_DELETE" })).toBe(1);

      const softDeletedDoc = await SessionReview.findById(createdId).lean();
      expect(softDeletedDoc.isDeleted).toBe(true);

      // 3. Partial unique index { isDeleted: false } keeps historical soft-deleted doc AND permits re-review
      const reReview = await request(app)
        .post(`/api/sessions/${completedSession._id}/reviews`)
        .set(as("student1"))
        .send({ rating: 1, comment: "Góp ý lại sau khi gỡ spam" });
      expect(reReview.statusCode).toBe(201);
      expect(await SessionReview.countDocuments({ sessionId: completedSession._id, studentId: student1._id })).toBe(2);
      expect(
        await SessionReview.countDocuments({ sessionId: completedSession._id, studentId: student1._id, isDeleted: false })
      ).toBe(1);

      // Concurrent duplicate on active review still blocked with 409
      const secondDup = await request(app)
        .post(`/api/sessions/${completedSession._id}/reviews`)
        .set(as("student1"))
        .send({ rating: 4, comment: "Không được trùng khi bản hiện tại đang active" });
      expect(secondDup.statusCode).toBe(409);

      // Strictly zero disciplinary or earning side-effects from 1-star review
      expect(await TeacherViolation.countDocuments({ teacherId: teacher1._id })).toBe(0);
      expect(await TeacherDisciplineCase.countDocuments({ teacherId: teacher1._id })).toBe(0);
      expect(await TeacherEarning.countDocuments({ teacherId: teacher1._id })).toBe(0);
    });

    it("serializes concurrent Class Review average recalculation without lost updates", async () => {
      const [c1, c2] = await Promise.all([
        request(app).post(`/api/classes/${classActive._id}/reviews`).set(as("student1")).send({ rating: 5, comment: "Tuyệt vời" }),
        request(app).post(`/api/classes/${classActive._id}/reviews`).set(as("student2")).send({ rating: 2, comment: "Cần cải thiện" }),
      ]);
      expect(c1.statusCode).toBe(201);
      expect(c2.statusCode).toBe(201);

      const refreshedCls = await Class.findById(classActive._id).lean();
      const refreshedTeacher = await User.findById(teacher1._id).lean();
      expect(refreshedCls.ratingCount).toBe(2);
      expect(refreshedCls.ratingAverage).toBe(3.5);
      expect(refreshedTeacher.teacherProfile.ratingCount).toBe(2);
      expect(refreshedTeacher.teacherProfile.ratingAverage).toBe(3.5);
    });
  });

  // =========================================================================
  // 2. LMS-12: StudentProgressReview Concurrency CAS & Query/Payload Guards
  // =========================================================================
  describe("LMS-12: StudentProgressReview ReplSet CAS, Duplicate Milestone Race & Guards", () => {
    it("rejects boolean/object masteryScore, invalid enum/sessionId shapes, and hostile query params cleanly", async () => {
      for (const badScore of [true, false, [80], { $gt: 0 }, -1, 101]) {
        const res = await request(app)
          .post(`/api/teacher/classes/${classActive._id}/students/${student1._id}/progress-reviews`)
          .set(as("teacher1"))
          .send({ progressRating: "GOOD", masteryScore: badScore, comment: "Test score" });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("VALIDATION_ERROR");
      }

      const badSessionShape = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${student1._id}/progress-reviews`)
        .set(as("teacher1"))
        .send({ progressRating: "GOOD", sessionId: { $ne: null }, comment: "Bad sessionId" });
      expect(badSessionShape.statusCode).toBe(400);

      const badRatingType = await request(app)
        .post(`/api/teacher/classes/${classActive._id}/students/${student1._id}/progress-reviews`)
        .set(as("teacher1"))
        .send({ progressRating: ["GOOD"], comment: "Bad rating type" });
      expect(badRatingType.statusCode).toBe(400);

      // Hostile query params over HTTP (Express 5 arrays) & direct service calls ($ne operators)
      const qArr = await request(app)
        .get(`/api/teacher/classes/${classActive._id}/progress-reviews?studentId=a&studentId=b`)
        .set(as("teacher1"));
      expect(qArr.statusCode).toBe(400);
      expect(qArr.body.error).toBe("VALIDATION_ERROR");

      const qAdminArr = await request(app)
        .get("/api/admin/progress-reviews?progressRating=GOOD&progressRating=AT_RISK")
        .set(as("admin"));
      expect(qAdminArr.statusCode).toBe(400);
      expect(qAdminArr.body.error).toBe("VALIDATION_ERROR");

      await expect(
        studentProgressReviewService.adminListProgressReviews({ studentId: { $ne: null } }, { page: 1, pageSize: 20, skip: 0 })
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("handles concurrent MID_TERM creation ([201, 409]) and Pinned-Revision CAS on concurrent PATCH ([200, 409 PROGRESS_REVIEW_CONFLICT])", async () => {
      // 1. Concurrent MID_TERM creation -> 1 succeeds, 1 returns 409 PROGRESS_REVIEW_ALREADY_EXISTS
      const [m1, m2] = await Promise.all([
        request(app)
          .post(`/api/teacher/classes/${classActive._id}/students/${student1._id}/progress-reviews`)
          .set(as("teacher1"))
          .send({ periodType: "MID_TERM", progressRating: "SATISFACTORY", masteryScore: 70, comment: "Đánh giá A" }),
        request(app)
          .post(`/api/teacher/classes/${classActive._id}/students/${student1._id}/progress-reviews`)
          .set(as("teacher1"))
          .send({ periodType: "MID_TERM", progressRating: "GOOD", masteryScore: 80, comment: "Đánh giá B" }),
      ]);
      expect([m1.statusCode, m2.statusCode].sort()).toEqual([201, 409]);
      expect(
        await StudentProgressReview.countDocuments({ classId: classActive._id, studentId: student1._id, periodType: "MID_TERM" })
      ).toBe(1);

      const created = m1.statusCode === 201 ? m1.body.data : m2.body.data;
      expect(created.revisionNumber).toBe(1);

      // 2. Concurrent PATCH against rev 1 -> Pinned-Revision CAS allows only 1 winner (200) and rejects loser with 409 PROGRESS_REVIEW_CONFLICT (no 500 VersionError!)
      const [u1, u2] = await Promise.all([
        request(app)
          .patch(`/api/teacher/progress-reviews/${created.id}`)
          .set(as("teacher1"))
          .send({ progressRating: "GOOD", masteryScore: 85, comment: "Update 1", reason: "Lý do 1" }),
        request(app)
          .patch(`/api/teacher/progress-reviews/${created.id}`)
          .set(as("teacher1"))
          .send({ progressRating: "EXCELLENT", masteryScore: 95, comment: "Update 2", reason: "Lý do 2" }),
      ]);
      expect([u1.statusCode, u2.statusCode].sort()).toEqual([200, 409]);
      const loser = u1.statusCode === 409 ? u1 : u2;
      expect(loser.body.error).toBe("PROGRESS_REVIEW_CONFLICT");

      const afterRace = await StudentProgressReview.findById(created.id).lean();
      expect(afterRace.revisionNumber).toBe(2);
      expect(afterRace.revisionHistory).toHaveLength(2);
      expect(afterRace.revisionHistory.map((h) => h.revisionNumber)).toEqual([1, 2]);

      // 3. Explicit stale expectedRevisionNumber=1 is rejected cleanly with 409 PROGRESS_REVIEW_CONFLICT
      const stalePatch = await request(app)
        .patch(`/api/teacher/progress-reviews/${created.id}`)
        .set(as("teacher1"))
        .send({
          expectedRevisionNumber: 1,
          progressRating: "AT_RISK",
          comment: "Stale client",
          reason: "Should fail",
        });
      expect(stalePatch.statusCode).toBe(409);
      expect(stalePatch.body.error).toBe("PROGRESS_REVIEW_CONFLICT");

      // 4. Sequential PATCH with expectedRevisionNumber=2 advances cleanly to revision 3
      const validNextPatch = await request(app)
        .patch(`/api/teacher/progress-reviews/${created.id}`)
        .set(as("teacher1"))
        .send({
          expectedRevisionNumber: 2,
          progressRating: "EXCELLENT",
          masteryScore: 96,
          comment: "Tiến bộ vững chắc",
          reason: "Xác nhận sau kiểm tra lại",
        });
      expect(validNextPatch.statusCode).toBe(200);
      expect(validNextPatch.body.data.revisionNumber).toBe(3);
      expect(validNextPatch.body.data.revisionHistory).toHaveLength(3);
      expect(validNextPatch.body.data.revisionHistory.map((h) => h.revisionNumber)).toEqual([1, 2, 3]);
    });
  });

  // =========================================================================
  // 3. LMS-14: Learning Progress Edge Cases & Hostile Query Guards
  // =========================================================================
  describe("LMS-14: Pending Attendance Finalization, 0-Enrollment Class Metadata & Query Guards", () => {
    it("keeps presence-tracked COMPLETED session with PENDING evaluationStatus as PENDING until attendanceFinalizedAt is set", async () => {
      const pendingTrackedSession = await Session.create({
        classId: classActive._id,
        className: classActive.className,
        teacherId: teacher1._id,
        title: "Buổi 2: Chờ chốt điểm danh presence",
        sessionNumber: 2,
        startDatetime: new Date(NOW - 1 * HOUR),
        endDatetime: new Date(NOW - 10 * 60 * 1000),
        status: "COMPLETED",
        lifecycleState: "COMPLETED",
        presenceTrackingActive: true,
        attendanceFinalizedAt: null,
      });

      await SessionAttendance.create({
        sessionId: pendingTrackedSession._id,
        classId: classActive._id,
        studentId: student1._id,
        attendanceStatus: "ABSENT",
        evaluationStatus: "PENDING",
      });

      // Only Buoi 1 (FINALIZED PRESENT) counts in attendanceRate -> 100%, Buoi 2 remains pendingEvaluationCount=1!
      const beforeFin = await request(app)
        .get(`/api/me/classes/${classActive._id}/learning-progress`)
        .set(as("student1"));
      expect(beforeFin.statusCode).toBe(200);
      expect(beforeFin.body.data.attendance.evaluatedAttendanceCount).toBe(1);
      expect(beforeFin.body.data.attendance.pendingEvaluationCount).toBe(1);
      expect(beforeFin.body.data.attendance.attendanceRate).toBe(100);
      const s2Row = beforeFin.body.data.details.sessions.find(
        (s) => s.sessionId === pendingTrackedSession._id.toString()
      );
      expect(s2Row.attendanceStatus).toBe("PENDING");
      expect(s2Row.evaluationStatus).toBe("PENDING");

      // Once attendance is finalized, Buoi 2 counts accurately -> 50% (1/2)
      await Session.updateOne({ _id: pendingTrackedSession._id }, { $set: { attendanceFinalizedAt: new Date() } });
      await SessionAttendance.updateOne(
        { sessionId: pendingTrackedSession._id, studentId: student1._id },
        { $set: { evaluationStatus: "FINALIZED", attendancePercentage: 0 } }
      );

      const afterFin = await request(app)
        .get(`/api/me/classes/${classActive._id}/learning-progress`)
        .set(as("student1"));
      expect(afterFin.statusCode).toBe(200);
      expect(afterFin.body.data.attendance.evaluatedAttendanceCount).toBe(2);
      expect(afterFin.body.data.attendance.pendingEvaluationCount).toBe(0);
      expect(afterFin.body.data.attendance.attendanceRate).toBe(50);
    });

    it("reports accurate class session/assignment/assessment counts even when class has 0 enrollments and rejects hostile queries", async () => {
      const emptyClass = await Class.create({
        courseId: courseMath._id,
        courseTitle: courseMath.title,
        categoryId: category._id,
        subjectId: subjectMath._id,
        gradeLevel: "GRADE_10",
        level: "INTERMEDIATE",
        teacherId: teacher1._id,
        teacherName: "Giáo viên Phase 5 A",
        className: "Lớp Chưa Có Học Viên",
        classType: "FREE",
        price: 0,
        capacity: 25,
        status: "OPEN",
      });

      await Session.create({
        classId: emptyClass._id,
        className: emptyClass.className,
        teacherId: teacher1._id,
        title: "Buổi 1",
        status: "COMPLETED",
        startDatetime: new Date(NOW - 2 * DAY),
        endDatetime: new Date(NOW - 2 * DAY + HOUR),
      });
      await Session.create({
        classId: emptyClass._id,
        className: emptyClass.className,
        teacherId: teacher1._id,
        title: "Buổi 2",
        status: "SCHEDULED",
        startDatetime: new Date(NOW + 2 * DAY),
        endDatetime: new Date(NOW + 2 * DAY + HOUR),
      });
      await Assignment.create({
        classId: emptyClass._id,
        courseId: courseMath._id,
        teacherId: teacher1._id,
        title: "Bài tập mở đầu",
        maxScore: 100,
        status: "PUBLISHED",
        createdBy: teacher1._id,
      });
      await Assessment.create({
        title: "Quiz lớp trống",
        purpose: "QUIZ",
        scopeType: "CLASS",
        classId: emptyClass._id,
        courseId: courseMath._id,
        teacherId: teacher1._id,
        status: "PUBLISHED",
        gradingMode: "AUTO",
        totalMaxScore: 10,
        createdBy: teacher1._id,
      });

      const teacherEmpty = await request(app)
        .get(`/api/teacher/classes/${emptyClass._id}/learning-progress`)
        .set(as("teacher1"));
      expect(teacherEmpty.statusCode).toBe(200);
      expect(teacherEmpty.body.data.classSummary.enrolledStudentsCount).toBe(0);
      expect(teacherEmpty.body.data.classSummary.totalScheduledSessions).toBe(2);
      expect(teacherEmpty.body.data.classSummary.completedSessionsCount).toBe(1);
      expect(teacherEmpty.body.data.classSummary.sessionDeliveryProgress).toBe(50);
      expect(teacherEmpty.body.data.classSummary.totalPublishedAssignments).toBe(1);
      expect(teacherEmpty.body.data.classSummary.totalPublishedAssessments).toBe(1);
      expect(teacherEmpty.body.data.classSummary.classAverageAttendanceRate).toBeNull();
      expect(teacherEmpty.body.data.classSummary.classOverallGradedScorePercentage).toBeNull();

      // Hostile query guards across LMS-14 routes & service
      const badStatus = await request(app)
        .get("/api/admin/learning-progress/overview?status=BOGUS")
        .set(as("admin"));
      expect(badStatus.statusCode).toBe(400);
      expect(badStatus.body.error).toBe("VALIDATION_ERROR");

      const badSearchArr = await request(app)
        .get(`/api/teacher/classes/${classActive._id}/learning-progress?search=a&search=b`)
        .set(as("teacher1"));
      expect(badSearchArr.statusCode).toBe(400);
      expect(badSearchArr.body.error).toBe("VALIDATION_ERROR");

      const badEnrollmentStatus = await request(app)
        .get("/api/me/learning-progress?enrollmentStatus=CANCELLED")
        .set(as("student1"));
      expect(badEnrollmentStatus.statusCode).toBe(400);

      await expect(
        learningProgressService.adminGetLearningProgressOverview({ subjectId: { $ne: null } }, { page: 1, pageSize: 20, skip: 0 })
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });

      await expect(
        reviewService.adminDeleteSessionReview(admin._id, completedSession._id, { reason: 12345 })
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });
  });
});

