const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const payoutService = require("../src/services/payoutService");
const bankAccountService = require("../src/services/teacherBankAccountService");
const { User, Payout, Payment, RefundCase } = require("../src/models");

describe("Admin Teacher Payout & Bank Account Workflow V3", () => {
  let dbConnected = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
      dbConnected = true;
    }
  });

  afterAll(async () => {
    if (dbConnected && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("1. adminListBankAccounts supports PENDING_REVIEW, VERIFIED, REJECTED, and ALL", async () => {
    const paging = { skip: 0, pageSize: 20, page: 1 };

    // Default status
    const pendingResult = await bankAccountService.adminListBankAccounts({}, paging);
    expect(pendingResult).toBeDefined();
    expect(Array.isArray(pendingResult.items)).toBe(true);

    // Explicit VERIFIED status
    const verifiedResult = await bankAccountService.adminListBankAccounts({ status: "VERIFIED" }, paging);
    expect(verifiedResult).toBeDefined();
    expect(Array.isArray(verifiedResult.items)).toBe(true);

    // Explicit REJECTED status
    const rejectedResult = await bankAccountService.adminListBankAccounts({ status: "REJECTED" }, paging);
    expect(rejectedResult).toBeDefined();
    expect(Array.isArray(rejectedResult.items)).toBe(true);

    // New ALL status
    const allResult = await bankAccountService.adminListBankAccounts({ status: "ALL" }, paging);
    expect(allResult).toBeDefined();
    expect(Array.isArray(allResult.items)).toBe(true);

    // Invalid status should throw
    await expect(bankAccountService.adminListBankAccounts({ status: "UNKNOWN_STATUS" }, paging)).rejects.toThrow(
      "status is invalid"
    );
  });

  it("2. adminListBankAccounts supports search query", async () => {
    const paging = { skip: 0, pageSize: 20, page: 1 };
    const searchResult = await bankAccountService.adminListBankAccounts(
      { status: "ALL", search: "nonexistent_teacher_search_term_xyz" },
      paging
    );
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(0);
    expect(searchResult.items.length).toBe(0);
  });

  it("3. adminListPayouts handles all 5 filter groups", async () => {
    const paging = { skip: 0, pageSize: 20, page: 1 };

    const statuses = ["PENDING", "AWAITING_TRANSFER", "COMPLETED", "REJECTED_FAILED", "ALL"];
    for (const st of statuses) {
      const res = await payoutService.adminListPayouts({ status: st }, paging);
      expect(res).toBeDefined();
      expect(Array.isArray(res.items)).toBe(true);
      expect(typeof res.total).toBe("number");
    }
  });

  it("4. Financial safety invariants: Order 100000008, Order 100000009 and TEST payouts preserved", async () => {
    const payment8 = await Payment.findOne({ orderCode: 100000008 }).lean();
    if (payment8) {
      expect(payment8.paymentStatus).toBe("COMPLETED");
    }

    const payment9 = await Payment.findOne({ orderCode: 100000009 }).lean();
    if (payment9) {
      expect(payment9.paymentStatus).toBe("COMPLETED");
    }

    // Verify TEST payouts remain flagged as test data
    const testPayouts = await Payout.find({ isTestData: true }).lean();
    expect(testPayouts.length).toBeGreaterThanOrEqual(4);
    testPayouts.forEach((tp) => {
      expect(tp.isTestData).toBe(true);
    });
  });
});
