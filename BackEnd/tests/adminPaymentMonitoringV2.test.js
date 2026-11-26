const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog } = require("./helpers/financialFixtures");
const financeService = require("../src/services/financeService");
const BankTransferEvent = require("../src/models/BankTransferEvent");
const PaymentReconciliation = require("../src/models/PaymentReconciliation");
const Payment = require("../src/models/Payment");
const Class = require("../src/models/Class");

describe("Admin Payment Monitoring V2 (Theo dõi xử lý thanh toán) Test Suite", () => {
  let studentUser;
  let teacherUser;
  let testClass;
  let testCourse;
  let testCategory;
  let testSubject;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();

    ({ student: studentUser, teacher: teacherUser, category: testCategory, subject: testSubject, course: testCourse } = actors);

    testClass = await Class.create({
      courseId: testCourse._id,
      courseTitle: testCourse.title,
      teacherId: teacherUser._id,
      teacherName: "Thầy Test PM",
      categoryId: testCategory._id,
      subjectId: testSubject._id,
      className: `Lớp Giám Sát PM ${Date.now()}`,
      classType: "PAID",
      price: "5000",
      capacity: 30,
      enrolledCount: 0,
      status: "OPEN",
    });
  });

  afterAll(disconnectDB);

  test("1. getAdminBankEvents returns correct pagination and attaches reconciliation linkage", async () => {
    const orderCode = Math.floor(100000000 + Math.random() * 800000000);

    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode,
      providerReference: `FT_PM_${Date.now()}_01`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_pm_test_${Date.now()}_01`,
    });

    const fakeRecon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "NEEDS_REVIEW",
    });

    try {
      const result = await financeService.getAdminBankEvents({ orderCode: String(orderCode) });
      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.orderCode).toBe(orderCode);
      expect(item.reconciliation).toBeDefined();
      expect(item.reconciliation._id.toString()).toBe(fakeRecon._id.toString());
      expect(item.reconciliation.status).toBe("NEEDS_REVIEW");
    } finally {
      await PaymentReconciliation.deleteOne({ _id: fakeRecon._id });
      await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
    }
  });

  test("2. getAdminBankEvents filters by businessStatus: DISPATCHED, RECONCILIATION_REQUIRED", async () => {
    const orderCodeA = Math.floor(100000000 + Math.random() * 800000000);
    const orderCodeB = Math.floor(100000000 + Math.random() * 800000000);

    const eventDispatched = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: orderCodeA,
      providerReference: `FT_PM_${Date.now()}_A`,
      amount: "5000",
      currency: "VND",
      eventStatus: "DISPATCHED",
      dispatchStatus: "DISPATCHED",
      fingerprint: `fp_pm_test_${Date.now()}_A`,
    });

    const eventRecon = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: orderCodeB,
      providerReference: `FT_PM_${Date.now()}_B`,
      amount: "5000",
      currency: "VND",
      eventStatus: "ACCOUNT_MISMATCH",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_pm_test_${Date.now()}_B`,
    });

    try {
      // Filter DISPATCHED
      const resDispatched = await financeService.getAdminBankEvents({
        orderCode: String(orderCodeA),
        status: "DISPATCHED",
      });
      expect(resDispatched.items).toHaveLength(1);
      expect(resDispatched.items[0].dispatchStatus).toBe("DISPATCHED");

      // Filter RECONCILIATION_REQUIRED
      const resRecon = await financeService.getAdminBankEvents({
        orderCode: String(orderCodeB),
        status: "RECONCILIATION_REQUIRED",
      });
      expect(resRecon.items).toHaveLength(1);
      expect(resRecon.items[0].eventStatus).toBe("ACCOUNT_MISMATCH");
    } finally {
      await BankTransferEvent.deleteOne({ _id: eventDispatched._id });
      await BankTransferEvent.deleteOne({ _id: eventRecon._id });
    }
  });

  test("3. getAdminBankEventById sanitizes secrets and attaches reconciliation details", async () => {
    const orderCode = Math.floor(100000000 + Math.random() * 800000000);

    const fakeEvent = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode,
      providerReference: `FT_PM_${Date.now()}_03`,
      amount: "5000",
      currency: "VND",
      eventStatus: "ACCOUNT_MISMATCH",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_pm_test_${Date.now()}_03`,
      metadata: {
        checksum: "secret_checksum_123",
        signature: "secret_signature_456",
        apiKey: "secret_key_789",
        secret: "super_secret_value",
        counterAccountName: "NGUYEN VAN TEST",
        counterAccountNumber: "123456789",
        counterAccountBankId: "MBBank",
      },
    });

    const fakeRecon = await PaymentReconciliation.create({
      eventId: fakeEvent._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode,
      reason: "ACCOUNT_MISMATCH",
      receivedAmount: "5000",
      status: "IN_REVIEW",
      resolutionNote: "Đang kiểm tra tài khoản",
    });

    try {
      const detailed = await financeService.getAdminBankEventById(fakeEvent._id);
      expect(detailed).toBeDefined();
      expect(detailed.reconciliation).toBeDefined();
      expect(detailed.reconciliation.status).toBe("IN_REVIEW");

      // Sensitive fields must be stripped by sanitizeBankEvent
      expect(detailed.metadata.checksum).toBeUndefined();
      expect(detailed.metadata.signature).toBeUndefined();
      expect(detailed.metadata.apiKey).toBeUndefined();
      expect(detailed.metadata.secret).toBeUndefined();

      // Useful banking info must be preserved
      expect(detailed.metadata.counterAccountName).toBe("NGUYEN VAN TEST");
      expect(detailed.metadata.counterAccountNumber).toBe("123456789");
    } finally {
      await PaymentReconciliation.deleteOne({ _id: fakeRecon._id });
      await BankTransferEvent.deleteOne({ _id: fakeEvent._id });
    }
  });
});
