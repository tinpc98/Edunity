const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { signAccessToken } = require("../src/utils/jwt");

const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Payment,
  Transaction,
  TeacherEarning,
  RefundCase,
} = require("../src/models");

const NOT_DELETED = { isDeleted: { $ne: true } };

describe("EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1 Test Suite", () => {
  let adminUser;
  let studentUser;
  let teacherUser;
  let adminToken;
  let studentToken;
  let teacherToken;

  let testCategory;
  let testSubject;
  let testCourse;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // 1. Ensure test users exist
    adminUser = await User.findOne({ role: "ADMIN", status: "ACTIVE", ...NOT_DELETED });
    if (!adminUser) {
      adminUser = await User.create({
        email: `test_admin_${Date.now()}@edunity.vn`,
        passwordHash: "hash123",
        role: "ADMIN",
        status: "ACTIVE",
      });
    }

    studentUser = await User.findOne({ role: "STUDENT", status: "ACTIVE", ...NOT_DELETED });
    if (!studentUser) {
      studentUser = await User.create({
        email: `test_student_${Date.now()}@edunity.vn`,
        passwordHash: "hash123",
        role: "STUDENT",
        status: "ACTIVE",
      });
    }

    teacherUser = await User.findOne({ role: "TEACHER", status: "ACTIVE", ...NOT_DELETED });
    if (!teacherUser) {
      teacherUser = await User.create({
        email: `test_teacher_${Date.now()}@edunity.vn`,
        passwordHash: "hash123",
        role: "TEACHER",
        status: "ACTIVE",
      });
    }

    adminToken = signAccessToken(adminUser);
    studentToken = signAccessToken(studentUser);
    teacherToken = signAccessToken(teacherUser);
  });

  afterAll(async () => {
    // Clean up test entities created during this run
    if (testCategory) {
      await Category.deleteMany({ _id: testCategory._id });
    }
    if (testSubject) {
      await Subject.deleteMany({ _id: testSubject._id });
    }
    if (testCourse) {
      await Course.deleteMany({ _id: testCourse._id });
    }
  });

  test("1. Soft delete Category sets correct fields (isDeleted, deletedAt, deletedBy, deleteReason)", async () => {
    const slug = `test-softdel-cat-${Date.now()}`;
    const cat = await Category.create({
      name: `Test Cat ${Date.now()}`,
      slug,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });
    testCategory = cat;

    const res = await request(app)
      .delete(`/api/admin/categories/${cat._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Lý do dọn dẹp kiểm thử" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const refreshed = await Category.findById(cat._id);
    expect(refreshed.isDeleted).toBe(true);
    expect(refreshed.deletedAt).toBeInstanceOf(Date);
    expect(refreshed.deletedBy.toString()).toBe(adminUser._id.toString());
    expect(refreshed.deleteReason).toBe("Lý do dọn dẹp kiểm thử");
    expect(refreshed.status).toBe("INACTIVE");
  });

  test("2. Normal queries exclude soft-deleted items (isDeleted: { $ne: true })", async () => {
    const publicList = await Category.find({ status: "ACTIVE", ...NOT_DELETED }).lean();
    const found = publicList.some((c) => c._id.toString() === testCategory._id.toString());
    expect(found).toBe(false);
  });

  test("3. Trash API includes soft-deleted items", async () => {
    const res = await request(app)
      .get("/api/admin/trash?type=CATEGORY")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.items.find((item) => item.id === testCategory._id.toString());
    expect(found).toBeDefined();
    expect(found.type).toBe("CATEGORY");
    expect(found.deleteReason).toBe("Lý do dọn dẹp kiểm thử");
  });

  test("4. Restore Category clears deletion fields and resets status safely", async () => {
    const res = await request(app)
      .post(`/api/admin/categories/${testCategory._id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const refreshed = await Category.findById(testCategory._id);
    expect(refreshed.isDeleted).toBe(false);
    expect(refreshed.deletedAt).toBeNull();
    expect(refreshed.deletedBy).toBeNull();
    expect(refreshed.deleteReason).toBeNull();
    expect(refreshed.status).toBe("INACTIVE"); // Safe default, waiting for Admin review
  });

  test("5. Unauthorized delete or restore is rejected", async () => {
    // Non-admin token
    const resDel = await request(app)
      .delete(`/api/admin/categories/${testCategory._id}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(resDel.status).toBe(403);

    const resRes = await request(app)
      .post(`/api/admin/categories/${testCategory._id}/restore`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(resRes.status).toBe(403);

    // Unauthenticated
    const resUnauth = await request(app).get("/api/admin/trash");
    expect([401, 403]).toContain(resUnauth.status);
  });

  test("6. Dependency guard: Category with active Subject cannot be deleted", async () => {
    // Create an active subject under testCategory
    testSubject = await Subject.create({
      categoryId: testCategory._id,
      categoryName: testCategory.name,
      name: `Test Subject ${Date.now()}`,
      slug: `test-subj-${Date.now()}`,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });

    const res = await request(app)
      .delete(`/api/admin/categories/${testCategory._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Cố tình xóa danh mục đang có môn học" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DEPENDENCY_CONFLICT");
  });

  test("7. Dependency guard: Subject with active Course cannot be deleted", async () => {
    testCourse = await Course.create({
      categoryId: testCategory._id,
      categoryName: testCategory.name,
      subjectId: testSubject._id,
      subjectName: testSubject.name,
      title: `Test Course ${Date.now()}`,
      slug: `test-course-${Date.now()}`,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });

    const res = await request(app)
      .delete(`/api/admin/subjects/${testSubject._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DEPENDENCY_CONFLICT");
  });

  test("8. Dependency guard: Class with paid/confirmed Enrollment cannot be deleted", async () => {
    // Find an existing class with confirmed enrollments (e.g. from Order 100000009 or seed)
    const paidEnrollment = await Enrollment.findOne({
      enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
    }).lean();

    if (paidEnrollment) {
      const res = await request(app)
        .delete(`/api/admin/classes/${paidEnrollment.classId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Cố tình xóa lớp có học viên đã thanh toán" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("DEPENDENCY_CONFLICT");
      expect(res.body.message).toContain("học viên");
    }
  });

  test("9. Restore conflict: Restoring Subject with deleted parent Category returns 409 RESTORE_CONFLICT", async () => {
    // 1. Create a category and subject
    const cat = await Category.create({
      name: `Conflict Parent Cat ${Date.now()}`,
      slug: `conf-parent-${Date.now()}`,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });
    const sub = await Subject.create({
      categoryId: cat._id,
      categoryName: cat.name,
      name: `Conflict Sub ${Date.now()}`,
      slug: `conf-sub-${Date.now()}`,
      status: "ACTIVE",
      createdBy: adminUser._id,
    });

    // 2. Soft delete subject first
    await request(app)
      .delete(`/api/admin/subjects/${sub._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // 3. Soft delete category (now possible because subject is soft-deleted)
    await request(app)
      .delete(`/api/admin/categories/${cat._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // 4. Try to restore subject while parent category is deleted
    const res = await request(app)
      .post(`/api/admin/subjects/${sub._id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("RESTORE_CONFLICT");
    expect(res.body.message).toContain("parent category");

    // Clean up
    await Subject.deleteMany({ _id: sub._id });
    await Category.deleteMany({ _id: cat._id });
  });

  test("10. Pre-flight Trash Detail check returns canRestore and block reasons", async () => {
    // Delete any remaining test course/subject under testCategory
    await Course.deleteMany({ categoryId: testCategory._id });
    await Subject.deleteMany({ categoryId: testCategory._id });

    const delRes = await request(app)
      .delete(`/api/admin/categories/${testCategory._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    const res = await request(app)
      .get(`/api/admin/trash/CATEGORY/${testCategory._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testCategory._id.toString());
    expect(res.body.data.canRestore).toBe(true);
  });

  test("11. Restore via Global Trash API dispatches safely to domain restore", async () => {
    const res = await request(app)
      .post(`/api/admin/trash/CATEGORY/${testCategory._id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const refreshed = await Category.findById(testCategory._id);
    expect(refreshed.isDeleted).toBe(false);
  });

  test("12. Financial Immutability: Order 100000008 and 100000009 finance records are intact", async () => {
    const p1 = await Payment.findOne({ orderCode: 100000008 }).lean();
    const p2 = await Payment.findOne({ orderCode: 100000009 }).lean();

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p2.paymentStatus).toBe("COMPLETED");

    const refundCase = await RefundCase.findOne({ sourcePaymentId: p1._id }).lean();
    if (refundCase) {
      expect(refundCase.status).toBe("NEEDS_REVIEW");
    }
  });
});
