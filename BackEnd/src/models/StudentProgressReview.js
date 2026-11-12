const mongoose = require("mongoose");
const { Schema } = mongoose;
const { PROGRESS_REVIEW_RATINGS, PROGRESS_REVIEW_PERIOD_TYPES } = require("./constants");

const metricsSnapshotSchema = new Schema(
  {
    capturedAt: { type: Date, required: true },
    attendanceRate: { type: Number, default: null },
    attendedSessionsCount: { type: Number, default: 0, min: 0 },
    absentSessionsCount: { type: Number, default: 0, min: 0 },
    evaluatedAttendanceCount: { type: Number, default: 0, min: 0 },
    assignmentAveragePercentage: { type: Number, default: null },
    assignmentsGradedCount: { type: Number, default: 0, min: 0 },
    assignmentsSubmittedCount: { type: Number, default: 0, min: 0 },
    assignmentsPublishedCount: { type: Number, default: 0, min: 0 },
    assessmentAveragePercentage: { type: Number, default: null },
    assessmentsGradedCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const progressRevisionEntrySchema = new Schema(
  {
    revisionNumber: { type: Number, required: true, min: 1 },
    action: { type: String, enum: ["CREATED", "UPDATED"], required: true },
    previousRating: { type: String, enum: [...PROGRESS_REVIEW_RATINGS, null], default: null },
    newRating: { type: String, enum: PROGRESS_REVIEW_RATINGS, required: true },
    progressRating: { type: String, enum: PROGRESS_REVIEW_RATINGS, required: true },
    masteryScore: { type: Number, default: null, min: 0, max: 100 },
    strengths: { type: String, default: "", trim: true },
    areasForImprovement: { type: String, default: "", trim: true },
    actionPlan: { type: String, default: "", trim: true },
    comment: { type: String, default: "", trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    classStatusSnapshot: { type: String, required: true },
    metricsSnapshot: { type: metricsSnapshotSchema, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true }
);

/**
 * StudentProgressReview (LMS-12)
 * Đánh giá định kỳ/cột mốc của Giảng viên về tiến bộ học tập của Học viên trong phạm vi Class.
 * Bảo lưu toàn bộ lịch sử đánh giá append-only qua `revisionHistory` kèm snapshot dữ liệu thật.
 */
const studentProgressReviewSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },

    periodType: { type: String, enum: PROGRESS_REVIEW_PERIOD_TYPES, default: "AD_HOC", required: true },
    milestoneRef: { type: String, default: null, trim: true, maxlength: 100 },
    progressRating: { type: String, enum: PROGRESS_REVIEW_RATINGS, required: true },
    masteryScore: { type: Number, default: null, min: 0, max: 100 },

    strengths: { type: String, default: "", trim: true, maxlength: 2000 },
    areasForImprovement: { type: String, default: "", trim: true, maxlength: 2000 },
    actionPlan: { type: String, default: "", trim: true, maxlength: 2000 },
    comment: { type: String, default: "", trim: true, maxlength: 4000 },

    classStatusSnapshot: { type: String, required: true },
    enrollmentStatusSnapshot: { type: String, required: true },
    metricsSnapshot: { type: metricsSnapshotSchema, required: true },

    reviewedAt: { type: Date, required: true },
    lastUpdatedAt: { type: Date, default: null },
    revisionNumber: { type: Number, required: true, min: 1, default: 1 },
    revisionHistory: { type: [progressRevisionEntrySchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

studentProgressReviewSchema.index({ classId: 1, studentId: 1, reviewedAt: -1 });
studentProgressReviewSchema.index({ teacherId: 1, classId: 1, reviewedAt: -1 });
studentProgressReviewSchema.index({ studentId: 1, reviewedAt: -1 });
studentProgressReviewSchema.index(
  { classId: 1, studentId: 1, periodType: 1 },
  {
    unique: true,
    partialFilterExpression: { periodType: { $in: ["MID_TERM", "END_OF_CLASS"] } },
  }
);
studentProgressReviewSchema.index(
  { classId: 1, studentId: 1, sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { sessionId: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("StudentProgressReview", studentProgressReviewSchema);

