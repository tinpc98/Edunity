const mongoose = require("mongoose");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  Enrollment,
  TeacherEarning,
  TeacherSettlement,
  Notification,
} = require("../src/models");
const { completeFinishedClasses } = require("../src/services/classLifecycleService");
const settlementService = require("../src/services/settlementService");
const { toDec } = require("../src/utils/money");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

describe("P0 Regression: Class Lifecycle Completion & V3 Settlement Integration", () => {
  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await clearDB();
  });

  const seedCompletedEligibleClass = async ({ withSecondStudent = false } = {}) => {
    const teacher = await User.create({
      email: `teacher_${Date.now()}_${Math.random()}@test.com`,
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher Lifecycle", verificationStatus: "VERIFIED" },
    });
    const student = await User.create({
      email: `student1_${Date.now()}_${Math.random()}@test.com`,
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student 1" },
    });
    const student2 = withSecondStudent
      ? await User.create({
          email: `student2_${Date.now()}_${Math.random()}@test.com`,
          passwordHash: "x",
          role: "STUDENT",
          status: "ACTIVE",
          studentProfile: { fullName: "Student 2" },
        })
      : null;

    const category = await Category.create({
      name: "Toan Lifecycle",
      slug: `toan-lc-${Date.now()}-${Math.random()}`,
      createdBy: teacher._id,
    });
    const subject = await Subject.create({
      name: "Dai so Lifecycle",
      slug: `dai-so-lc-${Date.now()}-${Math.random()}`,
      categoryId: category._id,
      categoryName: category.name,
      createdBy: teacher._id,
    });
    const course = await Course.create({
      title: "Course Lifecycle",
      slug: `course-lc-${Date.now()}-${Math.random()}`,
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      level: "BEGINNER",
      createdBy: teacher._id,
    });

    const now = new Date();
    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher Lifecycle",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Class Lifecycle Regression",
      classType: "PAID",
      price: toDec(500000),
      capacity: 20,
      enrolledCount: withSecondStudent ? 2 : 1,
      status: "IN_PROGRESS",
      startDate: new Date(now.getTime() - 10 * 86400000),
      endDate: new Date(now.getTime() - 3600000),
    });

    await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Buoi cuoi",
      startDatetime: new Date(now.getTime() - 7200000),
      endDatetime: new Date(now.getTime() - 3600000),
      actualEndAt: new Date(now.getTime() - 3600000),
      status: "COMPLETED",
      roomState: "ENDED",
    });

    const enrollment = await Enrollment.create({
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE", // Avoids needing Payment doc when testing settlement milestone rules in isolation
      tuitionAmount: toDec(500000),
    });

    const enrollment2 = withSecondStudent
      ? await Enrollment.create({
          classId: cls._id,
          courseId: course._id,
          teacherId: teacher._id,
          studentId: student2._id,
          enrollmentStatus: "CONFIRMED",
          paymentSource: "FREE",
          tuitionAmount: toDec(500000),
        })
      : null;

    return { teacher, student, student2, cls, enrollment, enrollment2, now };
  };

  test("1. Rolls back Class when Enrollment.updateMany fails (atomic consistency)", async () => {
    const { teacher, cls, enrollment, now } = await seedCompletedEligibleClass();
    const legacyEarning = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: false,
    });

    jest.spyOn(Enrollment, "updateMany").mockRejectedValueOnce(new Error("Simulated enrollment write failure"));

    await expect(completeFinishedClasses(now)).rejects.toThrow("Simulated enrollment write failure");

    expect((await Class.findById(cls._id).lean()).status).toBe("IN_PROGRESS");
    expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("CONFIRMED");
    expect((await TeacherEarning.findById(legacyEarning._id).lean()).status).toBe("PENDING");
    expect(await Notification.exists({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBeFalsy();
  });

  test("2. Rolls back Class and Enrollment when TeacherEarning.updateMany fails, and succeeds on retry", async () => {
    const { teacher, cls, enrollment, now } = await seedCompletedEligibleClass();
    const legacyEarning = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: false,
    });

    jest.spyOn(TeacherEarning, "updateMany").mockRejectedValueOnce(new Error("Simulated earning write failure"));

    await expect(completeFinishedClasses(now)).rejects.toThrow("Simulated earning write failure");

    expect((await Class.findById(cls._id).lean()).status).toBe("IN_PROGRESS");
    expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("CONFIRMED");
    expect((await TeacherEarning.findById(legacyEarning._id).lean()).status).toBe("PENDING");
    expect(await Notification.exists({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBeFalsy();

    // Retry once transient error clears succeeds completely
    const retried = await completeFinishedClasses(now);
    expect(retried).toEqual([cls._id.toString()]);
    expect((await Class.findById(cls._id).lean()).status).toBe("COMPLETED");
    expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("COMPLETED");
    expect((await TeacherEarning.findById(legacyEarning._id).lean()).status).toBe("AVAILABLE");
  });

  test("3. When settlement fails after Class completes: logs error, records FAILED retry state, does NOT swallow silently, and recovers on next run", async () => {
    const { teacher, cls, enrollment, now } = await seedCompletedEligibleClass();
    const v3Earning = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: true,
    });

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const evalSpy = jest
      .spyOn(settlementService, "evaluateClassSettlement")
      .mockRejectedValueOnce(new Error("Simulated settlement outage"));

    const completedIds = await completeFinishedClasses(now);
    expect(completedIds).toEqual([cls._id.toString()]);

    // Class + Enrollment committed; V3 earning stayed safely PENDING (fail-closed)
    const afterFailureCls = await Class.findById(cls._id).lean();
    expect(afterFailureCls.status).toBe("COMPLETED");
    expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("COMPLETED");
    expect((await TeacherEarning.findById(v3Earning._id).lean()).status).toBe("PENDING");

    // Must log + persist observable FAILED tracking instead of catch (_) {}
    expect(errSpy).toHaveBeenCalled();
    expect(afterFailureCls.settlementSyncStatus).toBe("FAILED");
    expect(afterFailureCls.settlementSyncAttempts).toBe(1);
    expect(afterFailureCls.settlementSyncError).toContain("Simulated settlement outage");
    expect(await TeacherSettlement.countDocuments({ classId: cls._id })).toBe(0);

    // Subsequent completeFinishedClasses run retries settlement automatically without duplicate notifications
    evalSpy.mockRestore();
    const secondRunIds = await completeFinishedClasses(now);
    expect(secondRunIds).toEqual([]);

    const afterRecoveryCls = await Class.findById(cls._id).lean();
    expect(afterRecoveryCls.settlementSyncStatus).toBe("SYNCED");
    expect(afterRecoveryCls.settlementSyncError).toBeNull();
    expect(await TeacherSettlement.countDocuments({ classId: cls._id })).toBe(1);
    expect((await TeacherEarning.findById(v3Earning._id).lean()).status).toBe("PENDING");
    expect(await Notification.countDocuments({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBe(1);
  });

  test("4. Calling completeFinishedClasses concurrently executes safely without duplicate side effects or inconsistent states", async () => {
    const { teacher, cls, enrollment, enrollment2, now } = await seedCompletedEligibleClass({
      withSecondStudent: true,
    });

    const legacyEarning = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: false,
    });
    const v3Earning = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment2._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: true,
    });

    const [resA, resB] = await Promise.all([completeFinishedClasses(now), completeFinishedClasses(now)]);
    const allReturned = [...resA, ...resB];
    expect(allReturned).toEqual([cls._id.toString()]);

    const dbCls = await Class.findById(cls._id).lean();
    expect(dbCls.status).toBe("COMPLETED");
    expect(dbCls.settlementSyncStatus).toBe("SYNCED");

    const enrollments = await Enrollment.find({ classId: cls._id }).lean();
    expect(enrollments.every((e) => e.enrollmentStatus === "COMPLETED")).toBe(true);

    expect((await TeacherEarning.findById(legacyEarning._id).lean()).status).toBe("AVAILABLE");
    expect((await TeacherEarning.findById(v3Earning._id).lean()).status).toBe("PENDING");
    expect(await Notification.countDocuments({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBe(1);
    expect(await TeacherSettlement.countDocuments({ classId: cls._id })).toBe(1);
  });

  test("5. Transaction rollback leaves zero partial state across multiple Enrollments and TeacherEarnings", async () => {
    const { teacher, cls, enrollment, enrollment2, now } = await seedCompletedEligibleClass({
      withSecondStudent: true,
    });

    await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: false,
    });
    await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment2._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: true,
    });

    jest.spyOn(TeacherEarning, "updateMany").mockRejectedValueOnce(new Error("Simulated mid-tx abort"));

    await expect(completeFinishedClasses(now)).rejects.toThrow("Simulated mid-tx abort");

    expect((await Class.findById(cls._id).lean()).status).toBe("IN_PROGRESS");
    const dbEnrollments = await Enrollment.find({ classId: cls._id }).lean();
    expect(dbEnrollments.every((e) => e.enrollmentStatus === "CONFIRMED")).toBe(true);
    const dbEarnings = await TeacherEarning.find({ classId: cls._id }).lean();
    expect(dbEarnings.every((e) => e.status === "PENDING")).toBe(true);
    expect(await TeacherSettlement.countDocuments({ classId: cls._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: teacher._id, type: "CLASS_COMPLETED" })).toBe(0);
  });

  test("6. Preserves V3 7-day settlement hold: NEVER releases V3 or missing-flag earnings early, matures after 7 days", async () => {
    const { teacher, cls, enrollment, enrollment2, now } = await seedCompletedEligibleClass({
      withSecondStudent: true,
    });

    const explicitV3 = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
      settlementHoldRequired: true,
    });
    const legacyUnflagged = await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollment2._id,
      classId: cls._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "PENDING",
    });
    // Remove settlementHoldRequired in raw DB to confirm fail-closed handling
    await TeacherEarning.collection.updateOne({ _id: legacyUnflagged._id }, { $unset: { settlementHoldRequired: 1 } });

    await completeFinishedClasses(now);

    expect((await Class.findById(cls._id).lean()).status).toBe("COMPLETED");
    expect((await Enrollment.findById(enrollment._id).lean()).enrollmentStatus).toBe("COMPLETED");

    // Both must remain PENDING under 7-day hold
    const e1Now = await TeacherEarning.findById(explicitV3._id).lean();
    const e2Now = await TeacherEarning.findById(legacyUnflagged._id).lean();
    expect(e1Now.status).toBe("PENDING");
    expect(e2Now.status).toBe("PENDING");
    expect(e1Now.settlementBlockers).toContain("SEVEN_DAY_HOLD_ACTIVE");

    // At Day 6: still PENDING
    const day6 = new Date(now.getTime() + 6 * 86400000);
    await settlementService.evaluateClassSettlement(cls._id, { now: day6 });
    expect((await TeacherEarning.findById(explicitV3._id).lean()).status).toBe("PENDING");
    expect((await TeacherEarning.findById(legacyUnflagged._id).lean()).status).toBe("PENDING");

    // At Day 8: matures to AVAILABLE
    const day8 = new Date(now.getTime() + 8 * 86400000);
    await settlementService.evaluateClassSettlement(cls._id, { now: day8 });
    expect((await TeacherEarning.findById(explicitV3._id).lean()).status).toBe("AVAILABLE");
    expect((await TeacherEarning.findById(legacyUnflagged._id).lean()).status).toBe("AVAILABLE");
  });
});

