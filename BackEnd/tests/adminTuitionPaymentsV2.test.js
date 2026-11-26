const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident, studentName, studentEmail, teacherName, className, caseNumber, bankSnapshot } = require("./helpers/financialFixtures");
const financeService = require("../src/services/financeService");
const Payment = require("../src/models/Payment");
const Class = require("../src/models/Class");

describe("Admin Tuition Payments V2 (Thanh toán học phí) Test Suite", () => {
  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    await seedTuitionIncident(actors);
  });

  afterAll(disconnectDB);

  test("1. PENDING elimination invariant: Default getAdminPayments filters out PENDING payments", async () => {
    const result = await financeService.getAdminPayments(1, 50);

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);

    // Assert that NO item in the default list is PENDING
    const pendingItems = result.items.filter((item) => item.paymentStatus === "PENDING");
    expect(pendingItems).toHaveLength(0);

    // Verify all items are either COMPLETED, FAILED, or REFUNDED
    for (const item of result.items) {
      expect(["COMPLETED", "FAILED", "REFUNDED"]).toContain(item.paymentStatus);
    }

    // Verify total count matches count of non-pending payments
    const nonPendingCount = await Payment.countDocuments({
      paymentStatus: { $in: ["COMPLETED", "FAILED"] },
    });
    expect(result.total).toBe(nonPendingCount);
  });

  test("2. Tab filtering invariant: COMPLETED and FAILED tabs filter precisely", async () => {
    // Completed Tab
    const completedResult = await financeService.getAdminPayments(1, 20, "COMPLETED");
    expect(completedResult.items.length).toBeGreaterThan(0);
    for (const item of completedResult.items) {
      expect(item.paymentStatus).toBe("COMPLETED");
    }

    // Failed Tab
    const failedResult = await financeService.getAdminPayments(1, 20, "FAILED");
    expect(failedResult.items.length).toBeGreaterThan(0);
    for (const item of failedResult.items) {
      expect(item.paymentStatus).toBe("FAILED");
    }
  });

  test("3. Student and Class Information Resolution: Never display raw ObjectId", async () => {
    const result = await financeService.getAdminPayments(1, 10);
    for (const item of result.items) {
      // studentName should be human readable string
      expect(typeof item.studentName).toBe("string");
      expect(item.studentName.length).toBeGreaterThan(0);
      expect(item.studentName).not.toMatch(/^[a-f\d]{24}$/i); // Not raw ObjectId

      // className should not be hardcoded placeholder when class exists
      expect(typeof item.className).toBe("string");
      expect(item.className).not.toBe("Khóa học trực tuyến");
    }
  });

  test("4. Incident Order 100000009: Legitimate recovery shows COMPLETED & CONFIRMED", async () => {
    const result = await financeService.getAdminPayments({
      search: "100000009",
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const order9 = result.items.find((i) => i.orderCode === 100000009);
    expect(order9).toBeDefined();

    expect(order9.paymentStatus).toBe("COMPLETED");
    expect(Number(order9.amount)).toBe(3000);
    expect(order9.studentName).toBe(studentName);
    expect(order9.studentEmail).toBe(studentEmail);
    expect(order9.className).toBe(className);
    expect(order9.teacherName).toBe(teacherName);
    expect(order9.enrollmentStatus).toBe("CONFIRMED");
    expect(order9.isRefundPending).toBe(false);
    expect(order9.refundCase).toBeNull();
  });

  test("5. Incident Order 100000008: Duplicate payment shows COMPLETED, EXPIRED & isRefundPending", async () => {
    const result = await financeService.getAdminPayments({
      search: "100000008",
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const order8 = result.items.find((i) => i.orderCode === 100000008);
    expect(order8).toBeDefined();

    expect(order8.paymentStatus).toBe("COMPLETED");
    expect(Number(order8.amount)).toBe(3000);
    expect(order8.studentName).toBe(studentName);
    expect(order8.studentEmail).toBe(studentEmail);
    expect(order8.className).toBe(className);
    expect(order8.enrollmentStatus).toBe("EXPIRED");
    expect(order8.isRefundPending).toBe(true);

    expect(order8.refundCase).toBeDefined();
    expect(order8.refundCase.caseNumber).toBe(caseNumber);
    expect(order8.refundCase.status).toBe("NEEDS_REVIEW");
    expect(order8.refundCase.reason).toBe("OVERPAYMENT");
    expect(order8.refundCase.eligibleAmount).toBe("3000");
    expect(order8.refundCase.beneficiaryBankAccount.accountHolderName).toBe(bankSnapshot.accountHolderName);
  });

  test("6. Search by Student Email invariant", async () => {
    const result = await financeService.getAdminPayments({
      search: studentEmail,
    });

    expect(result.items.length).toBeGreaterThanOrEqual(2);
    for (const item of result.items) {
      expect(item.studentEmail).toBe(studentEmail);
    }
  });
});
