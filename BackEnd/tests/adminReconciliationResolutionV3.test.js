const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog } = require("./helpers/financialFixtures");
const mongoose = require("mongoose");

const financeService = require("../src/services/financeService");
const PaymentReconciliation = require("../src/models/PaymentReconciliation");
const RefundCase = require("../src/models/RefundCase");
const Payment = require("../src/models/Payment");
const Enrollment = require("../src/models/Enrollment");
const Class = require("../src/models/Class");
const BankTransferEvent = require("../src/models/BankTransferEvent");

describe("Admin Reconciliation Resolution V3 Test Suite", () => {
  let adminUser;
  let studentUser;
  let teacherUser;
  let testClass;
  let testCourse;
  let testCategory;
  let testSubject;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();

    ({ admin: adminUser, student: studentUser, teacher: teacherUser, category: testCategory, subject: testSubject, course: testCourse } = actors);

    testClass = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Thầy Test V3",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      className: `Lớp Đối Soát V3 ${Date.now()}`,
      classType: "PAID",
      price: "5000",
      capacity: 30,
      enrolledCount: 0,
      status: "OPEN",
    });
  });

  afterAll(disconnectDB);

  test("1. Rejects resolution with invalid ID (400)", async () => {
    await expect(
      financeService.resolveReconciliation("invalid-id", adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "Valid note",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("2. Rejects resolution for non-existent reconciliation (404)", async () => {
    const randomId = new mongoose.Types.ObjectId();
    await expect(
      financeService.resolveReconciliation(randomId, adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "Valid note",
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  test("3. Rejects resolution without required note (400)", async () => {
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 887766001,
      providerReference: `FT_RES_${Date.now()}_01`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_01`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 887766001,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    await expect(
      financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "   ",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "RESOLUTION_NOTE_REQUIRED",
    });

    // Cleanup
    await PaymentReconciliation.deleteOne({ _id: recon._id });
    await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
  });

  test("4. Rejects resolution with invalid outcome (400)", async () => {
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 887766002,
      providerReference: `FT_RES_${Date.now()}_02`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_02`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 887766002,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    await expect(
      financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "INVALID_STATUS_XYZ",
        note: "Ghi chú hợp lệ",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_RESOLUTION_OUTCOME",
    });

    // Cleanup
    await PaymentReconciliation.deleteOne({ _id: recon._id });
    await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
  });

  test("5. Safety Guard: Rejects RESOLVED_APPROVED if reconciliation has no Payment/Contribution (400)", async () => {
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 887766003,
      providerReference: `FT_RES_${Date.now()}_03`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_03`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 887766003,
      paymentId: null,
      enrollmentId: null,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    await expect(
      financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "Cố tình duyệt khi không có payment",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "CANNOT_APPROVE_UNMATCHED_PAYMENT",
    });

    // Cleanup
    await PaymentReconciliation.deleteOne({ _id: recon._id });
    await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
  });

  test("6. Safety Guard: Rejects RESOLVED_APPROVED if reason is REFERENCE_COLLISION (400)", async () => {
    const orderCode6 = 887766004;
    const class6 = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Thầy Test V3",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      className: `Lớp Test 6 ${Date.now()}`,
      classType: "PAID",
      price: "5000",
      capacity: 30,
      enrolledCount: 0,
      status: "OPEN",
    });

    const fakeEnrollment = await Enrollment.create({
      classId: class6._id,
      courseId: testCourse._id,
      teacherId: teacherUser._id,
      studentId: studentUser._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      holdExpiresAt: new Date(Date.now() + 600_000),
      tuitionAmount: "5000",
    });

    const fakePayment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      enrollmentId: fakeEnrollment._id,
      payerUserId: studentUser._id,
      gateway: "PAYOS",
      provider: "PAYOS",
      gatewayReference: `gw_ref_test_${Date.now()}_04`,
      orderCode: orderCode6,
      amount: "5000",
      paymentStatus: "PENDING",
    });

    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: orderCode6,
      providerReference: `FT_RES_${Date.now()}_04`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_04`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: orderCode6,
      paymentId: fakePayment._id,
      enrollmentId: fakeEnrollment._id,
      reason: "REFERENCE_COLLISION",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    try {
      await expect(
        financeService.resolveReconciliation(recon._id, adminUser, {
          outcome: "RESOLVED_APPROVED",
          note: "Cố tình duyệt khi có collision",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "CANNOT_APPROVE_COLLISION",
      });
    } finally {
      await PaymentReconciliation.deleteOne({ _id: recon._id });
      await Payment.deleteOne({ _id: fakePayment._id });
      await Enrollment.deleteOne({ _id: fakeEnrollment._id });
      await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
      await Class.deleteOne({ _id: class6._id });
    }
  });

  test("7. RESOLVED_APPROVED successfully activates Payment, Enrollment, and Class enrolledCount", async () => {
    const orderCode7 = 887766005;
    const class7 = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Thầy Test V3",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      className: `Lớp Test 7 ${Date.now()}`,
      classType: "PAID",
      price: "5000",
      capacity: 30,
      enrolledCount: 0,
      status: "OPEN",
    });

    // The legacy reservation is past its hold and has no seat in the class counter.
    const enrollment = await Enrollment.create({
      classId: class7._id,
      courseId: testCourse._id,
      teacherId: teacherUser._id,
      studentId: studentUser._id,
      enrollmentStatus: "PENDING_PAYMENT",
      paymentSource: "DIRECT_PAYMENT",
      holdExpiresAt: new Date(Date.now() - 60_000),
      tuitionAmount: "5000",
    });

    // 2. Create Payment
    const payment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      enrollmentId: enrollment._id,
      payerUserId: studentUser._id,
      gateway: "PAYOS",
      provider: "PAYOS",
      gatewayReference: `gw_ref_test_${Date.now()}_05`,
      orderCode: orderCode7,
      amount: "5000",
      paymentStatus: "PENDING",
    });

    // 3. Create BankTransferEvent
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: orderCode7,
      providerReference: `FT_RES_${Date.now()}_05`,
      amount: "5000",
      currency: "VND",
      eventStatus: "ACCOUNT_MISMATCH",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_05`,
    });

    // 4. Create Reconciliation
    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: orderCode7,
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      reason: "ACCOUNT_MISMATCH",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    const initialCount = class7.enrolledCount;

    try {
      // Execute Resolution
      const resolved = await financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "Xác minh tài khoản thụ hưởng đúng của VietQR Pro, duyệt kích hoạt học viên.",
      });

      expect(resolved.status).toBe("RESOLVED_APPROVED");
      expect(resolved.resolutionNote).toBe(
        "Xác minh tài khoản thụ hưởng đúng của VietQR Pro, duyệt kích hoạt học viên."
      );
      expect(resolved.resolvedBy).toBeDefined();
      expect(resolved.resolvedAt).toBeDefined();

      // Verify Payment updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.paymentStatus).toBe("COMPLETED");
      expect(updatedPayment.providerStatus).toBe("PAID");

      // Verify Enrollment updated
      const updatedEnrollment = await Enrollment.findById(enrollment._id);
      expect(updatedEnrollment.enrollmentStatus).toBe("CONFIRMED");

      // Verify Class enrolledCount incremented
      const updatedClass = await Class.findById(class7._id);
      expect(updatedClass.enrolledCount).toBe(initialCount + 1);

      // Verify BankTransferEvent dispatched
      const updatedBte = await BankTransferEvent.findById(fakeEvent._id);
      expect(updatedBte.dispatchStatus).toBe("DISPATCHED");
    } finally {
      // Cleanup
      await PaymentReconciliation.deleteOne({ _id: recon._id });
      await Payment.deleteOne({ _id: payment._id });
      await Enrollment.deleteOne({ _id: enrollment._id });
      await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
      await Class.deleteOne({ _id: class7._id });
    }
  });

  test("8. RESOLVED_REFUNDED successfully creates RefundCase in NEEDS_REVIEW status (Pending Liability)", async () => {
    const orderCode8 = 887766006;
    const class8 = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Thầy Test V3",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      className: `Lớp Test 8 ${Date.now()}`,
      classType: "PAID",
      price: "5000",
      capacity: 30,
      enrolledCount: 0,
      status: "OPEN",
    });

    // 1. Create Enrollment
    const enrollment = await Enrollment.create({
      classId: class8._id,
      courseId: testCourse._id,
      teacherId: teacherUser._id,
      studentId: studentUser._id,
      enrollmentStatus: "EXPIRED",
      paymentSource: "DIRECT_PAYMENT",
      tuitionAmount: "5000",
    });

    // 2. Create Payment
    const payment = await Payment.create({
      purpose: "TUITION",
      channelKey: "TUITION",
      enrollmentId: enrollment._id,
      payerUserId: studentUser._id,
      gateway: "PAYOS",
      provider: "PAYOS",
      gatewayReference: `gw_ref_test_${Date.now()}_06`,
      orderCode: orderCode8,
      amount: "5000",
      paymentStatus: "COMPLETED",
    });

    // 3. Create BankTransferEvent
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: orderCode8,
      providerReference: `FT_RES_${Date.now()}_06`,
      amount: "5000",
      currency: "VND",
      eventStatus: "EXPIRED_PAYMENT",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_06`,
      metadata: {
        counterAccountNumber: "0987654321",
        counterAccountName: "NGUYEN VAN TEST",
        counterAccountBankId: "VCB",
      },
    });

    // 4. Create Reconciliation
    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: orderCode8,
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      reason: "EXPIRED_PAYMENT",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    try {
      // Execute Resolution as RESOLVED_REFUNDED
      const resolved = await financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "RESOLVED_REFUNDED",
        note: "Học viên thanh toán muộn khi đơn đã hết hạn, lập hồ sơ hoàn tiền.",
      });

      expect(resolved.status).toBe("RESOLVED_REFUNDED");
      expect(resolved.refundCase).toBeDefined();
      expect(resolved.refundCase.status).toBe("NEEDS_REVIEW");
      expect(resolved.refundCase.caseNumber).toMatch(/^REF-/);

      // Verify in database that RefundCase exists in NEEDS_REVIEW
      const refundCaseInDb = await RefundCase.findOne({ relatedReconciliationId: recon._id });
      expect(refundCaseInDb).not.toBeNull();
      expect(refundCaseInDb.status).toBe("NEEDS_REVIEW");
      expect(refundCaseInDb.beneficiaryBankAccount.accountNumber).toBe("0987654321");

      if (refundCaseInDb) {
        await RefundCase.deleteOne({ _id: refundCaseInDb._id });
      }
    } finally {
      // Cleanup
      await PaymentReconciliation.deleteOne({ _id: recon._id });
      await Payment.deleteOne({ _id: payment._id });
      await Enrollment.deleteOne({ _id: enrollment._id });
      await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
      await Class.deleteOne({ _id: class8._id });
    }
  });

  test("9. RESOLVED_IGNORED successfully closes reconciliation with audit note", async () => {
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 887766007,
      providerReference: `FT_RES_${Date.now()}_07`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_res_test_${Date.now()}_07`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 887766007,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      assignedTo: adminUser._id,
    });

    const resolved = await financeService.resolveReconciliation(recon._id, adminUser, {
      outcome: "RESOLVED_IGNORED",
      note: "Giao dịch thử nghiệm nội bộ giả mạo, đóng hồ sơ không hạch toán tài chính.",
    });

    expect(resolved.status).toBe("RESOLVED_IGNORED");
    expect(resolved.resolutionNote).toBe("Giao dịch thử nghiệm nội bộ giả mạo, đóng hồ sơ không hạch toán tài chính.");

    // Cleanup
    await PaymentReconciliation.deleteOne({ _id: recon._id });
    await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
  });

  test("10. Terminal Status Guard: Cannot re-resolve a resolved case (409 Conflict)", async () => {
    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 887766008,
      providerReference: `FT_RES_${Date.now()}_08`,
      amount: "5000",
      currency: "VND",
      eventStatus: "DISPATCHED",
      dispatchStatus: "DISPATCHED",
      fingerprint: `fp_res_test_${Date.now()}_08`,
    });

    const recon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 887766008,
      reason: "NEEDS_REVIEW",
      receivedAmount: "5000",
      status: "RESOLVED_IGNORED",
      resolvedBy: adminUser._id,
      resolvedAt: new Date(),
      resolutionNote: "Đã đóng",
    });

    // Attempt to re-resolve
    await expect(
      financeService.resolveReconciliation(recon._id, adminUser, {
        outcome: "RESOLVED_APPROVED",
        note: "Cố tình giải quyết lại",
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECONCILIATION_ALREADY_RESOLVED",
    });

    // Attempt to re-assign
    await expect(
      financeService.assignReconciliation(recon._id, adminUser, {
        assignedTo: adminUser._id.toString(),
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECONCILIATION_ALREADY_RESOLVED",
    });

    // Cleanup
    await PaymentReconciliation.deleteOne({ _id: recon._id });
    await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
  });
});
