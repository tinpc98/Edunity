const fs = require("fs");
const path = require("path");
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
  Scholarship,
  ScholarshipUsage,
  SponsorContribution,
  BankTransferEvent,
  PaymentReconciliation,
  Transaction,
  TeacherEarning,
} = require("../src/models");
const payosService = require("../src/services/payosService");
const payosWebhookService = require("../src/services/payosWebhookService");
const financialDispatchService = require("../src/services/financialDispatchService");
const scholarshipPaymentService = require("../src/services/scholarshipPaymentService");
const { releaseReservation } = require("../src/services/reservationService");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({
  "x-user-id": user._id.toString(),
  "x-user-role": user.role,
});

// Pure state-derivation helpers mirroring FrontEnd/src/hooks/usePaymentPolling.ts
// and FrontEnd/src/components/payment/* for deterministic verification alongside source AST checks.
const frontendHooksPath = path.resolve(__dirname, "../../FrontEnd/src/hooks/usePaymentPolling.ts");
const frontendQrPanelPath = path.resolve(
  __dirname,
  "../../FrontEnd/src/components/payment/PaymentQrPanel.tsx"
);
const frontendResultPath = path.resolve(
  __dirname,
  "../../FrontEnd/src/components/payment/PaymentResult.tsx"
);
const frontendCheckoutPagePath = path.resolve(
  __dirname,
  "../../FrontEnd/src/features/enrollment/CheckoutPage.tsx"
);
const frontendSuccessPagePath = path.resolve(
  __dirname,
  "../../FrontEnd/src/features/enrollment/PaymentSuccessPage.tsx"
);
const frontendCampaignPagePath = path.resolve(
  __dirname,
  "../../FrontEnd/src/features/campaign/CampaignDetailPage.tsx"
);

function computeCountdownRemaining(expiredAt, nowMs = Date.now()) {
  if (!expiredAt) return 0;
  const targetMs = new Date(expiredAt).getTime();
  if (Number.isNaN(targetMs)) return 0;
  return Math.max(0, Math.floor((targetMs - nowMs) / 1000));
}

