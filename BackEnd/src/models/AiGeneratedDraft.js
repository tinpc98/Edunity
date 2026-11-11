const mongoose = require("mongoose");
const { Schema } = mongoose;
const { AI_DRAFT_TYPES, AI_DRAFT_STATUSES, COURSE_LEVELS, GRADE_LEVELS } = require("./constants");
const { softDeletePlugin } = require("./plugins");

/**
 * AiGeneratedDraft (AI-02)
 * Mọi nội dung AI tạo cho Teacher (kế hoạch bài giảng hoặc ngân hàng câu hỏi) chỉ tồn tại ở trạng thái bản nháp
 * chờ giảng viên kiểm duyệt (DRAFT_PENDING_REVIEW). Tuyệt đối không tự publish và không sửa SyllabusVersion đã PUBLISHED.
 */
const aiGeneratedDraftSchema = new Schema(
  {
    draftCode: { type: String, required: true, unique: true, trim: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    draftType: { type: String, enum: AI_DRAFT_TYPES, required: true },

    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    syllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    gradeLevel: { type: String, enum: [...GRADE_LEVELS, null], default: null },
    level: { type: String, enum: [...COURSE_LEVELS, null], default: null },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    topic: { type: String, required: true, trim: true, maxlength: 500 },
    sanitizedPromptSummary: { type: String, default: "", maxlength: 1000 },

    generatedPayload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: AI_DRAFT_STATUSES, default: "DRAFT_PENDING_REVIEW" },
    isPublished: { type: Boolean, default: false, immutable: true },

    providerId: { type: String, required: true, trim: true },
    modelId: { type: String, required: true, trim: true },
    aiAuditLogId: { type: Schema.Types.ObjectId, ref: "AiAuditLog", default: null },

    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    approvalNote: { type: String, default: null, trim: true, maxlength: 1000 },
    materializedTargetType: { type: String, enum: ["LearningResource", "Assessment", null], default: null },
    materializedTargetId: { type: Schema.Types.ObjectId, default: null },

    rejectedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

aiGeneratedDraftSchema.plugin(softDeletePlugin);

aiGeneratedDraftSchema.pre("validate", function enforceDraftOnlyNeverPublished() {
  if (this.isPublished !== false) {
    this.isPublished = false;
  }
});

aiGeneratedDraftSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
aiGeneratedDraftSchema.index({ classId: 1, draftType: 1, status: 1 });
aiGeneratedDraftSchema.index({ courseId: 1, draftType: 1, status: 1 });

module.exports = mongoose.model("AiGeneratedDraft", aiGeneratedDraftSchema);

