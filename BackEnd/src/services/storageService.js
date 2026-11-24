const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { AppError } = require("../utils/errors");
const { validationError } = require("../utils/http");
const { getSecret } = require("../utils/secrets");

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

// What clients may upload. Recording keys are only ever created by the backend when a session starts.
const PRIVATE_PURPOSES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF", "INCIDENT_EVIDENCE", "SESSION_MATERIAL"];
const PUBLIC_PURPOSES = ["AVATAR", "COVER_IMAGE"];
const MAX_PRIVATE_SIZE = 10 * 1024 * 1024;
const MAX_PUBLIC_SIZE = 5 * 1024 * 1024;
// Slides with pictures are bigger than scanned documents
const MAX_MATERIAL_SIZE = 20 * 1024 * 1024;
const MAX_UPLOAD_SIZE = Math.max(MAX_PRIVATE_SIZE, MAX_MATERIAL_SIZE);

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const DOCUMENT_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };
// Only incident evidence may be a video clip; identity, qualification and scholarship proof stay documents
const PRIVATE_TYPES = { ...DOCUMENT_TYPES, "video/mp4": "mp4" };
// Session materials: documents plus Word and PowerPoint, old (OLE) and new (Office Open XML) formats
const OFFICE_TYPES = {
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const MATERIAL_TYPES = { ...DOCUMENT_TYPES, ...OFFICE_TYPES };
const typesFor = (purpose) =>
  purpose === "INCIDENT_EVIDENCE" ? PRIVATE_TYPES : purpose === "SESSION_MATERIAL" ? MATERIAL_TYPES : DOCUMENT_TYPES;
const sizeFor = (purpose) => (purpose === "SESSION_MATERIAL" ? MAX_MATERIAL_SIZE : MAX_PRIVATE_SIZE);
const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  ...Object.fromEntries(Object.entries(OFFICE_TYPES).map(([mime, extension]) => [extension, mime])),
};
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

const PRIVATE_KEY_PATTERN = /^private\/([a-f0-9]{24})\/([A-Z_]+)\/[a-f0-9-]{36}\.(jpg|png|webp|pdf|mp4|docx?|pptx?)$/;

// The declared mimetype comes from the client: check the real content signature too
const matchesSignature = (buffer, mimeType) => {
  const startsWith = (bytes) => bytes.every((byte, index) => buffer[index] === byte);
  switch (mimeType) {
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/jpeg":
    case "image/jpg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/webp":
      return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    case "video/mp4":
      return buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp"; // ISO base media box
    case "application/msword":
    case "application/vnd.ms-powerpoint":
      return startsWith(OLE_SIGNATURE);
    // A zip holding the part folder of the declared format, not any zip renamed to .docx/.pptx
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWith(ZIP_SIGNATURE) && buffer.includes("word/");
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return startsWith(ZIP_SIGNATURE) && buffer.includes("ppt/");
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
  const extension = validateFile(file, typesFor(purpose), sizeFor(purpose));

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
  return match ? { ownerId: match[1], purpose: match[2], extension: match[3] } : null;
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

// Server-side read of a private file (e.g. OCR). Callers must have authorised access already.
const readPrivateFile = async (storageKey) => {
  const parsed = parsePrivateKey(storageKey);
  if (!parsed) throw new AppError("File not found", "FILE_NOT_FOUND", 404);
  return { buffer: await fs.readFile(path.join(getRoot(), storageKey)), mimeType: MIME_BY_EXTENSION[parsed.extension] };
};

// ---------- Signed URLs ----------

const getUrlSecret = () => getSecret("FILE_URL_SECRET");
const getUrlTtlMs = () => (parseInt(process.env.FILE_URL_TTL_SECONDS, 10) || 300) * 1000;

// Without a name the signed text is unchanged, so URLs issued before names existed stay valid
const sign = (storageKey, expires, name = "") =>
  crypto
    .createHmac("sha256", getUrlSecret())
    .update(name ? `${storageKey}:${expires}:${name}` : `${storageKey}:${expires}`)
    .digest("hex");

// Returns null for keys that do not point to a stored private file (e.g. legacy seed data)
const createSignedUrl = (storageKey, { fileName } = {}) => {
  if (!parsePrivateKey(storageKey)) return null;
  const expires = Date.now() + getUrlTtlMs();
  const name = typeof fileName === "string" ? fileName.slice(0, 200) : "";
  const query = new URLSearchParams({ key: storageKey, expires: String(expires), signature: sign(storageKey, expires, name) });
  if (name) query.set("name", name);
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
const resolveSignedDownload = async ({ key, expires, signature, name = "" }) => {
  const denied = () => new AppError("Invalid or expired file URL", "INVALID_FILE_URL", 403);
  const parsed = parsePrivateKey(key);
  const expiresAt = Number(expires);
  if (!parsed || !Number.isFinite(expiresAt) || typeof signature !== "string") throw denied();

  if (typeof name !== "string") throw denied();
  const expected = sign(key, expiresAt, name);
  const given = Buffer.from(signature);
  const valid = given.length === expected.length && crypto.timingSafeEqual(given, Buffer.from(expected));
  if (!valid || expiresAt <= Date.now()) throw denied();
  if (!(await exists(key))) throw new AppError("File not found", "FILE_NOT_FOUND", 404);

  return { absolutePath: path.join(getRoot(), key), mimeType: MIME_BY_EXTENSION[parsed.extension], fileName: name || null, extension: parsed.extension };
};

module.exports = {
  PRIVATE_PURPOSES,
  PUBLIC_PURPOSES,
  MAX_PRIVATE_SIZE,
  MAX_UPLOAD_SIZE,
  getPublicDir,
  savePrivateFile,
  savePublicFile,
  parsePrivateKey,
  assertOwnedKeys,
  readPrivateFile,
  createSignedUrl,
  mimeTypeOf: (storageKey) => {
    const parsed = parsePrivateKey(storageKey);
    return parsed ? MIME_BY_EXTENSION[parsed.extension] : null;
  },
  withSignedUrls,
  resolveSignedDownload,
};
