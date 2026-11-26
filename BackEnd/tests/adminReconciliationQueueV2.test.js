const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident, caseNumber } = require("./helpers/financialFixtures");
const financeService = require("../src/services/financeService");
const PaymentReconciliation = require("../src/models/PaymentReconciliation");
const RefundCase = require("../src/models/RefundCase");
const Payment = require("../src/models/Payment");
const Enrollment = require("../src/models/Enrollment");
const BankTransferEvent = require("../src/models/BankTransferEvent");

describe("Admin Reconciliation Queue V2 & Workflow Guards Test Suite", () => {
  let adminUser;
  let studentUser;
  let testReconNeedsReview;
  let testReconResolved;
  let fakeEvent1;
  let fakeEvent2;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    await seedTuitionIncident(actors);

    ({ admin: adminUser, student: studentUser } = actors);

    // Create isolated test event & recon for needs review
    fakeEvent1 = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 998877001,
      providerReference: `FT_TEST_${Date.now()}_01`,
      amount: "5000",
      currency: "VND",
      eventStatus: "UNMATCHED",
      dispatchStatus: "RECONCILIATION_REQUIRED",
      fingerprint: `fp_test_recon_v2_${Date.now()}_01`,
    });

    testReconNeedsReview = await PaymentReconciliation.create({
      eventId: fakeEvent1._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 998877001,
      reason: "UNMATCHED",
      receivedAmount: "5000",
      status: "NEEDS_REVIEW",
      assignedTo: null,
      auditReferences: [
        { action: "WEBHOOK_RECONCILIATION_OPENED", note: "Auto-created test", timestamp: new Date() },
      ],
    });

    // Create isolated resolved recon
    fakeEvent2 = await BankTransferEvent.create({
      provider: "PAYOS",
      channelKey: "TUITION",
      purpose: "TUITION",
      orderCode: 998877002,
      providerReference: `FT_TEST_${Date.now()}_02`,
      amount: "5000",
      currency: "VND",
      eventStatus: "DISPATCHED",
      dispatchStatus: "DISPATCHED",
      fingerprint: `fp_test_recon_v2_${Date.now()}_02`,
    });

    testReconResolved = await PaymentReconciliation.create({
      eventId: fakeEvent2._id,
      purpose: "TUITION",
      channelKey: "TUITION",
      orderCode: 998877002,
      reason: "ACCOUNT_MISMATCH",
      receivedAmount: "5000",
      status: "RESOLVED_APPROVED",
      assignedTo: adminUser._id,
      auditReferences: [
        { action: "RECONCILIATION_RESOLVED", note: "Resolved", timestamp: new Date() },
      ],
    });
  });

  afterAll(disconnectDB);

  test("1. Tab filtering correctly separates NEEDS_REVIEW, IN_REVIEW, RESOLVED, and ALL", async () => {
    const [needsReviewRes, inReviewRes, resolvedRes, allRes] = await Promise.all([
      financeService.getAdminReconciliations({ tab: "NEEDS_REVIEW" }),
      financeService.getAdminReconciliations({ tab: "IN_REVIEW" }),
      financeService.getAdminReconciliations({ tab: "RESOLVED" }),
      financeService.getAdminReconciliations({ tab: "ALL" }),
    ]);

    expect(needsReviewRes).toHaveProperty("items");
    expect(needsReviewRes).toHaveProperty("tabCounts");
    expect(needsReviewRes.tabCounts).toHaveProperty("needsReview");
    expect(needsReviewRes.tabCounts).toHaveProperty("inReview");
    expect(needsReviewRes.tabCounts).toHaveProperty("resolved");
    expect(needsReviewRes.tabCounts).toHaveProperty("all");

    // Verify all items in needsReviewRes have status NEEDS_REVIEW
    needsReviewRes.items.forEach((item) => {
      expect(item.status).toBe("NEEDS_REVIEW");
    });

    // Verify all items in inReviewRes have status IN_REVIEW
    inReviewRes.items.forEach((item) => {
      expect(item.status).toBe("IN_REVIEW");
    });

    // Verify all items in resolvedRes have resolved status
    resolvedRes.items.forEach((item) => {
      expect(["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"]).toContain(item.status);
    });

    // Resolved cases must never appear in NEEDS_REVIEW tab
    const resolvedInNeedsReview = needsReviewRes.items.some((i) =>
      ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"].includes(i.status)
    );
    expect(resolvedInNeedsReview).toBe(false);
  });

  test("2. Accept NEEDS_REVIEW transitions status to IN_REVIEW and logs ASSIGNED event", async () => {
    const updated = await financeService.assignReconciliation(testReconNeedsReview._id, adminUser, {
      assignedTo: "me",
      note: "Admin bắt đầu tiếp nhận xử lý",
    });

    expect(updated.status).toBe("IN_REVIEW");
    expect(String(updated.assignedTo._id || updated.assignedTo)).toBe(String(adminUser._id));

    const lastAudit = updated.auditReferences[updated.auditReferences.length - 1];
    expect(lastAudit.action).toBe("ASSIGNED");
    expect(lastAudit.note).toContain("Admin bắt đầu tiếp nhận xử lý");
  });

  test("3. Duplicate assignment to the same admin without note is idempotent and adds no audit events", async () => {
    const reconBefore = await PaymentReconciliation.findById(testReconNeedsReview._id).lean();
    const auditCountBefore = reconBefore.auditReferences.length;

    // Assign again to same admin without new note
    const result = await financeService.assignReconciliation(testReconNeedsReview._id, adminUser, {
      assignedTo: "me",
    });

    expect(result.status).toBe("IN_REVIEW");
    expect(result.auditReferences.length).toBe(auditCountBefore);
  });

  test("4. Assign or accept on a RESOLVED reconciliation throws HTTP 409", async () => {
    await expect(
      financeService.assignReconciliation(testReconResolved._id, adminUser, { assignedTo: "me" })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECONCILIATION_ALREADY_RESOLVED",
    });
  });

  test("5. Assignment to non-admin user throws validation error", async () => {
    await expect(
      financeService.assignReconciliation(testReconNeedsReview._id, adminUser, {
        assignedTo: studentUser._id.toString(),
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_ASSIGNEE",
    });
  });

  test("6. Adding note records audit event without mutating Payment, Enrollment, or RefundCase", async () => {
    const paymentBefore = await Payment.findOne({ orderCode: 100000008 }).lean();
    const enrollmentBefore = await Enrollment.findOne({ _id: paymentBefore?.enrollmentId }).lean();
    const refundCaseBefore = await RefundCase.findOne({ sourcePaymentId: paymentBefore?._id }).lean();

    const updated = await financeService.addReconciliationNote(testReconNeedsReview._id, adminUser, {
      note: "Kiểm tra ngân hàng ghi nhận tiền vào lúc 10h",
    });

    const lastAudit = updated.auditReferences[updated.auditReferences.length - 1];
    expect(lastAudit.action).toBe("NOTE_ADDED");
    expect(lastAudit.note).toContain("Kiểm tra ngân hàng ghi nhận");

    // Verify financial records were untouched
    const paymentAfter = await Payment.findOne({ orderCode: 100000008 }).lean();
    const enrollmentAfter = await Enrollment.findOne({ _id: paymentBefore?.enrollmentId }).lean();
    const refundCaseAfter = await RefundCase.findOne({ sourcePaymentId: paymentBefore?._id }).lean();

    expect(paymentAfter.paymentStatus).toBe(paymentBefore.paymentStatus);
    if (enrollmentBefore && enrollmentAfter) {
      expect(enrollmentAfter.enrollmentStatus).toBe(enrollmentBefore.enrollmentStatus);
    }
    if (refundCaseBefore && refundCaseAfter) {
      expect(refundCaseAfter.status).toBe(refundCaseBefore.status);
    }
  });

  test("7. OrderCode 100000008 reconciliation links to existing RefundCase without closing refund", async () => {
    const recon1008 = await PaymentReconciliation.findOne({ orderCode: 100000008 }).lean();
    expect(recon1008).not.toBeNull();

    const detail = await financeService.getAdminReconciliationById(recon1008._id.toString());
    expect(detail).toHaveProperty("refundCase");
    expect(detail.refundCase).toHaveProperty("caseNumber");
    expect(detail.refundCase.caseNumber).toBe(caseNumber);

    // Ensure RefundCase remains NEEDS_REVIEW (pending refund liability, not paid out)
    expect(detail.refundCase.status).toBe("NEEDS_REVIEW");
  });

  test("8. OrderCode 100000009 reconciliation is RESOLVED_APPROVED and read-only", async () => {
    const recon1009 = await PaymentReconciliation.findOne({ orderCode: 100000009 }).lean();
    expect(recon1009).not.toBeNull();
    expect(recon1009.status).toBe("RESOLVED_APPROVED");

    // Attempting to re-assign should fail with 409
    await expect(
      financeService.assignReconciliation(recon1009._id, adminUser, { assignedTo: "me" })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECONCILIATION_ALREADY_RESOLVED",
    });
  });
});
