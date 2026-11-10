const mongoose = require("mongoose");
const { Schema } = mongoose;
const { GRADE_HISTORY_ACTIONS } = require("./constants");
const { AppError } = require("../utils/errors");

const historyRubricItemSchema = new Schema(
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
 * GradeHistory (LMS-07)
 * Sổ nhật ký bất biến (append-only) ghi lại toàn bộ lịch sử chấm và sửa điểm.
 * Tuyệt đối cấm update/delete ở cả tầng API và Mongoose schema hooks.
 */
const gradeHistorySchema = new Schema(
  {
    gradeId: { type: Schema.Types.ObjectId, ref: "Grade", required: true },
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    revisionNumber: { type: Number, required: true, min: 1 },
    action: { type: String, enum: GRADE_HISTORY_ACTIONS, required: true },

    previousScore: { type: Number, default: null },
    newScore: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 1 },

    previousFeedback: { type: String, default: null },
    newFeedback: { type: String, default: "" },
    previousRubricBreakdown: { type: [historyRubricItemSchema], default: [] },
    newRubricBreakdown: { type: [historyRubricItemSchema], default: [] },

    reason: { type: String, default: "", trim: true, maxlength: 1000 },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    graderRole: { type: String, enum: ["TEACHER", "ADMIN"], required: true },
    gradedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

gradeHistorySchema.index({ gradeId: 1, revisionNumber: 1 }, { unique: true });
gradeHistorySchema.index({ submissionId: 1, revisionNumber: 1 });
gradeHistorySchema.index({ classId: 1, gradedAt: -1 });
gradeHistorySchema.index({ studentId: 1, gradedAt: -1 });

const immutableError = () =>
  new AppError("GradeHistory is append-only and cannot be modified or deleted", "GRADE_HISTORY_IMMUTABLE", 409);

gradeHistorySchema.pre("save", function blockGradeHistoryUpdate() {
  if (!this.isNew) {
    throw immutableError();
  }
});

const BLOCKED_MUTATION_OPS = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
];

for (const op of BLOCKED_MUTATION_OPS) {
  gradeHistorySchema.pre(op, function blockGradeHistoryMutation() {
    throw immutableError();
  });
}

module.exports = mongoose.model("GradeHistory", gradeHistorySchema);

