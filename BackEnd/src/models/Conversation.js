const mongoose = require("mongoose");
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],

    lastMessagePreview: String, // denormalized for inbox list rendering
    lastMessageAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

conversationSchema.index({ participantIds: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
