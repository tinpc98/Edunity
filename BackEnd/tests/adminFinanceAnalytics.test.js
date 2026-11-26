const { connectDB, disconnectDB } = require("./helpers/db");
const financeService = require("../src/services/financeService");
const Transaction = require("../src/models/Transaction");
const PaymentReconciliation = require("../src/models/PaymentReconciliation");
const RefundCase = require("../src/models/RefundCase");
const TeacherEarning = require("../src/models/TeacherEarning");
const { Types } = require("mongoose");
const { getDashboard } = require("../src/services/adminService");

describe("Admin Finance Analytics API & Overview V2 Test Suite", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(disconnectDB);

  test("platform fees use recorded commission and the reporting dates in Vietnam", async () => {
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), 1, -7));
    const previousMonth = new Date(monthStart.getTime() - 1);
    const base = { teacherId: new Types.ObjectId(), classId: new Types.ObjectId(), grossAmount: 100000, netAmount: 80000 };
    const earnings = await TeacherEarning.create([
      { ...base, enrollmentId: new Types.ObjectId(), createdAt: monthStart, commissionAmount: 20000, status: "AVAILABLE" },
      { ...base, enrollmentId: new Types.ObjectId(), createdAt: monthStart, commissionAmount: 7000, status: "CANCELLED" },
      { ...base, enrollmentId: new Types.ObjectId(), createdAt: previousMonth, commissionAmount: 3000, status: "PAID_OUT" },
    ]);
    try {
      const report = await financeService.getFinanceOverview({ period: "custom", from: ict.toISOString().slice(0, 7) + "-01", to: ict.toISOString().slice(0, 10) });
      expect(report.kpis.platformFee.value).toBe("20000");
      expect(report.kpis.teacherPaidOut.value).toBe("0");
      const dashboard = await getDashboard();
      expect(dashboard.finance.commissionThisMonth.toString()).toBe("20000");
      expect(dashboard.finance.commission.toString()).toBe("23000");
    } finally {
      await TeacherEarning.deleteMany({ _id: { $in: earnings.map((earning) => earning._id) } });
    }
  });

  test("1. Returns structured analytics response with 6 KPI cards and metadata", async () => {
    const result = await financeService.getFinanceOverview({ period: "7d" });

    expect(result).toHaveProperty("period");
    expect(result.period.key).toBe("7d");
    expect(result.period).toHaveProperty("from");
    expect(result.period).toHaveProperty("to");
    expect(result.period).toHaveProperty("label");
    expect(result.period).toHaveProperty("granularity");

    expect(result).toHaveProperty("kpis");
    const { kpis } = result;
    expect(kpis).toHaveProperty("tuitionRevenue");
    expect(kpis).toHaveProperty("donationRevenue");
    expect(kpis).toHaveProperty("reconciliationPending");
    expect(kpis).toHaveProperty("refundLiability");
    expect(kpis).toHaveProperty("teacherPendingPayout");
    expect(kpis).toHaveProperty("teacherPaidOut");

    // Check KPI structure
    expect(typeof kpis.tuitionRevenue.value).toBe("string");
    expect(typeof kpis.donationRevenue.value).toBe("string");
    expect(typeof kpis.reconciliationPending.value).toBe("string");
    expect(typeof kpis.refundLiability.value).toBe("string");
    expect(typeof kpis.teacherPendingPayout.value).toBe("string");
    expect(typeof kpis.teacherPaidOut.value).toBe("string");
  });

  test("2. Correct ICT (UTC+7) period boundaries for today, yesterday, 3d, 7d, 30d", async () => {
    const todayRes = await financeService.getFinanceOverview({ period: "today" });
    expect(todayRes.period.granularity).toBe("hour");
    expect(todayRes.charts.revenueTimeSeries.length).toBe(24);

    const yesterdayRes = await financeService.getFinanceOverview({ period: "yesterday" });
    expect(yesterdayRes.period.granularity).toBe("hour");
    expect(yesterdayRes.charts.revenueTimeSeries.length).toBe(24);

    const res3d = await financeService.getFinanceOverview({ period: "3d" });
    expect(res3d.period.granularity).toBe("day");
    expect(res3d.charts.revenueTimeSeries.length).toBe(3);

    const res7d = await financeService.getFinanceOverview({ period: "7d" });
    expect(res7d.period.granularity).toBe("day");
    expect(res7d.charts.revenueTimeSeries.length).toBe(7);

    const res30d = await financeService.getFinanceOverview({ period: "30d" });
    expect(res30d.period.granularity).toBe("day");
    expect(res30d.charts.revenueTimeSeries.length).toBe(30);
  });

  test("3. Custom date range filter parses boundaries properly", async () => {
    const customRes = await financeService.getFinanceOverview({
      period: "custom",
      from: "2026-11-01",
      to: "2026-11-05",
    });

    expect(customRes.period.key).toBe("custom");
    expect(customRes.period.from).toBe("2026-10-31T17:00:00.000Z"); // 00:00:00 ICT Nov 1
    expect(customRes.period.to).toBe("2026-11-05T17:00:00.000Z"); // 24:00:00 ICT Nov 5
    expect(customRes.charts.revenueTimeSeries.length).toBe(5);
  });

  test("4. Fund structure donut separates tuition and donation without double counting", async () => {
    const res = await financeService.getFinanceOverview({ period: "30d" });
    const { fundStructure } = res.charts;

    expect(fundStructure).toHaveProperty("tuition");
    expect(fundStructure).toHaveProperty("donation");
    expect(fundStructure).toHaveProperty("other");
    expect(fundStructure).toHaveProperty("total");

    // Total must equal the sum of constituent streams
    expect(fundStructure.total).toBe(
      fundStructure.tuition + fundStructure.donation + fundStructure.other
    );

    if (fundStructure.total > 0) {
      expect(
        fundStructure.tuitionPercent +
          fundStructure.donationPercent +
          fundStructure.otherPercent
      ).toBeCloseTo(100, 0);
    }
  });

  test("5. Reconciliation distribution reflects real PaymentReconciliation counts", async () => {
    const res = await financeService.getFinanceOverview({ period: "7d" });
    const { reconciliationDistribution } = res.charts;

    expect(Array.isArray(reconciliationDistribution)).toBe(true);
    expect(reconciliationDistribution.length).toBe(5);

    const keys = reconciliationDistribution.map((r) => r.key);
    expect(keys).toEqual([
      "needsReview",
      "inReview",
      "resolvedApproved",
      "resolvedRefunded",
      "resolvedIgnored",
    ]);

    const actualTotal = await PaymentReconciliation.countDocuments();
    const sumCount = reconciliationDistribution.reduce((acc, r) => acc + r.count, 0);
    expect(sumCount).toBe(actualTotal);
  });

  test("6. Operations summary provides clean Vietnamese status without raw worker jargon", async () => {
    const res = await financeService.getFinanceOverview({ period: "7d" });
    const { operationsSummary } = res;

    expect(operationsSummary).toHaveProperty("syncStatus");
    expect(operationsSummary).toHaveProperty("syncStatusType");
    expect(operationsSummary).toHaveProperty("isRunning");
    expect(operationsSummary).toHaveProperty("processedCount");
    expect(operationsSummary).toHaveProperty("pendingCount");
    expect(operationsSummary).toHaveProperty("attentionCount");
    expect(operationsSummary).toHaveProperty("refundCasesOpen");

    expect(["Đang hoạt động", "Đang chờ tác vụ", "Cần kiểm tra"]).toContain(
      operationsSummary.syncStatus
    );
  });

  test("7. Read-only safety: Calling getFinanceOverview does NOT mutate database", async () => {
    const txCountBefore = await Transaction.countDocuments();
    const reconCountBefore = await PaymentReconciliation.countDocuments();
    const refundCountBefore = await RefundCase.countDocuments();
    const earningCountBefore = await TeacherEarning.countDocuments();

    await financeService.getFinanceOverview({ period: "30d" });
    await financeService.getFinanceOverview({ period: "today" });
    await financeService.getFinanceOverview({ period: "custom", from: "2026-10-01", to: "2026-11-20" });

    const txCountAfter = await Transaction.countDocuments();
    const reconCountAfter = await PaymentReconciliation.countDocuments();
    const refundCountAfter = await RefundCase.countDocuments();
    const earningCountAfter = await TeacherEarning.countDocuments();

    expect(txCountAfter).toBe(txCountBefore);
    expect(reconCountAfter).toBe(reconCountBefore);
    expect(refundCountAfter).toBe(refundCountBefore);
    expect(earningCountAfter).toBe(earningCountBefore);
  });

  test("8. Transaction status distribution provides 4 clean operational categories", async () => {
    const res = await financeService.getFinanceOverview({ period: "30d" });
    expect(res.charts).toHaveProperty("transactionStatusDistribution");
    const { transactionStatusDistribution } = res.charts;

    expect(Array.isArray(transactionStatusDistribution)).toBe(true);
    expect(transactionStatusDistribution.length).toBe(4);

    const keys = transactionStatusDistribution.map((item) => item.key);
    expect(keys).toEqual(["completed", "pending", "reconciliation", "refund"]);

    transactionStatusDistribution.forEach((item) => {
      expect(typeof item.label).toBe("string");
      expect(typeof item.count).toBe("number");
      expect(typeof item.amount).toBe("number");
      expect(typeof item.percent).toBe("number");
      expect(typeof item.color).toBe("string");
      expect(typeof item.subtext).toBe("string");
    });
  });
});
