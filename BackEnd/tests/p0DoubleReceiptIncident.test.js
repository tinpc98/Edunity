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
const {
  Class,
  Course,
  Category,
  Subject,
  Enrollment,
  Payment,
  User,
  BankTransferEvent,
  PaymentReconciliation,
  Transaction,
  TeacherEarning,
} = require("../src/models");
const paymentService = require("../src/services/paymentService");
const payosService = require("../src/services/payosService");
const payosWebhookService = require("../src/services/payosWebhookService");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TIN-PAYOS-FINAL-RECOVERY-CHECK Security & Regression Suite", () => {
  let studentUser;
  let teacherUser;
  let testCategory;
  let testSubject;
  let testCourse;
  let testClass;

  beforeAll(async () => {
    process.env.PAYOS_ENABLED = "false";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";
    await connectDB();
    await syncIndexes();

    const suffix = Date.now();
    const passwordHash = hashPassword("password123");

    studentUser = await User.create({
      fullName: `Security Student ${suffix}`,
      email: `sec_student_${suffix}@edunity.test`,
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    teacherUser = await User.create({
      fullName: `Security Teacher ${suffix}`,
      email: `sec_teacher_${suffix}@edunity.test`,
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: `Security Teacher ${suffix}`, verificationStatus: "VERIFIED" },
    });

    testCategory = await Category.create({
      name: `Sec Category ${suffix}`,
      slug: `sec-category-${suffix}`,
      createdBy: teacherUser._id,
      status: "ACTIVE",
    });

    testSubject = await Subject.create({
      name: `Sec Subject ${suffix}`,
      slug: `sec-subject-${suffix}`,
      categoryId: testCategory._id,
      categoryName: testCategory.name,
      createdBy: teacherUser._id,
      status: "ACTIVE",
    });

    testCourse = await Course.create({
      title: `Sec Course ${suffix}`,
      slug: `sec-course-${suffix}`,
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
      teacherName: "Security Teacher",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      gradeLevel: "GRADE_12",
      className: `Class Sec Real PayOS ${suffix}`,
      classType: "PAID",
      price: 3000,
      capacity: 20,
      enrolledCount: 0,
      enrollmentStart: new Date(now.getTime() - 3600000),
      enrollmentEnd: new Date(now.getTime() + 86400000),
      startDate: new Date(now.getTime() + 86400000),
      endDate: new Date(now.getTime() + 86400000 * 30),
      schedule: [
        {
          dayOfWeek: 1,
          startTime: "08:00",
          endTime: "10:00",
        },
      ],
      status: "OPEN",
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // TEST 1: Trusted physical account
  test("1. Trusted physical account: payment to 4008999999 with valid alias is accepted", () => {
    const { isReceiverAccountMatch } = payosWebhookService;
    const intent = {
      providerMetadata: {
        accountNumber: "VQRQANTHX1072",
        accountName: "PHAM CONG TIN",
      },
    };
    const parsed = {
      accountNumber: "4008999999",
      description: "Qanthx1072 CASSO12135 EDUNITY HP 100000009",
    };
    expect(isReceiverAccountMatch("TUITION", intent, parsed)).toBe(true);
  });

  // TEST 2: Valid VietQR alias matching
  test("2. Valid VietQR alias: alias matches intent virtual account and physical account is trusted", () => {
    const { isReceiverAccountMatch } = payosWebhookService;
    const intent = {
      providerMetadata: {
        accountNumber: "VQRQANTHA4218",
        accountName: "PHAM CONG TIN",
      },
    };
    const parsed = {
      accountNumber: "4008999999",
      description: "Qantha4218 CASSO12135 EDUNITY HP 100000008",
    };
    expect(isReceiverAccountMatch("TUITION", intent, parsed)).toBe(true);
  });

  // TEST 3: Incorrect physical receiver
  test("3. Incorrect physical receiver: unapproved physical account without alias is rejected", () => {
    const { isReceiverAccountMatch } = payosWebhookService;
    const intent = {
      providerMetadata: {
        accountNumber: "VQRQANTHX1072",
      },
    };
    const parsed = {
      accountNumber: "9999999999",
      description: "CHUYEN TIEN HOC PHI BINH THUONG",
    };
    expect(isReceiverAccountMatch("TUITION", intent, parsed)).toBe(false);
  });

  // TEST 4: Alias injection in description (CRITICAL SECURITY VULNERABILITY PREVENTION)
  test("4. Alias injection in description: attacker sends to untrusted account 9999999999 with alias text in description -> MUST BE REJECTED", () => {
    const { isReceiverAccountMatch } = payosWebhookService;
    const intent = {
      providerMetadata: {
        accountNumber: "VQRQANTHX1072",
      },
    };
    // Attacker sends to attacker's bank account 9999999999, but maliciously writes "Qanthx1072" in transfer description!
    const maliciousParsed = {
      accountNumber: "9999999999",
      description: "Qanthx1072 INJECTED INTO ATTACKER TRANSFER",
    };
    // MUST return false because 9999999999 is NOT a trusted physical account!
    expect(isReceiverAccountMatch("TUITION", intent, maliciousParsed)).toBe(false);
  });

  // TEST 5: Wrong paymentLinkId
  test("5. Wrong paymentLinkId: verified webhook with wrong paymentLinkId triggers LINK_MISMATCH", async () => {
    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(studentUser));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(studentUser));
    const payment = payRes.body.data;

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "correct_plink_123",
      "providerMetadata.accountNumber": "VQRQANTHX1072",
    });

    const origVerify = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_ch, body) => body.data;

    try {
      const webhookRes = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({
          data: {
            orderCode: payment.orderCode,
            amount: 3000,
            accountNumber: "4008999999",
            description: "Qanthx1072 CASSO EDUNITY HP " + payment.orderCode,
            reference: `FT_LINK_MIS_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "WRONG_PLINK_999",
            code: "00",
          },
          signature: "mock_sig",
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.data.eventStatus).toBe("LINK_MISMATCH");
      expect(webhookRes.body.data.reconciliationReason).toBe("LINK_MISMATCH");
    } finally {
      payosService.verifyWebhookPayload = origVerify;
    }
  });

  // TEST 6: Wrong channel
  test("6. Wrong channel: TUITION payment sent to DONATION route triggers PURPOSE_CHANNEL_MISMATCH", async () => {
    const student6 = await User.create({
      fullName: "Student 6",
      email: `student6_${Date.now()}@edunity.test`,
      passwordHash: hashPassword("password123"),
      role: "STUDENT",
      status: "ACTIVE",
    });

    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(student6));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student6));
    const payment = payRes.body.data;

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "plink_channel_test",
      "providerMetadata.accountNumber": "VQRQANTHX1072",
    });

    const origVerify = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_ch, body) => body.data;

    try {
      const webhookRes = await request(app)
        .post("/api/payments/webhooks/payos/donation")
        .send({
          data: {
            orderCode: payment.orderCode,
            amount: 3000,
            accountNumber: "4008999999",
            description: "Qanthx1072 EDUNITY HP " + payment.orderCode,
            reference: `FT_WRONG_CH_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "plink_channel_test",
            code: "00",
          },
          signature: "mock_sig",
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.data.eventStatus).toBe("NEEDS_REVIEW");
      expect(webhookRes.body.data.reconciliationReason).toBe("PURPOSE_CHANNEL_MISMATCH");
    } finally {
      payosService.verifyWebhookPayload = origVerify;
    }
  });

  // TEST 7: Wrong amount
  test("7. Wrong amount: transfer amount mismatch triggers AMOUNT_MISMATCH", async () => {
    const student7 = await User.create({
      fullName: "Student 7",
      email: `student7_${Date.now()}@edunity.test`,
      passwordHash: hashPassword("password123"),
      role: "STUDENT",
      status: "ACTIVE",
    });

    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(student7));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student7));
    const payment = payRes.body.data;

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "plink_amt_test",
      "providerMetadata.accountNumber": "VQRQANTHX1072",
    });

    const origVerify = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_ch, body) => body.data;

    try {
      const webhookRes = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({
          data: {
            orderCode: payment.orderCode,
            amount: 5000, // expected 3000
            accountNumber: "4008999999",
            description: "Qanthx1072 EDUNITY HP " + payment.orderCode,
            reference: `FT_WRONG_AMT_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "plink_amt_test",
            code: "00",
          },
          signature: "mock_sig",
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.data.eventStatus).toBe("AMOUNT_MISMATCH");
      expect(webhookRes.body.data.reconciliationReason).toBe("AMOUNT_MISMATCH");
    } finally {
      payosService.verifyWebhookPayload = origVerify;
    }
  });

  // TEST 8: Duplicate transaction (REFERENCE_COLLISION)
  test("8. Duplicate transaction: reusing the same providerReference with a different orderCode triggers REFERENCE_COLLISION", async () => {
    const student8 = await User.create({
      fullName: "Student 8",
      email: `student8_${Date.now()}@edunity.test`,
      passwordHash: hashPassword("password123"),
      role: "STUDENT",
      status: "ACTIVE",
    });

    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(student8));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student8));
    const payment = payRes.body.data;

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "plink_collision_1",
      "providerMetadata.accountNumber": "VQRQANTHX1072",
    });

    const origVerify = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_ch, body) => body.data;

    try {
      // First event with valid intent and reference FT_REF_COLLISION_01
      const res1 = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({
          data: {
            orderCode: payment.orderCode,
            amount: 3000,
            accountNumber: "4008999999",
            description: "Qanthx1072 FIRST ORDER",
            reference: `FT_REF_COLLISION_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "plink_collision_1",
            code: "00",
          },
          signature: "mock_sig",
        });
      expect(res1.status).toBe(200);
      expect(["READY_FOR_DISPATCH", "DISPATCHED"]).toContain(res1.body.data.eventStatus);

      // Second event with SAME reference but DIFFERENT orderCode
      const res2 = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({
          data: {
            orderCode: payment.orderCode + 999,
            amount: 3000,
            accountNumber: "4008999999",
            description: "Qanthx1072 SECOND ORDER REUSING SAME REF",
            reference: `FT_REF_COLLISION_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "plink_collision_2",
            code: "00",
          },
          signature: "mock_sig",
        });
      expect(res2.status).toBe(200);
      expect(res2.body.data.idempotent).toBe(true);
      expect(res2.body.data.reconciliationReason).toBe("REFERENCE_COLLISION");
    } finally {
      payosService.verifyWebhookPayload = origVerify;
    }
  });

  // TEST 9: Expired enrollment recovery
  test("9. Expired enrollment recovery: transfer arriving after enrollment is EXPIRED creates reconciliation record without corrupting capacity", async () => {
    const student9 = await User.create({
      fullName: "Student 9",
      email: `student9_${Date.now()}@edunity.test`,
      passwordHash: hashPassword("password123"),
      role: "STUDENT",
      status: "ACTIVE",
    });

    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(student9));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student9));
    const payment = payRes.body.data;

    // Simulate cron marking enrollment EXPIRED
    await Enrollment.findByIdAndUpdate(enrollmentId, {
      enrollmentStatus: "EXPIRED",
      holdExpiresAt: new Date(Date.now() - 3600000),
    });

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "plink_expired_test",
      "providerMetadata.accountNumber": "VQRQANTHX1072",
    });

    const origVerify = payosService.verifyWebhookPayload;
    payosService.verifyWebhookPayload = async (_ch, body) => body.data;

    try {
      const webhookRes = await request(app)
        .post("/api/payments/webhooks/payos/tuition")
        .send({
          data: {
            orderCode: payment.orderCode,
            amount: 3000,
            accountNumber: "4008999999",
            description: "Qanthx1072 EDUNITY HP " + payment.orderCode,
            reference: `FT_EXP_RECOV_${payment.orderCode}`,
            currency: "VND",
            paymentLinkId: "plink_expired_test",
            code: "00",
          },
          signature: "mock_sig",
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
      expect(webhookRes.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

      // Enrollment must remain EXPIRED until admin reconciles
      const enr = await Enrollment.findById(enrollmentId);
      expect(enr.enrollmentStatus).toBe("EXPIRED");
    } finally {
      payosService.verifyWebhookPayload = origVerify;
    }
  });

  // TEST 10: Payment and expiration concurrency & Verified Provider Query recovery
  test("10. Payment and expiration concurrency: server-initiated settleVerifiedProviderQuery recovers payment with SERVER_PROVIDER_QUERY provenance and blocks unapproved policy with POLICY_BLOCKED", async () => {
    const passwordHash = hashPassword("password123");
    const studentUser3 = await User.create({
      fullName: `Concurrent Student`,
      email: `conc_student_${Date.now()}@edunity.test`,
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
    });

    const enrollRes = await request(app)
      .post(`/api/classes/${testClass._id}/enrollments`)
      .set(as(studentUser3));
    const enrollmentId = enrollRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(studentUser3));
    const payment = payRes.body.data;

    await Payment.findByIdAndUpdate(payment.paymentId, {
      provider: "PAYOS",
      channelKey: "TUITION",
      paymentLinkId: "plink_conc_test",
      "providerMetadata.accountNumber": "VQRQANTHX8888",
    });

    const mockInfo = {
      id: "plink_conc_test",
      orderCode: payment.orderCode,
      amount: 3000,
      amountPaid: 3000,
      amountRemaining: 0,
      status: "PAID",
      transactions: [
        {
          accountNumber: "4008999999",
          amount: 3000,
          description: "Qanthx8888 CASSO12135 EDUNITY HP " + payment.orderCode,
          reference: `FT_CONC_RECOVERY_${payment.orderCode}`,
          transactionDateTime: new Date().toISOString(),
        },
      ],
    };

    // Settle directly via settleVerifiedProviderQuery
    const result = await payosWebhookService.settleVerifiedProviderQuery("TUITION", mockInfo);
    expect(result.acknowledged).toBe(true);
    expect(["READY_FOR_DISPATCH", "DISPATCHED"]).toContain(result.eventStatus);

    // Verify BankTransferEvent records provenance SERVER_PROVIDER_QUERY
    const event = await BankTransferEvent.findOne({ orderCode: payment.orderCode });
    expect(event).toBeTruthy();
    expect(event.metadata.provenance).toBe("SERVER_PROVIDER_QUERY");

    // Verify Payment COMPLETED and Enrollment CONFIRMED
    const updatedPayment = await Payment.findById(payment.paymentId);
    expect(updatedPayment.paymentStatus).toBe("COMPLETED");

    const updatedEnrollment = await Enrollment.findById(enrollmentId);
    expect(updatedEnrollment.enrollmentStatus).toBe("CONFIRMED");

    // Verify TeacherEarning is blocked by POLICY_BLOCKED because commission policy is not approved
    const earning = await TeacherEarning.findOne({ enrollmentId });
    expect(earning).toBeTruthy();
    expect(earning.settlementBlockers).toContain("POLICY_BLOCKED");

    // Idempotent recovery check: calling settleVerifiedProviderQuery second time does NOT duplicate dispatch
    const repeatResult = await payosWebhookService.settleVerifiedProviderQuery("TUITION", mockInfo);
    expect(repeatResult.idempotent).toBe(true);
    expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(1);
  });
});
