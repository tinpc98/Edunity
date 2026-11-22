const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  AuditLog,
  Notification,
  TeacherSubjectAuthorization,
  CoursePricingPolicy,
  TeacherContract,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TASK BE-01: Class NEED_CHANGES Workflow Integration Suite", () => {
  let admin, teacher, otherTeacher, student;
  let category, subject, course, pricingPolicy, authDoc;

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
      email: "admin-be01@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    });

    teacher = await User.create({
      email: "teacher-be01@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Thầy Hưng BE-01",
        verificationStatus: "VERIFIED",
      },
    });

    otherTeacher = await User.create({
      email: "other-teacher-be01@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Thầy Nam",
        verificationStatus: "VERIFIED",
      },
    });

    student = await User.create({
      email: "student-be01@edunity.test",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    category = await Category.create({
      name: "Khoa Học Tự Nhiên",
      slug: "khoa-hoc-tu-nhien-be01",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    subject = await Subject.create({
      name: "Toán Học",
      slug: "toan-hoc-be01",
      categoryId: category._id,
      categoryName: category.name,
      status: "ACTIVE",
      createdBy: admin._id,
    });

    course = await Course.create({
      title: "Toán 12 Cơ Bản",
      slug: "toan-12-co-ban-be01",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_12",
      level: "ADVANCED",
      status: "ACTIVE",
      createdBy: admin._id,
    });

    authDoc = await TeacherSubjectAuthorization.create({
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

    // Create pricing policy allowing free & paid classes
    pricingPolicy = await CoursePricingPolicy.create({
      name: "Chính Sách Giá Toàn Cầu BE01",
      scopeType: "GLOBAL",
      policyKey: "GLOBAL_DEFAULT_V1",
      version: 1,
      classType: "FREE",
      allowFree: true,
      minPrice: 0,
      maxPrice: 0,
      minSessions: 1,
      maxSessions: 50,
      effectiveFrom: new Date(Date.now() - 86400000),
      status: "ACTIVE",
      createdBy: admin._id,
    });

    // Teacher contract active
    await TeacherContract.create({
      contractCode: "HD-BE01-001",
      teacherId: teacher._id,
      status: "ACTIVE",
      effectiveFrom: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 365 * 86400000),
      provider: { name: "SANDBOX", envelopeId: "SBX-BE01-001" },
      createdBy: admin._id,
      sentAt: new Date(),
      signedAt: new Date(),
    });
  });

  const createHelperClass = async (status = "PENDING_APPROVAL") => {
    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Thầy Hưng BE-01",
      categoryId: category._id,
      subjectId: subject._id,
      gradeLevel: "GRADE_12",
      level: "ADVANCED",
      className: "Lớp Ôn Thi Tốt Nghiệp Toán",
      description: "Mô tả ban đầu của lớp học",
      classType: "FREE",
      price: 0,
      capacity: 20,
      enrolledCount: 0,
      status,
      startDate: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 30 * 86400000),
      enrollmentStart: new Date(Date.now() - 86400000),
      enrollmentEnd: new Date(Date.now() + 86400000),
      schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "10:00" }],
    });

    await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      teacherName: "Thầy Hưng BE-01",
      title: "Buổi 1: Giới thiệu và Khảo sát Hàm số",
      sessionNumber: 1,
      startDatetime: new Date(Date.now() + 2 * 86400000),
      endDatetime: new Date(Date.now() + 2 * 86400000 + 7200000),
      status: "SCHEDULED",
    });

    return cls;
  };

  // =========================================================================
  // TEST 1: Admin yêu cầu chỉnh sửa thành công
  // =========================================================================
  test("1. Admin requests changes successfully: transitions PENDING_APPROVAL -> NEED_CHANGES", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    const res = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Vui lòng bổ sung mục tiêu học tập chi tiết hơn vào mô tả lớp." });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("NEED_CHANGES");
    expect(res.body.data.reviewNote).toBe("Vui lòng bổ sung mục tiêu học tập chi tiết hơn vào mô tả lớp.");
    expect(res.body.data.reviewedBy.toString()).toBe(admin._id.toString());
    expect(res.body.data.updatedBy.toString()).toBe(admin._id.toString());
    expect(res.body.data.reviewedAt).toBeDefined();

    // Verify in database
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("NEED_CHANGES");
    expect(fresh.reviewNote).toBe("Vui lòng bổ sung mục tiêu học tập chi tiết hơn vào mô tả lớp.");
  });

  // =========================================================================
  // TEST 2: Thiếu reviewNote bị từ chối với 400 VALIDATION_ERROR
  // =========================================================================
  test("2. Rejects request-changes when reviewNote is missing or empty after trim", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    // Case 2a: Missing reviewNote field
    const resNoField = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({});
    expect(resNoField.statusCode).toBe(400);
    expect(resNoField.body.error).toBe("VALIDATION_ERROR");

    // Case 2b: Empty string reviewNote
    const resEmpty = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "" });
    expect(resEmpty.statusCode).toBe(400);
    expect(resEmpty.body.error).toBe("VALIDATION_ERROR");

    // Case 2c: Whitespace-only reviewNote
    const resWhitespace = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "   \t \n  " });
    expect(resWhitespace.statusCode).toBe(400);
    expect(resWhitespace.body.error).toBe("VALIDATION_ERROR");

    // Verify class remained PENDING_APPROVAL
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("PENDING_APPROVAL");
  });

  // =========================================================================
  // TEST 3: Không thể yêu cầu chỉnh sửa lớp sai trạng thái
  // =========================================================================
  test("3. Cannot request changes on classes not in PENDING_APPROVAL status (409 Conflict)", async () => {
    const invalidStatuses = ["DRAFT", "OPEN", "NEED_CHANGES", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

    for (const status of invalidStatuses) {
      const cls = await createHelperClass(status);

      const res = await request(app)
        .post(`/api/admin/classes/${cls._id}/request-changes`)
        .set(as(admin))
        .send({ reviewNote: "Ghi chú hợp lệ" });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("CLASS_NOT_PENDING_APPROVAL");

      const fresh = await Class.findById(cls._id).lean();
      expect(fresh.status).toBe(status); // Status unchanged
    }

    // Non-existent class ID -> 404
    const fakeId = new mongoose.Types.ObjectId();
    const res404 = await request(app)
      .post(`/api/admin/classes/${fakeId}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Ghi chú hợp lệ" });
    expect(res404.statusCode).toBe(404);
    expect(res404.body.error).toBe("CLASS_NOT_FOUND");
  });

  // =========================================================================
  // TEST 4: Teacher sửa lớp NEED_CHANGES thành công
  // =========================================================================
  test("4. Teacher can edit class in NEED_CHANGES status", async () => {
    const cls = await createHelperClass("NEED_CHANGES");

    const patchRes = await request(app)
      .patch(`/api/teacher/classes/${cls._id}`)
      .set(as(teacher))
      .send({
        description: "Mô tả đã được cập nhật mục tiêu học tập theo yêu cầu của Admin.",
        capacity: 25,
      });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.description).toBe("Mô tả đã được cập nhật mục tiêu học tập theo yêu cầu của Admin.");
    expect(patchRes.body.data.capacity).toBe(25);
    expect(patchRes.body.data.status).toBe("NEED_CHANGES");

    // Verify in database
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.description).toBe("Mô tả đã được cập nhật mục tiêu học tập theo yêu cầu của Admin.");
    expect(fresh.capacity).toBe(25);
    expect(fresh.status).toBe("NEED_CHANGES");
  });

  // =========================================================================
  // TEST 5: Teacher gửi duyệt lại (submit) lớp NEED_CHANGES thành công
  // =========================================================================
  test("5. Teacher can re-submit class in NEED_CHANGES status -> PENDING_APPROVAL", async () => {
    const cls = await createHelperClass("NEED_CHANGES");

    const submitRes = await request(app)
      .post(`/api/teacher/classes/${cls._id}/submit`)
      .set(as(teacher));

    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.status).toBe("PENDING_APPROVAL");

    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("PENDING_APPROVAL");

    // Admin can now approve the re-submitted class
    const approveRes = await request(app)
      .post(`/api/admin/classes/${cls._id}/approve`)
      .set(as(admin))
      .send({ reviewNote: "Lớp học đã đạt chuẩn mở tuyển sinh." });

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.body.data.status).toBe("OPEN");
  });

  // =========================================================================
  // TEST 6: Teacher KHÔNG ĐƯỢC sửa hoặc gửi duyệt lại lớp REJECTED
  // =========================================================================
  test("6. Teacher CANNOT edit or re-submit a REJECTED class (terminal rejected state)", async () => {
    const cls = await createHelperClass("REJECTED");

    // 6a: Edit attempt must be rejected with 409 CLASS_NOT_EDITABLE
    const editRes = await request(app)
      .patch(`/api/teacher/classes/${cls._id}`)
      .set(as(teacher))
      .send({ description: "Cố tình sửa lớp đã bị reject" });

    expect(editRes.statusCode).toBe(409);
    expect(editRes.body.error).toBe("CLASS_NOT_EDITABLE");

    // 6b: Submit attempt must be rejected with 409 CLASS_NOT_SUBMITTABLE
    const submitRes = await request(app)
      .post(`/api/teacher/classes/${cls._id}/submit`)
      .set(as(teacher));

    expect(submitRes.statusCode).toBe(409);
    expect(submitRes.body.error).toBe("CLASS_NOT_SUBMITTABLE");

    // Verify in database that class remains REJECTED
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("REJECTED");
    expect(fresh.description).toBe("Mô tả ban đầu của lớp học");
  });

  // =========================================================================
  // TEST 7: AuditLog và Notification hoạt động đúng
  // =========================================================================
  test("7. Audit log and Notification are correctly recorded upon requesting changes", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");
    const reviewNote = "Syllabus và tài liệu đính kèm chưa đạt chuẩn.";

    await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote });

    // Verify AuditLog
    const auditEntry = await AuditLog.findOne({
      targetType: "Class",
      targetId: cls._id,
      action: "CLASS_CHANGES_REQUESTED",
    }).lean();

    expect(auditEntry).not.toBeNull();
    expect(auditEntry.actorAdminId.toString()).toBe(admin._id.toString());
    expect(auditEntry.beforeState).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(auditEntry.afterState).toMatchObject({
      status: "NEED_CHANGES",
      reviewNote,
    });

    // Verify Notification sent to teacher
    const notif = await Notification.findOne({
      userId: teacher._id,
      type: "CLASS_CHANGES_REQUESTED",
    }).lean();

    expect(notif).not.toBeNull();
    expect(notif.title).toBe("Lớp học cần chỉnh sửa");
    expect(notif.content).toBe(reviewNote);
  });

  // =========================================================================
  // TEST 8: Concurrency / Idempotency khi nhiều request gửi đồng thời
  // =========================================================================
  test("8. Concurrent duplicate request-changes requests do not cause invalid state transitions", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/admin/classes/${cls._id}/request-changes`)
        .set(as(admin))
        .send({ reviewNote: "Ghi chú 1" }),
      request(app)
        .post(`/api/admin/classes/${cls._id}/request-changes`)
        .set(as(admin))
        .send({ reviewNote: "Ghi chú 2" }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode];
    // Exactly one must succeed (200), the other must receive 409
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const successfulRes = res1.statusCode === 200 ? res1 : res2;
    expect(successfulRes.body.data.status).toBe("NEED_CHANGES");

    // Verify single audit log entry was created
    const auditLogs = await AuditLog.find({
      targetType: "Class",
      targetId: cls._id,
      action: "CLASS_CHANGES_REQUESTED",
    }).lean();
    expect(auditLogs).toHaveLength(1);
  });

  // =========================================================================
  // TEST 9: RBAC Gate - Non-admins cannot call request-changes
  // =========================================================================
  test("9. Enforces RBAC: Teacher, Student, and unauthenticated requests are blocked", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    // 9a: Student -> 403
    const stuRes = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(student))
      .send({ reviewNote: "Học sinh thử yêu cầu sửa" });
    expect(stuRes.statusCode).toBe(403);

    // 9b: Teacher -> 403
    const teaRes = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(teacher))
      .send({ reviewNote: "Giáo viên thử yêu cầu sửa" });
    expect(teaRes.statusCode).toBe(403);

    // 9c: Invalid Bearer token -> 401 UNAUTHORIZED
    const unauthRes = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set({ authorization: "Bearer invalid.jwt.token" })
      .send({ reviewNote: "Ẩn danh" });
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.body.error).toBe("UNAUTHORIZED");
  });

  // =========================================================================
  // TEST 10: Audit failure triggers rollback - Class status is not left in NEED_CHANGES
  // =========================================================================
  test("10. Transaction rollback on audit failure: Class remains PENDING_APPROVAL and no notification sent", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");
    const auditService = require("../src/services/auditService");
    const notificationService = require("../src/services/notificationService");

    const notifySpy = jest.spyOn(notificationService, "notify");
    const auditSpy = jest.spyOn(auditService, "audit").mockRejectedValueOnce(
      new Error("Simulated database write error during AuditLog creation")
    );

    const res = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Yêu cầu sửa đổi bị lỗi audit" });

    expect(res.statusCode).toBe(500);

    // Verify atomic rollback in DB: class status MUST remain PENDING_APPROVAL
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("PENDING_APPROVAL");
    expect(fresh.reviewedBy).toBeNull();
    expect(fresh.reviewNote).toBeNull();

    // Verify Notification was NOT sent
    expect(notifySpy).not.toHaveBeenCalled();

    auditSpy.mockRestore();
    notifySpy.mockRestore();
  });

  // =========================================================================
  // TEST 11: Notification is only sent after transaction commits
  // =========================================================================
  test("11. Notification is dispatched post-commit: DB state is already committed when notify executes", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");
    const notificationService = require("../src/services/notificationService");

    let statusAtNotificationTime = null;
    const originalNotify = notificationService.notify;
    const notifySpy = jest.spyOn(notificationService, "notify").mockImplementation(async (...args) => {
      // Query database directly at the moment notify is invoked to prove post-commit state
      const checkDoc = await Class.findById(cls._id).lean();
      statusAtNotificationTime = checkDoc ? checkDoc.status : null;
      return originalNotify(...args);
    });

    const res = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Kiểm tra thời điểm gửi thông báo" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe("NEED_CHANGES");

    // The database MUST already reflect NEED_CHANGES at the exact time notification runs
    expect(statusAtNotificationTime).toBe("NEED_CHANGES");
    expect(notifySpy).toHaveBeenCalledTimes(1);

    notifySpy.mockRestore();
  });

  // =========================================================================
  // TEST 12: Notification failure does NOT invalidate the committed transaction
  // =========================================================================
  test("12. Notification failure does not cause false transaction rollback (API returns 200 OK)", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");
    const notificationService = require("../src/services/notificationService");

    const notifySpy = jest.spyOn(notificationService, "notify").mockRejectedValueOnce(
      new Error("Simulated transient socket timeout contacting notification queue")
    );

    const res = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Ghi chú hợp lệ khi notification gặp sự cố" });

    // API must succeed with 200 because data was committed
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("NEED_CHANGES");

    // Database state is confirmed NEED_CHANGES
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("NEED_CHANGES");
    expect(fresh.reviewNote).toBe("Ghi chú hợp lệ khi notification gặp sự cố");

    // AuditLog is intact
    const auditEntry = await AuditLog.findOne({
      targetType: "Class",
      targetId: cls._id,
      action: "CLASS_CHANGES_REQUESTED",
    }).lean();
    expect(auditEntry).not.toBeNull();

    notifySpy.mockRestore();
  });

  // =========================================================================
  // TEST 13: Concurrency between request-changes and approveClass
  // =========================================================================
  test("13. Concurrency between request-changes and approveClass: exactly one succeeds without overwriting", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    const [resReqChanges, resApprove] = await Promise.all([
      request(app)
        .post(`/api/admin/classes/${cls._id}/request-changes`)
        .set(as(admin))
        .send({ reviewNote: "Admin 1 yêu cầu sửa" }),
      request(app)
        .post(`/api/admin/classes/${cls._id}/approve`)
        .set(as(admin))
        .send({ reviewNote: "Admin 2 phê duyệt" }),
    ]);

    const statuses = [resReqChanges.statusCode, resApprove.statusCode].sort();
    // Exactly one operation must succeed (200), the other must receive 409
    expect(statuses).toEqual([200, 409]);

    const fresh = await Class.findById(cls._id).lean();
    // Final status must be either NEED_CHANGES or OPEN, never corrupted
    expect(["NEED_CHANGES", "OPEN"]).toContain(fresh.status);
  });

  // =========================================================================
  // TEST 14: Fail-closed when MongoDB transaction session cannot start
  // =========================================================================
  test("14. Fails closed with 503 DATABASE_TRANSACTION_UNAVAILABLE when session cannot be created", async () => {
    const cls = await createHelperClass("PENDING_APPROVAL");

    const sessionSpy = jest.spyOn(mongoose, "startSession").mockRejectedValueOnce(
      new Error("MongoDB ReplicaSet primary election in progress")
    );

    const res = await request(app)
      .post(`/api/admin/classes/${cls._id}/request-changes`)
      .set(as(admin))
      .send({ reviewNote: "Thử khi mất kết nối session" });

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("DATABASE_TRANSACTION_UNAVAILABLE");

    // Class remains completely unchanged
    const fresh = await Class.findById(cls._id).lean();
    expect(fresh.status).toBe("PENDING_APPROVAL");

    sessionSpy.mockRestore();
  });
});
