const { User } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, validationError, isBlank, paged } = require("../utils/http");
const pii = require("../utils/pii");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

/**
 * BAO-09: the single bank account a teacher's payouts go to.
 * - the holder name must match the CCCD name the teacher declared (BAO-02)
 * - every change goes back to Admin review and locks payouts for PAYOUT_LOCK_HOURS, so a hijacked
 *   account cannot redirect money before the teacher notices the notification
 */
const PAYOUT_LOCK_HOURS = 72;
const NOT_DELETED = { isDeleted: { $ne: true } };

const present = (account, { full = false } = {}) =>
  account
    ? {
        bankName: account.bankName,
        accountNumberMasked: pii.maskTail(`000000${account.accountNumberLast4}`).slice(-10),
        ...(full ? { accountNumber: pii.decrypt(account.accountNumberEnc) } : {}),
        accountHolderName: account.accountHolderName,
        status: account.status,
        submittedAt: account.submittedAt,
        payoutLockedUntil: account.payoutLockedUntil,
        reviewedAt: account.reviewedAt,
        reviewNote: account.reviewNote,
      }
    : null;

const getTeacher = async (teacherId) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED });
  if (!teacher || !teacher.teacherProfile) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);
  return teacher;
};

// ---------- Teacher ----------

const getMyBankAccount = async (teacherId) => present((await getTeacher(teacherId)).teacherProfile.bankAccount);

const submitBankAccount = async (teacherId, body = {}) => {
  const teacher = await getTeacher(teacherId);
  const profile = teacher.teacherProfile;
  if (profile.verificationStatus !== "VERIFIED") throw FORBIDDEN("Only a verified teacher can register a payout account");
  if (!profile.identity) {
    throw new AppError("Declare your CCCD identity (re-verification) before registering a bank account", "IDENTITY_REQUIRED", 409);
  }

  const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
  if (!bankName || bankName.length > 100) throw validationError("bankName is required (max 100 characters)");
  const accountNumber = String(body.accountNumber || "").replace(/\s/g, "");
  if (!/^\d{6,20}$/.test(accountNumber)) throw validationError("accountNumber must be 6 to 20 digits");
  const accountHolderName = typeof body.accountHolderName === "string" ? body.accountHolderName.trim() : "";
  if (!accountHolderName) throw validationError("accountHolderName is required");
  if (pii.normalizePersonName(accountHolderName) !== pii.normalizePersonName(profile.identity.fullName)) {
    throw new AppError("The account holder must be the teacher named on the CCCD", "BANK_HOLDER_NAME_MISMATCH", 400);
  }

  const now = new Date();
  profile.bankAccount = {
    bankName,
    accountNumberEnc: pii.encrypt(accountNumber),
    accountNumberLast4: accountNumber.slice(-4),
    accountHolderName: pii.normalizePersonName(accountHolderName),
    status: "PENDING_REVIEW",
    submittedAt: now,
    payoutLockedUntil: new Date(now.getTime() + PAYOUT_LOCK_HOURS * 60 * 60 * 1000),
  };
  await teacher.save();

  await notify(
    teacher._id,
    "Tài khoản nhận tiền đã thay đổi",
    `Tài khoản ${bankName} đuôi ${accountNumber.slice(-4)} chờ Edunity duyệt. Nếu không phải bạn thay đổi, hãy liên hệ ngay.`,
    "TEACHER_BANK_ACCOUNT_CHANGED"
  );
  await notifyAdmins("Tài khoản ngân hàng giáo viên chờ duyệt", `${profile.fullName} đã đăng ký tài khoản nhận tiền.`, "TEACHER_BANK_ACCOUNT_SUBMITTED");
  return present(profile.bankAccount);
};

// ---------- Admin ----------

