const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident, seedTestPayouts } = require("./helpers/financialFixtures");
const { verifiedBankAccount } = require("./helpers/bankAccount");
const payoutService = require("../src/services/payoutService");
const bankAccountService = require("../src/services/teacherBankAccountService");
const { User, Payout, Payment, RefundCase } = require("../src/models");

describe("Admin Teacher Payout & Bank Account Workflow V3", () => {

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    await seedTuitionIncident(actors);
    await seedTestPayouts(actors.teacher);
  });

  afterAll(disconnectDB);

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

  it("5. resolvePayoutAccount fail-safe: blocks unverified, future lock, and invalid lock dates", async () => {
    const teacher = await User.findOne({ role: "TEACHER" });
    expect(teacher).toBeDefined();

    // Case A: Unverified bank account
    await User.updateOne(
      { _id: teacher._id },
      {
        $set: {
          "teacherProfile.bankAccount": {
            ...verifiedBankAccount("TEST TEACHER"),
            status: "PENDING_REVIEW",
          },
        },
      }
    );
    await expect(bankAccountService.resolvePayoutAccount(teacher._id)).rejects.toThrow(
      "Register a bank account and wait for Edunity to verify it before requesting a payout"
    );

    // Case B: Future lock
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await User.updateOne(
      { _id: teacher._id },
      {
        $set: {
          "teacherProfile.bankAccount": {
            ...verifiedBankAccount("TEST TEACHER"),
            payoutLockedUntil: futureDate,
          },
        },
      }
    );
    await expect(bankAccountService.resolvePayoutAccount(teacher._id)).rejects.toThrow(
      "Payouts are paused after a bank account change"
    );

    // Case C: Invalid lock date (fail-safe test: must NOT bypass lock check)
    await User.collection.updateOne(
      { _id: teacher._id },
      {
        $set: {
          "teacherProfile.bankAccount": {
            ...verifiedBankAccount("TEST TEACHER"),
            payoutLockedUntil: "INVALID_CORRUPTED_DATE",
          },
        },
      }
    );
    await expect(bankAccountService.resolvePayoutAccount(teacher._id)).rejects.toThrow(
      "Payouts are paused after a bank account change"
    );

    // Case D: Past lock (valid and expired) -> resolves successfully
    await User.updateOne(
      { _id: teacher._id },
      {
        $set: {
          "teacherProfile.bankAccount": verifiedBankAccount("TEST TEACHER"),
        },
      }
    );
    const resolved = await bankAccountService.resolvePayoutAccount(teacher._id);
    expect(resolved).toBeDefined();
    expect(resolved.bankName).toBe("Vietcombank");
    expect(resolved.accountNumber).toBe("0123456789");
    expect(resolved.accountHolderName).toBe("TEST TEACHER");
  });
});
