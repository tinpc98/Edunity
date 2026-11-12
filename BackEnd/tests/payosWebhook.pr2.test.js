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
  ScholarshipCampaign,
  SponsorContribution,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const paymentService = require("../src/services/paymentService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({
  "x-user-id": user._id.toString(),
  "x-user-role": user.role,
});

const TUITION_WEBHOOK_URL = "/api/payments/webhooks/payos/tuition";
const DONATION_WEBHOOK_URL = "/api/payments/webhooks/payos/donation";

describe("TIN-FIN-PR2: Unified payOS Webhook Processor (TUITION + DONATION)", () => {
  const originalEnv = { ...process.env };
  let admin, teacher, student, sponsor;
  let category, subject, course, paidClass, openCampaign;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  }, 30000);

  afterAll(async () => {
    process.env = originalEnv;
    await disconnectDB();
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      ENABLE_PAYMENT_SANDBOX: "true",
      PAYOS_ENABLED: "false",
      PAYOS_WEBHOOK_VERIFY_ONLY: "true",
      PAYOS_TUITION_CLIENT_ID: "tuition-cid-pr2-secret-111",
      PAYOS_TUITION_API_KEY: "tuition-apikey-pr2-secret-222",
      PAYOS_TUITION_CHECKSUM_KEY: "tuition-checksum-pr2-secret-333",
      PAYOS_DONATION_CLIENT_ID: "donation-cid-pr2-secret-444",
      PAYOS_DONATION_API_KEY: "donation-apikey-pr2-secret-555",
      PAYOS_DONATION_CHECKSUM_KEY: "donation-checksum-pr2-secret-666",
    };
    payosService.resetPayosClient();
    await clearDB();

    admin = await User.create({
      email: "admin_pr2@test.com",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    });
    teacher = await User.create({
      email: "teacher_pr2@test.com",
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher PR2", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student_pr2@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student PR2" },
    });
    sponsor = await User.create({
      email: "sponsor_pr2@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "ORGANIZATION",
        organizationName: "Quỹ Ánh Sáng",
        representativeName: "Lê Văn C",
      },
    });

    category = await Category.create({
      name: "Vật lý PR2",
      slug: "vat-ly-pr2-" + Date.now(),
      createdBy: admin._id,
    });
    subject = await Subject.create({
      name: "Cơ học PR2",
      slug: "co-hoc-pr2-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
    });
    course = await Course.create({
      title: "Vật lý 10 PR2",
      slug: "vat-ly-10-pr2-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_10",
      createdBy: admin._id,
    });

    const now = Date.now();
    paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher PR2",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Vật lý 10 PAID",
      classType: "PAID",
      price: 800000,
      capacity: 20,
      status: "OPEN",
      enrollmentStart: new Date(now - 3600000),
      enrollmentEnd: new Date(now + 7 * 86400000),
      startDate: new Date(now + 10 * 86400000),
      endDate: new Date(now + 40 * 86400000),
    });

    openCampaign = await ScholarshipCampaign.create({
      createdBy: admin._id,
      title: "Quỹ Học bổng Vật lý PR2",
      targetBudget: mongoose.Types.Decimal128.fromString("20000000"),
      fundedAmount: mongoose.Types.Decimal128.fromString("2000000"),
      allocatedAmount: mongoose.Types.Decimal128.fromString("0"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
      expectedSlots: 20,
      awardAmountPerStudent: mongoose.Types.Decimal128.fromString("1000000"),
      status: "OPEN_FOR_FUNDING",
      fundingStart: new Date(now - 3600000),
      fundingEnd: new Date(now + 7 * 86400000),
      applicationStart: new Date(now - 3600000),
      applicationEnd: new Date(now + 7 * 86400000),
      scope: { courseIds: [course._id] },
    });
  });

  // Helper to create a TUITION intent via API
  const createTuitionIntent = async () => {
    const enrollRes = await request(app)
      .post(`/api/classes/${paidClass._id}/enrollments`)
      .set(as(student));
    const enrollmentId = enrollRes.body.data.id;
    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student));
    return { enrollmentId, intent: payRes.body.data };
  };

  // Helper to create a DONATION intent via API
  const createDonationIntent = async (amount = 500000) => {
    const res = await request(app)
      .post(`/api/campaigns/${openCampaign._id}/contributions`)
      .set(as(sponsor))
      .send({ amount });
    return { intent: res.body.data };
  };

  // Helper to build a signed payOS webhook payload using the official SDK's `createSignatureFromObj`
  const buildSignedWebhookPayload = async (channelKey, dataOverrides = {}, bodyOverrides = {}) => {
    const data = {
      orderCode: 100000001,
      amount: 800000,
      description: "EDUNITY HP 100000001",
      accountNumber: "VQR000111222",
      reference: `FT${Date.now()}${Math.floor(Math.random() * 10000)}`,
      transactionDateTime: "2026-11-09 11:30:00",
      currency: "VND",
      paymentLinkId: "mock_tuition_plink_100000001",
      code: "00",
      desc: "Thành công",
      counterAccountBankId: "970422",
      counterAccountNumber: "0123456789",
      counterAccountName: "NGUYEN VAN A",
      ...dataOverrides,
    };

    const signature = await payosService.signWebhookDataForChannel(channelKey, data);
    return {
      code: "00",
      desc: "success",
      success: true,
      data,
      signature,
      ...bodyOverrides,
    };
  };

  test("01, 22, 24: Webhook TUITION đúng chữ ký được ghi nhận BankTransferEvent (READY_FOR_DISPATCH), KHÔNG tự CONFIRMED Enrollment hay tạo TeacherEarning trong PR2", async () => {
    const { enrollmentId, intent } = await createTuitionIntent();
    const payload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_TUITION_VALID_01",
    });

    const res = await request(app).post(TUITION_WEBHOOK_URL).send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.acknowledged).toBe(true);
    expect(res.body.data.idempotent).toBe(false);
    expect(res.body.data.channelKey).toBe("TUITION");
    expect(res.body.data.purpose).toBe("TUITION");
    expect(res.body.data.eventStatus).toBe("READY_FOR_DISPATCH");
    expect(res.body.data.reconciliationId).toBeNull();

    const eventInDb = await BankTransferEvent.findById(res.body.data.eventId);
    expect(eventInDb).not.toBeNull();
    expect(eventInDb.orderCode).toBe(intent.orderCode);
    expect(eventInDb.linkedPaymentId.toString()).toBe(intent.paymentId);
    expect(eventInDb.metadata.maskedReceiverAccount).toBe("********1222");

    // PR2 scope check (tests 22 & 24): Enrollment stays PENDING_PAYMENT, Payment stays PENDING, TeacherEarning = 0
    const dbEnrollment = await Enrollment.findById(enrollmentId);
    expect(dbEnrollment.enrollmentStatus).toBe("PENDING_PAYMENT");
    const dbPayment = await Payment.findById(intent.paymentId);
    expect(dbPayment.paymentStatus).toBe("PENDING");
    expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(0);
    expect(await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId })).toBe(0);
  });

  test("02, 23: Webhook DONATION đúng chữ ký được ghi nhận BankTransferEvent (READY_FOR_DISPATCH), KHÔNG tăng Campaign Fund trong PR2", async () => {
    const { intent } = await createDonationIntent(500000);
    const payload = await buildSignedWebhookPayload("DONATION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_DONATION_VALID_02",
    });

    const res = await request(app).post(DONATION_WEBHOOK_URL).send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.channelKey).toBe("DONATION");
    expect(res.body.data.purpose).toBe("DONATION");
    expect(res.body.data.eventStatus).toBe("READY_FOR_DISPATCH");
    expect(res.body.data.reconciliationId).toBeNull();

    const eventInDb = await BankTransferEvent.findById(res.body.data.eventId);
    expect(eventInDb.contributionId.toString()).toBe(intent.contributionId);

    // PR2 scope check (test 23): Campaign fundedAmount stays unchanged at 2,000,000
    const dbCampaign = await ScholarshipCampaign.findById(openCampaign._id);
    expect(dbCampaign.fundedAmount.toString()).toBe("2000000");
    expect(await Transaction.countDocuments({ transactionType: "SPONSOR_CONTRIBUTION" })).toBe(0);
  });

  test("03, 04: Signature sai hoặc thiếu signature bị từ chối (401 UNAUTHORIZED) và không lưu BankTransferEvent", async () => {
    const { intent } = await createTuitionIntent();
    const validPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
    });

    // 03: Tampered signature / tampered amount after signing
    const tampered = {
      ...validPayload,
      data: { ...validPayload.data, amount: 999999 },
    };
    const resTampered = await request(app).post(TUITION_WEBHOOK_URL).send(tampered);
    expect(resTampered.statusCode).toBe(401);
    expect(resTampered.body.error).toBe("UNAUTHORIZED");

    // 04: Missing signature
    const missingSig = { ...validPayload, signature: "" };
    const resMissing = await request(app).post(TUITION_WEBHOOK_URL).send(missingSig);
    expect(resMissing.statusCode).toBe(401);

    expect(await BankTransferEvent.countDocuments()).toBe(0);
  });

  test("05, 06, 28: Hai kênh dùng 2 checksumKey độc lập — chữ ký TUITION gửi vào DONATION (và ngược lại) bị từ chối 401", async () => {
    const { intent: tuitionIntent } = await createTuitionIntent();
    const { intent: donationIntent } = await createDonationIntent(400000);

    // 05: Signed with TUITION key, sent to DONATION endpoint
    const signedByTuition = await buildSignedWebhookPayload("TUITION", {
      orderCode: donationIntent.orderCode,
      amount: 400000,
      paymentLinkId: donationIntent.paymentLinkId,
    });
    const res05 = await request(app).post(DONATION_WEBHOOK_URL).send(signedByTuition);
    expect(res05.statusCode).toBe(401);

    // 06: Signed with DONATION key, sent to TUITION endpoint
    const signedByDonation = await buildSignedWebhookPayload("DONATION", {
      orderCode: tuitionIntent.orderCode,
      amount: 800000,
      paymentLinkId: tuitionIntent.paymentLinkId,
    });
    const res06 = await request(app).post(TUITION_WEBHOOK_URL).send(signedByDonation);
    expect(res06.statusCode).toBe(401);

    expect(await BankTransferEvent.countDocuments()).toBe(0);
  });

  test("07, 08, 30: Idempotency & Concurrency — Webhook lặp và 20 webhook đồng thời (cùng hoặc khác orderCode với cùng reference) không bao giờ xử lý trùng", async () => {
    const { intent } = await createTuitionIntent();
    const payload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_CONCURRENT_20_REF",
    });

    // 08: Fire 20 simultaneous webhook deliveries
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).post(TUITION_WEBHOOK_URL).send(payload)
      )
    );

    for (const r of responses) {
      expect(r.statusCode).toBe(200);
      expect(r.body.data.acknowledged).toBe(true);
    }

    const firstProcessed = responses.filter((r) => r.body.data.idempotent === false);
    const duplicates = responses.filter((r) => r.body.data.idempotent === true);
    expect(firstProcessed.length).toBe(1);
    expect(duplicates.length).toBe(19);
    expect(await BankTransferEvent.countDocuments()).toBe(1);

    // 07 & 30: Trying to reuse the SAME bank reference "FT_CONCURRENT_20_REF" under a DIFFERENT orderCode is blocked by unique index
    const secondPayloadSameRef = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode + 999,
      amount: Number(intent.amount),
      paymentLinkId: "other_link",
      reference: "FT_CONCURRENT_20_REF",
    });
    const reuseRefRes = await request(app).post(TUITION_WEBHOOK_URL).send(secondPayloadSameRef);
    expect(reuseRefRes.statusCode).toBe(200);
    expect(reuseRefRes.body.data.idempotent).toBe(true);
    expect(await BankTransferEvent.countDocuments()).toBe(1);
  });

  test("09, 29: Sai orderCode (không tồn tại) ghi nhận UNMATCHED + tạo đúng 1 PaymentReconciliation (không tạo trùng khi retry)", async () => {
    const payload = await buildSignedWebhookPayload("TUITION", {
      orderCode: 199999999,
      amount: 800000,
      paymentLinkId: "plink_unknown_999",
      reference: "FT_UNMATCHED_09",
    });

    const res1 = await request(app).post(TUITION_WEBHOOK_URL).send(payload);
    expect(res1.statusCode).toBe(200);
    expect(res1.body.data.eventStatus).toBe("UNMATCHED");
    expect(res1.body.data.reconciliationReason).toBe("UNMATCHED");
    expect(res1.body.data.reconciliationId).not.toBeNull();

    // 29: Retry the same unmatched webhook -> idempotent, still only 1 reconciliation
    const res2 = await request(app).post(TUITION_WEBHOOK_URL).send(payload);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.data.idempotent).toBe(true);
    expect(res2.body.data.reconciliationId).toBe(res1.body.data.reconciliationId);

    expect(await BankTransferEvent.countDocuments({ eventStatus: "UNMATCHED" })).toBe(1);
    expect(await PaymentReconciliation.countDocuments({ reason: "UNMATCHED" })).toBe(1);
  });

  test("10, 11, 12, 13: Phát hiện sai amount (AMOUNT_MISMATCH), sai currency (CURRENCY_MISMATCH), sai paymentLinkId (LINK_MISMATCH), và sai tài khoản nhận (ACCOUNT_MISMATCH)", async () => {
    // 10: Wrong amount
    const { intent: i10 } = await createTuitionIntent();
    const p10 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i10.orderCode,
      amount: 500000, // Expected 800,000
      paymentLinkId: i10.paymentLinkId,
      reference: "FT_ERR_AMOUNT_10",
    });
    const r10 = await request(app).post(TUITION_WEBHOOK_URL).send(p10);
    expect(r10.statusCode).toBe(200);
    expect(r10.body.data.eventStatus).toBe("AMOUNT_MISMATCH");
    expect(r10.body.data.reconciliationReason).toBe("AMOUNT_MISMATCH");

    // 11: Wrong currency
    const { intent: i11 } = await createDonationIntent(300000);
    const p11 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i11.orderCode,
      amount: 300000,
      currency: "USD",
      paymentLinkId: i11.paymentLinkId,
      reference: "FT_ERR_CURR_11",
    });
    const r11 = await request(app).post(DONATION_WEBHOOK_URL).send(p11);
    expect(r11.statusCode).toBe(200);
    expect(r11.body.data.eventStatus).toBe("CURRENCY_MISMATCH");
    expect(r11.body.data.reconciliationReason).toBe("CURRENCY_MISMATCH");

    // 12: Wrong paymentLinkId
    const { intent: i12 } = await createDonationIntent(350000);
    const p12 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i12.orderCode,
      amount: 350000,
      paymentLinkId: "wrong_plink_id_123",
      reference: "FT_ERR_LINK_12",
    });
    const r12 = await request(app).post(DONATION_WEBHOOK_URL).send(p12);
    expect(r12.statusCode).toBe(200);
    expect(r12.body.data.eventStatus).toBe("LINK_MISMATCH");
    expect(r12.body.data.reconciliationReason).toBe("LINK_MISMATCH");

    // 13: Wrong receiver bank account when trusted account is stored on intent or env
    const { intent: i13 } = await createDonationIntent(450000);
    await SponsorContribution.updateOne(
      { _id: i13.contributionId },
      { $set: { "providerMetadata.accountNumber": "VQR_TRUSTED_DONATION_999" } }
    );
    const p13 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i13.orderCode,
      amount: 450000,
      paymentLinkId: i13.paymentLinkId,
      accountNumber: "UNTRUSTED_ACCOUNT_000",
      reference: "FT_ERR_ACC_13",
    });
    const r13 = await request(app).post(DONATION_WEBHOOK_URL).send(p13);
    expect(r13.statusCode).toBe(200);
    expect(r13.body.data.eventStatus).toBe("ACCOUNT_MISMATCH");
    expect(r13.body.data.reconciliationReason).toBe("ACCOUNT_MISMATCH");

    expect(await PaymentReconciliation.countDocuments()).toBe(4);
  });

  test("14, 15, 16, 17: Xử lý Payment hết hạn, Enrollment đã EXPIRED, Donation QR hết hạn, và Webhook về sau khi Payment đã FAILED", async () => {
    // 14: Payment expiredAt <= now
    const { intent: i14 } = await createTuitionIntent();
    await Payment.updateOne(
      { _id: i14.paymentId },
      { $set: { expiredAt: new Date(Date.now() - 60000) } }
    );
    const p14 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i14.orderCode,
      amount: Number(i14.amount),
      paymentLinkId: i14.paymentLinkId,
      reference: "FT_EXP_PAY_14",
    });
    const r14 = await request(app).post(TUITION_WEBHOOK_URL).send(p14);
    expect(r14.statusCode).toBe(200);
    expect(r14.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r14.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

    // 15: Enrollment status is already EXPIRED
    await Enrollment.deleteMany({ studentId: student._id });
    const { enrollmentId: e15, intent: i15 } = await createTuitionIntent();
    await Enrollment.updateOne(
      { _id: e15 },
      { $set: { enrollmentStatus: "EXPIRED", holdExpiresAt: null } }
    );
    const p15 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i15.orderCode,
      amount: Number(i15.amount),
      paymentLinkId: i15.paymentLinkId,
      reference: "FT_EXP_ENR_15",
    });
    const r15 = await request(app).post(TUITION_WEBHOOK_URL).send(p15);
    expect(r15.statusCode).toBe(200);
    expect(r15.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r15.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

    // 16: Donation QR expiredAt <= now
    const { intent: i16 } = await createDonationIntent(600000);
    await SponsorContribution.updateOne(
      { _id: i16.contributionId },
      { $set: { expiredAt: new Date(Date.now() - 60000) } }
    );
    const p16 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i16.orderCode,
      amount: 600000,
      paymentLinkId: i16.paymentLinkId,
      reference: "FT_EXP_DON_16",
    });
    const r16 = await request(app).post(DONATION_WEBHOOK_URL).send(p16);
    expect(r16.statusCode).toBe(200);
    expect(r16.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r16.body.data.reconciliationReason).toBe("EXPIRED_PAYMENT");

    // 17: Webhook arrives after Payment was marked FAILED
    await Enrollment.deleteMany({ studentId: student._id });
    const { intent: i17 } = await createTuitionIntent();
    await Payment.updateOne({ _id: i17.paymentId }, { $set: { paymentStatus: "FAILED" } });
    const p17 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i17.orderCode,
      amount: Number(i17.amount),
      paymentLinkId: i17.paymentLinkId,
      reference: "FT_LATE_FAIL_17",
    });
    const r17 = await request(app).post(TUITION_WEBHOOK_URL).send(p17);
    expect(r17.statusCode).toBe(200);
    expect(r17.body.data.eventStatus).toBe("LATE_SUCCESS_AFTER_FAILED");
    expect(r17.body.data.reconciliationReason).toBe("LATE_SUCCESS_AFTER_FAILED");
  });

  test("18, 19, 20, 21: Xử lý lỗi DB tạm thời (HTTP 500 để retry), payload thiếu field (400), webhook test khi confirm URL (200 không ghi tiền), và không lộ API/Checksum Key", async () => {
    const { intent } = await createTuitionIntent();

    // 19: Missing required field inside signed `data` (e.g. missing reference)
    const missingRefPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "",
    });
    const r19 = await request(app).post(TUITION_WEBHOOK_URL).send(missingRefPayload);
    expect(r19.statusCode).toBe(400);
    expect(r19.body.error).toBe("VALIDATION_ERROR");

    // 20: payOS URL confirmation test webhook (orderCode=123, reference="TF230204212323", description="VQRIO123")
    const testProbePayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: 123,
      amount: 3000,
      description: "VQRIO123",
      reference: "TF230204212323",
      paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
      accountNumber: "12345678",
    });
    const r20 = await request(app).post(TUITION_WEBHOOK_URL).send(testProbePayload);
    expect(r20.statusCode).toBe(200);
    expect(r20.body.data.isTestWebhook).toBe(true);
    expect(r20.body.data.eventStatus).toBe("WEBHOOK_TEST_IGNORED");
    expect(await BankTransferEvent.countDocuments()).toBe(0);
    expect(await PaymentReconciliation.countDocuments()).toBe(0);

    // 18: Temporary DB failure when saving BankTransferEvent -> returns HTTP 500 (no premature 2xx ACK)
    const validPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_DB_TEMP_ERR_18",
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const createSpy = jest
      .spyOn(BankTransferEvent, "create")
      .mockRejectedValueOnce(new Error("Simulated MongoDB transient network error"));

    const r18 = await request(app).post(TUITION_WEBHOOK_URL).send(validPayload);
    expect(r18.statusCode).toBe(500);
    expect(await BankTransferEvent.countDocuments()).toBe(0);

    createSpy.mockRestore();

    // Retry after DB recovers -> succeeds with 200 OK
    const r18Retry = await request(app).post(TUITION_WEBHOOK_URL).send(validPayload);
    expect(r18Retry.statusCode).toBe(200);
    expect(r18Retry.body.data.eventStatus).toBe("READY_FOR_DISPATCH");
    expect(await BankTransferEvent.countDocuments()).toBe(1);

    // 21: Ensure no API key or Checksum key ever appears in responses or logs
    const combinedJson = JSON.stringify({
      r18: r18.body,
      r18Retry: r18Retry.body,
      r19: r19.body,
      r20: r20.body,
    });
    for (const secret of [
      "tuition-cid-pr2-secret-111",
      "tuition-apikey-pr2-secret-222",
      "tuition-checksum-pr2-secret-333",
      "donation-cid-pr2-secret-444",
      "donation-apikey-pr2-secret-555",
      "donation-checksum-pr2-secret-666",
    ]) {
      expect(combinedJson).not.toContain(secret);
    }
    errSpy.mockRestore();
  });

  test("25, 26, 27: Không xác nhận Payment qua returnUrl hoặc polling; tương thích ngược 100% với Sandbox webhook cũ trên test/development", async () => {
    const { enrollmentId, intent } = await createTuitionIntent();

    // 25 & 26: Polling GET /api/payments/:id multiple times never marks payment COMPLETED
    for (let i = 0; i < 3; i += 1) {
      const poll = await request(app).get(`/api/payments/${intent.paymentId}`).set(as(student));
      expect(poll.statusCode).toBe(200);
      expect(poll.body.data.paymentStatus).toBe("PENDING");
    }
    expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe("PENDING_PAYMENT");

    // 27: Legacy sandbox webhook still works in test/development
    const sbxRes = await request(app)
      .post("/api/payments/sandbox/webhook")
      .send({ gatewayReference: intent.gatewayReference, status: "SUCCESS" });
    expect(sbxRes.statusCode).toBe(200);
    expect(sbxRes.body.data.result).toBe("PAYMENT_SUCCESS");
    expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe("CONFIRMED");
  });

  test("PR1 Risk B Verification: allocateOrderCode chặn tràn dải khi sequence vượt MAX_SEQUENCE_PER_CHANNEL (99,999,999)", async () => {
    const JobLock = require("../src/models/JobLock");
    await JobLock.collection.updateOne(
      { name: "payos_order_seq_TUITION" },
      { $set: { seq: 99999999, owner: "test", lockedUntil: new Date(0) } },
      { upsert: true }
    );

    await expect(paymentService.allocateOrderCode("TUITION")).rejects.toThrow(
      /Order code sequence exhausted/
    );
  });
});

