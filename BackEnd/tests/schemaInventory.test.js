const mongoose = require("mongoose");
const models = require("../src/models");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");
const { softDeletePlugin, reviewablePlugin, adminManagedPlugin } = require("../src/models/plugins");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const { createReview } = require("../src/services/reviewService");

const EXPECTED_MODELS = [
  "User",
  "RefreshToken",
  "Category",
  "Subject",
  "Course",
  "CourseProposal",
  "SyllabusVersion",
  "CurriculumUnit",
  "LearningPath",
  "CoursePricingPolicy",
  "Class",
  "Session",
  "ScheduleIdempotencyKey",
  "TeacherScheduleLock",
  "TeacherSubjectAuthorization",
  "SessionAttendance",
  "Enrollment",
  "Payment",
  "Transaction",
  "TeacherEarning",
  "Payout",
  "Review",
  "ScholarshipCampaign",
  "SponsorContribution",
  "ScholarshipApplication",
  "PaperDossierReceipt",
  "Scholarship",
  "ScholarshipUsage",
  "VerificationDocument",
  "Notification",
  "Conversation",
  "Message",
  "Report",
  "AuditLog",
  "PlatformSetting",
  "SessionPresenceInterval",
  "TeacherViolation",
  "TeacherDisciplineCase",
  "TeacherIncidentReport",
  "SessionRescheduleRequest",
  "SessionRefundReview",
  "JobLock",
  "LearningResource",
  "Assignment",
  "Submission",
  "Grade",
  "GradeHistory",
  "Assessment",
  "Question",
  "Attempt",
  "PlacementResult",
  "SessionReview",
  "StudentProgressReview",
  "TeacherContractReviewPacket",
  "MessageModerationReport",
  "AiAuditLog",
  "AiGeneratedDraft",
];

const SOFT_DELETED_MODELS = [
  "User",
  "Category",
  "Subject",
  "Course",
  "SyllabusVersion",
  "CurriculumUnit",
  "LearningPath",
  "Class",
  "Review",
  "ScholarshipCampaign",
  "Message",
  "LearningResource",
  "Assignment",
  "Assessment",
  "Question",
  "SessionReview",
  "AiGeneratedDraft",
];

const NON_SOFT_DELETED_FINANCIAL_OR_LIFECYCLE_MODELS = [
  "Session",
  "Enrollment",
  "Payment",
  "Transaction",
  "TeacherEarning",
  "Payout",
  "AuditLog",
];

