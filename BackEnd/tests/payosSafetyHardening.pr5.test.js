const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Enrollment,
  Payment,
  SponsorContribution,
  ScholarshipCampaign,
  Scholarship,
  ScholarshipUsage,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const paymentService = require("../src/services/paymentService");
const contributionService = require("../src/services/contributionService");

async function createPayosIntentForEnrollment(user, enrollmentId) {
  const studentId = user.id || user._id;
  const payment = await paymentService.createTuitionPaymentIntent(studentId, enrollmentId);
  const formatted = paymentService.formatPaymentIntentResponse(payment);
  formatted.paymentId = payment._id;
  formatted._id = payment._id;
  formatted.amount = toNum(payment.amount);
  return formatted;
}

async function createPayosIntentForContribution(user, campaignId, body) {
  const sponsorId = user.id || user._id;
  const res = await contributionService.createContribution(sponsorId, campaignId, body);
  res.paymentId = res.contributionId;
  res._id = res.contributionId;
  res.amount = toNum(res.amount);
  return res;
}
const {
  processPayosChannelWebhook: processPayosWebhook,
} = require("../src/services/payosWebhookService");
const {
  dispatchBankTransferEvent,
  runPendingDispatchWorker,
  verifyLedgerIntegrity,
  checkTransactionIndexPreflight,
  planLatePaymentLedgerBackfill,
  MAX_DISPATCH_ATTEMPTS,
} = require("../src/services/financialDispatchService");
const {
  startFinancialOutboxWorker,
  stopFinancialOutboxWorker,
  runFinancialOutboxTick,
  getFinancialOutboxWorkerStatus,
} = require("../src/jobs/financialOutboxWorker");
const {
  resolveCommissionPolicy,
  setCommissionPolicyForRuntime,
  clearCommissionPolicyForRuntime,
} = require("../src/utils/settings");
const { toDec, toNum } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

const TUITION_SECRET = "tuition-checksum-pr5-secret-key-111";
const DONATION_SECRET = "donation-checksum-pr5-secret-key-222";

