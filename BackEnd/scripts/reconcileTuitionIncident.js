const path = require("path");
const crypto = require("crypto");
const backendDir = path.resolve(__dirname, "..");
require(path.join(backendDir, "node_modules/dotenv")).config({ path: path.join(backendDir, ".env") });
const mongoose = require(path.join(backendDir, "node_modules/mongoose"));

const Payment = require(path.join(backendDir, "src/models/Payment"));
const Enrollment = require(path.join(backendDir, "src/models/Enrollment"));
const Class = require(path.join(backendDir, "src/models/Class"));
const BankTransferEvent = require(path.join(backendDir, "src/models/BankTransferEvent"));
const PaymentReconciliation = require(path.join(backendDir, "src/models/PaymentReconciliation"));
const Transaction = require(path.join(backendDir, "src/models/Transaction"));
const TeacherEarning = require(path.join(backendDir, "src/models/TeacherEarning"));
const RefundCase = require(path.join(backendDir, "src/models/RefundCase"));
const User = require(path.join(backendDir, "src/models/User"));

const { createTeacherEarning } = require(path.join(backendDir, "src/services/settlementService"));
const { notify, notifyTeacherOfEnrollment, notifyAdminsOnce } = require(path.join(backendDir, "src/services/notificationService"));
const { toDec, toNum } = require(path.join(backendDir, "src/utils/money"));

const buildFingerprint = (channelKey, data) => {
  const ref = String(data.reference || "").trim();
  const orderCode = Number(data.orderCode);
  const linkId = String(data.paymentLinkId || "").trim();
  const amount = Math.round(Number(data.amount || 0));
  const raw = `PAYOS:${channelKey}:${ref}:${orderCode}:${linkId}:${amount}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const generateCaseNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REF-${dateStr}-${rand}`;
};

