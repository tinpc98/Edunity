const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_LEVELS, COURSE_LEVELS } = require("./constants");

const courseProposalSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },

    title: { type: String, required: true, trim: true },
    description: String,
    learningObjectives: String,
    syllabus: String,
    level: { type: String, enum: COURSE_LEVELS },
    gradeLevel: { type: String, enum: GRADE_LEVELS, default: null }, // BR-44: chọn từ select box, không nhập tự do
    prerequisites: String,
    estimatedDuration: String,

    status: {
      type: String,
      enum: ["PENDING_REVIEW", "NEED_CHANGES", "APPROVED", "REJECTED"],
      default: "PENDING_REVIEW",
    },
    reviewNote: String,
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    approvedCourseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
  },
  { timestamps: true }
);

courseProposalSchema.index({ status: 1, createdAt: 1 });
courseProposalSchema.index({ teacherId: 1 });

module.exports = mongoose.model("CourseProposal", courseProposalSchema);
