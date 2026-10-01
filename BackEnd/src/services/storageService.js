const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { AppError } = require("../utils/errors");
const { validationError } = require("../utils/http");

/**
 * File storage (mục 11.8) on the local disk, split in two areas:
 *  - private/: identity, qualification and scholarship documents. Never served directly —
 *    only through a short-lived signed URL (NFR-04, NFR-14).
 *  - public/: avatars and cover images, served as static files under /uploads.
 * Files are addressed by a storage key, so the driver can later be swapped for an object
 * storage (S3...) without changing what is stored in the database.
 */
const getRoot = () => path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "../../storage"));
const getPublicDir = () => path.join(getRoot(), "public");

const PRIVATE_PURPOSES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"];
const PUBLIC_PURPOSES = ["AVATAR", "COVER_IMAGE"];
const MAX_PRIVATE_SIZE = 10 * 1024 * 1024;
const MAX_PUBLIC_SIZE = 5 * 1024 * 1024;

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PRIVATE_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };
const MIME_BY_EXTENSION = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

const PRIVATE_KEY_PATTERN = /^private\/([a-f0-9]{24})\/[A-Z_]+\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/;

// The declared mimetype comes from the client: check the real content signature too
const matchesSignature = (buffer, mimeType) => {
  const startsWith = (bytes) => bytes.every((byte, index) => buffer[index] === byte);
  switch (mimeType) {
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/webp":
      return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    default:
      return false;
  }
};

const validateFile = (file, allowedTypes, maxSize) => {
  if (!file || !file.buffer || file.buffer.length === 0) throw validationError("file is required");
  if (file.buffer.length > maxSize) {
    throw new AppError(`File is too large (max ${maxSize / 1024 / 1024}MB)`, "FILE_TOO_LARGE", 413);
  }
  const extension = allowedTypes[file.mimetype];
  if (!extension || !matchesSignature(file.buffer, file.mimetype)) {
    throw new AppError(`Unsupported file type. Allowed: ${Object.keys(allowedTypes).join(", ")}`, "UNSUPPORTED_FILE_TYPE", 400);
  }
  return extension;
};

const write = async (key, buffer) => {
  const target = path.join(getRoot(), key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
};

const savePrivateFile = async (userId, purpose, file) => {
  if (!PRIVATE_PURPOSES.includes(purpose)) throw validationError(`purpose must be one of ${PRIVATE_PURPOSES.join(", ")}`);
  const extension = validateFile(file, PRIVATE_TYPES, MAX_PRIVATE_SIZE);

  const storageKey = `private/${userId}/${purpose}/${crypto.randomUUID()}.${extension}`;
  await write(storageKey, file.buffer);
  return { storageKey, mimeType: file.mimetype, size: file.buffer.length, originalName: file.originalname };
};

const savePublicFile = async (purpose, file) => {
  if (!PUBLIC_PURPOSES.includes(purpose)) throw validationError(`purpose must be one of ${PUBLIC_PURPOSES.join(", ")}`);
  const extension = validateFile(file, IMAGE_TYPES, MAX_PUBLIC_SIZE);

  const relativePath = `${purpose.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  await write(`public/${relativePath}`, file.buffer);
  return { url: `${getBaseUrl()}/uploads/${relativePath}`, path: `/uploads/${relativePath}`, mimeType: file.mimetype, size: file.buffer.length };
};

const getBaseUrl = () => (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");

const parsePrivateKey = (storageKey) => {
  const match = typeof storageKey === "string" ? storageKey.match(PRIVATE_KEY_PATTERN) : null;
  return match ? { ownerId: match[1], extension: match[2] } : null;
};

const exists = async (storageKey) => {
  try {
    await fs.access(path.join(getRoot(), storageKey));
    return true;
  } catch {
    return false;
  }
};

/**
 * A document may only reference files its owner uploaded through POST /uploads/private.
 * Prevents attaching someone else's document or an arbitrary path.
 */
const assertOwnedKeys = async (userId, storageKeys) => {
  for (const storageKey of storageKeys) {
    const parsed = parsePrivateKey(storageKey);
    if (!parsed || parsed.ownerId !== userId.toString() || !(await exists(storageKey))) {
      throw Object.assign(validationError("storageKey must reference a file you uploaded through POST /api/uploads/private"), {
        details: { storageKey },
      });
    }
  }
};

// ---------- Signed URLs ----------

const getUrlSecret = () => process.env.FILE_URL_SECRET || process.env.JWT_SECRET || "edunity-dev-file-secret";
const getUrlTtlMs = () => (parseInt(process.env.FILE_URL_TTL_SECONDS, 10) || 300) * 1000;

const sign = (storageKey, expires) =>
  crypto.createHmac("sha256", getUrlSecret()).update(`${storageKey}:${expires}`).digest("hex");

// Returns null for keys that do not point to a stored private file (e.g. legacy seed data)
const createSignedUrl = (storageKey) => {
  if (!parsePrivateKey(storageKey)) return null;
  const expires = Date.now() + getUrlTtlMs();
  const query = new URLSearchParams({ key: storageKey, expires: String(expires), signature: sign(storageKey, expires) });
  return { url: `${getBaseUrl()}/api/files/download?${query}`, expiresAt: new Date(expires) };
};

// Adds `url` / `urlExpiresAt` to every file of a list of VerificationDocument objects
const withSignedUrls = (documents) =>
  documents.map((document) => ({
    ...document,
    files: (document.files || []).map((file) => {
      const signed = createSignedUrl(file.storageKey);
      return { ...file, url: signed ? signed.url : null, urlExpiresAt: signed ? signed.expiresAt : null };
    }),
  }));

/**
 * Validates a signed download request and returns the file to stream.
 * The signature is the only credential: whoever was given the URL can read the file until it expires.
 */
const resolveSignedDownload = async ({ key, expires, signature }) => {
  const denied = () => new AppError("Invalid or expired file URL", "INVALID_FILE_URL", 403);
  const parsed = parsePrivateKey(key);
  const expiresAt = Number(expires);
  if (!parsed || !Number.isFinite(expiresAt) || typeof signature !== "string") throw denied();

  const expected = sign(key, expiresAt);
  const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid || expiresAt <= Date.now()) throw denied();
  if (!(await exists(key))) throw new AppError("File not found", "FILE_NOT_FOUND", 404);

  return { absolutePath: path.join(getRoot(), key), mimeType: MIME_BY_EXTENSION[parsed.extension] };
};

module.exports = {
  PRIVATE_PURPOSES,
  PUBLIC_PURPOSES,
  MAX_PRIVATE_SIZE,
  getPublicDir,
  savePrivateFile,
  savePublicFile,
  parsePrivateKey,
  assertOwnedKeys,
  createSignedUrl,
  withSignedUrls,
  resolveSignedDownload,
};