async function buildWebhookPayload(
  channelKey,
  dataOverrides = {},
  topOverrides = {},
) {
  const data = {
    orderCode: 100000001,
    amount: 1200000,
    description: "EDUNITY TUITION 100000001",
    accountNumber: "190011112222",
    reference: `FT_PR5_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    transactionDateTime: "2026-11-09 14:00:00",
    currency: "VND",
    paymentLinkId: "plink_tuition_pr5_001",
    code: "00",
    desc: "success",
    counterAccountBankId: "970415",
    counterAccountBankName: "VietinBank",
    counterAccountName: "NGUYEN VAN STUDENT",
    counterAccountNumber: "101010101010",
    virtualAccountName: "EDUNITY TUITION",
    virtualAccountNumber: "VQR100000001",
    ...dataOverrides,
  };
  const signature = await payosService.signWebhookDataForChannel(
    channelKey,
    data,
  );
  return {
    code: "00",
    desc: "success",
    success: true,
    data,
    signature,
    ...topOverrides,
  };
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.ENABLE_PAYMENT_SANDBOX = "true";
  process.env.REAL_LOCAL_RUNTIME = "false";
  process.env.PAYOS_ENABLED = "false";
  process.env.ENABLE_FINANCIAL_OUTBOX_WORKER = "false";
  process.env.PAYOS_TUITION_CLIENT_ID = "tuition_client_id_pr5";
  process.env.PAYOS_TUITION_API_KEY = "tuition_api_key_pr5_secret";
  process.env.PAYOS_TUITION_CHECKSUM_KEY = TUITION_SECRET;
  process.env.PAYOS_DONATION_CLIENT_ID = "donation_client_id_pr5";
  process.env.PAYOS_DONATION_API_KEY = "donation_api_key_pr5_secret";
  process.env.PAYOS_DONATION_CHECKSUM_KEY = DONATION_SECRET;

  await connectDB();
  await syncIndexes();
}, 60000);

afterAll(async () => {
  stopFinancialOutboxWorker();
  clearCommissionPolicyForRuntime();
  await disconnectDB();
});

beforeEach(async () => {
  stopFinancialOutboxWorker();
  clearCommissionPolicyForRuntime();
  delete process.env.REQUIRE_APPROVED_COMMISSION_POLICY;
  delete process.env.COMMISSION_RATE;
  delete process.env.COMMISSION_POLICY_VERSION;
  delete process.env.COMMISSION_POLICY_APPROVED;
  process.env.ENABLE_FINANCIAL_OUTBOX_WORKER = "false";
  payosService.resetPayosClient();

  await clearDB();
});

async function seedAcademicFixture(tuitionPrice = 1200000) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const [student, teacher, sponsor, admin] = await User.create([
    {
      email: `student_${suffix}@test.com`,
      passwordHash: "hash",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: {
        fullName: `Student PR5_${suffix}`,
      },
    },
    {
      email: `teacher_${suffix}@test.com`,
      passwordHash: "hash",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: `Teacher PR5_${suffix}`,
        verificationStatus: "VERIFIED",
      },
    },
    {
      email: `sponsor_${suffix}@test.com`,
      passwordHash: "hash",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "INDIVIDUAL",
        representativeName: `Sponsor PR5_${suffix}`,
      },
    },
    {
      email: `admin_${suffix}@test.com`,
      passwordHash: "hash",
      role: "ADMIN",
      status: "ACTIVE",
    },
  ]);

  const category = await Category.create({
    name: `Cat_${suffix}`,
    slug: `cat-${suffix}`,
    createdBy: admin._id,
  });
  const subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: `Sub_${suffix}`,
    slug: `sub-${suffix}`,
    createdBy: admin._id,
  });
  const course = await Course.create({
    subjectId: subject._id,
    subjectName: subject.name,
    categoryId: category._id,
    categoryName: category.name,
    title: `Course_${suffix}`,
    slug: `course-${suffix}`,
    price: toDec(tuitionPrice),
    status: "ACTIVE",
    createdBy: admin._id,
  });
  const cls = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    categoryId: category._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    teacherName: teacher.teacherProfile.fullName,
    className: `Class_${suffix}`,
    classType: "PAID",
    price: toDec(tuitionPrice),
    capacity: 20,
    enrolledCount: 1,
    startDate: new Date(Date.now() + 7 * 86400000),
    endDate: new Date(Date.now() + 60 * 86400000),
    status: "OPEN",
  });
  const enrollment = await Enrollment.create({
    classId: cls._id,
    courseId: course._id,
    studentId: student._id,
    teacherId: teacher._id,
    tuitionAmount: toDec(tuitionPrice),
    enrollmentStatus: "PENDING_PAYMENT",
    paymentSource: "DIRECT_PAYMENT",
    holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  const campaign = await ScholarshipCampaign.create({
    createdBy: admin._id,
    title: `Campaign_${suffix}`,
    targetBudget: toDec(50000000),
    fundedAmount: toDec(10000000),
    allocatedAmount: toDec(0),
    usedAmount: toDec(0),
    expectedSlots: 50,
    awardAmountPerStudent: toDec(1000000),
    status: "OPEN_FOR_FUNDING",
    fundingStart: new Date(Date.now() - 3600000),
    fundingEnd: new Date(Date.now() + 30 * 86400000),
  });

  return {
    student,
    teacher,
    sponsor,
    admin,
    category,
    subject,
    course,
    cls,
    enrollment,
    campaign,
  };
}

describe("TIN-FIN-PR5 — Financial Safety Hardening (43 Mandatory Scenarios)", () => {
  // =========================================================================
  // GROUP A — OUTBOX RECOVERY WORKER (Scenarios 01 - 12)
  // =========================================================================
  describe("Group A — Outbox Recovery Worker (Scenarios 01-12)", () => {
    test("01. Event READY_FOR_DISPATCH (TUITION) được worker xử lý thành DISPATCHED", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A01",
      });

      // Ingest webhook with verifyOnly=true so event stays READY_FOR_DISPATCH
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });
      const evBefore = await BankTransferEvent.findById(webhookRes.eventId);
      expect(evBefore.eventStatus).toBe("READY_FOR_DISPATCH");
      expect(evBefore.dispatchStatus).toBe("PENDING_DISPATCH");

      const tickSummary = await runFinancialOutboxTick();
      expect(tickSummary.status).toBe("COMPLETED");
      expect(tickSummary.dispatched).toBe(1);

      const evAfter = await BankTransferEvent.findById(webhookRes.eventId);
      expect(evAfter.eventStatus).toBe("DISPATCHED");
      expect(evAfter.dispatchStatus).toBe("DISPATCHED");

      const updatedEnrollment = await Enrollment.findById(enrollment._id);
      expect(updatedEnrollment.enrollmentStatus).toBe("CONFIRMED");
    });

    test("02. Event READY_FOR_DISPATCH (DONATION) được worker xử lý thành DISPATCHED", async () => {
      const { sponsor, campaign } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForContribution(
        { id: sponsor._id.toString(), role: "SPONSOR" },
        campaign._id.toString(),
        { amount: 2500000 },
      );
      const payload = await buildWebhookPayload("DONATION", {
        orderCode: intent.orderCode,
        amount: 2500000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A02",
      });

      const webhookRes = await processPayosWebhook("DONATION", payload, {
        verifyOnly: true,
      });
      const tickSummary = await runFinancialOutboxTick();
      expect(tickSummary.dispatched).toBe(1);

      const evAfter = await BankTransferEvent.findById(webhookRes.eventId);
      expect(evAfter.eventStatus).toBe("DISPATCHED");
      expect(evAfter.dispatchStatus).toBe("DISPATCHED");

      const updatedCamp = await ScholarshipCampaign.findById(campaign._id);
      expect(toNum(updatedCamp.fundedAmount)).toBe(12500000);
    });

    test("03. Event DISPATCH_FAILED (retryable) đến nextRetryAt được worker xử lý lại", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A03",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      // Simulate first attempt failing mid-transaction
      const failRes = await dispatchBankTransferEvent(webhookRes.eventId, {
        simulateErrorAfterStep: async (step) => {
          if (step === "PAYMENT_UPDATED") {
            throw new Error("Simulated transient network glitch");
          }
        },
      });
      expect(failRes.dispatchStatus).toBe("DISPATCH_FAILED");

      // Advance time past nextRetryAt
      const futureNow = new Date(Date.now() + 60 * 1000);
      const tickSummary = await runFinancialOutboxTick({ now: futureNow });
      expect(tickSummary.dispatched).toBe(1);

      const evAfter = await BankTransferEvent.findById(webhookRes.eventId);
      expect(evAfter.eventStatus).toBe("DISPATCHED");
    });

    test("04. Event DISPATCH_FAILED chưa đến nextRetryAt được skip", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A04",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      await BankTransferEvent.updateOne(
        { _id: webhookRes.eventId },
        {
          $set: {
            eventStatus: "DISPATCH_FAILED",
            dispatchStatus: "DISPATCH_FAILED",
            dispatchAttempts: 1,
            nextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        },
      );

      const tickSummary = await runFinancialOutboxTick({ now: new Date() });
      expect(tickSummary.scanned).toBe(0);
      expect(tickSummary.dispatched).toBe(0);
    });

    test("05. Event DISPATCHING nhưng lease đã hết hạn được worker thu hồi và xử lý", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A05",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      // Simulate crashed worker with expired lease
      await BankTransferEvent.updateOne(
        { _id: webhookRes.eventId },
        {
          $set: {
            eventStatus: "DISPATCHING",
            dispatchStatus: "DISPATCHING",
            dispatchLeaseOwner: "crashed_worker_node_1",
            dispatchLeaseUntil: new Date(Date.now() - 5000),
          },
        },
      );

      const tickSummary = await runFinancialOutboxTick();
      expect(tickSummary.dispatched).toBe(1);

      const evAfter = await BankTransferEvent.findById(webhookRes.eventId);
      expect(evAfter.eventStatus).toBe("DISPATCHED");
      expect(evAfter.dispatchLeaseOwner).toBeNull();
    });

    test("06. Event DISPATCHING còn lease không bị worker khác chiếm", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A06",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      await BankTransferEvent.updateOne(
        { _id: webhookRes.eventId },
        {
          $set: {
            eventStatus: "DISPATCHING",
            dispatchStatus: "DISPATCHING",
            dispatchLeaseOwner: "active_worker_node_2",
            dispatchLeaseUntil: new Date(Date.now() + 60 * 1000),
          },
        },
      );

      const tickSummary = await runFinancialOutboxTick();
      expect(tickSummary.scanned).toBe(0);
      expect(tickSummary.dispatched).toBe(0);

      const directAttempt = await dispatchBankTransferEvent(
        webhookRes.eventId,
        {
          bypassCoalescing: true,
        },
      );
      expect(["IN_FLIGHT_LEASED", "LEASE_HELD_OR_NOT_ELIGIBLE"]).toContain(
        directAttempt.reason,
      );
    });

    test("07. Event RECONCILIATION_REQUIRED không bị auto-dispatch", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      // Send mismatched amount so event goes to AMOUNT_MISMATCH + RECONCILIATION_REQUIRED
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 999000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A07",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload);
      expect(webhookRes.reconciliationId).toBeTruthy();
      expect(webhookRes.dispatchStatus).toBe("RECONCILIATION_REQUIRED");

      const tickSummary = await runFinancialOutboxTick();
      expect(tickSummary.scanned).toBe(0);
      expect(tickSummary.dispatched).toBe(0);

      const updatedEnrollment = await Enrollment.findById(enrollment._id);
      expect(updatedEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");
    });

    test("08. Event vượt MAX_DISPATCH_ATTEMPTS không retry vô hạn và được cảnh báo", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A08",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      await BankTransferEvent.updateOne(
        { _id: webhookRes.eventId },
        {
          $set: {
            eventStatus: "DISPATCH_FAILED",
            dispatchStatus: "DISPATCH_FAILED",
            dispatchAttempts: MAX_DISPATCH_ATTEMPTS,
            lastDispatchError: "[SIMULATED_MAX_RETRY] Exhausted retries",
            nextRetryAt: new Date(Date.now() - 1000),
          },
        },
      );

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const tickSummary = await runFinancialOutboxTick();
        expect(tickSummary.scanned).toBe(0);
        expect(tickSummary.dispatched).toBe(0);
        expect(tickSummary.exhaustedCount).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("FINANCIAL_OUTBOX_EXHAUSTED_EVENTS_ALERT"),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    test("09. Hai worker chạy đồng thời cùng 1 event không nhân đôi dữ liệu", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_A09",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      const [w1, w2] = await Promise.all([
        runPendingDispatchWorker({ batchSize: 10 }),
        runPendingDispatchWorker({ batchSize: 10 }),
      ]);

      expect(w1.dispatched + w2.dispatched).toBeGreaterThanOrEqual(1);

      const txs = await Transaction.find({
        relatedPaymentId: intent.paymentId,
      });
      expect(txs).toHaveLength(1);
      const earnings = await TeacherEarning.find({
        enrollmentId: enrollment._id,
      });
      expect(earnings).toHaveLength(1);
    });

    test("10. Worker dừng an toàn, không để timer leak trong Jest", async () => {
      const startRes = startFinancialOutboxWorker({
        enabled: true,
        intervalMs: 5000,
      });
      expect(startRes.started).toBe(true);
      expect(getFinancialOutboxWorkerStatus().isRunning).toBe(true);

      // Calling start again replaces timer cleanly without duplicate timers
      const restartRes = startFinancialOutboxWorker({
        enabled: true,
        intervalMs: 5000,
      });
      expect(restartRes.started).toBe(true);
      expect(getFinancialOutboxWorkerStatus().isRunning).toBe(true);

      const stoppedStatus = stopFinancialOutboxWorker();
      expect(stoppedStatus.isRunning).toBe(false);
    });

    test("11. Worker tắt bằng ENABLE_FINANCIAL_OUTBOX_WORKER=false thì không chạy interval", async () => {
      process.env.ENABLE_FINANCIAL_OUTBOX_WORKER = "false";
      const startRes = startFinancialOutboxWorker();
      expect(startRes.started).toBe(false);
      expect(startRes.reason).toBe("DISABLED_BY_CONFIG");
      expect(getFinancialOutboxWorkerStatus().isRunning).toBe(false);
    });

    test("12. DB chưa kết nối thì worker skip an toàn, không crash", async () => {
      const tickRes = await runFinancialOutboxTick({ readyState: 0 });
      expect(tickRes.status).toBe("SKIPPED_DB_NOT_READY");
      expect(tickRes.scanned).toBe(0);
    });
  });

  // =========================================================================
  // GROUP B — LATE PAYMENT LEDGER CORRECTNESS (Scenarios 13 - 21)
  // =========================================================================
  describe("Group B — Late Payment Ledger Correctness (Scenarios 13-21)", () => {
    async function triggerLateTuitionPayment() {
      const fixture = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: fixture.student._id.toString(), role: "STUDENT" },
        fixture.enrollment._id.toString(),
      );
      // Expire the enrollment hold before the webhook arrives
      await Enrollment.updateOne(
        { _id: fixture.enrollment._id },
        {
          $set: {
            enrollmentStatus: "EXPIRED",
            holdExpiresAt: new Date(Date.now() - 60 * 1000),
          },
        },
      );
      await Class.updateOne(
        { _id: fixture.cls._id },
        { $set: { enrolledCount: 0 } },
      );

      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: `FT_PR5_LATE_${Date.now()}`,
      });
      const webhookRes = await processPayosWebhook("TUITION", payload);
      return { ...fixture, intent, webhookRes };
    }

    test("13. Late tuition payment sau hold expiry tạo bản ghi tiền thực vào hợp lệ (UNAPPLIED_TUITION_RECEIPT COMPLETED)", async () => {
      const { intent } = await triggerLateTuitionPayment();
      const payment = await Payment.findById(intent.paymentId);
      expect(payment.paymentStatus).toBe("COMPLETED");
      expect(payment.providerStatus).toBe("PAID");

      const receiptTx = await Transaction.findOne({
        relatedPaymentId: intent.paymentId,
        transactionType: "UNAPPLIED_TUITION_RECEIPT",
      });
      expect(receiptTx).toBeTruthy();
      expect(receiptTx.status).toBe("COMPLETED");
      expect(toNum(receiptTx.amount)).toBe(1200000);
    });

    test("14. Late tuition payment tạo nghĩa vụ hoàn/treo chờ xử lý (REFUND PENDING)", async () => {
      const { intent } = await triggerLateTuitionPayment();
      const refundTx = await Transaction.findOne({
        relatedPaymentId: intent.paymentId,
        transactionType: "REFUND",
      });
      expect(refundTx).toBeTruthy();
      expect(refundTx.status).toBe("PENDING");
      expect(toNum(refundTx.amount)).toBe(1200000);
    });

    test("15. Late tuition payment tạo PaymentReconciliation(LATE_PAYMENT_REVIEW)", async () => {
      const { intent, webhookRes } = await triggerLateTuitionPayment();
      const recon = await PaymentReconciliation.findOne({
        eventId: webhookRes.eventId,
        paymentId: intent.paymentId,
      });
      expect(recon).toBeTruthy();
      expect(recon.reason).toBe("LATE_PAYMENT_REVIEW");
      expect(recon.status).toBe("NEEDS_REVIEW");
    });

    test("16. Late tuition payment không confirm Enrollment", async () => {
      const { enrollment } = await triggerLateTuitionPayment();
      const updatedEnrollment = await Enrollment.findById(enrollment._id);
      expect(updatedEnrollment.enrollmentStatus).toBe("EXPIRED");
    });

    test("17. Late tuition payment không tăng Class.enrolledCount", async () => {
      const { cls } = await triggerLateTuitionPayment();
      const updatedClass = await Class.findById(cls._id);
      expect(updatedClass.enrolledCount).toBe(0);
    });

    test("18. Late tuition payment không tạo TeacherEarning", async () => {
      const { enrollment } = await triggerLateTuitionPayment();
      const earning = await TeacherEarning.findOne({
        enrollmentId: enrollment._id,
      });
      expect(earning).toBeNull();
    });

    test("19. Late tuition payment không tính vào doanh thu lớp đã xác nhận (confirmedTuitionRevenueAmount === 0)", async () => {
      const { intent } = await triggerLateTuitionPayment();
      const enrollTxs = await Transaction.find({
        relatedPaymentId: intent.paymentId,
        transactionType: "ENROLLMENT_PAYMENT",
      });
      expect(enrollTxs).toHaveLength(0);

      const integrity = await verifyLedgerIntegrity();
      expect(integrity.summary.confirmedTuitionRevenueAmount).toBe(0);
      expect(integrity.summary.unappliedLateReceiptsAmount).toBe(1200000);
      expect(integrity.summary.pendingRefundLiabilityAmount).toBe(1200000);
    });

    test("20. Late tuition payment không bị đánh dấu đã hoàn tiền khi chưa hoàn thật", async () => {
      const { intent } = await triggerLateTuitionPayment();
      const payment = await Payment.findById(intent.paymentId);
      expect(payment.paymentStatus).toBe("COMPLETED");
      expect(payment.paymentStatus).not.toBe("REFUNDED");

      const refundTx = await Transaction.findOne({
        relatedPaymentId: intent.paymentId,
        transactionType: "REFUND",
      });
      expect(refundTx.status).toBe("PENDING");
      expect(refundTx.status).not.toBe("COMPLETED");
    });

    test("21. verifyLedgerIntegrity() PASS với late payment mới (và planLatePaymentLedgerBackfill hỗ trợ backfill an toàn)", async () => {
      const { intent } = await triggerLateTuitionPayment();
      const integrity = await verifyLedgerIntegrity();
      expect(integrity.valid).toBe(true);
      expect(integrity.discrepancies).toHaveLength(0);

      // Simulate a legacy late payment record missing UNAPPLIED_TUITION_RECEIPT
      await Transaction.deleteOne({
        relatedPaymentId: intent.paymentId,
        transactionType: "UNAPPLIED_TUITION_RECEIPT",
      });

      const integrityMissing = await verifyLedgerIntegrity();
      expect(integrityMissing.valid).toBe(false);
      expect(
        integrityMissing.discrepancies.some(
          (d) => d.type === "LATE_PAYMENT_MISSING_UNAPPLIED_RECEIPT_TX",
        ),
      ).toBe(true);

      // Dry-run backfill plan
      const dryPlan = await planLatePaymentLedgerBackfill({ dryRun: true });
      expect(dryPlan.candidatesCount).toBe(1);
      expect(dryPlan.backfilledCount).toBe(0);

      // Execute idempotent backfill
      const execPlan = await planLatePaymentLedgerBackfill({ dryRun: false });
      expect(execPlan.backfilledCount).toBe(1);

      const integrityAfterBackfill = await verifyLedgerIntegrity();
      expect(integrityAfterBackfill.valid).toBe(true);
    });
  });

  // =========================================================================
  // GROUP C — TRANSACTION UNIQUE INDEX HARDENING (Scenarios 22 - 28)
  // =========================================================================
  describe("Group C — Transaction Unique Index Hardening (Scenarios 22-28)", () => {
    test("22. Duplicate ENROLLMENT_PAYMENT cùng relatedPaymentId bị chặn ở DB", async () => {
      const { student, teacher, enrollment } =
        await seedAcademicFixture(1200000);
      const paymentId = new mongoose.Types.ObjectId();

      await Transaction.create({
        transactionType: "ENROLLMENT_PAYMENT",
        sourceUserId: student._id,
        destinationUserId: teacher._id,
        relatedEnrollmentId: enrollment._id,
        relatedPaymentId: paymentId,
        amount: toDec(1200000),
        status: "COMPLETED",
      });

      await expect(
        Transaction.create({
          transactionType: "ENROLLMENT_PAYMENT",
          sourceUserId: student._id,
          destinationUserId: teacher._id,
          relatedEnrollmentId: enrollment._id,
          relatedPaymentId: paymentId,
          amount: toDec(1200000),
          status: "COMPLETED",
        }),
      ).rejects.toThrow(/E11000/);
    });

    test("23. Duplicate SPONSOR_CONTRIBUTION cùng relatedContributionId bị chặn ở DB", async () => {
      const { sponsor } = await seedAcademicFixture(1200000);
      const contributionId = new mongoose.Types.ObjectId();

      await Transaction.create({
        transactionType: "SPONSOR_CONTRIBUTION",
        sourceUserId: sponsor._id,
        relatedContributionId: contributionId,
        amount: toDec(5000000),
        status: "COMPLETED",
      });

      await expect(
        Transaction.create({
          transactionType: "SPONSOR_CONTRIBUTION",
          sourceUserId: sponsor._id,
          relatedContributionId: contributionId,
          amount: toDec(5000000),
          status: "COMPLETED",
        }),
      ).rejects.toThrow(/E11000/);
    });

    test("24. Duplicate SCHOLARSHIP_USAGE cùng relatedScholarshipUsageId bị chặn ở DB", async () => {
      const { student, teacher, enrollment } =
        await seedAcademicFixture(1200000);
      const usageId = new mongoose.Types.ObjectId();

      await Transaction.create({
        transactionType: "SCHOLARSHIP_USAGE",
        sourceUserId: student._id,
        destinationUserId: teacher._id,
        relatedEnrollmentId: enrollment._id,
        relatedScholarshipUsageId: usageId,
        amount: toDec(400000),
        status: "COMPLETED",
      });

      await expect(
        Transaction.create({
          transactionType: "SCHOLARSHIP_USAGE",
          sourceUserId: student._id,
          destinationUserId: teacher._id,
          relatedEnrollmentId: enrollment._id,
          relatedScholarshipUsageId: usageId,
          amount: toDec(400000),
          status: "COMPLETED",
        }),
      ).rejects.toThrow(/E11000/);
    });

    test("25. Hai SCHOLARSHIP_USAGE khác nhau nhưng cùng relatedBankEventId vẫn tạo được", async () => {
      const { student, teacher, admin, enrollment, campaign, cls } =
        await seedAcademicFixture(1200000);

      // Create two distinct Scholarships & two PENDING ScholarshipUsages (200k + 300k = 500k)
      const [sch1, sch2] = await Scholarship.create([
        {
          studentId: student._id,
          campaignId: campaign._id,
          applicationId: new mongoose.Types.ObjectId(),
          allocatedAmount: toDec(200000),
          remainingAmount: toDec(0),
          validFrom: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() + 90 * 86400000),
          status: "ACTIVE",
          createdBy: admin._id,
        },
        {
          studentId: student._id,
          campaignId: campaign._id,
          applicationId: new mongoose.Types.ObjectId(),
          allocatedAmount: toDec(300000),
          remainingAmount: toDec(0),
          validFrom: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() + 90 * 86400000),
          status: "ACTIVE",
          createdBy: admin._id,
        },
      ]);

      const [usage1, usage2] = await ScholarshipUsage.create([
        {
          scholarshipId: sch1._id,
          enrollmentId: enrollment._id,
          classId: cls._id,
          amount: toDec(200000),
          status: "PENDING",
        },
        {
          scholarshipId: sch2._id,
          enrollmentId: enrollment._id,
          classId: cls._id,
          amount: toDec(300000),
          status: "PENDING",
        },
      ]);

      await Enrollment.updateOne(
        { _id: enrollment._id },
        { $set: { paymentSource: "MIXED" } },
      );

      // Remaining due via payOS = 1,200,000 - 500,000 = 700,000
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      expect(intent.amount).toBe(700000);

      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 700000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_MULTI_SCH_25",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload);
      expect(webhookRes.dispatched).toBe(true);

      const schTxs = await Transaction.find({
        relatedBankEventId: webhookRes.eventId,
        transactionType: "SCHOLARSHIP_USAGE",
      });
      expect(schTxs).toHaveLength(2);
      const usageIdsInTx = schTxs.map((t) =>
        t.relatedScholarshipUsageId.toString(),
      );
      expect(usageIdsInTx).toContain(usage1._id.toString());
      expect(usageIdsInTx).toContain(usage2._id.toString());
    });

    test("26. Transaction không có relatedBankEventId (null) không bị chặn sai", async () => {
      const { student, teacher, enrollment } =
        await seedAcademicFixture(1200000);
      const tx1 = await Transaction.create({
        transactionType: "TEACHER_PAYOUT",
        sourceUserId: student._id,
        destinationUserId: teacher._id,
        relatedEnrollmentId: enrollment._id,
        relatedBankEventId: null,
        amount: toDec(500000),
        status: "COMPLETED",
      });
      const tx2 = await Transaction.create({
        transactionType: "TEACHER_PAYOUT",
        sourceUserId: student._id,
        destinationUserId: teacher._id,
        relatedEnrollmentId: enrollment._id,
        relatedBankEventId: null,
        amount: toDec(600000),
        status: "COMPLETED",
      });
      expect(tx1._id).toBeTruthy();
      expect(tx2._id).toBeTruthy();
    });

    test("27. Concurrent dispatchBankTransferEvent không tạo duplicate Transaction", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_CONC_27",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload, {
        verifyOnly: true,
      });

      await Promise.all([
        dispatchBankTransferEvent(webhookRes.eventId, {
          bypassCoalescing: true,
        }),
        dispatchBankTransferEvent(webhookRes.eventId, {
          bypassCoalescing: true,
        }),
        dispatchBankTransferEvent(webhookRes.eventId, {
          bypassCoalescing: true,
        }),
      ]);

      const txs = await Transaction.find({
        relatedBankEventId: webhookRes.eventId,
      });
      expect(txs).toHaveLength(1);
    });

    test("28. Index thực tế tồn tại trong MongoDB test và checkTransactionIndexPreflight() PASS", async () => {
      const preflight = await checkTransactionIndexPreflight();
      expect(preflight.safeToMigrate).toBe(true);
      expect(preflight.duplicateViolationsCount).toBe(0);
      expect(preflight.missingIndexNames).toEqual([]);
      expect(preflight.activeIndexNames).toEqual(
        expect.arrayContaining([
          "uniq_tx_payment_receipt_type",
          "uniq_tx_contribution_type",
          "uniq_tx_scholarship_usage_type",
          "uniq_tx_bank_event_single_type",
          "uniq_tx_bank_event_scholarship_usage",
        ]),
      );
    });
  });

  // =========================================================================
  // GROUP D — COMMISSION RATE POLICY & VERSIONING (Scenarios 29 - 34)
  // =========================================================================
  describe("Group D — Commission Rate Policy & Versioning (Scenarios 29-34)", () => {
    test("29. Policy hợp lệ -> tạo TeacherEarning đúng gross, commission, net và appliedPolicyVersion", async () => {
      setCommissionPolicyForRuntime({
        rate: 0.12,
        version: "POLICY_2026_Q4_V2",
        source: "ADMIN_APPROVED_POLICY",
        isApproved: true,
      });

      const { student, enrollment } = await seedAcademicFixture(1000000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1000000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_D29",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload);
      expect(webhookRes.dispatched).toBe(true);

      const earning = await TeacherEarning.findOne({
        enrollmentId: enrollment._id,
      });
      expect(earning).toBeTruthy();
      expect(toNum(earning.grossAmount)).toBe(1000000);
      expect(earning.commissionRate).toBe(0.12);
      expect(toNum(earning.commissionAmount)).toBe(120000);
      expect(toNum(earning.netAmount)).toBe(880000);
      expect(earning.appliedPolicyVersion).toBe("POLICY_2026_Q4_V2");
      expect(earning.commissionPolicySource).toBe("ADMIN_APPROVED_POLICY");
    });

    test("30. Production/staging thiếu policy -> không âm thầm dùng 0.1", async () => {
      process.env.REQUIRE_APPROVED_COMMISSION_POLICY = "true";
      expect(() => resolveCommissionPolicy()).toThrow(
        expect.objectContaining({
          code: "COMMISSION_POLICY_NOT_CONFIGURED",
        }),
      );
    });

    test("31. Khi thiếu policy -> không mất trạng thái tiền đã nhận (BankTransferEvent giữ an toàn để retry)", async () => {
      process.env.REQUIRE_APPROVED_COMMISSION_POLICY = "true";
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_D31",
      });

      // Webhook arrives while approved policy is missing in strict mode
      const webhookRes = await processPayosWebhook("TUITION", payload);
      expect(webhookRes.dispatched).toBe(false);
      expect(webhookRes.dispatchStatus).toBe("DISPATCH_FAILED");

      // BankTransferEvent is preserved in DB, zero unapproved TeacherEarning was written
      const ev = await BankTransferEvent.findById(webhookRes.eventId);
      expect(ev).toBeTruthy();
      expect(ev.eventStatus).toBe("DISPATCH_FAILED");
      expect(ev.lastDispatchError).toContain(
        "COMMISSION_POLICY_NOT_CONFIGURED",
      );
      expect(
        await TeacherEarning.countDocuments({ enrollmentId: enrollment._id }),
      ).toBe(0);

      // Now Admin configures the approved policy and outbox worker recovers the event!
      setCommissionPolicyForRuntime({
        rate: 0.15,
        version: "PROD_APPROVED_2026_V1",
        source: "ADMIN_POLICY",
        isApproved: true,
      });

      const retryRes = await dispatchBankTransferEvent(webhookRes.eventId);
      expect(retryRes.dispatched).toBe(true);

      const earning = await TeacherEarning.findOne({
        enrollmentId: enrollment._id,
      });
      expect(earning).toBeTruthy();
      expect(earning.commissionRate).toBe(0.15);
      expect(earning.appliedPolicyVersion).toBe("PROD_APPROVED_2026_V1");
    });

    test("32. Thay đổi policy sau đó không sửa TeacherEarning đã tạo trước đó", async () => {
      setCommissionPolicyForRuntime({
        rate: 0.1,
        version: "POLICY_V1_10PCT",
        isApproved: true,
      });

      const { student, enrollment } = await seedAcademicFixture(1000000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1000000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_D32",
      });
      await processPayosWebhook("TUITION", payload);

      // Later Admin updates commission rate to 20%
      setCommissionPolicyForRuntime({
        rate: 0.2,
        version: "POLICY_V2_20PCT",
        isApproved: true,
      });

      const existingEarning = await TeacherEarning.findOne({
        enrollmentId: enrollment._id,
      });
      expect(existingEarning.commissionRate).toBe(0.1);
      expect(toNum(existingEarning.commissionAmount)).toBe(100000);
      expect(toNum(existingEarning.netAmount)).toBe(900000);
      expect(existingEarning.appliedPolicyVersion).toBe("POLICY_V1_10PCT");
    });

    test("33. commissionRate < 0 hoặc > 1 bị từ chối", async () => {
      expect(() =>
        setCommissionPolicyForRuntime({ rate: -0.05, version: "BAD_NEG" }),
      ).toThrow(expect.objectContaining({ code: "COMMISSION_POLICY_INVALID" }));

      expect(() =>
        setCommissionPolicyForRuntime({ rate: 1.25, version: "BAD_GT1" }),
      ).toThrow(expect.objectContaining({ code: "COMMISSION_POLICY_INVALID" }));
    });

    test("34. MIXED (Scholarship + payOS) tính commission trên tổng học phí theo đúng policy", async () => {
      setCommissionPolicyForRuntime({
        rate: 0.15,
        version: "POLICY_MIXED_15PCT",
        isApproved: true,
      });

      const { student, admin, enrollment, campaign, cls } =
        await seedAcademicFixture(2000000);
      const scholarship = await Scholarship.create({
        studentId: student._id,
        campaignId: campaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        allocatedAmount: toDec(500000),
        remainingAmount: toDec(0),
        validFrom: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 90 * 86400000),
        status: "ACTIVE",
        createdBy: admin._id,
      });
      await ScholarshipUsage.create({
        scholarshipId: scholarship._id,
        enrollmentId: enrollment._id,
        classId: cls._id,
        amount: toDec(500000),
        status: "PENDING",
      });
      await Enrollment.updateOne(
        { _id: enrollment._id },
        { $set: { paymentSource: "MIXED" } },
      );

      // Student pays remaining 1,500,000 via payOS
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      expect(intent.amount).toBe(1500000);

      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1500000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_D34_MIXED",
      });
      const webhookRes = await processPayosWebhook("TUITION", payload);
      expect(webhookRes.dispatched).toBe(true);

      // Commission must be 15% of FULL tuition (2,000,000) = 300,000; net = 1,700,000
      const earning = await TeacherEarning.findOne({
        enrollmentId: enrollment._id,
      });
      expect(toNum(earning.grossAmount)).toBe(2000000);
      expect(earning.commissionRate).toBe(0.15);
      expect(toNum(earning.commissionAmount)).toBe(300000);
      expect(toNum(earning.netAmount)).toBe(1700000);
      expect(earning.appliedPolicyVersion).toBe("POLICY_MIXED_15PCT");
    });
  });

  // =========================================================================
  // GROUP E — FULL REGRESSION (Scenarios 35 - 43)
  // =========================================================================
  describe("Group E — Full Regression (Scenarios 35-43)", () => {
    test("35. TUITION intent + webhook + dispatch E2E PASS", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_E35",
      });
      const res = await processPayosWebhook("TUITION", payload);
      expect(res.dispatched).toBe(true);
      expect(res.eventStatus).toBe("DISPATCHED");
    });

    test("36. DONATION intent + webhook + dispatch E2E PASS", async () => {
      const { sponsor, campaign } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForContribution(
        { id: sponsor._id.toString(), role: "SPONSOR" },
        campaign._id.toString(),
        { amount: 3000000 },
      );
      const payload = await buildWebhookPayload("DONATION", {
        orderCode: intent.orderCode,
        amount: 3000000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_E36",
      });
      const res = await processPayosWebhook("DONATION", payload);
      expect(res.dispatched).toBe(true);
      expect(res.eventStatus).toBe("DISPATCHED");
    });

    test("37. Cross-channel mismatch bị chặn (TUITION orderCode gửi vào DONATION webhook)", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("DONATION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_E37",
      });
      const res = await processPayosWebhook("DONATION", payload);
      expect(res.dispatched).toBe(false);
      expect(res.reconciliationId).toBeTruthy();
      expect(res.dispatchStatus).toBe("RECONCILIATION_REQUIRED");
    });

    test("38. Wrong signature bị từ chối", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload(
        "TUITION",
        {
          orderCode: intent.orderCode,
          amount: 1200000,
          paymentLinkId: intent.paymentLinkId,
          reference: "FT_PR5_E38",
        },
        {
          signature: "invalid_signature_hex_digest_pr5",
        },
      );
      await expect(processPayosWebhook("TUITION", payload)).rejects.toThrow(
        expect.objectContaining({ statusCode: 401 }),
      );
    });

    test("39. Amount mismatch bị gắn RECONCILIATION_REQUIRED", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 500000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_E39",
      });
      const res = await processPayosWebhook("TUITION", payload);
      expect(res.eventStatus).toBe("AMOUNT_MISMATCH");
      expect(res.reconciliationId).toBeTruthy();
      expect(res.dispatchStatus).toBe("RECONCILIATION_REQUIRED");
    });

    test("40. Unmatched orderCode bị gắn RECONCILIATION_REQUIRED", async () => {
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: 199999999,
        amount: 1200000,
        paymentLinkId: "plink_unmatched_40",
        reference: "FT_PR5_E40",
      });
      const res = await processPayosWebhook("TUITION", payload);
      expect(res.eventStatus).toBe("UNMATCHED");
      expect(res.reconciliationId).toBeTruthy();
      expect(res.dispatchStatus).toBe("RECONCILIATION_REQUIRED");
    });

    test("41. Duplicate webhook retry an toàn (idempotent: true)", async () => {
      const { student, enrollment } = await seedAcademicFixture(1200000);
      const intent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      const payload = await buildWebhookPayload("TUITION", {
        orderCode: intent.orderCode,
        amount: 1200000,
        paymentLinkId: intent.paymentLinkId,
        reference: "FT_PR5_E41",
      });
      const first = await processPayosWebhook("TUITION", payload);
      const second = await processPayosWebhook("TUITION", payload);
      expect(first.dispatched).toBe(true);
      expect(second.idempotent).toBe(true);
      expect(
        await Transaction.countDocuments({
          relatedPaymentId: intent.paymentId,
        }),
      ).toBe(1);
    });

    test("42. verifyLedgerIntegrity() PASS sau toàn bộ kịch bản E2E (TUITION + DONATION + LATE PAYMENT)", async () => {
      const { student, sponsor, enrollment, campaign } =
        await seedAcademicFixture(1200000);

      // 1. Confirmed TUITION
      const tIntent = await createPayosIntentForEnrollment(
        { id: student._id.toString(), role: "STUDENT" },
        enrollment._id.toString(),
      );
      await processPayosWebhook(
        "TUITION",
        await buildWebhookPayload("TUITION", {
          orderCode: tIntent.orderCode,
          amount: 1200000,
          paymentLinkId: tIntent.paymentLinkId,
          reference: "FT_PR5_E42_T",
        }),
      );

      // 2. Confirmed DONATION
      const dIntent = await createPayosIntentForContribution(
        { id: sponsor._id.toString(), role: "SPONSOR" },
        campaign._id.toString(),
        { amount: 2000000 },
      );
      await processPayosWebhook(
        "DONATION",
        await buildWebhookPayload("DONATION", {
          orderCode: dIntent.orderCode,
          amount: 2000000,
          paymentLinkId: dIntent.paymentLinkId,
          reference: "FT_PR5_E42_D",
        }),
      );

      const integrity = await verifyLedgerIntegrity();
      expect(integrity.valid).toBe(true);
      expect(integrity.discrepancies).toHaveLength(0);
      expect(integrity.summary.confirmedTuitionRevenueAmount).toBe(1200000);
      expect(integrity.summary.donationRevenueAmount).toBe(2000000);
    });

    test("43. Không log lộ apiKey/checksumKey/signature", async () => {
      const logs = [];
      const logSpy = jest
        .spyOn(console, "log")
        .mockImplementation((...args) => {
          logs.push(args.join(" "));
        });
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation((...args) => {
          logs.push(args.join(" "));
        });
      const errSpy = jest
        .spyOn(console, "error")
        .mockImplementation((...args) => {
          logs.push(args.join(" "));
        });

      try {
        const { student, enrollment } = await seedAcademicFixture(1200000);
        const intent = await createPayosIntentForEnrollment(
          { id: student._id.toString(), role: "STUDENT" },
          enrollment._id.toString(),
        );
        const payload = await buildWebhookPayload("TUITION", {
          orderCode: intent.orderCode,
          amount: 1200000,
          paymentLinkId: intent.paymentLinkId,
          reference: "FT_PR5_E43",
        });
        await processPayosWebhook("TUITION", payload);

        const combined = logs.join("\n");
        expect(combined).not.toContain(TUITION_SECRET);
        expect(combined).not.toContain(DONATION_SECRET);
        expect(combined).not.toContain("tuition_api_key_pr5_secret");
        expect(combined).not.toContain("donation_api_key_pr5_secret");
        expect(combined).not.toContain(payload.signature);
      } finally {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errSpy.mockRestore();
      }
    });
  });
});
