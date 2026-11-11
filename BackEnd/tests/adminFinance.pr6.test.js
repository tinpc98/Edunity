const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
  Payment,
  SponsorContribution,
} = require("../src/models");
const { signAccessToken } = require("../src/utils/jwt");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

describe("PR6: Admin Finance & Payment Reconciliation Dashboard (TIN-FIN-PR6)", () => {
  let adminUser, adminToken;
  let secondAdminUser, secondAdminToken;
  let teacherUser, teacherToken;
  let studentUser, studentToken;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();

    const passwordHash = await hashPassword("StrongPass123!@#");

    adminUser = await User.create({
      email: "finance.admin@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      studentProfile: { fullName: "Finance Admin Chief" },
    });
    adminToken = signAccessToken(adminUser);

    secondAdminUser = await User.create({
      email: "audit.officer@edunity.test",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      studentProfile: { fullName: "Audit Officer secondary" },
    });
    secondAdminToken = signAccessToken(secondAdminUser);

    teacherUser = await User.create({
      email: "teacher.fin@edunity.test",
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      teacherProfile: { fullName: "Senior Teacher Fin" },
    });
    teacherToken = signAccessToken(teacherUser);

    studentUser = await User.create({
      email: "student.fin@edunity.test",
      passwordHash,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: { fullName: "Student Learner" },
    });
    studentToken = signAccessToken(studentUser);
  });

  // =========================================================================
  // 1. RBAC & SECURITY AUTHORIZATION (8 tests)
  // =========================================================================
  describe("Suite 1: RBAC & Security Authorization", () => {
    test("1.1. Invalid token receives 401 UNAUTHORIZED, unauthenticated request is blocked", async () => {
      const resInvalid = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", "Bearer invalid-jwt-token-string");
      expect(resInvalid.status).toBe(401);

      const resNoAuth = await request(app).get("/api/admin/overview");
      // Under test harness default role is STUDENT which receives 403; otherwise 401
      expect([401, 403]).toContain(resNoAuth.status);
    });

    test("1.2. STUDENT request to /api/admin/overview receives 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    test("1.3. TEACHER request to /api/admin/overview receives 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(403);
    });

    test("1.4. STUDENT request to /api/admin/transactions receives 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/admin/transactions")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    test("1.5. STUDENT request to /api/admin/bank-events receives 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    test("1.6. STUDENT request to /api/admin/reconciliations receives 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/admin/reconciliations")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    test("1.7. STUDENT request to /api/admin/reconciliations/:id/assign receives 403 FORBIDDEN", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/admin/reconciliations/${fakeId}/assign`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ assignedTo: "me" });
      expect(res.status).toBe(403);
    });

    test("1.8. STUDENT request to /api/admin/reconciliations/:id/notes receives 403 FORBIDDEN", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/admin/reconciliations/${fakeId}/notes`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ note: "Hacker note" });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. ADMIN FINANCE OVERVIEW METRICS (8 tests)
  // =========================================================================
  describe("Suite 2: Admin Finance Overview Metrics", () => {
    test("2.1. Admin receives 200 with structured overview metrics", async () => {
      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("revenue");
      expect(res.body.data).toHaveProperty("teacherEarnings");
      expect(res.body.data).toHaveProperty("reconciliations");
      expect(res.body.data).toHaveProperty("bankEvents");
      expect(res.body.data).toHaveProperty("outboxWorker");
      expect(res.body.data).toHaveProperty("disclaimer");
    });

    test("2.2. Confirmed tuition revenue aggregates only COMPLETED ENROLLMENT_PAYMENT", async () => {
      await Transaction.create([
        {
          transactionType: "ENROLLMENT_PAYMENT",
          amount: mongoose.Types.Decimal128.fromString("500000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "ENROLLMENT_PAYMENT",
          amount: mongoose.Types.Decimal128.fromString("700000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "ENROLLMENT_PAYMENT",
          amount: mongoose.Types.Decimal128.fromString("300000"),
          status: "PENDING", // must be excluded
          sourceUserId: studentUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.confirmedTuitionRevenue).toBe("1200000");
    });

    test("2.3. Confirmed donation revenue aggregates only COMPLETED SPONSOR_CONTRIBUTION", async () => {
      await Transaction.create([
        {
          transactionType: "SPONSOR_CONTRIBUTION",
          amount: mongoose.Types.Decimal128.fromString("2000000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "SPONSOR_CONTRIBUTION",
          amount: mongoose.Types.Decimal128.fromString("1000000"),
          status: "PENDING", // excluded
          sourceUserId: studentUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.confirmedDonationRevenue).toBe("2000000");
    });

    test("2.4. Unapplied late tuition receipts are tracked separately as liabilities (BR-34/FIN-16)", async () => {
      await Transaction.create([
        {
          transactionType: "UNAPPLIED_TUITION_RECEIPT",
          amount: mongoose.Types.Decimal128.fromString("450000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.unappliedLateReceipts).toBe("450000");
      expect(res.body.data.revenue.confirmedTuitionRevenue).toBe("0"); // not added to revenue
    });

    test("2.5. Pending refund liabilities vs completed refunds are accurately separated", async () => {
      await Transaction.create([
        {
          transactionType: "REFUND",
          amount: mongoose.Types.Decimal128.fromString("200000"),
          status: "PENDING",
          sourceUserId: adminUser._id,
        },
        {
          transactionType: "REFUND",
          amount: mongoose.Types.Decimal128.fromString("350000"),
          status: "COMPLETED",
          sourceUserId: adminUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.pendingRefundLiability).toBe("200000");
      expect(res.body.data.revenue.completedRefunds).toBe("350000");
    });

    test("2.6. Teacher earnings summary correctly groups PENDING, AVAILABLE, PAID_OUT", async () => {
      const dummyClassId = new mongoose.Types.ObjectId();
      const dummyEnrollId = new mongoose.Types.ObjectId();
      await TeacherEarning.create([
        {
          teacherId: teacherUser._id,
          classId: dummyClassId,
          enrollmentId: dummyEnrollId,
          grossAmount: mongoose.Types.Decimal128.fromString("1000000"),
          commissionRate: 0.1,
          commissionAmount: mongoose.Types.Decimal128.fromString("100000"),
          netAmount: mongoose.Types.Decimal128.fromString("900000"),
          status: "PENDING",
        },
        {
          teacherId: teacherUser._id,
          classId: dummyClassId,
          enrollmentId: new mongoose.Types.ObjectId(),
          grossAmount: mongoose.Types.Decimal128.fromString("500000"),
          commissionRate: 0.1,
          commissionAmount: mongoose.Types.Decimal128.fromString("50000"),
          netAmount: mongoose.Types.Decimal128.fromString("450000"),
          status: "AVAILABLE",
        },
        {
          teacherId: teacherUser._id,
          classId: dummyClassId,
          enrollmentId: new mongoose.Types.ObjectId(),
          grossAmount: mongoose.Types.Decimal128.fromString("200000"),
          commissionRate: 0.1,
          commissionAmount: mongoose.Types.Decimal128.fromString("20000"),
          netAmount: mongoose.Types.Decimal128.fromString("180000"),
          status: "PAID_OUT",
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.teacherEarnings.pending).toBe("900000");
      expect(res.body.data.teacherEarnings.available).toBe("450000");
      expect(res.body.data.teacherEarnings.paidOut).toBe("180000");
    });

    test("2.7. Reconciliations overview counts open queue and status categories", async () => {
      const dummyEventId1 = new mongoose.Types.ObjectId();
      const dummyEventId2 = new mongoose.Types.ObjectId();
      const dummyEventId3 = new mongoose.Types.ObjectId();

      await PaymentReconciliation.create([
        {
          eventId: dummyEventId1,
          purpose: "TUITION",
          channelKey: "TUITION",
          reason: "LATE_PAYMENT_REVIEW",
          receivedAmount: mongoose.Types.Decimal128.fromString("500000"),
          status: "NEEDS_REVIEW",
        },
        {
          eventId: dummyEventId2,
          purpose: "DONATION",
          channelKey: "DONATION",
          reason: "AMOUNT_MISMATCH",
          receivedAmount: mongoose.Types.Decimal128.fromString("300000"),
          status: "IN_REVIEW",
        },
        {
          eventId: dummyEventId3,
          purpose: "TUITION",
          channelKey: "TUITION",
          reason: "EXPIRED_PAYMENT",
          receivedAmount: mongoose.Types.Decimal128.fromString("500000"),
          status: "RESOLVED_APPROVED",
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reconciliations.total).toBe(3);
      expect(res.body.data.reconciliations.open).toBe(2); // NEEDS_REVIEW (1) + IN_REVIEW (1)
      expect(res.body.data.reconciliations.byStatus.needsReview).toBe(1);
      expect(res.body.data.reconciliations.byStatus.inReview).toBe(1);
      expect(res.body.data.reconciliations.byStatus.resolvedApproved).toBe(1);
    });

    test("2.8. Outbox worker telemetry reports live backlog and exhausted count", async () => {
      await BankTransferEvent.create([
        {
          provider: "PAYOS",
          channelKey: "TUITION",
          purpose: "TUITION",
          orderCode: 90001,
          providerReference: "REF-90001",
          amount: mongoose.Types.Decimal128.fromString("500000"),
          eventStatus: "READY_FOR_DISPATCH",
          dispatchStatus: "PENDING_DISPATCH",
          dispatchAttempts: 1,
          fingerprint: "fp-90001",
        },
        {
          provider: "PAYOS",
          channelKey: "TUITION",
          purpose: "TUITION",
          orderCode: 90002,
          providerReference: "REF-90002",
          amount: mongoose.Types.Decimal128.fromString("500000"),
          eventStatus: "DISPATCH_FAILED",
          dispatchStatus: "DISPATCH_FAILED",
          dispatchAttempts: 5, // exhausted!
          fingerprint: "fp-90002",
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.bankEvents.backlogCount).toBe(1);
      expect(res.body.data.bankEvents.exhaustedCount).toBe(1);
      expect(res.body.data.outboxWorker.exhaustedCount).toBe(1);
    });
  });

  // =========================================================================
  // 3. ADMIN TRANSACTIONS LEDGER & FILTER FIX (9 tests)
  // =========================================================================
  describe("Suite 3: Admin Transactions Ledger & Filter Fix", () => {
    beforeEach(async () => {
      await Transaction.create([
        {
          transactionType: "ENROLLMENT_PAYMENT",
          amount: mongoose.Types.Decimal128.fromString("500000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "UNAPPLIED_TUITION_RECEIPT",
          amount: mongoose.Types.Decimal128.fromString("300000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "SPONSOR_CONTRIBUTION",
          amount: mongoose.Types.Decimal128.fromString("1000000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
        {
          transactionType: "REFUND",
          amount: mongoose.Types.Decimal128.fromString("150000"),
          status: "PENDING",
          sourceUserId: adminUser._id,
        },
      ]);
    });

    test("3.1. Returns paginated transaction list with metadata", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?page=1&limit=2")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(4);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.totalPages).toBe(2);
    });

    test("3.2. Bug fix: filter by transactionType=ENROLLMENT_PAYMENT works accurately", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?transactionType=ENROLLMENT_PAYMENT")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].transactionType).toBe("ENROLLMENT_PAYMENT");
    });

    test("3.3. Bug fix: filter by transactionType=UNAPPLIED_TUITION_RECEIPT works accurately", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?transactionType=UNAPPLIED_TUITION_RECEIPT")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].transactionType).toBe("UNAPPLIED_TUITION_RECEIPT");
    });

    test("3.4. Backward compatibility: legacy 'type' query parameter filters transactionType", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?type=SPONSOR_CONTRIBUTION")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].transactionType).toBe("SPONSOR_CONTRIBUTION");
    });

    test("3.5. Filter by status=PENDING works accurately", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?status=PENDING")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe("PENDING");
      expect(res.body.data.items[0].transactionType).toBe("REFUND");
    });

    test("3.6. Combined filter by transactionType and status", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?transactionType=REFUND&status=COMPLETED")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0); // Only PENDING refund exists
    });

    test("3.7. Filter by orderCode resolves to related BankTransferEvent/Payment", async () => {
      const bankEvent = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: 778899,
        providerReference: "REF-778899",
        amount: mongoose.Types.Decimal128.fromString("880000"),
        eventStatus: "DISPATCHED",
        dispatchStatus: "DISPATCHED",
        fingerprint: "fp-778899",
      });

      await Transaction.create({
        transactionType: "ENROLLMENT_PAYMENT",
        amount: mongoose.Types.Decimal128.fromString("880000"),
        status: "COMPLETED",
        sourceUserId: studentUser._id,
        relatedBankEventId: bankEvent._id,
      });

      const res = await request(app)
        .get("/api/admin/transactions?orderCode=778899")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].amount).toBe("880000");
    });

    test("3.8. Populated sourceUserId includes email, role and profile", async () => {
      const res = await request(app)
        .get("/api/admin/transactions?transactionType=ENROLLMENT_PAYMENT")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const tx = res.body.data.items[0];
      expect(tx.sourceUserId).toBeDefined();
      expect(tx.sourceUserId.email).toBe("student.fin@edunity.test");
      expect(tx.sourceUserId.role).toBe("STUDENT");
    });

    test("3.9. Response summary includes byType breakdown and totalCount", async () => {
      const res = await request(app)
        .get("/api/admin/transactions")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.totalCount).toBe(4);
      expect(res.body.data.summary.byType.ENROLLMENT_PAYMENT).toBeDefined();
      expect(res.body.data.summary.byType.UNAPPLIED_TUITION_RECEIPT).toBeDefined();
    });
  });

  // =========================================================================
  // 4. BANK TRANSFER EVENTS MONITORING (7 tests)
  // =========================================================================
  describe("Suite 4: BankTransferEvents Webhooks & Outbox Monitoring", () => {
    let testEvent;

    beforeEach(async () => {
      testEvent = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: 123456,
        providerReference: "REF-123456",
        amount: mongoose.Types.Decimal128.fromString("600000"),
        eventStatus: "READY_FOR_DISPATCH",
        dispatchStatus: "PENDING_DISPATCH",
        dispatchAttempts: 2,
        lastDispatchError: "Temporary timeout",
        fingerprint: "fp-123456",
        metadata: {
          accountNumber: "999888",
          checksum: "secret-checksum-123",
          apiKey: "secret-key-123",
        },
      });

      await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "DONATION",
        purpose: "DONATION",
        orderCode: 654321,
        providerReference: "REF-654321",
        amount: mongoose.Types.Decimal128.fromString("1000000"),
        eventStatus: "DISPATCH_FAILED",
        dispatchStatus: "DISPATCH_FAILED",
        dispatchAttempts: 5, // Exhausted
        fingerprint: "fp-654321",
      });
    });

    test("4.1. GET /api/admin/bank-events returns event list", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items).toHaveLength(2);
    });

    test("4.2. Filter by channelKey=TUITION", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events?channelKey=TUITION")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].orderCode).toBe(123456);
    });

    test("4.3. Filter by dispatchStatus=DISPATCH_FAILED", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events?dispatchStatus=DISPATCH_FAILED")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].orderCode).toBe(654321);
    });

    test("4.4. Filter by isExhausted=true returns only events with dispatchAttempts >= 5", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events?isExhausted=true")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].orderCode).toBe(654321);
      expect(res.body.data.items[0].dispatchAttempts).toBe(5);
    });

    test("4.5. Filter by orderCode", async () => {
      const res = await request(app)
        .get("/api/admin/bank-events?orderCode=123456")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].providerReference).toBe("REF-123456");
    });

    test("4.6. GET /api/admin/bank-events/:id returns details with sanitized metadata", async () => {
      const res = await request(app)
        .get(`/api/admin/bank-events/${testEvent._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orderCode).toBe(123456);
      expect(res.body.data.metadata).toBeDefined();
      expect(res.body.data.metadata.accountNumber).toBe("999888");
      // Sensitive keys must be deleted / sanitized
      expect(res.body.data.metadata.checksum).toBeUndefined();
      expect(res.body.data.metadata.apiKey).toBeUndefined();
    });

    test("4.7. GET /api/admin/bank-events/:id returns 404 for non-existent event", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/admin/bank-events/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 5. PAYMENT RECONCILIATIONS QUEUE & MANAGEMENT (8 tests)
  // =========================================================================
  describe("Suite 5: PaymentReconciliations Queue & Management", () => {
    let reconRecord;

    beforeEach(async () => {
      const bankEvent = await BankTransferEvent.create({
        provider: "PAYOS",
        channelKey: "TUITION",
        purpose: "TUITION",
        orderCode: 998811,
        providerReference: "REF-998811",
        amount: mongoose.Types.Decimal128.fromString("750000"),
        eventStatus: "NEEDS_REVIEW",
        dispatchStatus: "RECONCILIATION_REQUIRED",
        fingerprint: "fp-998811",
      });

      reconRecord = await PaymentReconciliation.create({
        eventId: bankEvent._id,
        purpose: "TUITION",
        channelKey: "TUITION",
        orderCode: 998811,
        reason: "LATE_PAYMENT_REVIEW",
        receivedAmount: mongoose.Types.Decimal128.fromString("750000"),
        expectedAmount: mongoose.Types.Decimal128.fromString("750000"),
        status: "NEEDS_REVIEW",
      });
    });

    test("5.1. GET /api/admin/reconciliations returns list with pagination", async () => {
      const res = await request(app)
        .get("/api/admin/reconciliations")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].orderCode).toBe(998811);
    });

    test("5.2. Filter by status=NEEDS_REVIEW", async () => {
      const res = await request(app)
        .get("/api/admin/reconciliations?status=NEEDS_REVIEW")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    test("5.3. Filter by reason=LATE_PAYMENT_REVIEW", async () => {
      const res = await request(app)
        .get("/api/admin/reconciliations?reason=LATE_PAYMENT_REVIEW")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    test("5.4. GET /api/admin/reconciliations/:id returns detailed record", async () => {
      const res = await request(app)
        .get(`/api/admin/reconciliations/${reconRecord._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reason).toBe("LATE_PAYMENT_REVIEW");
      expect(res.body.data.receivedAmount).toBe("750000");
    });

    test("5.5. PATCH assign with 'me' assigns calling admin and transitions CAS status to IN_REVIEW", async () => {
      const res = await request(app)
        .patch(`/api/admin/reconciliations/${reconRecord._id}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ assignedTo: "me", note: "Taking over case" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("IN_REVIEW"); // Transitioned from NEEDS_REVIEW
      expect(res.body.data.assignedTo).toBeDefined();
      expect(res.body.data.assignedTo._id.toString()).toBe(adminUser._id.toString());
      expect(res.body.data.auditReferences).toHaveLength(1);
      expect(res.body.data.auditReferences[0].action).toBe("ASSIGNED");
    });

    test("5.6. PATCH assign to another admin user ID succeeds and records audit trail", async () => {
      const res = await request(app)
        .patch(`/api/admin/reconciliations/${reconRecord._id}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ assignedTo: secondAdminUser._id.toString(), note: "Assigned to secondary auditor" });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo._id.toString()).toBe(secondAdminUser._id.toString());
      expect(res.body.data.auditReferences).toHaveLength(1);
      expect(res.body.data.auditReferences[0].note).toContain("Assigned to Audit Officer secondary");
    });

    test("5.7. PATCH assign to non-admin user fails with 400 INVALID_ASSIGNEE", async () => {
      const res = await request(app)
        .patch(`/api/admin/reconciliations/${reconRecord._id}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ assignedTo: studentUser._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_ASSIGNEE");
    });

    test("5.8. POST /notes appends audit note; rejects empty note with 400", async () => {
      // Negative test: empty note
      const resEmpty = await request(app)
        .post(`/api/admin/reconciliations/${reconRecord._id}/notes`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "   " });
      expect(resEmpty.status).toBe(400);

      // Positive test: valid note
      const resValid = await request(app)
        .post(`/api/admin/reconciliations/${reconRecord._id}/notes`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "Contacted student via email to verify transfer timestamp." });

      expect(resValid.status).toBe(200);
      expect(resValid.body.data.auditReferences).toHaveLength(1);
      expect(resValid.body.data.auditReferences[0].note).toContain("Contacted student");
    });
  });

  // =========================================================================
  // 6. FINANCIAL LEDGER INVARIANTS & EDGE CASES (4 tests)
  // =========================================================================
  describe("Suite 6: Financial Ledger Invariants & Aliases", () => {
    test("6.1. Invariant: UNAPPLIED_TUITION_RECEIPT is never added to confirmedTuitionRevenue", async () => {
      await Transaction.create([
        {
          transactionType: "UNAPPLIED_TUITION_RECEIPT",
          amount: mongoose.Types.Decimal128.fromString("990000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.unappliedLateReceipts).toBe("990000");
      expect(res.body.data.revenue.confirmedTuitionRevenue).toBe("0");
    });

    test("6.2. Invariant: SPONSOR_CONTRIBUTION is never mixed into confirmedTuitionRevenue", async () => {
      await Transaction.create([
        {
          transactionType: "SPONSOR_CONTRIBUTION",
          amount: mongoose.Types.Decimal128.fromString("5000000"),
          status: "COMPLETED",
          sourceUserId: studentUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.confirmedDonationRevenue).toBe("5000000");
      expect(res.body.data.revenue.confirmedTuitionRevenue).toBe("0");
    });

    test("6.3. Invariant: PENDING refunds are not subtracted from completed refunds", async () => {
      await Transaction.create([
        {
          transactionType: "REFUND",
          amount: mongoose.Types.Decimal128.fromString("100000"),
          status: "PENDING",
          sourceUserId: adminUser._id,
        },
        {
          transactionType: "REFUND",
          amount: mongoose.Types.Decimal128.fromString("100000"),
          status: "COMPLETED",
          sourceUserId: adminUser._id,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue.pendingRefundLiability).toBe("100000");
      expect(res.body.data.revenue.completedRefunds).toBe("100000");
    });

    test("6.4. Route Aliases: /api/admin/overview and /api/finance/admin/overview and /api/admin/finance/overview return 200", async () => {
      const res1 = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);
      const res2 = await request(app)
        .get("/api/finance/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);
      const res3 = await request(app)
        .get("/api/admin/finance/overview")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);
      expect(res1.body.data.revenue).toEqual(res2.body.data.revenue);
      expect(res2.body.data.revenue).toEqual(res3.body.data.revenue);
    });
  });
});
