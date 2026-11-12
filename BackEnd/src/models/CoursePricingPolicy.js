const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  GRADE_LEVELS,
  COURSE_LEVELS,
  PRICING_POLICY_SCOPES,
  PRICING_POLICY_STATUSES,
  PRICING_POLICY_CLASS_TYPES,
} = require("./constants");
const { adminManagedPlugin } = require("./plugins");
const { toNum } = require("../utils/money");

/**
 * CoursePricingPolicy (CUR-07)
 * Chính sách khung học phí và số buổi theo phiên bản (monotonic version per policyKey),
 * hỗ trợ effectiveFrom / effectiveTo, phân cấp scope COURSE > SUBJECT > CATEGORY > GLOBAL,
 * lưu vết lịch sử / rollback không ghi đè quá khứ.
 */
const coursePricingPolicySchema = new Schema(
  {
    policyKey: { type: String, required: true, trim: true, uppercase: true },
    version: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    scopeType: { type: String, enum: PRICING_POLICY_SCOPES, required: true, default: "GLOBAL" },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null },
    level: { type: String, enum: COURSE_LEVELS, default: null },

    classType: { type: String, enum: PRICING_POLICY_CLASS_TYPES, default: "ALL" },
    allowFree: { type: Boolean, default: true },
    minPrice: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0"),
    },
    maxPrice: { type: Schema.Types.Decimal128, required: true },

    minSessions: { type: Number, required: true, min: 1, default: 1 },
    maxSessions: { type: Number, required: true, min: 1 },

    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },

    status: {
      type: String,
      enum: PRICING_POLICY_STATUSES,
      default: "ACTIVE",
    },

    changeReason: { type: String, default: "", trim: true },
    rolledBackFromVersion: { type: Number, default: null },
    rolledBackToVersion: { type: Number, default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

coursePricingPolicySchema.plugin(adminManagedPlugin);

coursePricingPolicySchema.index({ policyKey: 1, version: 1 }, { unique: true });
coursePricingPolicySchema.index({ policyKey: 1, status: 1, effectiveFrom: -1, version: -1 });
coursePricingPolicySchema.index({ scopeType: 1, status: 1, effectiveFrom: -1 });
coursePricingPolicySchema.index({ courseId: 1, status: 1, effectiveFrom: -1 });
coursePricingPolicySchema.index({ subjectId: 1, status: 1, effectiveFrom: -1 });
coursePricingPolicySchema.index({ categoryId: 1, status: 1, effectiveFrom: -1 });

coursePricingPolicySchema.pre("validate", function validatePricingBounds() {
  const minP = toNum(this.minPrice);
  const maxP = toNum(this.maxPrice);

  if (!Number.isFinite(minP) || minP < 0) {
    throw new Error("minPrice must be >= 0");
  }
  if (!Number.isFinite(maxP) || maxP < minP) {
    throw new Error("maxPrice must be >= minPrice");
  }
  if (this.classType === "FREE" && (minP !== 0 || maxP !== 0)) {
    throw new Error("FREE pricing policy must have minPrice = 0 and maxPrice = 0");
  }

  if (!Number.isInteger(this.minSessions) || this.minSessions < 1) {
    throw new Error("minSessions must be an integer >= 1");
  }
  if (!Number.isInteger(this.maxSessions) || this.maxSessions < this.minSessions) {
    throw new Error("maxSessions must be an integer >= minSessions");
  }

  if (this.effectiveFrom && this.effectiveTo && this.effectiveTo <= this.effectiveFrom) {
    throw new Error("effectiveTo must be after effectiveFrom");
  }

  if (this.scopeType === "COURSE" && !this.courseId) {
    throw new Error("courseId is required when scopeType is COURSE");
  }
  if (this.scopeType === "SUBJECT" && !this.subjectId) {
    throw new Error("subjectId is required when scopeType is SUBJECT");
  }
  if (this.scopeType === "CATEGORY" && !this.categoryId) {
    throw new Error("categoryId is required when scopeType is CATEGORY");
  }
});

module.exports = mongoose.model("CoursePricingPolicy", coursePricingPolicySchema);

