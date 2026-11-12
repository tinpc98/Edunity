const mongoose = require("mongoose");
const { Schema } = mongoose;

const enrollmentPricingPolicySnapshotSchema = new Schema(
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

const enrollmentSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true }, // denormalized
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // denormalized
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    enrollmentStatus: {
      type: String,
      enum: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"],
      default: "PENDING_PAYMENT",
    },
    paymentSource: {
      type: String,
      enum: ["FREE", "DIRECT_PAYMENT", "SCHOLARSHIP", "MIXED"],
      required: true,
    },

    tuitionAmount: { type: Schema.Types.Decimal128, required: true, default: 0 }, // snapshot of Class.price
    amountPaidViaPayment: { type: Schema.Types.Decimal128, default: 0 },
    amountPaidViaScholarship: { type: Schema.Types.Decimal128, default: 0 },

    enrolledAt: { type: Date, default: Date.now },
    holdExpiresAt: { type: Date, default: null }, // BR-38/39: created_at + 15 minutes while PENDING_PAYMENT

    // CUR-09: Snapshots copied from Class at Enrollment creation (populated by Tin in enrollmentService)
    syllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    syllabusVersionNumber: { type: Number, min: 1, default: null },
    pricingPolicyId: { type: Schema.Types.ObjectId, ref: "CoursePricingPolicy", default: null },
    pricingPolicyKey: { type: String, trim: true, default: null },
    pricingPolicyVersion: { type: Number, min: 1, default: null },
    pricingPolicySnapshot: { type: enrollmentPricingPolicySnapshotSchema, default: null },
  },
  { timestamps: true }
);

// BR-31: only "active" enrollments block re-registration
enrollmentSchema.index(
  { studentId: 1, classId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] },
    },
  }
);

// BR-40: background job scans for expired holds
enrollmentSchema.index({ enrollmentStatus: 1, holdExpiresAt: 1 });
enrollmentSchema.index({ studentId: 1, enrollmentStatus: 1 });
enrollmentSchema.index({ teacherId: 1, classId: 1 });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
