const storage = require("../services/storageService");
const { AppError } = require("../utils/errors");
const { handle } = require("../utils/http");

// POST /api/uploads/private (multipart: file, purpose)
exports.uploadPrivate = handle((req) => storage.savePrivateFile(req.user.id, (req.body || {}).purpose, req.file), 201);

// POST /api/uploads/public (multipart: file, purpose)
exports.uploadPublic = handle((req) => storage.savePublicFile((req.body || {}).purpose, req.file), 201);

// POST /api/files/signed-url { storageKey } — only the owner of the file or an Admin (NFR-04)
exports.createSignedUrl = handle((req) => {
  const { storageKey } = req.body || {};
  const parsed = storage.parsePrivateKey(storageKey);
  if (!parsed || (req.user.role !== "ADMIN" && parsed.ownerId !== req.user.id.toString())) {
    throw new AppError("File not found", "FILE_NOT_FOUND", 404);
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
    });
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
};
