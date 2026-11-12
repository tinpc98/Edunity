const mongoose = require("mongoose");
const { Schema } = mongoose;
const { QUESTION_TYPES } = require("./constants");
const { adminManagedPlugin, softDeletePlugin } = require("./plugins");

const questionOptionSchema = new Schema(
  {
    optionId: { type: String, required: true, trim: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

/**
 * Question (LMS-08)
 * Câu hỏi thuộc một Assessment. Đáp án đúng (correctOptionIds, acceptedAnswers, explanation)
 * không bao giờ được tiết lộ cho Học viên trong lúc đang làm bài hoặc khi chưa được phép xem kết quả.
 */
const questionSchema = new Schema(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    questionOrder: { type: Number, required: true, min: 1 },
    questionType: { type: String, enum: QUESTION_TYPES, required: true },

    prompt: { type: String, required: true, trim: true, maxlength: 4000 },
    options: { type: [questionOptionSchema], default: [] },

    correctOptionIds: { type: [String], default: [] },
    acceptedAnswers: { type: [String], default: [] },
    caseSensitive: { type: Boolean, default: false },

    points: { type: Number, required: true, min: 0.5, max: 1000 },
    explanation: { type: String, default: "", trim: true, maxlength: 2000 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

questionSchema.plugin(adminManagedPlugin, { createdByRequired: true });
questionSchema.plugin(softDeletePlugin);

questionSchema.index(
  { assessmentId: 1, questionOrder: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);
questionSchema.index({ assessmentId: 1, isDeleted: 1 });

module.exports = mongoose.model("Question", questionSchema);

