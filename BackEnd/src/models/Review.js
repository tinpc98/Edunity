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
  },
  { timestamps: true }
);

reviewSchema.plugin(softDeletePlugin); // Admin gỡ review vi phạm mà không mất dữ liệu gốc

reviewSchema.index({ classId: 1 });
reviewSchema.index({ teacherId: 1 });

module.exports = mongoose.model("Review", reviewSchema);
