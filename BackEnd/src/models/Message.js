const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");
const { MESSAGE_MODERATION_STATUSES } = require("./constants");

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    content: { type: String, required: true },

    // LMS-13: moderation metadata preserves original content in DB while hiding it from members
    moderationStatus: { type: String, enum: MESSAGE_MODERATION_STATUSES, default: "VISIBLE" },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    moderatedByRole: { type: String, enum: ["TEACHER", "ADMIN", null], default: null },
    moderatedAt: { type: Date, default: null },
    hiddenReason: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

// deletedBy hầu như luôn = senderId (thu hồi tin nhắn của chính mình) nên không bắt buộc set.
messageSchema.plugin(softDeletePlugin);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, moderationStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