async function executeReconciliation() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected successfully to DB:", mongoose.connection.name);

  const session = await mongoose.startSession();
  let recoveredEnrollmentId = null;
  let createdRefundCaseId = null;
  const now = new Date();

  try {
    session.startTransaction();

    console.log("=== PHASE 1: RECOVER LEGITIMATE ENROLLMENT (ORDER 100000009) ===");
    const p9 = await Payment.findOne({ orderCode: 100000009 }).session(session);
    if (!p9) throw new Error("Payment for order 100000009 not found");

    const e9 = await Enrollment.findById(p9.enrollmentId).session(session);
    if (!e9) throw new Error(`Enrollment ${p9.enrollmentId} not found`);

    const cls = await Class.findById(e9.classId).session(session);
    if (!cls) throw new Error(`Class ${e9.classId} not found`);

    const bte9 = await BankTransferEvent.findOne({ orderCode: 100000009 }).session(session);
    if (!bte9) throw new Error("BankTransferEvent for order 100000009 not found");

    const recon9 = await PaymentReconciliation.findOne({ orderCode: 100000009 }).session(session);
    if (!recon9) throw new Error("PaymentReconciliation for order 100000009 not found");

    // 1. Update Payment 100000009 -> COMPLETED
    p9.paymentStatus = "COMPLETED";
    p9.providerStatus = "PAID";
    p9.paidAt = new Date("2026-11-20T03:25:54.000Z");
    await p9.save({ session });
    console.log(`- Payment 100000009 updated to COMPLETED (paidAt: ${p9.paidAt.toISOString()})`);

    // 2. Update Enrollment 100000009 -> CONFIRMED
    e9.enrollmentStatus = "CONFIRMED";
    e9.paymentSource = "DIRECT_PAYMENT";
    e9.amountPaidViaPayment = toDec(3000);
    e9.holdExpiresAt = null;
    await e9.save({ session });
    console.log(`- Enrollment ${e9._id} updated to CONFIRMED`);

    // 3. Increment Class enrolledCount atomically (0 -> 1)
    await Class.updateOne(
      { _id: cls._id },
      { $inc: { enrolledCount: 1 } },
      { session }
    );
    console.log(`- Class ${cls._id} enrolledCount incremented (+1)`);

    // 4. Create Transaction ENROLLMENT_PAYMENT
    let [txEnrollment] = await Transaction.find({
      relatedPaymentId: p9._id,
      transactionType: "ENROLLMENT_PAYMENT",
    }).session(session);

    if (!txEnrollment) {
      [txEnrollment] = await Transaction.create(
        [
          {
            transactionType: "ENROLLMENT_PAYMENT",
            sourceUserId: p9.payerUserId,
            destinationUserId: e9.teacherId,
            relatedEnrollmentId: e9._id,
            relatedPaymentId: p9._id,
            relatedBankEventId: bte9._id,
            amount: toDec(3000),
            status: "COMPLETED",
          },
        ],
        { session }
      );
      console.log(`- Transaction ENROLLMENT_PAYMENT created: ${txEnrollment._id}`);
    } else {
      console.log(`- Transaction ENROLLMENT_PAYMENT already exists: ${txEnrollment._id}`);
    }

    // 5. Create TeacherEarning with settlementBlockers: ["POLICY_BLOCKED"]
    let earning9 = await TeacherEarning.findOne({ enrollmentId: e9._id }).session(session);
    if (!earning9) {
      earning9 = await createTeacherEarning(e9, 3000, session, {
        settlementHoldRequired: true,
        settlementBlockers: ["POLICY_BLOCKED"],
      });
      console.log(`- TeacherEarning created: ${earning9._id} (policy blockers: ${earning9.settlementBlockers})`);
    } else {
      console.log(`- TeacherEarning already exists: ${earning9._id}`);
    }

    // 6. Update BankTransferEvent 100000009 -> DISPATCHED
    bte9.eventStatus = "DISPATCHED";
    bte9.dispatchStatus = "DISPATCHED";
    bte9.normalizedError = null;
    bte9.dispatchedAt = now;
    bte9.linkedTransactionIds = [txEnrollment._id];
    bte9.linkedTeacherEarningId = earning9._id;
    await bte9.save({ session });
    console.log(`- BankTransferEvent ${bte9._id} updated to DISPATCHED`);

    // 7. Update PaymentReconciliation 100000009 -> RESOLVED_APPROVED
    recon9.status = "RESOLVED_APPROVED";
    recon9.resolvedAt = now;
    recon9.resolutionNote = "Reconciled via approved legitimate enrollment recovery (orderCode: 100000009)";
    recon9.auditReferences.push({
      action: "RECONCILIATION_RESOLVED",
      note: "Enrollment recovered and confirmed legitimately per approved decision",
      timestamp: now,
    });
    await recon9.save({ session });
    console.log(`- PaymentReconciliation ${recon9._id} updated to RESOLVED_APPROVED`);

    recoveredEnrollmentId = e9._id;

    console.log("\n=== PHASE 2: CLASSIFY DUPLICATE PAYMENT & INITIALIZE REFUND CASE (ORDER 100000008) ===");
    const p8 = await Payment.findOne({ orderCode: 100000008 }).session(session);
    if (!p8) throw new Error("Payment for order 100000008 not found");

    const e8 = await Enrollment.findById(p8.enrollmentId).session(session);
    if (!e8) throw new Error(`Enrollment ${p8.enrollmentId} not found`);

    // 1. Create or retrieve BankTransferEvent for 100000008
    let bte8 = await BankTransferEvent.findOne({ orderCode: 100000008 }).session(session);
    if (!bte8) {
      const fingerprint8 = buildFingerprint("TUITION", {
        reference: "FT26324691300734",
        orderCode: 100000008,
        paymentLinkId: "21d8135b556c41f9af67a3864f6e6732",
        amount: 3000,
      });

      [bte8] = await BankTransferEvent.create(
        [
          {
            provider: "PAYOS",
            channelKey: "TUITION",
            purpose: "TUITION",
            orderCode: 100000008,
            providerReference: "FT26324691300734",
            paymentLinkId: "21d8135b556c41f9af67a3864f6e6732",
            amount: toDec(3000),
            currency: "VND",
            providerEventCode: "00",
            eventStatus: "EXPIRED_PAYMENT",
            receivedAt: new Date("2026-11-20T02:35:25.000Z"),
            processedAt: now,
            linkedPaymentId: p8._id,
            fingerprint: fingerprint8,
            metadata: {
              outerCode: "00",
              signedDataCode: "00",
              transactionDateTime: "2026-11-20T09:35:25+07:00",
              maskedReceiverAccount: "******9999",
              description: "Qantha4218 CASSO12135 4 GMshOP4TFHK4jkiU2SZWw2Ff EDUNITY HP 100000008 I2RUWVT7972588",
              counterAccountNumber: "76828051998",
              counterAccountName: "PHAM CONG TIN",
              counterAccountBankId: "01358001",
            },
            normalizedError: "Duplicate payment surplus - enrollment already granted via order 100000009",
            dispatchStatus: "RECONCILIATION_REQUIRED",
          },
        ],
        { session }
      );
      console.log(`- BankTransferEvent for 100000008 created: ${bte8._id}`);
    } else {
      console.log(`- BankTransferEvent for 100000008 already exists: ${bte8._id}`);
    }

    // 2. Update Payment 100000008 -> COMPLETED (cash received on bank account)
    p8.paymentStatus = "COMPLETED";
    p8.providerStatus = "PAID";
    p8.paidAt = new Date("2026-11-20T02:35:25.000Z");
    await p8.save({ session });
    console.log(`- Payment 100000008 set to COMPLETED (cash-in recognized)`);

    // Enrollment 8 REMAINS EXPIRED (Invariant: exactly 1 enrollment confirmed)
    console.log(`- Enrollment 8 status remains: ${e8.enrollmentStatus} (no double enrollment)`);

    // 3. Create Transactions for Order 100000008 (TIN-FIN-PR5: UNAPPLIED_TUITION_RECEIPT + REFUND)
    let [unappliedTx] = await Transaction.find({
      relatedPaymentId: p8._id,
      transactionType: "UNAPPLIED_TUITION_RECEIPT",
    }).session(session);

    if (!unappliedTx) {
      [unappliedTx] = await Transaction.create(
        [
          {
            transactionType: "UNAPPLIED_TUITION_RECEIPT",
            sourceUserId: p8.payerUserId,
            destinationUserId: null,
            relatedEnrollmentId: e8._id,
            relatedPaymentId: p8._id,
            relatedBankEventId: bte8._id,
            amount: toDec(3000),
            status: "COMPLETED",
          },
        ],
        { session }
      );
      console.log(`- Transaction UNAPPLIED_TUITION_RECEIPT created: ${unappliedTx._id}`);
    }

    let [refundTx] = await Transaction.find({
      relatedPaymentId: p8._id,
      transactionType: "REFUND",
    }).session(session);

    if (!refundTx) {
      [refundTx] = await Transaction.create(
        [
          {
            transactionType: "REFUND",
            sourceUserId: p8.payerUserId,
            destinationUserId: null,
            relatedEnrollmentId: e8._id,
            relatedPaymentId: p8._id,
            relatedBankEventId: bte8._id,
            amount: toDec(3000),
            status: "PENDING",
          },
        ],
        { session }
      );
      console.log(`- Transaction REFUND (PENDING) created: ${refundTx._id}`);
    }

    bte8.linkedTransactionIds = [unappliedTx._id, refundTx._id];
    await bte8.save({ session });

    // 4. Create PaymentReconciliation for 100000008
    let recon8 = await PaymentReconciliation.findOne({ orderCode: 100000008 }).session(session);
    if (!recon8) {
      [recon8] = await PaymentReconciliation.create(
        [
          {
            eventId: bte8._id,
            purpose: "TUITION",
            channelKey: "TUITION",
            orderCode: 100000008,
            paymentId: p8._id,
            enrollmentId: e8._id,
            campaignId: null,
            contributionId: null,
            reason: "EXPIRED_PAYMENT",
            expectedAmount: toDec(0),
            receivedAmount: toDec(3000),
            currency: "VND",
            status: "NEEDS_REVIEW",
            auditReferences: [
              {
                action: "DUPLICATE_SURPLUS_CLASSIFIED",
                note: "Duplicate payment surplus classified for refund. Enrollment already granted via order 100000009.",
                timestamp: now,
              },
            ],
          },
        ],
        { session }
      );
      console.log(`- PaymentReconciliation 100000008 created: ${recon8._id}`);
    } else {
      console.log(`- PaymentReconciliation 100000008 already exists: ${recon8._id}`);
    }

    // 5. Create RefundCase for 100000008
    let rfc8 = await RefundCase.findOne({ sourcePaymentId: p8._id }).session(session);
    if (!rfc8) {
      const caseNumber = generateCaseNumber();
      [rfc8] = await RefundCase.create(
        [
          {
            caseNumber,
            purpose: "TUITION",
            channelKey: "TUITION",
            sourcePaymentId: p8._id,
            relatedBankEventId: bte8._id,
            relatedReconciliationId: recon8._id,
            relatedEnrollmentId: e8._id,
            relatedClassId: cls._id,
            recipientUserId: p8.payerUserId,
            beneficiaryBankAccount: {
              bankName: "MBBank",
              accountNumber: "76828051998",
              accountHolderName: "PHAM CONG TIN",
            },
            originalAmount: toDec(3000),
            eligibleAmount: toDec(3000),
            approvedAmount: null,
            currency: "VND",
            reason: "OVERPAYMENT",
            reasonDetails: "Thanh toán trùng lặp học phí cho lớp TEST PAYOS 3K - Toán 12 THPT (Mã GD payOS: 100000008, FT26324691300734). Học viên đã được ghi danh hợp lệ qua Order 100000009.",
            status: "NEEDS_REVIEW",
            refundMethod: "MANUAL_BANK_TRANSFER",
            obligationTransactionId: refundTx._id,
            auditLogs: [
              {
                action: "REFUND_CASE_CREATED",
                actorRole: "SYSTEM",
                note: "Auto-generated from duplicate tuition surplus reconciliation per user approved decision",
                timestamp: now,
              },
            ],
          },
        ],
        { session }
      );
      console.log(`- RefundCase created: ${rfc8.caseNumber} (ID: ${rfc8._id})`);
    } else {
      console.log(`- RefundCase already exists: ${rfc8.caseNumber} (ID: ${rfc8._id})`);
    }
    createdRefundCaseId = rfc8._id;

    // Commit Transaction
    await session.commitTransaction();
    console.log("\n>>> TRANSACTION COMMITTED SUCCESSFULLY! <<<");

  } catch (err) {
    await session.abortTransaction();
    console.error("\n>>> TRANSACTION ABORTED DUE TO ERROR: <<<", err);
    throw err;
  } finally {
    await session.endSession();
  }

  // Best-effort post-commit notifications
  console.log("\n=== DISPATCHING NOTIFICATIONS ===");
  try {
    const studentUser = await User.findById("6affad45c018a7f4729080cf");
    if (studentUser) {
      await notify(
        studentUser._id,
        "Thanh toán thành công & Ghi danh lớp học",
        "Học phí 3.000đ đã được thanh toán thành công. Bạn đã được ghi danh vào lớp \"TEST PAYOS 3K - Toán 12 THPT\".",
        "ENROLLMENT_CONFIRMED",
        { dedupeKey: "enrollment:100000009:confirmed" }
      );
      console.log(`- Notification sent to Student (${studentUser.email})`);
    }

    if (recoveredEnrollmentId) {
      await notifyTeacherOfEnrollment(recoveredEnrollmentId);
      console.log("- Notification sent to Teacher for new enrollment");
    }

    // Send persistent notification to Admin about the duplicate payment surplus refund case
    await notifyAdminsOnce(
      "Yêu cầu hoàn tiền học phí thừa (Order #100000008)",
      "Phát hiện thanh toán thừa 3.000đ từ học viên quangtin98hg@gmail.com cho lớp TEST PAYOS 3K - Toán 12 THPT. Đã tạo hồ sơ hoàn tiền cần xử lý.",
      "REFUND_REQUIRED",
      "refund:100000008:admin_notice"
    );
    console.log("- Notification sent to all active Admins for pending refund review");

  } catch (notifErr) {
    console.error("Warning: Notification dispatch error (non-fatal):", notifErr.message);
  }

  await mongoose.disconnect();
  console.log("\nDisconnected from MongoDB. Reconciliation completed successfully.");
}

executeReconciliation()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
