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
  Enrollment,
  Payment,
  ScholarshipCampaign,
  ScholarshipApplication,
  Scholarship,
  ScholarshipUsage,
  SponsorContribution,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const financialDispatchService = require("../src/services/financialDispatchService");
const contributionService = require("../src/services/contributionService");
const {
  completeFinishedClasses,
} = require("../src/services/classLifecycleService");
const {
  expireEnrollmentTransaction,
} = require("../src/jobs/expireEnrollmentsJob");
const { toNum, toDec } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

const as = (user) => ({
  "x-user-id": user._id.toString(),
  "x-user-role": user.role,
});

const TUITION_WEBHOOK_URL = "/api/payments/webhooks/payos/tuition";
const DONATION_WEBHOOK_URL = "/api/payments/webhooks/payos/donation";

describe("TIN-FIN-PR3: Atomic Financial Dispatch (TUITION & DONATION), Late Payment & Post-ACK Outbox Recovery", () => {
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
      PAYOS_TUITION_CLIENT_ID: "tuition-cid-pr3-secret-111",
      PAYOS_TUITION_API_KEY: "tuition-apikey-pr3-secret-222",
      PAYOS_TUITION_CHECKSUM_KEY: "tuition-checksum-pr3-secret-333",
      PAYOS_DONATION_CLIENT_ID: "donation-cid-pr3-secret-444",
      PAYOS_DONATION_API_KEY: "donation-apikey-pr3-secret-555",
      PAYOS_DONATION_CHECKSUM_KEY: "donation-checksum-pr3-secret-666",
    };
    delete process.env.PAYOS_WEBHOOK_VERIFY_ONLY;
    payosService.resetPayosClient();
    await clearDB();

    admin = await User.create({
      email: "admin_pr3@test.com",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    });
    teacher = await User.create({
      email: "teacher_pr3@test.com",
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Teacher PR3",
        verificationStatus: "VERIFIED",
      },
    });
    student = await User.create({
      email: "student_pr3@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student PR3" },
    });
    sponsor = await User.create({
      email: "sponsor_pr3@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "ORGANIZATION",
        organizationName: "Quỹ Tương Lai Xanh",
        representativeName: "Trần Thị B",
      },
    });

    category = await Category.create({
      name: "Hóa học PR3",
      slug: "hoa-hoc-pr3-" + Date.now(),
      createdBy: admin._id,
    });
    subject = await Subject.create({
      name: "Hóa hữu cơ PR3",
      slug: "hoa-huu-co-pr3-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
    });
    course = await Course.create({
      title: "Hóa học 11 PR3",
      slug: "hoa-hoc-11-pr3-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      gradeLevel: "GRADE_11",
      createdBy: admin._id,
    });

    const now = Date.now();
    paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher PR3",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Hóa 11 PAID",
      classType: "PAID",
      price: 1000000,
      capacity: 20,
      status: "OPEN",
      enrollmentStart: new Date(now - 3600000),
      enrollmentEnd: new Date(now + 7 * 86400000),
      startDate: new Date(now + 10 * 86400000),
      endDate: new Date(now + 40 * 86400000),
    });

    openCampaign = await ScholarshipCampaign.create({
      createdBy: admin._id,
      title: "Quỹ Học bổng Hóa học PR3",
      targetBudget: toDec(20000000),
      fundedAmount: toDec(5000000),
      allocatedAmount: toDec(1000000),
      usedAmount: toDec(0),
      expectedSlots: 20,
      awardAmountPerStudent: toDec(1000000),
      status: "OPEN_FOR_FUNDING",
      fundingStart: new Date(now - 3600000),
      fundingEnd: new Date(now + 7 * 86400000),
      applicationStart: new Date(now - 3600000),
      applicationEnd: new Date(now + 7 * 86400000),
      scope: { courseIds: [course._id] },
    });
  });

  const createTuitionIntent = async (targetStudent = student) => {
    const enrollRes = await request(app)
      .post(`/api/classes/${paidClass._id}/enrollments`)
      .set(as(targetStudent));
    const enrollmentId = enrollRes.body.data.id;
    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(targetStudent));
    return { enrollmentId, intent: payRes.body.data };
  };

  const createDonationIntent = async (amount = 500000, extraBody = {}) => {
    const res = await request(app)
      .post(`/api/campaigns/${openCampaign._id}/contributions`)
      .set(as(sponsor))
      .send({ amount, ...extraBody });
    return { intent: res.body.data };
  };

  const buildSignedWebhookPayload = async (
    channelKey,
    dataOverrides = {},
    bodyOverrides = {},
  ) => {
    const data = {
      orderCode: 100000001,
      amount: 1000000,
      description: "EDUNITY HP 100000001",
      accountNumber: "VQR000111222",
      reference: `FT_${channelKey}_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      transactionDateTime: "2026-11-09 15:00:00",
      currency: "VND",
      paymentLinkId: "mock_tuition_plink_100000001",
      code: "00",
      desc: "Thành công",
      counterAccountBankId: "970422",
      counterAccountNumber: "0123456789",
      counterAccountName: "NGUYEN VAN A",
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
      ...bodyOverrides,
    };
  };

  const grantScholarshipToStudent = async (
    amountNum = 400000,
    targetStudent = student,
  ) => {
    const appDoc = await ScholarshipApplication.create({
      campaignId: openCampaign._id,
      studentId: targetStudent._id,
      status: "APPROVED",
    });
    const scholarship = await Scholarship.create({
      campaignId: openCampaign._id,
      applicationId: appDoc._id,
      studentId: targetStudent._id,
      allocatedAmount: toDec(amountNum),
      remainingAmount: toDec(amountNum),
      validFrom: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      status: "ACTIVE",
    });
    return scholarship;
  };

  // =========================================================================
  // A. TUITION Direct Payment (Tests 01 - 06)
  // =========================================================================
  test("01, 02, 03, 04, 05, 06, 39: TUITION Direct Payment — Atomic dispatch confirms Payment, Enrollment, Transaction, and PENDING TeacherEarning without double-incrementing Class.enrolledCount or releasing AVAILABLE early", async () => {
    const { enrollmentId, intent } = await createTuitionIntent();

    // Seat was reserved once during createEnrollment (enrolledCount = 1)
    expect((await Class.findById(paidClass._id)).enrolledCount).toBe(1);

    const payload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: Number(intent.amount),
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_PR3_DIRECT_01",
    });

    const res = await request(app).post(TUITION_WEBHOOK_URL).send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.acknowledged).toBe(true);
    expect(res.body.data.dispatched).toBe(true);
    expect(res.body.data.eventStatus).toBe("DISPATCHED");
    expect(res.body.data.dispatchStatus).toBe("DISPATCHED");

    // 01: BankTransferEvent DISPATCHED & Payment COMPLETED
    const dbEvent = await BankTransferEvent.findById(res.body.data.eventId);
    expect(dbEvent.eventStatus).toBe("DISPATCHED");
    expect(dbEvent.dispatchStatus).toBe("DISPATCHED");
    expect(dbEvent.dispatchedAt).not.toBeNull();

    const dbPayment = await Payment.findById(intent.paymentId);
    expect(dbPayment.paymentStatus).toBe("COMPLETED");
    expect(dbPayment.providerStatus).toBe("PAID");
    expect(dbPayment.paidAt).not.toBeNull();

    // 02: Enrollment CONFIRMED, holdExpiresAt = null, paymentSource = DIRECT_PAYMENT
    const dbEnrollment = await Enrollment.findById(enrollmentId);
    expect(dbEnrollment.enrollmentStatus).toBe("CONFIRMED");
    expect(dbEnrollment.paymentSource).toBe("DIRECT_PAYMENT");
    expect(dbEnrollment.holdExpiresAt).toBeNull();
    expect(toNum(dbEnrollment.amountPaidViaPayment)).toBe(1000000);
    expect(toNum(dbEnrollment.amountPaidViaScholarship)).toBe(0);

    // 03: Exactly 1 Transaction ENROLLMENT_PAYMENT COMPLETED
    const txs = await Transaction.find({ relatedEnrollmentId: enrollmentId });
    expect(txs.length).toBe(1);
    expect(txs[0].transactionType).toBe("ENROLLMENT_PAYMENT");
    expect(txs[0].status).toBe("COMPLETED");
    expect(toNum(txs[0].amount)).toBe(1000000);
    expect(txs[0].relatedPaymentId.toString()).toBe(intent.paymentId);
    expect(txs[0].relatedBankEventId.toString()).toBe(dbEvent._id.toString());

    // 04 & 05 & 39: Exactly 1 TeacherEarning in PENDING status (never AVAILABLE), with commissionRate & tuitionAmount snapshot
    const earnings = await TeacherEarning.find({ enrollmentId });
    expect(earnings.length).toBe(1);
    expect(earnings[0].status).toBe("PENDING");
    expect(earnings[0].settlementHoldRequired).toBe(true);
    expect(earnings[0].commissionRate).toBe(0.1);
    expect(toNum(earnings[0].tuitionAmount)).toBe(1000000);
    expect(toNum(earnings[0].grossAmount)).toBe(1000000);
    expect(toNum(earnings[0].commissionAmount)).toBe(100000);
    expect(toNum(earnings[0].netAmount)).toBe(900000);

    // 06: Class.enrolledCount stays 1 (not incremented a second time)
    expect((await Class.findById(paidClass._id)).enrolledCount).toBe(1);

    // 05 & Section 4.8: Even if class sessions finish and completeFinishedClasses runs, V3 earning with settlementHoldRequired stays PENDING (blocked until PR7 7-day settlement)
    await Class.updateOne(
      { _id: paidClass._id },
      {
        $set: {
          status: "IN_PROGRESS",
          endDate: new Date(Date.now() - 3600000),
        },
      },
    );
    await Session.create({
      classId: paidClass._id,
      className: paidClass.className,
      teacherId: teacher._id,
      title: "Buổi 1",
      startDatetime: new Date(Date.now() - 7200000),
      endDatetime: new Date(Date.now() - 3600000),
      status: "COMPLETED",
    });
    await completeFinishedClasses(new Date());
    expect((await Class.findById(paidClass._id)).status).toBe("COMPLETED");
    expect((await TeacherEarning.findById(earnings[0]._id)).status).toBe(
      "PENDING",
    );
  });

  // =========================================================================
  // B. TUITION Mixed Scholarship + Co-pay (Tests 07 - 11)
  // =========================================================================
  test("07, 08, 09, 10, 11: TUITION Mixed Scholarship + Co-pay — Confirms Payment, Enrollment, ScholarshipUsage, increments Campaign.usedAmount once, does not double-deduct Scholarship.remainingAmount, creates 2 Transactions & full-tuition TeacherEarning", async () => {
    const scholarship = await grantScholarshipToStudent(400000);

    const enrollRes = await request(app)
      .post(`/api/classes/${paidClass._id}/enrollments`)
      .set(as(student));
    const enrollmentId = enrollRes.body.data.id;

    // 07: Apply partial scholarship (400,000 VND) -> MIXED, remainingDue = 600,000 VND
    const schPayRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/scholarship-payment`)
      .set(as(student))
      .send({ scholarshipId: scholarship._id.toString() });
    expect(schPayRes.statusCode).toBe(200);
    expect(schPayRes.body.data.paymentSource).toBe("MIXED");
    expect(schPayRes.body.data.remainingDue).toBe("600000");

    // Scholarship remainingAmount is already 0 after reserve hold
    expect(
      toNum((await Scholarship.findById(scholarship._id)).remainingAmount),
    ).toBe(0);

    // Create payOS intent for the remaining 600,000 VND
    const payRes = await request(app)
      .post(`/api/enrollments/${enrollmentId}/payments`)
      .set(as(student));
    expect(payRes.statusCode).toBe(201);
    const intent = payRes.body.data;
    expect(intent.amount).toBe("600000");

    // 08: Send verified TUITION webhook for 600,000 VND
    const payload = await buildSignedWebhookPayload("TUITION", {
      orderCode: intent.orderCode,
      amount: 600000,
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_PR3_MIXED_07",
    });
    const webhookRes = await request(app)
      .post(TUITION_WEBHOOK_URL)
      .send(payload);
    expect(webhookRes.statusCode).toBe(200);
    expect(webhookRes.body.data.dispatched).toBe(true);

    const dbPayment = await Payment.findById(intent.paymentId);
    expect(dbPayment.paymentStatus).toBe("COMPLETED");

    const dbEnrollment = await Enrollment.findById(enrollmentId);
    expect(dbEnrollment.enrollmentStatus).toBe("CONFIRMED");
    expect(dbEnrollment.paymentSource).toBe("MIXED");
    expect(toNum(dbEnrollment.amountPaidViaPayment)).toBe(600000);
    expect(toNum(dbEnrollment.amountPaidViaScholarship)).toBe(400000);
    expect(
      toNum(dbEnrollment.amountPaidViaPayment) +
        toNum(dbEnrollment.amountPaidViaScholarship),
    ).toBe(toNum(dbEnrollment.tuitionAmount));

    // 09: ScholarshipUsage transitions PENDING -> CONFIRMED
    const usage = await ScholarshipUsage.findOne({ enrollmentId });
    expect(usage.status).toBe("CONFIRMED");
    expect(toNum(usage.amount)).toBe(400000);

    // 10: Campaign.usedAmount increased by 400,000; Scholarship.remainingAmount stays 0 (not deducted twice) and status = EXHAUSTED
    const dbCampaign = await ScholarshipCampaign.findById(openCampaign._id);
    expect(toNum(dbCampaign.usedAmount)).toBe(400000);
    const dbScholarship = await Scholarship.findById(scholarship._id);
    expect(toNum(dbScholarship.remainingAmount)).toBe(0);
    expect(dbScholarship.status).toBe("EXHAUSTED");

    // 11: 2 Transactions (ENROLLMENT_PAYMENT 600,000 + SCHOLARSHIP_USAGE 400,000) & 1 TeacherEarning on full 1,000,000
    const txs = await Transaction.find({
      relatedEnrollmentId: enrollmentId,
    }).sort({ transactionType: 1 });
    expect(txs.length).toBe(2);
    expect(txs[0].transactionType).toBe("ENROLLMENT_PAYMENT");
    expect(toNum(txs[0].amount)).toBe(600000);
    expect(txs[1].transactionType).toBe("SCHOLARSHIP_USAGE");
    expect(toNum(txs[1].amount)).toBe(400000);

    const earning = await TeacherEarning.findOne({ enrollmentId });
    expect(toNum(earning.grossAmount)).toBe(1000000);
    expect(toNum(earning.commissionAmount)).toBe(100000);
    expect(toNum(earning.netAmount)).toBe(900000);
    expect(earning.status).toBe("PENDING");
  });

  // =========================================================================
  // C. DONATION Sponsor Contribution (Tests 12 - 16)
  // =========================================================================
  test("12, 13, 14, 15, 16: DONATION Sponsor Contribution — Completes contribution, increments Campaign.fundedAmount, creates SPONSOR_CONTRIBUTION Transaction, never creates Enrollment/TeacherEarning, and updates Sponsor reporting", async () => {
    const { intent } = await createDonationIntent(1500000, {
      isAnonymous: true,
    });

    const payload = await buildSignedWebhookPayload("DONATION", {
      orderCode: intent.orderCode,
      amount: 1500000,
      paymentLinkId: intent.paymentLinkId,
      reference: "FT_PR3_DONATION_12",
    });

    const res = await request(app).post(DONATION_WEBHOOK_URL).send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.dispatched).toBe(true);
    expect(res.body.data.eventStatus).toBe("DISPATCHED");

    // 12: SponsorContribution COMPLETED
    const dbContrib = await SponsorContribution.findById(intent.contributionId);
    expect(dbContrib.contributionStatus).toBe("COMPLETED");
    expect(dbContrib.providerStatus).toBe("PAID");
    expect(dbContrib.isAnonymous).toBe(true);
    expect(dbContrib.donorDisplayName).toBe("Nhà tài trợ ẩn danh");

    // 13: ScholarshipCampaign.fundedAmount increased from 5,000,000 -> 6,500,000
    const dbCampaign = await ScholarshipCampaign.findById(openCampaign._id);
    expect(toNum(dbCampaign.fundedAmount)).toBe(6500000);

    // 14: Exactly 1 Transaction SPONSOR_CONTRIBUTION COMPLETED
    const txs = await Transaction.find({
      transactionType: "SPONSOR_CONTRIBUTION",
    });
    expect(txs.length).toBe(1);
    expect(txs[0].status).toBe("COMPLETED");
    expect(toNum(txs[0].amount)).toBe(1500000);
    expect(txs[0].relatedContributionId.toString()).toBe(intent.contributionId);

    // 15: Never creates Enrollment, ScholarshipUsage, TeacherEarning, or Payment document
    expect(await Enrollment.countDocuments()).toBe(0);
    expect(await ScholarshipUsage.countDocuments()).toBe(0);
    expect(await TeacherEarning.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);

    // 16: getMyContributions and getCampaignImpact reflect the completed 1,500,000 donation
    const myContribs = await contributionService.getMyContributions(
      sponsor._id,
      { status: "COMPLETED" },
      { page: 1, pageSize: 10, skip: 0 },
    );
    expect(myContribs.items.length).toBe(1);
    expect(toNum(myContribs.totalContributed)).toBe(1500000);

    const impact = await contributionService.getCampaignImpact(
      sponsor._id,
      openCampaign._id,
    );
    expect(toNum(impact.myContribution.total)).toBe(1500000);
    expect(impact.myContribution.count).toBe(1);
    expect(toNum(impact.fundUsage.fundedAmount)).toBe(6500000);
  });

  // =========================================================================
  // D. Late Payment & Abnormal Cases (Tests 17 - 24)
  // =========================================================================
  test("17, 18, 19, 20, 21, 22, 23, 24, 38: Late Payments & Abnormal Cases — Never auto-reopens expired Enrollment, never creates TeacherEarning, releases held MIXED scholarship on expiry, handles closed Campaign donations & reference collisions safely", async () => {
    // 17: Webhook TUITION arrives after Enrollment is already EXPIRED (and Student even created a new Enrollment later)
    const { enrollmentId: e17, intent: i17 } = await createTuitionIntent();
    await Enrollment.updateOne(
      { _id: e17 },
      { $set: { holdExpiresAt: new Date(Date.now() - 60000) } },
    );
    await expireEnrollmentTransaction(e17);
    expect((await Enrollment.findById(e17)).enrollmentStatus).toBe("EXPIRED");
    expect((await Class.findById(paidClass._id)).enrolledCount).toBe(0);

    // Student creates a NEW Enrollment (Case 3 in Section 6), but late money arrives for OLD orderCode i17
    const { enrollmentId: e17New } = await createTuitionIntent();
    expect((await Enrollment.findById(e17New)).enrollmentStatus).toBe(
      "PENDING_PAYMENT",
    );

    const p17 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i17.orderCode,
      amount: Number(i17.amount),
      paymentLinkId: i17.paymentLinkId,
      reference: "FT_PR3_LATE_ENR_17",
    });
    const r17 = await request(app).post(TUITION_WEBHOOK_URL).send(p17);
    expect(r17.statusCode).toBe(200);
    expect(r17.body.data.dispatched).toBe(false);
    expect(r17.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r17.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

    // Old enrollment stays EXPIRED; new enrollment stays PENDING_PAYMENT (never confirmed by old orderCode!); TeacherEarning = 0
    expect((await Enrollment.findById(e17)).enrollmentStatus).toBe("EXPIRED");
    expect((await Enrollment.findById(e17New)).enrollmentStatus).toBe(
      "PENDING_PAYMENT",
    );
    expect(await TeacherEarning.countDocuments()).toBe(0);
    expect(
      await Transaction.countDocuments({
        relatedPaymentId: i17.paymentId,
        transactionType: "REFUND",
        status: "PENDING",
      }),
    ).toBe(1);

    // Clean up e17New before next sub-case
    await Enrollment.deleteOne({ _id: e17New });
    await Class.updateOne(
      { _id: paidClass._id },
      { $set: { enrolledCount: 0 } },
    );

    // 18 & 24: MIXED Enrollment holdExpiresAt <= now (cron hasn't run yet) when late webhook arrives
    const sch24 = await grantScholarshipToStudent(300000);
    const enrollRes24 = await request(app)
      .post(`/api/classes/${paidClass._id}/enrollments`)
      .set(as(student));
    const e24 = enrollRes24.body.data.id;
    await request(app)
      .post(`/api/enrollments/${e24}/scholarship-payment`)
      .set(as(student))
      .send({ scholarshipId: sch24._id.toString() });
    const payRes24 = await request(app)
      .post(`/api/enrollments/${e24}/payments`)
      .set(as(student));
    const i24 = payRes24.body.data;
    expect(i24.amount).toBe("700000");

    // Simulate holdExpiresAt passed 10s ago BEFORE cron ran
    await Enrollment.updateOne(
      { _id: e24 },
      { $set: { holdExpiresAt: new Date(Date.now() - 10000) } },
    );

    const p24 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i24.orderCode,
      amount: 700000,
      paymentLinkId: i24.paymentLinkId,
      reference: "FT_PR3_LATE_MIXED_24",
    });
    const r24 = await request(app).post(TUITION_WEBHOOK_URL).send(p24);
    expect(r24.statusCode).toBe(200);
    expect(r24.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r24.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

    // Enrollment moved to EXPIRED, seat released, ScholarshipUsage RELEASED & remainingAmount restored to 300,000!
    expect((await Enrollment.findById(e24)).enrollmentStatus).toBe("EXPIRED");
    expect((await Class.findById(paidClass._id)).enrolledCount).toBe(0);
    expect((await ScholarshipUsage.findOne({ enrollmentId: e24 })).status).toBe(
      "RELEASED",
    );
    expect(toNum((await Scholarship.findById(sch24._id)).remainingAmount)).toBe(
      300000,
    );
    expect(
      toNum((await ScholarshipCampaign.findById(openCampaign._id)).usedAmount),
    ).toBe(0);
    expect(await TeacherEarning.countDocuments({ enrollmentId: e24 })).toBe(0);

    // 19: Payment.expiredAt <= now
    const { enrollmentId: e19, intent: i19 } = await createTuitionIntent();
    await Payment.updateOne(
      { _id: i19.paymentId },
      { $set: { expiredAt: new Date(Date.now() - 5000) } },
    );
    const p19 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i19.orderCode,
      amount: Number(i19.amount),
      paymentLinkId: i19.paymentLinkId,
      reference: "FT_PR3_LATE_QR_19",
    });
    const r19 = await request(app).post(TUITION_WEBHOOK_URL).send(p19);
    expect(r19.statusCode).toBe(200);
    expect(r19.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r19.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");
    expect((await Enrollment.findById(e19)).enrollmentStatus).toBe(
      "PENDING_PAYMENT",
    );
    expect(await TeacherEarning.countDocuments({ enrollmentId: e19 })).toBe(0);

    // 20: Webhook arrives after Payment was marked FAILED (LATE_SUCCESS_AFTER_FAILED)
    await Enrollment.deleteOne({ _id: e19 });
    await Class.updateOne(
      { _id: paidClass._id },
      { $set: { enrolledCount: 0 } },
    );
    const { enrollmentId: e20, intent: i20 } = await createTuitionIntent();
    await Payment.updateOne(
      { _id: i20.paymentId },
      { $set: { paymentStatus: "FAILED" } },
    );
    const p20 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i20.orderCode,
      amount: Number(i20.amount),
      paymentLinkId: i20.paymentLinkId,
      reference: "FT_PR3_LATE_FAIL_20",
    });
    const r20 = await request(app).post(TUITION_WEBHOOK_URL).send(p20);
    expect(r20.statusCode).toBe(200);
    expect(r20.body.data.eventStatus).toBe("LATE_SUCCESS_AFTER_FAILED");
    expect(r20.body.data.reconciliationReason).toBe(
      "LATE_SUCCESS_AFTER_FAILED",
    );
    expect((await Enrollment.findById(e20)).enrollmentStatus).toBe(
      "PENDING_PAYMENT",
    );

    // 21: Duplicate providerReference reused with a DIFFERENT orderCode -> blocked + REFERENCE_COLLISION reconciliation
    const p21 = await buildSignedWebhookPayload("TUITION", {
      orderCode: i20.orderCode + 777,
      amount: Number(i20.amount),
      paymentLinkId: "other_plink_21",
      reference: "FT_PR3_LATE_ENR_17", // Already used in sub-test 17!
    });
    const r21 = await request(app).post(TUITION_WEBHOOK_URL).send(p21);
    expect(r21.statusCode).toBe(200);
    expect(r21.body.data.idempotent).toBe(true);
    const collisionRecon = await PaymentReconciliation.findById(
      r21.body.data.reconciliationId,
    );
    expect(
      collisionRecon.auditReferences.some(
        (a) => a.action === "REFERENCE_COLLISION_DETECTED",
      ),
    ).toBe(true);

    // 22: Donation webhook arrives after QR expiredAt
    const { intent: i22 } = await createDonationIntent(400000);
    await SponsorContribution.updateOne(
      { _id: i22.contributionId },
      { $set: { expiredAt: new Date(Date.now() - 10000) } },
    );
    const p22 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i22.orderCode,
      amount: 400000,
      paymentLinkId: i22.paymentLinkId,
      reference: "FT_PR3_EXP_DON_22",
    });
    const r22 = await request(app).post(DONATION_WEBHOOK_URL).send(p22);
    expect(r22.statusCode).toBe(200);
    expect(r22.body.data.eventStatus).toBe("EXPIRED_PAYMENT");
    expect(r22.body.data.reconciliationReason).toBe("EXPIRED_PAYMENT");
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5000000);

    // 23: Donation webhook arrives after ScholarshipCampaign was CLOSED
    const { intent: i23 } = await createDonationIntent(800000);
    await ScholarshipCampaign.updateOne(
      { _id: openCampaign._id },
      { $set: { status: "CLOSED" } },
    );
    const p23 = await buildSignedWebhookPayload("DONATION", {
      orderCode: i23.orderCode,
      amount: 800000,
      paymentLinkId: i23.paymentLinkId,
      reference: "FT_PR3_CLOSED_CAMP_23",
    });
    const r23 = await request(app).post(DONATION_WEBHOOK_URL).send(p23);
    expect(r23.statusCode).toBe(200);
    expect(r23.body.data.dispatched).toBe(false);
    expect(r23.body.data.eventStatus).toBe("NEEDS_REVIEW");
    expect(r23.body.data.reconciliationReason).toBe(
      "CAMPAIGN_NOT_ACCEPTING_FUNDING",
    );
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5000000);
  });

  // =========================================================================
  // E. Idempotency & Concurrency (Tests 25 - 30)
  // =========================================================================
  test("25, 26, 27, 28, 29, 30: Idempotency & High Concurrency — 20 concurrent TUITION webhooks, 20 concurrent DONATION webhooks, and 10 distinct parallel DONATIONs never duplicate or lose money", async () => {
    const { enrollmentId, intent: tuitionIntent } = await createTuitionIntent();
    const tuitionPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: tuitionIntent.orderCode,
      amount: Number(tuitionIntent.amount),
      paymentLinkId: tuitionIntent.paymentLinkId,
      reference: "FT_PR3_CONC_TUITION_28",
    });

    // 26 & 28: Fire 20 simultaneous TUITION webhooks
    const tuitionResponses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).post(TUITION_WEBHOOK_URL).send(tuitionPayload),
      ),
    );
    for (const r of tuitionResponses) {
      expect(r.statusCode).toBe(200);
    }
    expect(
      await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId }),
    ).toBe(1);
    expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(1);

    // 25: Calling dispatchBankTransferEvent a second time directly on the same eventId is idempotent
    const eventDoc = await BankTransferEvent.findOne({
      orderCode: tuitionIntent.orderCode,
    });
    const secondDispatch =
      await financialDispatchService.dispatchBankTransferEvent(eventDoc._id);
    expect(secondDispatch.idempotent).toBe(true);
    expect(secondDispatch.dispatched).toBe(false);

    // 27 & 29: Fire 20 simultaneous DONATION webhooks for the same orderCode
    const { intent: donIntent } = await createDonationIntent(500000);
    const donPayload = await buildSignedWebhookPayload("DONATION", {
      orderCode: donIntent.orderCode,
      amount: 500000,
      paymentLinkId: donIntent.paymentLinkId,
      reference: "FT_PR3_CONC_DON_29",
    });
    const donResponses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).post(DONATION_WEBHOOK_URL).send(donPayload),
      ),
    );
    for (const r of donResponses) {
      expect(r.statusCode).toBe(200);
    }
    expect(
      await Transaction.countDocuments({
        relatedContributionId: donIntent.contributionId,
      }),
    ).toBe(1);
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5500000);

    // 30: 10 distinct valid DONATIONs running in parallel into the same Campaign
    const parallelAmounts = [
      100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000,
      600000,
    ];
    const expectedSum = parallelAmounts.reduce((a, b) => a + b, 0); // 3,300,000
    const intents10 = [];
    for (const amt of parallelAmounts) {
      const { intent } = await createDonationIntent(amt);
      intents10.push({ amt, intent });
    }

    const payloads10 = await Promise.all(
      intents10.map(({ amt, intent }, idx) =>
        buildSignedWebhookPayload("DONATION", {
          orderCode: intent.orderCode,
          amount: amt,
          paymentLinkId: intent.paymentLinkId,
          reference: `FT_PR3_PAR10_${idx}`,
        }),
      ),
    );

    const res10 = await Promise.all(
      payloads10.map((p) => request(app).post(DONATION_WEBHOOK_URL).send(p)),
    );
    for (const r of res10) {
      expect(r.statusCode).toBe(200);
      expect(r.body.data.dispatched).toBe(true);
    }

    // Campaign fundedAmount = 5,500,000 + 3,300,000 = 8,800,000 (0 VND lost under contention)
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5500000 + expectedSum);
  });

  // =========================================================================
  // F. Atomic Rollback, Post-ACK Outbox Recovery & Ledger Integrity (Tests 31 - 37)
  // =========================================================================
  test("31, 32, 33, 34, 35, 36, 37: Atomic Rollback on Mid-Transaction Failure, Post-ACK Outbox Recovery Worker, Multi-Worker Lease Safety, and Full Ledger Integrity Verification", async () => {
    // Use PAYOS_WEBHOOK_VERIFY_ONLY="true" first to persist READY_FOR_DISPATCH (simulating crash right after HTTP 200 ACK)
    process.env.PAYOS_WEBHOOK_VERIFY_ONLY = "true";

    const { enrollmentId, intent: tIntent } = await createTuitionIntent();
    const { intent: dIntent } = await createDonationIntent(900000);

    const tPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: tIntent.orderCode,
      amount: Number(tIntent.amount),
      paymentLinkId: tIntent.paymentLinkId,
      reference: "FT_PR3_ROLLBACK_T31",
    });
    const dPayload = await buildSignedWebhookPayload("DONATION", {
      orderCode: dIntent.orderCode,
      amount: 900000,
      paymentLinkId: dIntent.paymentLinkId,
      reference: "FT_PR3_ROLLBACK_D32",
    });

    const tAck = await request(app).post(TUITION_WEBHOOK_URL).send(tPayload);
    const dAck = await request(app).post(DONATION_WEBHOOK_URL).send(dPayload);
    expect(tAck.body.data.eventStatus).toBe("READY_FOR_DISPATCH");
    expect(dAck.body.data.eventStatus).toBe("READY_FOR_DISPATCH");

    delete process.env.PAYOS_WEBHOOK_VERIFY_ONLY;

    const tEventId = tAck.body.data.eventId;
    const dEventId = dAck.body.data.eventId;

    // 31: Simulate failure mid-transaction for TUITION AFTER Payment & Enrollment & Transactions were updated, right before TeacherEarning
    const failTuitionRes =
      await financialDispatchService.dispatchBankTransferEvent(tEventId, {
        simulateErrorAfterStep: async (step) => {
          if (step === "TRANSACTIONS_CREATED") {
            throw new Error(
              "Simulated transient error before TeacherEarning creation",
            );
          }
        },
      });
    expect(failTuitionRes.dispatched).toBe(false);
    expect(failTuitionRes.dispatchStatus).toBe("DISPATCH_FAILED");
    expect(failTuitionRes.dispatchAttempts).toBe(1);

    // Prove 100% atomic rollback: Payment stays PENDING, Enrollment stays PENDING_PAYMENT, Transaction = 0, TeacherEarning = 0
    expect((await Payment.findById(tIntent.paymentId)).paymentStatus).toBe(
      "PENDING",
    );
    expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe(
      "PENDING_PAYMENT",
    );
    expect(
      await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId }),
    ).toBe(0);
    expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(0);

    // 32: Simulate failure mid-transaction for DONATION AFTER SponsorContribution & Campaign.fundedAmount were updated, right before Transaction
    const failDonRes = await financialDispatchService.dispatchBankTransferEvent(
      dEventId,
      {
        simulateErrorAfterStep: async (step) => {
          if (step === "CAMPAIGN_FUND_INCREMENTED") {
            throw new Error(
              "Simulated transient error before DONATION Transaction creation",
            );
          }
        },
      },
    );
    expect(failDonRes.dispatched).toBe(false);
    expect(failDonRes.dispatchStatus).toBe("DISPATCH_FAILED");
    expect(failDonRes.dispatchAttempts).toBe(1);

    // Prove 100% atomic rollback: SponsorContribution stays PENDING, Campaign.fundedAmount stays 5,000,000, Transaction = 0
    expect(
      (await SponsorContribution.findById(dIntent.contributionId))
        .contributionStatus,
    ).toBe("PENDING");
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5000000);
    expect(
      await Transaction.countDocuments({
        relatedContributionId: dIntent.contributionId,
      }),
    ).toBe(0);

    // 33, 34 & 35: Fast-forward nextRetryAt and run 2 concurrent Outbox Recovery Workers (`runPendingDispatchWorker`)
    await BankTransferEvent.updateMany(
      { _id: { $in: [tEventId, dEventId] } },
      { $set: { nextRetryAt: new Date(Date.now() - 1000) } },
    );

    const [worker1, worker2] = await Promise.all([
      financialDispatchService.runPendingDispatchWorker({ now: new Date() }),
      financialDispatchService.runPendingDispatchWorker({ now: new Date() }),
    ]);

    expect(worker1.dispatched + worker2.dispatched).toBe(2);

    // Both TUITION and DONATION are now 100% dispatched without resending any webhook!
    expect((await Payment.findById(tIntent.paymentId)).paymentStatus).toBe(
      "COMPLETED",
    );
    expect((await Enrollment.findById(enrollmentId)).enrollmentStatus).toBe(
      "CONFIRMED",
    );
    expect(
      await Transaction.countDocuments({ relatedEnrollmentId: enrollmentId }),
    ).toBe(1);
    expect(await TeacherEarning.countDocuments({ enrollmentId })).toBe(1);
    expect(
      (await SponsorContribution.findById(dIntent.contributionId))
        .contributionStatus,
    ).toBe("COMPLETED");
    expect(
      toNum(
        (await ScholarshipCampaign.findById(openCampaign._id)).fundedAmount,
      ),
    ).toBe(5900000);
    expect(
      await Transaction.countDocuments({
        relatedContributionId: dIntent.contributionId,
      }),
    ).toBe(1);

    // 37: Attempting to dispatch an UNMATCHED event is rejected safely
    const unmatchedPayload = await buildSignedWebhookPayload("TUITION", {
      orderCode: 188888888,
      amount: 1000000,
      paymentLinkId: "plink_unmatched_37",
      reference: "FT_PR3_UNMATCHED_37",
    });
    const unmatchedRes = await request(app)
      .post(TUITION_WEBHOOK_URL)
      .send(unmatchedPayload);
    const guardRes = await financialDispatchService.dispatchBankTransferEvent(
      unmatchedRes.body.data.eventId,
    );
    expect(guardRes.dispatched).toBe(false);
    expect(guardRes.reason).toBe("EVENT_NOT_ELIGIBLE_FOR_DISPATCH");

    // 36: Verify full ledger integrity across all collections (`verifyLedgerIntegrity`)
    const integrity = await financialDispatchService.verifyLedgerIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.discrepancies).toEqual([]);
  });
});
