const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident, bankSnapshot } = require("./helpers/financialFixtures");
const Payment = require("../src/models/Payment");
const Enrollment = require("../src/models/Enrollment");
const Class = require("../src/models/Class");
const Transaction = require("../src/models/Transaction");
const TeacherEarning = require("../src/models/TeacherEarning");
const RefundCase = require("../src/models/RefundCase");

const refundService = require("../src/services/refundService");
const enrollmentService = require("../src/services/enrollmentService");

describe("EDUNITY-TUITION-RECONCILIATION-ADMIN-REFUND Integrity & Regression Suite", () => {
  let incident;
  let tuitionStudent;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    incident = await seedTuitionIncident(actors);
    tuitionStudent = actors.student;
  });

  afterAll(disconnectDB);

  test("1. Legitimate recovery invariant: Order 100000009 has Payment COMPLETED & Enrollment CONFIRMED", async () => {
    const payment = await Payment.findOne({ orderCode: 100000009 }).lean();
    expect(payment).toBeDefined();
    expect(payment.paymentStatus).toBe("COMPLETED");
    expect(payment.providerStatus).toBe("PAID");

    const enrollment = await Enrollment.findById(payment.enrollmentId).lean();
    expect(enrollment).toBeDefined();
    expect(enrollment.enrollmentStatus).toBe("CONFIRMED");
    expect(enrollment.paymentSource).toBe("DIRECT_PAYMENT");
    expect(enrollment.holdExpiresAt).toBeNull();
  });

  test("2. Capacity invariant: Class enrolledCount is exactly 1", async () => {
    const targetClass = await Class.findById(incident.cls._id).lean();
    expect(targetClass).toBeDefined();
    expect(targetClass.enrolledCount).toBe(1);
    expect(targetClass.status).toBe("OPEN");
  });

  test("3. Revenue invariant: Exactly ONE ENROLLMENT_PAYMENT Transaction and ONE TeacherEarning exist", async () => {
    const p9 = await Payment.findOne({ orderCode: 100000009 }).lean();
    const enrollmentTx = await Transaction.findOne({
      relatedPaymentId: p9._id,
      transactionType: "ENROLLMENT_PAYMENT",
    }).lean();
    expect(enrollmentTx).toBeDefined();
    expect(enrollmentTx.status).toBe("COMPLETED");
    expect(String(enrollmentTx.amount)).toBe("3000");

    const earnings = await TeacherEarning.find({ enrollmentId: p9.enrollmentId }).lean();
    expect(earnings).toHaveLength(1);
    expect(earnings[0].status).toBe("PENDING");
    expect(earnings[0].settlementHoldRequired).toBe(true);
    expect(earnings[0].settlementBlockers).toContain("POLICY_BLOCKED");
  });

  test("4. Duplicate classification invariant: Order 100000008 has Enrollment EXPIRED & RefundCase in NEEDS_REVIEW", async () => {
    const p8 = await Payment.findOne({ orderCode: 100000008 }).lean();
    expect(p8).toBeDefined();
    expect(p8.paymentStatus).toBe("COMPLETED");

    const e8 = await Enrollment.findById(p8.enrollmentId).lean();
    expect(e8).toBeDefined();
    expect(e8.enrollmentStatus).toBe("EXPIRED"); // Never confirmed!

    const unappliedTx = await Transaction.findOne({
      relatedPaymentId: p8._id,
      transactionType: "UNAPPLIED_TUITION_RECEIPT",
    }).lean();
    expect(unappliedTx).toBeDefined();
    expect(unappliedTx.status).toBe("COMPLETED");

    const refundTx = await Transaction.findOne({
      relatedPaymentId: p8._id,
      transactionType: "REFUND",
    }).lean();
    expect(refundTx).toBeDefined();
    expect(refundTx.status).toBe("PENDING");

    const refundCase = await RefundCase.findOne({ sourcePaymentId: p8._id }).lean();
    expect(refundCase).toBeDefined();
    expect(refundCase.status).toBe("NEEDS_REVIEW");
    expect(refundCase.reason).toBe("OVERPAYMENT");
    expect(String(refundCase.eligibleAmount)).toBe("3000");
    expect(refundCase.beneficiaryBankAccount.bankName).toBe(bankSnapshot.bankName);
    expect(refundCase.beneficiaryBankAccount.accountNumber).toBe(bankSnapshot.accountNumber);
    expect(refundCase.beneficiaryBankAccount.accountHolderName).toBe(bankSnapshot.accountHolderName);
  });

  test("5. Service API check: listRefundCases returns the created refund case", async () => {
    const listResult = await refundService.listRefundCases({ page: 1, limit: 10 });
    expect(listResult).toBeDefined();
    expect(listResult.items.length).toBeGreaterThanOrEqual(1);

    const targetCase = listResult.items.find(
      (c) => c.beneficiaryBankAccount?.accountNumber === bankSnapshot.accountNumber
    );
    expect(targetCase).toBeDefined();
    expect(targetCase.status).toBe("NEEDS_REVIEW");
  });

  test("6. Student access check: getMyEnrollments returns confirmed class for student", async () => {
    const studentId = String(tuitionStudent._id);
    const myEnrollments = await enrollmentService.getMyEnrollments(studentId, 1, 10, true);
    expect(myEnrollments).toBeDefined();

    const confirmedItem = myEnrollments.items.find(
      (e) => String(e._id) === String(incident.confirmed._id)
    );
    expect(confirmedItem).toBeDefined();
    expect(confirmedItem.enrollmentStatus).toBe("CONFIRMED");
    expect(confirmedItem.classId).toBeDefined();
    expect(confirmedItem.classId.enrolledCount).toBe(1);
  });
});
