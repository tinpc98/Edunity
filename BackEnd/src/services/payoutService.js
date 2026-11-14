const { resolvePayoutAccount } = require("./teacherBankAccountService");
const mongoose = require("mongoose");
const {
  Payout,
  TeacherEarning,
  TeacherSettlement,
  Transaction,
  User,
} = require("../models");
const { AppError } = require("../utils/errors");
const { validationError, isBlank, paged } = require("../utils/http");
const { toNum, toDec } = require("../utils/money");
const { notify, notifyAdmins } = require("./notificationService");
const { serializeDecimal128 } = require("../utils/serialize");
const {
  isMondayWithdrawalWindow,
  isFridayPayoutWindow,
  getVietnamTimeParts,
} = require("./settlementService");
const { claimBankProof, verifyBankProof } = require("./bankProofService");

const payoutNotFound = () =>
  new AppError("Payout not found", "PAYOUT_NOT_FOUND", 404);

const present = (payout) =>
  serializeDecimal128({ ...payout, id: payout._id?.toString() || payout.id });

function getNextFriday(from = new Date()) {
  const d = new Date(from);
  const { weekday } = getVietnamTimeParts(d);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDay = dayMap[weekday] ?? d.getDay();
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0) daysUntilFriday = 7;
  d.setDate(d.getDate() + daysUntilFriday);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * F02 / PR7: Teacher requests a payout of AVAILABLE earnings.
 * Rules enforced:
 * - BR-09: Request only allowed on Mondays 08:00 to < 17:00 (Asia/Ho_Chi_Minh).
 * - BR-14: Cannot exceed available balance.
 * - BR-15: No double claiming of earnings across payouts.
 * - Idempotency & Active Request Guard.
 */
const requestPayout = async (teacherId, body = {}, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();

  // BR-09: Monday 08:00–17:00 window check
  if (!options.skipWindowCheck && !isMondayWithdrawalWindow(now)) {
    throw new AppError(
      "Yêu cầu rút tiền chỉ được gửi vào Thứ Hai từ 08:00 đến 17:00 (giờ Việt Nam)",
      "WITHDRAWAL_WINDOW_CLOSED",
      400,
    );
  }

  const { amount: requestedAmount } = body;
  // BAO-09: money only goes to the teacher's verified account; bank fields in the request are ignored
  const { bankName, accountNumber, accountHolderName } = await resolvePayoutAccount(teacherId, now);

  // Active payout guard
  const activePayout = await Payout.findOne({
    teacherId,
    status: {
      $in: [
        "PENDING",
        "PROCESSING",
        "APPROVED",
        "SCHEDULED",
        "PENDING_BANK_TRANSFER",
      ],
    },
  });
  if (activePayout) {
    throw new AppError(
      "Bạn đang có một yêu cầu rút tiền đang được xử lý",
      "EXISTING_ACTIVE_PAYOUT",
      400,
    );
  }

  const session = await mongoose.startSession();
  let payout;
  let lockedDueToDispute = false;
  try {
    await session.withTransaction(async () => {
      const availableEarnings = await TeacherEarning.find({
        teacherId,
        status: "AVAILABLE",
        payoutId: null,
      }).session(session);

      const totalAvailable = availableEarnings.reduce(
        (sum, e) => sum + toNum(e.netAmount),
        0,
      );
      if (!availableEarnings.length || totalAvailable <= 0) {
        throw new AppError(
          "Không có thu nhập khả dụng để rút tiền",
          "INSUFFICIENT_AVAILABLE_BALANCE",
          400,
        );
      }

      let payoutAmount = totalAvailable;
      let targetEarnings = availableEarnings;

      if (requestedAmount !== undefined && requestedAmount !== null) {
        const reqNum = toNum(requestedAmount);
        if (reqNum <= 0) {
          throw new AppError(
            "Số tiền rút phải lớn hơn 0",
            "INVALID_AMOUNT",
            400,
          );
        }
        if (reqNum > totalAvailable) {
          throw new AppError(
            `Số tiền yêu cầu (${reqNum.toLocaleString("vi-VN")}đ) vượt quá số dư khả dụng (${totalAvailable.toLocaleString("vi-VN")}đ)`,
            "INSUFFICIENT_AVAILABLE_BALANCE",
            400,
          );
        }
        // Allocate earnings to cover requested amount
        payoutAmount = reqNum;
        let runningSum = 0;
        targetEarnings = [];
        for (const e of availableEarnings) {
          targetEarnings.push(e);
          runningSum += toNum(e.netAmount);
          if (runningSum >= reqNum) break;
        }
      }

      [payout] = await Payout.create(
        [
          {
            teacherId,
            amount: toDec(payoutAmount),
            status: "PENDING",
            bankAccountSnapshot: {
              bankName: bankName.trim(),
              accountNumber: String(accountNumber).trim(),
              accountHolderName: accountHolderName.trim(),
            },
            requestedAt: now,
            auditLogs: [
              {
                action: "REQUESTED",
                actorId: teacherId,
                actorRole: "TEACHER",
                note: `Teacher requested withdrawal of ${payoutAmount.toLocaleString("vi-VN")}đ`,
                timestamp: now,
              },
            ],
          },
        ],
        { session },
      );

      const attached = await TeacherEarning.updateMany(
        {
          _id: { $in: targetEarnings.map((e) => e._id) },
          status: "AVAILABLE",
          payoutId: null,
        },
        { $set: { payoutId: payout._id } },
        { session },
      );

      if (attached.modifiedCount !== targetEarnings.length) {
        throw new AppError(
          "Earnings changed while requesting the payout; please retry",
          "PAYOUT_CONFLICT",
          409,
        );
      }
    });
  } finally {
    await session.endSession();
  }

  if (lockedDueToDispute) {
    throw new AppError(
      "Khoản chi trả đã bị khóa do phát sinh tranh chấp/khiếu nại chưa giải quyết.",
      "PAYOUT_LOCKED_FOR_DISPUTE",
      400
    );
  }

  await notifyAdmins(
    "Yêu cầu rút tiền mới",
    `Giáo viên yêu cầu rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ.`,
    "PAYOUT_REQUESTED",
  );

  return present(payout.toObject());
};

