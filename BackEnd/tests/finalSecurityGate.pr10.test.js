const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Payment,
  TeacherEarning,
  Payout,
  TeacherSettlement,
  BankProofRegistry,
} = require("../src/models");
const payoutService = require("../src/services/payoutService");
const settlementService = require("../src/services/settlementService");
const clock = require("../src/utils/clock");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { toDec } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

// UTC representations for Monday and Friday times in UTC+7 (Vietnam Time)
// Vietnam is UTC+7.
// Monday 07:59:59 UTC+7 = Monday 00:59:59 UTC
const MONDAY_0759 = "2026-11-09T00:59:59.000Z";
// Monday 08:00:00 UTC+7 = Monday 01:00:00 UTC
const MONDAY_0800 = "2026-11-09T01:00:00.000Z";
// Monday 16:59:59 UTC+7 = Monday 09:59:59 UTC
const MONDAY_1659 = "2026-11-09T09:59:59.000Z";
// Monday 17:00:00 UTC+7 = Monday 10:00:00 UTC
const MONDAY_1700 = "2026-11-09T10:00:00.000Z";

// Friday 07:59:59 UTC+7 = Friday 00:59:59 UTC
const FRIDAY_0759 = "2026-11-13T00:59:59.000Z";
// Friday 08:00:00 UTC+7 = Friday 01:00:00 UTC
const FRIDAY_0800 = "2026-11-13T01:00:00.000Z";
// Friday 16:59:59 UTC+7 = Friday 09:59:59 UTC
const FRIDAY_1659 = "2026-11-13T09:59:59.000Z";
// Friday 17:00:00 UTC+7 = Friday 10:00:00 UTC
const FRIDAY_1700 = "2026-11-13T10:00:00.000Z";

