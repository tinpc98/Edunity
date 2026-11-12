const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ATTEMPT_STATUSES, ATTEMPT_GRADING_STATUSES, ASSESSMENT_PURPOSES, QUESTION_TYPES } = require("./constants");

const snapshotOptionSchema = new Schema(
  {
    optionId: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const questionSnapshotSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    questionOrder: { type: Number, required: true, min: 1 },
    questionType: { type: String, enum: QUESTION_TYPES, required: true },
    prompt: { type: String, required: true },
    options: { type: [snapshotOptionSchema], default: [] },
    points: { type: Number, required: true, min: 0.5 },
  },
  { _id: false }
);

const attemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    selectedOptionIds: { type: [String], default: [] },
    textAnswer: { type: String, default: null, maxlength: 20000 },
    awardedPoints: { type: Number, default: 0, min: 0 },
    maxPoints: { type: Number, required: true, min: 0.5 },
    isCorrect: { type: Boolean, default: null },
    requiresManualGrading: { type: Boolean, default: false },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
    graderComment: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { _id: false }
);

/**
 * Attempt (LMS-08)
 * Lượt làm bài kiểm tra của Học viên. Bảo vệ đồng thời bằng unique index trên lượt active (IN_PROGRESS),
 * khóa thứ tự attemptNumber, và idempotencyKey khi bắt đầu/nộp bài.
 */
const attemptSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    purpose: { type: String, enum: ASSESSMENT_PURPOSES, required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", default: null },

    attemptNumber: { type: Number, required: true, min: 1 },
    startIdempotencyKey: { type: String, default: null },
    submitIdempotencyKey: { type: String, default: null },
    submitRequestHash: { type: String, default: null },

    status: { type: String, enum: ATTEMPT_STATUSES, default: "IN_PROGRESS" },
    gradingStatus: { type: String, enum: ATTEMPT_GRADING_STATUSES, default: "PENDING" },

    questionSnapshots: { type: [questionSnapshotSchema], default: [] },
    answers: { type: [attemptAnswerSchema], default: [] },

    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },

    autoScore: { type: Number, default: 0, min: 0 },
    manualScore: { type: Number, default: 0, min: 0 },
    totalScore: { type: Number, default: 0, min: 0 },
    maxScoreSnapshot: { type: Number, required: true, min: 0.5 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    passed: { type: Boolean, default: null },

    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
    feedback: { type: String, default: "", trim: true, maxlength: 4000 },
  },
  { timestamps: true }
);

attemptSchema.index({ assessmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
attemptSchema.index(
  { assessmentId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "IN_PROGRESS" },
  }
);
attemptSchema.index(
  { assessmentId: 1, studentId: 1, startIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { startIdempotencyKey: { $type: "string" } },
  }
);
attemptSchema.index(
  { assessmentId: 1, studentId: 1, submitIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { submitIdempotencyKey: { $type: "string" } },
  }
);
attemptSchema.index({ studentId: 1, createdAt: -1 });
attemptSchema.index({ classId: 1, gradingStatus: 1 });

module.exports = mongoose.model("Attempt", attemptSchema);

