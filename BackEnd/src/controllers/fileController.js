const storage = require("../services/storageService");
const { User } = require("../models");
const { getVerifiedTeacher } = require("../services/teacherClassService");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { handle, validationError } = require("../utils/http");
const { getAllowedOrigins } = require("../config/env");

// POST /api/uploads/private (multipart: file, purpose)
exports.uploadPrivate = handle(async (req) => {
  const { purpose } = req.body || {};
  if (!storage.PRIVATE_PURPOSES.includes(purpose)) {
    throw validationError(`purpose must be one of ${storage.PRIVATE_PURPOSES.join(", ")}`);
  }

  if (req.user.role === "TEACHER") {
    if (purpose === "SCHOLARSHIP_PROOF") {
      throw FORBIDDEN("TEACHER cannot upload scholarship proof documents");
    }
    if (purpose === "IDENTITY" || purpose === "QUALIFICATION") {
      const teacher = await User.findById(req.user.id)
        .select("role status isDeleted teacherProfile.verificationStatus")
        .lean();
      if (!teacher || teacher.isDeleted || teacher.role !== "TEACHER") {
        throw FORBIDDEN("Only TEACHER can upload teacher verification documents");
      }
      if (teacher.status !== "ACTIVE") {
        throw new AppError("Teacher account is not active", "ACCOUNT_NOT_ACTIVE", 403);
      }
      const verificationStatus =
        (teacher.teacherProfile && teacher.teacherProfile.verificationStatus) || "UNVERIFIED";
      if (verificationStatus === "PENDING") {
        throw new AppError(
          "A verification submission is already pending review",
          "VERIFICATION_PENDING",
          403
        );
      }
      if (verificationStatus === "VERIFIED") {
        throw new AppError("Teacher is already verified", "ALREADY_VERIFIED", 403);
      }
    }
  }

  return storage.savePrivateFile(req.user.id, purpose, req.file);
}, 201);

// POST /api/uploads/public (multipart: file, purpose)
// Cover images illustrate classes, so only verified Teachers or Admins can publish them
const COVER_IMAGE_ROLES = ["TEACHER", "ADMIN"];
exports.uploadPublic = handle(async (req) => {
  const { purpose } = req.body || {};
  if (purpose === "COVER_IMAGE") {
    if (!COVER_IMAGE_ROLES.includes(req.user.role)) {
      throw FORBIDDEN("Only TEACHER/ADMIN can upload a cover image");
    }
    if (req.user.role === "TEACHER") {
      await getVerifiedTeacher(req.user.id);
    }
  }
  return storage.savePublicFile(purpose, req.file);
}, 201);

// POST /api/files/signed-url { storageKey } — only the owner of the file or an Admin (NFR-04)
exports.createSignedUrl = handle(async (req) => {
  const { storageKey } = req.body || {};
  const parsed = storage.parsePrivateKey(storageKey);
  if (!parsed || (req.user.role !== "ADMIN" && parsed.ownerId !== req.user.id.toString())) {
    throw new AppError("File not found", "FILE_NOT_FOUND", 404);
  }
  if (req.user.role === "TEACHER" && parsed.purpose === "RECORDING") {
    await getVerifiedTeacher(req.user.id);
  }
  return storage.createSignedUrl(storageKey);
});

// GET /api/files/download?key&expires&signature — the signed URL itself is the credential
exports.download = async (req, res, next) => {
  try {
    const { absolutePath, mimeType } = await storage.resolveSignedDownload(req.query);
    res.set({
      "Content-Type": mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // The FE shows documents in an <iframe>; everyone else is still refused
      "Content-Security-Policy": `frame-ancestors ${getAllowedOrigins().join(" ") || "'none'"}`,
    });
    res.removeHeader("X-Frame-Options");
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
};
