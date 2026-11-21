const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  SyllabusVersion,
  CurriculumUnit,
  TeacherSubjectAuthorization,
  CoursePricingPolicy,
  AuditLog,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TASK BE-03: Academic Soft Delete & Dependency Safety Integration Suite", () => {
  let admin, teacher, student;

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
      email: "admin-be03@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    });

    teacher = await User.create({
      email: "teacher-be03@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Thầy Hưng BE-03",
        verificationStatus: "VERIFIED",
      },
    });

    student = await User.create({
      email: "student-be03@edunity.test",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });
  });

  describe("BE-03.2 — Category Delete API (DELETE /admin/categories/:id)", () => {
    test("BE03.CAT-1: Non-admin or unauthenticated access is rejected (401 / 403)", async () => {
      const cat = await Category.create({
        name: "Toán Học",
        slug: "toan-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      // Invalid ID -> 401 UNAUTHORIZED
      const unauthRes = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set("x-user-id", "invalid-id");
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error).toBe("UNAUTHORIZED");

      // Student -> 403 FORBIDDEN
      const studentRes = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(student));
      expect(studentRes.status).toBe(403);
      expect(studentRes.body.error).toBe("FORBIDDEN");

      // Teacher -> 403 FORBIDDEN
      const teacherRes = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(teacher));
      expect(teacherRes.status).toBe(403);
      expect(teacherRes.body.error).toBe("FORBIDDEN");
    });

    test("BE03.CAT-2: Deleting non-existent category returns 404 CATEGORY_NOT_FOUND", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/admin/categories/${fakeId}`)
        .set(as(admin));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("CATEGORY_NOT_FOUND");
    });

    test("BE03.CAT-3: Deletion is blocked with 409 CATEGORY_HAS_SUBJECTS when active subject exists", async () => {
      const cat = await Category.create({
        name: "Khoa Học Tự Nhiên",
        slug: "khoa-hoc-tu-nhien",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Vật Lý",
        slug: "vat-ly",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CATEGORY_HAS_SUBJECTS");

      // Category remains active and not deleted
      const checkCat = await Category.findById(cat._id);
      expect(checkCat.isDeleted).toBe(false);
      expect(checkCat.status).toBe("ACTIVE");
    });

    test("BE03.CAT-4: Deletion is blocked with 409 CATEGORY_HAS_COURSES when active course exists", async () => {
      const cat = await Category.create({
        name: "Ngoại Ngữ",
        slug: "ngoai-ngu",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Tiếng Anh",
        slug: "tieng-anh",
        status: "INACTIVE",
        isDeleted: true, // Subject was deleted, but Course still references category!
        createdBy: admin._id,
      });

      await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "IELTS Intensive",
        slug: "ielts-intensive",
        level: "ADVANCED",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CATEGORY_HAS_COURSES");
    });

    test("BE03.CAT-5: Deletion is blocked with 409 CATEGORY_HAS_CLASSES when active class exists", async () => {
      const cat = await Category.create({
        name: "Lập Trình",
        slug: "lap-trinh",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Python Cơ Bản",
        slug: "python-co-ban",
        status: "INACTIVE",
        isDeleted: true,
        createdBy: admin._id,
      });

      const course = await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "Python 101",
        slug: "python-101",
        level: "BEGINNER",
        status: "INACTIVE",
        isDeleted: true,
        createdBy: admin._id,
      });

      await Class.create({
        categoryId: cat._id,
        subjectId: sub._id,
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: teacher.teacherProfile.fullName,
        className: "Lớp Python Kỳ 1",
        classType: "PAID",
        price: 500000,
        capacity: 15,
        status: "OPEN",
      });

      const res = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CATEGORY_HAS_CLASSES");
    });

    test("BE03.CAT-6: Successfully soft-deletes category without dependencies & records AuditLog", async () => {
      const cat = await Category.create({
        name: "Nghệ Thuật",
        slug: "nghe-thuat",
        description: "Mô tả nghệ thuật",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.categoryId).toBe(cat._id.toString());

      // Verify soft delete in DB (NO physical deletion)
      const freshCat = await Category.findById(cat._id);
      expect(freshCat).not.toBeNull();
      expect(freshCat.isDeleted).toBe(true);
      expect(freshCat.deletedAt).toBeInstanceOf(Date);
      expect(freshCat.deletedBy.toString()).toBe(admin._id.toString());
      expect(freshCat.status).toBe("INACTIVE");

      // Verify AuditLog
      const auditLog = await AuditLog.findOne({
        targetType: "Category",
        targetId: cat._id,
        action: "CATEGORY_SOFT_DELETED",
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.actorAdminId.toString()).toBe(admin._id.toString());
      expect(auditLog.beforeState.status).toBe("ACTIVE");
      expect(auditLog.afterState.isDeleted).toBe(true);

      // Attempting to delete again returns 404 CATEGORY_NOT_FOUND
      const repeatRes = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));
      expect(repeatRes.status).toBe(404);
      expect(repeatRes.body.error).toBe("CATEGORY_NOT_FOUND");
    });
  });

  describe("BE-03.3 — Subject Delete API (DELETE /admin/subjects/:id)", () => {
    let cat;

    beforeEach(async () => {
      cat = await Category.create({
        name: "Toán & Khoa Học",
        slug: "toan-khoa-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });
    });

    test("BE03.SUB-1: Non-admin access is rejected (401 / 403)", async () => {
      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Hóa Học",
        slug: "hoa-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const unauthRes = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set("x-user-id", "invalid-id");
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error).toBe("UNAUTHORIZED");

      const teacherRes = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(teacher));
      expect(teacherRes.status).toBe(403);
      expect(teacherRes.body.error).toBe("FORBIDDEN");
    });

    test("BE03.SUB-2: Deleting non-existent subject returns 404 SUBJECT_NOT_FOUND", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/admin/subjects/${fakeId}`)
        .set(as(admin));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("SUBJECT_NOT_FOUND");
    });

    test("BE03.SUB-3: Deletion is blocked with 409 SUBJECT_HAS_COURSES when active course exists", async () => {
      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Sinh Học",
        slug: "sinh-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "Sinh Học Tế Bào",
        slug: "sinh-hoc-te-bao",
        level: "INTERMEDIATE",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SUBJECT_HAS_COURSES");

      const checkSub = await Subject.findById(sub._id);
      expect(checkSub.isDeleted).toBe(false);
      expect(checkSub.status).toBe("ACTIVE");
    });

    test("BE03.SUB-4: Deletion is blocked with 409 SUBJECT_HAS_CLASSES when active class exists", async () => {
      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Thiên Văn Học",
        slug: "thien-van-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const course = await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "Thiên Văn Đại Cương",
        slug: "thien-van-dai-cuong",
        level: "BEGINNER",
        status: "INACTIVE",
        isDeleted: true,
        createdBy: admin._id,
      });

      await Class.create({
        categoryId: cat._id,
        subjectId: sub._id,
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: teacher.teacherProfile.fullName,
        className: "Lớp Sao Trời Kỳ 1",
        classType: "FREE",
        price: 0,
        capacity: 20,
        status: "OPEN",
      });

      const res = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SUBJECT_HAS_CLASSES");
    });

    test("BE03.SUB-5: Deletion is blocked with 409 SUBJECT_HAS_TEACHER_AUTHORIZATIONS when active auth exists", async () => {
      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Lịch Sử",
        slug: "lich-su",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      await TeacherSubjectAuthorization.create({
        teacherId: teacher._id,
        subjectId: sub._id,
        categoryId: cat._id,
        level: "BEGINNER",
        status: "APPROVED",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SUBJECT_HAS_TEACHER_AUTHORIZATIONS");

      const checkSub = await Subject.findById(sub._id);
      expect(checkSub.isDeleted).toBe(false);
    });

    test("BE03.SUB-6: Successfully soft-deletes subject without dependencies & records AuditLog", async () => {
      const sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Địa Lý",
        slug: "dia-ly",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.subjectId).toBe(sub._id.toString());

      // Verify soft delete in DB (NO physical deletion)
      const freshSub = await Subject.findById(sub._id);
      expect(freshSub).not.toBeNull();
      expect(freshSub.isDeleted).toBe(true);
      expect(freshSub.deletedAt).toBeInstanceOf(Date);
      expect(freshSub.deletedBy.toString()).toBe(admin._id.toString());
      expect(freshSub.status).toBe("INACTIVE");

      // Verify AuditLog
      const auditLog = await AuditLog.findOne({
        targetType: "Subject",
        targetId: sub._id,
        action: "SUBJECT_SOFT_DELETED",
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.actorAdminId.toString()).toBe(admin._id.toString());
      expect(auditLog.beforeState.status).toBe("ACTIVE");
      expect(auditLog.afterState.isDeleted).toBe(true);

      // Attempting to delete again returns 404 SUBJECT_NOT_FOUND
      const repeatRes = await request(app)
        .delete(`/api/admin/subjects/${sub._id}`)
        .set(as(admin));
      expect(repeatRes.status).toBe(404);
      expect(repeatRes.body.error).toBe("SUBJECT_NOT_FOUND");
    });
  });

  describe("BE-03.4 — Course Delete Safety (DELETE /admin/courses/:id)", () => {
    let cat, sub;

    beforeEach(async () => {
      cat = await Category.create({
        name: "Tin Học",
        slug: "tin-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      sub = await Subject.create({
        categoryId: cat._id,
        categoryName: cat.name,
        name: "Lập Trình Web",
        slug: "lap-trinh-web",
        status: "ACTIVE",
        createdBy: admin._id,
      });
    });

    test("BE03.CRS-1: Deletion is blocked with 409 COURSE_HAS_CLASSES when OPEN or non-deleted class exists", async () => {
      const course = await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "React Fullstack",
        slug: "react-fullstack",
        level: "ADVANCED",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      await Class.create({
        categoryId: cat._id,
        subjectId: sub._id,
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: teacher.teacherProfile.fullName,
        className: "Lớp React K1",
        classType: "PAID",
        price: 1500000,
        capacity: 25,
        status: "OPEN",
      });

      const res = await request(app)
        .delete(`/api/admin/courses/${course._id}`)
        .set(as(admin));

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("COURSE_HAS_CLASSES");

      const checkCourse = await Course.findById(course._id);
      expect(checkCourse.isDeleted).toBe(false);
      expect(checkCourse.status).toBe("ACTIVE");
    });

    test("BE03.CRS-2: Successfully soft-deletes course, syllabus versions & curriculum units atomically", async () => {
      const course = await Course.create({
        categoryId: cat._id,
        categoryName: cat.name,
        subjectId: sub._id,
        subjectName: sub.name,
        title: "Vue.js Chuyên Sâu",
        slug: "vue-js-chuyen-sau",
        level: "ADVANCED",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const syllabusVersion = await SyllabusVersion.create({
        courseId: course._id,
        versionNumber: 1,
        title: "Phiên bản Syllabus 1",
        status: "PUBLISHED",
        createdBy: admin._id,
      });

      const curriculumUnit = await CurriculumUnit.create({
        courseId: course._id,
        syllabusVersionId: syllabusVersion._id,
        unitOrder: 1,
        title: "Bài 1: Giới thiệu Vue 3",
        createdBy: admin._id,
      });

      const res = await request(app)
        .delete(`/api/admin/courses/${course._id}`)
        .set(as(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      // Verify Course soft-deleted (document NOT physically deleted)
      const freshCourse = await Course.findById(course._id);
      expect(freshCourse.isDeleted).toBe(true);
      expect(freshCourse.deletedAt).toBeInstanceOf(Date);
      expect(freshCourse.deletedBy.toString()).toBe(admin._id.toString());
      expect(freshCourse.status).toBe("INACTIVE");

      // Verify SyllabusVersion soft-deleted
      const freshVersion = await SyllabusVersion.findById(syllabusVersion._id);
      expect(freshVersion.isDeleted).toBe(true);

      // Verify CurriculumUnit soft-deleted
      const freshUnit = await CurriculumUnit.findById(curriculumUnit._id);
      expect(freshUnit.isDeleted).toBe(true);

      // Verify AuditLog
      const auditLog = await AuditLog.findOne({
        targetType: "Course",
        targetId: course._id,
        action: "COURSE_SOFT_DELETED",
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.actorAdminId.toString()).toBe(admin._id.toString());
    });
  });

  describe("BE-03.5 — Query Safety & Regression", () => {
    let cat1, cat2Deleted, sub1, sub2Deleted, crs1, crs2Deleted;

    beforeEach(async () => {
      // Category 1: Active
      cat1 = await Category.create({
        name: "Khoa Học Xã Hội",
        slug: "khoa-hoc-xa-hoi",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      // Category 2: Soft-deleted
      cat2Deleted = await Category.create({
        name: "Môn Đã Xóa",
        slug: "mon-da-xoa",
        status: "INACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: admin._id,
        createdBy: admin._id,
      });

      // Subject 1: Active under cat1
      sub1 = await Subject.create({
        categoryId: cat1._id,
        categoryName: cat1.name,
        name: "Xã Hội Học",
        slug: "xa-hoi-hoc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      // Subject 2: Soft-deleted under cat1
      sub2Deleted = await Subject.create({
        categoryId: cat1._id,
        categoryName: cat1.name,
        name: "Nhân Chủng Học",
        slug: "nhan-chung-hoc",
        status: "INACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: admin._id,
        createdBy: admin._id,
      });

      // Course 1: Active under sub1
      crs1 = await Course.create({
        categoryId: cat1._id,
        categoryName: cat1.name,
        subjectId: sub1._id,
        subjectName: sub1.name,
        title: "Xã Hội Học Đô Thị",
        slug: "xa-hoi-hoc-do-thi",
        level: "BEGINNER",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      // Course 2: Soft-deleted under sub1
      crs2Deleted = await Course.create({
        categoryId: cat1._id,
        categoryName: cat1.name,
        subjectId: sub1._id,
        subjectName: sub1.name,
        title: "Xã Hội Học Nông Thôn (Cũ)",
        slug: "xa-hoi-hoc-nong-thon-cu",
        level: "BEGINNER",
        status: "INACTIVE",
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: admin._id,
        createdBy: admin._id,
      });
    });

    test("BE03.QRY-1: GET /api/categories does not return soft-deleted categories", async () => {
      const res = await request(app).get("/api/categories");
      expect(res.status).toBe(200);

      const items = res.body.data;
      const ids = items.map((c) => c._id.toString());
      expect(ids).toContain(cat1._id.toString());
      expect(ids).not.toContain(cat2Deleted._id.toString());
    });

    test("BE03.QRY-2: GET /api/categories/:id/subjects returns 404 for deleted category & excludes deleted subjects", async () => {
      // Deleted category returns 404
      const deletedCatRes = await request(app).get(`/api/categories/${cat2Deleted._id}/subjects`);
      expect(deletedCatRes.status).toBe(404);
      expect(deletedCatRes.body.error).toBe("CATEGORY_NOT_FOUND");

      // Active category returns only active, non-deleted subjects
      const activeCatRes = await request(app).get(`/api/categories/${cat1._id}/subjects`);
      expect(activeCatRes.status).toBe(200);

      const subjects = activeCatRes.body.data;
      const subIds = subjects.map((s) => s._id.toString());
      expect(subIds).toContain(sub1._id.toString());
      expect(subIds).not.toContain(sub2Deleted._id.toString());
    });

    test("BE03.QRY-3: GET /api/subjects/:id returns 404 for deleted subject & excludes deleted courses", async () => {
      // Deleted subject returns 404
      const deletedSubRes = await request(app).get(`/api/subjects/${sub2Deleted._id}`);
      expect(deletedSubRes.status).toBe(404);
      expect(deletedSubRes.body.error).toBe("SUBJECT_NOT_FOUND");

      // Active subject returns details and only active non-deleted courses
      const activeSubRes = await request(app).get(`/api/subjects/${sub1._id}`);
      expect(activeSubRes.status).toBe(200);

      const courseIds = activeSubRes.body.data.courses.map((c) => c._id.toString());
      expect(courseIds).toContain(crs1._id.toString());
      expect(courseIds).not.toContain(crs2Deleted._id.toString());
    });

    test("BE03.QRY-4: GET /api/courses excludes soft-deleted courses", async () => {
      const res = await request(app).get("/api/courses");
      expect(res.status).toBe(200);

      const courseIds = res.body.data.items.map((c) => c._id.toString());
      expect(courseIds).toContain(crs1._id.toString());
      expect(courseIds).not.toContain(crs2Deleted._id.toString());
    });

    test("BE03.QRY-5: GET /api/admin/courses excludes soft-deleted courses", async () => {
      const res = await request(app)
        .get("/api/admin/courses")
        .set(as(admin));

      expect(res.status).toBe(200);
      const courseIds = res.body.data.items.map((c) => c._id.toString());
      expect(courseIds).toContain(crs1._id.toString());
      expect(courseIds).not.toContain(crs2Deleted._id.toString());
    });

    test("BE03.QRY-6: GET /api/admin/courses/:id returns 404 for soft-deleted course", async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${crs2Deleted._id}`)
        .set(as(admin));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("COURSE_NOT_FOUND");
    });
  });

  describe("BE-03.6 — Fail-Closed Transaction & Concurrency Integrity", () => {
    test("BE03.TX-1: Fails closed with 503 DATABASE_TRANSACTION_UNAVAILABLE when session cannot be started", async () => {
      const cat = await Category.create({
        name: "Thể Dục",
        slug: "the-duc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      jest.spyOn(mongoose, "startSession").mockRejectedValueOnce(new Error("Replica set connection lost"));

      const res = await request(app)
        .delete(`/api/admin/categories/${cat._id}`)
        .set(as(admin));

      expect(res.status).toBe(503);
      expect(res.body.error).toBe("DATABASE_TRANSACTION_UNAVAILABLE");

      // Verify category is intact
      const freshCat = await Category.findById(cat._id);
      expect(freshCat.isDeleted).toBe(false);
    });

    test("BE03.TX-2: Concurrent delete requests on the same category: exactly one succeeds, second gets 404", async () => {
      const cat = await Category.create({
        name: "Âm Nhạc Dân Tộc",
        slug: "am-nhac-dan-toc",
        status: "ACTIVE",
        createdBy: admin._id,
      });

      const [res1, res2] = await Promise.all([
        request(app).delete(`/api/admin/categories/${cat._id}`).set(as(admin)),
        request(app).delete(`/api/admin/categories/${cat._id}`).set(as(admin)),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 404]);

      // Category is soft-deleted exactly once
      const auditCount = await AuditLog.countDocuments({
        targetType: "Category",
        targetId: cat._id,
        action: "CATEGORY_SOFT_DELETED",
      });
      expect(auditCount).toBe(1);
    });
  });
});
