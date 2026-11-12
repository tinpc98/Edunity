const mongoose = require("mongoose");
const { Schema } = mongoose;
const { reviewablePlugin } = require("./plugins");
const {
  GRADE_LEVELS,
  DOSSIER_SUBMISSION_MODES,
  GUARDIAN_RELATIONSHIPS,
  CHECKLIST_ITEM_MODES,
  SCHOLARSHIP_APPLICATION_STATUSES,
  DOSSIER_REVIEW_STATUSES,
} = require("./constants");

const guardianInfoSchema = new Schema(
  {
    fullName: { type: String, trim: true },
    relationship: { type: String, enum: GUARDIAN_RELATIONSHIPS },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    occupation: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    nationalIdLast4: { type: String, trim: true, default: null },
    householdCircumstance: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const schoolInfoSchema = new Schema(
  {
    schoolName: { type: String, trim: true },
    gradeLevel: { type: String, enum: GRADE_LEVELS },
    className: { type: String, trim: true },
    studentCode: { type: String, trim: true, default: null },
    academicYear: { type: String, trim: true, default: null },
    province: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    schoolAddress: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const consentSnapshotSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["NOT_REQUIRED", "VERIFIED", "PENDING_DEPENDENCY", "DENIED"],
      default: "NOT_REQUIRED",
    },
    consentRecordId: { type: Schema.Types.ObjectId, default: null },
    guardianUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    checkedAt: { type: Date, default: null },
    note: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const checklistProgressItemSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, trim: true },
    required: { type: Boolean, default: true },
    acceptedMode: { type: String, enum: CHECKLIST_ITEM_MODES, default: "EITHER" },
    onlineDocumentIds: [{ type: Schema.Types.ObjectId, ref: "VerificationDocument" }],
    paperReceiptId: { type: Schema.Types.ObjectId, ref: "PaperDossierReceipt", default: null },
    paperItemStatus: { type: String, default: null },
    satisfied: { type: Boolean, default: false },
  },
  { _id: false }
);

const dossierVerificationSchema = new Schema(
  {
    status: { type: String, enum: DOSSIER_REVIEW_STATUSES, default: "PENDING_REVIEW" },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    note: { type: String, trim: true, default: null },
    checklistVerified: { type: Boolean, default: false },
  },
  { _id: false }
);

const scholarshipApplicationSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    applicationCode: { type: String, trim: true, uppercase: true, default: null },
    submissionMode: { type: String, enum: DOSSIER_SUBMISSION_MODES, default: "ONLINE" },

    guardianInfo: { type: guardianInfoSchema, default: null },
    schoolInfo: { type: schoolInfoSchema, default: null },
    consentSnapshot: { type: consentSnapshotSchema, default: () => ({ status: "NOT_REQUIRED" }) },
    checklistProgress: { type: [checklistProgressItemSchema], default: [] },
    dossierVerification: { type: dossierVerificationSchema, default: () => ({ status: "PENDING_REVIEW" }) },
    latestPaperReceiptId: { type: Schema.Types.ObjectId, ref: "PaperDossierReceipt", default: null },

    statement: String, // hoàn cảnh/nhu cầu học tập — KHÔNG có field số tiền (BR-36)
    status: {
      type: String,
      enum: SCHOLARSHIP_APPLICATION_STATUSES,
      default: "SUBMITTED",
    },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

scholarshipApplicationSchema.plugin(reviewablePlugin); // reviewedBy / reviewedAt / reviewNote

// BR-29: no duplicate application to the same campaign while one is still active or already APPROVED
scholarshipApplicationSchema.index(
  { studentId: 1, campaignId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"] },
    },
  }
);

scholarshipApplicationSchema.index(
  { applicationCode: 1 },
  { unique: true, partialFilterExpression: { applicationCode: { $type: "string" } } }
);
scholarshipApplicationSchema.index({ campaignId: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model("ScholarshipApplication", scholarshipApplicationSchema);
