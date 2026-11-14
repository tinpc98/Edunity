const mongoose = require("mongoose");
const { User, VerificationDocument } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { paged, validationError, isBlank, parseDate } = require("../utils/http");
const { audit } = require("./auditService");
const storage = require("./storageService");
const { notify, notifyAdmins } = require("./notificationService");
const { withoutReviewer } = require("../utils/publicView");
const pii = require("../utils/pii");

const NOT_DELETED = { isDeleted: { $ne: true } };
const TEACHER_DOCUMENT_TYPES = ["IDENTITY", "QUALIFICATION"];
const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"];
const FILE_SIDES = ["FRONT", "BACK", "SINGLE"];

const MIN_TEACHER_AGE = 18;
const identityNumberInUse = () =>
  new AppError("This CCCD number is already used by another account", "IDENTITY_NUMBER_IN_USE", 409);

// BAO-02: the identity as printed on the CCCD. Returns the stored (encrypted) shape.
const parseIdentity = (identity, now = new Date()) => {
  if (!identity || typeof identity !== "object") throw validationError("identity is required");
  const fullName = typeof identity.fullName === "string" ? identity.fullName.trim() : "";
  if (!fullName || fullName.length > 100) throw validationError("identity.fullName is required (max 100 characters)");

  const idNumber = String(identity.idNumber || "").trim();
  if (!/^\d{12}$/.test(idNumber)) throw validationError("identity.idNumber must be the 12-digit CCCD number");

  const address = typeof identity.address === "string" ? identity.address.trim() : "";
  if (!address || address.length > 300) throw validationError("identity.address is required (max 300 characters)");

  const dateOfBirth = parseDate(identity.dateOfBirth, "identity.dateOfBirth");
  if (!dateOfBirth) throw validationError("identity.dateOfBirth is required");
  const adultSince = new Date(dateOfBirth);
  adultSince.setFullYear(adultSince.getFullYear() + MIN_TEACHER_AGE);
  if (adultSince > now) throw validationError(`Teachers must be at least ${MIN_TEACHER_AGE} years old`);

  const issueDate = parseDate(identity.issueDate, "identity.issueDate");
  if (issueDate && (issueDate > now || issueDate < dateOfBirth)) throw validationError("identity.issueDate is invalid");
  const expiryDate = parseDate(identity.expiryDate, "identity.expiryDate");
  if (expiryDate && expiryDate <= now) throw new AppError("The CCCD has expired", "IDENTITY_DOCUMENT_EXPIRED", 400);

  return {
    fullName,
    dateOfBirth,
    idNumberEnc: pii.encrypt(idNumber),
    idNumberHash: pii.blindIndex(idNumber),
    idNumberLast4: idNumber.slice(-4),
    addressEnc: pii.encrypt(address),
    issueDate,
    expiryDate,
    submittedAt: now,
  };
};

// Never the full number or address: those are only shown through adminRevealIdentity, which is audited
const presentIdentity = (identity) =>
  identity
    ? {
        fullName: identity.fullName,
        dateOfBirth: identity.dateOfBirth,
        idNumberMasked: `********${identity.idNumberLast4}`,
        addressMasked: pii.maskAddress(pii.decrypt(identity.addressEnc)),
        issueDate: identity.issueDate,
        expiryDate: identity.expiryDate,
      }
    : null;

const teacherNotFound = () => new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);

const getTeacher = async (teacherId) => {
  if (!mongoose.isValidObjectId(teacherId)) throw teacherNotFound();
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED });
  if (!teacher || !teacher.teacherProfile) throw teacherNotFound();
  return teacher;
};

