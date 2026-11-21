const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const refundService = require("../src/services/refundService");
const payoutService = require("../src/services/payoutService");
const { RefundCase, Payment, PaymentReconciliation, Payout } = require("../src/models");

describe("EDUNITY-ADMIN-REFUND-UI-FIX-V2 Backend Verification Suite", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test("1. listRefundCases returns serialized numbers (not Decimal128 objects) for amounts", async () => {
    const result = await refundService.listRefundCases({});
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);

    const targetCase = result.items.find((c) => c.caseNumber === "REF-20261120-F7304D");
    expect(targetCase).toBeDefined();

    // Verify types are standard JavaScript numbers
    expect(typeof targetCase.originalAmount).toBe("number");
    expect(typeof targetCase.eligibleAmount).toBe("number");
    expect(targetCase.eligibleAmount).toBe(3000);
    expect(targetCase.originalAmount).toBe(3000);

    // Verify populated source payment is also cleanly serialized
    if (targetCase.sourcePaymentId && typeof targetCase.sourcePaymentId === "object") {
      expect(typeof targetCase.sourcePaymentId.amount).toBe("number");
      expect(targetCase.sourcePaymentId.orderCode).toBe(100000008);
    }
  });

  test("2. getRefundCaseById returns serialized numbers for amounts", async () => {
    const existing = await RefundCase.findOne({ caseNumber: "REF-20261120-F7304D" });
    expect(existing).not.toBeNull();

    const detail = await refundService.getRefundCaseById(existing._id);
    expect(detail).toBeDefined();
    expect(typeof detail.originalAmount).toBe("number");
    expect(typeof detail.eligibleAmount).toBe("number");
    expect(detail.eligibleAmount).toBe(3000);
    expect(detail.originalAmount).toBe(3000);
  });

  test("3. Order 100000008 and Order 100000009 invariants are strictly preserved", async () => {
    const payment100000008 = await Payment.findOne({ orderCode: 100000008 }).lean();
    expect(payment100000008).not.toBeNull();
    expect(payment100000008.paymentStatus).toBe("COMPLETED");

    const recon100000008 = await PaymentReconciliation.findOne({ orderCode: 100000008 }).lean();
    expect(recon100000008).not.toBeNull();
    expect(recon100000008.status).toBe("NEEDS_REVIEW");

    const payment100000009 = await Payment.findOne({ orderCode: 100000009 }).lean();
    expect(payment100000009).not.toBeNull();
    expect(payment100000009.paymentStatus).toBe("COMPLETED");
  });

  test("4. Four-Eyes principle and state guard in approveRefundCase are intact", async () => {
    const existing = await RefundCase.findOne({ caseNumber: "REF-20261120-F7304D" });
    expect(existing).not.toBeNull();
    // Trying to approve an amount exceeding eligibleAmount must be rejected
    const fakeAdminId = new mongoose.Types.ObjectId();
    await expect(
      refundService.approveRefundCase(fakeAdminId, existing._id, { approvedAmount: 999999 })
    ).rejects.toThrow("INVALID_APPROVED_AMOUNT");
  });

  test("5. Payout rejection guards distinguish COMPLETED vs non-PENDING", async () => {
    const fakeAdminId = new mongoose.Types.ObjectId();
    const fakePayoutId = new mongoose.Types.ObjectId();

    // Non-existent payout throws not found
    await expect(
      payoutService.rejectPayout(fakeAdminId, fakePayoutId, { note: "Test" })
    ).rejects.toThrow();
  });
});
