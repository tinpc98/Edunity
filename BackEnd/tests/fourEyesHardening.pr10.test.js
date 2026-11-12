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
  RefundCase,
  TeacherEarning,
  Payout,
  BankProofRegistry,
} = require("../src/models");
const payoutService = require("../src/services/payoutService");
const refundService = require("../src/services/refundService");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { toDec } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

const FRIDAY_1000 = "2026-11-13T03:00:00.000Z";
const MONDAY_1000 = "2026-11-09T03:00:00.000Z";

describe("PR10: Four-Eyes Hardening & Elimination of Client Bypass", () => {
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
    await RefundCase.init();
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  }, 30000);

  beforeEach(async () => {
    await clearDB();

    process.env.NODE_ENV = "test";
    process.env.PAYOS_ENABLED = "false";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";

    const passwordHash = await hashPassword("Password123!");

    admin1 = await User.create({
      email: "admin1.pr10@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Approver 1",
      phone: "0901000021",
      status: "ACTIVE",
    });
    admin1Token = signAccessToken(admin1);

    admin2 = await User.create({
      email: "admin2.pr10@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Verifier 2",
      phone: "0901000022",
      status: "ACTIVE",
    });
    admin2Token = signAccessToken(admin2);

    teacher = await User.create({
      email: "teacher.pr10@edunity.test",
      passwordHash,
      role: "TEACHER",
      fullName: "Teacher PR10",
      phone: "0902000021",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Teacher PR10",
        status: "APPROVED",
        bankAccount: {
          bankName: "Vietcombank",
          accountNumber: "9988776655",
          accountHolderName: "TEACHER PR10",
        },
      },
    });
    teacherToken = signAccessToken(teacher);

    student = await User.create({
      email: "student.pr10@edunity.test",
      passwordHash,
      role: "STUDENT",
      fullName: "Student PR10",
      phone: "0903000021",
      status: "ACTIVE",
    });
    studentToken = signAccessToken(student);

    category = await Category.create({
      name: "Pr10 Category",
      slug: "pr10-cat",
      description: "PR10 Testing Category",
      gradeLevel: "12",
      createdBy: admin1._id,
    });

    subject = await Subject.create({
      name: "Pr10 Subject",
      slug: "pr10-sub",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin1._id,
    });

    course = await Course.create({
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      title: "Pr10 Course",
      slug: `pr10-course-${Date.now()}`,
      price: toDec(500000),
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
      className: "Pr10 Hardening Class",
      classType: "PAID",
      price: toDec(500000),
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
      tuitionAmount: toDec(500000),
      amountPaidViaPayment: toDec(500000),
      orderCode: 9002001,
    });

    paymentDoc = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      provider: "PAYOS",
      enrollmentId: enrollmentDoc._id,
      payerUserId: student._id,
      userId: student._id,
      gateway: "payos",
      gatewayReference: "GW_PR10_9002001",
      orderCode: 9002001,
      paymentType: "TUITION",
      amount: toDec(500000),
      tuitionAmount: toDec(500000),
      paymentStatus: "COMPLETED",
      gatewayStatus: "PAID",
      paidAt: new Date(),
    });
  });

  async function createReadyPayout() {
    await TeacherEarning.create({
      teacherId: teacher._id,
      enrollmentId: enrollmentDoc._id,
      classId: classDoc._id,
      grossAmount: toDec(500000),
      commissionAmount: toDec(50000),
      netAmount: toDec(450000),
      status: "AVAILABLE",
    });

    const payout = await payoutService.requestPayout(
      teacher._id,
      { bankName: "Vietcombank", accountNumber: "9988776655", accountHolderName: "TEACHER PR10" },
      { now: new Date(MONDAY_1000) }
    );

    // Admin1 approves payout
    await payoutService.approvePayout(admin1._id, payout._id);

    return payout;
  }

  async function createReadyRefund() {
    const refundCase = await refundService.createRefundCase({
      sourcePaymentId: paymentDoc._id,
      relatedEnrollmentId: enrollmentDoc._id,
      relatedClassId: classDoc._id,
      recipientUserId: student._id,
      requestedAmount: 500000,
      reason: "STUDENT_TRANSFER",
      beneficiaryBankAccount: {
        bankName: "Techcombank",
        accountNumber: "1900123456",
        accountHolderName: "STUDENT PR10",
      },
    });

    // Admin1 approves refund
    await refundService.approveRefundCase(admin1._id, refundCase._id);

    return refundCase;
  }

  describe("Phase 1: Elimination of Client-Controlled Four-Eyes Bypass on Payouts", () => {
    it("1. Rejects Payout verification if client omits enforceDifferentAdmin (defaults to dual verification required)", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_01" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_PR10_PO_01" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    it("2. Rejects Payout verification even if client explicitly sends enforceDifferentAdmin: false", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_02" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({
          bankReference: "FT_PR10_PO_02",
          enforceDifferentAdmin: false,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    it("3. Rejects Payout verification when client sends enforceDifferentAdmin: true and same admin verifies", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_03" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({
          bankReference: "FT_PR10_PO_03",
          enforceDifferentAdmin: true,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    it("4. Blocks verification if approver is Admin 1 and Admin 1 attempts to verify", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_04" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_PR10_PO_04" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    it("5. Allows Payout verification when independent authorized Admin 2 performs verification", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_05" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_PR10_PO_05", verificationNote: "Verified by Admin 2" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("COMPLETED");
      expect(String(res.body.data.bankTransferProof.verifiedBy)).toBe(String(admin2._id));
    });

    it("6. Rejects Payout verification if caller is not an ADMIN (role guard)", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_06" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_PR10_PO_06" });

      expect(res.status).toBe(403);
    });

    it("7. Fails closed with MISSING_APPROVER_IDENTITY if payout has neither approver nor submitter", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_PR10_PO_07" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      // Simulate missing approver & submitter
      await Payout.findByIdAndUpdate(payout._id, {
        $unset: {
          approvedBy: 1,
          processedBy: 1,
          "bankTransferProof.submittedBy": 1,
        },
      });

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_PR10_PO_07" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_APPROVER_IDENTITY");
    });
  });

  describe("Phase 1: Elimination of Client-Controlled Four-Eyes Bypass on Refunds", () => {
    it("8. Rejects Refund verification if client sends enforceDifferentAdmin: false", async () => {
      const refundCase = await createReadyRefund();
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "REF_PR10_01" },
        { autoVerify: false }
      );

      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({
          bankReference: "REF_PR10_01",
          enforceDifferentAdmin: false,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    it("9. Allows Refund verification when independent Admin 2 performs verification", async () => {
      const refundCase = await createReadyRefund();
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "REF_PR10_02" },
        { autoVerify: false }
      );

      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .send({
          bankReference: "REF_PR10_02",
          note: "Verified by Admin 2",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("COMPLETED");
      expect(String(res.body.data.bankTransferProof.verifiedBy)).toBe(String(admin2._id));
    });

    it("10. Fails closed with MISSING_APPROVER_IDENTITY if refund case lacks approver and submitter", async () => {
      const refundCase = await createReadyRefund();
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "REF_PR10_03" },
        { autoVerify: false }
      );

      await RefundCase.findByIdAndUpdate(refundCase._id, {
        $unset: {
          approvedBy: 1,
          "bankTransferProof.submittedBy": 1,
        },
      });

      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .send({ bankReference: "REF_PR10_03" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_APPROVER_IDENTITY");
    });
  });

  describe("Phase 2: BankProofRegistry Cross-Channel Collision & State Lifecycle", () => {
    it("11. Rejects reusing the same bankReference between Payout and Refund", async () => {
      const payout = await createReadyPayout();
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "COLLISION_REF_001" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const refundCase = await createReadyRefund();

      // Refund tries to submit the identical bank reference via evidence route
      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/evidence`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({
          bankReference: "COLLISION_REF_001",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("DUPLICATE_BANK_REFERENCE");
    });

    it("12. Validates strict state transition: APPROVED -> AWAITING_BANK_VERIFICATION -> COMPLETED", async () => {
      const payout = await createReadyPayout();

      // Prior to proof submission: status is APPROVED
      const pInitial = await Payout.findById(payout._id);
      expect(pInitial.status).toBe("APPROVED");

      // Submit proof with dual verification required
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "LIFECYCLE_PR10_01" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const pSubmitted = await Payout.findById(payout._id);
      expect(pSubmitted.status).toBe("AWAITING_BANK_VERIFICATION");

      // Independent verify
      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "LIFECYCLE_PR10_01" });

      expect(res.status).toBe(200);

      const pFinal = await Payout.findById(payout._id);
      expect(pFinal.status).toBe("COMPLETED");
      expect(pFinal.bankTransferProof.verifiedBy.toString()).toBe(admin2._id.toString());
      expect(pFinal.bankTransferProof.verifiedAt).toBeDefined();
      expect(pFinal.processedAt).toBeDefined();
    });
  });
});
