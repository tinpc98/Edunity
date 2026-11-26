const mongoose = require("mongoose");
const { Schema } = mongoose;

// TEA-12 + eContract lifecycle.
// ACTIVE represents a signed and currently in-force contract (lifecycleStatus: "SIGNED");
// EXPIRED is derived when an ACTIVE/SIGNED contract passes expiresAt.
const TEACHER_CONTRACT_STATUSES = [
  "DRAFT",
  "PENDING_SIGNATURE",
  "ACTIVE",
  "SIGNED",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
  "TERMINATED",
  "EXPIRED",
];

const historyEntrySchema = new Schema(
  {
    action: { type: String, required: true }, // CREATED, SENT, VIEWED, SIGNED, DECLINED, REJECTED, CANCELLED, TERMINATED
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, required: true },
    note: { type: String, default: null, maxlength: 2000 },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const contractPdfFileSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: "application/pdf" },
    size: { type: Number, required: true },
    sha256Hash: { type: String, required: true },
    pageCount: { type: Number, default: 1 },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const contractSignatureSchema = new Schema(
  {
    signerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    signerName: { type: String, default: null },
    signerEmail: { type: String, default: null },
    signingMethod: {
      type: String,
      enum: ["DRAWN_SIGNATURE", "TYPED_SIGNATURE", "CLICK_TO_SIGN", "WEBHOOK"],
      default: "CLICK_TO_SIGN",
    },
    signatureText: { type: String, default: null, maxlength: 200 },
    signatureDataUrl: { type: String, default: null, maxlength: 250000 },
    readConfirmed: { type: Boolean, default: true },
    agreedToTerms: { type: Boolean, default: true },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    signedAt: { type: Date, required: true },
    documentHashAtSigning: { type: String, default: null },
    finalDocumentHash: { type: String, default: null },
  },
  { _id: false }
);

const contractAuditEntrySchema = new Schema(
  {
    eventType: { type: String, required: true }, // CONTRACT_CREATED, CONTRACT_PDF_GENERATED, CONTRACT_SENT_TO_TEACHER, CONTRACT_VIEWED, CONTRACT_SIGNED, CONTRACT_CANCELLED, CONTRACT_REJECTED, CONTRACT_TERMINATED, CONTRACT_PDF_DOWNLOADED
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, default: "SYSTEM" },
    timestamp: { type: Date, required: true, default: Date.now },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    signingMethod: { type: String, default: null },
    documentHash: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const teacherContractSchema = new Schema(
  {
    contractCode: { type: String, required: true, unique: true },
    verificationCode: { type: String, default: null },
    contractType: { type: String, default: "TEACHER_COOPERATION" },
    templateVersion: { type: String, default: "EDUNITY-ECONTRACT-V1.0" },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: TEACHER_CONTRACT_STATUSES, default: "PENDING_SIGNATURE" },
    effectiveFrom: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    provider: {
      name: {
        type: String,
        enum: ["SANDBOX", "FPT_ECONTRACT", "INTERNAL_ECONTRACT"],
        required: true,
      },
      envelopeId: { type: String, required: true },
    },

    // Immutable snapshot of Company, Teacher, Revenue Sharing (90/10) and Clauses at creation time
    snapshot: { type: Schema.Types.Mixed, default: null },

    // Two distinct PDF documents: initial pending PDF and final signed PDF (never overwrites initialPdf)
    initialPdf: { type: contractPdfFileSchema, default: null },
    signedPdf: { type: contractPdfFileSchema, default: null },
    documentHash: { type: String, default: null },

    // Electronic signing evidence
    signature: { type: contractSignatureSchema, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Admin
    sentAt: { type: Date, required: true },
    viewedAt: { type: Date, default: null },
    signedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    terminatedAt: { type: Date, default: null },
    terminatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    terminationReason: { type: String, default: null, maxlength: 2000 },

    history: { type: [historyEntrySchema], default: [] },
    auditLogs: { type: [contractAuditEntrySchema], default: [] },
  },
  { timestamps: true }
);

teacherContractSchema.index({ "provider.envelopeId": 1 }, { unique: true });
teacherContractSchema.index({ verificationCode: 1 }, { sparse: true });
teacherContractSchema.index({ teacherId: 1, status: 1, expiresAt: -1 });
// At most one contract awaiting signature per teacher, also under concurrent admin requests
teacherContractSchema.index(
  { teacherId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING_SIGNATURE" },
    name: "one_pending_contract_per_teacher",
  }
);

module.exports = mongoose.model("TeacherContract", teacherContractSchema);
module.exports.TEACHER_CONTRACT_STATUSES = TEACHER_CONTRACT_STATUSES;
