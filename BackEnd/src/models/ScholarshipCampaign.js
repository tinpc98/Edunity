const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");
const { CHECKLIST_ITEM_MODES } = require("./constants");

const checklistItemSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    required: { type: Boolean, default: true },
    acceptedMode: { type: String, enum: CHECKLIST_ITEM_MODES, default: "EITHER" },
    acceptedDocumentTypes: {
      type: [String],
      default: ["SCHOLARSHIP_PROOF"],
    },
    maxFiles: { type: Number, default: 5, min: 1, max: 20 },
    order: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const priorityCriterionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    sourceField: {
      type: String,
      enum: [
        "HAS_POVERTY_CERTIFICATE",
        "HARDSHIP_CATEGORY",
        "IS_DISADVANTAGED",
        "GRADE_LEVEL",
        "STUDENT_PROVINCE",
        "STUDENT_COMMUNE",
        "SCHOOL_PROVINCE",
        "SCHOOL_COMMUNE",
        "SCHOOL_NAME",
      ],
      required: true,
    },
    matchValue: { type: String, required: true, trim: true },
    points: { type: Number, required: true, min: 0 },
    exclusiveGroup: { type: String, trim: true, default: null },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const priorityPolicyRevisionSchema = new Schema(
  {
    version: { type: Number, required: true },
    criteria: { type: [priorityCriterionSchema], default: [] },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const dossierPolicySchema = new Schema(
  {
    requireGuardianInfo: { type: Boolean, default: false },
    requireSchoolInfo: { type: Boolean, default: false },
    allowPaperDossier: { type: Boolean, default: true },
    allowDraftSave: { type: Boolean, default: true },
    requireGuardianConsentForMinor: { type: Boolean, default: false },
  },
  { _id: false }
);

const scopeSchema = new Schema(
  {
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    subjectIds: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    courseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  },
  { _id: false }
);

const scholarshipCampaignSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, // BR-16: Admin tạo Campaign
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    title: { type: String, required: true, trim: true },
    description: String,
    eligibilityCriteria: String,
    scope: scopeSchema,
    documentChecklist: { type: [checklistItemSchema], default: [] },
    priorityCriteria: { type: [priorityCriterionSchema], default: [] },
    priorityPolicyVersion: { type: Number, default: 0 },
    priorityPolicyHistory: { type: [priorityPolicyRevisionSchema], default: [] },
    dossierPolicy: { type: dossierPolicySchema, default: () => ({}) },

    targetBudget: { type: Schema.Types.Decimal128, required: true },
    fundedAmount: { type: Schema.Types.Decimal128, default: 0 },
    allocatedAmount: { type: Schema.Types.Decimal128, default: 0 }, // BR-37
    usedAmount: { type: Schema.Types.Decimal128, default: 0 },
    refundedAmount: { type: Schema.Types.Decimal128, default: 0 },
    officialEligibleFunding: { type: Schema.Types.Decimal128, default: null },
    officialSlotCount: { type: Number, min: 0, default: null },
    fundingReconciledAt: { type: Date, default: null },
    fundingReconciledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    allowSlotExpansion: { type: Boolean, default: false },
    paperDeliveryGraceDays: { type: Number, min: 3, max: 5, default: 5 },
    entitlementValidityDays: { type: Number, min: 30, max: 730, default: 180 },

    expectedSlots: { type: Number, required: true },
    awardAmountPerStudent: { type: Schema.Types.Decimal128, default: 2000000, required: true }, // BR-36

    fundingStart: Date,
    fundingEnd: Date,
    applicationStart: Date,
    applicationEnd: Date,
    resultPublicationDate: { type: Date, default: null },
    timelineMode: { type: String, enum: ["SEQUENTIAL", "PARALLEL"], default: "PARALLEL" },

    // Các cờ quản lý độc lập vòng đời Gây quỹ & Tiếp nhận hồ sơ
    isFundingPaused: { type: Boolean, default: false },
    fundingClosed: { type: Boolean, default: false },
    fundingClosedAt: { type: Date, default: null },
    fundingPauseReason: { type: String, default: null },

    isApplicationPaused: { type: Boolean, default: false },
    applicationClosed: { type: Boolean, default: false },
    applicationClosedAt: { type: Date, default: null },
    applicationPauseReason: { type: String, default: null },

    lifecycleHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
        previousState: { type: Schema.Types.Mixed, default: {} },
        newState: { type: Schema.Types.Mixed, default: {} },
      },
    ],

    // OPEN_FOR_FUNDING là trạng thái "đã publish" duy nhất (đúng theo UC-ADM-03: Publish -> status = OPEN_FOR_FUNDING),
    // bao trùm cả giai đoạn nhận tài trợ lẫn giai đoạn nhận hồ sơ — KHÔNG có state riêng OPEN_FOR_APPLICATION
    // vì không có FR/UC nào chuyển sang state đó. Đang nhận tài trợ hay đang nhận hồ sơ được suy ra bằng cách so sánh
    // thời gian hiện tại với fundingStart/fundingEnd và applicationStart/applicationEnd tương ứng (BR-17, BR-19).
    status: {
      type: String,
      enum: ["DRAFT", "OPEN_FOR_FUNDING", "CLOSED"],
      default: "DRAFT",
    },
  },
  { timestamps: true }
);

scholarshipCampaignSchema.plugin(softDeletePlugin); // ẩn Campaign nháp/lỗi khỏi danh sách công khai, vẫn giữ lịch sử tài trợ

scholarshipCampaignSchema.index({ status: 1, applicationStart: 1, applicationEnd: 1 });

module.exports = mongoose.model("ScholarshipCampaign", scholarshipCampaignSchema);
