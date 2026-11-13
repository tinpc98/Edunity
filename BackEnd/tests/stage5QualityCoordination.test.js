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
  Review,
  Report,
  TeacherSubjectAuthorization,
  TeacherViolation,
  TeacherIncidentReport,
  TeacherDisciplineCase,
  SessionRefundReview,
  TeacherContractReviewPacket,
  TeacherEarning,
  AuditLog,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("EDUNITY V3 — Academic Quality & Incident Coordination (TEA-16, SPO-07)", () => {
  let admin;
  let teacherA;
  let teacherB;
  let studentA;
  let studentB;
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
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();

    const passwordHash = hashPassword("password123");
    admin = await User.create({ email: "admin.quality@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" });
    teacherA = await User.create({
      email: "teacher.a.quality@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên A", verificationStatus: "VERIFIED" },
    });
    teacherB = await User.create({
      email: "teacher.b.quality@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giáo viên B", verificationStatus: "VERIFIED" },
    });
    studentA = await User.create({
      email: "student.a.quality@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học sinh A" },
    });
    studentB = await User.create({
      email: "student.b.quality@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học sinh B" },
    });

    category = await Category.create({ name: "Phổ thông", slug: "pho-thong", order: 1, createdBy: admin._id });
    subjectMath = await Subject.create({ categoryId: category._id, categoryName: category.name, name: "Toán học", slug: "toan-hoc", order: 1, createdBy: admin._id });
    subjectEng = await Subject.create({ categoryId: category._id, categoryName: category.name, name: "Tiếng Anh", slug: "tieng-anh", order: 2, createdBy: admin._id });

    courseMath = await Course.create({
      subjectId: subjectMath._id,
      subjectName: "Toán học",
      categoryId: category._id,
      categoryName: "Phổ thông",
      title: "Toán 9 Nâng Cao",
      slug: "toan-9-nang-cao",
      gradeLevel: "GRADE_9",
      level: "ADVANCED",
      createdBy: admin._id,
      status: "ACTIVE",
    });
    courseEng = await Course.create({
      subjectId: subjectEng._id,
      subjectName: "Tiếng Anh",
      categoryId: category._id,
      categoryName: "Phổ thông",
      title: "Tiếng Anh Giao Tiếp",
      slug: "tieng-anh-giao-tiep",
      gradeLevel: "GRADE_9",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });
  });

  // =========================================================================
  // 1. TEA-16: Incident Contract Review Coordination
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
      });

      const incidentA = await TeacherIncidentReport.create({
        sessionId: sess1._id,
        classId: cls._id,
        teacherId: teacherA._id,
        incidentType: "OTHER",
        description: "Hỏng mạng diện rộng",
        requestedAction: "RESCHEDULE_SESSION",
        reviewStatus: "APPROVED",
      });

      const caseA = await TeacherDisciplineCase.create({
        teacherId: teacherA._id,
        triggerRule: "ONE_RED_VIOLATION",
        recommendedAction: "REPUTATION_AND_REMUNERATION_REVIEW",
        triggerViolationIds: [violationA._id],
        status: "NEEDS_POLICY_CONFIGURATION",
        autoExecutionBlocked: true,
      });

      await AuditLog.create({
        actorAdminId: admin._id,
        action: "TEACHER_SUBJECT_AUTHORIZATION_SUSPEND",
        targetType: "TeacherSubjectAuthorization",
        targetId: authDoc._id,
        afterState: { status: "SUSPENDED" },
      });

      // Teacher checks their own readiness packet
      const teacherReadinessRes = await request(app)
        .get("/api/teacher/contract-review-readiness")
        .set(as(teacherA));
      expect(teacherReadinessRes.statusCode).toBe(200);
      expect(teacherReadinessRes.body.data.requiresContractReview).toBe(true);
      expect(teacherReadinessRes.body.data.metrics.openDisciplineCasesCount).toBe(1);
      expect(teacherReadinessRes.body.data.metrics.suspendedSubjectAuthCount).toBe(1);
      // Teacher view must sanitize actorAdminId
      expect(JSON.stringify(teacherReadinessRes.body)).not.toContain(admin._id.toString());

      // Admin lists review queue
      const queueRes = await request(app).get("/api/admin/contract-reviews/incidents").set(as(admin));
      expect(queueRes.statusCode).toBe(200);
      expect(queueRes.body.data.flaggedTeachers).toHaveLength(1);
      expect(queueRes.body.data.flaggedTeachers[0].teacherId).toBe(teacherA._id.toString());

      // Admin creates packet
      const packetRes = await request(app)
        .post("/api/admin/contract-reviews/packets")
        .set(as(admin))
        .send({
          teacherId: teacherA._id,
          triggerSource: "DISCIPLINE_CASE",
          recommendedContractAction: "WARNING_NOTICE",
          coordinationSummary: "Cảnh báo vi phạm vắng mặt không phép",
          linkedDisciplineCaseIds: [caseA._id],
          linkedViolationIds: [violationA._id],
          linkedIncidentReportIds: [incidentA._id],
        });
      expect(packetRes.statusCode).toBe(201);
      const packetId = packetRes.body.data.id;
      expect(packetRes.body.data.status).toBe("DRAFT");
      expect(packetRes.body.data.linkedDisciplineCaseIds).toHaveLength(1);

      // Admin updates packet status to READY_FOR_CONTRACT_TEAM
      const updateRes = await request(app)
        .patch(`/api/admin/contract-reviews/packets/${packetId}/status`)
        .set(as(admin))
        .send({ status: "READY_FOR_CONTRACT_TEAM", note: "Sẵn sàng bàn giao" });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.body.data.status).toBe("READY_FOR_CONTRACT_TEAM");

      // Execution handoff: fail-closed 503 when TEA-12 contract integration is absent
      const handoffRes = await request(app)
        .post(`/api/admin/contract-reviews/packets/${packetId}/execute-contract-action`)
        .set(as(admin))
        .send({ note: "Yêu cầu rà soát hợp đồng" });
      expect(handoffRes.statusCode).toBe(503);
      expect(handoffRes.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");

      // Packet has execution blocked history without mutating any external contract
      const refreshedPacket = await TeacherContractReviewPacket.findById(packetId).lean();
      expect(refreshedPacket.autoExecutionBlocked).toBe(true);
      expect(refreshedPacket.history.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 2. SPO-07: Admin Teaching Quality Reporting
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
        title: "Buổi 1 Hoàn Thành",
        startDatetime: new Date(now - 3 * 86400000),
        endDatetime: new Date(now - 3 * 86400000 + 3600000),
        status: "COMPLETED",
        lifecycleState: "AUTO_COMPLETED",
      });
      const sCancelled = await Session.create({
        classId: clsMath._id,
        className: clsMath.className,
        teacherId: teacherA._id,
        title: "Buổi 2 Hủy do Vắng",
        startDatetime: new Date(now - 2 * 86400000),
        endDatetime: new Date(now - 2 * 86400000 + 3600000),
        status: "CANCELLED",
        endReason: "TEACHER_NO_SHOW",
      });
      const sMakeup = await Session.create({
        classId: clsMath._id,
        className: clsMath.className,
        teacherId: teacherA._id,
        title: "Buổi Dạy Bù",
        startDatetime: new Date(now - 1 * 86400000),
        endDatetime: new Date(now - 1 * 86400000 + 3600000),
        status: "COMPLETED",
        scheduleSource: "MAKEUP",
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

      // Complaints
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

      // Class review = 4
      const classReview = await Review.create({
        enrollmentId: enrA._id,
        studentId: studentA._id,
        teacherId: teacherA._id,
        classId: clsMath._id,
        rating: 4,
        comment: "Ổn",
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
      expect(summary.reviews.sessionReviews.count).toBe(0);
      expect(summary.reviews.sessionReviews.averageRating).toBeNull();
      expect(summary.reviews.combined.totalReviewsCount).toBe(1);
      expect(summary.reviews.combined.weightedAverageRating).toBe(4);

      // 1:1 Source traceability reconciliation
      expect(traceability.sourceIds.violationIds).toEqual([viol._id.toString()]);
      expect(traceability.sourceIds.incidentReportIds).toEqual([inc._id.toString()]);
      expect(traceability.sourceIds.disciplineCaseIds).toEqual([dc._id.toString()]);
      expect(new Set(traceability.sourceIds.complaintReportIds)).toEqual(
        new Set([compClassOnly._id.toString(), compDirect._id.toString()])
      );
      expect(traceability.sourceIds.classReviewIds).toEqual([classReview._id.toString()]);
      expect(traceability.sourceIds.sessionReviewIds).toEqual([]);
      expect(traceability.sourceIds.refundReviewIds).toEqual([refundRev._id.toString()]);
      expect(traceability.sideEffectsPolicy.readOnly).toBe(true);
      expect(teachers.items).toHaveLength(1);

      // Teacher detail endpoint
      const detailRes = await request(app)
        .get(`/api/admin/teaching-quality/teachers/${teacherA._id}`)
        .set(as(admin));
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.body.data.complaints.totalCount).toBe(2);
      expect(detailRes.body.data.traceability.sourceTotals.complaints).toBe(2);

      // Date-range filtering isolates matching window (exclude sessions older than 2.5 days)
      const windowedRes = await request(app)
        .get(`/api/admin/teaching-quality/report?subjectId=${subjectMath._id}&from=${new Date(now - 2.5 * 86400000).toISOString()}`)
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
