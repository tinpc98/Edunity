const mongoose = require("mongoose");
const { Schema } = mongoose;
const { COURSE_LEVELS, GRADE_LEVELS, PLACEMENT_RESULT_STATUSES } = require("./constants");

/**
 * PlacementResult (LMS-01)
 * Kết quả phân loại trình độ đầu vào được sinh từ Attempt đã chấm thực tế trên Placement Assessment
 * và đề xuất Course ACTIVE phù hợp (không can thiệp quy tắc Enrollment hay Class gate).
 */
const placementResultSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    attemptId: { type: Schema.Types.ObjectId, ref: "Attempt", required: true, unique: true },

    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    gradeLevel: { type: String, enum: [...GRADE_LEVELS, null], default: null },

    rawScore: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 0.5 },
    percentage: { type: Number, required: true, min: 0, max: 100 },

    recommendedLevel: { type: String, enum: COURSE_LEVELS, required: true },
    recommendedCourseIds: { type: [{ type: Schema.Types.ObjectId, ref: "Course" }], default: [] },
    matchedBandSummary: { type: String, default: "", trim: true },

    status: { type: String, enum: PLACEMENT_RESULT_STATUSES, default: "GENERATED" },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

placementResultSchema.index({ studentId: 1, subjectId: 1, gradeLevel: 1, evaluatedAt: -1 });
placementResultSchema.index({ studentId: 1, evaluatedAt: -1 });
placementResultSchema.index(
  { studentId: 1, subjectId: 1, gradeLevel: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "GENERATED" },
  }
);

module.exports = mongoose.model("PlacementResult", placementResultSchema);

