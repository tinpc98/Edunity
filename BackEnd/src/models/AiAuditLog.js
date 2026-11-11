const mongoose = require("mongoose");
const { Schema } = mongoose;
const { AI_TASK_TYPES, AI_AUDIT_OUTCOMES } = require("./constants");

/**
 * AiAuditLog (Stage 6 AI Governance)
 * Nhật ký kiểm toán cho mọi lượt gọi AI hoặc fallback/block: KHÔNG lưu raw PII, API key hay thông tin cá nhân chưa ẩn danh.
 */
const aiAuditLogSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, trim: true },
    featureCode: { type: String, enum: AI_TASK_TYPES, required: true },
    operation: { type: String, required: true, trim: true, maxlength: 100 },

    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"], required: true },

    targetType: { type: String, default: null, trim: true },
    targetId: { type: Schema.Types.ObjectId, default: null },

    providerId: { type: String, default: "NONE", trim: true },
    modelId: { type: String, default: "NONE", trim: true },
    outcome: { type: String, enum: AI_AUDIT_OUTCOMES, required: true },
    fallbackUsed: { type: Boolean, default: false },
    errorCode: { type: String, default: null, trim: true },

    promptHash: { type: String, required: true, trim: true },
    piiRedactionCount: { type: Number, default: 0, min: 0 },
    promptInjectionBlocked: { type: Boolean, default: false },

    latencyMs: { type: Number, default: 0, min: 0 },
    estimatedInputTokens: { type: Number, default: 0, min: 0 },
    estimatedOutputTokens: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, default: 0, min: 0 },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aiAuditLogSchema.index({ featureCode: 1, outcome: 1, createdAt: -1 });
aiAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
aiAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AiAuditLog", aiAuditLogSchema);

