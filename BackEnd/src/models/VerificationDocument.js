const mongoose = require("mongoose");
const { Schema } = mongoose;

const verificationDocumentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "ScholarshipApplication", default: null },

    documentType: { type: String, enum: ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"], required: true },
    storageKey: { type: String, required: true }, // private object storage key — never a public URL
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

verificationDocumentSchema.index({ userId: 1, documentType: 1 });
verificationDocumentSchema.index({ applicationId: 1 });

module.exports = mongoose.model("VerificationDocument", verificationDocumentSchema);
