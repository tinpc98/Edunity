const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_STATUSES } = require("./constants");

const gradeRubricItemSchema = new Schema(
  {
    criterionCode: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0 },
    maxPoints: { type: Number, required: true, min: 0.01 },
    comment: { type: String, default: "", trim: true },
  },
  { _id: false }
);

/**
 * Grade (LMS-07)
 * Bản ghi điểm chuẩn của một Submission. Khi chấm lại (regrade), Grade cập nhật điểm hiện hành
 * đồng bộ trong cùng transaction với GradeHistory (append-only) và Submission.
 */
const gradeSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, unique: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },

    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 1 },
    feedback: { type: String, default: "", trim: true, maxlength: 5000 },
    rubricBreakdown: { type: [gradeRubricItemSchema], default: [] },

    status: { type: String, enum: GRADE_STATUSES, default: "GRADED" },
    revisionNumber: { type: Number, required: true, min: 1, default: 1 },

    gradedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gradedAt: { type: Date, required: true },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

gradeSchema.index({ assignmentId: 1, studentId: 1 });
gradeSchema.index({ classId: 1, studentId: 1 });

module.exports = mongoose.model("Grade", gradeSchema);

