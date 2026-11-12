const mongoose = require("mongoose");
const { Schema } = mongoose;
const { CONVERSATION_CHANNEL_TYPES, CONVERSATION_STATUSES } = require("./constants");

const mutedParticipantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mutedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mutedByRole: { type: String, enum: ["TEACHER", "ADMIN"], required: true },
    mutedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { _id: false }
);

const moderationHistoryEntrySchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: ["TEACHER", "ADMIN"], required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, trim: true, maxlength: 500, default: null },
    actedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const moderationStateSchema = new Schema(
  {
    isLocked: { type: Boolean, default: false },
    lockedReason: { type: String, trim: true, maxlength: 500, default: null },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lockedByRole: { type: String, enum: ["TEACHER", "ADMIN", null], default: null },
    lockedAt: { type: Date, default: null },
    allowStudentPosts: { type: Boolean, default: true },
    mutedParticipants: { type: [mutedParticipantSchema], default: [] },
    moderationHistory: { type: [moderationHistoryEntrySchema], default: [] },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    channelType: { type: String, enum: CONVERSATION_CHANNEL_TYPES, default: "DIRECT" },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    title: { type: String, trim: true, maxlength: 200, default: null },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    status: { type: String, enum: CONVERSATION_STATUSES, default: "ACTIVE" },
    moderation: { type: moderationStateSchema, default: () => ({}) },

    lastMessagePreview: String, // denormalized for inbox list rendering
    lastMessageAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

conversationSchema.pre("validate", function validateClassChannel() {
  if (this.channelType === "CLASS" && !this.classId) {
    throw new Error("CLASS conversation requires classId");
  }
});

conversationSchema.index({ participantIds: 1, lastMessageAt: -1 });
conversationSchema.index(
  { channelType: 1, classId: 1 },
  { unique: true, partialFilterExpression: { channelType: "CLASS" } }
);
conversationSchema.index({ channelType: 1, status: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
