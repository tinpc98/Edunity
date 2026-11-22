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
const { retryFailedNotifications } = require("../src/services/notificationService");
const { runExclusive, acquire, extend, release, verifyOwnership } = require("../src/jobs/jobLock");
const {
  rejectExpiredPendingClasses,
  recoverMissingExpiredClassNotifications,
  runMaintenanceJob,
  resolveTzOffsetMinutes,
  isClassStartDateReached,
  DEFAULT_MAINTENANCE_LOCK_TTL_MS,
  DEFAULT_MAINTENANCE_HEARTBEAT_MS,
} = require("../src/jobs/maintenanceJob");

describe("TASK BE-02-FIX-05: Final Reliability Patch Suite", () => {
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

  const createClassFixture = async (status = "PENDING_APPROVAL", startDate = new Date(), customProps = {}) => {
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
      ...customProps,
    });
  };

  // =========================================================================
  // 1. TRANSACTION ROLLBACK (Req 1)
  // =========================================================================
  describe("Transaction Rollback & Atomicity", () => {
    test("1. Transaction rollback khi notification persistence thất bại: Class giữ PENDING_APPROVAL, 0 AuditLog, 0 Notification", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const now = new Date("2026-11-20T10:00:00.000Z");
      const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

      // Mock notificationService.notify to throw inside transaction
      jest.spyOn(notificationService, "notify").mockImplementationOnce(async () => {
        throw new Error("Simulated transient DB error persisting Notification");
      });

      const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

      expect(result.rejectedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("Simulated transient DB error");

      // Verify strict fail-closed rollback: Class remains PENDING_APPROVAL
      const fresh = await Class.findById(cls._id).lean();
      expect(fresh.status).toBe("PENDING_APPROVAL");

      // Zero partial writes in database
      expect(await AuditLog.countDocuments({ targetId: cls._id })).toBe(0);
      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(0);
    });

    test("1b. Transaction thành công trọn vẹn: Cả Class, AuditLog và Notification đều được commit", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const now = new Date("2026-11-20T10:00:00.000Z");
      const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

      const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });

      expect(result.rejectedCount).toBe(1);
      const fresh = await Class.findById(cls._id).lean();
      expect(fresh.status).toBe("REJECTED");
      expect(fresh.reviewedBy).toBeNull(); // SYSTEM rejection marker

      const auditEntry = await AuditLog.findOne({ targetId: cls._id, action: "CLASS_EXPIRED_REJECTED" }).lean();
      expect(auditEntry).not.toBeNull();
      expect(auditEntry.actorType).toBe("SYSTEM");

      const notif = await Notification.findOne({
        userId: teacher._id,
        dedupeKey: `CLASS_EXPIRED_REJECTED:${cls._id.toString()}`,
      }).lean();
      expect(notif).not.toBeNull();
      expect(notif.deliveryStatus).toBe("DELIVERED");
    });
  });

  // =========================================================================
  // 2. NOTIFICATION RETRY SEMANTICS (Req 2, 3, 4)
  // =========================================================================
  describe("FIX-01: Notification Retry Semantics", () => {
    test("2. Retry không có handler: Giữ nguyên trạng thái FAILED, không fake đổi thành DELIVERED", async () => {
      const failedNotif = await Notification.create({
        userId: teacher._id,
        title: "Thông báo lỗi mạng",
        content: "Nội dung thông báo",
        type: "CLASS_EXPIRED_REJECTED",
        dedupeKey: "test:retry:no:handler:2",
        deliveryStatus: "FAILED",
        lastError: "Initial transmission failed",
        retryCount: 0,
      });

      // Call retry without delivery handler
      const res = await retryFailedNotifications();

      expect(res.retriedCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(res.skipped[0].reason).toBe("NO_DELIVERY_HANDLER");

      // Notification MUST remain FAILED in DB
      const after = await Notification.findById(failedNotif._id).lean();
      expect(after.deliveryStatus).toBe("FAILED");
      expect(after.lastError).toBe("Initial transmission failed");
    });

    test("3. Default cron notification retry: Chạy an toàn từ runMaintenanceJob mà không đổi bậy trạng thái", async () => {
      const failedNotif = await Notification.create({
        userId: teacher._id,
        title: "Thông báo cron",
        content: "Nội dung cron",
        type: "CLASS_EXPIRED_REJECTED",
        dedupeKey: "test:retry:cron:3",
        deliveryStatus: "FAILED",
        lastError: "External gateway down",
        retryCount: 0,
      });

      const now = new Date("2026-11-20T10:00:00.000Z");
      const jobResult = await runMaintenanceJob(now, { tzOffsetMinutes: 420 });

      expect(jobResult.notificationRetry).toBeDefined();
      expect(jobResult.notificationRetry.retriedCount).toBe(0);
      expect(jobResult.notificationRetry.skippedCount).toBeGreaterThanOrEqual(1);

      // Notification is still FAILED
      const notifDoc = await Notification.findById(failedNotif._id).lean();
      expect(notifDoc.deliveryStatus).toBe("FAILED");
    });

    test("4. External delivery thành công/thất bại: Handler thất bại giữ FAILED; handler thành công chuyển DELIVERED", async () => {
      const failedNotif = await Notification.create({
        userId: teacher._id,
        title: "Thông báo thử lại",
        content: "Nội dung cần gửi",
        type: "CLASS_EXPIRED_REJECTED",
        dedupeKey: "test:retry:semantics:4",
        deliveryStatus: "FAILED",
        lastError: "Initial network drop",
        retryCount: 0,
      });

      // 1. Delivery handler throws error -> Notification MUST remain FAILED, retryCount increments
      const failingHandler = jest.fn().mockRejectedValue(new Error("External push gateway down"));
      const failResult = await retryFailedNotifications({ deliveryHandler: failingHandler, maxRetries: 3 });

      expect(failResult.errors).toHaveLength(1);
      expect(failResult.errors[0].error).toContain("External push gateway down");

      const afterFail = await Notification.findById(failedNotif._id).lean();
      expect(afterFail.deliveryStatus).toBe("FAILED");
      expect(afterFail.retryCount).toBe(1);
      expect(afterFail.lastError).toContain("External push gateway down");

      // 2. Delivery handler succeeds -> Notification becomes DELIVERED
      const successHandler = jest.fn().mockResolvedValue(true);
      const successResult = await retryFailedNotifications({ deliveryHandler: successHandler, maxRetries: 3 });

      expect(successResult.retriedCount).toBe(1);
      const afterSuccess = await Notification.findById(failedNotif._id).lean();
      expect(afterSuccess.deliveryStatus).toBe("DELIVERED");
      expect(afterSuccess.lastError).toBeNull();
      expect(afterSuccess.retriedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. RECOVERY ERROR REPORTING & RESILIENCE (Req 5, 6, 7, 8)
  // =========================================================================
  describe("FIX-03: Recovery Error Reporting & Resilience", () => {
    test("5. Recovery khi DB write thất bại: Ghi nhận lỗi có cấu trúc { classId, auditId, error }, không crash recovery", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const cls = await createClassFixture("REJECTED", pastDate, {
        reviewedBy: null,
        reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
      });

      const auditEntry = await AuditLog.create({
        actorAdminId: null,
        actorType: "SYSTEM",
        action: "CLASS_EXPIRED_REJECTED",
        targetType: "Class",
        targetId: cls._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: { status: "REJECTED" },
      });

      // Inject error into notificationService.notify
      jest.spyOn(notificationService, "notify").mockImplementationOnce(async () => {
        throw new Error("Simulated socket timeout on Notification insert");
      });

      const res = await recoverMissingExpiredClassNotifications(new Date(), {});

      // Does not declare recovered
      expect(res.recoveredCount).toBe(0);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].classId).toBe(cls._id.toString());
      expect(res.errors[0].auditId).toBe(auditEntry._id.toString());
      expect(res.errors[0].error).toContain("Simulated socket timeout");

      // Notification is still missing (allowing retry)
      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(0);
    });

    test("6. Recovery sau khi DB hoạt động trở lại: Lần chạy tiếp theo phục hồi thành công", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const cls = await createClassFixture("REJECTED", pastDate, {
        reviewedBy: null,
        reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
      });

      await AuditLog.create({
        actorAdminId: null,
        actorType: "SYSTEM",
        action: "CLASS_EXPIRED_REJECTED",
        targetType: "Class",
        targetId: cls._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: { status: "REJECTED" },
      });

      // Normal recovery run
      const res = await recoverMissingExpiredClassNotifications(new Date(), {});
      expect(res.recoveredCount).toBe(1);
      expect(res.recovered).toContain(cls._id.toString());

      const notif = await Notification.findOne({
        userId: teacher._id,
        dedupeKey: `CLASS_EXPIRED_REJECTED:${cls._id.toString()}`,
      }).lean();
      expect(notif).not.toBeNull();
      expect(notif.deliveryStatus).toBe("DELIVERED");
    });

    test("7. Recovery trên 120 lớp: Keyset pagination quét sạch toàn bộ 70 lớp thiếu dù 50 lớp đầu đã có notification", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const totalClasses = 120;
      const alreadyNotifiedCount = 50;
      const missingCount = totalClasses - alreadyNotifiedCount; // 70

      const classesToInsert = [];
      for (let i = 0; i < totalClasses; i++) {
        classesToInsert.push({
          courseId: course._id,
          courseTitle: course.title,
          teacherId: teacher._id,
          teacherName: "Thầy Hưng BE-02",
          categoryId: category._id,
          subjectId: subject._id,
          gradeLevel: "GRADE_12",
          level: "ADVANCED",
          className: `Lớp Quy Mô Lớn ${i}`,
          classType: "FREE",
          price: 0,
          capacity: 20,
          enrolledCount: 0,
          status: "REJECTED",
          startDate: pastDate,
          endDate: new Date(pastDate.getTime() + 30 * 86400000),
          reviewedBy: null,
          reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
        });
      }

      const insertedClasses = await Class.insertMany(classesToInsert);

      const auditDocs = insertedClasses.map((c) => ({
        actorAdminId: null,
        actorType: "SYSTEM",
        action: "CLASS_EXPIRED_REJECTED",
        targetType: "Class",
        targetId: c._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: { status: "REJECTED" },
      }));
      await AuditLog.insertMany(auditDocs);

      const notifsToInsert = [];
      for (let i = 0; i < alreadyNotifiedCount; i++) {
        notifsToInsert.push({
          userId: teacher._id,
          title: "Lớp học bị từ chối tự động",
          content: "Đã thông báo từ trước",
          type: "CLASS_EXPIRED_REJECTED",
          dedupeKey: `CLASS_EXPIRED_REJECTED:${insertedClasses[i]._id.toString()}`,
          deliveryStatus: "DELIVERED",
        });
      }
      await Notification.insertMany(notifsToInsert);

      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(50);

      const recoveryResult = await recoverMissingExpiredClassNotifications(new Date(), { batchSize: 30 });
      expect(recoveryResult.recoveredCount).toBe(missingCount);

      const totalNotifs = await Notification.countDocuments({ userId: teacher._id });
      expect(totalNotifs).toBe(totalClasses);

      const secondRun = await recoverMissingExpiredClassNotifications(new Date(), { batchSize: 30 });
      expect(secondRun.recoveredCount).toBe(0);
    });

    test("8. Recovery không nhầm manual rejection: Bỏ qua lớp bị Admin từ chối", async () => {
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const manualCls = await createClassFixture("REJECTED", pastDate, {
        reviewedBy: admin._id,
        reviewNote: "Admin từ chối vì đã đến ngày khai giảng mà hồ sơ chưa hoàn chỉnh.",
      });

      await AuditLog.create({
        actorAdminId: admin._id,
        actorType: "ADMIN",
        action: "CLASS_REJECTED",
        targetType: "Class",
        targetId: manualCls._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: { status: "REJECTED", reviewNote: manualCls.reviewNote },
      });

      const res = await recoverMissingExpiredClassNotifications(new Date(), {});
      expect(res.recoveredCount).toBe(0);
      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(0);
    });
  });

  // =========================================================================
  // 4. CONCURRENCY & LEASE FENCING (Req 9, 10, 11)
  // =========================================================================
  describe("FIX-02: Concurrency & Lock Fencing Safety", () => {
    test("9. Hai worker đồng thời: Đúng 1 worker reject thành công, không tạo duplicate audit hoặc notification", async () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

      const [res1, res2] = await Promise.all([
        rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 }),
        rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 }),
      ]);

      const totalRejected = res1.rejectedCount + res2.rejectedCount;
      expect(totalRejected).toBe(1);

      expect(await AuditLog.countDocuments({ targetId: cls._id })).toBe(1);
      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(1);
    });

    test("10. Lease expiration / stolen lock giữa transaction (Lock Fencing): Transaction lập tức abort", async () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      const pastDate = new Date("2026-11-18T17:00:00.000Z");
      const cls = await createClassFixture("PENDING_APPROVAL", pastDate);

      await acquire("test-fencing-lock", 60000, "worker-fencing-1");

      const mockLockContext = {
        name: "test-fencing-lock",
        instanceId: "worker-fencing-1",
        isLeaseActive: () => true,
        verifyOwnership: async (session = null) => {
          if (!session) {
            return true; // Pre-transaction check passes
          }
          // Inside transaction: simulate lease expired/stolen by worker 2 in MongoDB
          await JobLock.updateOne(
            { name: "test-fencing-lock" },
            { $set: { owner: "worker-fencing-2", lockedUntil: new Date(Date.now() + 60000) } }
          );
          // With session, verifyOwnership performs write update on JobLock matching owner
          return verifyOwnership("test-fencing-lock", "worker-fencing-1", session);
        },
      };

      const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420, lockContext: mockLockContext });

      expect(result.rejectedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("Lock fencing error");

      // Verify Class is still PENDING_APPROVAL
      const fresh = await Class.findById(cls._id).lean();
      expect(fresh.status).toBe("PENDING_APPROVAL");

      expect(await AuditLog.countDocuments({ targetId: cls._id })).toBe(0);
      expect(await Notification.countDocuments({ userId: teacher._id })).toBe(0);
    });

    test("11. FencingToken increments on transactional verification", async () => {
      await acquire("test-token-lock", 60000, "worker-token");

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const ok = await verifyOwnership("test-token-lock", "worker-token", session);
          expect(ok).toBe(true);
        });
      } finally {
        await session.endSession();
      }

      const lockDoc = await JobLock.findOne({ name: "test-token-lock" }).lean();
      expect(lockDoc.fencingToken).toBe(1);
    });
  });

  // =========================================================================
  // 5. BASELINE & BOUNDARY CHECKS (Scenarios 12 - 16)
  // =========================================================================
  describe("Distributed Lock Baseline & Timezone Precision", () => {
    test("12. Notification deduplication qua unique index", async () => {
      const dedupeKey = "unique:dedupe:key:12";
      const res1 = await notificationService.notify(teacher._id, "T1", "C1", "CLASS_EXPIRED_REJECTED", { dedupeKey });
      const res2 = await notificationService.notify(teacher._id, "T2", "C2", "CLASS_EXPIRED_REJECTED", { dedupeKey });
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(await Notification.countDocuments({ userId: teacher._id, dedupeKey })).toBe(1);
    });

    test("13. Heartbeat gia hạn khóa thành công", async () => {
      let initialExpiry, finalExpiry;
      await runExclusive(
        "test-lock-hb-13",
        1000,
        async (lockContext) => {
          const doc1 = await JobLock.findOne({ name: "test-lock-hb-13" }).lean();
          initialExpiry = new Date(doc1.lockedUntil).getTime();
          await new Promise((r) => setTimeout(r, 350));
          const doc2 = await JobLock.findOne({ name: "test-lock-hb-13" }).lean();
          finalExpiry = new Date(doc2.lockedUntil).getTime();
        },
        undefined,
        { heartbeatIntervalMs: 150 }
      );
      expect(finalExpiry).toBeGreaterThan(initialExpiry);
    });

    test("14. Release không xóa lock của worker khác", async () => {
      await acquire("test-lock-rel-14", 5000, "worker-14A");
      await JobLock.updateOne(
        { name: "test-lock-rel-14" },
        { $set: { owner: "worker-14B", lockedUntil: new Date(Date.now() + 10000) } }
      );
      const released = await release("test-lock-rel-14", "worker-14A");
      expect(released).toBe(false);
      const doc = await JobLock.findOne({ name: "test-lock-rel-14" }).lean();
      expect(doc.owner).toBe("worker-14B");
    });

    test("15. Lớp tương lai không bị từ chối", async () => {
      const now = new Date("2026-11-20T10:00:00.000Z");
      const futureDate = new Date("2026-11-24T17:00:00.000Z");
      const futureClass = await createClassFixture("PENDING_APPROVAL", futureDate);

      const result = await rejectExpiredPendingClasses(now, { tzOffsetMinutes: 420 });
      expect(result.rejectedCount).toBe(0);
      expect((await Class.findById(futureClass._id).lean()).status).toBe("PENDING_APPROVAL");
    });

    test("16. Hằng số bảo trì được xuất đúng chuẩn", () => {
      expect(DEFAULT_MAINTENANCE_LOCK_TTL_MS).toBe(240000);
      expect(DEFAULT_MAINTENANCE_HEARTBEAT_MS).toBe(60000);
      expect(resolveTzOffsetMinutes(420)).toBe(420);
    });
  });
});