describe("TASK G0-02: Mongoose Schema Inventory & Validation", () => {
  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
  });

  describe("1. Registry, Exports and Constants Verification", () => {
    test("G0-02.1.1: Models/index.js exports all expected Mongoose models (57 models)", () => {
      expect(Object.keys(models)).toHaveLength(EXPECTED_MODELS.length);
      for (const modelName of EXPECTED_MODELS) {
        expect(models[modelName]).toBeDefined();
        expect(models[modelName].modelName).toBe(modelName);
        expect(mongoose.models[modelName]).toBeDefined();
      }
    });

    test("G0-02.1.2: constants.js exports GRADE_LEVELS (15 levels) and COURSE_LEVELS (3 levels)", () => {
      expect(GRADE_LEVELS).toHaveLength(15);
      expect(GRADE_LEVELS).toContain("GRADE_1");
      expect(GRADE_LEVELS).toContain("GRADE_12");
      expect(GRADE_LEVELS).toContain("UNIVERSITY");
      expect(GRADE_LEVELS).toContain("COLLEGE");
      expect(GRADE_LEVELS).toContain("PRE_PRIMARY");

      expect(COURSE_LEVELS).toEqual(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
    });

    test("G0-02.1.3: plugins.js exports all 3 common archetype plugins", () => {
      expect(typeof softDeletePlugin).toBe("function");
      expect(typeof reviewablePlugin).toBe("function");
      expect(typeof adminManagedPlugin).toBe("function");
    });
  });

  describe("2. Mapping BEGINNER vs BASIC (Course & CourseProposal)", () => {
    test("G0-02.2.1: Course.level rejects 'BASIC' with ValidationError and accepts 'BEGINNER'", async () => {
      const invalidCourse = new models.Course({
        subjectId: new mongoose.Types.ObjectId(),
        subjectName: "Toán",
        categoryId: new mongoose.Types.ObjectId(),
        categoryName: "Trung học",
        title: "Toán cơ bản",
        slug: "toan-co-ban",
        level: "BASIC", // invalid enum
        createdBy: new mongoose.Types.ObjectId(),
      });

      let caughtErr;
      try {
        await invalidCourse.validate();
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr).toBeDefined();
      expect(caughtErr.errors.level).toBeDefined();
      expect(caughtErr.errors.level.name).toBe("ValidatorError");

      // Valid level
      invalidCourse.level = "BEGINNER";
      await expect(invalidCourse.validate()).resolves.toBeUndefined();
    });

    test("G0-02.2.2: CourseProposal.level rejects 'BASIC' and accepts canonical 'BEGINNER'", async () => {
      const invalidProposal = new models.CourseProposal({
        teacherId: new mongoose.Types.ObjectId(),
        categoryId: new mongoose.Types.ObjectId(),
        subjectId: new mongoose.Types.ObjectId(),
        title: "Tiếng Anh sơ cấp",
        level: "BASIC",
      });

      let caughtErr;
      try {
        await invalidProposal.validate();
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr).toBeDefined();
      expect(caughtErr.errors.level).toBeDefined();

      invalidProposal.level = "BEGINNER";
      await expect(invalidProposal.validate()).resolves.toBeUndefined();
    });

    test("G0-02.2.3: Canonical Ingress Normalization Helper maps 'BASIC' -> 'BEGINNER'", () => {
      const normalizeLevel = (raw) => {
        if (!raw) return raw;
        const upper = String(raw).trim().toUpperCase();
        if (upper === "BASIC") return "BEGINNER";
        return upper;
      };

      expect(normalizeLevel("BASIC")).toBe("BEGINNER");
      expect(normalizeLevel("basic")).toBe("BEGINNER");
      expect(normalizeLevel("BEGINNER")).toBe("BEGINNER");
      expect(normalizeLevel("INTERMEDIATE")).toBe("INTERMEDIATE");
      expect(normalizeLevel("ADVANCED")).toBe("ADVANCED");
    });
  });

  describe("3. Mapping Review cũ vs Session", () => {
    test("G0-02.3.1: Review schema is Class-level (has classId, enrollmentId, NO sessionId)", () => {
      const reviewPaths = Object.keys(models.Review.schema.paths);
      expect(reviewPaths).toContain("enrollmentId");
      expect(reviewPaths).toContain("classId");
      expect(reviewPaths).toContain("teacherId");
      expect(reviewPaths).toContain("studentId");
      expect(reviewPaths).toContain("rating");
      expect(reviewPaths).toContain("comment");

      // Must NOT have sessionId
      expect(reviewPaths).not.toContain("sessionId");
    });

    test("G0-02.3.2: Review has unique index on enrollmentId (1 review per enrollment)", async () => {
      const studentId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();
      const classId = new mongoose.Types.ObjectId();
      const enrollmentId = new mongoose.Types.ObjectId();

      await models.Review.create({
        enrollmentId,
        studentId,
        teacherId,
        classId,
        rating: 5,
        comment: "Lớp học rất tốt!",
      });

      // Attempt duplicate review for the same enrollment
      await expect(
        models.Review.create({
          enrollmentId,
          studentId,
          teacherId,
          classId,
          rating: 4,
          comment: "Thử review lần 2",
        })
      ).rejects.toThrow(/E11000.*duplicate key/);
    });

    test("G0-02.3.3: reviewService.createReview enforces Session completed prerequisite (Gatekeeper check)", async () => {
      const teacher = await models.User.create({
        email: "teacher_rev@test.com",
        passwordHash: "hash",
        role: "TEACHER",
        teacherProfile: { fullName: "Teacher Review" },
      });
      const student = await models.User.create({
        email: "student_rev@test.com",
        passwordHash: "hash",
        role: "STUDENT",
        studentProfile: { fullName: "Student Review" },
      });
      const category = await models.Category.create({ name: "C1", slug: "c1", createdBy: teacher._id });
      const subject = await models.Subject.create({ name: "S1", slug: "s1", categoryId: category._id, categoryName: "C1", createdBy: teacher._id });
      const course = await models.Course.create({
        title: "Course 1",
        slug: "course-1",
        categoryId: category._id,
        categoryName: "C1",
        subjectId: subject._id,
        subjectName: "S1",
        level: "BEGINNER",
        createdBy: teacher._id,
      });

      const cls = await models.Class.create({
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: "Teacher Review",
        categoryId: category._id,
        subjectId: subject._id,
        className: "Class Test Review",
        classType: "PAID",
        price: mongoose.Types.Decimal128.fromString("500000"),
        capacity: 10,
        status: "OPEN", // not IN_PROGRESS or COMPLETED
      });

      const enrollment = await models.Enrollment.create({
        classId: cls._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "CONFIRMED", // active but class has not started
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: cls.price,
      });

      // Create a SCHEDULED session (not COMPLETED)
      await models.Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Buổi 1",
        startDatetime: new Date(Date.now() + 86400000),
        endDatetime: new Date(Date.now() + 90000000),
        status: "SCHEDULED",
      });

      // Attempting to review should be blocked (REVIEW_NOT_ALLOWED)
      await expect(createReview(student._id, cls._id, { rating: 5, comment: "Chưa học đã review" })).rejects.toMatchObject({
        code: "REVIEW_NOT_ALLOWED",
      });

      // Now complete the session
      await models.Session.updateOne({ classId: cls._id }, { $set: { status: "COMPLETED" } });

      // Review should now succeed
      const res = await createReview(student._id, cls._id, { rating: 5, comment: "Đã học và hài lòng" });
      expect(res.rating).toBe(5);
    });

    test("G0-02.3.4: SessionRefundReview is an Admin incident refund review, NOT a student review", () => {
      const paths = Object.keys(models.SessionRefundReview.schema.paths);
      expect(paths).toContain("sessionId");
      expect(paths).toContain("enrollmentId");
      expect(paths).toContain("triggerReason");
      expect(paths).toContain("status");
      expect(paths).toContain("earningReconciliationStatus");
      expect(paths).not.toContain("rating"); // No star rating
    });
  });

  describe("4. Soft-delete Archetype vs Hard-Lifecycle Entities", () => {
    test("G0-02.4.1: Soft-deletable models contain isDeleted, deletedAt, deletedBy and index", () => {
      for (const name of SOFT_DELETED_MODELS) {
        const schema = models[name].schema;
        expect(schema.paths.isDeleted).toBeDefined();
        expect(schema.paths.deletedAt).toBeDefined();
        expect(schema.paths.deletedBy).toBeDefined();

        const indexes = schema.indexes();
        const hasIsDeletedIndex = indexes.some(([spec]) => spec.isDeleted === 1);
        expect(hasIsDeletedIndex).toBe(true);
      }
    });

    test("G0-02.4.2: Financial and Session lifecycle models do NOT use softDeletePlugin", () => {
      for (const name of NON_SOFT_DELETED_FINANCIAL_OR_LIFECYCLE_MODELS) {
        const schema = models[name].schema;
        expect(schema.paths.isDeleted).toBeUndefined();
        expect(schema.paths.deletedAt).toBeUndefined();
      }
    });
  });

  describe("5. Core Unique and Partial Filter Indexes on MongoDB", () => {
    test("G0-02.5.1: Enrollment partial unique index enforces single active enrollment per student/class", async () => {
      const studentId = new mongoose.Types.ObjectId();
      const classId = new mongoose.Types.ObjectId();
      const courseId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      await models.Enrollment.create({
        studentId,
        classId,
        courseId,
        teacherId,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
      });

      // Second CONFIRMED enrollment must be rejected by partial unique index
      await expect(
        models.Enrollment.create({
          studentId,
          classId,
          courseId,
          teacherId,
          enrollmentStatus: "PENDING_PAYMENT",
          paymentSource: "FREE",
        })
      ).rejects.toThrow(/E11000.*duplicate key/);

      // But if the previous enrollment is CANCELLED/EXPIRED, a new enrollment is permitted
      await models.Enrollment.updateOne({ studentId, classId }, { $set: { enrollmentStatus: "CANCELLED" } });

      const newEnrollment = await models.Enrollment.create({
        studentId,
        classId,
        courseId,
        teacherId,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "FREE",
      });
      expect(newEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");
    });

    test("G0-02.5.2: Payment.gatewayReference enforces uniqueness for gateway idempotency", async () => {
      const enrollmentId = new mongoose.Types.ObjectId();
      const payerUserId = new mongoose.Types.ObjectId();

      await models.Payment.create({
        enrollmentId,
        payerUserId,
        gateway: "VNPAY",
        gatewayReference: "TXN-UNIQUE-101",
        amount: mongoose.Types.Decimal128.fromString("100000"),
        paymentStatus: "PENDING",
      });

      await expect(
        models.Payment.create({
          enrollmentId,
          payerUserId,
          gateway: "VNPAY",
          gatewayReference: "TXN-UNIQUE-101", // duplicate
          amount: mongoose.Types.Decimal128.fromString("100000"),
          paymentStatus: "PENDING",
        })
      ).rejects.toThrow(/E11000.*duplicate key/);
    });

    test("G0-02.5.3: SessionAttendance enforces unique attendance per session per student", async () => {
      const sessionId = new mongoose.Types.ObjectId();
      const classId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await models.SessionAttendance.create({
        sessionId,
        classId,
        studentId,
        attendanceStatus: "PRESENT",
      });

      await expect(
        models.SessionAttendance.create({
          sessionId,
          classId,
          studentId,
          attendanceStatus: "LATE",
        })
      ).rejects.toThrow(/E11000.*duplicate key/);
    });
  });

  describe("6. Class Price Business Rule Validation Hook", () => {
    test("G0-02.6.1: Class price hook enforces FREE price = 0 and PAID price > 0", async () => {
      const courseId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();
      const categoryId = new mongoose.Types.ObjectId();
      const subjectId = new mongoose.Types.ObjectId();

      // Case 1: FREE class with price > 0 -> throws error on validate()
      const invalidFree = new models.Class({
        courseId,
        courseTitle: "C",
        teacherId,
        teacherName: "T",
        categoryId,
        subjectId,
        className: "Free with price",
        classType: "FREE",
        price: mongoose.Types.Decimal128.fromString("50000"),
        capacity: 10,
      });
      await expect(invalidFree.validate()).rejects.toThrow("FREE class must have price = 0");

      // Case 2: PAID class with price = 0 -> throws error on validate()
      const invalidPaid = new models.Class({
        courseId,
        courseTitle: "C",
        teacherId,
        teacherName: "T",
        categoryId,
        subjectId,
        className: "Paid with zero",
        classType: "PAID",
        price: mongoose.Types.Decimal128.fromString("0"),
        capacity: 10,
      });
      await expect(invalidPaid.validate()).rejects.toThrow("PAID class must have price > 0");

      // Case 3: Valid PAID class -> resolves
      const validPaid = new models.Class({
        courseId,
        courseTitle: "C",
        teacherId,
        teacherName: "T",
        categoryId,
        subjectId,
        className: "Valid Paid",
        classType: "PAID",
        price: mongoose.Types.Decimal128.fromString("150000"),
        capacity: 10,
      });
      await expect(validPaid.validate()).resolves.toBeUndefined();
    });
  });
});
