const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  CourseProposal,
  Class,
  Session,
  SessionAttendance,
  Enrollment,
  TeacherEarning,
  Notification,
  AuditLog,
  PlatformSetting,
  JobLock,
  SessionRefundReview,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { toDec } = require("../src/utils/money");
const { getSetting } = require("../src/utils/settings");
const { completeFinishedClasses } = require("../src/services/classLifecycleService");
const { createSafeRefundReviewsForSession } = require("../src/services/sessionIncidentService");
const expireEnrollmentsJob = require("../src/jobs/expireEnrollmentsJob");
const jobLock = require("../src/jobs/jobLock");
const {
  UNIQUE_INDEX_SPECS,
  runV3AcademicMigration,
} = require("../scripts/migrationPreflight");
const {
  backupDatabase,
  restoreDatabase,
  cloneCollections,
  reconcileIndexes,
  reconcileDocumentCounts,
} = require("../scripts/backupRestoreClone");
const { seedAcademicV3 } = require("../scripts/seedAcademicIdempotent");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("Phase 0 Real MongoMemoryReplSet Verification (QA-01, G0-05, G0-08, QA-07, G0-03, G0-04)", () => {
  let tempDirs = [];

  const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-p0-"));
    tempDirs.push(dir);
    return dir;
  };

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await clearDB();
    jest.restoreAllMocks();
  });

  const bootstrapAcademic = async () => {
    const passwordHash = hashPassword("Pass@123");
    const admin = await User.create({ email: "admin_p0@test.com", passwordHash, role: "ADMIN" });
    const teacher = await User.create({
      email: "teacher_p0@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher P0", verificationStatus: "VERIFIED" },
    });
    const student = await User.create({
      email: "student_p0@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student P0" },
    });
    const student2 = await User.create({
      email: "student2_p0@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Two P0" },
    });
    const category = await Category.create({ name: "Math", slug: "math-p0", createdBy: admin._id, status: "ACTIVE" });
    const subject = await Subject.create({
      name: "Algebra",
      slug: "algebra-p0",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const course = await Course.create({
      title: "Algebra 12",
      slug: "algebra-12-p0",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      level: "BEGINNER",
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher P0",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Algebra Class P0",
      classType: "PAID",
      price: toDec(500000),
      capacity: 10,
      status: "OPEN",
      startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { admin, teacher, student, student2, category, subject, course, cls };
  };

  // =========================================================================
  // 1. QA-01 Real Webhook Delegation, Refund Snapshot & Strict 300s Late Rule
  // =========================================================================
  describe("QA-01 fixes", () => {
    test("POST /api/sessions/livekit-webhook handles egress_ended with durationSeconds, segments & notifications", async () => {
      const { teacher, student, cls, course } = await bootstrapAcademic();
      await Enrollment.create({
        studentId: student._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(500000),
        amountPaidViaPayment: toDec(500000),
      });
      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Webhook Session",
        startDatetime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endDatetime: new Date(Date.now() - 60 * 60 * 1000),
        status: "COMPLETED",
        recording: { status: "PROCESSING", providerRecordingId: "EG_WEBHOOK_01" },
        recordingSegments: [
          {
            segmentIndex: 1,
            providerRecordingId: "EG_WEBHOOK_01",
            status: "PROCESSING",
            startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
        ],
      });

      const videoProvider = require("../src/services/videoProvider");
      jest.spyOn(videoProvider, "processWebhook").mockImplementationOnce((raw, body) => body);

      const res = await request(app)
        .post("/api/sessions/livekit-webhook")
        .set("Authorization", "Bearer test-livekit-sig")
        .send({
          event: "egress_ended",
          id: "evt_wh_egress_1",
          egressInfo: {
            egressId: "EG_WEBHOOK_01",
            status: 3,
            fileResults: [{ duration: String(240 * 1e9) }],
          },
        });

      expect(res.statusCode).toBe(200);
      const updated = await Session.findById(session._id).lean();
      expect(updated.recording.status).toBe("AVAILABLE");
      expect(updated.recording.durationSeconds).toBe(240);
      expect(updated.recordingSegments[0].status).toBe("AVAILABLE");
      expect(updated.recordingSegments[0].durationSeconds).toBe(240);

      const studentNotif = await Notification.findOne({
        userId: student._id,
        type: "SESSION_RECORDING_AVAILABLE",
      });
      expect(studentNotif).toBeTruthy();
    });

    test("SessionRefundReview snapshots real paidAmount (direct + scholarship) instead of 0", async () => {
      const { teacher, student, cls, course } = await bootstrapAcademic();
      const enrollment = await Enrollment.create({
        studentId: student._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "MIXED",
        tuitionAmount: toDec(500000),
        amountPaidViaPayment: toDec(300000),
        amountPaidViaScholarship: toDec(200000),
      });
      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Incident Session",
        startDatetime: new Date(Date.now() - 60 * 60 * 1000),
        endDatetime: new Date(Date.now() + 60 * 60 * 1000),
        status: "CANCELLED",
      });

      const reviews = await createSafeRefundReviewsForSession(session, "TEACHER_NO_SHOW");
      expect(reviews).toHaveLength(1);
      const saved = await SessionRefundReview.findOne({
        sessionId: session._id,
        enrollmentId: enrollment._id,
      }).lean();
      expect(saved.paidAmountSnapshot).toBe(500000);
      expect(saved.scholarshipAppliedSnapshot).toBe(true);
    });

    test("Join late threshold is strict at >300s (0 jitter): 300s -> PRESENT, 301s -> LATE", async () => {
      const { teacher, student, student2, cls, course } = await bootstrapAcademic();
      await Enrollment.create([
        {
          studentId: student._id,
          classId: cls._id,
          courseId: course._id,
          teacherId: teacher._id,
          enrollmentStatus: "CONFIRMED",
          paymentSource: "FREE",
        },
        {
          studentId: student2._id,
          classId: cls._id,
          courseId: course._id,
          teacherId: teacher._id,
          enrollmentStatus: "CONFIRMED",
          paymentSource: "FREE",
        },
      ]);

      const onTimeSession = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Exact 300s Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 300 * 1000),
        endDatetime: new Date(Date.now() + 3600 * 1000),
      });
      const r1 = await request(app).post(`/api/sessions/${onTimeSession._id}/join`).set(as(student));
      expect(r1.statusCode).toBe(200);
      const att1 = await SessionAttendance.findOne({ sessionId: onTimeSession._id, studentId: student._id });
      expect(att1.attendanceStatus).toBe("PRESENT");
      expect(att1.isLate).toBe(false);

      const lateSession = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Late 301s Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 301 * 1000),
        endDatetime: new Date(Date.now() + 3600 * 1000),
      });
      const r2 = await request(app).post(`/api/sessions/${lateSession._id}/join`).set(as(student2));
      expect(r2.statusCode).toBe(200);
      const att2 = await SessionAttendance.findOne({ sessionId: lateSession._id, studentId: student2._id });
      expect(att2.attendanceStatus).toBe("LATE");
      expect(att2.isLate).toBe(true);
    });
  });

  // =========================================================================
  // 2. G0-05 Versioned PlatformSettings & Zero-Safe Sync Bridge
  // =========================================================================
  describe("G0-05 versioned PlatformSetting CRUD, AuditLog, zero-value & rollback", () => {
    test("Admin CRUD, explicit 0 commission rate, AuditLog and version rollback", async () => {
      const { admin, teacher } = await bootstrapAcademic();

      // Non-admin blocked
      const forbidRes = await request(app).get("/api/admin/settings").set(as(teacher));
      expect(forbidRes.statusCode).toBe(403);

      // Update COMMISSION_RATE to explicit 0 (tests zero-safety)
      const putV1 = await request(app)
        .put("/api/admin/settings/COMMISSION_RATE")
        .set(as(admin))
        .send({ value: 0, changeReason: "Zero commission promo" });
      expect(putV1.statusCode).toBe(200);
      expect(putV1.body.data.setting.version).toBe(1);
      expect(putV1.body.data.current.value).toBe(0);
      expect(putV1.body.data.current.source).toBe("DB");
      expect(getSetting("COMMISSION_RATE")).toBe(0);

      // Update v2 to 0.15
      const putV2 = await request(app)
        .put("/api/admin/settings/COMMISSION_RATE")
        .set(as(admin))
        .send({ value: 0.15, changeReason: "Standard rate Q4" });
      expect(putV2.statusCode).toBe(200);
      expect(putV2.body.data.setting.version).toBe(2);
      expect(getSetting("COMMISSION_RATE")).toBe(0.15);

      // Future effectiveFrom does not override current active until effective date
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const putV3 = await request(app)
        .put("/api/admin/settings/COMMISSION_RATE")
        .set(as(admin))
        .send({ value: 0.2, effectiveFrom: futureDate, changeReason: "Scheduled Q1" });
      expect(putV3.statusCode).toBe(200);
      expect(putV3.body.data.current.value).toBe(0.15);
      expect(putV3.body.data.current.scheduledNext.version).toBe(3);

      // Rollback to v1 creates monotonic v4 with value 0
      const rbRes = await request(app)
        .post("/api/admin/settings/COMMISSION_RATE/rollback")
        .set(as(admin))
        .send({ targetVersion: 1, changeReason: "Restore promo rate" });
      expect(rbRes.statusCode).toBe(200);
      expect(rbRes.body.data.setting.version).toBe(4);
      expect(rbRes.body.data.current.value).toBe(0);
      expect(getSetting("COMMISSION_RATE")).toBe(0);

      const audits = await AuditLog.find({ targetType: "PlatformSetting" }).lean();
      expect(audits.length).toBeGreaterThanOrEqual(4);
      expect(audits.some((a) => a.action === "PLATFORM_SETTING_ROLLED_BACK")).toBe(true);
    });
  });

  // =========================================================================
  // 3. G0-08 Atomic Transactional Class Completion & Poison-Item Isolation
  // =========================================================================
  describe("G0-08 atomicity, FIFO ordering, poison-item isolation & lease extend", () => {
    test("completeFinishedClasses rolls back Class and Enrollment when TeacherEarning write fails", async () => {
      const { teacher, student, cls, course } = await bootstrapAcademic();
      await Class.updateOne({ _id: cls._id }, { $set: { status: "IN_PROGRESS", endDate: new Date(Date.now() - 60 * 60 * 1000) } });
      const enrollment = await Enrollment.create({
        studentId: student._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(500000),
        amountPaidViaPayment: toDec(500000),
      });
      await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollment._id,
        classId: cls._id,
        grossAmount: toDec(500000),
        commissionAmount: toDec(50000),
        netAmount: toDec(450000),
        status: "PENDING",
      });
      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Ended Session",
        startDatetime: new Date(Date.now() - 3 * 60 * 60 * 1000),
        endDatetime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: "COMPLETED",
      });

      jest.spyOn(TeacherEarning, "updateMany").mockRejectedValueOnce(new Error("Simulated earning ledger write failure"));

      await expect(completeFinishedClasses(new Date())).rejects.toThrow("Simulated earning ledger write failure");

      // Both Class and Enrollment must remain rolled back
      expect((await Class.findById(cls._id).lean()).status).toBe("IN_PROGRESS");
      expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("CONFIRMED");
      expect(await Notification.exists({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBeFalsy();
    });

    test("expireEnrollmentsJob isolates failing enrollment without blocking subsequent items", async () => {
      const { teacher, student, student2, category, subject, course } = await bootstrapAcademic();
      const cls2 = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: "Teacher P0",
        categoryId: category._id,
        subjectId: subject._id,
        className: "Expire Class P0",
        classType: "PAID",
        price: toDec(100000),
        capacity: 10,
        enrolledCount: 2,
        status: "OPEN",
      });

      const badE = await Enrollment.create({
        studentId: student._id,
        classId: cls2._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(100000),
        holdExpiresAt: new Date(Date.now() - 120000), // oldest -> runs first
      });
      const goodE = await Enrollment.create({
        studentId: student2._id,
        classId: cls2._id,
        courseId: course._id,
        teacherId: teacher._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(100000),
        holdExpiresAt: new Date(Date.now() - 60000), // runs second
      });

      const origRelease = require("../src/services/reservationService").releaseReservation;
      const reservationService = require("../src/services/reservationService");
      jest.spyOn(reservationService, "releaseReservation").mockImplementation(async (id, status) => {
        if (String(id) === String(badE._id)) throw new Error("Poison enrollment lock timeout");
        return origRelease(id, status);
      });

      const summary = await expireEnrollmentsJob.runJob();
      expect(summary.processed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.released).toBe(1);
      expect((await Enrollment.findById(badE._id).lean()).enrollmentStatus).toBe("PENDING_PAYMENT");
      expect((await Enrollment.findById(goodE._id).lean()).enrollmentStatus).toBe("EXPIRED");
      expect((await Class.findById(cls2._id).lean()).enrolledCount).toBe(1);
    });

    test("jobLock.extend renews active lease for owner and blocks non-owner", async () => {
      expect(await jobLock.acquire("lease_test", 1000, "inst-A")).toBe(true);
      expect(await jobLock.extend("lease_test", 5000, "inst-B")).toBe(false);
      expect(await jobLock.extend("lease_test", 5000, "inst-A")).toBe(true);
      expect(await jobLock.release("lease_test", "inst-A")).toBe(true);
    });
  });

  // =========================================================================
  // 4. QA-07 Real MongoDB Backup / Corruption Abort / Restore / Clone / Parity
  // =========================================================================
  describe("QA-07 real MongoDB backup, tamper abort, restore, clone & index parity", () => {
    test("backupDatabase writes SHA-256 manifest; tampered backup aborts BEFORE dropping DB; clone & reconcile pass", async () => {
      await bootstrapAcademic();
      const db = mongoose.connection.db;
      const outDir = makeTempDir();

      const backup = await backupDatabase(db, outDir);
      expect(fs.existsSync(backup.manifestPath)).toBe(true);
      expect(backup.collectionCount).toBeGreaterThan(0);

      // Verify full unique index parity on real ReplSet against all specs
      const parity = await reconcileIndexes(db, UNIQUE_INDEX_SPECS);
      expect(parity.allIndexesPresent).toBe(true);
      expect(parity.checkedCount).toBe(UNIQUE_INDEX_SPECS.length);

      // Tamper backup payload after dump
      const usersBackupPath = path.join(backup.backupDir, "users.json");
      const originalRaw = fs.readFileSync(usersBackupPath, "utf8");
      fs.writeFileSync(usersBackupPath, `${originalRaw} `, "utf8");

      await expect(restoreDatabase(db, backup.backupDir, { drop: true })).rejects.toThrow(/BACKUP_CHECKSUM_MISMATCH/);
      // Target DB must NOT have been dropped when checksum failed!
      expect(await User.countDocuments({})).toBe(4);

      // Repair file -> atomic restore works cleanly & preserves Decimal128
      fs.writeFileSync(usersBackupPath, originalRaw, "utf8");
      const restored = await restoreDatabase(db, backup.backupDir, { drop: true });
      expect(restored.restoredCollections).toBeGreaterThan(0);
      const clsRestored = await Class.findOne({ className: "Algebra Class P0" }).lean();
      expect(clsRestored.price.toString()).toBe("500000");

      // Clone to second database on same client & verify counts
      const cloneDbName = `edunity_clone_${Date.now()}`;
      const cloneDb = mongoose.connection.getClient().db(cloneDbName);
      try {
        await cloneCollections(db, cloneDb, { dropTarget: true });
        const countCheck = await reconcileDocumentCounts(db, cloneDb);
        expect(countCheck.matchedAll).toBe(true);
      } finally {
        await cloneDb.dropDatabase();
      }
    });
  });

  // =========================================================================
  // 5. G0-03 Real Dry-Run, Safe-Halt, Forward Apply & Rollback Migration
  // =========================================================================
  describe("G0-03 real ReplSet preflight, safe-halt, apply & rollback", () => {
    test("Detects duplicate safe-halt without writing; transforms BASIC->BEGINNER on apply & restores on rollback", async () => {
      const db = mongoose.connection.db;
      const { admin, category, subject, teacher } = await bootstrapAcademic();

      // Insert legacy "BASIC" directly into MongoDB bypassing Mongoose validation
      const legacyCourseId = new mongoose.Types.ObjectId();
      await db.collection("courses").insertOne({
        _id: legacyCourseId,
        subjectId: subject._id,
        subjectName: subject.name,
        categoryId: category._id,
        categoryName: category.name,
        title: "Legacy Basic Course",
        slug: "legacy-basic-course",
        level: "BASIC",
        status: "ACTIVE",
        createdBy: admin._id,
        isDeleted: false,
      });
      await db.collection("courseproposals").insertOne({
        _id: new mongoose.Types.ObjectId(),
        teacherId: teacher._id,
        categoryId: category._id,
        subjectId: subject._id,
        title: "Legacy Basic Proposal",
        level: "BASIC",
        status: "PENDING_REVIEW",
      });

      const outDir = makeTempDir();

      // 1. Dry-run reads cleanly and performs zero writes
      const dryRun = await runV3AcademicMigration({ db, apply: false, useLock: false });
      expect(dryRun.mode).toBe("DRY_RUN");
      expect(dryRun.wroteChanges).toBe(false);
      expect(dryRun.plannedTransforms.legacyCoursesBasicToBeginner).toBe(1);
      expect(dryRun.plannedTransforms.legacyProposalsBasicToBeginner).toBe(1);
      expect((await db.collection("courses").findOne({ _id: legacyCourseId })).level).toBe("BASIC");

      // 2. Apply transforms BASIC -> BEGINNER safely with backup + JobLock
      const applied = await runV3AcademicMigration({ db, apply: true, outputDir: outDir, actorId: admin._id });
      expect(applied.mode).toBe("APPLY");
      expect(applied.success).toBe(true);
      expect(applied.transformStats.coursesNormalized).toBe(1);
      expect(applied.transformStats.courseProposalsNormalized).toBe(1);
      expect((await db.collection("courses").findOne({ _id: legacyCourseId })).level).toBe("BEGINNER");
      expect(await AuditLog.exists({ action: "V3_MIGRATION_APPLY" })).toBeTruthy();

      // 3. Rollback restores original "BASIC" record from verified EJSON backup
      const rolledBack = await runV3AcademicMigration({
        db,
        rollback: true,
        backupDir: applied.backupDir,
        actorId: admin._id,
      });
      expect(rolledBack.mode).toBe("ROLLBACK");
      expect(rolledBack.success).toBe(true);
      expect((await db.collection("courses").findOne({ _id: legacyCourseId })).level).toBe("BASIC");

      // 4. Safe-halt blocks forward apply on orphan financial Payment
      await db.collection("payments").insertOne({
        _id: new mongoose.Types.ObjectId(),
        enrollmentId: new mongoose.Types.ObjectId(),
        payerUserId: admin._id,
        gateway: "VNPAY",
        gatewayReference: "ORPHAN-GW-01",
        amount: mongoose.Types.Decimal128.fromString("100000"),
        paymentStatus: "PENDING",
      });
      const halted = await runV3AcademicMigration({ db, apply: true, outputDir: outDir });
      expect(halted.halted).toBe(true);
      expect(halted.wroteChanges).toBe(false);
      expect(halted.safeHalt.blockers[0].rule).toBe("ORPHAN_FINANCIAL_RECORDS");
    });
  });

  // =========================================================================
  // 6. G0-04 Real MongoDB 2x Idempotent Seed Without Clobbering Live State
  // =========================================================================
  describe("G0-04 real MongoDB 2x idempotent seed", () => {
    test("Runs twice with 0 duplicates, no invalid adminProfile, preserves live edits & updates enrolledCount=2", async () => {
      const pass1 = await seedAcademicV3({ logger: () => {} });
      expect(pass1.success).toBe(true);
      expect(pass1.stats.users.created).toBe(8);
      expect(pass1.stats.enrollments.created).toBe(2);

      const adminDoc = await User.findOne({ email: "admin@edunity.vn" }).lean();
      expect(adminDoc.adminProfile).toBeUndefined();

      const seededClass = await Class.findOne({
        className: "Toán 12 – Luyện đề Chuyên sâu Khóa 01",
      }).lean();
      expect(seededClass.enrolledCount).toBe(2);

      // Simulate runtime state changes on live DB
      const newStartDate = new Date("2030-01-15T00:00:00.000Z");
      await User.updateOne(
        { email: "student.minhanh@edunity.vn" },
        { $set: { passwordHash: "custom_rotated_hash", status: "SUSPENDED" } }
      );
      await Class.updateOne(
        { _id: seededClass._id },
        { $set: { status: "IN_PROGRESS", startDate: newStartDate } }
      );

      // Pass 2 must be idempotent and MUST NOT overwrite passwordHash, status, startDate
      const pass2 = await seedAcademicV3({ logger: () => {} });
      expect(pass2.success).toBe(true);
      expect(pass2.stats.users.created).toBe(0);
      expect(pass2.stats.classes.created).toBe(0);
      expect(pass2.stats.enrollments.created).toBe(0);

      const studentAfter = await User.findOne({ email: "student.minhanh@edunity.vn" }).lean();
      expect(studentAfter.passwordHash).toBe("custom_rotated_hash");
      expect(studentAfter.status).toBe("SUSPENDED");

      const classAfter = await Class.findById(seededClass._id).lean();
      expect(classAfter.status).toBe("IN_PROGRESS");
      expect(new Date(classAfter.startDate).toISOString()).toBe(newStartDate.toISOString());
      expect(classAfter.enrolledCount).toBe(2);
    });
  });
});
