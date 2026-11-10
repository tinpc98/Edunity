const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ASSIGNMENT_STATUSES } = require("./constants");
const { softDeletePlugin } = require("./plugins");

const attachmentSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    mimeType: { type: String, default: null },
    originalName: { type: String, default: null },
    title: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const rubricCriterionSchema = new Schema(
  {
    criterionCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    maxPoints: { type: Number, required: true, min: 0.01 },
  },
  { _id: false }
);

/**
 * Assignment (LMS-05)
 * Bài tập do Giáo viên tạo và quản lý trong phạm vi Lớp học (tùy chọn gắn Session).
 */
const assignmentSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    instructions: { type: String, default: "", trim: true, maxlength: 4000 },
    attachments: { type: [attachmentSchema], default: [] },

    dueAt: { type: Date, default: null },
    allowLateSubmission: { type: Boolean, default: true },
    maxAttempts: { type: Number, default: 1, min: 1, max: 20 },
    maxScore: { type: Number, default: 100, min: 1, max: 1000 },
    rubricCriteria: { type: [rubricCriterionSchema], default: [] },

    status: { type: String, enum: ASSIGNMENT_STATUSES, default: "DRAFT" },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

assignmentSchema.plugin(softDeletePlugin);

assignmentSchema.index({ classId: 1, status: 1, dueAt: 1 });
assignmentSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
assignmentSchema.index({ sessionId: 1, status: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);

