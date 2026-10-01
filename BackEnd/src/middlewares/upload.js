const multer = require("multer");
const { AppError } = require("../utils/errors");
const { MAX_PRIVATE_SIZE } = require("../services/storageService");

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRIVATE_SIZE, files: 1 },
});

// Parses a single multipart file field named "file" into req.file (kept in memory, validated by storageService)
const singleFile = (req, res, next) => {
  uploader.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      return next(
        new AppError(
          tooLarge ? `File is too large (max ${MAX_PRIVATE_SIZE / 1024 / 1024}MB)` : "Upload exactly one file in the \"file\" field",
          tooLarge ? "FILE_TOO_LARGE" : "VALIDATION_ERROR",
          tooLarge ? 413 : 400
        )
      );
    }
    next(err);
  });
};

module.exports = { singleFile };
