const { connectDB, disconnectDB } = require("./helpers/db");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { signAccessToken } = require("../src/utils/jwt");

const {
  User,
  Category,
  Class,
  Enrollment,
  Review,
  Report,
  AuditLog,
} = require("../src/models");

const NOT_DELETED = { isDeleted: { $ne: true } };

describe("EDUNITY-ADMIN-REVIEW-COMMENT-MODERATION-V1 Test Suite", () => {
  let adminUser;
  let teacherUser;
  let studentUser;

  let adminToken;
  let teacherToken;
  let studentToken;

  let testCategory;
  let testClass;
  let testEnrollment;
  let testReview;

  beforeAll(async () => {
    await connectDB();

    // 1. Users
    adminUser = await User.create({
      email: `admin_rev_mod_${Date.now()}@edunity.vn`,
      passwordHash: "hash123",
      role: "ADMIN",
      status: "ACTIVE",
      adminProfile: { isSuperAdmin: true, permissions: ["PERMANENT_DELETE"] },
    });

    teacherUser = await User.create({
      email: `teacher_rev_mod_${Date.now()}@edunity.vn`,
      passwordHash: "hash123",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Giảng viên Kiểm duyệt", ratingAverage: 0, ratingCount: 0 },
    });

    studentUser = await User.create({
      email: `student_rev_mod_${Date.now()}@edunity.vn`,
      passwordHash: "hash123",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Học viên Kiểm duyệt" },
    });

    adminToken = signAccessToken(adminUser);
    teacherToken = signAccessToken(teacherUser);
    studentToken = signAccessToken(studentUser);

    // 2. Class & Category
    testCategory = await Category.create({
      name: `Cat Rev ${Date.now()}`,
      slug: `cat-rev-${Date.now()}`,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });

    testClass = await Class.create({
      className: `Lớp học Kiểm duyệt ${Date.now()}`,
      status: "IN_PROGRESS",
      teacherId: teacherUser._id,
      teacherName: "Giảng viên Kiểm duyệt",
      subjectId: new mongoose.Types.ObjectId(),
      subjectName: "Ngữ văn",
      courseId: new mongoose.Types.ObjectId(),
      courseTitle: "Khóa học Văn học",
      categoryId: testCategory._id,
      capacity: 25,
      classType: "PAID",
      price: 200000,
      ratingAverage: 0,
      ratingCount: 0,
    });

    testEnrollment = await Enrollment.create({
      studentId: studentUser._id,
      teacherId: teacherUser._id,
      classId: testClass._id,
      courseId: testClass.courseId,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
    });

    // 3. Create initial review
    testReview = await Review.create({
      enrollmentId: testEnrollment._id,
      studentId: studentUser._id,
      teacherId: teacherUser._id,
      classId: testClass._id,
      rating: 4,
      comment: "Bài giảng rất hay nhưng có từ ngữ nhạy cảm cần xem xét kiểm duyệt",
      isHidden: false,
    });

    // Seed rating on class and teacher
    await Class.updateOne({ _id: testClass._id }, { $set: { ratingAverage: 4, ratingCount: 1 } });
    await User.updateOne({ _id: teacherUser._id }, { $set: { "teacherProfile.ratingAverage": 4, "teacherProfile.ratingCount": 1 } });
  });

  afterAll(disconnectDB);

  test("1. Unauthorized user (Student) cannot access Admin Review moderation API", async () => {
    const res = await request(app)
      .get("/api/admin/reviews")
      .set("Authorization", `Bearer ${studentToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test("2. Admin can list reviews with pagination, search, and status filters", async () => {
    const res = await request(app)
      .get(`/api/admin/reviews?search=nhạy cảm&status=VISIBLE`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeDefined();
    const found = res.body.data.items.find((i) => i.id === testReview._id.toString());
    expect(found).toBeDefined();
    expect(found.student.fullName).toBe("Học viên Kiểm duyệt");
    expect(found.rating).toBe(4);
    expect(found.isHidden).toBe(false);
  });

  test("3. Admin can view review details with audit logs and report mapping", async () => {
    // Create mock report on this review
    const mockReport = await Report.create({
      reporterId: studentUser._id,
      type: "INAPPROPRIATE_BEHAVIOR",
      description: "Bình luận chứa nội dung không chuẩn mực",
      targetType: "REVIEW",
      targetId: testReview._id,
      status: "OPEN",
    });

    const res = await request(app)
      .get(`/api/admin/reviews/${testReview._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testReview._id.toString());
    expect(res.body.data.reports).toBeDefined();
    expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.reports[0].type).toBe("INAPPROPRIATE_BEHAVIOR");

    await Report.deleteOne({ _id: mockReport._id });
  });

  test("4. Admin can hide a review: sets isHidden, records AuditLog, recalculates rating", async () => {
    const res = await request(app)
      .post(`/api/admin/reviews/${testReview._id}/hide`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Bình luận chứa ngôn từ không phù hợp" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in MongoDB
    const updated = await Review.findById(testReview._id);
    expect(updated.isHidden).toBe(true);
    expect(updated.hideReason).toBe("Bình luận chứa ngôn từ không phù hợp");
    expect(updated.hiddenBy.toString()).toBe(adminUser._id.toString());
    expect(updated.isDeleted).toBe(false); // MUST NOT be soft-deleted

    // Verify rating recalculation: class and teacher rating become 0 because only 1 review existed and it is now hidden
    const refreshedClass = await Class.findById(testClass._id);
    expect(refreshedClass.ratingCount).toBe(0);
    expect(refreshedClass.ratingAverage).toBe(0);

    // Verify AuditLog
    const auditRecord = await AuditLog.findOne({
      targetType: "Review",
      targetId: testReview._id,
      action: "REVIEW_HIDDEN",
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord.actorAdminId.toString()).toBe(adminUser._id.toString());
  });

  test("5. Public listing strictly excludes hidden review", async () => {
    const res = await request(app).get(`/api/classes/${testClass._id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = (res.body.data.items || []).find((i) => i.id === testReview._id.toString());
    expect(found).toBeUndefined(); // Strictly hidden from public
    expect(res.body.data.ratingCount).toBe(0);
  });

  test("6. Admin can still view hidden review under status=HIDDEN filter", async () => {
    const res = await request(app)
      .get(`/api/admin/reviews?status=HIDDEN`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.items.find((i) => i.id === testReview._id.toString());
    expect(found).toBeDefined();
    expect(found.isHidden).toBe(true);
    expect(found.hideReason).toBe("Bình luận chứa ngôn từ không phù hợp");
  });

  test("7. Admin can unhide a review: restores visibility, updates audit log and rating", async () => {
    const res = await request(app)
      .post(`/api/admin/reviews/${testReview._id}/unhide`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in MongoDB
    const updated = await Review.findById(testReview._id);
    expect(updated.isHidden).toBe(false);
    expect(updated.hiddenAt).toBeNull();
    expect(updated.hiddenBy).toBeNull();
    expect(updated.hideReason).toBeNull();

    // Verify rating restored
    const refreshedClass = await Class.findById(testClass._id);
    expect(refreshedClass.ratingCount).toBe(1);
    expect(refreshedClass.ratingAverage).toBe(4);

    // Verify AuditLog
    const auditRecord = await AuditLog.findOne({
      targetType: "Review",
      targetId: testReview._id,
      action: "REVIEW_UNHIDDEN",
    });
    expect(auditRecord).toBeDefined();

    // Verify public listing now shows it again
    const publicRes = await request(app).get(`/api/classes/${testClass._id}/reviews`);
    expect(publicRes.status).toBe(200);
    const foundPublic = (publicRes.body.data.items || []).find((i) => i.id === testReview._id.toString());
    expect(foundPublic).toBeDefined();
    expect(foundPublic.rating).toBe(4);
  });

  test("8. Soft-delete review moves it to Admin Trash and excludes from public rating", async () => {
    const res = await request(app)
      .delete(`/api/admin/reviews/${testReview._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Học viên gửi nhầm lớp học" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Review.findById(testReview._id);
    expect(updated.isDeleted).toBe(true);
    expect(updated.deleteReason).toBe("Học viên gửi nhầm lớp học");

    // Check Trash API
    const trashRes = await request(app)
      .get(`/api/admin/trash?type=REVIEW`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(trashRes.status).toBe(200);
    const foundTrash = trashRes.body.data.items.find((i) => i.id === testReview._id.toString());
    expect(foundTrash).toBeDefined();

    // Rating is recalculated without the deleted review
    const refreshedClass = await Class.findById(testClass._id);
    expect(refreshedClass.ratingCount).toBe(0);
  });

  test("9. Restore review from trash restores rating and clears deletion fields", async () => {
    const res = await request(app)
      .post(`/api/admin/reviews/${testReview._id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Review.findById(testReview._id);
    expect(updated.isDeleted).toBe(false);
    expect(updated.deletedAt).toBeNull();
    expect(updated.deletedBy).toBeNull();

    // Rating is back
    const refreshedClass = await Class.findById(testClass._id);
    expect(refreshedClass.ratingCount).toBe(1);
    expect(refreshedClass.ratingAverage).toBe(4);
  });

  test("10. Open Report blocks permanent deletion of review", async () => {
    // 1. Soft delete review first
    await request(app)
      .delete(`/api/admin/reviews/${testReview._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // 2. Attach an open report
    const openReport = await Report.create({
      reporterId: studentUser._id,
      type: "FRAUD",
      description: "Nghi vấn đánh giá ảo",
      targetType: "REVIEW",
      targetId: testReview._id,
      status: "OPEN",
    });

    // 3. Try to permanently delete -> MUST FAIL with 409
    const permRes = await request(app)
      .delete(`/api/admin/trash/REVIEW/${testReview._id}/permanent`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(permRes.status).toBe(409);
    expect(permRes.body.error).toBe("DEPENDENCY_CONFLICT");
    expect(permRes.body.message).toContain("khiếu nại chưa xử lý");

    // Clean up report
    await Report.deleteOne({ _id: openReport._id });
  });
});
