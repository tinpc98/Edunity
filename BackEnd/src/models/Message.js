const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin } = require("./plugins");

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    content: { type: String, required: true },
  },
  { timestamps: true }
);

// deletedBy hầu như luôn = senderId (thu hồi tin nhắn của chính mình) nên không bắt buộc set.
messageSchema.plugin(softDeletePlugin);

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
