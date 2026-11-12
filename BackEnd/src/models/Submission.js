const mongoose = require("mongoose");
const { Schema } = mongoose;
const { SUBMISSION_STATUSES } = require("./constants");

const submissionAttachmentSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    mimeType: { type: String, default: null },
    originalName: { type: String, default: null },
  },
  { _id: false }
);

const rubricScoreSnapshotSchema = new Schema(
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
 * Submission (LMS-05)
 * Bài nộp của Học viên theo Assignment và Enrollment hợp lệ.
 * Trạng thái thực thể: "submitted" | "late" | "graded" (khi chưa có submission nào -> studentStatus = "open").
 */
const submissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },

    attemptNumber: { type: Number, required: true, min: 1 },
    idempotencyKey: { type: String, default: null },
    requestHash: { type: String, default: null },

    textAnswer: { type: String, default: null, maxlength: 20000 },
    linkUrl: { type: String, default: null, trim: true, maxlength: 2000 },
    attachments: { type: [submissionAttachmentSchema], default: [] },

    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    lateSeconds: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: SUBMISSION_STATUSES, default: "submitted" },

    currentScore: { type: Number, default: null, min: 0 },
    maxScoreSnapshot: { type: Number, required: true, min: 1 },
    latestFeedback: { type: String, default: null },
    latestGradeId: { type: Schema.Types.ObjectId, ref: "Grade", default: null },
    gradedAt: { type: Date, default: null },
    rubricScores: { type: [rubricScoreSnapshotSchema], default: [] },
  },
  { timestamps: true }
);

submissionSchema.index({ assignmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
submissionSchema.index(
  { assignmentId: 1, studentId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);
submissionSchema.index({ classId: 1, studentId: 1, submittedAt: -1 });
submissionSchema.index({ assignmentId: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model("Submission", submissionSchema);