const adminListBankAccounts = async (query, paging) => {
  const status = query.status || "PENDING_REVIEW";
  if (!["PENDING_REVIEW", "VERIFIED", "REJECTED"].includes(status)) throw validationError("status is invalid");
  const filter = { role: "TEACHER", "teacherProfile.bankAccount.status": status, ...NOT_DELETED };
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ "teacherProfile.bankAccount.submittedAt": 1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .select("email teacherProfile.fullName teacherProfile.identity.fullName teacherProfile.bankAccount")
      .lean(),
    User.countDocuments(filter),
  ]);
  // Admins check the full number against the bank before approving, as they do for payouts
  return paged(
    items.map((teacher) => ({
      teacherId: teacher._id.toString(),
      email: teacher.email,
      fullName: teacher.teacherProfile.fullName,
      identityName: teacher.teacherProfile.identity ? teacher.teacherProfile.identity.fullName : null,
      bankAccount: present(teacher.teacherProfile.bankAccount, { full: true }),
    })),
    total,
    paging
  );
};

const adminReviewBankAccount = async (adminId, teacherId, body = {}, decision) => {
  if (decision === "REJECTED" && isBlank(body.reviewNote)) throw validationError("reviewNote is required when rejecting");
  const teacher = await getTeacher(teacherId);
  const account = teacher.teacherProfile.bankAccount;
  if (!account || account.status !== "PENDING_REVIEW") {
    throw new AppError("No bank account awaiting review", "BANK_ACCOUNT_NOT_PENDING", 409);
  }

  const now = new Date();
  // Conditional on the exact submission reviewed: a change made meanwhile is not approved by accident
  const updated = await User.updateOne(
    { _id: teacher._id, "teacherProfile.bankAccount.status": "PENDING_REVIEW", "teacherProfile.bankAccount.submittedAt": account.submittedAt },
    {
      $set: {
        "teacherProfile.bankAccount.status": decision,
        "teacherProfile.bankAccount.reviewedBy": adminId,
        "teacherProfile.bankAccount.reviewedAt": now,
        "teacherProfile.bankAccount.reviewNote": body.reviewNote || null,
      },
    }
  );
  if (updated.modifiedCount !== 1) throw new AppError("The bank account changed, reload and retry", "BANK_ACCOUNT_CHANGED", 409);

  await audit({
    actorAdminId: adminId,
    action: decision === "VERIFIED" ? "TEACHER_BANK_ACCOUNT_VERIFIED" : "TEACHER_BANK_ACCOUNT_REJECTED",
    targetType: "User",
    targetId: teacher._id,
    afterState: { bankName: account.bankName, accountNumberLast4: account.accountNumberLast4, reviewNote: body.reviewNote || null },
  });
  await notify(
    teacher._id,
    decision === "VERIFIED" ? "Tài khoản nhận tiền đã được duyệt" : "Tài khoản nhận tiền bị từ chối",
    decision === "VERIFIED"
      ? `Bạn có thể rút tiền về tài khoản này từ ${account.payoutLockedUntil.toLocaleString("vi-VN")}.`
      : body.reviewNote,
    decision === "VERIFIED" ? "TEACHER_BANK_ACCOUNT_VERIFIED" : "TEACHER_BANK_ACCOUNT_REJECTED"
  );
  return present((await getTeacher(teacherId)).teacherProfile.bankAccount, { full: true });
};

// ---------- Payout port ----------

// The only source of payout bank details: a VERIFIED account past its change lock. Never client input.
const resolvePayoutAccount = async (teacherId, now = new Date()) => {
  const teacher = await User.findById(teacherId).select("teacherProfile.bankAccount").lean();
  const account = teacher && teacher.teacherProfile && teacher.teacherProfile.bankAccount;
  if (!account || account.status !== "VERIFIED") {
    throw new AppError("Register a bank account and wait for Edunity to verify it before requesting a payout", "BANK_ACCOUNT_NOT_VERIFIED", 409);
  }
  if (new Date(account.payoutLockedUntil) > now) {
    const err = new AppError("Payouts are paused after a bank account change", "BANK_ACCOUNT_RECENTLY_CHANGED", 409);
    err.details = { payoutLockedUntil: account.payoutLockedUntil };
    throw err;
  }
  return { bankName: account.bankName, accountNumber: pii.decrypt(account.accountNumberEnc), accountHolderName: account.accountHolderName };
};

module.exports = {
  PAYOUT_LOCK_HOURS,
  getMyBankAccount,
  submitBankAccount,
  adminListBankAccounts,
  adminReviewBankAccount,
  resolvePayoutAccount,
};