describe("PR10 Final Security Gate: Business Clock Hardening, Settlement Hold & Four-Eyes Audit", () => {
  let admin1, admin1Token;
  let admin2, admin2Token;
  let teacher, teacherToken;
  let student, studentToken;
  let category, subject, course, classDoc, enrollmentDoc, paymentDoc;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
    await BankProofRegistry.init();
    await Payout.init();
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  }, 30000);

  beforeEach(async () => {
    await clearDB();
    clock.clearTestTime();
    delete process.env.EDUNITY_RUNNING_SERVER;

    process.env.NODE_ENV = "test";
    process.env.PAYOS_ENABLED = "false";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const passwordHash = await hashPassword("Password123!");

    admin1 = await User.create({
      email: "admin1.gate@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Approver 1",
      phone: "0901000031",
      status: "ACTIVE",
    });
    admin1Token = signAccessToken(admin1);

    admin2 = await User.create({
      email: "admin2.gate@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Verifier 2",
      phone: "0901000032",
      status: "ACTIVE",
    });
    admin2Token = signAccessToken(admin2);

    teacher = await User.create({
      email: "teacher.gate@edunity.test",
      passwordHash,
      role: "TEACHER",
      fullName: "Teacher Gate",
      phone: "0902000031",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Teacher Gate",
        status: "APPROVED",
        bankAccount: {
          bankName: "Vietcombank",
          accountNumber: "9988776655",
          accountHolderName: "TEACHER GATE",
        },
      },
    });
    teacherToken = signAccessToken(teacher);

    student = await User.create({
      email: "student.gate@edunity.test",
      passwordHash,
      role: "STUDENT",
      fullName: "Student Gate",
      phone: "0903000031",
      status: "ACTIVE",
    });
    studentToken = signAccessToken(student);

    category = await Category.create({
      name: "Gate Category",
      slug: "gate-cat",
      description: "Gate Testing Category",
      gradeLevel: "12",
      createdBy: admin1._id,
    });

    subject = await Subject.create({
      name: "Gate Subject",
      slug: "gate-sub",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin1._id,
    });

    course = await Course.create({
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      title: "Gate Course",
      slug: `gate-course-${Date.now()}`,
      price: toDec(1000000),
      status: "ACTIVE",
      createdBy: admin1._id,
    });

    classDoc = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      categoryId: category._id,
      subjectId: subject._id,
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      className: "Gate Hardening Class",
      classType: "PAID",
      price: toDec(1000000),
      capacity: 20,
      enrolledCount: 1,
      status: "COMPLETED",
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: new Date(Date.now() - 10 * 86400000),
      schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "10:00" }],
    });

    enrollmentDoc = await Enrollment.create({
      classId: classDoc._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: toDec(1000000),
      amountPaidViaPayment: toDec(1000000),
      orderCode: 9003001,
    });

    paymentDoc = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      provider: "PAYOS",
      enrollmentId: enrollmentDoc._id,
      payerUserId: student._id,
      userId: student._id,
      gateway: "payos",
      gatewayReference: "GW_GATE_9003001",
      orderCode: 9003001,
      paymentType: "TUITION",
      amount: toDec(1000000),
      tuitionAmount: toDec(1000000),
      paymentStatus: "COMPLETED",
      gatewayStatus: "PAID",
      paidAt: new Date(),
    });
  });

  afterEach(() => {
    clock.clearTestTime();
    delete process.env.EDUNITY_RUNNING_SERVER;
  });

  const sampleBank = {
    bankName: "Vietcombank",
    accountNumber: "9988776655",
    accountHolderName: "TEACHER GATE",
  };

  async function seedAvailableEarning() {
    return TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollmentDoc._id,
      classId: classDoc._id,
      grossAmount: toDec(1000000),
      commissionAmount: toDec(100000),
      netAmount: toDec(900000),
      status: "AVAILABLE",
      settlementHoldRequired: true,
    });
  }

  // =========================================================================
  // 1. AUDIT x-test-now: Monday Withdrawal Window
  // =========================================================================
  describe("Audit 1: Monday Withdrawal Window Boundaries (08:00 - 17:00)", () => {
    it("1.1 Rejects withdrawal request at Monday 07:59:59 (WITHDRAWAL_WINDOW_CLOSED, 400)", async () => {
      await seedAvailableEarning();
      clock.setTestTime(MONDAY_0759);

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    it("1.2 Accepts withdrawal request at Monday 08:00:00 (201 PENDING)", async () => {
      await seedAvailableEarning();
      clock.setTestTime(MONDAY_0800);

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(sampleBank);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PENDING");
    });

    it("1.3 Accepts withdrawal request at Monday 16:59:59 (201 PENDING)", async () => {
      await seedAvailableEarning();
      clock.setTestTime(MONDAY_1659);

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(sampleBank);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PENDING");
    });

    it("1.4 Rejects withdrawal request at Monday 17:00:00 (WITHDRAWAL_WINDOW_CLOSED, 400)", async () => {
      await seedAvailableEarning();
      clock.setTestTime(MONDAY_1700);

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });
  });

  // =========================================================================
  // 1. AUDIT x-test-now: Friday Payout Window
  // =========================================================================
  describe("Audit 1: Friday Payout Window Boundaries (08:00 - 17:00)", () => {
    async function seedApprovedPayout() {
      await seedAvailableEarning();
      clock.setTestTime(MONDAY_0800);
      const payout = await payoutService.requestPayout(teacher._id, sampleBank, { now: new Date(MONDAY_0800) });
      await payoutService.approvePayout(admin1._id, payout._id);
      return payout;
    }

    it("1.5 Rejects Payout completion at Friday 07:59:59 (PAYOUT_EXECUTION_WINDOW_CLOSED, 400)", async () => {
      const payout = await seedApprovedPayout();
      clock.setTestTime(FRIDAY_0759);

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ bankReference: "FT_FRIDAY_0759" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });

    it("1.6 Accepts Payout completion at Friday 08:00:00 (200 SUCCESS)", async () => {
      const payout = await seedApprovedPayout();
      clock.setTestTime(FRIDAY_0800);

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ bankReference: "FT_FRIDAY_0800" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("1.7 Accepts Payout completion at Friday 16:59:59 (200 SUCCESS)", async () => {
      const payout = await seedApprovedPayout();
      clock.setTestTime(FRIDAY_1659);

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ bankReference: "FT_FRIDAY_1659" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("1.8 Rejects Payout completion at Friday 17:00:00 (PAYOUT_EXECUTION_WINDOW_CLOSED, 400)", async () => {
      const payout = await seedApprovedPayout();
      clock.setTestTime(FRIDAY_1700);

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ bankReference: "FT_FRIDAY_1700" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });
  });

  // =========================================================================
  // 1. AUDIT x-test-now: Prevention of Public HTTP Client Time Manipulation
  // =========================================================================
  describe("Audit 1: Elimination of Client-Controlled x-test-now HTTP Header", () => {
    it("1.9 On a running server (Staging/Production mode), x-test-now header is stripped and ignored", async () => {
      await seedAvailableEarning();
      // Simulate running server environment (as set by server.js)
      process.env.EDUNITY_RUNNING_SERVER = "true";

      // Attempt to send fake Monday 08:00 header to bypass window
      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_0800)
        .send(sampleBank);

      // System uses real server clock, NOT the header
      // Today is Tuesday, so real clock rejects with WITHDRAWAL_WINDOW_CLOSED
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    it("1.10 When running server flag is set, clock.setTestTime is strictly rejected", async () => {
      process.env.EDUNITY_RUNNING_SERVER = "true";
      expect(() => {
        clock.setTestTime(MONDAY_0800);
      }).toThrow(/Security Violation/i);
    });
  });

  // =========================================================================
  // 2. AUDIT settlementHoldRequired: Fail-Closed & 7-Day Hold
  // =========================================================================
  describe("Audit 2: settlementHoldRequired Schema Default & 7-Day Hold Enforcement", () => {
    it("2.1 Newly created TeacherEarning defaults to settlementHoldRequired: true in Schema", async () => {
      const earning = await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollmentDoc._id,
        classId: classDoc._id,
        grossAmount: toDec(1000000),
        commissionAmount: toDec(100000),
        netAmount: toDec(900000),
      });

      expect(earning.settlementHoldRequired).toBe(true);
    });

    it("2.2 TeacherEarning with missing/undefined settlementHoldRequired fails closed (Schema defaults to true)", async () => {
      const earning = await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollmentDoc._id,
        classId: classDoc._id,
        grossAmount: toDec(1000000),
        commissionAmount: toDec(100000),
        netAmount: toDec(900000),
      });

      // Simulate legacy record by unsetting field directly in raw MongoDB
      await TeacherEarning.collection.updateOne({ _id: earning._id }, { $unset: { settlementHoldRequired: 1 } });

      const reloaded = await TeacherEarning.findById(earning._id);
      // Mongoose schema default ensures it fails closed as true
      expect(reloaded.settlementHoldRequired).toBe(true);

      // Evaluating settlement must fail-closed and enforce hold (blocked because class was completed recently or missing session terminal details)
      const res = await settlementService.evaluateEarningSettlement(earning._id);
      expect(res.status).toBe("PENDING");
    });

    it("2.3 Earning with settlementHoldRequired: true requires full 7 days before becoming AVAILABLE", async () => {
      const { Session } = require("../src/models");
      await Session.create({
        classId: classDoc._id,
        className: classDoc.className,
        teacherId: teacher._id,
        title: "Session Final Gate",
        startDatetime: new Date("2026-10-31T01:00:00.000Z"),
        endDatetime: new Date("2026-10-31T03:00:00.000Z"),
        actualEndAt: new Date("2026-10-31T03:00:00.000Z"),
        status: "COMPLETED",
        roomState: "ENDED",
      });

      const earning = await TeacherEarning.create({
        teacherId: teacher._id,
        enrollmentId: enrollmentDoc._id,
        classId: classDoc._id,
        grossAmount: toDec(1000000),
        commissionAmount: toDec(100000),
        netAmount: toDec(900000),
        settlementHoldRequired: true,
        settlementEligibleSince: new Date("2026-11-01T00:00:00.000Z"),
        availableAt: new Date("2026-11-08T00:00:00.000Z"),
      });

      // At Day 6 (2026-11-07): Hold has NOT matured
      const day6 = new Date("2026-11-07T00:00:00.000Z");
      const res6 = await settlementService.evaluateEarningSettlement(earning._id, { now: day6 });
      expect(res6.eligible).toBe(false);
      expect(res6.status).toBe("PENDING");

      // At Day 8 (2026-11-09): Hold matured -> eligible
      const day8 = new Date("2026-11-09T00:00:00.000Z");
      const res8 = await settlementService.evaluateEarningSettlement(earning._id, { now: day8 });
      expect(res8.eligible).toBe(true);
      expect(res8.status).toBe("AVAILABLE");
    });
  });
});
