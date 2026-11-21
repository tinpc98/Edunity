const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}
process.env.ENABLE_PAYMENT_SANDBOX = "true";

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Enrollment, Payment } = require("../src/models");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("EDUNITY-PUBLIC-CLASS-REGISTRATION-V1: Public Class Listing & Registration Test Suite", () => {
  let admin, teacher, student, otherUser;
  let category, subject, course;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");

    admin = await User.create({ email: "admin@edunity.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher@edunity.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Cô Mai Anh", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student@edunity.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Em Hoàng Long" },
    });
    otherUser = await User.create({
      email: "sponsor@edunity.com",
      passwordHash,
      role: "SPONSOR",
    });

    category = await Category.create({ name: "Toán Học", slug: "toan-hoc", createdBy: admin._id, status: "ACTIVE" });
    subject = await Subject.create({
      name: "Đại Số Lớp 10",
      slug: "dai-so-10",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    course = await Course.create({
      title: "Chinh Phục Đại Số 10 Toàn Diện",
      slug: "chinh-phuc-dai-so-10",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
  });

  // =========================================================================
  // 1. PUBLIC CLASS LISTING: START DATE & VISIBILITY FILTERING
  // =========================================================================

  test("1.1: Only upcoming classes (startDate > now) in status OPEN are visible in public catalog", async () => {
    const now = new Date();
    const futureDate1 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // in 5 days
    const futureDate2 = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // in 10 days
    const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    // Upcoming Class (valid)
    const upcomingClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Sắp Khai Giảng 1",
      classType: "PAID",
      price: 250000,
      capacity: 20,
      startDate: futureDate1,
      status: "OPEN",
    });

    // Another Upcoming Class (valid)
    const upcomingClass2 = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Sắp Khai Giảng 2",
      classType: "PAID",
      price: 300000,
      capacity: 15,
      startDate: futureDate2,
      status: "OPEN",
    });

    // Past Class (already started) -> MUST BE HIDDEN
    await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Đã Bắt Đầu",
      classType: "PAID",
      price: 250000,
      capacity: 20,
      startDate: pastDate,
      status: "OPEN",
    });

    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const classNames = res.body.data.items.map((c) => c.className);
    expect(classNames).toContain("Toán 10 - Sắp Khai Giảng 1");
    expect(classNames).toContain("Toán 10 - Sắp Khai Giảng 2");
    expect(classNames).not.toContain("Toán 10 - Đã Bắt Đầu");
    expect(res.body.data.total).toBe(2);
  });

  test("1.2: Never exposes unapproved or cancelled classes (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED)", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"]) {
      await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: "Cô Mai Anh",
        categoryId: category._id,
        subjectId: subject._id,
        className: `Lớp Ẩn - ${status}`,
        classType: "PAID",
        price: 200000,
        capacity: 10,
        startDate: futureDate,
        status,
      });
    }

    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    const hiddenNames = res.body.data.items.map((c) => c.className);
    expect(hiddenNames.length).toBe(0);
    expect(res.body.data.total).toBe(0);

    // Even if query attempts to force statuses
    const forced = await request(app).get("/api/classes?statuses=DRAFT,PENDING_APPROVAL,REJECTED,CANCELLED");
    expect(forced.statusCode).toBe(200);
    expect(forced.body.data.total).toBe(0);
  });

  test("1.3: Classes that are full (enrolledCount >= capacity) remain visible with capacity badge", async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Lớp Đã Đầy Chỗ",
      classType: "PAID",
      price: 200000,
      capacity: 10,
      enrolledCount: 10, // Full!
      startDate: futureDate,
      status: "OPEN",
    });

    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(1);
    const item = res.body.data.items[0];
    expect(item.className).toBe("Toán 10 - Lớp Đã Đầy Chỗ");
    expect(item.capacity).toBe(10);
    expect(item.enrolledCount).toBe(10);
  });

  // =========================================================================
  // 2. SORTING & PAGINATION
  // =========================================================================

  test("2.1: Default sorting prioritizes upcoming classes (startDate: 1)", async () => {
    const now = new Date();
    const dateFar = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const dateMid = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days
    const dateNear = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days

    await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Khai Giảng Xa (30 ngày)",
      classType: "PAID",
      price: 200000,
      capacity: 10,
      startDate: dateFar,
      status: "OPEN",
    });

    await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Khai Giảng Gần Nhất (2 ngày)",
      classType: "PAID",
      price: 200000,
      capacity: 10,
      startDate: dateNear,
      status: "OPEN",
    });

    await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Khai Giảng Vừa (15 ngày)",
      classType: "PAID",
      price: 200000,
      capacity: 10,
      startDate: dateMid,
      status: "OPEN",
    });

    const res = await request(app).get("/api/classes");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items.length).toBe(3);

    // Order must be: Near (2 days) -> Mid (15 days) -> Far (30 days)
    expect(res.body.data.items[0].className).toBe("Lớp Khai Giảng Gần Nhất (2 ngày)");
    expect(res.body.data.items[1].className).toBe("Lớp Khai Giảng Vừa (15 ngày)");
    expect(res.body.data.items[2].className).toBe("Lớp Khai Giảng Xa (30 ngày)");
  });

  test("2.2: Pagination filters before count & limit to ensure total and totalPages are accurate", async () => {
    const now = new Date();
    // Create 15 valid upcoming classes
    for (let i = 1; i <= 15; i++) {
      await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: "Cô Mai Anh",
        categoryId: category._id,
        subjectId: subject._id,
        className: `Lớp Khai Giảng ${i}`,
        classType: "PAID",
        price: 200000,
        capacity: 10,
        startDate: new Date(now.getTime() + i * 24 * 60 * 60 * 1000),
        status: "OPEN",
      });
    }

    // Create 5 past classes that must NOT affect pagination
    for (let i = 1; i <= 5; i++) {
      await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        teacherId: teacher._id,
        teacherName: "Cô Mai Anh",
        categoryId: category._id,
        subjectId: subject._id,
        className: `Lớp Quá Hạn ${i}`,
        classType: "PAID",
        price: 200000,
        capacity: 10,
        startDate: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
        status: "OPEN",
      });
    }

    // Page size 5 -> Total 15 valid classes -> totalPages = 3
    const resPage1 = await request(app).get("/api/classes?page=1&pageSize=5");
    expect(resPage1.statusCode).toBe(200);
    expect(resPage1.body.data.total).toBe(15);
    expect(resPage1.body.data.totalPages).toBe(3);
    expect(resPage1.body.data.items.length).toBe(5);

    const resPage2 = await request(app).get("/api/classes?page=2&pageSize=5");
    expect(resPage2.statusCode).toBe(200);
    expect(resPage2.body.data.items.length).toBe(5);

    const resPage3 = await request(app).get("/api/classes?page=3&pageSize=5");
    expect(resPage3.statusCode).toBe(200);
    expect(resPage3.body.data.items.length).toBe(5);

    // Verify no overlap across pages
    const idsPage1 = resPage1.body.data.items.map((c) => c._id);
    const idsPage2 = resPage2.body.data.items.map((c) => c._id);
    const idsPage3 = resPage3.body.data.items.map((c) => c._id);
    expect(idsPage1.some((id) => idsPage2.includes(id))).toBe(false);
    expect(idsPage2.some((id) => idsPage3.includes(id))).toBe(false);
  });

  // =========================================================================
  // 3. REGISTRATION & PAYMENT FLOW
  // =========================================================================

  test("3.1: Free class registration creates CONFIRMED enrollment immediately without payment intent", async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const freeClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Miễn Phí",
      classType: "FREE",
      price: 0,
      capacity: 30,
      startDate: futureDate,
      status: "OPEN",
    });

    const res = await request(app)
      .post(`/api/classes/${freeClass._id}/enrollments`)
      .set(as(student));

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enrollmentStatus).toBe("CONFIRMED");
    expect(res.body.data.paymentSource).toBe("FREE");

    // Creating payment intent for FREE class must be rejected
    const payRes = await request(app)
      .post(`/api/enrollments/${res.body.data._id}/payments`)
      .set(as(student));
    expect(payRes.statusCode).toBe(400);
  });

  test("3.2: Paid class registration reserves seat with PENDING_PAYMENT and creates payment intent", async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Luyện Thi Chuyên",
      classType: "PAID",
      price: 500000,
      capacity: 10,
      startDate: futureDate,
      status: "OPEN",
    });

    // 1. Create enrollment (reserve seat)
    const enrollRes = await request(app)
      .post(`/api/classes/${paidClass._id}/enrollments`)
      .set(as(student));

    expect(enrollRes.statusCode).toBe(201);
    expect(enrollRes.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
    expect(enrollRes.body.data.holdExpiresAt).toBeDefined();

    const enrollmentId = enrollRes.body.data._id;

    // 2. Create payment intent
    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student));

    expect(payRes.statusCode).toBe(201);
    expect(payRes.body.success).toBe(true);
    expect(payRes.body.data).toHaveProperty("orderCode");
    expect(payRes.body.data).toHaveProperty("amount");
    expect(Number(payRes.body.data.amount)).toBe(500000);
    expect(payRes.body.data).toHaveProperty("paymentStatus", "PENDING");
  });

  test("3.3: Unauthenticated registration is rejected with 401", async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Cô Mai Anh",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Toán 10 - Khách Vãng Lai",
      classType: "PAID",
      price: 200000,
      capacity: 10,
      startDate: futureDate,
      status: "OPEN",
    });

    const res = await request(app)
      .post(`/api/classes/${cls._id}/enrollments`)
      .set("x-user-id", "invalid-user-id");
    expect(res.statusCode).toBe(401);
  });
});