// Only private storage keys are stored — never a public URL (NFR-04, mục 10.22)
const parseDocuments = (documents) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw validationError("documents is required: identity and qualification documents must be uploaded");
  }

  const parsed = documents.map((document, index) => {
    if (!document || !TEACHER_DOCUMENT_TYPES.includes(document.documentType)) {
      throw validationError(`documents[${index}].documentType must be IDENTITY or QUALIFICATION`);
    }
    const files = Array.isArray(document.files) ? document.files : [];
    if (files.length === 0) throw validationError(`documents[${index}].files must contain at least one file`);
    return {
      documentType: document.documentType,
      files: files.map((file) => {
        if (!file || isBlank(file.storageKey)) throw validationError(`documents[${index}]: storageKey is required`);
        if (/^https?:\/\//i.test(file.storageKey)) {
          throw validationError(`documents[${index}]: storageKey must be a private storage key, not a URL`);
        }
        const side = file.side || "SINGLE";
        if (!FILE_SIDES.includes(side)) throw validationError(`documents[${index}]: side is invalid`);
        return { side, storageKey: file.storageKey, mimeType: file.mimeType };
      }),
    };
  });

  // FR-TEA-02 + FR-TEA-03: both identity verification and qualification are required
  const missing = TEACHER_DOCUMENT_TYPES.filter((type) => !parsed.some((document) => document.documentType === type));
  if (missing.length) throw validationError("Missing required documents", { missing });
  return parsed;
};

const presentStatus = async (teacher) => {
  const profile = teacher.teacherProfile;
  const documents = await VerificationDocument.find({
    userId: teacher._id,
    documentType: { $in: TEACHER_DOCUMENT_TYPES },
  })
    .sort({ uploadedAt: -1 })
    .lean();

  return {
    teacherId: teacher._id.toString(),
    email: teacher.email,
    accountStatus: teacher.status,
    fullName: profile.fullName,
    biography: profile.biography,
    qualificationSummary: profile.qualificationSummary,
    identity: presentIdentity(profile.identity),
    verificationStatus: profile.verificationStatus,
    reviewedBy: profile.reviewedBy,
    reviewedAt: profile.reviewedAt,
    reviewNote: profile.reviewNote,
    documents: storage.withSignedUrls(documents), // only the Teacher and Admin reach this view
  };
};

// ---------- Teacher (UC-TEA-01) ----------

const submitVerification = async (teacherId, body) => {
  const teacher = await User.findById(teacherId);
  if (!teacher || teacher.role !== "TEACHER" || !teacher.teacherProfile) {
    throw FORBIDDEN("Only TEACHER can perform this action");
  }
  const current = teacher.teacherProfile.verificationStatus;
  if (current === "VERIFIED") throw new AppError("Teacher is already verified", "ALREADY_VERIFIED", 409);
  if (current === "PENDING") throw new AppError("Verification is already pending review", "VERIFICATION_PENDING", 409);

  const documents = parseDocuments(body.documents);
  const identity = parseIdentity(body.identity);
  if (await User.exists({ _id: { $ne: teacher._id }, "teacherProfile.identity.idNumberHash": identity.idNumberHash })) {
    throw identityNumberInUse();
  }
  await storage.assertOwnedKeys(teacher._id, documents.flatMap((document) => document.files.map((file) => file.storageKey)));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await VerificationDocument.create(
        documents.map((document) => ({ ...document, userId: teacher._id })),
        { session, ordered: true }
      );
      if (body.qualificationSummary !== undefined) teacher.teacherProfile.qualificationSummary = body.qualificationSummary;
      if (body.biography !== undefined) teacher.teacherProfile.biography = body.biography;
      teacher.teacherProfile.identity = identity;
      teacher.teacherProfile.verificationStatus = "PENDING";
      await teacher.save({ session });
    });
  } catch (err) {
    if (err && err.code === 11000 && String(err.message).includes("idNumberHash")) throw identityNumberInUse();
    throw err;
  } finally {
    session.endSession();
  }

  await notifyAdmins("Hồ sơ giáo viên chờ xác minh", `${teacher.teacherProfile.fullName} đã gửi hồ sơ xác minh.`, "TEACHER_VERIFICATION_SUBMITTED");
  return presentStatus(teacher);
};

const getMyVerification = async (teacherId) => withoutReviewer(await presentStatus(await getTeacher(teacherId)));

// ---------- Admin (UC-ADM-01 / FR-ADM-02) ----------

const adminListVerifications = async (query, paging) => {
  const status = query.status || "PENDING";
  if (!VERIFICATION_STATUSES.includes(status)) throw validationError("status is invalid");

  const filter = { role: "TEACHER", "teacherProfile.verificationStatus": status, ...NOT_DELETED };
  const [items, total] = await Promise.all([
    User.find(filter).sort({ updatedAt: 1 }).skip(paging.skip).limit(paging.pageSize).select("email status teacherProfile createdAt updatedAt").lean(),
    User.countDocuments(filter),
  ]);

  return paged(
    items.map((teacher) => ({
      teacherId: teacher._id.toString(),
      email: teacher.email,
      accountStatus: teacher.status,
      fullName: teacher.teacherProfile.fullName,
      qualificationSummary: teacher.teacherProfile.qualificationSummary,
      verificationStatus: teacher.teacherProfile.verificationStatus,
      updatedAt: teacher.updatedAt,
    })),
    total,
    paging
  );
};

