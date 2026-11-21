const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");

const reviewSchema = new Schema(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, unique: true }, // BR-30
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,

    // Moderation fields (EDUNITY-ADMIN-REVIEW-COMMENT-MODERATION-V1)
    isHidden: { type: Boolean, default: false, index: true },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    hideReason: { type: String, default: null },
  },
  { timestamps: true }
);

reviewSchema.plugin(softDeletePlugin); // Admin gỡ review vi phạm mà không mất dữ liệu gốc

reviewSchema.index({ classId: 1, isDeleted: 1, isHidden: 1 });
reviewSchema.index({ teacherId: 1, isDeleted: 1, isHidden: 1 });
reviewSchema.index({ isHidden: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
