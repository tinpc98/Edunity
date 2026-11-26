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
    cccd: { type: String, trim: true, default: null },
    cccdEnc: { type: String, default: null },
    cccdHash: { type: String, default: null },
  },
  { _id: false }
);

const applicantInfoSchema = new Schema(
  {
    fullName: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    permanentAddress: { type: String, trim: true, default: null },
    permanentProvince: { type: String, trim: true, default: null },
    permanentDistrict: { type: String, trim: true, default: null },
    permanentCommune: { type: String, trim: true, default: null },
    isDisadvantaged: { type: Boolean, default: false },
    hardshipCategories: {
      type: [{ type: String, enum: ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "REMOTE_AREA", "ORPHANED"] }],
      default: [],
    },
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
    principalName: { type: String, trim: true, default: null },
    principalTitle: { type: String, trim: true, default: null },
    homeroomTeacherName: { type: String, trim: true, default: null },
    homeroomTeacherPhone: { type: String, trim: true, default: null },
    // Legacy hardship fields remain readable for applications saved before the applicant profile migration.
    isDisadvantaged: { type: Boolean, default: false },
    hardshipCategories: {
      type: [{ type: String, enum: ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "REMOTE_AREA", "ORPHANED"] }],
      default: [],
    },
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

const paperDispatchSchema = new Schema(
  {
    declaredSent: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
    carrier: { type: String, trim: true, default: null },
    trackingNumber: { type: String, trim: true, uppercase: true, default: null },
    proofStorageKey: { type: String, default: null },
    declaredAt: { type: Date, default: null },
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
    submissionMode: { type: String, enum: DOSSIER_SUBMISSION_MODES, default: "HYBRID" },

    guardianInfo: { type: guardianInfoSchema, default: null },
    applicantInfo: { type: applicantInfoSchema, default: null },
    schoolInfo: { type: schoolInfoSchema, default: null },
    hasPovertyCertificate: { type: Boolean, default: false },
    consentSnapshot: { type: consentSnapshotSchema, default: () => ({ status: "NOT_REQUIRED" }) },
    checklistProgress: { type: [checklistProgressItemSchema], default: [] },
    dossierVerification: { type: dossierVerificationSchema, default: () => ({ status: "PENDING_REVIEW" }) },
    latestPaperReceiptId: { type: Schema.Types.ObjectId, ref: "PaperDossierReceipt", default: null },
    paperDispatch: { type: paperDispatchSchema, default: () => ({ declaredSent: false }) },
    intakeAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // 3-Actor Review & 4-Eyes Principle
    screenedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    screenedAt: { type: Date, default: null },
    screeningResult: { type: Schema.Types.Mixed, default: null },
    assignedVerifierId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifierResult: { type: Schema.Types.Mixed, default: null },

    studentCccd: { type: String, trim: true, default: null },
    studentCccdEnc: { type: String, default: null },
    studentCccdHash: { type: String, default: null },

    statement: String, // hoàn cảnh/nhu cầu học tập — KHÔNG có field số tiền (BR-36)
    // BAO-11: an anonymised story sponsors may read. Off by default; the student (and guardian, for a minor) opts in.
    publicStory: {
      type: new Schema(
        {
          consent: { type: Boolean, default: false },
          text: { type: String, trim: true, maxlength: 500, default: null },
          consentedAt: { type: Date, default: null },
          revokedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: () => ({ consent: false }),
    },
    // Public transparency consent with instant revoke
    publicConsent: {
      type: new Schema(
        {
          consented: { type: Boolean, default: false },
          consentedAt: { type: Date, default: null },
          revokedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: () => ({ consented: false }),
    },
    status: {
      type: String,
      enum: SCHOLARSHIP_APPLICATION_STATUSES,
      default: "SUBMITTED",
    },
    submittedAt: { type: Date, default: Date.now },
    supplementDeadline: { type: Date, default: null },
    reopenedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reopenedAt: { type: Date, default: null },
    reopenReason: { type: String, trim: true, default: null },
    history: [
      {
        action: { type: String, required: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        actorRole: { type: String, default: null },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: null },
        details: { type: Schema.Types.Mixed, default: null },
      },
    ],
  },
  { timestamps: true }
);

scholarshipApplicationSchema.plugin(reviewablePlugin); // reviewedBy / reviewedAt / reviewNote

// BR-29: exactly one application per student–campaign pair, whatever its status (REJECTED / WITHDRAWN included).
// Named explicitly so it can coexist with the legacy partial index name on databases built before this rule.
scholarshipApplicationSchema.index(
  { studentId: 1, campaignId: 1 },
  {
    unique: true,
    name: "one_application_per_student_campaign",
    partialFilterExpression: {
      status: { $in: SCHOLARSHIP_APPLICATION_STATUSES },
    },
  }
);

scholarshipApplicationSchema.index(
  { applicationCode: 1 },
  { unique: true, partialFilterExpression: { applicationCode: { $type: "string" } } }
);
scholarshipApplicationSchema.index({ campaignId: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model("ScholarshipApplication", scholarshipApplicationSchema);