const adminGetVerification = async (teacherId) => presentStatus(await getTeacher(teacherId));

// Opening a teacher's dossier shows their identity documents: every view by an Admin is recorded
const adminViewVerification = async (adminId, teacherId) => {
  const teacher = await getTeacher(teacherId);
  await audit({ actorAdminId: adminId, action: "TEACHER_VERIFICATION_VIEWED", targetType: "User", targetId: teacher._id });
  return presentStatus(teacher);
};

// The only way to read the full CCCD number and address; audited with the reason given
const adminRevealIdentity = async (adminId, teacherId, body = {}) => {
  const teacher = await getTeacher(teacherId);
  const identity = teacher.teacherProfile.identity;
  if (!identity) throw new AppError("Teacher has not declared an identity", "IDENTITY_NOT_FOUND", 404);
  if (isBlank(body.reason)) throw validationError("reason is required to reveal identity data");
  await audit({
    actorAdminId: adminId,
    action: "TEACHER_IDENTITY_REVEALED",
    targetType: "User",
    targetId: teacher._id,
    afterState: { reason: String(body.reason).trim().slice(0, 500) },
  });
  return { idNumber: pii.decrypt(identity.idNumberEnc), address: pii.decrypt(identity.addressEnc) };
};

const reviewVerification = async (adminId, teacherId, body, status) => {
  const teacher = await getTeacher(teacherId);
  if (teacher.teacherProfile.verificationStatus !== "PENDING") {
    throw new AppError("Teacher verification is not pending", "VERIFICATION_NOT_PENDING", 409);
  }
  if (status === "REJECTED" && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when rejecting a verification");
  }

  const now = new Date();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await User.updateOne(
        { _id: teacher._id, "teacherProfile.verificationStatus": "PENDING" },
        {
          $set: {
            "teacherProfile.verificationStatus": status,
            "teacherProfile.reviewedBy": adminId,
            "teacherProfile.reviewedAt": now,
            "teacherProfile.reviewNote": body.reviewNote || null,
          },
        },
        { session }
      );
      if (updated.modifiedCount !== 1) {
        throw new AppError("Teacher verification is not pending", "VERIFICATION_NOT_PENDING", 409);
      }

      await VerificationDocument.updateMany(
        { userId: teacher._id, documentType: { $in: TEACHER_DOCUMENT_TYPES }, status: "PENDING" },
        {
          $set: {
            status: status === "VERIFIED" ? "APPROVED" : "REJECTED",
            reviewedBy: adminId,
            reviewedAt: now,
            reviewNote: body.reviewNote || null,
          },
        },
        { session }
      );

      await audit(
        {
          actorAdminId: adminId,
          action: status === "VERIFIED" ? "TEACHER_VERIFIED" : "TEACHER_VERIFICATION_REJECTED",
          targetType: "User",
          targetId: teacher._id,
          beforeState: { verificationStatus: "PENDING" },
          afterState: { verificationStatus: status, reviewNote: body.reviewNote || null },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  if (status === "VERIFIED") {
    await notify(teacher._id, "Hồ sơ giáo viên đã được xác minh", "Bạn có thể tạo lớp học và gửi duyệt.", "TEACHER_VERIFIED");
  } else {
    await notify(teacher._id, "Hồ sơ giáo viên bị từ chối", body.reviewNote, "TEACHER_VERIFICATION_REJECTED");
  }
  return adminGetVerification(teacher._id);
};

const approveVerification = (adminId, teacherId, body) => reviewVerification(adminId, teacherId, body, "VERIFIED");
const rejectVerification = (adminId, teacherId, body) => reviewVerification(adminId, teacherId, body, "REJECTED");

module.exports = {
  submitVerification,
  getMyVerification,
  adminListVerifications,
  adminGetVerification,
  adminViewVerification,
  adminRevealIdentity,
  approveVerification,
  rejectVerification,
};
