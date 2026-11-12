const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");

/**
 * SessionReview (LMS-10)
 * Đánh giá theo từng Session, tách biệt khỏi model `Review` (vốn khóa unique `enrollmentId` ở mức Class).
 * Yêu cầu xác minh tham gia thật qua `SessionAttendance`, `Session` (COMPLETED) và `Enrollment`.
 * Không tự động tạo kỷ luật hoặc trừ thù lao giảng viên từ nội dung review.
 */
const sessionReviewSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    attendanceId: { type: Schema.Types.ObjectId, ref: "SessionAttendance", required: true },
    attendanceStatusSnapshot: { type: String, required: true },
    reviewedSessionEndedAt: { type: Date, required: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    teacherPreparednessRating: { type: Number, default: null, min: 1, max: 5 },
    clarityRating: { type: Number, default: null, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

sessionReviewSchema.plugin(softDeletePlugin);

sessionReviewSchema.index(
  { sessionId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
sessionReviewSchema.index({ classId: 1, isDeleted: 1, createdAt: -1 });
sessionReviewSchema.index({ teacherId: 1, isDeleted: 1, createdAt: -1 });
sessionReviewSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model("SessionReview", sessionReviewSchema);

