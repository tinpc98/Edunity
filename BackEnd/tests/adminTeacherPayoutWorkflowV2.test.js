const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const payoutService = require("../src/services/payoutService");
const settlementService = require("../src/services/settlementService");
const Payout = require("../src/models/Payout");
const User = require("../src/models/User");

describe("Admin Teacher Payout Workflow V2 Test Suite", () => {
  let teacherDuc;
  let adminUser;

  beforeAll(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    teacherDuc = await User.findOne({
      $or: [
        { "teacherProfile.fullName": "Nguyễn Văn Đức" },
        { email: "duc.nguyen@example.com" },
      ],
    });

    adminUser = await User.findOne({ role: "ADMIN" });
  });

  afterAll(async () => {
    // Keep connection intact for Jest runner
  });

  test("1. Tab AWAITING_TRANSFER retrieves approved payout 250k of teacher Duc", async () => {
    const result = await payoutService.adminListPayouts(
      { status: "AWAITING_TRANSFER" },
      { page: 1, pageSize: 20, skip: 0 }
    );

    expect(result).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);

    const payout250k = result.items.find((p) => String(p.id || p._id) === "6b007b2ed7739dadbda3cf5b");
    expect(payout250k).toBeDefined();
    expect(payout250k.status).toBe("APPROVED");
    expect(Number(payout250k.amount)).toBe(250000);
    expect(payout250k.isTestData).toBe(true);
    expect(payout250k.teacherName).toBe("Nguyễn Văn Đức");
  });

  test("2. Tab PENDING does NOT contain approved payout 250k", async () => {
    const result = await payoutService.adminListPayouts(
      { status: "PENDING" },
      { page: 1, pageSize: 20, skip: 0 }
    );

    const payout250k = result.items.find((p) => String(p.id || p._id) === "6b007b2ed7739dadbda3cf5b");
    expect(payout250k).toBeUndefined();
  });

  test("3. State machine guard: Cannot reject an already APPROVED payout", async () => {
    await expect(
      payoutService.rejectPayout(
        adminUser._id,
        "6b007b2ed7739dadbda3cf5b",
        { note: "Thử từ chối đơn đã duyệt" }
      )
    ).rejects.toThrow("Chỉ có thể từ chối yêu cầu rút tiền đang ở trạng thái Chờ phê duyệt (PENDING)");
  });

  test("4. Financial safety guard: Cannot complete payout for test data records", async () => {
    await expect(
      payoutService.completePayout(
        adminUser._id,
        "6b007b2ed7739dadbda3cf5b",
        { bankReference: "FT_TEST_12345678" },
        { skipWindowCheck: true }
      )
    ).rejects.toThrow("Bản ghi thử nghiệm (TEST) không thể thực hiện xác nhận chi trả thật.");
  });

  test("5. Teacher Settlement Summary reflects active in-flight payouts in inWithdrawalRequest", async () => {
    const summary = await settlementService.getTeacherSettlementSummary(teacherDuc._id);
    expect(summary).toBeDefined();
    expect(summary.summary).toBeDefined();
    // inWithdrawalRequest should reflect at least the 250k + 500k in-flight payouts
    expect(summary.summary.inWithdrawalRequest).toBeGreaterThanOrEqual(250000);
    expect(summary.summary.inPayout).toBeGreaterThanOrEqual(250000);
  });

  test("6. Search filter finds payout by teacher name or email", async () => {
    const resultByName = await payoutService.adminListPayouts(
      { search: "Đức" },
      { page: 1, pageSize: 20, skip: 0 }
    );
    expect(resultByName.items.length).toBeGreaterThan(0);
    const hasDuc = resultByName.items.some((p) => p.teacherName?.includes("Đức"));
    expect(hasDuc).toBe(true);
  });
});
