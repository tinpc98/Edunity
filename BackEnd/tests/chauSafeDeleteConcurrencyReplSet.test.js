const mongoose = require("mongoose");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  SyllabusVersion,
  CurriculumUnit,
  AuditLog,
  TeacherSubjectAuthorization,
  SessionRefundReview,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");
const { deleteCourse } = require("../src/services/courseCatalogService");
const { createClass } = require("../src/services/teacherClassService");
const { createEnrollment } = require("../src/services/enrollmentService");

describe("TASK CHAU-P0-SAFE-DELETE-VERIFY: Real MongoMemoryReplSet Concurrency & Transaction Integrity Suite", () => {
  let admin, teacher, student, category, subject, course;

  const okGateOptions = {
    pricingPolicyVerifier: async () => ({ valid: true, policyVersion: 1 }),
    contractVerifier: async () => ({ status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) }),
  };

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
      email: "admin-safedel@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    });

    teacher = await User.create({
      email: "teacher-safedel@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Cô Châu Giáo Viên",
        verificationStatus: "VERIFIED",
      },
    });

    student = await User.create({
      email: "student-safedel@edunity.test",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    category = await Category.create({
      name: "Khoa Học Tự Nhiên",
      slug: "khoa-hoc-tu-nhien",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    subject = await Subject.create({
      name: "Vật Lý",
      slug: "vat-ly",
      categoryId: category._id,
      categoryName: category.name,
      status: "ACTIVE",
      createdBy: admin._id,
    });

    // Authorize teacher for subject
    await TeacherSubjectAuthorization.create({
      teacherId: teacher._id,
      subjectId: subject._id,
      categoryId: category._id,
      gradeLevel: "GRADE_12",
      level: "ADVANCED",
      status: "APPROVED",
      createdBy: admin._id,
      reviewedBy: admin._id,
      reviewedAt: new Date(),
    });

    course = await Course.create({
      title: "Vật Lý 12 Nâng Cao",
      slug: "vat-ly-12-nang-cao",
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // MANDATORY TEST 1: MongoDB session không khả dụng → DELETE bị từ chối (503)
  // =========================================================================
  test("1. Session Unavailable Fail-Closed: DELETE rejected with 503, course data unchanged", async () => {
    jest.spyOn(mongoose, "startSession").mockRejectedValueOnce(
      new Error("MongoServerError: Transaction numbers are only allowed on a replica set member or mongos")
    );

    await expect(deleteCourse(admin._id.toString(), course._id.toString())).rejects.toMatchObject({
      statusCode: 503,
      code: "DATABASE_TRANSACTION_UNAVAILABLE",
    });

    // Verify database state is untouched
    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");
    expect(freshCourse.deletedAt).toBeNull();
  });

  test("1b. deleteCourse Fail-Closed: Transaction unavailable returns 503 and closes session", async () => {
    const endSessionMock = jest.fn();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce({
      withTransaction: null,
      endSession: endSessionMock,
    });

    await expect(deleteCourse(admin._id.toString(), course._id.toString())).rejects.toMatchObject({
      statusCode: 503,
      code: "DATABASE_TRANSACTION_UNAVAILABLE",
    });

    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");
    expect(endSessionMock).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // MANDATORY TEST 2: Lỗi giữa transaction → Rollback toàn bộ
  // =========================================================================
  test("2. Mid-Transaction Failure: Full multi-document rollback on error", async () => {
    // Create linked syllabus version and curriculum unit
    const version = await SyllabusVersion.create({
      courseId: course._id,
      versionNumber: 1,
      title: "Syllabus V1",
      status: "DRAFT",
      createdBy: admin._id,
    });

    const unit = await CurriculumUnit.create({
      courseId: course._id,
      syllabusVersionId: version._id,
      unitOrder: 1,
      title: "Chương 1: Dao Động Cơ",
      durationMinutes: 90,
      createdBy: admin._id,
    });

    // Simulate failure during CurriculumUnit soft-deletion
    jest.spyOn(CurriculumUnit, "updateMany").mockImplementationOnce(() => {
      throw new Error("Simulated Disk Full Failure during CurriculumUnit updateMany");
    });

    await expect(deleteCourse(admin._id.toString(), course._id.toString())).rejects.toThrow(
      "Simulated Disk Full Failure during CurriculumUnit updateMany"
    );

    // Verify Course is NOT deleted (rolled back)
    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");

    // Verify SyllabusVersion is NOT deleted (rolled back)
    const freshVersion = await SyllabusVersion.findById(version._id).lean();
    expect(freshVersion.isDeleted).toBe(false);

    // Verify CurriculumUnit is NOT deleted (rolled back)
    const freshUnit = await CurriculumUnit.findById(unit._id).lean();
    expect(freshUnit.isDeleted).toBe(false);

    // Verify NO audit log was written
    const auditCount = await AuditLog.countDocuments({ targetId: course._id });
    expect(auditCount).toBe(0);
  });

  // =========================================================================
  // MANDATORY TEST 3: Lỗi AuditLog → Không nuốt lỗi, rollback toàn bộ
  // =========================================================================
  test("3. AuditLog Integrity: Audit failure propagates and rolls back course soft-delete", async () => {
    jest.spyOn(AuditLog, "create").mockImplementationOnce(() => {
      throw new Error("Fatal: AuditLog collection is write-locked or unreachable");
    });

    await expect(deleteCourse(admin._id.toString(), course._id.toString())).rejects.toThrow(
      "Fatal: AuditLog collection is write-locked or unreachable"
    );

    // Verify Course deletion was rolled back
    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");
    expect(freshCourse.deletedAt).toBeNull();
  });

  // =========================================================================
  // MANDATORY TEST 4: DELETE Course và CREATE Class chạy đồng thời (với Barrier)
  // =========================================================================
  test("4. Deterministic Concurrency Barrier: DELETE Course and CREATE Class cannot race to produce orphan class", async () => {
    let enterDeleteResolve;
    const enterDeletePromise = new Promise((resolve) => {
      enterDeleteResolve = resolve;
    });

    let continueDeleteResolve;
    const continueDeletePromise = new Promise((resolve) => {
      continueDeleteResolve = resolve;
    });

    // Hook into Course.findOneAndUpdate inside deleteCourse right after acquiring the document lock
    const origFindOneAndUpdate = Course.findOneAndUpdate.bind(Course);
    let lockHookTriggered = false;

    jest.spyOn(Course, "findOneAndUpdate").mockImplementation(function (...args) {
      const queryPromise = origFindOneAndUpdate(...args);
      // Check if this is the lock acquisition query
      if (!lockHookTriggered && args[1] && args[1].$inc && args[1].$inc.lockVersion) {
        lockHookTriggered = true;
        return queryPromise.then(async (doc) => {
          // Signal that deleteCourse has acquired lock
          enterDeleteResolve();
          // Wait for createClass to arrive and attempt to acquire lock on the same course
          await continueDeletePromise;
          return doc;
        });
      }
      return queryPromise;
    });

    // 1. Initiate deleteCourse in background
    const deletePromise = deleteCourse(admin._id.toString(), course._id.toString());

    // 2. Wait until deleteCourse has acquired the lock on Course
    await enterDeletePromise;

    // 3. Concurrently initiate createClass on the exact same course
    const createClassPromise = createClass(
      teacher._id.toString(),
      {
        courseId: course._id.toString(),
        className: "Lớp Vật Lý K1 - Concurrency Test",
        classType: "FREE",
        capacity: 15,
      },
      okGateOptions
    );

    // 4. Release deleteCourse to proceed
    continueDeleteResolve();

    // 5. Wait for both operations to settle
    const [deleteResult, createResult] = await Promise.allSettled([
      deletePromise,
      createClassPromise,
    ]);

    // Assertions:
    // Either delete succeeded and createClass failed, OR createClass succeeded and delete failed.
    // In our test flow, deleteCourse held the lock, soft-deleted the course, and committed.
    // createClass then woke up, found course is not ACTIVE, and was rejected!
    expect(deleteResult.status).toBe("fulfilled");
    expect(deleteResult.value.success).toBe(true);

    expect(createResult.status).toBe("rejected");
    expect(createResult.reason.statusCode).toBe(404);
    expect(createResult.reason.message).toContain("Course not found");

    // In MongoDB: ZERO classes exist for this course
    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(0);

    // In MongoDB: Course is soft-deleted
    const updatedCourse = await Course.findById(course._id).lean();
    expect(updatedCourse.isDeleted).toBe(true);
    expect(updatedCourse.status).toBe("INACTIVE");
  });

  // =========================================================================
  // MANDATORY TEST 5: DELETE Course và CREATE Enrollment chạy đồng thời
  // =========================================================================
  test("5. Concurrency Barrier: DELETE Course and CREATE Enrollment cannot orphan enrollment", async () => {
    // Setup an OPEN class for this course
    const openClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Châu",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Lý 12 - Tuyển Sinh",
      classType: "FREE",
      price: 0,
      capacity: 20,
      enrolledCount: 0,
      status: "OPEN",
    });

    // Concurrently attempt to delete course while student enrolls in open class
    const [deleteResult, enrollResult] = await Promise.allSettled([
      deleteCourse(admin._id.toString(), course._id.toString()),
      createEnrollment(student._id.toString(), openClass._id.toString()),
    ]);

    // deleteCourse MUST reject because class exists!
    expect(deleteResult.status).toBe("rejected");
    expect(deleteResult.reason.statusCode).toBe(409);
    expect(deleteResult.reason.code).toBe("COURSE_HAS_CLASSES");

    // createEnrollment MUST succeed
    expect(enrollResult.status).toBe("fulfilled");
    expect(enrollResult.value.enrollmentStatus).toBe("CONFIRMED");

    // Course MUST NOT be deleted
    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");

    // Enrollment in DB exists
    const enrollment = await Enrollment.findOne({ classId: openClass._id, studentId: student._id }).lean();
    expect(enrollment).not.toBeNull();
    expect(enrollment.courseId.toString()).toBe(course._id.toString());
  });

  // =========================================================================
  // MANDATORY TEST 6: Nhiều request DELETE cùng Course đồng thời
  // =========================================================================
  test("6. Multiple Concurrent DELETEs: Exactly one succeeds, others 404, exactly 1 audit entry", async () => {
    // 3 admins concurrently attempting to delete the same course
    const results = await Promise.allSettled([
      deleteCourse(admin._id.toString(), course._id.toString()),
      deleteCourse(admin._id.toString(), course._id.toString()),
      deleteCourse(admin._id.toString(), course._id.toString()),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.success).toBe(true);

    // The other 2 must be rejected with 404 (course already deleted)
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect(r.reason.statusCode).toBe(404);
      expect(r.reason.message).toContain("Course not found");
    }

    // Exactly one AuditLog record created
    const auditLogs = await AuditLog.find({ targetId: course._id, action: "COURSE_SOFT_DELETED" }).lean();
    expect(auditLogs).toHaveLength(1);
  });

  // =========================================================================
  // MANDATORY TEST 7: Retry sau transaction conflict
  // =========================================================================
  test("7. Transaction Conflict Handling: session.withTransaction retries transient errors cleanly", async () => {
    let attempt = 0;
    const origFindOneAndUpdate = Course.findOneAndUpdate.bind(Course);

    jest.spyOn(Course, "findOneAndUpdate").mockImplementation(function (...args) {
      if (args[1] && args[1].$inc && args[1].$inc.lockVersion) {
        attempt++;
        if (attempt === 1) {
          const transientErr = new mongoose.mongo.MongoServerError({
            message: "WriteConflict error: this operation conflicted with another concurrent operation",
            errorLabels: ["TransientTransactionError"],
          });
          throw transientErr;
        }
      }
      return origFindOneAndUpdate(...args);
    });

    const result = await deleteCourse(admin._id.toString(), course._id.toString());
    expect(result.success).toBe(true);
    expect(attempt).toBeGreaterThanOrEqual(2); // Retried after TransientTransactionError

    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(true);
    expect(freshCourse.status).toBe("INACTIVE");
  });

  // =========================================================================
  // MANDATORY TEST 8: Không có Class/Enrollment mới tham chiếu Course đã xóa
  // =========================================================================
  test("8. Invariant: Deleted course rejects new Class creation and new Enrollment creation", async () => {
    // 1. Soft delete the course
    await deleteCourse(admin._id.toString(), course._id.toString());

    // 2. Attempt createClass on deleted course -> MUST reject with 404
    await expect(
      createClass(
        teacher._id.toString(),
        {
          courseId: course._id.toString(),
          className: "Class on Deleted Course",
          classType: "FREE",
          capacity: 10,
        },
        okGateOptions
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "COURSE_NOT_FOUND",
    });

    // 3. Artificially create a class referencing deleted course to simulate legacy/corrupted record
    const orphanClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Châu",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Corrupted Class",
      classType: "FREE",
      price: 0,
      capacity: 10,
      enrolledCount: 0,
      status: "OPEN",
    });

    // 4. Attempt createEnrollment on this class -> MUST reject with 400 COURSE_NOT_ACTIVE
    await expect(
      createEnrollment(student._id.toString(), orphanClass._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "COURSE_NOT_ACTIVE",
    });

    // In DB: 0 valid enrollments created
    const count = await Enrollment.countDocuments({ classId: orphanClass._id });
    expect(count).toBe(0);
  });

  // =========================================================================
  // MANDATORY TEST 9: createClass Session unavailable -> 503, zero Class created
  // =========================================================================
  test("9. createClass Fail-Closed: Session unavailable returns 503, zero Class created", async () => {
    jest.spyOn(mongoose, "startSession").mockRejectedValueOnce(
      new Error("MongoNetworkError: failed to connect to replica set")
    );

    await expect(
      createClass(
        teacher._id.toString(),
        {
          courseId: course._id.toString(),
          className: "Class Session Fail",
          classType: "FREE",
          capacity: 10,
        },
        okGateOptions
      )
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "DATABASE_TRANSACTION_UNAVAILABLE",
    });

    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(0);
  });

  // =========================================================================
  // MANDATORY TEST 10: createClass Transaction unavailable -> 503, zero Class created
  // =========================================================================
  test("10. createClass Fail-Closed: Transaction unavailable returns 503, zero Class created and closes session", async () => {
    const endSessionMock = jest.fn();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce({
      withTransaction: null,
      endSession: endSessionMock,
    });

    await expect(
      createClass(
        teacher._id.toString(),
        {
          courseId: course._id.toString(),
          className: "Class Transaction Fail",
          classType: "FREE",
          capacity: 10,
        },
        okGateOptions
      )
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "DATABASE_TRANSACTION_UNAVAILABLE",
    });

    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(0);
    expect(endSessionMock).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // MANDATORY TEST 11: createClass Mid-Transaction Failure -> rollback
  // =========================================================================
  test("11. createClass Mid-Transaction Failure: Class.save() error rolls back transaction", async () => {
    jest.spyOn(Class.prototype, "save").mockImplementationOnce(() => {
      throw new Error("Simulated Disk Full Failure during Class.save()");
    });

    await expect(
      createClass(
        teacher._id.toString(),
        {
          courseId: course._id.toString(),
          className: "Class Rollback Test",
          classType: "FREE",
          capacity: 10,
        },
        okGateOptions
      )
    ).rejects.toThrow("Simulated Disk Full Failure during Class.save()");

    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(0);
  });

  // =========================================================================
  // MANDATORY TEST 12: CREATE Class bắt đầu trước DELETE Course (Barrier)
  // =========================================================================
  test("12. Concurrency Barrier: CREATE Class begins BEFORE DELETE Course -> Class is created, DELETE rejected with 409", async () => {
    let enterCreateResolve;
    const enterCreatePromise = new Promise((resolve) => {
      enterCreateResolve = resolve;
    });

    let continueCreateResolve;
    const continueCreatePromise = new Promise((resolve) => {
      continueCreateResolve = resolve;
    });

    const origFindOneAndUpdate = Course.findOneAndUpdate.bind(Course);
    let lockHookTriggered = false;

    jest.spyOn(Course, "findOneAndUpdate").mockImplementation(function (...args) {
      const queryPromise = origFindOneAndUpdate(...args);
      if (!lockHookTriggered && args[1] && args[1].$inc && args[1].$inc.lockVersion) {
        lockHookTriggered = true;
        return queryPromise.then(async (doc) => {
          enterCreateResolve();
          await continueCreatePromise;
          return doc;
        });
      }
      return queryPromise;
    });

    // 1. Initiate createClass
    const createClassPromise = createClass(
      teacher._id.toString(),
      {
        courseId: course._id.toString(),
        className: "Lớp Tạo Trước Xóa",
        classType: "FREE",
        capacity: 20,
      },
      okGateOptions
    );

    // 2. Wait until createClass has acquired the lock on Course
    await enterCreatePromise;

    // 3. Initiate deleteCourse on the exact same course
    const deletePromise = deleteCourse(admin._id.toString(), course._id.toString());

    // 4. Release createClass
    continueCreateResolve();

    // 5. Wait for both operations
    const [createResult, deleteResult] = await Promise.allSettled([
      createClassPromise,
      deletePromise,
    ]);

    expect(createResult.status).toBe("fulfilled");
    expect(createResult.value.className).toBe("Lớp Tạo Trước Xóa");

    expect(deleteResult.status).toBe("rejected");
    expect(deleteResult.reason.statusCode).toBe(409);
    expect(deleteResult.reason.code).toBe("COURSE_HAS_CLASSES");

    const freshCourse = await Course.findById(course._id).lean();
    expect(freshCourse.isDeleted).toBe(false);
    expect(freshCourse.status).toBe("ACTIVE");

    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(1);
  });

  // =========================================================================
  // MANDATORY TEST 13: createClass Retry sau transaction conflict
  // =========================================================================
  test("13. createClass Conflict Handling: session.withTransaction retries transient errors cleanly", async () => {
    let attempt = 0;
    const origFindOneAndUpdate = Course.findOneAndUpdate.bind(Course);

    jest.spyOn(Course, "findOneAndUpdate").mockImplementation(function (...args) {
      if (args[1] && args[1].$inc && args[1].$inc.lockVersion) {
        attempt++;
        if (attempt === 1) {
          const transientErr = new mongoose.mongo.MongoServerError({
            message: "WriteConflict error: this operation conflicted with another concurrent operation",
            errorLabels: ["TransientTransactionError"],
          });
          throw transientErr;
        }
      }
      return origFindOneAndUpdate(...args);
    });

    const created = await createClass(
      teacher._id.toString(),
      {
        courseId: course._id.toString(),
        className: "Class Transient Retry",
        classType: "FREE",
        capacity: 10,
      },
      okGateOptions
    );

    expect(created.className).toBe("Class Transient Retry");
    expect(attempt).toBeGreaterThanOrEqual(2); // Retried after TransientTransactionError

    const classCount = await Class.countDocuments({ courseId: course._id });
    expect(classCount).toBe(1);
  });
});
