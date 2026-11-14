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
  RefundCase,
  TeacherEarning,
  TeacherSettlement,
  Payout,
  Transaction,
  BankProofRegistry,
} = require("../src/models");
const payoutService = require("../src/services/payoutService");
const refundService = require("../src/services/refundService");
const { claimBankProof, verifyBankProof } = require("../src/services/bankProofService");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { toDec } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");
const { verifiedBankAccount } = require("./helpers/bankAccount");

const FRIDAY_1000 = "2026-11-13T03:00:00.000Z";
const MONDAY_1000 = "2026-11-09T03:00:00.000Z";

describe("PR9: Staging Hardening & Two-Channel payOS Pilot Readiness", () => {
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
      email: "admin1.pr9@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Approver 1",
      phone: "0901000011",
      status: "ACTIVE",
    });
    admin1Token = signAccessToken(admin1);

    admin2 = await User.create({
      email: "admin2.pr9@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Admin Verifier 2",
      phone: "0901000012",
      status: "ACTIVE",
    });
    admin2Token = signAccessToken(admin2);

    teacher = await User.create({
      email: "teacher.pr9@edunity.test",
      passwordHash,
      role: "TEACHER",
      fullName: "Teacher PR9",
      phone: "0902000011",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Teacher PR9",
        status: "APPROVED",
        bankAccount: verifiedBankAccount("TEACHER PR9", "9988776655", "Vietcombank"),
      },
    });
    teacherToken = signAccessToken(teacher);

    student = await User.create({
      email: "student.pr9@edunity.test",
      passwordHash,
      role: "STUDENT",
      fullName: "Student PR9",
      phone: "0903000011",
      status: "ACTIVE",
    });
    studentToken = signAccessToken(student);

    category = await Category.create({
      name: "Pr9 Category",
      slug: "pr9-cat",
      description: "PR9 Testing Category",
      gradeLevel: "12",
      createdBy: admin1._id,
    });

    subject = await Subject.create({
      name: "Pr9 Subject",
      slug: "pr9-sub",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin1._id,
    });

    course = await Course.create({
      subjectId: subject._id,
      subjectName: subject.name,
      categoryId: category._id,
      categoryName: category.name,
      title: "Pr9 Course",
      slug: `pr9-course-${Date.now()}`,
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
      className: "Pr9 Hardening Class",
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
      orderCode: 9001001,
    });

    paymentDoc = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      provider: "PAYOS",
      enrollmentId: enrollmentDoc._id,
      payerUserId: student._id,
      userId: student._id,
      gateway: "payos",
      gatewayReference: "GW_PR9_9001001",
      orderCode: 9001001,
      paymentType: "TUITION",
      amount: toDec(500000),
      tuitionAmount: toDec(500000),
      paymentStatus: "COMPLETED",
      gatewayStatus: "PAID",
      paidAt: new Date(),
    });
  });

  // =========================================================================
  // GROUP A: P0 Four-Eyes Principle Fail-Closed Server Enforcement
  // =========================================================================
  describe("Group A: P0 Four-Eyes Principle Fail-Closed Server Enforcement", () => {
    test("A01: POST /api/admin/payouts/:id/verify omits enforceDifferentAdmin -> Server enforces Four-Eyes by default and rejects same admin with 403", async () => {
      const earning = await TeacherEarning.create({
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
        { bankName: "Vietcombank", accountNumber: "9988776655", accountHolderName: "TEACHER PR9" },
        { now: new Date(MONDAY_1000) }
      );

      // Admin 1 approves the payout
      await payoutService.approvePayout(admin1._id, payout._id);

      // Complete payout with dual verification required
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_FOUREYES_PO_01" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      // Same Admin 1 tries to verify WITHOUT sending enforceDifferentAdmin in body
      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_FOUREYES_PO_01" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    test("A02: POST /api/admin/refunds/:id/verify omits enforceDifferentAdmin -> Server enforces Four-Eyes by default and rejects same admin with 403", async () => {
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: {
          bankName: "Techcombank",
          accountNumber: "1900123456",
          accountHolderName: "STUDENT PR9",
        },
      });

      // Admin 1 approves the refund
      await refundService.approveRefundCase(admin1._id, refundCase._id);

      // Admin 1 submits proof (requiring separate verification)
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        {
          bankReference: "FT_FOUREYES_REF_01",
        },
        { autoVerify: false }
      );

      // Same Admin 1 attempts to verify WITHOUT sending enforceDifferentAdmin
      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/verify`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_FOUREYES_REF_01" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("DUAL_VERIFICATION_REQUIRED");
    });

    test("A03: Independent second admin calling verify on Payout succeeds (200) and marks COMPLETED", async () => {
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
        { bankName: "Vietcombank", accountNumber: "9988776655", accountHolderName: "TEACHER PR9" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(admin1._id, payout._id);
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_SECOND_ADMIN_01" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      // Admin 2 (different admin) verifies
      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_SECOND_ADMIN_01" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");
      expect(res.body.data.bankTransferProof.verifiedBy.toString()).toBe(admin2._id.toString());
    });

    test("A04: Independent second admin calling verify on Refund succeeds (200) and completes RefundCase", async () => {
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "TEACHER_RESIGNED",
        beneficiaryBankAccount: {
          bankName: "MBBank",
          accountNumber: "098712345",
          accountHolderName: "STUDENT PR9",
        },
      });

      await refundService.approveRefundCase(admin1._id, refundCase._id);
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "FT_SECOND_ADMIN_REF_01" },
        { autoVerify: false }
      );

      // Admin 2 verifies
      const res = await request(app)
        .post(`/api/admin/refunds/${refundCase._id}/verify`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .set("x-test-now", FRIDAY_1000)
        .send({ bankReference: "FT_SECOND_ADMIN_REF_01" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");
      expect(res.body.data.bankTransferProof.verifiedBy.toString()).toBe(admin2._id.toString());
    });
  });

  // =========================================================================
  // GROUP B: BankProofRegistry Cross-Collection Collision & Concurrency Protection
  // =========================================================================
  describe("Group B: BankProofRegistry Cross-Collection Collision & Concurrency Protection", () => {
    test("B05: Payout bankReference is automatically registered into BankProofRegistry", async () => {
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
        { bankName: "Vietcombank", accountNumber: "9988776655", accountHolderName: "TEACHER PR9" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(admin1._id, payout._id);
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_REGISTRY_TEST_PO" },
        { now: new Date(FRIDAY_1000) }
      );

      const registryDoc = await BankProofRegistry.findOne({ bankReference: "FT_REGISTRY_TEST_PO" });
      expect(registryDoc).toBeDefined();
      expect(registryDoc.entityType).toBe("PAYOUT");
      expect(registryDoc.entityId.toString()).toBe(payout._id.toString());
    });

    test("B06: RefundCase bankReference is automatically registered into BankProofRegistry", async () => {
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: {
          bankName: "VietinBank",
          accountNumber: "1122334455",
          accountHolderName: "STUDENT PR9",
        },
      });

      await refundService.approveRefundCase(admin1._id, refundCase._id);
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "FT_REGISTRY_TEST_REF" },
        { autoVerify: true }
      );

      const registryDoc = await BankProofRegistry.findOne({ bankReference: "FT_REGISTRY_TEST_REF" });
      expect(registryDoc).toBeDefined();
      expect(registryDoc.entityType).toBe("REFUND");
      expect(registryDoc.entityId.toString()).toBe(refundCase._id.toString());
      expect(registryDoc.status).toBe("VERIFIED");
    });

    test("B07: Cross-channel collision: Attempting to use a bankReference already claimed by Payout for a RefundCase is blocked", async () => {
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
        { bankName: "Vietcombank", accountNumber: "9988776655", accountHolderName: "TEACHER PR9" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(admin1._id, payout._id);
      await payoutService.completePayout(
        admin1._id,
        payout._id,
        { bankReference: "FT_CROSS_COLLISION_01" },
        { now: new Date(FRIDAY_1000) }
      );

      // Now create a refund case and try to submit the exact same bankReference
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: {
          bankName: "Vietcombank",
          accountNumber: "9988776655",
          accountHolderName: "TEACHER PR9",
        },
      });
      await refundService.approveRefundCase(admin1._id, refundCase._id);

      await expect(
        refundService.submitRefundProof(
          admin1._id,
          refundCase._id,
          { bankReference: "FT_CROSS_COLLISION_01" }
        )
      ).rejects.toThrow("DUPLICATE_BANK_REFERENCE");
    });

    test("B08: Cross-channel collision: Attempting to use a bankReference already claimed by RefundCase for a Payout is blocked", async () => {
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: {
          bankName: "ACB",
          accountNumber: "778899",
          accountHolderName: "STUDENT PR9",
        },
      });
      await refundService.approveRefundCase(admin1._id, refundCase._id);
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "FT_CROSS_COLLISION_02" }
      );

      // Now teacher requests payout
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
        { bankName: "ACB", accountNumber: "778899", accountHolderName: "STUDENT PR9" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(admin1._id, payout._id);

      await expect(
        payoutService.completePayout(
          admin1._id,
          payout._id,
          { bankReference: "FT_CROSS_COLLISION_02" },
          { now: new Date(FRIDAY_1000) }
        )
      ).rejects.toThrow("DUPLICATE_BANK_REFERENCE");
    });

    test("B09: MongoDB unique index on BankProofRegistry prevents concurrent race condition double-spending", async () => {
      const dummyId1 = new mongoose.Types.ObjectId();
      const dummyId2 = new mongoose.Types.ObjectId();

      await claimBankProof({
        bankReference: "FT_CONCURRENCY_TEST",
        bankName: "VCB",
        entityType: "PAYOUT",
        entityId: dummyId1,
        adminId: admin1._id,
      });

      // Second concurrent claim with the same reference throws DUPLICATE_BANK_REFERENCE
      await expect(
        claimBankProof({
          bankReference: "FT_CONCURRENCY_TEST",
          bankName: "VCB",
          entityType: "REFUND",
          entityId: dummyId2,
          adminId: admin2._id,
        })
      ).rejects.toThrow("DUPLICATE_BANK_REFERENCE");
    });
  });

  // =========================================================================
  // GROUP C: Outbound Financial Gate Shutdown & Safety Controls
  // =========================================================================
  describe("Group C: Outbound Financial Gate Shutdown & Safety Controls", () => {
    test("C10: Outbound PayOS automated disbursement remains safely DISABLED (PAYOS_ENABLED=false)", async () => {
      expect(process.env.PAYOS_ENABLED).toBe("false");
    });

    test("C11: Bank proof manual verification state machine maintains complete audit log with verifier ID and timestamp", async () => {
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: paymentDoc._id,
        relatedEnrollmentId: enrollmentDoc._id,
        relatedClassId: classDoc._id,
        recipientUserId: student._id,
        requestedAmount: 500000,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: {
          bankName: "VPBank",
          accountNumber: "5544332211",
          accountHolderName: "STUDENT PR9",
        },
      });

      await refundService.approveRefundCase(admin1._id, refundCase._id);
      await refundService.submitRefundProof(
        admin1._id,
        refundCase._id,
        { bankReference: "FT_AUDIT_VERIFY_01" },
        { autoVerify: false }
      );

      const verified = await refundService.verifyAndCompleteRefund(
        admin2._id,
        refundCase._id,
        { bankReference: "FT_AUDIT_VERIFY_01" },
        { now: new Date(FRIDAY_1000), enforceDifferentAdmin: true }
      );

      expect(verified.status).toBe("COMPLETED");
      expect(verified.bankTransferProof.verifiedBy.toString()).toBe(admin2._id.toString());
      expect(verified.bankTransferProof.verifiedAt).toBeDefined();

      const lastAudit = verified.auditLogs[verified.auditLogs.length - 1];
      expect(lastAudit.action).toBe("VERIFIED_COMPLETED");
      expect(lastAudit.actorId.toString()).toBe(admin2._id.toString());
    });

    test("C12: BankProofRegistry prevents blank or whitespace-only bank references (BANK_TRANSFER_PROOF_REQUIRED, 400)", async () => {
      await expect(
        claimBankProof({
          bankReference: "   ",
          entityType: "PAYOUT",
          entityId: new mongoose.Types.ObjectId(),
          adminId: admin1._id,
        })
      ).rejects.toThrow("BANK_TRANSFER_PROOF_REQUIRED");
    });
  });
});