function formatCountdownMMSS(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isImageSourceUrl(qrCode) {
  if (!qrCode || typeof qrCode !== "string") return false;
  const trimmed = qrCode.trim();
  return (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
}

function derivePaymentUiState(payment, isClientTimerZero = false) {
  if (!payment) return "PENDING";
  const purpose = payment.purpose || (payment.contributionStatus ? "DONATION" : "TUITION");
  const rawStatus = payment.paymentStatus || payment.contributionStatus || "PENDING";
  const enrollmentStatus = payment.enrollmentStatus || null;
  const reconciliationRequired = Boolean(payment.reconciliationRequired);
  const reconciliationReason = payment.reconciliationReason || null;

  if (rawStatus === "REFUNDED") return "REFUND_PENDING";

  if (purpose === "TUITION") {
    if (reconciliationRequired) {
      if (
        reconciliationReason === "LATE_PAYMENT_REVIEW" ||
        reconciliationReason === "EXPIRED_PAYMENT"
      ) {
        return "LATE_PAYMENT_REVIEW";
      }
      return "RECONCILIATION_REQUIRED";
    }
    if (rawStatus === "COMPLETED") {
      if (enrollmentStatus === "CONFIRMED" || enrollmentStatus === "COMPLETED") {
        return "COMPLETED";
      }
      if (
        enrollmentStatus === "EXPIRED" ||
        enrollmentStatus === "CANCELLED" ||
        enrollmentStatus === "PENDING_PAYMENT"
      ) {
        return "LATE_PAYMENT_REVIEW";
      }
      return "PROCESSING";
    }
    if (rawStatus === "FAILED") {
      if (enrollmentStatus === "EXPIRED" || enrollmentStatus === "CANCELLED") {
        return "EXPIRED";
      }
      return "FAILED";
    }
    if (enrollmentStatus === "CONFIRMED" || enrollmentStatus === "COMPLETED") {
      return "COMPLETED";
    }
    if (enrollmentStatus === "EXPIRED" || enrollmentStatus === "CANCELLED") {
      return "EXPIRED";
    }
    if (
      isClientTimerZero &&
      typeof payment.remainingSeconds === "number" &&
      payment.remainingSeconds <= 0
    ) {
      return "EXPIRED";
    }
    return "PENDING";
  }

  if (reconciliationRequired) return "RECONCILIATION_REQUIRED";
  if (rawStatus === "COMPLETED") return "COMPLETED";
  if (rawStatus === "FAILED") {
    if (
      isClientTimerZero &&
      typeof payment.remainingSeconds === "number" &&
      payment.remainingSeconds <= 0
    ) {
      return "EXPIRED";
    }
    return "FAILED";
  }
  if (payment.campaignStatus === "CLOSED") return "EXPIRED";
  if (
    isClientTimerZero &&
    typeof payment.remainingSeconds === "number" &&
    payment.remainingSeconds <= 0
  ) {
    return "EXPIRED";
  }
  return "PENDING";
}

function shouldContinuePaymentPolling(payment, isClientTimerZero = false) {
  if (!payment) return true;
  const uiState = derivePaymentUiState(payment, isClientTimerZero);
  return uiState === "PENDING" || uiState === "PROCESSING";
}

describe("TIN-FIN-PR4: Unified payOS Checkout UI (VietQR Student Tuition + Sponsor Donation)", () => {
  const originalEnv = { ...process.env };
  let admin, teacher, student, student2, sponsor, sponsor2;
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
    };
    payosService.resetPayosClient();
    await clearDB();

    admin = await User.create({
      email: "admin_pr4@test.com",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    });
    teacher = await User.create({
      email: "teacher_pr4@test.com",
      passwordHash: "x",
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Teacher PR4", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "student_pr4@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student PR4" },
    });
    student2 = await User.create({
      email: "student2_pr4@test.com",
      passwordHash: "x",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student 2 PR4" },
    });
    sponsor = await User.create({
      email: "sponsor_pr4@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "ORGANIZATION",
        organizationName: "Quỹ Vì Tương Lai",
        representativeName: "Nguyễn Văn A",
      },
    });
    sponsor2 = await User.create({
      email: "sponsor2_pr4@test.com",
      passwordHash: "x",
      role: "SPONSOR",
      status: "ACTIVE",
      sponsorProfile: {
        sponsorType: "INDIVIDUAL",
        representativeName: "Trần Thị B",
      },
    });

    category = await Category.create({
      name: "Toán học PR4",
      slug: "toan-pr4-" + Date.now(),
      createdBy: admin._id,
    });
    subject = await Subject.create({
      name: "Đại số PR4",
      slug: "dai-so-pr4-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
    });
    course = await Course.create({
      title: "Toán 9 Nâng cao PR4",
      slug: "toan-9-pr4-" + Date.now(),
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    paidClass = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher PR4",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Lớp Toán 9 PAID PR4",
      classType: "PAID",
      price: 1500000,
      capacity: 30,
      status: "OPEN",
    });
    openCampaign = await ScholarshipCampaign.create({
      createdBy: admin._id,
      title: "Quỹ Học Bổng Thắp Sáng PR4",
      description: "Hỗ trợ học sinh vượt khó",
      targetBudget: mongoose.Types.Decimal128.fromString("50000000"),
      fundedAmount: mongoose.Types.Decimal128.fromString("20000000"),
      allocatedAmount: mongoose.Types.Decimal128.fromString("5000000"),
      usedAmount: mongoose.Types.Decimal128.fromString("0"),
      expectedSlots: 50,
      awardAmountPerStudent: mongoose.Types.Decimal128.fromString("1500000"),
      status: "OPEN_FOR_FUNDING",
      fundingStart: new Date(Date.now() - 86400000),
      fundingEnd: new Date(Date.now() + 86400000 * 30),
    });
  });

  describe("A. Student Tuition Checkout (Test Cases 1..8)", () => {
    test("TC-01 & TC-02 & TC-05: Render PENDING_PAYMENT enrollment, display exact tuition amount, create Payment Intent with VietQR, checkoutUrl, orderCode", async () => {
      const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt,
      });

      const res = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      expect(res.body.success).toBe(true);
      const dto = res.body.data;
      expect(dto.purpose).toBe("TUITION");
      expect(dto.channelKey).toBe("TUITION");
      expect(Number(dto.amount)).toBe(1500000);
      expect(Number(dto.tuitionAmount)).toBe(1500000);
      expect(Number(dto.scholarshipAmount)).toBe(0);
      expect(dto.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(dto.paymentStatus).toBe("PENDING");
      expect(dto.qrCode).toBeTruthy();
      expect(dto.checkoutUrl).toContain("https://");
      expect(dto.orderCode).toBeGreaterThanOrEqual(100000001);
      expect(dto.orderCode).toBeLessThan(200000000);
      expect(derivePaymentUiState(dto)).toBe("PENDING");
    });

    test("TC-03: MIXED scholarship co-pay displays total tuition, scholarship deducted, and remaining student co-pay amount", async () => {
      const scholarship = await Scholarship.create({
        campaignId: openCampaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: student._id,
        allocatedAmount: mongoose.Types.Decimal128.fromString("900000"),
        remainingAmount: mongoose.Types.Decimal128.fromString("900000"),
        validFrom: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        status: "ACTIVE",
      });

      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const schRes = await scholarshipPaymentService.payWithScholarship(
        student._id,
        enrollment._id,
        scholarship._id
      );
      expect(schRes.paymentSource).toBe("MIXED");
      expect(Number(schRes.scholarshipAmount)).toBe(900000);
      expect(Number(schRes.remainingDue)).toBe(600000);

      const intentRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      const dto = intentRes.body.data;
      expect(Number(dto.tuitionAmount)).toBe(1500000);
      expect(Number(dto.scholarshipAmount)).toBe(900000);
      expect(Number(dto.amount)).toBe(600000);

      const pollRes = await request(app)
        .get(`/api/payments/${dto.paymentId}`)
        .set(as(student))
        .expect(200);

      expect(Number(pollRes.body.data.tuitionAmount)).toBe(1500000);
      expect(Number(pollRes.body.data.scholarshipAmount)).toBe(900000);
      expect(Number(pollRes.body.data.amount)).toBe(600000);
      expect(pollRes.body.data.paymentSource).toBe("MIXED");
    });

    test("TC-04: 100% Full Scholarship confirms enrollment immediately without creating a QR payment intent", async () => {
      const fullScholarship = await Scholarship.create({
        campaignId: openCampaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: student._id,
        allocatedAmount: mongoose.Types.Decimal128.fromString("1500000"),
        remainingAmount: mongoose.Types.Decimal128.fromString("1500000"),
        validFrom: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        status: "ACTIVE",
      });

      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const schRes = await scholarshipPaymentService.payWithScholarship(
        student._id,
        enrollment._id,
        fullScholarship._id
      );

      expect(schRes.enrollmentStatus).toBe("CONFIRMED");
      expect(schRes.paymentSource).toBe("SCHOLARSHIP");
      expect(Number(schRes.remainingDue)).toBe(0);

      const paymentsCount = await Payment.countDocuments({ enrollmentId: enrollment._id });
      expect(paymentsCount).toBe(0);
    });

    test("TC-06: Countdown accurately formats MM:SS from expiredAt (14:59 -> 00:00) and clamps at 00:00", () => {
      const nowMs = Date.now();
      const target14m59s = new Date(nowMs + (14 * 60 + 59) * 1000).toISOString();
      const rem1 = computeCountdownRemaining(target14m59s, nowMs);
      expect(rem1).toBe(899);
      expect(formatCountdownMMSS(rem1)).toBe("14:59");

      const pastTarget = new Date(nowMs - 5000).toISOString();
      const remPast = computeCountdownRemaining(pastTarget, nowMs);
      expect(remPast).toBe(0);
      expect(formatCountdownMMSS(remPast)).toBe("00:00");
    });

    test("TC-07 & TC-08: Polls every 3s while PENDING; when Backend returns Payment COMPLETED + Enrollment CONFIRMED, stops polling and transitions to COMPLETED", async () => {
      const hooksSource = fs.readFileSync(frontendHooksPath, "utf8");
      expect(hooksSource).toContain("PAYMENT_POLL_INTERVAL_MS = 3000");

      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const createRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      const paymentId = createRes.body.data.paymentId;
      const gatewayReference = createRes.body.data.gatewayReference;

      const pollPending = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set(as(student))
        .expect(200);

      expect(shouldContinuePaymentPolling(pollPending.body.data)).toBe(true);
      expect(derivePaymentUiState(pollPending.body.data)).toBe("PENDING");

      // Confirm via webhook
      await request(app)
        .post("/api/payments/sandbox/webhook")
        .send({ gatewayReference, status: "SUCCESS" })
        .expect(200);

      const pollCompleted = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set(as(student))
        .expect(200);

      expect(pollCompleted.body.data.paymentStatus).toBe("COMPLETED");
      expect(pollCompleted.body.data.enrollmentStatus).toBe("CONFIRMED");
      expect(pollCompleted.body.data.reconciliationRequired).toBe(false);
      expect(derivePaymentUiState(pollCompleted.body.data)).toBe("COMPLETED");
      expect(shouldContinuePaymentPolling(pollCompleted.body.data)).toBe(false);
    });
  });

  describe("B. Late / Expired / Failed Tuition & Return URL Safety (Test Cases 9..12)", () => {
    test("TC-09: When Backend returns Payment COMPLETED + Enrollment EXPIRED (late payment), UI state is LATE_PAYMENT_REVIEW and NEVER grants classroom entry", async () => {
      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "EXPIRED",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: null,
      });

      const payment = await Payment.create({
        purpose: "TUITION",
        channelKey: "TUITION",
        enrollmentId: enrollment._id,
        payerUserId: student._id,
        gateway: "SANDBOX",
        provider: "SANDBOX",
        gatewayReference: "SBX-LATE-PR4-01",
        orderCode: 100999001,
        amount: mongoose.Types.Decimal128.fromString("1500000"),
        paymentStatus: "PENDING",
      });

      await request(app)
        .post("/api/payments/sandbox/webhook")
        .send({ gatewayReference: "SBX-LATE-PR4-01", status: "SUCCESS" })
        .expect(200);

      const pollLate = await request(app)
        .get(`/api/payments/${payment._id}`)
        .set(as(student))
        .expect(200);

      expect(pollLate.body.data.paymentStatus).toBe("COMPLETED");
      expect(pollLate.body.data.enrollmentStatus).toBe("EXPIRED");
      expect(pollLate.body.data.reconciliationRequired).toBe(true);
      expect(pollLate.body.data.reconciliationReason).toBe("LATE_PAYMENT_REVIEW");

      const uiState = derivePaymentUiState(pollLate.body.data);
      expect(uiState).toBe("LATE_PAYMENT_REVIEW");
      expect(shouldContinuePaymentPolling(pollLate.body.data)).toBe(false);

      // Verify PaymentResult source hides classroom button when not confirmed
      const resultSource = fs.readFileSync(frontendResultPath, "utf8");
      expect(resultSource).toContain("const showClassroomButton = isConfirmedTuition;");
      expect(resultSource).toContain("Đã nhận tiền — đang đối soát (Khoản tiền đến sau hạn)");
    });

    test("TC-10: When Backend returns FAILED while hold is still active, stops polling and allows retry", async () => {
      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const createRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      const { paymentId, gatewayReference } = createRes.body.data;

      await request(app)
        .post("/api/payments/sandbox/webhook")
        .send({ gatewayReference, status: "FAILED" })
        .expect(200);

      const pollFailed = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set(as(student))
        .expect(200);

      expect(pollFailed.body.data.paymentStatus).toBe("FAILED");
      expect(pollFailed.body.data.enrollmentStatus).toBe("PENDING_PAYMENT");
      expect(derivePaymentUiState(pollFailed.body.data)).toBe("FAILED");
      expect(shouldContinuePaymentPolling(pollFailed.body.data)).toBe(false);
    });

    test("TC-11: When enrollment hold expires, state transitions to EXPIRED, locking QR and never assuming success", async () => {
      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 1000),
      });

      const createRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      await Enrollment.updateOne(
        { _id: enrollment._id },
        { $set: { holdExpiresAt: new Date(Date.now() - 60000) } }
      );
      await releaseReservation(enrollment._id, "EXPIRED");

      const pollExpired = await request(app)
        .get(`/api/payments/${createRes.body.data.paymentId}`)
        .set(as(student))
        .expect(200);

      expect(pollExpired.body.data.enrollmentStatus).toBe("EXPIRED");
      expect(derivePaymentUiState(pollExpired.body.data, true)).toBe("EXPIRED");
      expect(shouldContinuePaymentPolling(pollExpired.body.data, true)).toBe(false);
    });

    test("TC-12: Return URL with ?status=PAID&code=00 when Backend returns PENDING still displays PENDING, never false success", async () => {
      const successPageSource = fs.readFileSync(frontendSuccessPagePath, "utf8");
      expect(successPageSource).toContain("NEVER trust ?status=PAID");
      expect(successPageSource).not.toContain('searchParams.get("status") === "PAID"');

      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const createRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      const backendVerify = await request(app)
        .get(`/api/payments/${createRes.body.data.paymentId}`)
        .set(as(student))
        .expect(200);

      expect(backendVerify.body.data.paymentStatus).toBe("PENDING");
      expect(derivePaymentUiState(backendVerify.body.data)).toBe("PENDING");
    });
  });

  describe("C. Sponsor Donation Checkout (Test Cases 13..19)", () => {
    test("TC-13 & TC-16: Sponsor creates Donation Intent -> returns VietQR on DONATION channel, and does NOT increase campaign fundedAmount while PENDING", async () => {
      const initialFunded = Number(openCampaign.fundedAmount.toString());

      const res = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 2000000, isAnonymous: false, donorDisplayName: "Quỹ Vì Tương Lai" })
        .expect(201);

      const dto = res.body.data;
      expect(dto.purpose).toBe("DONATION");
      expect(dto.channelKey).toBe("DONATION");
      expect(Number(dto.amount)).toBe(2000000);
      expect(dto.contributionStatus).toBe("PENDING");
      expect(dto.qrCode).toBeTruthy();
      expect(dto.checkoutUrl).toContain("https://");
      expect(dto.orderCode).toBeGreaterThanOrEqual(200000001);

      const campaignAfterIntent = await ScholarshipCampaign.findById(openCampaign._id);
      expect(Number(campaignAfterIntent.fundedAmount.toString())).toBe(initialFunded);
    });

    test("TC-14 & TC-15: Sponsor anonymous vs public display modes send and return accurate donor identity", async () => {
      const anonRes = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 500000, isAnonymous: true })
        .expect(201);

      expect(anonRes.body.data.isAnonymous).toBe(true);
      expect(anonRes.body.data.donorDisplayName).toBe("Nhà tài trợ ẩn danh");
      expect(anonRes.body.data.sponsorId).toBeUndefined();

      const pollAnon = await request(app)
        .get(`/api/payments/${anonRes.body.data.paymentId}`)
        .set(as(sponsor))
        .expect(200);

      expect(pollAnon.body.data.isAnonymous).toBe(true);
      expect(pollAnon.body.data.donorDisplayName).toBe("Nhà tài trợ ẩn danh");
      expect(pollAnon.body.data.sponsorId).toBeUndefined();

      const pubRes = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 1000000, isAnonymous: false, donorDisplayName: "Tập đoàn Ánh Dương" })
        .expect(201);

      expect(pubRes.body.data.isAnonymous).toBe(false);
      expect(pubRes.body.data.donorDisplayName).toBe("Tập đoàn Ánh Dương");
    });

    test("TC-17 & TC-18: Polls Donation while PENDING; when Backend confirms COMPLETED, stops polling, increments fundedAmount, and returns receipt data", async () => {
      const initialFunded = Number(openCampaign.fundedAmount.toString());

      const createRes = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 3000000, isAnonymous: false, donorDisplayName: "Nhà Tài Trợ Vàng" })
        .expect(201);

      const { paymentId, gatewayReference } = createRes.body.data;

      const pollPending = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set(as(sponsor))
        .expect(200);

      expect(derivePaymentUiState(pollPending.body.data)).toBe("PENDING");
      expect(shouldContinuePaymentPolling(pollPending.body.data)).toBe(true);

      await request(app)
        .post("/api/payments/sandbox/webhook")
        .send({ gatewayReference, status: "SUCCESS" })
        .expect(200);

      const pollDone = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set(as(sponsor))
        .expect(200);

      expect(pollDone.body.data.contributionStatus).toBe("COMPLETED");
      expect(pollDone.body.data.paymentStatus).toBe("COMPLETED");
      expect(pollDone.body.data.campaignTitle).toBe(openCampaign.title);
      expect(derivePaymentUiState(pollDone.body.data)).toBe("COMPLETED");
      expect(shouldContinuePaymentPolling(pollDone.body.data)).toBe(false);

      const updatedCampaign = await ScholarshipCampaign.findById(openCampaign._id);
      expect(Number(updatedCampaign.fundedAmount.toString())).toBe(initialFunded + 3000000);
    });

    test("TC-19: When campaign is CLOSED, blocks creating new Donation QR with 409 CAMPAIGN_NOT_ACCEPTING_FUNDING and UI renders CAMPAIGN_CLOSED error state", async () => {
      await ScholarshipCampaign.updateOne(
        { _id: openCampaign._id },
        { $set: { status: "CLOSED" } }
      );

      const res = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 500000 })
        .expect(409);

      expect(res.body.error?.code || res.body.error).toBe("CAMPAIGN_NOT_ACCEPTING_FUNDING");

      const campaignPageSource = fs.readFileSync(frontendCampaignPagePath, "utf8");
      expect(campaignPageSource).toContain('kind="CAMPAIGN_CLOSED"');
    });
  });

  describe("D. Safety, QR Rendering, Anti-IDOR & Bundle Secret Scan (Test Cases 20..26)", () => {
    test("TC-20 & TC-21 & TC-22: Polling hook configures refetchIntervalInBackground: false, refetchOnWindowFocus: true, bounded retry, and stopPolling cleanup", () => {
      const hooksSource = fs.readFileSync(frontendHooksPath, "utf8");
      expect(hooksSource).toContain("refetchIntervalInBackground: false");
      expect(hooksSource).toContain("refetchOnWindowFocus: true");
      expect(hooksSource).toContain("queryClient.cancelQueries");
      expect(hooksSource).toContain("return failureCount < 2;");
    });

    test("TC-23 & TC-24: Raw EMVCo VietQR string renders via <QRCode> (not <img src>), and missing qrCode falls back to checkoutUrl button", () => {
      const emvcoQr =
        "00020101021238570010A00000072701270006970422011301234567890208QRIBFTTA530370454065000005802VN6304ABCD";
      expect(isImageSourceUrl(emvcoQr)).toBe(false);
      expect(isImageSourceUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
      expect(isImageSourceUrl("https://img.vietqr.io/image/970422-123.png")).toBe(true);

      const qrPanelSource = fs.readFileSync(frontendQrPanelPath, "utf8");
      expect(qrPanelSource).toContain("<QRCode");
      expect(qrPanelSource).toContain('kind="MISSING_QR"');
    });

    test("TC-25: Anti-IDOR — User cannot view another user's Tuition Payment or Sponsor Contribution", async () => {
      const enrollment = await Enrollment.create({
        classId: paidClass._id,
        courseId: course._id,
        teacherId: teacher._id,
        studentId: student._id,
        enrollmentStatus: "PENDING_PAYMENT",
        paymentSource: "DIRECT_PAYMENT",
        tuitionAmount: mongoose.Types.Decimal128.fromString("1500000"),
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const tuitionRes = await request(app)
        .post(`/api/enrollments/${enrollment._id}/payments`)
        .set(as(student))
        .expect(201);

      await request(app)
        .get(`/api/payments/${tuitionRes.body.data.paymentId}`)
        .set(as(student2))
        .expect(404);

      const donationRes = await request(app)
        .post(`/api/campaigns/${openCampaign._id}/contributions`)
        .set(as(sponsor))
        .send({ amount: 500000, isAnonymous: true })
        .expect(201);

      await request(app)
        .get(`/api/payments/${donationRes.body.data.paymentId}`)
        .set(as(sponsor2))
        .expect(404);
    });

    test("TC-26: Frontend source code contains ZERO payOS secrets or server webhook secrets", () => {
      const forbiddenTokens = [
        "PAYOS_TUITION_CLIENT_ID",
        "PAYOS_TUITION_API_KEY",
        "PAYOS_TUITION_CHECKSUM_KEY",
        "PAYOS_DONATION_CLIENT_ID",
        "PAYOS_DONATION_API_KEY",
        "PAYOS_DONATION_CHECKSUM_KEY",
        "PAYMENT_WEBHOOK_SECRET",
        "@payos/node",
      ];

      const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(ts|tsx|js|jsx|html)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf8");
            for (const token of forbiddenTokens) {
              expect(content).not.toContain(token);
            }
          }
        }
      };

      scanDir(path.resolve(__dirname, "../../FrontEnd/src"));
    });
  });
});