const listMyPayouts = async (teacherId) => {
  const payouts = await Payout.find({ teacherId })
    .sort({ requestedAt: -1 })
    .lean();
  return payouts.map(present);
};

const adminListPayouts = async (query = {}, paging) => {
  const filter = {};
  if (query.status && query.status !== "ALL") filter.status = query.status;

  const [items, total] = await Promise.all([
    Payout.find(filter)
      .sort({ requestedAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    Payout.countDocuments(filter),
  ]);

  const teachers = await User.find({
    _id: { $in: items.map((p) => p.teacherId) },
  })
    .select("email teacherProfile.fullName")
    .lean();
  const byId = new Map(teachers.map((t) => [t._id.toString(), t]));

  return paged(
    items.map((p) => {
      const teacher = byId.get(p.teacherId.toString());
      return {
        ...present(p),
        teacherName: teacher?.teacherProfile?.fullName || null,
        teacherEmail: teacher?.email || null,
      };
    }),
    total,
    paging,
  );
};

const getPayoutById = async (payoutId, requestingUser = null) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  const payout = await Payout.findById(payoutId).lean();
  if (!payout) throw payoutNotFound();

  // IDOR check: teachers can only view their own payouts
  if (requestingUser && requestingUser.role === "TEACHER") {
    if (payout.teacherId.toString() !== requestingUser.id?.toString()) {
      throw new AppError(
        "You do not have permission to view this payout",
        "FORBIDDEN",
        403,
      );
    }
  }

  const [teacher, earnings] = await Promise.all([
    User.findById(payout.teacherId)
      .select("email teacherProfile.fullName")
      .lean(),
    TeacherEarning.find({ payoutId: payout._id })
      .populate("classId", "className status")
      .lean(),
  ]);

  return {
    ...present(payout),
    teacherName: teacher?.teacherProfile?.fullName || null,
    teacherEmail: teacher?.email || null,
    attachedEarnings: earnings.map((e) => ({
      id: e._id.toString(),
      classId: e.classId?._id?.toString() || e.classId?.toString(),
      className: e.classId?.className || "Lớp học",
      grossAmount: toNum(e.grossAmount),
      commissionAmount: toNum(e.commissionAmount),
      netAmount: toNum(e.netAmount),
      status: e.status,
    })),
  };
};

/**
 * Admin approves withdrawal request.
 * Sets status to APPROVED, schedules for Friday payment window.
 * Does NOT mark PAID or COMPLETED.
 */
const approvePayout = async (adminId, payoutId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  const now = options.now instanceof Date ? options.now : new Date();
  const nextFriday = getNextFriday(now);

  const payout = await Payout.findOneAndUpdate(
    { _id: payoutId, status: "PENDING" },
    {
      $set: {
        status: "APPROVED",
        approvedAt: now,
        scheduledAt: nextFriday,
        processedBy: adminId,
        reviewNote:
          body.note ||
          "Đã phê duyệt yêu cầu rút tiền. Xếp lịch chi trả vào Thứ Sáu.",
      },
      $push: {
        auditLogs: {
          action: "APPROVED",
          actorId: adminId,
          actorRole: "ADMIN",
          note:
            body.note ||
            `Approved withdrawal request. Scheduled for Friday: ${nextFriday.toISOString()}`,
          timestamp: now,
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!payout) {
    if (!(await Payout.exists({ _id: payoutId }))) throw payoutNotFound();
    throw new AppError(
      "Payout request has already been processed or is not in PENDING state",
      "PAYOUT_ALREADY_PROCESSED",
      409,
    );
  }

  await notify(
    payout.teacherId,
    "Yêu cầu rút tiền đã được duyệt",
    `Yêu cầu rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ đã được Admin phê duyệt và xếp lịch chi trả vào Thứ Sáu.`,
    "PAYOUT_APPROVED",
  );

  return present(payout.toObject());
};

/**
 * Admin confirms bank transfer execution.
 * Enforces:
 * - BR-10: Friday 08:00-17:00 window check.
 * - BR-11, BR-12: Must provide verified bank reference / proof. Never auto-mark PAID without proof.
 */
const completePayout = async (adminId, payoutId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  const now = options.now instanceof Date ? options.now : new Date();
  const requireDualVerification = Boolean(options.requireDualVerification);

  // BR-10: Friday 08:00–17:00 window check
  if (!options.skipWindowCheck && !isFridayPayoutWindow(now)) {
    throw new AppError(
      "Thao tác giải ngân chỉ được thực hiện vào Thứ Sáu từ 08:00 đến 17:00 (giờ Việt Nam)",
      "PAYOUT_EXECUTION_WINDOW_CLOSED",
      400,
    );
  }

  // BR-11: Valid bank transfer proof required
  const bankReference = body.bankReference || body.referenceNumber;
  const proofDocumentKey = body.proofDocumentKey || null;

  if (!bankReference && !proofDocumentKey && !options.skipProofCheck) {
    // Cannot mark COMPLETED; set to PENDING_BANK_TRANSFER and require proof
    await Payout.updateOne(
      {
        _id: payoutId,
        status: { $in: ["PENDING", "PROCESSING", "APPROVED", "SCHEDULED"] },
      },
      {
        $set: { status: "PENDING_BANK_TRANSFER" },
        $push: {
          auditLogs: {
            action: "HELD_PENDING_PROOF",
            actorId: adminId,
            actorRole: "ADMIN",
            note: "Attempted completion without bank transfer proof. Gated at PENDING_BANK_TRANSFER.",
            timestamp: now,
          },
        },
      },
    );
    throw new AppError(
      "Bắt buộc phải có mã tham chiếu ngân hàng hoặc chứng từ chuyển khoản hợp lệ. Không được tự ý đánh dấu PAID.",
      "BANK_TRANSFER_PROOF_REQUIRED",
      400,
    );
  }

  const session = await mongoose.startSession();
  let payout;
  let lockedDueToDispute = false;
  try {
    await session.withTransaction(async () => {
      const existingPayout = await Payout.findById(payoutId).session(session);
      if (!existingPayout) throw payoutNotFound();
      if (existingPayout.status === "COMPLETED") {
        payout = existingPayout;
        return;
      }

      // Check duplicate bankReference and claim in BankProofRegistry across all channels
      if (bankReference) {
        await claimBankProof({
          bankReference,
          bankName: existingPayout.bankAccount?.bankName || "UNKNOWN",
          entityType: "PAYOUT",
          entityId: payoutId,
          amount: existingPayout.amount,
          accountNumber: existingPayout.bankAccount?.accountNumber,
          accountHolderName: existingPayout.bankAccount?.accountHolderName,
          adminId,
          session,
          isVerified: !requireDualVerification,
          now,
        });
      }

      // Pre-disbursement dispute check on teacher or attached classes
      const attachedEarnings = await TeacherEarning.find({ payoutId }).session(session);
      const classIds = [...new Set(attachedEarnings.map((e) => e.classId).filter(Boolean))];
      const targetTeacherId = existingPayout.teacherId;

      const { Report, TeacherIncidentReport, SessionRefundReview } = require("../models");
      let activeDispute = null;
      if (Report) {
        activeDispute = await Report.findOne({
          $or: [
            { classId: { $in: classIds } },
            { reporterId: targetTeacherId },
          ],
          status: { $in: ["OPEN", "IN_REVIEW", "PENDING_ADMIN", "ESCALATED"] },
        }).session(session);
      }
      let activeIncident = null;
      if (TeacherIncidentReport) {
        activeIncident = await TeacherIncidentReport.findOne({
          teacherId: targetTeacherId,
          status: { $in: ["OPEN", "INVESTIGATING", "PENDING_REVIEW"] },
        }).session(session);
      }
      let activeRefund = null;
      if (SessionRefundReview) {
        activeRefund = await SessionRefundReview.findOne({
          classId: { $in: classIds },
          status: { $in: ["NEEDS_FINANCIAL_REVIEW", "IN_REVIEW"] },
        }).session(session);
      }

      if (activeDispute || activeIncident || activeRefund) {
        await Payout.updateOne(
          { _id: payoutId },
          {
            $set: {
              status: "HELD_FOR_REVIEW",
              heldReason: "Phát hiện khiếu nại / vi phạm đang chờ xử lý trước thời điểm chi trả.",
            },
            $push: {
              auditLogs: {
                action: "PAYOUT_LOCKED_FOR_DISPUTE",
                actorId: adminId,
                actorRole: "ADMIN",
                note: "Disbursement locked due to active dispute or incident.",
                timestamp: now,
              },
            },
          },
          { session }
        );
        lockedDueToDispute = true;
        return;
      }

      // Dual verification staging: if required, gate at AWAITING_BANK_VERIFICATION
      if (options.requireDualVerification) {
        payout = await Payout.findOneAndUpdate(
          {
            _id: payoutId,
            status: { $in: ["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER"] },
          },
          {
            $set: {
              status: "AWAITING_BANK_VERIFICATION",
              processedAt: now,
              processedBy: adminId,
              reviewNote: body.note || null,
              bankTransferProof: {
                referenceNumber: bankReference ? String(bankReference).trim() : null,
                bankReference: bankReference ? String(bankReference).trim() : null,
                transferredAt: body.transferredAt ? new Date(body.transferredAt) : now,
                paidAt: body.transferredAt ? new Date(body.transferredAt) : now,
                submittedBy: adminId,
                submittedAt: now,
                proofDocumentKey,
                transferProofImage: body.transferProofImage || null,
                notes: body.note || null,
                note: body.note || null,
              },
            },
            $push: {
              auditLogs: {
                action: "PROOF_SUBMITTED_AWAITING_VERIFICATION",
                actorId: adminId,
                actorRole: "ADMIN",
                note: `Bank proof submitted with reference: ${bankReference}. Awaiting independent verification.`,
                timestamp: now,
              },
            },
          },
          { session, returnDocument: "after" }
        );
        return;
      }

      payout = await Payout.findOneAndUpdate(
        {
          _id: payoutId,
          status: { $in: ["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] },
        },
        {
          $set: {
            status: "COMPLETED",
            processedAt: now,
            processedBy: adminId,
            reviewNote: body.note || null,
            bankTransferProof: {
              referenceNumber: bankReference
                ? String(bankReference).trim()
                : null,
              bankReference: bankReference
                ? String(bankReference).trim()
                : null,
              transferredAt: body.transferredAt
                ? new Date(body.transferredAt)
                : now,
              paidAt: body.transferredAt ? new Date(body.transferredAt) : now,
              proofDocumentKey,
              transferProofImage: body.transferProofImage || null,
              verifiedBy: adminId,
              executedBy: adminId,
              verifiedAt: now,
              notes: body.note || "Bank transfer verified with proof",
              note: body.note || "Bank transfer verified with proof",
            },
          },
          $push: {
            auditLogs: {
              action: "COMPLETED",
              actorId: adminId,
              actorRole: "ADMIN",
              note: `Completed payout with bank reference: ${bankReference || "VERIFIED_PROOF"}`,
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" },
      );

      if (!payout) {
        const existing = await Payout.findById(payoutId).session(session);
        if (!existing) throw payoutNotFound();
        if (existing.status === "COMPLETED") {
          throw new AppError(
            "Cannot reject an already completed payout",
            "PAYOUT_ALREADY_COMPLETED",
            400,
          );
        }
        throw new AppError(
          "Payout has already been processed",
          "PAYOUT_ALREADY_PROCESSED",
          409,
        );
      }

      await TeacherEarning.updateMany(
        { payoutId: payout._id },
        {
          $set: { status: "PAID_OUT" },
          $push: {
            settlementAuditTrail: {
              action: "PAID_OUT",
              note: `Disbursed via Payout #${payout._id} with bank ref ${bankReference || "N/A"}`,
              timestamp: now,
            },
          },
        },
        { session },
      );

      if (TeacherSettlement) {
        const attachedEarnings = await TeacherEarning.find({
          payoutId: payout._id,
        })
          .select("_id")
          .session(session);
        await TeacherSettlement.updateMany(
          { earningId: { $in: attachedEarnings.map((e) => e._id) } },
          { $set: { status: "PAID_OUT" } },
          { session },
        );
      }

      await Transaction.create(
        [
          {
            transactionType: "TEACHER_PAYOUT",
            sourceUserId: adminId,
            destinationUserId: payout.teacherId,
            amount: payout.amount,
            status: "COMPLETED",
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (lockedDueToDispute) {
    throw new AppError(
      "Khoản chi trả đã bị khóa do phát sinh tranh chấp/khiếu nại chưa giải quyết.",
      "PAYOUT_LOCKED_FOR_DISPUTE",
      400
    );
  }

  await notify(
    payout.teacherId,
    "Đã chuyển tiền rút",
    `Khoản rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ đã được chuyển vào tài khoản của bạn (Mã GD: ${bankReference || "Đã xác minh"}).`,
    "PAYOUT_COMPLETED",
  );

  return present(payout.toObject());
};

/**
 * Admin rejects payout request (e.g. wrong bank details, active dispute).
 * Releases attached earnings back to AVAILABLE.
 */
const rejectPayout = async (adminId, payoutId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  if (isBlank(body.note)) {
    throw new AppError(
      "note is required to reject a payout",
      "REJECTION_NOTE_REQUIRED",
      400,
    );
  }
  const now = options.now instanceof Date ? options.now : new Date();

  const session = await mongoose.startSession();
  let payout;
  let lockedDueToDispute = false;
  try {
    await session.withTransaction(async () => {
      payout = await Payout.findOneAndUpdate(
        {
          _id: payoutId,
          status: {
            $in: [
              "PENDING",
              "PROCESSING",
              "APPROVED",
              "SCHEDULED",
              "PENDING_BANK_TRANSFER",
            ],
          },
        },
        {
          $set: {
            status: "REJECTED",
            processedAt: now,
            processedBy: adminId,
            reviewNote: body.note.trim(),
          },
          $push: {
            auditLogs: {
              action: "REJECTED",
              actorId: adminId,
              actorRole: "ADMIN",
              note: body.note.trim(),
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" },
      );

      if (!payout) {
        const existing = await Payout.findById(payoutId).session(session);
        if (!existing) throw payoutNotFound();
        if (existing.status === "COMPLETED") {
          throw new AppError(
            "Cannot reject an already completed payout",
            "PAYOUT_ALREADY_COMPLETED",
            400,
          );
        }
        throw new AppError(
          "Payout has already been processed",
          "PAYOUT_ALREADY_PROCESSED",
          409,
        );
      }

      await TeacherEarning.updateMany(
        { payoutId: payout._id },
        {
          $set: { payoutId: null },
          $push: {
            settlementAuditTrail: {
              action: "PAYOUT_RELEASED",
              note: `Released from rejected Payout #${payout._id}: ${body.note}`,
              timestamp: now,
            },
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (lockedDueToDispute) {
    throw new AppError(
      "Khoản chi trả đã bị khóa do phát sinh tranh chấp/khiếu nại chưa giải quyết.",
      "PAYOUT_LOCKED_FOR_DISPUTE",
      400
    );
  }

  await notify(
    payout.teacherId,
    "Yêu cầu rút tiền bị từ chối",
    `Lý do: ${body.note}. Số dư đã được hoàn lại về trạng thái khả dụng.`,
    "PAYOUT_REJECTED",
  );

  return present(payout.toObject());
};

/**
 * Four-Eyes Principle / Independent verification of bank transfer proof.
 * Verifies that the bank reference is valid and transitions Payout to COMPLETED.
 */
const verifyPayoutProof = async (verifierAdminId, payoutId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  const now = options.now instanceof Date ? options.now : new Date();

  const session = await mongoose.startSession();
  let payout;
  let lockedDueToDispute = false;
  try {
    await session.withTransaction(async () => {
      const existing = await Payout.findById(payoutId).session(session);
      if (!existing) throw payoutNotFound();
      if (existing.status === "COMPLETED") {
        payout = existing;
        return;
      }
      if (
        existing.status !== "AWAITING_BANK_VERIFICATION" &&
        existing.status !== "PENDING_BANK_TRANSFER" &&
        existing.status !== "APPROVED" &&
        existing.status !== "SCHEDULED"
      ) {
        throw new AppError("Payout is not awaiting bank verification", "INVALID_PAYOUT_STATUS", 400);
      }

      // Validation of verifier identity & active admin role (PR10 Hardening)
      if (!verifierAdminId || !mongoose.isValidObjectId(verifierAdminId)) {
        throw new AppError("Người xác minh không hợp lệ (INVALID_VERIFIER_IDENTITY)", "INVALID_VERIFIER_IDENTITY", 400);
      }
      const verifier = await User.findById(verifierAdminId).session(session);
      if (!verifier || verifier.role !== "ADMIN" || verifier.status !== "ACTIVE") {
        throw new AppError("Người xác minh phải là Quản trị viên đang hoạt động", "FORBIDDEN_VERIFIER", 403);
      }

      const bankRef = body.bankReference || (existing.bankTransferProof && existing.bankTransferProof.referenceNumber);
      if (!bankRef) {
        throw new AppError("bankReference is required to verify payout", "BANK_TRANSFER_PROOF_REQUIRED", 400);
      }

      // Check approver / submitter identity: must not be missing (fail-closed)
      const approverId = existing.approvedBy || existing.processedBy;
      const submitterId = existing.bankTransferProof && existing.bankTransferProof.submittedBy;

      if (!approverId && !submitterId) {
        throw new AppError(
          "Không xác định được danh tính người phê duyệt hoặc nộp chứng từ (MISSING_APPROVER_IDENTITY). Không thể xác minh.",
          "MISSING_APPROVER_IDENTITY",
          400
        );
      }

      // Four-Eyes check: verifier should not be the same admin who approved/submitted proof
      const shouldEnforceFourEyes =
        options.enforceDifferentAdmin !== undefined
          ? Boolean(options.enforceDifferentAdmin)
          : true;

      if (
        shouldEnforceFourEyes &&
        ((approverId && String(approverId) === String(verifierAdminId)) ||
          (submitterId && String(submitterId) === String(verifierAdminId)))
      ) {
        throw new AppError(
          "Người xác minh chứng từ ngân hàng phải độc lập với người phê duyệt chi trả (Four-Eyes Principle).",
          "DUAL_VERIFICATION_REQUIRED",
          403
        );
      }

      const trimmedRef = String(bankRef).trim();
      await claimBankProof({
        bankReference: trimmedRef,
        bankName: existing.bankAccount?.bankName || "UNKNOWN",
        entityType: "PAYOUT",
        entityId: payoutId,
        amount: existing.amount,
        accountNumber: existing.bankAccount?.accountNumber,
        accountHolderName: existing.bankAccount?.accountHolderName,
        adminId: verifierAdminId,
        session,
        isVerified: true,
        now,
      });

      await verifyBankProof({
        bankReference: trimmedRef,
        entityType: "PAYOUT",
        entityId: payoutId,
        verifierAdminId,
        session,
        now,
      });

      payout = await Payout.findOneAndUpdate(
        { _id: payoutId },
        {
          $set: {
            status: "COMPLETED",
            processedAt: now,
            "bankTransferProof.verifiedBy": verifierAdminId,
            "bankTransferProof.verifiedAt": now,
            "bankTransferProof.referenceNumber": trimmedRef,
            "bankTransferProof.bankReference": trimmedRef,
          },
          $push: {
            auditLogs: {
              action: "VERIFIED_COMPLETED",
              actorId: verifierAdminId,
              actorRole: "ADMIN",
              note: `Bank proof independently verified. Reference: ${trimmedRef}.`,
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" }
      );

      await TeacherEarning.updateMany(
        { payoutId: payout._id },
        {
          $set: { status: "PAID_OUT" },
          $push: {
            settlementAuditTrail: {
              action: "PAID_OUT",
              note: `Disbursed via Payout #${payout._id} with verified bank ref ${trimmedRef}`,
              timestamp: now,
            },
          },
        },
        { session }
      );

      if (TeacherSettlement) {
        const attachedEarnings = await TeacherEarning.find({ payoutId: payout._id }).select("_id").session(session);
        await TeacherSettlement.updateMany(
          { earningId: { $in: attachedEarnings.map((e) => e._id) } },
          { $set: { status: "PAID_OUT" } },
          { session }
        );
      }

      await Transaction.create(
        [
          {
            transactionType: "TEACHER_PAYOUT",
            sourceUserId: verifierAdminId,
            destinationUserId: payout.teacherId,
            amount: payout.amount,
            status: "COMPLETED",
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  if (lockedDueToDispute) {
    throw new AppError(
      "Khoản chi trả đã bị khóa do phát sinh tranh chấp/khiếu nại chưa giải quyết.",
      "PAYOUT_LOCKED_FOR_DISPUTE",
      400
    );
  }

  await notify(
    payout.teacherId,
    "Đã xác minh và chuyển tiền rút",
    `Khoản rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ đã được xác minh thành công.`,
    "PAYOUT_COMPLETED"
  );

  return present(payout.toObject ? payout.toObject() : payout);
};

module.exports = {
  requestPayout,
  listMyPayouts,
  adminListPayouts,
  getPayoutById,
  approvePayout,
  completePayout,
  verifyPayoutProof,
  rejectPayout,
  getNextFriday,
};
