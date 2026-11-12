const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS } = require("./constants");
const { softDeletePlugin, reviewablePlugin } = require("./plugins");

const scheduleEntrySchema = new Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const pricingPolicySnapshotSchema = new Schema(
  {
    policyId: { type: Schema.Types.ObjectId, ref: "CoursePricingPolicy", default: null },
    policyKey: { type: String, trim: true, default: null },
    version: { type: Number, min: 1, default: null },
    scopeType: { type: String, default: null },
    classType: { type: String, default: null },
    allowFree: { type: Boolean, default: null },
    minPrice: { type: Schema.Types.Decimal128, default: null },
    maxPrice: { type: Schema.Types.Decimal128, default: null },
    minSessions: { type: Number, default: null },
    maxSessions: { type: Number, default: null },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    capturedAt: { type: Date, default: null },
  },
  { _id: false }
);

const classSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    courseTitle: { type: String, required: true }, // denormalized
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    teacherName: { type: String, required: true }, // denormalized
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null },
    level: { type: String, enum: COURSE_LEVELS, default: null },

    className: { type: String, required: true, trim: true },
    description: String, // BR-52: mô tả tổng quan riêng của Class
    coverImage: String,
    classType: { type: String, enum: ["FREE", "PAID"], required: true }, // BR-08
    price: { type: Schema.Types.Decimal128, required: true, default: 0 }, // BR-09/BR-10
    capacity: { type: Number, required: true, min: 1 },
    enrolledCount: { type: Number, default: 0, min: 0 }, // maintained counter, BR-11

    enrollmentStart: Date,
    enrollmentEnd: Date,
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "OPEN", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Teacher hoặc Admin chỉnh sửa gần nhất

    schedule: [scheduleEntrySchema],

    // CUR-09: Course SyllabusVersion & PricingPolicy snapshots captured before/at opening
    syllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    syllabusVersionNumber: { type: Number, min: 1, default: null },
    pricingPolicyId: { type: Schema.Types.ObjectId, ref: "CoursePricingPolicy", default: null },
    pricingPolicyKey: { type: String, trim: true, default: null },
    pricingPolicyVersion: { type: Number, min: 1, default: null },
    pricingPolicySnapshot: { type: pricingPolicySnapshotSchema, default: null },

    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

classSchema.plugin(reviewablePlugin); // Admin duyệt Class ở trạng thái PENDING_APPROVAL
classSchema.plugin(softDeletePlugin);

classSchema.index({ courseId: 1 });
classSchema.index({ teacherId: 1, status: 1 });
classSchema.index({ categoryId: 1, subjectId: 1, gradeLevel: 1, classType: 1, status: 1 });
classSchema.index({ className: "text" });

// BR-09 / BR-10
classSchema.pre("validate", function classPriceRule() {
  const price = this.price ? Number(this.price.toString()) : 0;
  if (this.classType === "FREE" && price !== 0) {
    throw new Error("FREE class must have price = 0");
  }
  if (this.classType === "PAID" && price <= 0) {
    throw new Error("PAID class must have price > 0");
  }
});

module.exports = mongoose.model("Class", classSchema);
