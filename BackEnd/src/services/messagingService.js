const mongoose = require("mongoose");
const { Conversation, Message, User, Class } = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { paged, validationError, parseDate, isBlank } = require("../utils/http");
const { toUserSummary, getDisplayProfile, PROFILE_SELECT } = require("../utils/userProfile");
const { notify } = require("./notificationService");

const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 100;
const RECALLED_PREVIEW = "Tin nhắn đã được thu hồi";

const conversationNotFound = () => new AppError("Conversation not found", "CONVERSATION_NOT_FOUND", 404);

const getMyConversation = async (userId, conversationId) => {
  if (!mongoose.isValidObjectId(conversationId)) throw conversationNotFound();
  // Not being a participant is reported as "not found": the conversation's existence is not disclosed
  const conversation = await Conversation.findOne({ _id: conversationId, participantIds: userId });
  if (!conversation) throw conversationNotFound();
  return conversation;
};

const present = async (conversations, userId) => {
  const otherIds = conversations.flatMap((c) => c.participantIds.filter((id) => id.toString() !== userId.toString()));
  const classIds = conversations.map((c) => c.classId).filter(Boolean);
  const [users, classes] = await Promise.all([
    User.find({ _id: { $in: otherIds } }).select(PROFILE_SELECT).lean(),
    Class.find({ _id: { $in: classIds } }).select("className").lean(),
  ]);
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  const classMap = new Map(classes.map((cls) => [cls._id.toString(), cls.className]));

  return conversations.map((conversation) => {
    const otherId = conversation.participantIds.find((id) => id.toString() !== userId.toString());
    return {
      id: conversation._id.toString(),
      classId: conversation.classId || null,
      className: conversation.classId ? classMap.get(conversation.classId.toString()) || null : null,
      participant: otherId ? toUserSummary(userMap.get(otherId.toString())) : null,
      lastMessagePreview: conversation.lastMessagePreview || null,
      lastMessageAt: conversation.lastMessageAt || null,
      createdAt: conversation.createdAt,
    };
  });
};

/**
 * FR-STU-20 / FR-TEA-20: opens (or returns) the 1-1 conversation between a Student and a Teacher,
 * optionally about one of that Teacher's classes. Other role pairs cannot message each other.
 */
const openConversation = async (user, body) => {
  const { participantId, classId } = body;
  if (!mongoose.isValidObjectId(participantId)) throw validationError("participantId is required");
  if (participantId.toString() === user.id.toString()) throw validationError("You cannot start a conversation with yourself");

  const other = await User.findOne({ _id: participantId, status: "ACTIVE", isDeleted: { $ne: true } }).select("role").lean();
  if (!other) throw new AppError("User not found", "USER_NOT_FOUND", 404);

  const roles = [user.role, other.role].sort().join("-");
  if (roles !== "STUDENT-TEACHER") {
    throw new AppError("Messaging is only available between a Student and a Teacher", "MESSAGING_NOT_ALLOWED", 403);
  }

  let conversationClassId = null;
  if (classId) {
    const teacherId = user.role === "TEACHER" ? user.id : other._id;
    const cls = mongoose.isValidObjectId(classId) ? await Class.findOne({ _id: classId, teacherId }).select("_id").lean() : null;
    if (!cls) throw new AppError("Class not found for this teacher", "CLASS_NOT_FOUND", 404);
    conversationClassId = cls._id;
  }

  const filter = {
    participantIds: { $all: [user.id, other._id], $size: 2 },
    classId: conversationClassId,
  };
  const conversation =
    (await Conversation.findOne(filter)) ||
    (await Conversation.create({ participantIds: [user.id, other._id], classId: conversationClassId }));

  const [presented] = await present([conversation.toObject()], user.id);
  return presented;
};

const listMyConversations = async (userId, paging) => {
  const filter = { participantIds: userId };
  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Conversation.countDocuments(filter),
  ]);
  return paged(await present(items, userId), total, paging);
};

const presentMessage = (message) => ({
  id: message._id.toString(),
  conversationId: message.conversationId,
  senderId: message.senderId,
  content: message.isDeleted ? null : message.content, // a recalled message keeps its place but not its content
  isDeleted: Boolean(message.isDeleted),
  createdAt: message.createdAt,
});

// Newest page first via `before` (ISO date cursor); items are returned in chronological order
const listMessages = async (userId, conversationId, query) => {
  const conversation = await getMyConversation(userId, conversationId);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const filter = { conversationId: conversation._id };
  const before = parseDate(query.before, "before");
  if (before) filter.createdAt = { $lt: before };

  const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).reverse().map(presentMessage);
  return { items, hasMore, nextBefore: hasMore ? items[0].createdAt : null };
};

const sendMessage = async (user, conversationId, body) => {
  const conversation = await getMyConversation(user.id, conversationId);
  if (isBlank(body.content)) throw validationError("content is required");
  const content = body.content.trim();
  if (content.length > MAX_MESSAGE_LENGTH) throw validationError(`content must be at most ${MAX_MESSAGE_LENGTH} characters`);

  const message = await Message.create({ conversationId: conversation._id, senderId: user.id, content });
  conversation.lastMessagePreview = content.slice(0, PREVIEW_LENGTH);
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  const recipientId = conversation.participantIds.find((id) => id.toString() !== user.id.toString());
  if (recipientId) {
    const sender = await User.findById(user.id).select(PROFILE_SELECT).lean();
    await notify(recipientId, `Tin nhắn mới từ ${getDisplayProfile(sender).fullName || "người dùng"}`, content.slice(0, PREVIEW_LENGTH), "NEW_MESSAGE");
  }
  return presentMessage(message.toObject());
};

// Thu hồi tin nhắn của chính mình (soft delete)
const deleteMessage = async (userId, messageId) => {
  const notFound = () => new AppError("Message not found", "MESSAGE_NOT_FOUND", 404);
  if (!mongoose.isValidObjectId(messageId)) throw notFound();
  const message = await Message.findById(messageId);
  if (!message || message.isDeleted) throw notFound();
  await getMyConversation(userId, message.conversationId);
  if (message.senderId.toString() !== userId.toString()) throw FORBIDDEN("You can only recall your own messages");

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.deletedBy = userId;
  await message.save();

  const latest = await Message.findOne({ conversationId: message.conversationId }).sort({ createdAt: -1 }).select("_id").lean();
  if (latest && latest._id.toString() === message._id.toString()) {
    await Conversation.updateOne({ _id: message.conversationId }, { $set: { lastMessagePreview: RECALLED_PREVIEW } });
  }
  return presentMessage(message.toObject());
};

module.exports = { openConversation, listMyConversations, listMessages, sendMessage, deleteMessage };
