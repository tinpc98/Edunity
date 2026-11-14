const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GUARDIAN_RELATIONSHIPS } = require("./constants");

/**
 * AID-08 / BAO-11: a guardian's consent for a student under 18 to apply to one campaign.
 * Evidence is a consent form signed by the guardian (with a copy of their CCCD), uploaded by the student
 * as a private SCHOLARSHIP_PROOF file and checked by an Admin. No consent is ever inferred from guardianInfo.
 */
const guardianConsentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    guardian: {
      fullName: { type: String, required: true, trim: true },
      relationship: { type: String, enum: GUARDIAN_RELATIONSHIPS, required: true },
      phone: { type: String, required: true, trim: true },
    },
    documentStorageKey: { type: String, required: true }, // private key, never a public URL
    allowPublicStory: { type: Boolean, default: false }, // guardian also agrees to an anonymised story for sponsors
    status: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED", "REVOKED"], default: "PENDING" },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null, maxlength: 1000 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One live consent per student and campaign
guardianConsentSchema.index(
  { studentId: 1, campaignId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["PENDING", "VERIFIED"] } }, name: "one_live_consent_per_campaign" }
);
guardianConsentSchema.index({ status: 1, submittedAt: 1 });

module.exports = mongoose.model("GuardianConsent", guardianConsentSchema);
