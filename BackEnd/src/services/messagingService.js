const mongoose = require("mongoose");
const {
  Conversation,
  Message,
  User,
  Class,
  Enrollment,
} = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, paged, validationError, parseDate, isBlank } = require("../utils/http");
const { toUserSummary, getDisplayProfile, PROFILE_SELECT } = require("../utils/userProfile");
const { notify } = require("./notificationService");

const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 100;
const RECALLED_PREVIEW = "Tin nhắn đã được thu hồi";

const NOT_DELETED = { isDeleted: { $ne: true } };
const LIVE_ENROLLMENT_STATUSES = ["CONFIRMED", "COMPLETED"];

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const isValidIdValue = (val) =>
  (typeof val === "string" ||
    val instanceof mongoose.Types.ObjectId ||
    Boolean(val && typeof val === "object" && val._bsontype === "ObjectId")) &&
  mongoose.isValidObjectId(val);

const isPlainObjectOrArray = (val) => val !== null && typeof val === "object";

const assertOptionalQueryString = (val, field) => {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "string") {
    throw validationError(`${field} query parameter must be a string`);
  }
  const trimmed = val.trim();
  return trimmed ? trimmed : null;
};

const runInTx = async (work) => {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => work(dbSession));
  } finally {
    await dbSession.endSession();
  }
};

const conversationNotFound = () => new AppError("Conversation not found", "CONVERSATION_NOT_FOUND", 404);
const messageNotFound = () => new AppError("Message not found", "MESSAGE_NOT_FOUND", 404);

// A Teacher writes to their own students, or answers one who wrote first
const assertTeacherMayContact = async (teacherId, studentId) => {
  const isOwnStudent = await Enrollment.exists({
    teacherId,
    studentId,
    enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES },
  });
  const hasDirectConversation =
    isOwnStudent ||
    (await Conversation.exists({
      channelType: { $ne: "CLASS" },
      participantIds: { $all: [teacherId, studentId], $size: 2 },
    }));
  if (!hasDirectConversation) {
    throw new AppError("You can only message students of your own classes", "MESSAGING_NOT_ALLOWED", 403);
  }
};

const assertActiveAccountInTx = async (userId, dbSession) => {
  const user = await User.findOne({ _id: userId, status: "ACTIVE", ...NOT_DELETED })
    .select("role status")
    .session(dbSession)
    .lean();
  if (!user) {
    throw new AppError("Your account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  }
  return user;
};

const getMyConversation = async (userId, conversationId, { dbSession = null } = {}) => {
  if (!isValidIdValue(conversationId)) throw conversationNotFound();
  const conversation = await Conversation.findById(conversationId).session(dbSession);
  if (!conversation) throw conversationNotFound();

  const isParticipant = conversation.participantIds.some((id) => toId(id) === toId(userId));
  if (!isParticipant) throw conversationNotFound();
  return conversation;
};

const present = async (conversations, userId) => {
  const directParticipantIds = conversations
    .flatMap((c) => c.participantIds.filter((id) => toId(id) !== toId(userId)));
  const classIds = conversations.map((c) => c.classId).filter(Boolean);

  const [users, classes] = await Promise.all([
    directParticipantIds.length
      ? User.find({ _id: { $in: directParticipantIds } }).select(PROFILE_SELECT).lean()
      : [],
    classIds.length
      ? Class.find({ _id: { $in: classIds } }).select("className status").lean()
      : [],
  ]);

  const userMap = new Map(users.map((user) => [toId(user._id), user]));
  const classMap = new Map(classes.map((cls) => [toId(cls._id), cls]));

  return conversations.map((conversation) => {
    const cls = conversation.classId ? classMap.get(toId(conversation.classId)) || null : null;
    const otherId = conversation.participantIds.find((id) => toId(id) !== toId(userId));

    return {
      id: toId(conversation._id),
      channelType: conversation.channelType || "DIRECT",
      classId: conversation.classId || null,
      className: cls ? cls.className : null,
      classStatus: cls ? cls.status : null,
      title: conversation.title || null,
      status: conversation.status || "ACTIVE",
      participant: otherId ? toUserSummary(userMap.get(toId(otherId))) : null,
      lastMessagePreview: conversation.lastMessagePreview || null,
      lastMessageAt: conversation.lastMessageAt || null,
      createdAt: conversation.createdAt,
    };
  });
};

const presentMessage = (message) => {
  const isRecalled = Boolean(message.isDeleted);
  return {
    id: toId(message._id),
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: isRecalled ? null : message.content,
    isDeleted: isRecalled,
    createdAt: message.createdAt,
  };
};

/**
 * FR-STU-20 / FR-TEA-20: opens (or returns) the 1-1 DIRECT conversation between a Student and a Teacher,
 * optionally about one of that Teacher's classes.
 */
const openConversation = async (user, body = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError("Request body must be an object");
  }
  const { participantId, classId } = body;
  if (!isValidIdValue(participantId)) throw validationError("participantId is required");
  if (toId(participantId) === toId(user.id)) throw validationError("You cannot start a conversation with yourself");

  const other = await User.findOne({ _id: participantId, status: "ACTIVE", ...NOT_DELETED }).select("role").lean();
  if (!other) throw new AppError("User not found", "USER_NOT_FOUND", 404);

  const roles = [user.role, other.role].sort().join("-");
  if (roles !== "STUDENT-TEACHER") {
    throw new AppError("Messaging is only available between a Student and a Teacher", "MESSAGING_NOT_ALLOWED", 403);
  }
  if (user.role === "TEACHER") await assertTeacherMayContact(user.id, other._id);

  let conversationClassId = null;
  if (classId !== undefined && classId !== null && classId !== "") {
    if (!isValidIdValue(classId)) {
      throw Array.isArray(classId) || isPlainObjectOrArray(classId)
        ? validationError("classId must be a valid ID")
        : new AppError("Class not found for this teacher", "CLASS_NOT_FOUND", 404);
    }
    const teacherId = user.role === "TEACHER" ? user.id : other._id;
    const cls = await Class.findOne({ _id: classId, teacherId }).select("_id").lean();
    if (!cls) throw new AppError("Class not found for this teacher", "CLASS_NOT_FOUND", 404);
    conversationClassId = cls._id;
  }

  const filter = {
    channelType: { $ne: "CLASS" },
    participantIds: { $all: [user.id, other._id], $size: 2 },
    classId: conversationClassId,
  };
  const conversation =
    (await Conversation.findOne(filter)) ||
    (await Conversation.create({
      channelType: "DIRECT",
      participantIds: [user.id, other._id],
      classId: conversationClassId,
    }));

  const [presented] = await present([conversation.toObject()], user.id);
  return presented;
};

const listMyConversations = async (userId, paging) => {
  const filter = {
    channelType: { $ne: "CLASS" },
    participantIds: userId,
  };

  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Conversation.countDocuments(filter),
  ]);
  return paged(await present(items, userId), total, paging);
};

