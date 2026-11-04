const mongoose = require("mongoose");
const { Payout, TeacherEarning, Transaction, User } = require("../models");
const { AppError } = require("../utils/errors");
const { validationError, isBlank, paged } = require("../utils/http");
const { toNum, toDec } = require("../utils/money");
const { notify, notifyAdmins } = require("./notificationService");
const { serializeDecimal128 } = require("../utils/serialize");

const payoutNotFound = () => new AppError("Payout not found", "PAYOUT_NOT_FOUND", 404);

const present = (payout) => serializeDecimal128({ ...payout, id: payout._id.toString() });

/**
 * F02 — Teacher requests a payout of every AVAILABLE earning not yet attached to a payout.
 * Earnings become AVAILABLE when their class is COMPLETED (classLifecycleService). The bank details are snapshotted
 * on the Payout. Attaching the earnings is conditional on payoutId: null, so two concurrent requests cannot both
 * claim the same earning.
 */
const requestPayout = async (teacherId, body = {}) => {
  const { bankName, accountNumber, accountHolderName } = body;
  if (isBlank(bankName) || isBlank(accountNumber) || isBlank(accountHolderName)) {
    throw validationError("bankName, accountNumber and accountHolderName are required");
  }
  if (await Payout.exists({ teacherId, status: { $in: ["PENDING", "PROCESSING"] } })) {
    throw new AppError("You already have a payout request being processed", "PAYOUT_ALREADY_PENDING", 409);
  }

  const session = await mongoose.startSession();
  let payout;
  try {
    await session.withTransaction(async () => {
      const earnings = await TeacherEarning.find({ teacherId, status: "AVAILABLE", payoutId: null }).session(session);
      const amount = earnings.reduce((sum, e) => sum + toNum(e.netAmount), 0);
      if (!earnings.length || amount <= 0) {
        throw new AppError("There is no available earning to pay out", "NO_AVAILABLE_EARNINGS", 409);
      }

      [payout] = await Payout.create(
        [
          {
            teacherId,
            amount: toDec(amount),
            status: "PENDING",
            bankAccountSnapshot: {
              bankName: bankName.trim(),
              accountNumber: String(accountNumber).trim(),
              accountHolderName: accountHolderName.trim(),
            },
          },
        ],
        { session }
      );

      const attached = await TeacherEarning.updateMany(
        { _id: { $in: earnings.map((e) => e._id) }, status: "AVAILABLE", payoutId: null },
        { $set: { payoutId: payout._id } },
        { session }
      );
      if (attached.modifiedCount !== earnings.length) {
        throw new AppError("Earnings changed while requesting the payout; please retry", "PAYOUT_CONFLICT", 409);
      }
    });
  } finally {
    await session.endSession();
  }

  await notifyAdmins(
    "Yêu cầu rút tiền mới",
    `Giáo viên yêu cầu rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ.`,
    "PAYOUT_REQUESTED"
  );
  return present(payout.toObject());
};

const listMyPayouts = async (teacherId) => {
  const payouts = await Payout.find({ teacherId }).sort({ requestedAt: -1 }).lean();
  return payouts.map(present);
};

const adminListPayouts = async (query = {}, paging) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Payout.find(filter).sort({ requestedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Payout.countDocuments(filter),
  ]);
  const teachers = await User.find({ _id: { $in: items.map((p) => p.teacherId) } })
    .select("email teacherProfile.fullName")
    .lean();
  const byId = new Map(teachers.map((t) => [t._id.toString(), t]));
  return paged(
    items.map((p) => {
      const teacher = byId.get(p.teacherId.toString());
      return { ...present(p), teacherName: teacher?.teacherProfile?.fullName || null, teacherEmail: teacher?.email || null };
    }),
    total,
    paging
  );
};

/**
 * Admin confirms the bank transfer was made: the Payout is COMPLETED, its earnings PAID_OUT, and a TEACHER_PAYOUT
 * ledger entry is written.
 */
const completePayout = async (adminId, payoutId, body = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  const session = await mongoose.startSession();
  let payout;
  try {
    await session.withTransaction(async () => {
      payout = await Payout.findOneAndUpdate(
        { _id: payoutId, status: { $in: ["PENDING", "PROCESSING"] } },
        { $set: { status: "COMPLETED", processedAt: new Date(), processedBy: adminId, reviewNote: body.note || null } },
        { session, returnDocument: "after" }
      );
      if (!payout) {
        if (!(await Payout.exists({ _id: payoutId }).session(session))) throw payoutNotFound();
        throw new AppError("Payout has already been processed", "PAYOUT_ALREADY_PROCESSED", 409);
      }
      await TeacherEarning.updateMany({ payoutId: payout._id }, { $set: { status: "PAID_OUT" } }, { session });
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
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  await notify(
    payout.teacherId,
    "Đã chuyển tiền rút",
    `Khoản rút ${toNum(payout.amount).toLocaleString("vi-VN")}đ đã được chuyển vào tài khoản của bạn.`,
    "PAYOUT_COMPLETED"
  );
  return present(payout.toObject());
};

// Admin rejects (e.g. wrong bank details): the earnings are released so the Teacher can request again
const rejectPayout = async (adminId, payoutId, body = {}) => {
  if (!mongoose.isValidObjectId(payoutId)) throw payoutNotFound();
  if (isBlank(body.note)) throw validationError("note is required to reject a payout");
  const session = await mongoose.startSession();
  let payout;
  try {
    await session.withTransaction(async () => {
      payout = await Payout.findOneAndUpdate(
        { _id: payoutId, status: { $in: ["PENDING", "PROCESSING"] } },
        { $set: { status: "REJECTED", processedAt: new Date(), processedBy: adminId, reviewNote: body.note } },
        { session, returnDocument: "after" }
      );
      if (!payout) {
        if (!(await Payout.exists({ _id: payoutId }).session(session))) throw payoutNotFound();
        throw new AppError("Payout has already been processed", "PAYOUT_ALREADY_PROCESSED", 409);
      }
      await TeacherEarning.updateMany({ payoutId: payout._id }, { $set: { payoutId: null } }, { session });
    });
  } finally {
    await session.endSession();
  }
  await notify(
    payout.teacherId,
    "Yêu cầu rút tiền bị từ chối",
    `Lý do: ${body.note}. Bạn có thể gửi lại yêu cầu.`,
    "PAYOUT_REJECTED"
  );
  return present(payout.toObject());
};

module.exports = { requestPayout, listMyPayouts, adminListPayouts, completePayout, rejectPayout };
