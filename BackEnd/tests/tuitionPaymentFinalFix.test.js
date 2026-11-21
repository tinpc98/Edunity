const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}
process.env.ENABLE_PAYMENT_SANDBOX = "true";

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Class, Course, Category, Subject, Enrollment, Payment, User } = require("../src/models");
const paymentService = require("../src/services/paymentService");
const payosService = require("../src/services/payosService");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("EDUNITY-TUITION-PAYMENT-FINAL-FIX Verification Suite", () => {
  let studentUser;
  let teacherUser;
  let testCategory;
  let testSubject;
  let testCourse;
  let testClass;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();

    const suffix = Date.now();
    const passwordHash = hashPassword("password123");

    studentUser = await User.create({
      fullName: `Test Student ${suffix}`,
      email: `student_${suffix}@edunity.test`,
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    teacherUser = await User.create({
      fullName: `Test Teacher ${suffix}`,
      email: `teacher_${suffix}@edunity.test`,
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: `Test Teacher ${suffix}`, verificationStatus: "VERIFIED" },
    });

    testCategory = await Category.create({
      name: `Toán Học ${suffix}`,
      slug: `toan-hoc-${suffix}`,
      createdBy: teacherUser._id,
      status: "ACTIVE",
    });

    testSubject = await Subject.create({
      name: `Toán 12 ${suffix}`,
      slug: `toan-12-${suffix}`,
      categoryId: testCategory._id,
      categoryName: testCategory.name,
      createdBy: teacherUser._id,
      status: "ACTIVE",
    });

    testCourse = await Course.create({
      title: `Toán 12 Hotfix ${suffix}`,
      slug: `toan-12-hotfix-${suffix}`,
      categoryId: testCategory._id,
      categoryName: testCategory.name,
      subjectId: testSubject._id,
      subjectName: testSubject.name,
      gradeLevel: "GRADE_12",
      status: "ACTIVE",
      createdBy: teacherUser._id,
    });

    const now = new Date();
    testClass = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Test Teacher",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      gradeLevel: "GRADE_12",
      className: `Lớp Test 10 Phút TTL ${suffix}`,
      classType: "PAID",
      price: 3000,
      capacity: 20,
      enrolledCount: 0,
      enrollmentStart: new Date(now.getTime() - 3600000),
      enrollmentEnd: new Date(now.getTime() + 86400000),
      startDate: new Date(now.getTime() + 7 * 86400000),
      endDate: new Date(now.getTime() + 30 * 86400000),
      schedule: [
        { dayOfWeek: 1, startTime: "19:30", endTime: "21:00" },
        { dayOfWeek: 3, startTime: "19:30", endTime: "21:00" },
      ],
      status: "OPEN",
    });
  });

  afterAll(async () => {
    if (studentUser) await User.deleteOne({ _id: studentUser._id });
    if (teacherUser) await User.deleteOne({ _id: teacherUser._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testSubject) await Subject.deleteOne({ _id: testSubject._id });
    if (testCourse) await Course.deleteOne({ _id: testCourse._id });
    if (testClass) {
      await Enrollment.deleteMany({ classId: testClass._id });
      await Payment.deleteMany({ payerUserId: studentUser._id });
      await Class.deleteOne({ _id: testClass._id });
    }
    await disconnectDB();
  });

  test("1. New reservation sets holdExpiresAt to exactly 10 minutes (600s)", async () => {
    const res = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(studentUser))
      .expect(201);

    expect(res.body.success).toBe(true);
    const enr = res.body.data;
    expect(enr.enrollmentStatus).toBe("PENDING_PAYMENT");
    expect(enr.holdExpiresAt).toBeDefined();

    const createdAtMs = new Date(enr.createdAt).getTime();
    const holdMs = new Date(enr.holdExpiresAt).getTime();
    const diffSeconds = Math.round((holdMs - createdAtMs) / 1000);

    // Exactly 600 seconds (10 minutes) with a ±2 second tolerance
    expect(diffSeconds).toBeGreaterThanOrEqual(598);
    expect(diffSeconds).toBeLessThanOrEqual(602);
  });

  test("2. Payment intent inherits exactly the 10-minute holdExpiresAt", async () => {
    const enr = await Enrollment.findOne({ studentId: studentUser._id, classId: testClass._id });
    expect(enr).toBeTruthy();

    const res = await request(app)
      .post(`/api/enrollments/${enr._id}/payments`)
      .set(as(studentUser))
      .expect(201);

    expect(res.body.success).toBe(true);
    const pmt = res.body.data;
    expect(pmt.purpose).toBe("TUITION");
    expect(pmt.paymentStatus).toBe("PENDING");
    expect(pmt.expiredAt).toBeDefined();

    const enrHoldMs = new Date(enr.holdExpiresAt).getTime();
    const pmtExpiredMs = new Date(pmt.expiredAt).getTime();
    expect(pmtExpiredMs).toBe(enrHoldMs);
  });

  test("3. GET /api/me/enrollments?include=class returns schedule array", async () => {
    const res = await request(app)
      .get("/api/me/enrollments?include=class")
      .set(as(studentUser))
      .expect(200);

    expect(res.body.success).toBe(true);
    const items = res.body.data.items;
    const match = items.find((i) => i.classId === testClass._id.toString() || i.class?.id === testClass._id.toString());
    expect(match).toBeTruthy();
    expect(match.class).toBeDefined();
    expect(Array.isArray(match.class.schedule)).toBe(true);
    expect(match.class.schedule.length).toBe(2);
    expect(match.class.schedule[0].dayOfWeek).toBe(1);
    expect(match.class.schedule[0].startTime).toBe("19:30");
  });

  test("4. Active polling sync: getPaymentById recovers and confirms payment when payOS reports PAID", async () => {
    const enr = await Enrollment.findOne({ studentId: studentUser._id, classId: testClass._id });
    const pmt = await Payment.findOne({ enrollmentId: enr._id });
    expect(pmt).toBeTruthy();

    // Ensure payment provider is PAYOS for this test
    await Payment.updateOne({ _id: pmt._id }, { $set: { provider: "PAYOS", channelKey: "TUITION" } });

    // Mock payosService.isPayosEnabled and getPaymentLinkInfo
    const origIsEnabled = payosService.isPayosEnabled;
    const origGetLink = payosService.getPaymentLinkInfo;
    const origSign = payosService.signWebhookDataForChannel;

    payosService.isPayosEnabled = () => true;
    payosService.signWebhookDataForChannel = async () => "mock_test_signature";
    const origVerifyWebhook = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_channel, body) => body.data;
    payosService.getPaymentLinkInfo = async () => ({
      id: pmt.paymentLinkId || "plink_test_mock",
      orderCode: pmt.orderCode,
      amount: 3000,
      amountPaid: 3000,
      status: "PAID",
      transactions: [
        {
          accountNumber: "4008999999",
          amount: 3000,
          description: `EDUNITY HP ${pmt.orderCode}`,
          reference: `FT_TEST_${pmt.orderCode}`,
          transactionDateTime: new Date().toISOString(),
          counterAccountName: "TEST COUNTER",
        },
      ],
    });

    try {
      const pollRes = await request(app)
        .get(`/api/payments/${pmt._id}`)
        .set(as(studentUser))
        .expect(200);

      expect(pollRes.body.success).toBe(true);
      expect(pollRes.body.data.paymentStatus).toBe("COMPLETED");
      expect(pollRes.body.data.enrollmentStatus).toBe("CONFIRMED");

      // Verify DB was updated atomically
      const updatedPmt = await Payment.findById(pmt._id);
      expect(updatedPmt.paymentStatus).toBe("COMPLETED");
      const updatedEnr = await Enrollment.findById(enr._id);
      expect(updatedEnr.enrollmentStatus).toBe("CONFIRMED");
    } finally {
      payosService.isPayosEnabled = origIsEnabled;
      payosService.getPaymentLinkInfo = origGetLink;
      payosService.signWebhookDataForChannel = origSign;
      payosService.verifyWebhookPayload = origVerifyWebhook;
    }
  });

  test("5. Legacy/already EXPIRED enrollments are NOT auto-mutated by polling without authorization", async () => {
    // Create an expired enrollment and payment
    const expiredEnr = await Enrollment.create({
      classId: testClass._id,
      courseId: testCourse._id,
      teacherId: teacherUser._id,
      studentId: studentUser._id,
      enrollmentStatus: "EXPIRED",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: 3000,
      enrolledAt: new Date(Date.now() - 3600000),
      holdExpiresAt: new Date(Date.now() - 1800000),
    });

    const expiredPmt = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      enrollmentId: expiredEnr._id,
      payerUserId: studentUser._id,
      gateway: "PAYOS",
      provider: "PAYOS",
      gatewayReference: `PAYOS-T-${Date.now()}`,
      orderCode: 999999999,
      amount: 3000,
      paymentStatus: "PENDING",
      expiredAt: new Date(Date.now() - 1800000),
    });

    const origIsEnabled = payosService.isPayosEnabled;
    const origGetLink = payosService.getPaymentLinkInfo;
    payosService.isPayosEnabled = () => true;
    payosService.getPaymentLinkInfo = async () => ({
      id: "plink_expired_mock",
      orderCode: 999999999,
      amount: 3000,
      amountPaid: 3000,
      status: "PAID",
      transactions: [{ reference: "FT_EXPIRED_MOCK", amount: 3000 }],
    });

    try {
      const pollRes = await request(app)
        .get(`/api/payments/${expiredPmt._id}`)
        .set(as(studentUser))
        .expect(200);

      // Remains PENDING on payment and EXPIRED on enrollment because authorization is required
      expect(pollRes.body.data.paymentStatus).toBe("PENDING");
      expect(pollRes.body.data.enrollmentStatus).toBe("EXPIRED");
    } finally {
      payosService.isPayosEnabled = origIsEnabled;
      payosService.getPaymentLinkInfo = origGetLink;
      await Payment.deleteOne({ _id: expiredPmt._id });
      await Enrollment.deleteOne({ _id: expiredEnr._id });
    }
  });
});
