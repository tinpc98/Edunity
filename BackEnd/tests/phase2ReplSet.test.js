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
  Enrollment,
  SyllabusVersion,
  CurriculumUnit,
  CoursePricingPolicy,
  TeacherSubjectAuthorization,
  SessionRescheduleRequest,
  TeacherScheduleLock,
  AuditLog,
  Notification,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { toNum } = require("../src/utils/money");
const syllabusService = require("../src/services/syllabusService");
const coursePricingPolicyService = require("../src/services/coursePricingPolicyService");
const classCreationGateService = require("../src/services/classCreationGateService");
const teacherClassService = require("../src/services/teacherClassService");
const adminClassService = require("../src/services/adminClassService");
const sessionService = require("../src/services/sessionService");
const incidentService = require("../src/services/sessionIncidentService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("Phase 2 Real MongoMemoryReplSet Verification (TEA-07, CUR-09, CUR-10, CUR-11)", () => {
  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    classCreationGateService.resetDependencyVerifiers();
  });

  afterEach(() => {
    classCreationGateService.resetDependencyVerifiers();
  });

  const bootstrap = async () => {
    const passwordHash = hashPassword("password123");
    const admin = await User.create({ email: "admin-p2@test.com", passwordHash, role: "ADMIN", status: "ACTIVE" });
    const teacher = await User.create({
      email: "teacher-p2@test.com",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Thầy Lâm Phase 2", verificationStatus: "VERIFIED" },
    });
    const student = await User.create({
      email: "student-p2@test.com",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học sinh Phase 2" },
    });

    const cat = await Category.create({ name: "Toán THPT", slug: "toan-thpt-p2", createdBy: admin._id, status: "ACTIVE" });
    const sub = await Subject.create({
      name: "Toán",
      slug: "toan-p2",
      categoryId: cat._id,
      categoryName: cat.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const course = await Course.create({
      title: "Toán 12 Chuyên đề",
      slug: "toan-12-p2",
      categoryId: cat._id,
      categoryName: cat.name,
      subjectId: sub._id,
      subjectName: sub.name,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      createdBy: admin._id,
      status: "ACTIVE",
    });

    const sv1 = await syllabusService.createDraftVersion(admin._id, course._id.toString(), {
      title: "Giáo trình v1",
      summary: "Bản v1",
    });
    await syllabusService.addUnit(admin._id, course._id.toString(), sv1._id.toString(), {
      title: "Hàm số",
      durationMinutes: 90,
    });
    await syllabusService.publishVersion(admin._id, course._id.toString(), sv1._id.toString());

    const refreshedCourse = await Course.findById(course._id).lean();

    const policyV1 = await coursePricingPolicyService.createPolicyVersion(admin._id, {
      scopeType: "COURSE",
      courseId: course._id,
      classType: "PAID",
      allowFree: false,
      name: "Policy Khóa Toán 12 v1",
      minPrice: 300000,
      maxPrice: 1200000,
      minSessions: 2,
      maxSessions: 10,
      effectiveFrom: new Date(Date.now() - 60000),
      status: "ACTIVE",
      changeReason: "Initial v1",
    });

    return { admin, teacher, student, cat, sub, course: refreshedCourse, sv1, policyV1 };
  };

  // =========================================================================
  // 1. TEA-07 + CUR-09 + CUR-10 + approveClass Bypass Closure
  // =========================================================================
  test("TEA-07, CUR-09 & CUR-10: Closes approveClass bypass, keeps TEA-12 fail-closed, validates CUR-07 sessions & freezes immutable snapshots", async () => {
    const { admin, teacher, student, sub, course, sv1, policyV1 } = await bootstrap();

    expect(classCreationGateService.getDependencyStatus()).toEqual({
      cur07PricingPolicyReady: true,
      tea12ContractReady: false,
    });

    // Step 1: TEA-07 HTTP lifecycle & redaction
    const reqAuth = await request(app)
      .post("/api/teacher/subject-authorizations")
      .set(as(teacher))
      .send({ subjectId: sub._id, gradeLevel: "GRADE_12", level: "INTERMEDIATE", requestNote: "Có bằng sư phạm" })
      .expect(201);
    const authId = reqAuth.body.data.id || reqAuth.body.data._id;
    expect(reqAuth.body.data.status).toBe("PENDING");
    expect(reqAuth.body.data.createdBy).toBeUndefined();

    // PENDING TEA-07 blocks createClass (403)
    await expect(
      teacherClassService.createClass(
        teacher._id,
        { courseId: course._id, className: "Blocked Pending", classType: "PAID", price: 500000, capacity: 20 },
        { contractVerifier: async () => ({ status: "ACTIVE" }) }
      )
    ).rejects.toMatchObject({ code: "SUBJECT_AUTHORIZATION_PENDING", statusCode: 403 });

    // Admin approves TEA-07
    await request(app)
      .post(`/api/admin/subject-authorizations/${authId}/approve`)
      .set(as(admin))
      .send({ reviewNote: "Đủ điều kiện" })
      .expect(200);

    // Teacher view still redacts admin IDs
    const myAuthRes = await request(app)
      .get(`/api/teacher/subject-authorizations/${authId}`)
      .set(as(teacher))
      .expect(200);
    expect(JSON.stringify(myAuthRes.body)).not.toContain(admin._id.toString());

    // Step 2: With TEA-07 APPROVED + CUR-07 ACTIVE, HTTP createClass MUST still fail closed (503) without TEA-12
    const blockedHttp = await request(app)
      .post("/api/teacher/classes")
      .set(as(teacher))
      .send({ courseId: course._id, className: "Missing TEA-12", classType: "PAID", price: 500000, capacity: 20 })
      .expect(503);
    expect(blockedHttp.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");

    // Step 3: With explicit test contractVerifier ONLY in options, real CUR-07 validates price & captures CUR-09 snapshot
    const contractOk = { contractVerifier: async () => ({ id: "c-1", status: "ACTIVE" }) };
    await expect(
      teacherClassService.createClass(
        teacher._id,
        { courseId: course._id, className: "Too Cheap", classType: "PAID", price: 100000, capacity: 20 },
        contractOk
      )
    ).rejects.toMatchObject({ code: "PRICE_OUT_OF_POLICY_RANGE", statusCode: 400 });

    const created = await teacherClassService.createClass(
      teacher._id,
      { courseId: course._id, className: "Toán 12 K1", classType: "PAID", price: 600000, capacity: 20 },
      contractOk
    );
    expect(created.syllabusVersionId.toString()).toBe(sv1._id.toString());
    expect(created.syllabusVersionNumber).toBe(1);
    expect(created.pricingPolicyId.toString()).toBe(policyV1._id.toString());
    expect(created.pricingPolicyVersion).toBe(1);
    expect(toNum(created.pricingPolicySnapshot.minPrice)).toBe(300000);
    expect(toNum(created.pricingPolicySnapshot.maxPrice)).toBe(1200000);

    // Update dates & schedule
    const day = 86400000;
    const now = Date.now();
    await teacherClassService.updateClass(
      teacher._id,
      created._id.toString(),
      {
        description: "Lớp chuyên đề Toán 12 học kỳ 1",
        enrollmentStart: new Date(now + day),
        enrollmentEnd: new Date(now + 10 * day),
        startDate: new Date(now + 2 * day),
        endDate: new Date(now + 20 * day),
        schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      },
      contractOk
    );

    // Create 1 session (< minSessions=2 in policyV1) -> submitClass MUST reject SESSION_COUNT_OUT_OF_POLICY_RANGE
    const s1 = await sessionService.createSessions(teacher._id, created._id.toString(), {
      title: "Buổi 1",
      startDatetime: new Date(now + 3 * day),
      endDatetime: new Date(now + 3 * day + 7200000),
    });
    await expect(
      teacherClassService.submitClass(teacher._id, created._id.toString(), contractOk)
    ).rejects.toMatchObject({ code: "SESSION_COUNT_OUT_OF_POLICY_RANGE", statusCode: 400 });

    // Create 2nd session & temporary 3rd session, verify transactional deleteSession works in DRAFT
    await sessionService.createSessions(teacher._id, created._id.toString(), {
      title: "Buổi 2",
      startDatetime: new Date(now + 5 * day),
      endDatetime: new Date(now + 5 * day + 7200000),
    });
    const sTemp = await sessionService.createSessions(teacher._id, created._id.toString(), {
      title: "Buổi nháp xóa",
      startDatetime: new Date(now + 6 * day),
      endDatetime: new Date(now + 6 * day + 7200000),
    });
    await sessionService.deleteSession(teacher._id, sTemp._id.toString());

    const submitted = await teacherClassService.submitClass(teacher._id, created._id.toString(), contractOk);
    expect(submitted.status).toBe("PENDING_APPROVAL");

    // Deleting session on PENDING_APPROVAL class is blocked
    await expect(
      sessionService.deleteSession(teacher._id, s1._id.toString())
    ).rejects.toMatchObject({ code: "SESSION_NOT_DELETABLE", statusCode: 409 });

    // Step 4: ApproveClass BYPASS CLOSURE proofs!
    // 4a) Default HTTP POST /api/admin/classes/:id/approve MUST FAIL CLOSED with 503 CONTRACT_DEPENDENCY_BLOCKED
    const adminHttpBlocked = await request(app)
      .post(`/api/admin/classes/${created._id}/approve`)
      .set(as(admin))
      .send({ reviewNote: "Thử duyệt khi thiếu TEA-12" })
      .expect(503);
    expect(adminHttpBlocked.body.error).toBe("CONTRACT_DEPENDENCY_BLOCKED");
    expect((await Class.findById(created._id).lean()).status).toBe("PENDING_APPROVAL");

    // 4b) Suspend TEA-07 while PENDING_APPROVAL -> approveClass MUST reject with 403 even if TEA-12 OK!
    await request(app)
      .post(`/api/admin/subject-authorizations/${authId}/suspend`)
      .set(as(admin))
      .send({ reason: "Tạm rà soát chứng chỉ" })
      .expect(200);

    await expect(
      adminClassService.approveClass(admin._id, created._id.toString(), {}, contractOk)
    ).rejects.toMatchObject({ code: "SUBJECT_AUTHORIZATION_SUSPENDED", statusCode: 403 });

    // 4c) RejectClass still works while TEA-07 suspended
    const rejected = await adminClassService.rejectClass(admin._id, created._id.toString(), {
      reviewNote: "Bổ sung chứng chỉ rồi nộp lại",
    });
    expect(rejected.status).toBe("REJECTED");

    // 4d) Reinstate TEA-07 -> resubmit -> approveClass succeeds cleanly
    await request(app)
      .post(`/api/admin/subject-authorizations/${authId}/approve`)
      .set(as(admin))
      .send({ reviewNote: "Đã xác minh lại" })
      .expect(200);

    await teacherClassService.submitClass(teacher._id, created._id.toString(), contractOk);
    const opened = await adminClassService.approveClass(
      admin._id,
      created._id.toString(),
      { reviewNote: "Đạt chuẩn mở lớp" },
      contractOk
    );
    expect(opened.status).toBe("OPEN");
    expect(opened.syllabusVersionNumber).toBe(1);
    expect(opened.pricingPolicyVersion).toBe(1);
    expect(
      await AuditLog.countDocuments({
        actorAdminId: admin._id,
        targetType: "Class",
        targetId: opened._id,
        action: "CLASS_APPROVED",
      })
    ).toBe(1);
    expect(
      await Notification.countDocuments({ userId: teacher._id, type: "CLASS_APPROVED" })
    ).toBeGreaterThanOrEqual(1);

    // Step 5: Publish Syllabus v2 & Policy v2 -> existing OPEN Class retains immutable v1 snapshots
    const sv2 = await syllabusService.createDraftVersion(admin._id, course._id.toString(), {
      cloneFromVersionId: sv1._id.toString(),
      title: "Giáo trình v2",
    });
    await syllabusService.publishVersion(admin._id, course._id.toString(), sv2._id.toString());

    await coursePricingPolicyService.createNextVersionFromId(admin._id, policyV1._id.toString(), {
      minPrice: 900000,
      maxPrice: 2000000,
      minSessions: 4,
      maxSessions: 12,
      changeReason: "Tăng khung giá v2",
    });

    const lockedClass = await Class.findById(created._id).lean();
    expect(lockedClass.syllabusVersionId.toString()).toBe(sv1._id.toString());
    expect(lockedClass.syllabusVersionNumber).toBe(1);
    expect(lockedClass.pricingPolicyId.toString()).toBe(policyV1._id.toString());
    expect(lockedClass.pricingPolicyVersion).toBe(1);
    expect(toNum(lockedClass.pricingPolicySnapshot.minPrice)).toBe(300000);

    // Step 6: Verify CUR-09 handover helper & Enrollment schema snapshot persistence
    const enrollSnap = coursePricingPolicyService.buildEnrollmentSnapshotFromClass(lockedClass);
    const enrollment = await Enrollment.create({
      classId: lockedClass._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: lockedClass.price,
      ...enrollSnap,
    });
    expect(enrollment.syllabusVersionId.toString()).toBe(sv1._id.toString());
    expect(enrollment.syllabusVersionNumber).toBe(1);
    expect(enrollment.pricingPolicyVersion).toBe(1);
    expect(enrollment.pricingPolicyKey).toBe(lockedClass.pricingPolicyKey);
  });

  // =========================================================================
  // 2. CUR-11: Reschedule Concurrency, Validation & TeacherScheduleLock TX
  // =========================================================================
  test("CUR-11: Serializes reschedule review with CAS + TeacherScheduleLock across overlapping class edits & double-approvals", async () => {
    const { admin, teacher, student, cat, sub, course } = await bootstrap();
    const day = 86400000;
    const base = Date.now() + 2 * day;

    const classA = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Thầy Lâm Phase 2",
      categoryId: cat._id,
      subjectId: sub._id,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      className: "Lớp A Open",
      classType: "FREE",
      price: 0,
      capacity: 20,
      startDate: new Date(base - day),
      endDate: new Date(base + 30 * day),
      schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      status: "OPEN",
    });

    const classB = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Thầy Lâm Phase 2",
      categoryId: cat._id,
      subjectId: sub._id,
      gradeLevel: "GRADE_12",
      level: "INTERMEDIATE",
      className: "Lớp B Draft",
      classType: "FREE",
      price: 0,
      capacity: 20,
      startDate: new Date(base - day),
      endDate: new Date(base + 30 * day),
      schedule: [{ dayOfWeek: 2, startTime: "19:00", endTime: "21:00" }],
      status: "DRAFT",
    });

    await Enrollment.create({
      classId: classA._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
      tuitionAmount: 0,
    });

    const origSession = await Session.create({
      classId: classA._id,
      className: classA.className,
      teacherId: teacher._id,
      title: "Buổi A1",
      sessionNumber: 1,
      startDatetime: new Date(base),
      endDatetime: new Date(base + 7200000),
      status: "SCHEDULED",
    });

    // Rejects reschedule into the past (400 SESSION_IN_PAST)
    await expect(
      incidentService.requestSessionReschedule(teacher._id, origSession._id.toString(), {
        proposedStartDatetime: new Date(Date.now() - 3600000).toISOString(),
        proposedEndDatetime: new Date(Date.now() - 1800000).toISOString(),
        reason: "Quá khứ",
      })
    ).rejects.toMatchObject({ code: "SESSION_IN_PAST", statusCode: 400 });

    const targetStart = new Date(base + 10 * day);
    const targetEnd = new Date(base + 10 * day + 7200000);

    const reschedReq = await incidentService.requestSessionReschedule(teacher._id, origSession._id.toString(), {
      proposedStartDatetime: targetStart.toISOString(),
      proposedEndDatetime: targetEnd.toISOString(),
      proposedTitle: "Buổi bù A1",
      reason: "Nghỉ ốm có lý do",
    });

    // Concurrent race between Admin approving Class A makeup & Teacher creating overlapping Class B session
    const [approveRes, createBRes] = await Promise.allSettled([
      incidentService.reviewRescheduleRequest(admin._id, reschedReq._id.toString(), {
        decision: "APPROVED",
        note: "Duyệt lịch bù",
      }),
      sessionService.createSessions(teacher._id, classB._id.toString(), {
        title: "Buổi B Trùng Giờ",
        startDatetime: new Date(targetStart.getTime() + 1800000).toISOString(),
        endDatetime: new Date(targetEnd.getTime() + 1800000).toISOString(),
      }),
    ]);

    const fulfilled = [approveRes, createBRes].filter((r) => r.status === "fulfilled");
    const rejected = [approveRes, createBRes].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect([409]).toContain(rejected[0].reason.statusCode);

    // Now test concurrent Admin double-approve on another fresh reschedule request -> CAS allows strictly ONE
    const orig2 = await Session.create({
      classId: classA._id,
      className: classA.className,
      teacherId: teacher._id,
      title: "Buổi A2",
      sessionNumber: 2,
      startDatetime: new Date(base + 2 * day),
      endDatetime: new Date(base + 2 * day + 7200000),
      status: "SCHEDULED",
    });
    const req2 = await incidentService.requestSessionReschedule(teacher._id, orig2._id.toString(), {
      proposedStartDatetime: new Date(base + 15 * day).toISOString(),
      proposedEndDatetime: new Date(base + 15 * day + 7200000).toISOString(),
      proposedTitle: "Buổi bù A2",
      reason: "Đổi lịch thi",
    });

    const [dupA, dupB] = await Promise.allSettled([
      incidentService.reviewRescheduleRequest(admin._id, req2._id.toString(), { decision: "APPROVED", note: "Admin 1" }),
      incidentService.reviewRescheduleRequest(admin._id, req2._id.toString(), { decision: "APPROVED", note: "Admin 2" }),
    ]);

    expect([dupA, dupB].filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failedDup = [dupA, dupB].find((r) => r.status === "rejected");
    expect(failedDup.reason).toMatchObject({ code: "RESCHEDULE_ALREADY_REVIEWED", statusCode: 409 });

    const makeups = await Session.find({
      "rescheduleMetadata.rescheduleRequestId": req2._id,
      "rescheduleMetadata.isMakeupSession": true,
    }).lean();
    expect(makeups).toHaveLength(1);
    expect(makeups[0].scheduleSource).toBe("MAKEUP");

    // Exactly 2 serialized transactions committed (conflicting txs rolled back lockSeq cleanly)
    const lock = await TeacherScheduleLock.findOne({ teacherId: teacher._id }).lean();
    expect(lock.lockSeq).toBe(2);

    // Closed class reschedule is rejected with 409 CLASS_CLOSED
    await Class.updateOne({ _id: classA._id }, { $set: { status: "COMPLETED" } });
    await expect(
      incidentService.requestSessionReschedule(teacher._id, orig2._id.toString(), {
        proposedStartDatetime: new Date(base + 20 * day).toISOString(),
        proposedEndDatetime: new Date(base + 20 * day + 7200000).toISOString(),
        reason: "Thử lớp đã đóng",
      })
    ).rejects.toMatchObject({ code: "CLASS_CLOSED", statusCode: 409 });
  });

  // =========================================================================
  // 3. FIX-FINAL: Anti-coercion regression guards (CUR-10 / CUR-11)
  // =========================================================================
  test("FIX-FINAL: Rejects JS boolean/null/empty/array coercions in class capacity, schedule dayOfWeek, sessionNumber & skipPast", async () => {
    const { admin, teacher, sub, course } = await bootstrap();
    await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: sub._id,
      categoryId: course.categoryId,
      gradeLevel: course.gradeLevel,
      level: course.level,
      status: "APPROVED",
      createdBy: admin._id,
      approvedBy: admin._id,
      approvedAt: new Date(),
    });
    const contractOk = { contractVerifier: async () => ({ id: "c-fix", status: "ACTIVE" }) };

    for (const badCap of [true, false, [10], "", {}]) {
      await expect(
        teacherClassService.createClass(
          teacher._id,
          { courseId: course._id, className: "Bad Capacity", classType: "PAID", price: 500000, capacity: badCap },
          contractOk
        )
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }

    for (const badDay of [false, true, null, "", [1], {}]) {
      await expect(
        teacherClassService.createClass(
          teacher._id,
          {
            courseId: course._id,
            className: "Bad Day",
            classType: "PAID",
            price: 500000,
            capacity: 15,
            schedule: [{ dayOfWeek: badDay, startTime: "19:00", endTime: "21:00" }],
          },
          contractOk
        )
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }

    await expect(
      classCreationGateService.validateClassGate({
        teacher,
        course,
        body: { price: true, classType: "PAID" },
        contractVerifier: contractOk.contractVerifier,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

    const day = 86400000;
    const now = Date.now();
    const validClass = await teacherClassService.createClass(
      teacher._id,
      {
        courseId: course._id,
        className: "Valid Coercion Target",
        classType: "PAID",
        price: 500000,
        capacity: 15,
        startDate: new Date(now + day),
        endDate: new Date(now + 20 * day),
        schedule: [{ dayOfWeek: 1, startTime: "19:00", endTime: "21:00" }],
      },
      contractOk
    );

    for (const badNum of [true, false, "", [1], {}]) {
      await expect(
        sessionService.createSessions(teacher._id, validClass._id.toString(), {
          title: "Buổi Coerce",
          sessionNumber: badNum,
          startDatetime: new Date(now + 3 * day),
          endDatetime: new Date(now + 3 * day + 7200000),
        })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }

    await expect(
      sessionService.generateSessionsFromSchedule(teacher._id, validClass._id.toString(), {
        skipPast: "false",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });
});
