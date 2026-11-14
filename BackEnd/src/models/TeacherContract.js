const mongoose = require("mongoose");
const { Schema } = mongoose;

// TEA-12. EXPIRED is not stored: an ACTIVE contract past expiresAt is presented and gated as expired.
const TEACHER_CONTRACT_STATUSES = ["PENDING_SIGNATURE", "ACTIVE", "DECLINED", "CANCELLED", "TERMINATED"];

const historyEntrySchema = new Schema(
  {
    action: { type: String, required: true }, // SENT, SIGNED, DECLINED, CANCELLED, TERMINATED
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // null = the e-contract provider
    actorRole: { type: String, required: true },
    note: { type: String, default: null, maxlength: 2000 },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const teacherContractSchema = new Schema(
  {
    contractCode: { type: String, required: true, unique: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: TEACHER_CONTRACT_STATUSES, default: "PENDING_SIGNATURE" },
    effectiveFrom: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    provider: {
      name: { type: String, enum: ["SANDBOX", "FPT_ECONTRACT"], required: true },
      envelopeId: { type: String, required: true }, // the provider's id for the signing request
    },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Admin
    sentAt: { type: Date, required: true },
    signedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    terminatedAt: { type: Date, default: null },
    terminatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    terminationReason: { type: String, default: null, maxlength: 2000 },

    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

teacherContractSchema.index({ "provider.envelopeId": 1 }, { unique: true });
teacherContractSchema.index({ teacherId: 1, status: 1, expiresAt: -1 });
// At most one contract awaiting signature per teacher, also under concurrent admin requests
teacherContractSchema.index(
  { teacherId: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING_SIGNATURE" }, name: "one_pending_contract_per_teacher" }
);

module.exports = mongoose.model("TeacherContract", teacherContractSchema);
module.exports.TEACHER_CONTRACT_STATUSES = TEACHER_CONTRACT_STATUSES;
