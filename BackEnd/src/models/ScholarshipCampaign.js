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
    dossierPolicy: { type: dossierPolicySchema, default: () => ({}) },

    targetBudget: { type: Schema.Types.Decimal128, required: true },
    fundedAmount: { type: Schema.Types.Decimal128, default: 0 },
    allocatedAmount: { type: Schema.Types.Decimal128, default: 0 }, // BR-37
    usedAmount: { type: Schema.Types.Decimal128, default: 0 },

    expectedSlots: { type: Number, required: true },
    awardAmountPerStudent: { type: Schema.Types.Decimal128, required: true }, // BR-36

    fundingStart: Date,
    fundingEnd: Date,
    applicationStart: Date,
    applicationEnd: Date,

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
