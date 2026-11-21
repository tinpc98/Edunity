const mongoose = require("mongoose");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  AuditLog,
  Notification,
  JobLock,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const auditService = require("../src/services/auditService");
const notificationService = require("../src/services/notificationService");
const { runExclusive, acquire, release } = require("../src/jobs/jobLock");
const {
  rejectExpiredPendingClasses,
  runMaintenanceJob,
  resolveTzOffsetMinutes,
  isClassStartDateReached,
  DEFAULT_MAINTENANCE_LOCK_TTL_MS,
  DEFAULT_MAINTENANCE_HEARTBEAT_MS,
} = require("../src/jobs/maintenanceJob");

describe("TASK BE-02: Automatic Class Expiration Rejection Integration Suite", () => {
  let admin, teacher, otherTeacher, category, subject, course;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    jest.restoreAllMocks();

    const passwordHash = hashPassword("TestPass123!");

    admin = await User.create({
      email: "admin-be02@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    });

    teacher = await User.create({
      email: "teacher-be02@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Thầy Hưng BE-02",
        verificationStatus: "VERIFIED",
      },
    });

    otherTeacher = await User.create({
      email: "other-teacher-be02@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Thầy Nam",
        verificationStatus: "VERIFIED",
      },
    });

    category = await Category.create({
      name: "Khoa Học Tự Nhiên",
      slug: "khoa-hoc-tu-nhien-be02",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    subject = await Subject.create({
      name: "Vật Lý",
      slug: "vat-ly-be02",
      categoryId: category._id,
      categoryName: category.name,
      status: "ACTIVE",
      createdBy: admin._id,
    });

    course = await Course.create({
      title: "Vật Lý 12 Chuyên Đề",
      slug: "vat-ly-12-chuyen-de-be02",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_12",
      level: "ADVANCED",
      status: "ACTIVE",
      createdBy: admin._id,
    });
  });

  const createClassFixture = async (status = "PENDING_APPROVAL", startDate = new Date()) => {
    return Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Thầy Hưng BE-02",
      categoryId: category._id,
      subjectId: subject._id,
      gradeLevel: "GRADE_12",
      level: "ADVANCED",
      className: `Lớp Vật Lý - ${status}`,
      description: "Mô tả lớp học",
      classType: "FREE",
      price: 0,
      capacity: 20,
      enrolledCount: 0,
      status,
      startDate,
      endDate: new Date(startDate.getTime() + 30 * 86400000),
      enrollmentStart: new Date(startDate.getTime() - 10 * 86400000),
      enrollmentEnd: startDate,
      schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "10:00" }],
    });
  };

  // =========================================================================
  // TEST 1: Lớp PENDING_APPROVAL quá hạn hoặc đúng ngày khai giảng bị từ chối
  // =========================================================================
  test("1. Rejects PENDING_APPROVAL class when startDate has arrived or is in the past", async () => {
    // Current simulated time: 2026-11-20 10:00:00 UTC (17:00:00 UTC+7)
    const now = new Date("2026-11-20T10:00:00.000Z");

    // Class 1: Past due (startDate was yesterday: 2026-11-19)
    const pastDate = new Date("2026-11-18T17:00:00.000Z"); // Nov 19 in UTC+7
    const classPast = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Class 2: Exact start date (startDate is today: 2026-11-20)
    const todayDate = new Date("2026-11-19T17:00:00.000Z"); // Nov 20 in UTC+7
    const classToday = await createClassFixture("PENDING_APPROVAL", todayDate);

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    expect(result.rejectedCount).toBe(2);
    expect(result.rejected).toContain(classPast._id.toString());
    expect(result.rejected).toContain(classToday._id.toString());

    // Verify in database: status changed to REJECTED, reviewNote set, startDate preserved
    const freshPast = await Class.findById(classPast._id).lean();
    expect(freshPast.status).toBe("REJECTED");
    expect(freshPast.reviewNote).toBe("Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.");
    expect(new Date(freshPast.startDate).getTime()).toBe(pastDate.getTime()); // Unchanged

    const freshToday = await Class.findById(classToday._id).lean();
    expect(freshToday.status).toBe("REJECTED");
    expect(freshToday.reviewNote).toBe("Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.");
    expect(new Date(freshToday.startDate).getTime()).toBe(todayDate.getTime()); // Unchanged
  });

  // =========================================================================
  // TEST 2: Lớp chưa đến ngày khai giảng không bị ảnh hưởng
  // =========================================================================
  test("2. Does not reject PENDING_APPROVAL class when startDate is in the future", async () => {
    // Current simulated time: 2026-11-20 10:00:00 UTC
    const now = new Date("2026-11-20T10:00:00.000Z");

    // Class with future startDate (2026-11-25)
    const futureDate = new Date("2026-11-24T17:00:00.000Z"); // Nov 25 in UTC+7
    const futureClass = await createClassFixture("PENDING_APPROVAL", futureDate);

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    expect(result.rejectedCount).toBe(0);

    const fresh = await Class.findById(futureClass._id).lean();
    expect(fresh.status).toBe("PENDING_APPROVAL");
    expect(fresh.reviewNote).toBeNull();
  });

  // =========================================================================
  // TEST 3: Lớp đã được duyệt (OPEN, IN_PROGRESS) hoặc NEED_CHANGES/DRAFT không bị ảnh hưởng
  // =========================================================================
  test("3. Only targets PENDING_APPROVAL: OPEN, IN_PROGRESS, NEED_CHANGES, DRAFT are untouched", async () => {
    // Past date (yesterday)
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");

    const openClass = await createClassFixture("OPEN", pastDate);
    const inProgressClass = await createClassFixture("IN_PROGRESS", pastDate);
    const completedClass = await createClassFixture("COMPLETED", pastDate);
    const needChangesClass = await createClassFixture("NEED_CHANGES", pastDate);
    const draftClass = await createClassFixture("DRAFT", pastDate);

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });
    expect(result.rejectedCount).toBe(0);

    // Verify all statuses remain strictly intact
    expect((await Class.findById(openClass._id).lean()).status).toBe("OPEN");
    expect((await Class.findById(inProgressClass._id).lean()).status).toBe("IN_PROGRESS");
    expect((await Class.findById(completedClass._id).lean()).status).toBe("COMPLETED");
    expect((await Class.findById(needChangesClass._id).lean()).status).toBe("NEED_CHANGES");
    expect((await Class.findById(draftClass._id).lean()).status).toBe("DRAFT");
  });

  // =========================================================================
  // TEST 4: Kiểm tra chính xác ranh giới ngày theo timezone (trước và sau nửa đêm)
  // =========================================================================
  test("4. Precision Timezone Boundary Test: evaluates calendar day boundaries accurately", async () => {
    // Class scheduled to start on 2026-11-20 (in Vietnam timezone UTC+7)
    // 2026-11-20 00:00:00 UTC+7 is 2026-11-19 17:00:00 UTC
    const classStartDate = new Date("2026-11-19T17:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", classStartDate);

    // Case 4a: 5 minutes before midnight in Vietnam (2026-11-19 23:55:00 UTC+7 = 2026-11-19 16:55:00 UTC)
    const beforeMidnight = new Date("2026-11-19T16:55:00.000Z");
    const resBefore = await rejectExpiredPendingClasses(beforeMidnight, { tzOffsetMinutes: 420 });
    expect(resBefore.rejectedCount).toBe(0);
    expect((await Class.findById(cls._id).lean()).status).toBe("PENDING_APPROVAL");

    // Case 4b: 5 minutes after midnight in Vietnam (2026-11-20 00:05:00 UTC+7 = 2026-11-19 17:05:00 UTC)
    // Notice that in UTC it is still Nov 19! But in Vietnam it is Nov 20!
    const afterMidnight = new Date("2026-11-19T17:05:00.000Z");
    const resAfter = await rejectExpiredPendingClasses(afterMidnight, { tzOffsetMinutes: 420 });
    expect(resAfter.rejectedCount).toBe(1);
    expect(resAfter.rejected).toContain(cls._id.toString());
    expect((await Class.findById(cls._id).lean()).status).toBe("REJECTED");
  });

  // =========================================================================
  // TEST 5: Job chạy hai lần không tạo audit/notification trùng (Idempotency)
  // =========================================================================
  test("5. Idempotent: Running the job twice produces exactly 1 audit and 1 notification", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Run 1: Rejects the class
    const res1 = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });
    expect(res1.rejectedCount).toBe(1);

    // Run 2: Does nothing (class already REJECTED)
    const res2 = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });
    expect(res2.rejectedCount).toBe(0);

    // Verify exactly 1 AuditLog entry
    const auditLogs = await AuditLog.find({
      targetType: "Class",
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    }).lean();
    expect(auditLogs).toHaveLength(1);

    // Verify exactly 1 Notification entry
    const notifs = await Notification.find({
      userId: teacher._id,
      type: "CLASS_EXPIRED_REJECTED",
    }).lean();
    expect(notifs).toHaveLength(1);
  });

  // =========================================================================
  // TEST 6: Job đồng thời không ghi đè quyết định của Admin hoặc gây xung đột
  // =========================================================================
  test("6. Concurrency Safety: Does not overwrite concurrent Admin approval or double reject", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Simulate concurrent execution: two worker instances running rejectExpiredPendingClasses simultaneously
    const [w1, w2] = await Promise.all([
      rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 }),
      rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 }),
    ]);

    // Exactly one worker must perform the rejection
    expect(w1.rejectedCount + w2.rejectedCount).toBe(1);

    // AuditLog must have exactly 1 record
    const auditCount = await AuditLog.countDocuments({
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    });
    expect(auditCount).toBe(1);
  });

  // =========================================================================
  // TEST 7: Lỗi xử lý một lớp không làm hỏng toàn bộ job (Fault Isolation)
  // =========================================================================
  test("7. Fault Isolation: An error on one class does not crash the processing of other classes", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");

    const cls1 = await createClassFixture("PENDING_APPROVAL", pastDate);
    const cls2 = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Mock Class.findOneAndUpdate to throw on cls1 only
    const origFindOneAndUpdate = Class.findOneAndUpdate.bind(Class);
    jest.spyOn(Class, "findOneAndUpdate").mockImplementation((filter, update, options) => {
      if (filter._id && filter._id.toString() === cls1._id.toString()) {
        throw new Error("Simulated transient DB error on cls1");
      }
      return origFindOneAndUpdate(filter, update, options);
    });

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    // cls2 should have succeeded despite cls1 failure
    expect(result.rejected).toContain(cls2._id.toString());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].classId).toBe(cls1._id.toString());

    // Verify cls2 is REJECTED in database
    const fresh2 = await Class.findById(cls2._id).lean();
    expect(fresh2.status).toBe("REJECTED");
  });

  // =========================================================================
  // TEST 8: Audit Actor hệ thống được ghi hợp lệ (actorAdminId: null, actorType: "SYSTEM")
  // =========================================================================
  test("8. Audit System Actor: Correctly records actorType=SYSTEM without faking Admin ID", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    const auditEntry = await AuditLog.findOne({
      targetType: "Class",
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    }).lean();

    expect(auditEntry).not.toBeNull();
    expect(auditEntry.actorAdminId).toBeNull(); // No fake Admin ID
    expect(auditEntry.actorType).toBe("SYSTEM"); // Proper system actor
    expect(auditEntry.beforeState).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(auditEntry.afterState).toMatchObject({
      status: "REJECTED",
      reason: "START_DATE_PASSED_WITHOUT_APPROVAL",
    });
  });

  // =========================================================================
  // TEST 9: Tích hợp trong runMaintenanceJob tổng thể
  // =========================================================================
  test("9. Integration: runMaintenanceJob executes expiredPendingClasses step successfully", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    const jobResult = await runMaintenanceJob(now, { tzOffsetMinutes: 420 });

    expect(jobResult.expiredPendingClasses).toBeDefined();
    expect(jobResult.expiredPendingClasses.rejectedCount).toBe(1);
    expect(jobResult.expiredPendingClasses.rejected).toContain(cls._id.toString());

    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("REJECTED");
  });

  // =========================================================================
  // TEST 10: Atomic Rejection & Rollback: Lỗi ghi audit rollback Class về PENDING_APPROVAL
  // =========================================================================
  test("10. Atomic Rejection & Rollback: If audit fails, Class is NOT rejected (remains PENDING_APPROVAL), transaction aborts, no notification sent, and subsequent run recovers", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Mock audit to throw inside transaction
    jest.spyOn(auditService, "audit").mockRejectedValueOnce(new Error("Simulated audit write failure"));

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    // Job captures error and does not include class in rejected list
    expect(result.rejectedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].classId).toBe(cls._id.toString());
    expect(result.errors[0].error).toContain("Simulated audit write failure");

    // CRITICAL: Database verification that transaction rolled back cleanly
    const freshAfterAbort = await Class.findById(cls._id).lean();
    expect(freshAfterAbort.status).toBe("PENDING_APPROVAL");
    expect(freshAfterAbort.reviewNote).toBeNull();

    // Verify 0 AuditLog and 0 Notification
    const auditCount = await AuditLog.countDocuments({ targetId: cls._id });
    expect(auditCount).toBe(0);
    const notifCount = await Notification.countDocuments({ userId: teacher._id });
    expect(notifCount).toBe(0);

    // SUBSEQUENT RUN RECOVERY: restore audit mock and run again
    jest.restoreAllMocks();
    const recoveryResult = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    expect(recoveryResult.rejectedCount).toBe(1);
    expect(recoveryResult.rejected).toContain(cls._id.toString());
    expect(recoveryResult.errors).toHaveLength(0);

    const freshAfterRecovery = await Class.findById(cls._id).lean();
    expect(freshAfterRecovery.status).toBe("REJECTED");
    expect(freshAfterRecovery.reviewNote).toBe("Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.");

    const auditAfterRecovery = await AuditLog.countDocuments({
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    });
    expect(auditAfterRecovery).toBe(1);

    const notifAfterRecovery = await Notification.countDocuments({
      userId: teacher._id,
      type: "CLASS_EXPIRED_REJECTED",
    });
    expect(notifAfterRecovery).toBe(1);
  });

  // =========================================================================
  // TEST 11: Notification Resilience: Lỗi notification không rollback Class & AuditLog
  // =========================================================================
  test("11. Notification Resilience: If notification service throws, transaction is NOT rolled back, class remains REJECTED, AuditLog is recorded, and job completes successfully", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Mock notify to throw
    jest.spyOn(notificationService, "notify").mockRejectedValueOnce(new Error("Simulated push gateway timeout"));

    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    // Job succeeds for class rejection
    expect(result.rejectedCount).toBe(1);
    expect(result.rejected).toContain(cls._id.toString());
    expect(result.errors).toHaveLength(0);

    // Database verification: class is REJECTED, AuditLog is written
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("REJECTED");

    const auditLog = await AuditLog.findOne({
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    }).lean();
    expect(auditLog).not.toBeNull();
    expect(auditLog.actorType).toBe("SYSTEM");
  });

  // =========================================================================
  // TEST 12: Race condition với Admin phê duyệt cùng lúc
  // =========================================================================
  test("12. Race with Admin approval: If Admin approves class concurrently, job gracefully skips class without overwriting OPEN status and without emitting audit", async () => {
    const pastDate = new Date("2026-11-18T17:00:00.000Z");
    const now = new Date("2026-11-20T10:00:00.000Z");
    const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

    // Before worker reaches findOneAndUpdate, Admin approves the class
    await Class.updateOne(
      { _id: cls._id },
      { $set: { status: "OPEN", reviewedBy: admin._id, reviewedAt: new Date() } }
    );

    // Now run worker (status in DB is already OPEN)
    const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

    expect(result.rejectedCount).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Ensure status remains OPEN and NOT overwritten to REJECTED
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("OPEN");
    expect(fresh.reviewedBy.toString()).toBe(admin._id.toString());

    // Ensure no CLASS_EXPIRED_REJECTED audit was created
    const auditCount = await AuditLog.countDocuments({
      targetId: cls._id,
      action: "CLASS_EXPIRED_REJECTED",
    });
    expect(auditCount).toBe(0);
  });

  // =========================================================================
  // TEST 13: Distributed Job Lock Heartbeat gia hạn lease tự động
  // =========================================================================
  test("13. Distributed Job Lock Heartbeat: runExclusive extends lockedUntil periodically via heartbeat interval", async () => {
    const lockName = "test-maintenance-heartbeat";
    const initialTtlMs = 1200;
    const heartbeatMs = 300;

    let observedHeartbeatExtension = false;
    let initialLockedUntil = null;

    await runExclusive(
      lockName,
      initialTtlMs,
      async () => {
        const initialDoc = await JobLock.findOne({ name: lockName }).lean();
        expect(initialDoc).not.toBeNull();
        initialLockedUntil = initialDoc.lockedUntil;

        // Sleep 700ms to allow at least 2 heartbeats to execute at 300ms and 600ms
        await new Promise((resolve) => setTimeout(resolve, 700));

        const updatedDoc = await JobLock.findOne({ name: lockName }).lean();
        expect(updatedDoc).not.toBeNull();
        if (updatedDoc.lockedUntil.getTime() > initialLockedUntil.getTime()) {
          observedHeartbeatExtension = true;
        }
      },
      "worker-heartbeat-test",
      { heartbeatIntervalMs: heartbeatMs }
    );

    expect(observedHeartbeatExtension).toBe(true);

    // After task finishes, lock is cleanly released
    const releasedDoc = await JobLock.findOne({ name: lockName }).lean();
    expect(releasedDoc.lockedUntil.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // =========================================================================
  // TEST 14: Distributed Job Lock Crash Recovery: Lease hết hạn cho phép worker mới nhận lock
  // =========================================================================
  test("14. Distributed Job Lock Crash Recovery: Expired lock allows a new instance to acquire lease after TTL expires", async () => {
    const lockName = "test-maintenance-crash";

    // Simulate dead worker that crashed 10 seconds ago leaving lease expired
    await JobLock.findOneAndUpdate(
      { name: lockName },
      {
        $set: {
          name: lockName,
          owner: "dead-crashed-worker",
          lockedUntil: new Date(Date.now() - 10000),
        },
      },
      { upsert: true }
    );

    // A healthy worker should be able to acquire this expired lock immediately
    const acquired = await acquire(lockName, 5000, "healthy-worker");
    expect(acquired).toBe(true);

    const doc = await JobLock.findOne({ name: lockName }).lean();
    expect(doc.owner).toBe("healthy-worker");
    expect(doc.lockedUntil.getTime()).toBeGreaterThan(Date.now());

    // Clean up
    await release(lockName, "healthy-worker");
  });

  // =========================================================================
  // TEST 15: Cấu hình mặc định hằng số bảo trì được xuất đúng
  // =========================================================================
  test("15. Default Maintenance Constants: Exported TTL (4 mins) and heartbeat (1 min) are properly configured", () => {
    expect(DEFAULT_MAINTENANCE_LOCK_TTL_MS).toBe(4 * 60 * 1000);
    expect(DEFAULT_MAINTENANCE_HEARTBEAT_MS).toBe(60 * 1000);
  });
});
