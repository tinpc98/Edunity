/**
 * CCCD OCR port (BAO-03), same mode rule as econtractProvider:
 *  - FPT_OCR_ENABLED=true -> FPT.AI ID Recognition (not wired yet: reports UNAVAILABLE)
 *  - development/test otherwise -> SANDBOX: "reads" back the declared values, as a perfect OCR would
 * OCR only assists the Admin: it never blocks a submission and never approves anything by itself.
 */
const SANDBOX_ENVS = ["development", "test"];
const READABLE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const isRealEnabled = () => String(process.env.FPT_OCR_ENABLED || "").trim().toLowerCase() === "true";
const getMode = () => (isRealEnabled() ? "FPT_AI" : SANDBOX_ENVS.includes(process.env.NODE_ENV) ? "SANDBOX" : null);

/**
 * Returns { provider, fields: { fullName, idNumber, dateOfBirth, expiryDate } } or { provider, unavailable: reason }.
 * `declared` is only used by the sandbox.
 */
const recognizeIdCard = async ({ buffer, mimeType, declared }) => {
  const mode = getMode();
  if (!mode) return { provider: null, unavailable: "OCR provider is not configured" };
  if (!READABLE_TYPES.includes(mimeType) || !buffer) return { provider: mode, unavailable: "Front side is not an image" };
  if (mode === "SANDBOX") {
    return {
      provider: mode,
      fields: { fullName: declared.fullName, idNumber: declared.idNumber, dateOfBirth: declared.dateOfBirth, expiryDate: declared.expiryDate || null },
    };
  }
  // shortcut: FPT.AI IDR call (POST /vision/idr/vnm with api-key) not implemented, needs credentials to test; until then real mode is UNAVAILABLE
  return { provider: mode, unavailable: "FPT.AI OCR integration is not implemented yet" };
};

module.exports = { getMode, recognizeIdCard };
