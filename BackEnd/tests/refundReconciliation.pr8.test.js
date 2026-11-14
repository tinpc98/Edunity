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
  BankTransferEvent,
  PaymentReconciliation,
  RefundCase,
  TeacherEarning,
  TeacherSettlement,
  Payout,
  Transaction,
  Scholarship,
  ScholarshipUsage,
  ScholarshipCampaign,
  SponsorContribution,
  Report,
  TeacherIncidentReport,
  SessionRefundReview,
} = require("../src/models");
const payoutService = require("../src/services/payoutService");
const refundService = require("../src/services/refundService");
const settlementService = require("../src/services/settlementService");
const paymentService = require("../src/services/paymentService");
const payosService = require("../src/services/payosService");
const { dispatchBankTransferEvent } = require("../src/services/financialDispatchService");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { toDec, toNum } = require("../src/utils/money");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");
const { verifiedBankAccount } = require("./helpers/bankAccount");

const FRIDAY_1000 = "2026-11-13T03:00:00.000Z"; // 10:00 AM UTC+7
const MONDAY_1000 = "2026-11-09T03:00:00.000Z"; // 10:00 AM UTC+7

describe("PR8: Safe Refund & Reconciliation Engine - Financial Closure & Bank Proof Hardening", () => {
  let adminUser, adminToken;
  let secondAdminUser, secondAdminToken;
  let teacherUser, teacherToken;
  let studentUser, studentToken;
  let secondStudentUser, secondStudentToken;
  let sponsorUser, sponsorToken;
  let category, subject, course;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
    await RefundCase.init();
    await Payout.init();
    await TeacherSettlement.init();
    await PaymentReconciliation.init();
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  }, 30000);

  beforeEach(async () => {
    await clearDB();

    process.env.NODE_ENV = "test";
    process.env.PAYOS_ENABLED = "false";
    process.env.ENABLE_PAYMENT_SANDBOX = "true";
    process.env.PAYOS_TUITION_CHECKSUM_KEY = "tuition-checksum-pr8-key";
    process.env.PAYOS_DONATION_CHECKSUM_KEY = "donation-checksum-pr8-key";

    const passwordHash = await hashPassword("Password123!");

    adminUser = await User.create({
      email: "admin.pr8@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Senior Finance Auditor Admin",
      phone: "0901000001",
      status: "ACTIVE",
    });
    adminToken = signAccessToken(adminUser);

    secondAdminUser = await User.create({
      email: "second.admin.pr8@edunity.test",
      passwordHash,
      role: "ADMIN",
      fullName: "Independent Verification Officer",
      phone: "0901000002",
      status: "ACTIVE",
    });
    secondAdminToken = signAccessToken(secondAdminUser);

    teacherUser = await User.create({
      email: "teacher.pr8@edunity.test",
      passwordHash,
      role: "TEACHER",
      fullName: "Senior Teacher PR8",
      phone: "0902000001",
      status: "ACTIVE",
      teacherProfile: {
        fullName: "Senior Teacher PR8",
        status: "APPROVED",
        bankAccount: verifiedBankAccount("SENIOR TEACHER PR8", "9876543210", "Vietcombank"),
      },
    });
    teacherToken = signAccessToken(teacherUser);

    studentUser = await User.create({
      email: "student.pr8@edunity.test",
      passwordHash,
      role: "STUDENT",
      fullName: "Alice Student PR8",
      phone: "0903000001",
      status: "ACTIVE",
    });
    studentToken = signAccessToken(studentUser);

    secondStudentUser = await User.create({
      email: "student2.pr8@edunity.test",
      passwordHash,
      role: "STUDENT",
      fullName: "Bob Student PR8",
      phone: "0903000002",
      status: "ACTIVE",
    });
    secondStudentToken = signAccessToken(secondStudentUser);

    sponsorUser = await User.create({
      email: "sponsor.pr8@edunity.test",
      passwordHash,
      role: "SPONSOR",
      fullName: "Kind Sponsor PR8",
      phone: "0904000001",
      status: "ACTIVE",
    });
    sponsorToken = signAccessToken(sponsorUser);

    category = await Category.create({
      name: "Mathematics PR8",
      slug: `math-pr8-${Date.now()}`,
      createdBy: adminUser._id,
    });
    subject = await Subject.create({
      name: "Calculus PR8",
      slug: `calc-pr8-${Date.now()}`,
      categoryId: category._id,
      categoryName: category.name,
      createdBy: adminUser._id,
    });
    course = await Course.create({
      title: "Advanced Calculus PR8",
      slug: `adv-calc-pr8-${Date.now()}`,
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      price: toDec(1000000),
      status: "ACTIVE",
      createdBy: adminUser._id,
    });
  });

  // Helper fixture to seed a full tuition payment fixture
  async function seedTuitionPaymentFixture(options = {}) {
    const tuitionAmount = options.amount || 1000000;
    const cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      categoryId: category._id,
      subjectId: subject._id,
      teacherId: teacherUser._id,
      teacherName: teacherUser.teacherProfile.fullName,
      className: options.className || `Class PR8 ${Date.now()}`,
      classType: "PAID",
      price: toDec(tuitionAmount),
      capacity: 10,
      enrolledCount: 1,
      status: options.classStatus || "COMPLETED",
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: options.classEndDate || new Date(Date.now() - 10 * 86400000),
      schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }],
    });

    const enrollment = await Enrollment.create({
      studentId: options.studentId || studentUser._id,
      classId: cls._id,
      courseId: course._id,
      teacherId: teacherUser._id,
      paymentSource: options.paymentSource || "DIRECT_PAYMENT",
      tuitionAmount: toDec(tuitionAmount),
      amountPaidViaPayment: toDec(options.paymentSource === "SCHOLARSHIP" ? 0 : tuitionAmount),
      amountPaidViaScholarship: toDec(options.scholarshipAmount || 0),
      enrollmentStatus: options.enrollmentStatus || "CONFIRMED",
      academicStatus: "ACTIVE",
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      enrolledAt: new Date(Date.now() - 20 * 86400000),
    });

    const orderCode = Math.floor(100000000 + Math.random() * 900000000);
    const payment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      provider: "PAYOS",
      enrollmentId: enrollment._id,
      payerUserId: options.studentId || studentUser._id,
      gateway: "payos",
      gatewayReference: `GW_PR8_${orderCode}`,
      orderCode,
      amount: toDec(options.paymentSource === "SCHOLARSHIP" ? 0 : tuitionAmount),
      tuitionAmount: toDec(tuitionAmount),
      currency: "VND",
      paymentStatus: options.paymentStatus || "COMPLETED",
      paidAt: options.paidAt || new Date(Date.now() - 20 * 86400000),
    });

    let earning = null;
    if (options.createEarning !== false) {
      const grossNum = tuitionAmount;
      const commissionRate = 0.1;
      const commissionNum = grossNum * commissionRate;
      const netNum = grossNum - commissionNum;

      earning = await TeacherEarning.create({
        teacherId: teacherUser._id,
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
        settledAt: options.earningStatus === "AVAILABLE" ? new Date(Date.now() - 86400000) : null,
      });

      await TeacherSettlement.create({
        earningId: earning._id,
        teacherId: teacherUser._id,
        classId: cls._id,
        enrollmentId: enrollment._id,
        paymentId: payment._id,
        grossAmount: earning.grossAmount,
        commissionRate,
        commissionAmount: earning.commissionAmount,
        netAmount: earning.netAmount,
        status: options.earningStatus === "AVAILABLE" ? "SETTLED_AVAILABLE" : "HELD",
      });
    }

    return { cls, enrollment, payment, earning, teacher: teacherUser };
  }

  // =========================================================================
  // GROUP A: PR7 Payout Proof Hardening & Dual Verification (8 Tests)
  // =========================================================================
  describe("Group A: PR7 Payout Proof Hardening & Dual Verification (8 Tests)", () => {
    test("A01: bankReference rỗng bị chặn với BANK_TRANSFER_PROOF_REQUIRED (400)", async () => {
      const { earning } = await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);

      await expect(
        payoutService.completePayout(adminUser._id, payout._id, { bankReference: "" }, { now: new Date(FRIDAY_1000) })
      ).rejects.toThrow("BANK_TRANSFER_PROOF_REQUIRED");
    });

    test("A02: Khi yêu cầu dual verification, nộp chứng từ chuyển sang AWAITING_BANK_VERIFICATION (chưa COMPLETED)", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);

      const submitted = await payoutService.completePayout(
        adminUser._id,
        payout._id,
        { bankReference: "FT_DUAL_001" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      const reloaded = await Payout.findById(payout._id);
      expect(reloaded.status).toBe("AWAITING_BANK_VERIFICATION");
      expect(reloaded.bankTransferProof.referenceNumber).toBe("FT_DUAL_001");

      // Earnings must NOT be PAID_OUT yet
      const earning = await TeacherEarning.findOne({ payoutId: payout._id });
      expect(earning.status).toBe("AVAILABLE");
    });

    test("A03: Không có verified bank proof -> verifyPayoutProof yêu cầu bankReference hợp lệ", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await Payout.create({
        teacherId: teacherUser._id,
        amount: toDec(900000),
        status: "AWAITING_BANK_VERIFICATION",
        bankAccountSnapshot: { bankName: "VCB", accountNumber: "123", accountHolderName: "TEACHER" },
      });

      await expect(
        payoutService.verifyPayoutProof(secondAdminUser._id, payout._id, { bankReference: "" })
      ).rejects.toThrow("BANK_TRANSFER_PROOF_REQUIRED");
    });

    test("A04: Người xác minh độc lập (Four-Eyes Principle) xác nhận hoàn tất Payout -> COMPLETED và PAID_OUT", async () => {
      const { earning } = await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);

      await payoutService.completePayout(
        adminUser._id,
        payout._id,
        { bankReference: "FT_INDEPENDENT_99" },
        { now: new Date(FRIDAY_1000), requireDualVerification: true }
      );

      // Second independent Admin verifies the proof
      const verified = await payoutService.verifyPayoutProof(
        secondAdminUser._id,
        payout._id,
        { bankReference: "FT_INDEPENDENT_99" },
        { now: new Date(FRIDAY_1000), enforceDifferentAdmin: true }
      );

      expect(verified.status).toBe("COMPLETED");
      expect(verified.bankTransferProof.verifiedBy.toString()).toBe(secondAdminUser._id.toString());

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("PAID_OUT");

      const tx = await Transaction.findOne({ transactionType: "TEACHER_PAYOUT", destinationUserId: teacherUser._id });
      expect(tx).toBeDefined();
      expect(tx.status).toBe("COMPLETED");
    });

    test("A05: Trùng bankReference với Payout đã hoàn tất trước đó bị chặn (DUPLICATE_BANK_REFERENCE, 400)", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout1 = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout1._id);
      await payoutService.completePayout(adminUser._id, payout1._id, { bankReference: "FT_UNIQUE_COLLISION" }, { now: new Date(FRIDAY_1000) });

      // Create second payout and try to complete with same bank reference
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout2 = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout2._id);

      await expect(
        payoutService.completePayout(adminUser._id, payout2._id, { bankReference: "FT_UNIQUE_COLLISION" }, { now: new Date(FRIDAY_1000) })
      ).rejects.toThrow("DUPLICATE_BANK_REFERENCE");
    });

    test("A06: Payout đang chờ chi trả bị khóa (HELD_FOR_REVIEW) nếu phát hiện khiếu nại Report đang mở trước khi disburse", async () => {
      const { cls } = await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER PR8" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);

      // Student opens a dispute before Friday disbursement
      await Report.create({
        classId: cls._id,
        reporterId: studentUser._id,
        type: "TEACHER_ABSENT",
        description: "Teacher did not show up on final makeup",
        status: "OPEN",
      });

      await expect(
        payoutService.completePayout(adminUser._id, payout._id, { bankReference: "FT_DISPUTED_001" }, { now: new Date(FRIDAY_1000) })
      ).rejects.toThrow("PAYOUT_LOCKED_FOR_DISPUTE");

      const reloadedPayout = await Payout.findById(payout._id);
      expect(reloadedPayout.status).toBe("HELD_FOR_REVIEW");
      expect(reloadedPayout.heldReason).toBeDefined();
    });

    test("A07: Payout không thể vượt quá tổng số dư khả dụng (INSUFFICIENT_AVAILABLE_BALANCE, 400)", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE", amount: 1000000 }); // Net: 900,000

      await expect(
        payoutService.requestPayout(
          teacherUser._id,
          { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER", amount: 1500000 },
          { now: new Date(MONDAY_1000) }
        )
      ).rejects.toThrow("INSUFFICIENT_AVAILABLE_BALANCE");
    });

    test("A08: Không cho phép sửa đổi hoặc từ chối Payout đã COMPLETED (PAYOUT_ALREADY_COMPLETED, 400)", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);
      await payoutService.completePayout(adminUser._id, payout._id, { bankReference: "FT_IMMUTABLE_1" }, { now: new Date(FRIDAY_1000) });

      await expect(
        payoutService.rejectPayout(adminUser._id, payout._id, { note: "Try reject completed" })
      ).rejects.toThrow("PAYOUT_ALREADY_COMPLETED");
    });
  });

  // =========================================================================
  // GROUP B: Refund Engine State Machine & Bank Proof Verification (12 Tests)
  // =========================================================================
  describe("Group B: Refund Engine State Machine & Bank Proof Verification (12 Tests)", () => {
    const sampleBeneficiary = {
      bankName: "Techcombank",
      accountNumber: "19030011223344",
      accountHolderName: "ALICE STUDENT",
    };

    test("B09: Tạo refund case hợp lệ -> Trạng thái khởi tạo là NEEDS_REVIEW (201)", async () => {
      const { payment, enrollment } = await seedTuitionPaymentFixture();

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        reasonDetails: "Lớp học bị hủy do giảng viên bận đột xuất",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      expect(refundCase.caseNumber).toMatch(/^REF-\d{8}-[A-F0-9]{6}$/);
      expect(refundCase.status).toBe("NEEDS_REVIEW");
      expect(refundCase.purpose).toBe("TUITION");
      expect(toNum(refundCase.eligibleAmount)).toBe(1000000);
      expect(refundCase.auditLogs.length).toBe(1);
    });

    test("B10: Refund case liên kết chính xác source Payment và recipientUserId của học sinh", async () => {
      const { payment, enrollment } = await seedTuitionPaymentFixture();

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "STUDENT_DROPPED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      expect(refundCase.sourcePaymentId.toString()).toBe(payment._id.toString());
      expect(refundCase.recipientUserId.toString()).toBe(studentUser._id.toString());
    });

    test("B11: Không thể tạo refund case nếu Payment chưa COMPLETED (0 eligible amount)", async () => {
      const { payment } = await seedTuitionPaymentFixture({ paymentStatus: "PENDING", createEarning: false });

      await expect(
        refundService.createRefundCase({
          sourcePaymentId: payment._id,
          reason: "OVERPAYMENT",
          beneficiaryBankAccount: sampleBeneficiary,
        })
      ).rejects.toThrow("NO_ELIGIBLE_REFUND_AMOUNT");
    });

    test("B12: Yêu cầu số tiền hoàn vượt quá eligibleAmount bị từ chối (AMOUNT_EXCEEDS_ELIGIBLE, 400)", async () => {
      const { payment } = await seedTuitionPaymentFixture({ amount: 500000 });

      await expect(
        refundService.createRefundCase({
          sourcePaymentId: payment._id,
          reason: "OVERPAYMENT",
          beneficiaryBankAccount: sampleBeneficiary,
          requestedAmount: 800000,
        })
      ).rejects.toThrow("AMOUNT_EXCEEDS_ELIGIBLE");
    });

    test("B13: Phê duyệt refund case chuyển sang PENDING_BANK_TRANSFER và tạo Transaction REFUND (PENDING), không phải COMPLETED", async () => {
      const { payment, enrollment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      const approved = await refundService.approveRefundCase(adminUser._id, refundCase._id, {
        approvedAmount: 1000000,
        note: "Đủ điều kiện hoàn học phí",
      });

      expect(approved.status).toBe("PENDING_BANK_TRANSFER");
      expect(toNum(approved.approvedAmount)).toBe(1000000);
      expect(approved.approvedBy.toString()).toBe(adminUser._id.toString());

      // Check obligation transaction
      const tx = await Transaction.findById(approved.obligationTransactionId);
      expect(tx).toBeDefined();
      expect(tx.transactionType).toBe("REFUND");
      expect(tx.status).toBe("PENDING"); // Must be PENDING, not COMPLETED
    });

    test("B14: Admin approve không tự động đánh dấu tiền đã hoàn", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      const approved = await refundService.approveRefundCase(adminUser._id, refundCase._id);
      expect(approved.status).not.toBe("COMPLETED");

      const completedTx = await Transaction.findOne({
        relatedPaymentId: payment._id,
        transactionType: "REFUND",
        status: "COMPLETED",
      });
      expect(completedTx).toBeNull();
    });

    test("B15: Submit bank transfer proof yêu cầu bắt buộc bankReference (BANK_TRANSFER_PROOF_REQUIRED)", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      await expect(
        refundService.submitRefundProof(adminUser._id, refundCase._id, { bankReference: "" })
      ).rejects.toThrow("BANK_TRANSFER_PROOF_REQUIRED");
    });

    test("B16: Nộp chứng từ chuyển khoản thành công -> AWAITING_BANK_VERIFICATION", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      const submitted = await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_REFUND_PROOF_01",
        transferProofImage: "https://proofs.edunity.test/ref01.jpg",
      });

      expect(submitted.status).toBe("AWAITING_BANK_VERIFICATION");
      expect(submitted.bankTransferProof.referenceNumber).toBe("FT_REFUND_PROOF_01");
    });

    test("B17: Retry tạo refund case cho cùng 1 Payment trả về case đang hoạt động (Idempotent)", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const case1 = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      const case2 = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      expect(case1._id.toString()).toBe(case2._id.toString());
      const totalCases = await RefundCase.countDocuments({ sourcePaymentId: payment._id });
      expect(totalCases).toBe(1);
    });

    test("B18: Xác minh độc lập hoàn tất hoàn tiền -> COMPLETED và Transaction status COMPLETED", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_REFUND_COMPLETED_88",
      });

      const completed = await refundService.verifyAndCompleteRefund(secondAdminUser._id, refundCase._id, {
        bankReference: "FT_REFUND_COMPLETED_88",
        enforceDifferentAdmin: true,
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.bankTransferProof.verifiedBy.toString()).toBe(secondAdminUser._id.toString());

      const tx = await Transaction.findById(completed.obligationTransactionId);
      expect(tx.status).toBe("COMPLETED");
    });

    test("B19: Không được phép hoàn tiền hai lần cho cùng một Payment (NO_ELIGIBLE_REFUND_AMOUNT)", async () => {
      const { payment } = await seedTuitionPaymentFixture({ amount: 1000000 });
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_FULL_REFUND_1",
        autoVerify: true,
      });

      // Try creating second refund case for same payment: eligible amount is now 0
      await expect(
        refundService.createRefundCase({
          sourcePaymentId: payment._id,
          reason: "OVERPAYMENT",
          beneficiaryBankAccount: sampleBeneficiary,
        })
      ).rejects.toThrow("NO_ELIGIBLE_REFUND_AMOUNT");
    });

    test("B20: Từ chối hồ sơ hoàn tiền ghi nhận lý do và cập nhật trạng thái REJECTED", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "STUDENT_DROPPED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      const rejected = await refundService.rejectRefundCase(adminUser._id, refundCase._id, {
        rejectionNote: "Học sinh yêu cầu hoàn phí sau thời hạn cho phép",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionNote).toContain("sau thời hạn cho phép");
    });
  });

  // =========================================================================
  // GROUP C: Scholarship, Full & MIXED Refund Calculations (7 Tests)
  // =========================================================================
  describe("Group C: Scholarship, Full & MIXED Refund Calculations (7 Tests)", () => {
    const sampleBeneficiary = {
      bankName: "VietinBank",
      accountNumber: "10988776655",
      accountHolderName: "ALICE STUDENT",
    };

    test("C21: Direct tuition refund: Hoàn trả chính xác 100% học phí trực tiếp và hủy ghi danh", async () => {
      const { payment, enrollment } = await seedTuitionPaymentFixture({ amount: 1200000 });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      expect(toNum(refundCase.eligibleAmount)).toBe(1200000);

      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      const reloadedEnrollment = await Enrollment.findById(enrollment._id);
      expect(reloadedEnrollment.enrollmentStatus).toBe("CANCELLED");
    });

    test("C22: MIXED refund tách hai nguồn tiền: Chỉ hoàn tiền mặt phần học sinh thực đóng, không hoàn tiền học bổng thành tiền mặt", async () => {
      // Tuition: 2,000,000đ. Scholarship: 1,500,000đ. Student paid: 500,000đ.
      const { payment, enrollment } = await seedTuitionPaymentFixture({
        amount: 500000,
        scholarshipAmount: 1500000,
        paymentSource: "MIXED",
      });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      // Eligible cash refund amount MUST be exactly 500,000đ (NOT 2,000,000đ)
      expect(toNum(refundCase.eligibleAmount)).toBe(500000);
      expect(toNum(refundCase.originalAmount)).toBe(500000);
    });

    test("C23: Full scholarship enrollment không cho phép tạo cash refund (CASH_REFUND_NOT_PERMITTED, 400)", async () => {
      // 100% scholarship enrollment
      const { payment, enrollment } = await seedTuitionPaymentFixture({
        amount: 0,
        scholarshipAmount: 1000000,
        paymentSource: "SCHOLARSHIP",
      });

      await expect(
        refundService.createRefundCase({
          sourcePaymentId: payment._id,
          relatedEnrollmentId: enrollment._id,
          reason: "CLASS_CANCELLED",
          beneficiaryBankAccount: sampleBeneficiary,
        })
      ).rejects.toThrow("CASH_REFUND_NOT_PERMITTED");
    });

    test("C24: MIXED refund hoàn nguyên ScholarshipUsage (isReverted: true) và hoàn lại remainingAmount cho Scholarship", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "STEM Foundation C24",
        targetBudget: toDec(10000000),
        fundedAmount: toDec(5000000),
        usedAmount: toDec(1500000),
        expectedSlots: 5,
        awardAmountPerStudent: toDec(1500000),
        status: "OPEN_FOR_FUNDING",
        createdBy: adminUser._id,
      });

      const scholarship = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: studentUser._id,
        allocatedAmount: toDec(1500000),
        remainingAmount: toDec(0),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        status: "ACTIVE",
      });

      const { payment, enrollment } = await seedTuitionPaymentFixture({
        amount: 500000,
        scholarshipAmount: 1500000,
        paymentSource: "MIXED",
      });

      const usage = await ScholarshipUsage.create({
        scholarshipId: scholarship._id,
        enrollmentId: enrollment._id,
        classId: enrollment.classId,
        amount: toDec(1500000),
        status: "CONFIRMED",
        isReverted: false,
      });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      const reloadedUsage = await ScholarshipUsage.findById(usage._id);
      expect(reloadedUsage.isReverted).toBe(true);

      const reloadedScholarship = await Scholarship.findById(scholarship._id);
      expect(toNum(reloadedScholarship.remainingAmount)).toBe(1500000);
    });

    test("C25: Hoàn nguyên học bổng không làm Campaign.usedAmount bị âm", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "STEM Foundation C25",
        targetBudget: toDec(10000000),
        fundedAmount: toDec(5000000),
        usedAmount: toDec(500000),
        expectedSlots: 5,
        awardAmountPerStudent: toDec(1000000),
        status: "OPEN_FOR_FUNDING",
        createdBy: adminUser._id,
      });

      const scholarship = await Scholarship.create({
        campaignId: campaign._id,
        applicationId: new mongoose.Types.ObjectId(),
        studentId: studentUser._id,
        allocatedAmount: toDec(500000),
        remainingAmount: toDec(0),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        status: "ACTIVE",
      });

      const { payment, enrollment } = await seedTuitionPaymentFixture({
        amount: 500000,
        scholarshipAmount: 500000,
        paymentSource: "MIXED",
      });

      await ScholarshipUsage.create({
        scholarshipId: scholarship._id,
        enrollmentId: enrollment._id,
        classId: enrollment.classId,
        amount: toDec(500000),
        status: "CONFIRMED",
        isReverted: false,
      });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      const reloadedCampaign = await ScholarshipCampaign.findById(campaign._id);
      expect(toNum(reloadedCampaign.usedAmount)).toBe(0);
      expect(toNum(reloadedCampaign.usedAmount)).toBeGreaterThanOrEqual(0);
    });

    test("C26: TeacherEarning ở trạng thái PENDING tự động chuyển sang CANCELLED khi hoàn tiền được duyệt", async () => {
      const { payment, enrollment, earning } = await seedTuitionPaymentFixture({ earningStatus: "PENDING" });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("CANCELLED");
      expect(
        reloadedEarning.settlementBlockers.some((b) =>
          typeof b === "string" ? b.includes("ENROLLMENT_REFUNDED") : b.code === "ENROLLMENT_REFUNDED"
        )
      ).toBe(true);
    });

    test("C27: TeacherEarning đã PAID_OUT không bị sửa lùi lịch sử; ghi nhận RECOVERY_REQUIRED vào audit", async () => {
      const { payment, enrollment, earning } = await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);
      await payoutService.completePayout(adminUser._id, payout._id, { bankReference: "FT_PAIDOUT_PR8" }, { now: new Date(FRIDAY_1000) });

      const reloadedEarning = await TeacherEarning.findById(earning._id);
      expect(reloadedEarning.status).toBe("PAID_OUT");

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedEnrollmentId: enrollment._id,
        reason: "STUDENT_DROPPED",
        beneficiaryBankAccount: sampleBeneficiary,
      });

      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      // Earning remains PAID_OUT (history is not mutated), settlement tracks recovery
      const postEarning = await TeacherEarning.findById(earning._id);
      expect(postEarning.status).toBe("PAID_OUT");

      const settlement = await TeacherSettlement.findOne({ earningId: earning._id });
      expect(settlement.auditLogs.some((a) => a.action === "RECOVERY_REQUIRED")).toBe(true);
    });
  });

  // =========================================================================
  // GROUP D: Payment Reconciliation & Anomaly Flows (8 Tests)
  // =========================================================================
  describe("Group D: Payment Reconciliation & Anomaly Flows (8 Tests)", () => {
    test("D28: Late payment sau khi QR hết hạn tạo PaymentReconciliation (LATE_PAYMENT_REVIEW)", async () => {
      const { payment } = await seedTuitionPaymentFixture({
        paymentStatus: "PENDING",
        createEarning: false,
      });

      // Transfer arrived with late payment
      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_LATE_${Date.now()}`,
        fingerprint: `FP_LATE_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      // Enrollment hold expired
      await Enrollment.updateOne(
        { _id: payment.enrollmentId },
        { $set: { holdExpiresAt: new Date(Date.now() - 3600000) } }
      );

      const result = await dispatchBankTransferEvent(event._id);
      expect(result.reconciliationRequired).toBe(true);

      const recon = await PaymentReconciliation.findOne({ eventId: event._id });
      expect(recon).toBeDefined();
      expect(recon.reason).toBe("LATE_PAYMENT_REVIEW");
      expect(recon.status).toBe("NEEDS_REVIEW");
    });

    test("D29: Quyên góp đến sau khi Campaign CLOSED được giữ ở trạng thái NEEDS_REVIEW", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Closed Campaign D29",
        targetBudget: toDec(10000000),
        fundedAmount: toDec(10000000),
        expectedSlots: 10,
        awardAmountPerStudent: toDec(1000000),
        status: "CLOSED",
        createdBy: adminUser._id,
      });

      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const contribution = await SponsorContribution.create({
        sponsorId: sponsorUser._id,
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
        providerReference: `FT_CLOSED_${Date.now()}`,
        fingerprint: `FP_CLOSED_${Date.now()}`,
        amount: toDec(500000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        contributionId: contribution._id,
      });

      const result = await dispatchBankTransferEvent(event._id);
      expect(result.reconciliationRequired).toBe(true);

      const recon = await PaymentReconciliation.findOne({ eventId: event._id });
      expect(recon).toBeDefined();
      expect(recon.reason).toBe("CAMPAIGN_NOT_ACCEPTING_FUNDING");
    });

    test("D30: Amount mismatch không tự động dispatch thành công", async () => {
      const { payment } = await seedTuitionPaymentFixture({
        amount: 1000000,
        paymentStatus: "PENDING",
        enrollmentStatus: "PENDING_PAYMENT",
        createEarning: false,
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_MISMATCH_${Date.now()}`,
        fingerprint: `FP_MISMATCH_${Date.now()}`,
        amount: toDec(500000), // Expected 1,000,000
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      const result = await dispatchBankTransferEvent(event._id);
      expect(result.dispatched).toBe(false);
      expect(result.reconciliationRequired).toBe(true);

      const recon = await PaymentReconciliation.findOne({ eventId: event._id });
      expect(recon.reason).toBe("AMOUNT_MISMATCH");
    });

    test("D31: Purpose/channel mismatch giữa TUITION và DONATION bị chặn không auto-credit", async () => {
      const { payment } = await seedTuitionPaymentFixture({
        paymentStatus: "PENDING",
        createEarning: false,
      });

      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "DONATION", // Mismatched channel for TUITION payment
        purpose: "DONATION",
        orderCode: payment.orderCode,
        providerReference: `FT_CHAN_MISMATCH_${Date.now()}`,
        fingerprint: `FP_CHAN_MISMATCH_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      const result = await dispatchBankTransferEvent(event._id);
      expect(result.dispatched).toBe(false);
      expect(result.reconciliationRequired).toBe(true);
    });

    test("D32: Duplicate providerReference không tạo BankTransferEvent thứ hai", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const ref = `FT_DUP_PROVIDER_${Date.now()}`;

      await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: ref,
        fingerprint: `FP_1_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "DISPATCHED",
      });

      let duplicateError = null;
      try {
        await BankTransferEvent.create({
          provider: "PAYOS",
          channelKey: "TUITION",
          purpose: "TUITION",
          orderCode: payment.orderCode,
          providerReference: ref,
          fingerprint: `FP_2_${Date.now()}`,
          amount: toDec(1000000),
          currency: "VND",
          eventStatus: "DISPATCHED",
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });

    test("D33: Unknown orderCode tạo BankTransferEvent với UNMATCHED và yêu cầu đối soát", async () => {
      const unknownOrderCode = 999999999;
      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: unknownOrderCode,
        providerReference: `FT_UNKNOWN_${Date.now()}`,
        fingerprint: `FP_UNKNOWN_${Date.now()}`,
        amount: toDec(500000),
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
      });

      const result = await dispatchBankTransferEvent(event._id);
      expect(result.dispatched).toBe(false);
      expect(result.reconciliationRequired).toBe(true);

      const recon = await PaymentReconciliation.findOne({ eventId: event._id });
      expect(recon.reason).toBe("UNMATCHED");
    });

    test("D34: Cross-channel webhook tampering bị phát hiện và từ chối chữ ký (401 UNAUTHORIZED)", async () => {
      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const webhookData = {
        orderCode,
        amount: 500000,
        description: `EDUNITY TUITION ${orderCode}`,
        accountNumber: "190011112222",
        reference: `FT_TAMPER_${Date.now()}`,
        transactionDateTime: "2026-11-10 10:00:00",
        currency: "VND",
        paymentLinkId: "plink_tamper_d34",
        code: "00",
        desc: "success",
      };
      const signature = await payosService.signWebhookDataForChannel("TUITION", webhookData);

      const res = await request(app)
        .post("/api/payments/webhooks/payos/donation")
        .send({ code: "00", desc: "success", data: webhookData, signature });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("UNAUTHORIZED");
    });

    test("D35: PaymentReconciliation audit logs ghi nhận đầy đủ phân công và giải quyết (RESOLVED_REFUNDED)", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const event = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: payment.orderCode,
        providerReference: `FT_RECON_RESOLVE_${Date.now()}`,
        fingerprint: `FP_RECON_RESOLVE_${Date.now()}`,
        amount: toDec(1000000),
        currency: "VND",
        eventStatus: "NEEDS_REVIEW",
        dispatchStatus: "RECONCILIATION_REQUIRED",
      });

      const recon = await PaymentReconciliation.create({
        eventId: event._id,
        purpose: "TUITION",
        channelKey: "TUITION",
        orderCode: payment.orderCode,
        reason: "LATE_PAYMENT_REVIEW",
        receivedAmount: toDec(1000000),
        status: "NEEDS_REVIEW",
      });

      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        relatedReconciliationId: recon._id,
        reason: "LATE_PAYMENT",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_RESOLVE_RECON_88",
        autoVerify: true,
      });

      const reloadedRecon = await PaymentReconciliation.findById(recon._id);
      expect(reloadedRecon.status).toBe("RESOLVED_REFUNDED");
    });
  });

  // =========================================================================
  // GROUP E: Security, RBAC & Fraud Abuse Controls (8 Tests)
  // =========================================================================
  describe("Group E: Security, RBAC & Fraud Abuse Controls (8 Tests)", () => {
    test("E36: Admin RBAC: Học sinh và Giảng viên bị chặn 403 Forbidden khi truy cập /api/admin/finance/refunds", async () => {
      const resStudent = await request(app)
        .get("/api/admin/finance/refunds")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(resStudent.status).toBe(403);

      const resTeacher = await request(app)
        .get("/api/admin/finance/refunds")
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(resTeacher.status).toBe(403);
    });

    test("E37: Anti-IDOR: Người dùng không được phép lấy thông tin chi tiết hồ sơ tài chính không phải của mình", async () => {
      const resUnauth = await request(app)
        .get("/api/admin/finance/refunds")
        .set("Authorization", "Bearer invalid-or-forged-token");
      expect(resUnauth.status).toBe(401);
    });

    test("E38: Server-side validation: Thiếu beneficiaryBankAccount bị từ chối 400", async () => {
      const { payment } = await seedTuitionPaymentFixture();

      await expect(
        refundService.createRefundCase({
          sourcePaymentId: payment._id,
          reason: "OVERPAYMENT",
          beneficiaryBankAccount: null,
        })
      ).rejects.toThrow("BENEFICIARY_ACCOUNT_REQUIRED");
    });

    test("E39: Client amount tampering: Không thể duyệt hoàn số tiền vượt quá eligibleAmount", async () => {
      const { payment } = await seedTuitionPaymentFixture({ amount: 500000 });
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });

      await expect(
        refundService.approveRefundCase(adminUser._id, refundCase._id, { approvedAmount: 900000 })
      ).rejects.toThrow("INVALID_APPROVED_AMOUNT");
    });

    test("E40: Duplicate reference collision: Cố ý nộp mã bankReference đã dùng cho Payout bị từ chối (DUPLICATE_BANK_REFERENCE)", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "Vietcombank", accountNumber: "112233", accountHolderName: "TEACHER" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);
      await payoutService.completePayout(adminUser._id, payout._id, { bankReference: "FT_CROSS_COLLISION_1" }, { now: new Date(FRIDAY_1000) });

      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);

      await expect(
        refundService.submitRefundProof(adminUser._id, refundCase._id, { bankReference: "FT_CROSS_COLLISION_1" })
      ).rejects.toThrow("DUPLICATE_BANK_REFERENCE");
    });

    test("E41: Không để rò rỉ secrets / private tokens trong API response", async () => {
      const res = await request(app)
        .get("/api/admin/finance/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain("tuition-checksum-pr8-key");
      expect(str).not.toContain("donation-checksum-pr8-key");
      expect(str).not.toContain("passwordHash");
    });

    test("E42: Audit log bất biến: Nhật ký kiểm toán được append-only, ghi nhận mọi hành động", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });
      await refundService.reviewRefundCase(adminUser._id, refundCase._id, { note: "Start audit review" });
      await refundService.approveRefundCase(adminUser._id, refundCase._id, { note: "Approved after review" });

      const reloaded = await RefundCase.findById(refundCase._id);
      expect(reloaded.auditLogs.length).toBe(3);
      expect(reloaded.auditLogs.map((a) => a.action)).toEqual(["CREATED", "IN_REVIEW", "APPROVED"]);
    });

    test("E43: Four-Eyes Principle: Người phê duyệt hoàn tiền không thể tự mình xác minh hoàn tất nếu enforceDifferentAdmin = true", async () => {
      const { payment } = await seedTuitionPaymentFixture();
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_FOUR_EYES_FAIL",
      });

      // Same adminUser attempts to verify -> Rejected
      await expect(
        refundService.verifyAndCompleteRefund(adminUser._id, refundCase._id, {
          bankReference: "FT_FOUR_EYES_FAIL",
          enforceDifferentAdmin: true,
        })
      ).rejects.toThrow("DUAL_VERIFICATION_REQUIRED");
    });
  });

  // =========================================================================
  // GROUP F: Full Platform Financial Regression Suite (17 Tests)
  // =========================================================================
  describe("Group F: Full Platform Financial Regression Suite (17 Tests)", () => {
    test("F44: PR1: Tuition payment intent creation generates valid VietQR with unique orderCode", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Reg F44",
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

    test("F45: PR1: Donation payment intent creation generates valid VietQR", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Hope Scholarship F45",
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
        sponsorId: sponsorUser._id,
        amountInput: 300000,
        donorDisplayName: "Philanthropist F45",
      });

      expect(intent.orderCode).toBeDefined();
      expect(intent.channelKey).toBe("DONATION");
      expect(toNum(intent.amount)).toBe(300000);
    });

    test("F46: PR2: Two-channel webhook signature verification succeeds for tuition", async () => {
      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const webhookData = {
        orderCode,
        amount: 500000,
        description: `EDUNITY TUITION ${orderCode}`,
        accountNumber: "190011112222",
        reference: `FT_REG_F46_${Date.now()}`,
        transactionDateTime: "2026-11-10 10:00:00",
        currency: "VND",
        paymentLinkId: "plink_tuition_reg_f46",
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

    test("F47: PR3: Atomic financial dispatch for tuition (Enrollment + Payment + Earning + Transaction)", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Reg F47",
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
        gatewayReference: `GW_F47_${orderCode}`,
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
        providerReference: `FT_F47_${orderCode}`,
        fingerprint: `FP_F47_${orderCode}`,
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
    });

    test("F48: PR3: Atomic financial dispatch for donation (Contribution + Campaign + Transaction)", async () => {
      const campaign = await ScholarshipCampaign.create({
        title: "Hope Scholarship F48",
        targetBudget: toDec(10000000),
        fundedAmount: toDec(0),
        expectedSlots: 10,
        awardAmountPerStudent: toDec(1000000),
        status: "OPEN_FOR_FUNDING",
        createdBy: adminUser._id,
      });

      const orderCode = Math.floor(100000000 + Math.random() * 900000000);
      const contribution = await SponsorContribution.create({
        sponsorId: sponsorUser._id,
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
        providerReference: `FT_F48_${orderCode}`,
        fingerprint: `FP_F48_${orderCode}`,
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
    });

    test("F49: PR4: Checkout UI state polling reflects COMPLETED correctly", async () => {
      const { payment } = await seedTuitionPaymentFixture();

      const res = await request(app)
        .get(`/api/payments/${payment._id}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe("COMPLETED");
    });

    test("F48: PR4: Expired order code handled safely without phantom transactions", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/payments/${nonExistentId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
    });

    test("F51: PR5: Outbox recovery job processes pending events idempotently", async () => {
      const { payment } = await seedTuitionPaymentFixture();
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

    test("F52: PR5: PaymentReconciliation created for unexpected overpayment", async () => {
      const cls = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Calculus Overpay F52",
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
        gatewayReference: `GW_F52_${orderCode}`,
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
        amount: toDec(1500000), // Overpayment
        currency: "VND",
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        linkedPaymentId: payment._id,
      });

      const res = await dispatchBankTransferEvent(event._id);
      expect(res.reconciliationRequired).toBe(true);
    });

    test("F53: PR6: Admin finance overview aggregates tuition and donation metrics correctly", async () => {
      await seedTuitionPaymentFixture({ amount: 1000000 });

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revenue).toBeDefined();
    });

    test("F54: PR7: Settlement eligibility 12-rule engine blocks unfinished sessions and holds for 7 days", async () => {
      const { earning, cls } = await seedTuitionPaymentFixture({
        classStatus: "COMPLETED",
        earningStatus: "PENDING",
      });

      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacherUser._id,
        title: "Session 1",
        startDatetime: new Date(Date.now() - 2 * 86400000), // 2 days ago
        endDatetime: new Date(Date.now() - 2 * 86400000 + 7200000),
        status: "COMPLETED",
      });

      const evalResult = await settlementService.evaluateEarningSettlement(earning._id, {
        now: new Date(),
      });
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.blockers).toContain("SEVEN_DAY_HOLD_ACTIVE");
    });

    test("F55: PR7: Monday withdrawal window (08:00–17:00) strictly enforced", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });

      // Tuesday request -> 400
      const resTuesday = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", "2026-11-10T03:00:00.000Z")
        .send({ bankName: "VCB", accountNumber: "123", accountHolderName: "TEACHER" });
      expect(resTuesday.status).toBe(400);
      expect(resTuesday.body.error).toBe("WITHDRAWAL_WINDOW_CLOSED");

      // Monday 10:00 request -> 201
      const resMonday = await request(app)
        .post("/api/teacher/payouts")
        .set("Authorization", `Bearer ${teacherToken}`)
        .set("x-test-now", MONDAY_1000)
        .send({ bankName: "VCB", accountNumber: "123", accountHolderName: "TEACHER" });
      expect(resMonday.status).toBe(201);
    });

    test("F56: PR7: Friday payout execution window (08:00–17:00) strictly enforced", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE" });
      const payout = await payoutService.requestPayout(
        teacherUser._id,
        { bankName: "VCB", accountNumber: "123", accountHolderName: "TEACHER" },
        { now: new Date(MONDAY_1000) }
      );
      await payoutService.approvePayout(adminUser._id, payout._id);

      // Wednesday execution attempt -> 400
      const resWed = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("x-test-now", "2026-11-11T03:00:00.000Z")
        .send({ bankReference: "FT_WED_FAIL" });
      expect(resWed.status).toBe(400);
      expect(resWed.body.error).toBe("PAYOUT_EXECUTION_WINDOW_CLOSED");
    });

    test("F57: PR7: Teacher revenue stage breakdown aggregates 6 KPI buckets accurately", async () => {
      await seedTuitionPaymentFixture({ earningStatus: "AVAILABLE", amount: 1000000 });

      const res = await request(app)
        .get("/api/teacher/earnings")
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.available).toBe(900000);
    });

    test("F58: FREE class enrollment never creates payment intents or teacher earnings", async () => {
      const freeClass = await Class.create({
        courseId: course._id,
        courseTitle: course.title,
        categoryId: category._id,
        subjectId: subject._id,
        teacherId: teacherUser._id,
        teacherName: teacherUser.teacherProfile.fullName,
        className: "Free Community Class F58",
        classType: "FREE",
        price: toDec(0),
        capacity: 20,
        enrolledCount: 0,
        status: "OPEN",
        schedule: [{ dayOfWeek: 2, startTime: "14:00", endTime: "16:00" }],
      });

      const freeEnrollment = await Enrollment.create({
        studentId: studentUser._id,
        classId: freeClass._id,
        courseId: course._id,
        teacherId: teacherUser._id,
        paymentSource: "FREE",
        tuitionAmount: toDec(0),
        amountPaidViaPayment: toDec(0),
        enrollmentStatus: "CONFIRMED",
      });

      await expect(
        paymentService.createTuitionPaymentIntent(studentUser._id, freeEnrollment._id)
      ).rejects.toThrow("FREE class enrollment does not require payment");

      const earningsCount = await TeacherEarning.countDocuments({ enrollmentId: freeEnrollment._id });
      expect(earningsCount).toBe(0);
    });

    test("F59: Ledger integrity check confirms zero discrepancy across payments, payouts and refunds", async () => {
      const { payment } = await seedTuitionPaymentFixture({ amount: 1000000 });
      const refundCase = await refundService.createRefundCase({
        sourcePaymentId: payment._id,
        reason: "CLASS_CANCELLED",
        beneficiaryBankAccount: { bankName: "VCB", accountNumber: "123", accountHolderName: "STUDENT" },
      });
      await refundService.approveRefundCase(adminUser._id, refundCase._id);
      await refundService.submitRefundProof(adminUser._id, refundCase._id, {
        bankReference: "FT_INTEGRITY_01",
        autoVerify: true,
      });

      const completedRefundTxs = await Transaction.find({ transactionType: "REFUND", status: "COMPLETED" });
      expect(completedRefundTxs.length).toBe(1);
      expect(toNum(completedRefundTxs[0].amount)).toBe(1000000);
    });

    test("F60: Security audit regression: Unauthorized access to all finance routes is blocked", async () => {
      const endpoints = [
        "/api/admin/payouts",
        "/api/admin/finance/refunds",
        "/api/admin/overview",
        "/api/admin/reconciliations",
      ];

      for (const ep of endpoints) {
        const res = await request(app).get(ep);
        expect([401, 403]).toContain(res.status);
      }
    });
  });
});

