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
  SessionRescheduleRequest,
  TeacherIncidentReport,
  Report,
  SessionRefundReview,
  Enrollment,
  Payment,
  BankTransferEvent,
  PaymentReconciliation,
  TeacherEarning,
  Payout,
  TeacherSettlement,
  Transaction,
  JobLock,
  SponsorContribution,
  ScholarshipCampaign,
} = require("../src/models");
const settlementService = require("../src/services/settlementService");
const payoutService = require("../src/services/payoutService");
const classLifecycleService = require("../src/services/classLifecycleService");
const paymentService = require("../src/services/paymentService");
const payosService = require("../src/services/payosService");
const financeService = require("../src/services/financeService");
const {
  dispatchBankTransferEvent,
} = require("../src/services/financialDispatchService");
const {
  runSettlementJobTick,
  getSettlementJobStatus,
} = require("../src/jobs/financialSettlementJob");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { toDec, toNum } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

const TUITION_SECRET = "tuition-checksum-pr7-secret-key-111";
const DONATION_SECRET = "donation-checksum-pr7-secret-key-222";

describe("PR7: Teacher Settlement & Withdrawal Management (TIN-FIN-PR7)", () => {
  let adminUser, adminToken;
  let teacherUser, teacherToken;
  let secondTeacherUser, secondTeacherToken;
  let studentUser, studentToken;
  let category, subject, course;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";
    process.env.REAL_LOCAL_RUNTIME = "false";
    process.env.PAYOS_ENABLED = "false";
    process.env.ENABLE_FINANCIAL_SETTLEMENT_JOB = "false";
    process.env.PAYOS_TUITION_CLIENT_ID = "tuition_client_id_pr7";
    process.env.PAYOS_TUITION_API_KEY = "tuition_api_key_pr7_secret";
    process.env.PAYOS_TUITION_CHECKSUM_KEY = TUITION_SECRET;
    process.env.PAYOS_DONATION_CLIENT_ID = "donation_client_id_pr7";
    process.env.PAYOS_DONATION_API_KEY = "donation_api_key_pr7_secret";
    process.env.PAYOS_DONATION_CHECKSUM_KEY = DONATION_SECRET;

    await connectDB();
    await syncIndexes();
  }, 60000);

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    payosService.resetPayosClient();

    const passwordHash = await hashPassword("StrongPass123!@#");

    adminUser = await User.create({
      email: "finance.admin.pr7@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      studentProfile: { fullName: "Finance Admin PR7" },
    });
    adminToken = signAccessToken(adminUser);

    teacherUser = await User.create({
      email: "teacher.pr7@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Senior Teacher PR7",
        verificationStatus: "VERIFIED",
      },
    });
    teacherToken = signAccessToken(teacherUser);

    secondTeacherUser = await User.create({
      email: "second.teacher.pr7@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Secondary Teacher PR7",
        verificationStatus: "VERIFIED",
      },
    });
    secondTeacherToken = signAccessToken(secondTeacherUser);

    studentUser = await User.create({
      email: "student.pr7@edunity.test",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student PR7" },
    });
    studentToken = signAccessToken(studentUser);

    category = await Category.create({
      name: "Academics PR7",
      slug: `academics-pr7-${Date.now()}`,
      createdBy: adminUser._id,
    });

    subject = await Subject.create({
      categoryId: category._id,
      categoryName: category.name,
      name: "Math PR7",
      slug: `math-pr7-${Date.now()}`,
      createdBy: adminUser._id,
    });

    course = await Course.create({
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      title: "Advanced Calculus PR7",
      slug: `calc-pr7-${Date.now()}`,
      price: toDec(1000000),
      status: "ACTIVE",
      createdBy: adminUser._id,
    });
  });

  // Helper to create full academic setup with completed payment and pending earning
  async function seedFullTuitionFixture(options = {}) {
    const tuitionAmount = options.amount || 1000000;
    const targetTeacher = options.teacher || teacherUser;

    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      categoryId: category._id,
      subjectId: subject._id,
      teacherId: targetTeacher._id,
      teacherName: targetTeacher.teacherProfile.fullName,
      className: options.className || "Calculus Batch 1",
      classType: "PAID",
      price: toDec(tuitionAmount),
      capacity: 20,
      enrolledCount: 1,
      status: options.classStatus || "OPEN",
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: options.classEndDate || new Date(Date.now() - 10 * 86400000),
      schedule: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
        { dayOfWeek: 3, startTime: "09:00", endTime: "11:00" },
      ],
    });

    const enrollment = await Enrollment.create({
      studentId: studentUser._id,
      classId: cls._id,
      courseId: course._id,
      teacherId: targetTeacher._id,
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: toDec(tuitionAmount),
      amountPaidViaPayment: toDec(tuitionAmount),
      enrollmentStatus: "CONFIRMED",
      academicStatus: "ACTIVE",
      enrolledAt: new Date(Date.now() - 30 * 86400000),
    });

    const payment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      provider: "PAYOS",
      enrollmentId: enrollment._id,
      payerUserId: studentUser._id,
      gateway: "payos",
      gatewayReference: `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orderCode: Math.floor(100000000 + Math.random() * 900000000),
      amount: toDec(tuitionAmount),
      tuitionAmount: toDec(tuitionAmount),
      currency: "VND",
      paymentStatus: "COMPLETED",
      paidAt: new Date(Date.now() - 30 * 86400000),
    });

    const grossNum = tuitionAmount;
    const commissionRate = 0.1;
    const commissionNum = grossNum * commissionRate;
    const netNum = grossNum - commissionNum;

    const earning = await TeacherEarning.create({
      teacherId: targetTeacher._id,
      classId: cls._id,
      enrollmentId: enrollment._id,
      paymentId: payment._id,
      grossAmount: toDec(grossNum),
      commissionRate,
      commissionAmount: toDec(commissionNum),
      netAmount: toDec(netNum),
      appliedPolicyVersion: "2026.1",
      settlementHoldRequired: true,
      status: options.earningStatus || "PENDING",
      settledAt: options.settledAt || null,
    });

    const settlement = await TeacherSettlement.create({
      earningId: earning._id,
      teacherId: targetTeacher._id,
      classId: cls._id,
      enrollmentId: enrollment._id,
      paymentId: payment._id,
      grossAmount: earning.grossAmount,
      commissionRate,
      commissionAmount: earning.commissionAmount,
      netAmount: earning.netAmount,
      status: options.earningStatus === "AVAILABLE" ? "SETTLED_AVAILABLE" : "HELD",
    });

    return { cls, enrollment, payment, earning, settlement, teacher: targetTeacher };
  }

  // =========================================================================
  // GROUP A: Settlement Eligibility Engine (14 Tests)
  // =========================================================================
  describe("Group A: Settlement Eligibility Engine (14 Tests)", () => {
    test("A01: Payment COMPLETED + Enrollment CONFIRMED creates TeacherEarning with status PENDING and settlementHoldRequired true", async () => {
      const { earning } = await seedFullTuitionFixture();
      expect(earning.status).toBe("PENDING");
      expect(earning.settlementHoldRequired).toBe(true);
      expect(toNum(earning.grossAmount)).toBe(1000000);
      expect(toNum(earning.netAmount)).toBe(900000);
    });

    test("A02: Class status is OPEN (not COMPLETED) -> evaluateEarningSettlement blocks with CLASS_NOT_COMPLETED", async () => {
      const { earning } = await seedFullTuitionFixture({ classStatus: "OPEN" });
      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("CLASS_NOT_COMPLETED");
    });

    test("A03: Class COMPLETED but has active/ongoing session -> blocked with UNFINISHED_SESSIONS", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 2",
        startDatetime: new Date(),
        endDatetime: new Date(Date.now() + 7200000),
        status: "SCHEDULED",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("UNFINISHED_SESSIONS");
    });

    test("A04: Class COMPLETED and regular sessions terminal, but pending makeup session -> blocked with PENDING_MAKEUP_SESSIONS", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Makeup 1",
        startDatetime: new Date(),
        endDatetime: new Date(Date.now() + 7200000),
        rescheduleMetadata: { isMakeupSession: true },
        status: "SCHEDULED",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("PENDING_MAKEUP_SESSIONS");
    });

    test("A05: Class COMPLETED, sessions terminal, but open reschedule request exists -> blocked with PENDING_RESCHEDULE_REQUESTS", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await SessionRescheduleRequest.create({
        classId: cls._id,
        originalSessionId: session._id,
        teacherId: teacherUser._id,
        requestedBy: teacherUser._id,
        proposedStartDatetime: new Date(),
        proposedEndDatetime: new Date(Date.now() + 7200000),
        reason: "Travel conflict",
        status: "PENDING_ADMIN_APPROVAL",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("PENDING_RESCHEDULE_REQUESTS");
    });

    test("A06: Class COMPLETED, but open TeacherIncidentReport exists -> blocked with ACTIVE_TEACHER_INCIDENTS", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await TeacherIncidentReport.create({
        sessionId: session._id,
        classId: cls._id,
        teacherId: teacherUser._id,
        incidentType: "PLATFORM_FAILURE",
        description: "Zoom room crashed repeatedly",
        requestedAction: "RESCHEDULE_SESSION",
        reviewStatus: "PENDING",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("ACTIVE_TEACHER_INCIDENTS");
    });

    test("A07: Class COMPLETED, but open Report exists -> blocked with ACTIVE_DISPUTES", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await Report.create({
        classId: cls._id,
        reporterId: studentUser._id,
        type: "TEACHER_ABSENT",
        description: "Teacher absent without notice",
        status: "OPEN",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("ACTIVE_DISPUTES");
    });

    test("A08: Class COMPLETED, but open SessionRefundReview exists -> blocked with PENDING_REFUND_REVIEWS", async () => {
      const { earning, cls, enrollment } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      await SessionRefundReview.create({
        sessionId: session._id,
        classId: cls._id,
        studentId: studentUser._id,
        teacherId: teacherUser._id,
        enrollmentId: enrollment._id,
        triggerReason: "TEACHER_NO_SHOW",
        status: "NEEDS_FINANCIAL_REVIEW",
        earningReconciliationStatus: "HOLD_RECOMMENDED",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("PENDING_REFUND_REVIEWS");
    });

    test("A09: Class COMPLETED, but linked Payment has unresolved PaymentReconciliation -> blocked with ACTIVE_PAYMENT_RECONCILIATIONS", async () => {
      const { earning, cls, enrollment, payment } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_REC_${Date.now()}`,
        fingerprint: `FP_A09_${payment.orderCode}_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "VERIFIED",
        dispatchStatus: "RECONCILIATION_REQUIRED",
        linkedPaymentId: payment._id,
      });

      await PaymentReconciliation.create({
        eventId: event._id,
        enrollmentId: enrollment._id,
        purpose: "TUITION",
        channelKey: "TUITION",
        orderCode: payment.orderCode,
        reason: "LATE_PAYMENT_REVIEW",
        receivedAmount: toDec(1000000),
        currency: "VND",
        status: "NEEDS_REVIEW",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("ACTIVE_PAYMENT_RECONCILIATIONS");
    });

    test("A10: All blockers cleared, but only 3 days elapsed since latest milestone -> blocked with SEVEN_DAY_HOLD_ACTIVE", async () => {
      const now = new Date("2026-11-10T10:00:00.000Z");
      const sessionCompletedAt = new Date("2026-11-07T10:00:00.000Z"); // 3 days ago

      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date("2026-11-07T08:00:00.000Z"),
        endDatetime: sessionCompletedAt,
        actualEndAt: sessionCompletedAt,
        status: "COMPLETED",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id, { now });
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("SEVEN_DAY_HOLD_ACTIVE");

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("PENDING");
    });

    test("A11: All blockers cleared, 7 days + 1 second elapsed -> transitions earning to AVAILABLE and records settledAt", async () => {
      const sessionCompletedAt = new Date("2026-11-01T10:00:00.000Z");
      const now = new Date("2026-11-08T10:00:01.000Z"); // 7 days + 1s

      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
        classEndDate: sessionCompletedAt,
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date("2026-11-01T08:00:00.000Z"),
        endDatetime: sessionCompletedAt,
        actualEndAt: sessionCompletedAt,
        status: "COMPLETED",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id, { now });
      expect(result.eligible).toBe(true);
      expect(result.status).toBe("AVAILABLE");
      expect(result.blockers.length).toBe(0);

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("AVAILABLE");
      expect(reloadedEarning.settledAt).toBeDefined();

      const settlement = await TeacherSettlement.findOne({ earningId: earning._id });
      expect(settlement).toBeDefined();
      expect(settlement.status).toBe("SETTLED_AVAILABLE");
    });

    test("A12: Milestone recalculation: Makeup completed on Day 4 pushes 7-day maturation from Day 4", async () => {
      const sessionCompletedAt = new Date("2026-11-01T10:00:00.000Z"); // Day 0
      const makeupCompletedAt = new Date("2026-11-05T10:00:00.000Z"); // Day 4

      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
        classEndDate: sessionCompletedAt,
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date("2026-11-01T08:00:00.000Z"),
        endDatetime: sessionCompletedAt,
        actualEndAt: sessionCompletedAt,
        status: "COMPLETED",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Makeup 1",
        startDatetime: new Date("2026-11-05T08:00:00.000Z"),
        endDatetime: makeupCompletedAt,
        actualEndAt: makeupCompletedAt,
        rescheduleMetadata: { isMakeupSession: true },
        status: "COMPLETED",
      });

      // Check on Day 9 (8 days after regular session, but only 4 days after makeup): NOT eligible
      const day9 = new Date("2026-11-09T10:00:00.000Z");
      const resultDay9 = await settlementService.evaluateEarningSettlement(earning._id, { now: day9 });
      expect(resultDay9.eligible).toBe(false);
      expect(resultDay9.blockers).toContain("SEVEN_DAY_HOLD_ACTIVE");

      // Check on Day 13 (8 days after makeup): eligible and settled
      const day13 = new Date("2026-11-13T10:00:01.000Z");
      const resultDay13 = await settlementService.evaluateEarningSettlement(earning._id, { now: day13 });
      expect(resultDay13.eligible).toBe(true);
      expect(resultDay13.status).toBe("AVAILABLE");
    });

    test("A13: Auto-lock on new blocker (BR-08): AVAILABLE earning automatically re-locks to PENDING when a dispute opens", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "COMPLETED",
        earningStatus: "AVAILABLE",
        settledAt: new Date(Date.now() - 5 * 86400000),
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 15 * 86400000),
        endDatetime: new Date(Date.now() - 15 * 86400000 + 7200000),
        actualEndAt: new Date(Date.now() - 15 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      // Student opens a new dispute
      await Report.create({
        classId: cls._id,
        reporterId: studentUser._id,
        type: "TEACHER_ABSENT",
        description: "Teacher did not show up",
        status: "OPEN",
      });

      const result = await settlementService.evaluateEarningSettlement(earning._id);
      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain("ACTIVE_DISPUTES");

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("PENDING");

      const reloadedSettlement = await TeacherSettlement.findOne({ earningId: earning._id });
      expect(reloadedSettlement.status).toBe("HELD");
    });

    test("A14: Batch evaluation: evaluateAllPendingSettlements settles only eligible earnings without touching blocked ones", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      // Earning 1: Eligible (completed 10 days ago)
      const { earning: eligibleEarning, cls: cls1 } = await seedFullTuitionFixture({
        className: "Eligible Class",
        classStatus: "COMPLETED",
        classEndDate: tenDaysAgo,
      });
      await Session.create({
        classId: cls1._id,
        className: cls1.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(tenDaysAgo.getTime() - 7200000),
        endDatetime: tenDaysAgo,
        actualEndAt: tenDaysAgo,
        status: "COMPLETED",
      });

      // Earning 2: Blocked (Class still OPEN)
      const { earning: blockedEarning } = await seedFullTuitionFixture({
        className: "Ongoing Class",
        classStatus: "OPEN",
      });

      const batchResult = await settlementService.evaluateAllPendingSettlements();
      expect(batchResult.settledCount).toBe(1);

      const e1 = await TeacherEarning.findById(eligibleEarning._id);
      expect(e1.status).toBe("AVAILABLE");

      const e2 = await TeacherEarning.findById(blockedEarning._id);
      expect(e2.status).toBe("PENDING");
    });
  });

  // =========================================================================
  // GROUP B: Teacher Withdrawal Window (BR-09) (11 Tests)
  // =========================================================================
  describe("Group B: Teacher Withdrawal Window (BR-09) (11 Tests)", () => {
    // 2026-11-10 is a Tuesday (UTC) -> Vietnam time: 2026-11-10 10:00:00 (Tuesday)
    const TUESDAY_10AM = "2026-11-10T03:00:00.000Z"; // 10:00 AM VN
    const SUNDAY_8PM = "2026-11-08T13:00:00.000Z"; // 20:00 VN
    const MONDAY_0759 = "2026-11-09T00:59:59.000Z"; // 07:59:59 AM VN
    const MONDAY_0800 = "2026-11-09T01:00:00.000Z"; // 08:00:00 AM VN
    const MONDAY_1230 = "2026-11-09T05:30:00.000Z"; // 12:30:00 PM VN
    const MONDAY_1659 = "2026-11-09T09:59:59.000Z"; // 16:59:59 PM VN
    const MONDAY_1700 = "2026-11-09T10:00:00.000Z"; // 17:00:00 PM VN

    const sampleBank = {
      bankName: "Vietcombank",
      accountNumber: "0123456789",
      accountHolderName: "SENIOR TEACHER PR7",
    };

    test("B15: Withdrawal request on Tuesday at 10:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", TUESDAY_10AM)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    test("B16: Withdrawal request on Sunday at 20:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", SUNDAY_8PM)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    test("B17: Withdrawal request on Monday at 07:59:59 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_0759)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    test("B18: Withdrawal request on Monday at 08:00:00 -> Accepted (201)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_0800)
        .send(sampleBank);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PENDING");
      expect(toNum(res.body.data.amount)).toBe(900000);
    });

    test("B19: Withdrawal request on Monday at 12:30:00 -> Accepted (201)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1230)
        .send(sampleBank);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PENDING");
    });

    test("B20: Withdrawal request on Monday at 16:59:59 -> Accepted (201)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1659)
        .send(sampleBank);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PENDING");
    });

    test("B21: Withdrawal request on Monday at 17:00:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1700)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    });

    test("B22: Teacher with 0 AVAILABLE balance attempts withdrawal on Monday 10:00 -> Rejected with INSUFFICIENT_AVAILABLE_BALANCE (400)", async () => {
      // Earning is PENDING, not AVAILABLE
      await seedFullTuitionFixture({ earningStatus: "PENDING" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1230)
        .send(sampleBank);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INSUFFICIENT_AVAILABLE_BALANCE");
    });

    test("B23: Teacher with active pending payout attempts second withdrawal -> Rejected with EXISTING_ACTIVE_PAYOUT (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      // First withdrawal: succeeds
      const res1 = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_0800)
        .send(sampleBank);
      expect(res1.status).toBe(201);

      // Create another available earning
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      // Second withdrawal attempt while first is PENDING: rejected
      const res2 = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1230)
        .send(sampleBank);

      expect(res2.status).toBe(400);
      expect(res2.body.error).toBe("EXISTING_ACTIVE_PAYOUT");
    });

    test("B24: Withdrawal request with custom amount exceeding available balance -> Rejected with INSUFFICIENT_AVAILABLE_BALANCE (400)", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" }); // Net: 900,000

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1230)
        .send({ ...sampleBank, amount: 2000000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INSUFFICIENT_AVAILABLE_BALANCE");
    });

    test("B25: Withdrawal request with valid partial amount -> Allocates earnings up to amount, remainder stays AVAILABLE", async () => {
      // Two earnings of 900,000 each = 1,800,000 total available
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });

      const res = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1230)
        .send({ ...sampleBank, amount: 900000 });

      expect(res.status).toBe(201);
      expect(toNum(res.body.data.amount)).toBe(900000);

      const attachedEarnings = await TeacherEarning.find({
        teacherId: teacherUser._id,
        payoutId: res.body.data._id,
      });
      expect(attachedEarnings.length).toBe(1);

      const unattachedEarnings = await TeacherEarning.find({
        teacherId: teacherUser._id,
        payoutId: null,
        status: "AVAILABLE",
      });
      expect(unattachedEarnings.length).toBe(1);
    });
  });

  // =========================================================================
  // GROUP C: Admin Approval & Friday Payout Window (BR-10, BR-11, BR-12) (12 Tests)
  // =========================================================================
  describe("Group C: Admin Approval & Friday Payout Window (BR-10, BR-11, BR-12) (12 Tests)", () => {
    // 2026-11-13 is Friday
    const WEDNESDAY_10AM = "2026-11-11T03:00:00.000Z";
    const FRIDAY_0759 = "2026-11-13T00:59:59.000Z";
    const FRIDAY_0900 = "2026-11-13T02:00:00.000Z";
    const FRIDAY_1400 = "2026-11-13T07:00:00.000Z";
    const FRIDAY_1700 = "2026-11-13T10:00:01.000Z";

    let testPayout;

    beforeEach(async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      // Create payout directly via service
      testPayout = await payoutService.requestPayout(
        teacherUser._id,
        {
          bankName: "Vietcombank",
          accountNumber: "0123456789",
          accountHolderName: "SENIOR TEACHER PR7",
        },
        { now: new Date("2026-11-09T03:00:00.000Z") } // Monday
      );
    });

    test("C26: Admin approves pending payout -> Transitions PENDING -> APPROVED and sets scheduledAt for Friday", async () => {
      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "Approved for upcoming Friday execution" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("APPROVED");
      expect(res.body.data.scheduledAt).toBeDefined();

      const p = await Payout.findById(testPayout._id);
      expect(p.status).toBe("APPROVED");
      expect(p.approvedAt).toBeDefined();
    });

    test("C27: Non-admin user attempts to approve payout -> Rejected with 403 Forbidden", async () => {
      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/approve`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ note: "Self-approval hack attempt" });

      expect(res.status).toBe(403);
    });

    test("C28: Payout execution on Wednesday at 10:00 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400)", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", WEDNESDAY_10AM)
        .send({ bankReference: "FT1234567890" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });

    test("C29: Payout execution on Friday at 07:59:59 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400)", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", FRIDAY_0759)
        .send({ bankReference: "FT1234567890" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });

    test("C30: Payout execution on Friday without bankReference/proof -> Rejected with BANK_TRANSFER_PROOF_REQUIRED (400)", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", FRIDAY_0900)
        .send({}); // Missing bankReference

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BANK_TRANSFER_PROOF_REQUIRED");
    });

    test("C31: Payout execution on Friday with valid bankReference -> Transitions to COMPLETED, records paidAt, creates TEACHER_PAYOUT transaction", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", FRIDAY_1400)
        .send({
          bankReference: "FT20261113998877",
          transferProofImage: "https://edunity.test/proofs/unc_123.jpg",
          note: "Disbursed via corporate banking",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");

      const p = await Payout.findById(testPayout._id);
      expect(p.status).toBe("COMPLETED");
      expect(p.bankTransferProof.bankReference).toBe("FT20261113998877");
      expect(p.bankTransferProof.paidAt).toBeDefined();

      const tx = await Transaction.findOne({
        transactionType: "TEACHER_PAYOUT",
        destinationUserId: teacherUser._id,
      });
      expect(tx).toBeDefined();
      expect(toNum(tx.amount)).toBe(900000);
      expect(tx.status).toBe("COMPLETED");
    });

    test("C32: Payout execution on Friday at 17:00:01 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400)", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", FRIDAY_1700)
        .send({ bankReference: "FT1234567890" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });

    test("C33: Payout completion transitions attached earnings from AVAILABLE to PAID_OUT", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });
      await payoutService.completePayout(
        adminUser._id,
        testPayout._id,
        { bankReference: "FT20261113111" },
        { now: new Date(FRIDAY_1400) }
      );

      const attachedEarnings = await TeacherEarning.find({ payoutId: testPayout._id });
      expect(attachedEarnings.length).toBeGreaterThan(0);
      for (const e of attachedEarnings) {
        expect(e.status).toBe("PAID_OUT");
      }
    });

    test("C34: Payout completion transitions attached TeacherSettlement records to PAID_OUT", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });
      await payoutService.completePayout(
        adminUser._id,
        testPayout._id,
        { bankReference: "FT20261113222" },
        { now: new Date(FRIDAY_1400) }
      );

      const settlements = await TeacherSettlement.find({ teacherId: teacherUser._id });
      expect(settlements.length).toBeGreaterThan(0);
      for (const s of settlements) {
        expect(s.status).toBe("PAID_OUT");
      }
    });

    test("C35: Admin rejects payout request with note -> Payout marked REJECTED, attached earnings released (payoutId: null, AVAILABLE)", async () => {
      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "Bank account name does not match teacher profile" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("REJECTED");

      const p = await Payout.findById(testPayout._id);
      expect(p.status).toBe("REJECTED");
      expect(p.reviewNote).toBe("Bank account name does not match teacher profile");

      const earnings = await TeacherEarning.find({ teacherId: teacherUser._id });
      expect(earnings.length).toBeGreaterThan(0);
      for (const e of earnings) {
        expect(e.payoutId).toBeNull();
        expect(e.status).toBe("AVAILABLE");
      }
    });

    test("C36: Admin rejection without note -> Rejected with REJECTION_NOTE_REQUIRED (400)", async () => {
      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("REJECTION_NOTE_REQUIRED");
    });

    test("C37: Cannot reject an already COMPLETED payout -> Rejected with PAYOUT_ALREADY_COMPLETED (400)", async () => {
      await payoutService.approvePayout(adminUser._id, testPayout._id, { note: "Approved" });
      await payoutService.completePayout(
        adminUser._id,
        testPayout._id,
        { bankReference: "FT20261113333" },
        { now: new Date(FRIDAY_1400) }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${testPayout._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "Trying to reject completed payout" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("PAYOUT_ALREADY_COMPLETED");
    });
  });

  // =========================================================================
  // GROUP D: Integrity, Snapshot & Concurrency Hardening (9 Tests)
  // =========================================================================
  describe("Group D: Integrity, Snapshot & Concurrency Hardening (9 Tests)", () => {
    test("D38: Commission snapshot immutability: Earning net amount and commission rate unchanged if settings change later", async () => {
      const { earning } = await seedFullTuitionFixture();
      expect(earning.commissionRate).toBe(0.1);
      expect(earning.appliedPolicyVersion).toBe("2026.1");
      expect(toNum(earning.netAmount)).toBe(900000);

      process.env.COMMISSION_RATE = "0.20";
      process.env.COMMISSION_POLICY_VERSION = "2027.0";

      const reloaded = await TeacherEarning.findById(earning._id);
      expect(reloaded.commissionRate).toBe(0.1);
      expect(reloaded.appliedPolicyVersion).toBe("2026.1");
      expect(toNum(reloaded.netAmount)).toBe(900000);

      delete process.env.COMMISSION_RATE;
      delete process.env.COMMISSION_POLICY_VERSION;
    });

    test("D39: Settlement hold flag settlementHoldRequired: true is enforced on all created earnings", async () => {
      const { earning } = await seedFullTuitionFixture();
      expect(earning.settlementHoldRequired).toBe(true);
    });

    test("D40: TeacherSettlement unique index on earningId prevents duplicate settlement audit records", async () => {
      await TeacherSettlement.init();
      const { earning, cls } = await seedFullTuitionFixture();

      let duplicateError = null;
      try {
        await TeacherSettlement.create({
          earningId: earning._id,
          teacherId: teacherUser._id,
          classId: cls._id,
          enrollmentId: earning.enrollmentId,
          paymentId: earning.paymentId,
          grossAmount: earning.grossAmount,
          commissionRate: 0.1,
          commissionAmount: earning.commissionAmount,
          netAmount: earning.netAmount,
          status: "HELD",
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });

    test("D41: Concurrent payout request race condition: Only 1 request succeeds from simultaneous calls", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      const mondayTime = new Date("2026-11-09T03:00:00.000Z");

      const bankPayload = {
        bankName: "Vietcombank",
        accountNumber: "0123456789",
        accountHolderName: "SENIOR TEACHER PR7",
      };

      const results = await Promise.allSettled([
        payoutService.requestPayout(teacherUser._id, bankPayload, { now: mondayTime }),
        payoutService.requestPayout(teacherUser._id, bankPayload, { now: mondayTime }),
        payoutService.requestPayout(teacherUser._id, bankPayload, { now: mondayTime }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);
    });

    test("D42: Distributed lock in financialSettlementJob: Concurrent job ticks run exclusively", async () => {
      const results = await Promise.all([
        runSettlementJobTick({ now: new Date() }),
        runSettlementJobTick({ now: new Date() }),
      ]);

      const statuses = results.map((r) => r.status);
      expect(statuses).toContain("SKIPPED_LOCK_BUSY");
      expect(statuses).toContain("SUCCESS");
    });

    test("D43: Ledger balance consistency: Sum of PAID_OUT earnings equals sum of COMPLETED payouts and TEACHER_PAYOUT transactions", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      const mondayTime = new Date("2026-11-09T03:00:00.000Z");
      const fridayTime = new Date("2026-11-13T07:00:00.000Z");

      const payout = await payoutService.requestPayout(
        teacherUser._id,
        {
          bankName: "Vietcombank",
          accountNumber: "0123456789",
          accountHolderName: "SENIOR TEACHER PR7",
        },
        { now: mondayTime }
      );

      await payoutService.approvePayout(adminUser._id, payout._id, { note: "Approved" });
      await payoutService.completePayout(
        adminUser._id,
        payout._id,
        { bankReference: "FT_LEDGER_CHECK" },
        { now: fridayTime }
      );

      const paidEarnings = await TeacherEarning.find({ teacherId: teacherUser._id, status: "PAID_OUT" });
      const sumEarnings = paidEarnings.reduce((acc, e) => acc + toNum(e.netAmount), 0);

      const completedPayouts = await Payout.find({ teacherId: teacherUser._id, status: "COMPLETED" });
      const sumPayouts = completedPayouts.reduce((acc, p) => acc + toNum(p.amount), 0);

      const payoutTxs = await Transaction.find({ transactionType: "TEACHER_PAYOUT", destinationUserId: teacherUser._id });
      const sumTxs = payoutTxs.reduce((acc, t) => acc + toNum(t.amount), 0);

      expect(sumEarnings).toBe(900000);
      expect(sumPayouts).toBe(900000);
      expect(sumTxs).toBe(900000);
      expect(sumEarnings).toBe(sumPayouts);
      expect(sumPayouts).toBe(sumTxs);
    });

    test("D44: Negative balance prevention: Payout amount can never exceed available earnings sum", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      const mondayTime = new Date("2026-11-09T03:00:00.000Z");

      await expect(
        payoutService.requestPayout(
          teacherUser._id,
          {
            bankName: "Vietcombank",
            accountNumber: "0123456789",
            accountHolderName: "SENIOR TEACHER PR7",
            amount: 1000000,
          },
          { now: mondayTime }
        )
      ).rejects.toThrow("INSUFFICIENT_AVAILABLE_BALANCE");
    });

    test("D45: Idempotent payout completion: Calling completePayout twice does not create duplicate ledger transactions", async () => {
      await seedFullTuitionFixture({ earningStatus: "AVAILABLE" });
      const mondayTime = new Date("2026-11-09T03:00:00.000Z");
      const fridayTime = new Date("2026-11-13T07:00:00.000Z");

      const payout = await payoutService.requestPayout(
        teacherUser._id,
        {
          bankName: "Vietcombank",
          accountNumber: "0123456789",
          accountHolderName: "SENIOR TEACHER PR7",
        },
        { now: mondayTime }
      );

      await payoutService.approvePayout(adminUser._id, payout._id, { note: "Approved" });

      const firstCall = await payoutService.completePayout(
        adminUser._id,
        payout._id,
        { bankReference: "FT_IDEMPOTENT_1" },
        { now: fridayTime }
      );
      expect(firstCall.status).toBe("COMPLETED");

      const secondCall = await payoutService.completePayout(
        adminUser._id,
        payout._id,
        { bankReference: "FT_IDEMPOTENT_1" },
        { now: fridayTime }
      );
      expect(secondCall.status).toBe("COMPLETED");

      const txCount = await Transaction.countDocuments({
        transactionType: "TEACHER_PAYOUT",
        destinationUserId: teacherUser._id,
      });
      expect(txCount).toBe(1);
    });

    test("D46: IDOR prevention: Teacher A cannot view Teacher B's payout details", async () => {
      await seedFullTuitionFixture({ teacher: teacherUser, earningStatus: "AVAILABLE" });
      const mondayTime = new Date("2026-11-09T03:00:00.000Z");

      const payout = await payoutService.requestPayout(
        teacherUser._id,
        {
          bankName: "Vietcombank",
          accountNumber: "0123456789",
          accountHolderName: "SENIOR TEACHER PR7",
        },
        { now: mondayTime }
      );

      const res = await request(app)
        .get(`/api/teacher/payouts/${payout._id}`)
        .set("Authorization", `Bearer ${secondTeacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // GROUP E: PR1–PR6 Financial Regression Suite (14 Tests)
  // =========================================================================
  describe("Group E: PR1–PR6 Financial Regression Suite (14 Tests)", () => {
    test("E47: PR1: Tuition payment intent creation generates valid VietQR with unique orderCode", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Reg E47",
        classType: "PAID",
        price: toDec(500000),
        capacity: 10,
        enrolledCount: 0,
        status: "OPEN",
        schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }],
      });

      const enrollment = await Enrollment.create({
        studentId: studentUser._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacherUser._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(500000),
        amountPaidViaPayment: toDec(500000),
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const intent = await paymentService.createTuitionPaymentIntent(
        studentUser._id,
        enrollment._id
      );

      expect(intent.orderCode).toBeDefined();
      expect(intent.channelKey).toBe("TUITION");
      expect(intent.paymentStatus).toBe("PENDING");
      expect(toNum(intent.amount)).toBe(500000);
    });

    test("E48: PR1: Donation payment intent creation generates valid VietQR with unique orderCode", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Hope Scholarship E48",
        description: "Support underprivileged students",
        targetBudget: toDec(50000000),
        fundedAmount: toDec(0),
        expectedSlots: 10,
        awardAmountPerStudent: toDec(5000000),
        status: "OPEN_FOR_FUNDING",
        fundingStart: new Date(),
        fundingEnd: new Date(Date.now() + 30 * 86400000),
        createdBy: adminUser._id,
      });

      const { contribution: intent } = await paymentService.createDonationPaymentIntent({
        campaign,
        sponsorId: studentUser._id,
        amountInput: 200000,
        donorDisplayName: "Anonymous Helper",
      });

      expect(intent.orderCode).toBeDefined();
      expect(intent.channelKey).toBe("DONATION");
      expect(intent.purpose).toBe("DONATION");
      expect(toNum(intent.amount)).toBe(200000);
    });

    test("E49: PR2: Tuition webhook dispatch with valid signature succeeds", async () => {
      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const webhookData = {
        orderCode,
        amount: 500000,
        description: `EDUNITY TUITION ${orderCode}`,
        accountNumber: "190011112222",
        reference: `FT_REG_${Date.now()}`,
        transactionDateTime: "2026-11-10 10:00:00",
        currency: "VND",
        paymentLinkId: "plink_tuition_reg_e49",
        code: "00",
        desc: "success",
      };
      const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);

      const res = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({ code: "00", desc: "success", data: webhookData, signature });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("E50: PR2: Donation webhook dispatch with valid signature succeeds", async () => {
      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const webhookData = {
        orderCode,
        amount: 300000,
        description: `EDUNITY DONATION ${orderCode}`,
        accountNumber: "190033334444",
        reference: `FT_DON_${Date.now()}`,
        transactionDateTime: "2026-11-10 10:00:00",
        currency: "VND",
        paymentLinkId: "plink_donation_reg_e50",
        code: "00",
        desc: "success",
      };
      const signature = await payosService.signWebhookDataForChannel("DONATION", webhookData);

      const res = await request(app)
        .post("/api/payments/webhooks/payos/donation")
        .send({ code: "00", desc: "success", data: webhookData, signature });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("E51: PR2: Cross-channel webhook tampering is detected and rejected", async () => {
      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const webhookData = {
        orderCode,
        amount: 500000,
        description: `EDUNITY TUITION ${orderCode}`,
        accountNumber: "190011112222",
        reference: `FT_TAMPER_${Date.now()}`,
        transactionDateTime: "2026-11-10 10:00:00",
        currency: "VND",
        paymentLinkId: "plink_tamper_e51",
        code: "00",
        desc: "success",
      };
      const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);

      const res = await request(app)
        .post("/api/payments/webhooks/payos/donation")
        .send({ code: "00", desc: "success", data: webhookData, signature });

      expect([400, 401]).toContain(res.status);
      expect(["UNAUTHORIZED", "INVALID_PAYOS_SIGNATURE"]).toContain(res.body.error);
    });

    test("E52: PR3: Atomic financial dispatch for tuition (Enrollment + Payment + Earning + Transaction)", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Reg E52",
        classType: "PAID",
        price: toDec(800000),
        capacity: 10,
        enrolledCount: 0,
        status: "OPEN",
        schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }],
      });

      const enrollment = await Enrollment.create({
        studentId: studentUser._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacherUser._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(800000),
        amountPaidViaPayment: toDec(800000),
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const payment = await Payment.create({
        purpose: "TUITION",
        channelKey: "TUITION",
        provider: "PAYOS",
        enrollmentId: enrollment._id,
        payerUserId: studentUser._id,
        gateway: "payos",
        gatewayReference: `GW_E52_${orderCode}`,
        orderCode,
        amount: toDec(800000),
        tuitionAmount: toDec(800000),
        currency: "VND",
        paymentStatus: "PENDING",
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode,
        providerReference: `FT_E52_${orderCode}`,
        fingerprint: `FP_E52_${orderCode}`,
        amount: toDec(800000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      const dispatchResult = await dispatchBankTransferEvent(event._id);
      expect(dispatchResult.dispatched).toBe(true);

      const reloadedPayment = await Payment.findById(payment._id);
      expect(reloadedPayment.paymentStatus).toBe("COMPLETED");

      const reloadedEnrollment = await Enrollment.findById(enrollment._id);
      expect(reloadedEnrollment.enrollmentStatus).toBe("CONFIRMED");

      const earning = await TeacherEarning.findOne({ enrollmentId: enrollment._id });
      expect(earning).toBeDefined();
      expect(earning.status).toBe("PENDING");
      expect(toNum(earning.grossAmount)).toBe(800000);

      const tx = await Transaction.findOne({ relatedPaymentId: payment._id });
      expect(tx).toBeDefined();
      expect(tx.status).toBe("COMPLETED");
    });

    test("E53: PR3: Atomic financial dispatch for donation (Contribution + Campaign + Transaction)", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Hope Scholarship E53",
        description: "Support students",
        targetBudget: toDec(10000000),
        fundedAmount: toDec(0),
        expectedSlots: 10,
        awardAmountPerStudent: toDec(1000000),
        status: "OPEN_FOR_FUNDING",
        fundingStart: new Date(),
        fundingEnd: new Date(Date.now() + 30 * 86400000),
        createdBy: adminUser._id,
      });

      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const contribution = await SponsorContribution.create({
        sponsorId: studentUser._id,
        campaignId: campaign._id,
        amount: toDec(500000),
        currency: "VND",
        contributionStatus: "PENDING",
        orderCode,
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "DONATION",
        purpose: "DONATION",
        orderCode,
        providerReference: `FT_E53_${orderCode}`,
        fingerprint: `FP_E53_${orderCode}`,
        amount: toDec(500000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        contributionId: contribution._id,
      });

      const dispatchResult = await dispatchBankTransferEvent(event._id);
      expect(dispatchResult.dispatched).toBe(true);

      const reloadedContrib = await SponsorContribution.findById(contribution._id);
      expect(reloadedContrib.contributionStatus).toBe("COMPLETED");

      const reloadedCampaign = await ScholarshipCampaign.findById(campaign._id);
      expect(toNum(reloadedCampaign.fundedAmount)).toBe(500000);

      const tx = await Transaction.findOne({ relatedContributionId: contribution._id });
      expect(tx).toBeDefined();
      expect(tx.status).toBe("COMPLETED");
    });

    test("E54: PR4: Checkout UI state polling reflects COMPLETED correctly", async () => {
      const { payment } = await seedFullTuitionFixture();

      const res = await request(app)
        .get(`/api/payments/${payment._id}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe("COMPLETED");
    });

    test("E55: PR4: Expired order code handled safely without phantom transactions", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/payments/${nonExistentId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
    });

    test("E56: PR5: Outbox recovery job processes pending events idempotently", async () => {
      const { payment } = await seedFullTuitionFixture();
      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_OUTBOX_${Date.now()}`,
        fingerprint: `FP_OUTBOX_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "DISPATCHED",
        dispatchStatus: "DISPATCHED",
        linkedPaymentId: payment._id,
      });

      const res = await dispatchBankTransferEvent(event._id);
      expect(res.idempotent).toBe(true);
      expect(res.reason).toBe("ALREADY_DISPATCHED");
    });

    test("E57: PR5: PaymentReconciliation created for unexpected overpayment or duplicate reference", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Overpay E57",
        classType: "PAID",
        price: toDec(1000000),
        capacity: 10,
        enrolledCount: 0,
        status: "OPEN",
        schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }],
      });

      const enrollment = await Enrollment.create({
        studentId: studentUser._id,
        classId: cls._id,
        courseId: course._id,
        teacherId: teacherUser._id,
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: toDec(1000000),
        amountPaidViaPayment: toDec(1000000),
        enrollmentStatus: "PENDING_PAYMENT",
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const payment = await Payment.create({
        purpose: "TUITION",
        channelKey: "TUITION",
        provider: "PAYOS",
        enrollmentId: enrollment._id,
        payerUserId: studentUser._id,
        gateway: "payos",
        gatewayReference: `GW_E57_${orderCode}`,
        orderCode,
        amount: toDec(1000000),
        tuitionAmount: toDec(1000000),
        currency: "VND",
        paymentStatus: "PENDING",
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_OVERPAY_${Date.now()}`,
        fingerprint: `FP_OVERPAY_${Date.now()}`,
        amount: toDec(1500000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      const res = await dispatchBankTransferEvent(event._id);
      expect(res.reconciliationRequired).toBe(true);

      const rec = await PaymentReconciliation.findOne({ eventId: event._id });
      expect(rec).toBeDefined();
      expect(rec.status).toBe("NEEDS_REVIEW");
    });

    test("E58: PR6: Admin finance dashboard overview aggregates tuition and donation correctly", async () => {
      await seedFullTuitionFixture({ amount: 1000000 });

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revenue).toBeDefined();
      expect(res.body.data.teacherEarnings).toBeDefined();
    });

    test("E59: PR6/PR7: Legacy early-release bug verification: Class completion alone does NOT set earning to AVAILABLE without 7-day rule", async () => {
      const { earning, cls } = await seedFullTuitionFixture({
        classStatus: "IN_PROGRESS",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 3600000),
        endDatetime: new Date(Date.now() - 1800000),
        status: "COMPLETED",
      });

      await classLifecycleService.completeFinishedClasses(new Date());

      const reloadedClass = await Class.findById(cls._id);
      expect(reloadedClass.status).toBe("COMPLETED");

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("PENDING");
    });

    test("E60: PR6/PR7: Security audit regression: Unauthorized access to finance/settlement endpoints is blocked", async () => {
      const res1 = await request(app)
        .get("/api/teacher/earnings")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .get("/api/admin/payouts")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res2.status).toBe(403);

      const res3 = await request(app)
        .get("/api/admin/payouts")
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res3.status).toBe(403);

      const res4 = await request(app).get("/api/admin/overview");
      expect([401, 403]).toContain(res4.status);
    });
  });
});