// Newest page first via `before` (ISO date cursor); items are returned in chronological order
const listMessages = async (userId, conversationId, query = {}) => {
  const conversation = await getMyConversation(userId, conversationId);
  const rawLimit = assertOptionalQueryString(query.limit, "limit");
  let parsedLimit = 30;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) throw validationError("limit must be a positive integer");
    parsedLimit = Number(rawLimit);
  }
  const limit = Math.min(Math.max(parsedLimit || 30, 1), 100);
  const rawBefore = assertOptionalQueryString(query.before, "before");
  const filter = { conversationId: conversation._id };
  const before = parseDate(rawBefore, "before");
  if (before) filter.createdAt = { $lt: before };

  const rows = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const sliced = rows.slice(0, limit).reverse();

  const items = sliced.map((msg) => presentMessage(msg));
  return { items, hasMore, nextBefore: hasMore ? items[0].createdAt : null };
};

const validateMessageContent = (body = {}) => {
  if (isBlank(body.content)) throw validationError("content is required");
  const content = body.content.trim();
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw validationError(`content must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return content;
};

const syncLatestConversationPreview = async (conversationId, dbSession) => {
  const latest = await Message.findOne({ conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .session(dbSession)
    .lean();
  if (!latest) return;
  const preview = latest.isDeleted
    ? RECALLED_PREVIEW
    : String(latest.content || "").slice(0, PREVIEW_LENGTH);
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessagePreview: preview } }, { session: dbSession });
};

const sendMessageInsideTx = async (user, conversationId, content, dbSession) => {
  await assertActiveAccountInTx(user.id, dbSession);
  const conversation = await getMyConversation(user.id, conversationId, { dbSession });

  const [message] = await Message.create(
    [{ conversationId: conversation._id, senderId: user.id, content }],
    { session: dbSession }
  );
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessagePreview: content.slice(0, PREVIEW_LENGTH),
        lastMessageAt: message.createdAt,
      },
    },
    { session: dbSession }
  );

  const recipientId = conversation.participantIds.find((id) => toId(id) !== toId(user.id));
  const sender = recipientId ? await User.findById(user.id).select(PROFILE_SELECT).session(dbSession).lean() : null;
  return {
    presented: presentMessage(message.toObject()),
    postCommitNotify: recipientId
      ? {
          recipientId,
          senderName: getDisplayProfile(sender).fullName || "người dùng",
        }
      : null,
  };
};

const sendMessage = async (user, conversationId, body = {}) => {
  const content = validateMessageContent(body);
  if (!isValidIdValue(conversationId)) throw conversationNotFound();

  const txResult = await runInTx((dbSession) => sendMessageInsideTx(user, conversationId, content, dbSession));
  if (txResult.postCommitNotify && txResult.postCommitNotify.recipientId) {
    await notify(
      txResult.postCommitNotify.recipientId,
      `Tin nhắn mới từ ${txResult.postCommitNotify.senderName}`,
      content.slice(0, PREVIEW_LENGTH),
      "NEW_MESSAGE"
    );
  }
  return txResult.presented;
};

// Thu hồi tin nhắn của chính mình (soft delete; không xóa dữ liệu lịch sử khỏi DB)
const deleteMessage = async (userId, messageId) => {
  if (!isValidIdValue(messageId)) throw messageNotFound();

  return runInTx(async (dbSession) => {
    const message = await Message.findById(messageId).session(dbSession);
    if (!message || message.isDeleted) throw messageNotFound();
    await getMyConversation(userId, message.conversationId, { dbSession });
    if (toId(message.senderId) !== toId(userId)) throw FORBIDDEN("You can only recall your own messages");

    const updated = await Message.findOneAndUpdate(
      { _id: messageId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } },
      { session: dbSession, returnDocument: "after" }
    );
    if (!updated) throw messageNotFound();

    await syncLatestConversationPreview(updated.conversationId, dbSession);
    return presentMessage(updated.toObject());
  });
};

module.exports = {
  openConversation,
  listMyConversations,
  listMessages,
  sendMessage,
  deleteMessage,
};
