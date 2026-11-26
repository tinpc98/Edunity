const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident } = require("./helpers/financialFixtures");
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
  AuditLog,
} = require("../src/models");

const NOT_DELETED = { isDeleted: { $ne: true } };

describe("EDUNITY-V3-SOFT-DELETE-FINAL-V2 Comprehensive Test Suite", () => {
  let superAdminUser;
  let normalAdminUser;
  let studentUser;

  let superAdminToken;
  let normalAdminToken;
  let studentToken;

  let testCategory;
  let testSubject;
  let testCourse;
  let testClass;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    await seedTuitionIncident(actors);

    // 1. Create / Find Super Admin (has PERMANENT_DELETE permission)
    const superAdminEmail = `super_admin_perm_${Date.now()}@edunity.vn`;
    superAdminUser = await User.create({
      email: superAdminEmail,
      passwordHash: "hash123",
      role: "ADMIN",
      status: "ACTIVE",
      adminProfile: {
        isSuperAdmin: true,
        permissions: ["PERMANENT_DELETE"],
      },
    });

    // 2. Create / Find Normal Admin (does NOT have PERMANENT_DELETE permission)
    const normalAdminEmail = `normal_admin_noperm_${Date.now()}@edunity.vn`;
    normalAdminUser = await User.create({
      email: normalAdminEmail,
      passwordHash: "hash123",
      role: "ADMIN",
      status: "ACTIVE",
      adminProfile: {
        isSuperAdmin: false,
        permissions: [],
      },
    });

    // 3. Create / Find Student
    studentUser = await User.findOne({ role: "STUDENT", status: "ACTIVE", ...NOT_DELETED });
    if (!studentUser) {
      studentUser = await User.create({
        email: `student_test_${Date.now()}@edunity.vn`,
        passwordHash: "hash123",
        role: "STUDENT",
        status: "ACTIVE",
      });
    }

    superAdminToken = signAccessToken(superAdminUser);
    normalAdminToken = signAccessToken(normalAdminUser);
    studentToken = signAccessToken(studentUser);
  });

  afterAll(disconnectDB);

  test("1. Unauthorized users (Student) cannot access Admin Trash or delete records", async () => {
    const res = await request(app)
      .get("/api/admin/trash")
      .set("Authorization", `Bearer ${studentToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test("2. Soft delete Category sets isDeleted, deletedAt, deletedBy, deleteReason", async () => {
    const cat = await Category.create({
      name: `Cat SoftDel ${Date.now()}`,
      slug: `cat-softdel-${Date.now()}`,
      status: "ACTIVE",
      createdBy: superAdminUser._id,
    });
    testCategory = cat;

    const res = await request(app)
      .delete(`/api/admin/categories/${cat._id}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Lý do kiểm thử xóa mềm" });

    expect(res.status).toBe(200);
    const updated = await Category.findById(cat._id);
    expect(updated.isDeleted).toBe(true);
    expect(updated.deleteReason).toBe("Lý do kiểm thử xóa mềm");
    expect(updated.status).toBe("INACTIVE");
  });

  test("3. Admin Trash list contains soft-deleted records and computes canPermanentDelete", async () => {
    const res = await request(app)
      .get("/api/admin/trash?type=CATEGORY")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.items.find((i) => i.id === testCategory._id.toString());
    expect(found).toBeDefined();
    expect(found.title).toBe(testCategory.name);
    expect(found.canPermanentDelete).toBe(true);
  });

  test("4. Normal Admin without PERMANENT_DELETE permission is blocked from permanent deletion (403)", async () => {
    const res = await request(app)
      .delete(`/api/admin/trash/CATEGORY/${testCategory._id}/permanent`)
      .set("Authorization", `Bearer ${normalAdminToken}`)
      .send({ reason: "Cố tình xóa không có quyền" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  test("5. Active (non-deleted) record cannot be permanently deleted (400 INVALID_STATE)", async () => {
    const activeCat = await Category.create({
      name: `Active Cat ${Date.now()}`,
      slug: `active-cat-${Date.now()}`,
      status: "ACTIVE",
      isDeleted: false,
      createdBy: superAdminUser._id,
    });

    const res = await request(app)
      .delete(`/api/admin/trash/CATEGORY/${activeCat._id}/permanent`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_STATE");

    await Category.deleteOne({ _id: activeCat._id });
  });

  test("6. Category with dependent Subjects cannot be permanently deleted (409 DEPENDENCY_CONFLICT)", async () => {
    const parentCat = await Category.create({
      name: `Parent Cat ${Date.now()}`,
      slug: `parent-cat-${Date.now()}`,
      status: "INACTIVE",
      isDeleted: true,
      deletedAt: new Date(),
      createdBy: superAdminUser._id,
    });

    const childSub = await Subject.create({
      name: `Child Sub ${Date.now()}`,
      slug: `child-sub-${Date.now()}`,
      categoryId: parentCat._id,
      categoryName: parentCat.name,
      status: "ACTIVE",
      createdBy: superAdminUser._id,
    });

    const res = await request(app)
      .delete(`/api/admin/trash/CATEGORY/${parentCat._id}/permanent`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DEPENDENCY_CONFLICT");
    expect(res.body.message).toContain("môn học liên kết");

    // Clean up
    await Subject.deleteOne({ _id: childSub._id });
    await Category.deleteOne({ _id: parentCat._id });
  });

  test("7. Class with existing Enrollment or Payment cannot be permanently deleted (409 DEPENDENCY_CONFLICT)", async () => {
    const mockCat = await Category.create({
      name: `Class Cat ${Date.now()}`,
      slug: `class-cat-${Date.now()}`,
      status: "ACTIVE",
      createdBy: superAdminUser._id,
    });

    const mockClass = await Class.create({
      className: `Mock Class ${Date.now()}`,
      status: "CANCELLED",
      isDeleted: true,
      deletedAt: new Date(),
      teacherId: superAdminUser._id,
      teacherName: "Giảng viên mẫu",
      subjectId: new mongoose.Types.ObjectId(),
      subjectName: "Toán",
      courseId: new mongoose.Types.ObjectId(),
      courseTitle: "Khóa học",
      categoryId: mockCat._id,
      capacity: 30,
      classType: "PAID",
      price: 100000,
    });

    const mockEnrollment = await Enrollment.create({
      studentId: studentUser._id,
      teacherId: superAdminUser._id,
      classId: mockClass._id,
      courseId: mockClass.courseId,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
    });

    const res = await request(app)
      .delete(`/api/admin/trash/CLASS/${mockClass._id}/permanent`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DEPENDENCY_CONFLICT");
    expect(res.body.message).toContain("học viên đăng ký hoặc có lịch sử ghi danh");

    // Clean up
    await Enrollment.deleteOne({ _id: mockEnrollment._id });
    await Class.deleteOne({ _id: mockClass._id });
    await Category.deleteOne({ _id: mockCat._id });
  });

  test("8. Financial records are strictly immutable and cannot be deleted via trash API", async () => {
    const res = await request(app)
      .delete(`/api/admin/trash/PAYMENT/507f1f77bcf86cd799439011/permanent`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect([400, 404]).toContain(res.status);
  });

  test("9. Eligible soft-deleted record is permanently deleted and creates an independent AuditLog", async () => {
    // testCategory is soft-deleted and has no children
    const targetId = testCategory._id;

    const res = await request(app)
      .delete(`/api/admin/trash/CATEGORY/${targetId}/permanent`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Admin phê duyệt xóa vĩnh viễn dữ liệu rác" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain("xóa vĩnh viễn");

    // Verify completely removed from MongoDB
    const checkDb = await Category.findById(targetId);
    expect(checkDb).toBeNull();

    // Verify independent AuditLog was created
    const auditRecord = await AuditLog.findOne({
      targetType: "CATEGORY",
      targetId: targetId,
      action: "PERMANENT_DELETE",
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord.actorAdminId.toString()).toBe(superAdminUser._id.toString());
    expect(auditRecord.afterState.permanentlyDeleted).toBe(true);

    // Verify it cannot be restored anymore (404)
    const restoreRes = await request(app)
      .post(`/api/admin/trash/CATEGORY/${targetId}/restore`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect([400, 404]).toContain(restoreRes.status);

    testCategory = null;
  });

  test("10. Financial invariants: Sample Orders 100000008 and 100000009 remain intact", async () => {
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
