const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  CONVERSATION_CHANNEL_TYPES,
  MESSAGE_REPORT_CATEGORIES,
  MESSAGE_REPORT_STATUSES,
  MESSAGE_MODERATION_ACTIONS,
  MESSAGE_MODERATION_STATUSES,
} = require("./constants");
const { reviewablePlugin } = require("./plugins");

/**
 * MessageModerationReport (LMS-13)
 * Báo cáo nội dung vi phạm trên tin nhắn trong kênh lớp học hoặc trò chuyện trực tiếp.
 * Tách riêng khỏi Report (khiếu nại vận hành/hợp đồng) để giữ nguyên hợp đồng hiện có và bảo toàn bằng chứng nội dung gốc.
 */
const messageModerationReportSchema = new Schema(
  {
    reportCode: { type: String, required: true, unique: true, trim: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    channelType: { type: String, enum: CONVERSATION_CHANNEL_TYPES, required: true },

    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reporterRole: { type: String, enum: ["STUDENT", "TEACHER"], required: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    category: { type: String, enum: MESSAGE_REPORT_CATEGORIES, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },

    messageSnapshot: {
      content: { type: String, default: "" },
      moderationStatusAtReport: { type: String, enum: MESSAGE_MODERATION_STATUSES, default: "VISIBLE" },
      sentAt: { type: Date, default: null },
    },

    status: { type: String, enum: MESSAGE_REPORT_STATUSES, default: "OPEN" },
    moderationActionTaken: { type: String, enum: MESSAGE_MODERATION_ACTIONS, default: "NONE" },
  },
  { timestamps: true }
);

messageModerationReportSchema.plugin(reviewablePlugin);

messageModerationReportSchema.index(
  { messageId: 1, reporterId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["OPEN", "IN_REVIEW"] } },
  }
);
messageModerationReportSchema.index({ status: 1, createdAt: -1 });
messageModerationReportSchema.index({ classId: 1, status: 1, createdAt: -1 });
messageModerationReportSchema.index({ reporterId: 1, createdAt: -1 });

module.exports = mongoose.model("MessageModerationReport", messageModerationReportSchema);

