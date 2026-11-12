const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  Conversation,
  Message,
  MessageModerationReport,
  User,
  Class,
  Enrollment,
} = require("../models");
const {
  MESSAGE_REPORT_CATEGORIES,
  MESSAGE_REPORT_STATUSES,
  MESSAGE_MODERATION_ACTIONS,
} = require("../models/constants");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, parseDate, isBlank } = require("../utils/http");
const { toUserSummary, getDisplayProfile, PROFILE_SELECT } = require("../utils/userProfile");
const { notify, notifyAdmins } = require("./notificationService");
const { audit } = require("./auditService");
const { getVerifiedTeacher, getOwnClass } = require("./teacherClassService");

const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 100;
const RECALLED_PREVIEW = "Tin nhắn đã được thu hồi";
const HIDDEN_PREVIEW = "Tin nhắn đã bị ẩn bởi kiểm duyệt";

const NOT_DELETED = { isDeleted: { $ne: true } };
const LIVE_ENROLLMENT_STATUSES = ["CONFIRMED", "COMPLETED"];
const READABLE_CLASS_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const POSTABLE_CLASS_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED"];
const REPORT_TRANSITIONS = {
  OPEN: ["IN_REVIEW", "RESOLVED", "DISMISSED"],
  IN_REVIEW: ["RESOLVED", "DISMISSED"],
  RESOLVED: [],
  DISMISSED: [],
};

const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const isValidIdValue = (val) =>
  (typeof val === "string" ||
    val instanceof mongoose.Types.ObjectId ||
    Boolean(val && typeof val === "object" && val._bsontype === "ObjectId")) &&
  mongoose.isValidObjectId(val);
const isPlainObjectOrArray = (val) => val !== null && typeof val === "object";
const assertOptionalString = (val, field, maxLen = 1000) => {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) {
    throw validationError(`${field} must be at most ${maxLen} characters`);
  }
  return trimmed;
};
const assertRequiredEnumString = (val, allowed, field) => {
  if (typeof val !== "string") {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  const upper = val.trim().toUpperCase();
  if (!allowed.includes(upper)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return upper;
};
const assertOptionalQueryString = (val, field) => {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "string") {
    throw validationError(`${field} query parameter must be a string`);
  }
  const trimmed = val.trim();
  return trimmed ? trimmed : null;
};
const assertQueryIdValue = (val, field, notFoundMsg, notFoundCode) => {
  if (val === undefined || val === null || val === "") return null;
  if (Array.isArray(val) || (typeof val === "object" && !(val instanceof mongoose.Types.ObjectId) && val._bsontype !== "ObjectId")) {
    throw validationError(`${field} must be a valid ID string`);
  }
  assertId(val, notFoundMsg, notFoundCode);
  return toId(val);
};
const parsePositiveDurationMinutes = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean" || isPlainObjectOrArray(raw)) {
    throw validationError("durationMinutes must be a number between 1 and 43200 (30 days)");
  }
  if (typeof raw === "string" && !/^\d+(\.\d+)?$/.test(raw.trim())) {
    throw validationError("durationMinutes must be a number between 1 and 43200 (30 days)");
  }
  const mins = Number(raw);
  if (!Number.isFinite(mins) || mins < 1 || mins > 43200) {
    throw validationError("durationMinutes must be between 1 and 43200 (30 days)");
  }
  return mins;
};
const runInTx = async (work) => {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => work(dbSession));
  } finally {
    await dbSession.endSession();
  }
};
const getOwnClassInTx = async (teacherId, classId, dbSession) => {
  if (!isValidIdValue(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).session(dbSession);
  if (!cls) throw CLASS_NOT_FOUND();
  if (cls.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only manage your own classes");
  }
  return cls;
};
const conversationNotFound = () => new AppError("Conversation not found", "CONVERSATION_NOT_FOUND", 404);
const messageNotFound = () => new AppError("Message not found", "MESSAGE_NOT_FOUND", 404);
const reportNotFound = () => new AppError("Message report not found", "MESSAGE_REPORT_NOT_FOUND", 404);

const generateReportCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `MR-${datePart}-${randPart}`;
};

// A Teacher writes to their own students, or answers one who wrote first: never bypass via CLASS channels
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

const assertActiveAccount = async (userId) => {
  const user = await User.findOne({ _id: userId, status: "ACTIVE", ...NOT_DELETED })
    .select("role status")
    .lean();
  if (!user) {
    throw new AppError("Your account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  }
  return user;
};

/**
 * Verifies live Class membership (Class.teacherId or CONFIRMED/COMPLETED Enrollment).
 * Used on every CLASS channel open, read, list, report, or send so cancelled/expired
 * enrollments lose access immediately.
 */
const assertLiveClassMember = async (
  userId,
  classId,
  { forPosting = false, hideExistence = false, dbSession = null } = {}
) => {
  if (!isValidIdValue(classId)) {
    throw hideExistence ? conversationNotFound() : CLASS_NOT_FOUND();
  }
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).session(dbSession).lean();
  if (!cls) {
    throw hideExistence ? conversationNotFound() : CLASS_NOT_FOUND();
  }

  const user = await User.findOne({ _id: userId, status: "ACTIVE", ...NOT_DELETED })
    .select("role status")
    .session(dbSession)
    .lean();
  if (!user) {
    throw hideExistence ? conversationNotFound() : new AppError("Your account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  }

  let isMember = false;
  if (user.role === "TEACHER") {
    isMember = toId(cls.teacherId) === toId(userId);
  } else if (user.role === "STUDENT") {
    const enrolled = await Enrollment.findOne({
      classId: cls._id,
      studentId: userId,
      enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES },
    })
      .select("_id")
      .session(dbSession)
      .lean();
    isMember = Boolean(enrolled);
  }

  if (!isMember) {
    throw hideExistence
      ? conversationNotFound()
      : new AppError("You must be an active teacher or enrolled student of this class to access its channel", "MESSAGING_NOT_ALLOWED", 403);
  }

  if (!READABLE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class channel is not available until the class is approved and open", "CLASS_CHANNEL_UNAVAILABLE", 409);
  }
  if (forPosting && !POSTABLE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class is cancelled; message history is preserved in read-only mode", "CLASS_CHANNEL_READ_ONLY", 409);
  }

  return { cls, user };
};

const getLiveClassMemberIds = async (cls, dbSession = null) => {
  const enrollments = await Enrollment.find({
    classId: cls._id,
    enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES },
  })
    .select("studentId")
    .session(dbSession)
    .lean();
  const ids = new Set([toId(cls.teacherId)]);
  for (const e of enrollments) {
    if (e.studentId) ids.add(toId(e.studentId));
  }
  return [...ids].filter(Boolean);
};

const ensureClassConversationDoc = async (cls) => {
  const memberIds = await getLiveClassMemberIds(cls);
  const existing = await Conversation.findOne({ channelType: "CLASS", classId: cls._id });
  if (existing) {
    // Keep participantIds in sync with current live membership atomically (avoid OCC VersionError)
    const currentSet = new Set(existing.participantIds.map(toId));
    const changed =
      currentSet.size !== memberIds.length || memberIds.some((id) => !currentSet.has(id));
    if (changed) {
      return Conversation.findOneAndUpdate(
        { _id: existing._id },
        { $set: { participantIds: memberIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        { returnDocument: "after" }
      );
    }
    return existing;
  }

  try {
    return await Conversation.create({
      channelType: "CLASS",
      classId: cls._id,
      title: cls.className,
      participantIds: memberIds.map((id) => new mongoose.Types.ObjectId(id)),
      status: "ACTIVE",
      moderation: {
        isLocked: false,
        allowStudentPosts: true,
        mutedParticipants: [],
        moderationHistory: [],
      },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return Conversation.findOne({ channelType: "CLASS", classId: cls._id });
    }
    throw err;
  }
};

const getActiveMuteEntry = (conversation, userId, now = new Date()) => {
  const mutes = (conversation.moderation && conversation.moderation.mutedParticipants) || [];
  return (
    mutes.find(
      (m) =>
        toId(m.userId) === toId(userId) &&
        (!m.expiresAt || new Date(m.expiresAt).getTime() > now.getTime())
    ) || null
  );
};

const presentModerationForMember = (conversation, userId) => {
  const mod = conversation.moderation || {};
  const myMute = getActiveMuteEntry(conversation, userId);
  return {
    isLocked: Boolean(mod.isLocked),
    lockedReason: mod.isLocked ? mod.lockedReason || null : null,
    lockedByRole: mod.isLocked ? mod.lockedByRole || null : null,
    lockedAt: mod.isLocked ? mod.lockedAt || null : null,
    allowStudentPosts: mod.allowStudentPosts !== false,
    isMutedForMe: Boolean(myMute),
    myMuteReason: myMute ? myMute.reason || null : null,
    myMuteExpiresAt: myMute ? myMute.expiresAt || null : null,
  };
};

const presentModerationForStaff = (conversation, audienceRole = "TEACHER", userMap = new Map()) => {
  const mod = conversation.moderation || {};
  const now = new Date();
  return {
    isLocked: Boolean(mod.isLocked),
    lockedReason: mod.isLocked ? mod.lockedReason || null : null,
    lockedByRole: mod.isLocked ? mod.lockedByRole || null : null,
    lockedAt: mod.isLocked ? mod.lockedAt || null : null,
    ...(audienceRole === "ADMIN" ? { lockedBy: mod.lockedBy ? toId(mod.lockedBy) : null } : {}),
    allowStudentPosts: mod.allowStudentPosts !== false,
    mutedParticipants: (mod.mutedParticipants || [])
      .filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now.getTime())
      .map((m) => {
        const u = userMap.get(toId(m.userId));
        return {
          userId: toId(m.userId),
          user: u ? toUserSummary(u) : null,
          mutedByRole: m.mutedByRole,
          mutedAt: m.mutedAt,
          expiresAt: m.expiresAt || null,
          reason: m.reason || "",
          ...(audienceRole === "ADMIN" ? { mutedBy: toId(m.mutedBy) } : {}),
        };
      }),
    moderationHistory: (mod.moderationHistory || []).slice(-20).map((entry) => ({
      action: entry.action,
      actorRole: entry.actorRole,
      targetUserId: entry.targetUserId ? toId(entry.targetUserId) : null,
      reason: entry.reason || null,
      actedAt: entry.actedAt,
      ...(audienceRole === "ADMIN" ? { actorId: toId(entry.actorId) } : {}),
    })),
  };
};

const getMyConversation = async (userId, conversationId, { forPosting = false, dbSession = null } = {}) => {
  if (!isValidIdValue(conversationId)) throw conversationNotFound();
  const conversation = await Conversation.findById(conversationId).session(dbSession);
  if (!conversation) throw conversationNotFound();

  if (conversation.channelType === "CLASS") {
    await assertLiveClassMember(userId, conversation.classId, {
      forPosting,
      hideExistence: true,
      dbSession,
    });
    return conversation;
  }

  const isParticipant = conversation.participantIds.some((id) => toId(id) === toId(userId));
  if (!isParticipant) throw conversationNotFound();
  return conversation;
};

const present = async (conversations, userId) => {
  const directParticipantIds = conversations
    .filter((c) => c.channelType !== "CLASS")
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
    const isClass = conversation.channelType === "CLASS";
    const cls = conversation.classId ? classMap.get(toId(conversation.classId)) || null : null;
    const otherId = isClass ? null : conversation.participantIds.find((id) => toId(id) !== toId(userId));

    return {
      id: toId(conversation._id),
      channelType: conversation.channelType || "DIRECT",
      classId: conversation.classId || null,
      className: cls ? cls.className : null,
      classStatus: cls ? cls.status : null,
      title: isClass ? conversation.title || (cls && cls.className) || null : null,
      status: conversation.status || "ACTIVE",
      participant: otherId ? toUserSummary(userMap.get(toId(otherId))) : null,
      ...(isClass
        ? {
            memberCount: Array.isArray(conversation.participantIds) ? conversation.participantIds.length : 0,
            moderation: presentModerationForMember(conversation, userId),
          }
        : {}),
      lastMessagePreview: conversation.lastMessagePreview || null,
      lastMessageAt: conversation.lastMessageAt || null,
      createdAt: conversation.createdAt,
    };
  });
};

/**
 * FR-STU-20 / FR-TEA-20: opens (or returns) the 1-1 DIRECT conversation between a Student and a Teacher,
 * optionally about one of that Teacher's classes. Other role pairs cannot message each other.
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

/**
 * LMS-13: Opens or fetches the Class-scoped conversation channel for a live class member.
 */
const openOrGetClassConversation = async (user, classId) => {
  const { cls } = await assertLiveClassMember(user.id, classId, { forPosting: false });
  const conversation = await ensureClassConversationDoc(cls);
  const [presented] = await present([conversation.toObject()], user.id);
  return presented;
};

const listMyConversations = async (userId, paging) => {
  const [taughtClasses, enrolledDocs] = await Promise.all([
    Class.find({ teacherId: userId, ...NOT_DELETED, status: { $in: READABLE_CLASS_STATUSES } })
      .select("_id")
      .lean(),
    Enrollment.find({ studentId: userId, enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES } })
      .select("classId")
      .lean(),
  ]);

  const liveClassIds = [
    ...new Set([
      ...taughtClasses.map((c) => toId(c._id)),
      ...enrolledDocs.map((e) => toId(e.classId)),
    ]),
  ];

  // Validate enrolled classes are still non-deleted & readable
  let activeClassObjectIds = [];
  if (liveClassIds.length) {
    const validClasses = await Class.find({
      _id: { $in: liveClassIds },
      ...NOT_DELETED,
      status: { $in: READABLE_CLASS_STATUSES },
    })
      .select("_id")
      .lean();
    activeClassObjectIds = validClasses.map((c) => c._id);
  }

  const filter = {
    $or: [
      { channelType: { $ne: "CLASS" }, participantIds: userId },
      ...(activeClassObjectIds.length
        ? [{ channelType: "CLASS", classId: { $in: activeClassObjectIds } }]
        : []),
    ],
  };

  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Conversation.countDocuments(filter),
  ]);
  return paged(await present(items, userId), total, paging);
};

const presentMessage = (message, { senderMap = null, includeModeratedBy = false } = {}) => {
  const isRecalled = Boolean(message.isDeleted);
  const isModeratedHidden = message.moderationStatus === "HIDDEN_BY_MODERATOR";
  const hiddenFromMembers = isRecalled || isModeratedHidden;
  const senderDoc = senderMap ? senderMap.get(toId(message.senderId)) : null;

  return {
    id: toId(message._id),
    conversationId: message.conversationId,
    senderId: message.senderId,
    ...(senderDoc ? { sender: toUserSummary(senderDoc) } : {}),
    content: hiddenFromMembers ? null : message.content,
    isDeleted: isRecalled,
    isModeratedHidden,
    moderationStatus: message.moderationStatus || "VISIBLE",
    hiddenReason: isModeratedHidden ? message.hiddenReason || null : null,
    moderatedByRole: isModeratedHidden ? message.moderatedByRole || null : null,
    moderatedAt: isModeratedHidden ? message.moderatedAt || null : null,
    ...(includeModeratedBy ? { moderatedBy: message.moderatedBy ? toId(message.moderatedBy) : null } : {}),
    createdAt: message.createdAt,
  };
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

  let senderMap = null;
  if (conversation.channelType === "CLASS" && sliced.length) {
    const senderIds = [...new Set(sliced.map((m) => toId(m.senderId)))];
    const senders = await User.find({ _id: { $in: senderIds } }).select(PROFILE_SELECT).lean();
    senderMap = new Map(senders.map((u) => [toId(u._id), u]));
  }

  const items = sliced.map((msg) => presentMessage(msg, { senderMap }));
  return { items, hasMore, nextBefore: hasMore ? items[0].createdAt : null };
};

const listClassMessages = async (user, classId, query = {}) => {
  const { cls } = await assertLiveClassMember(user.id, classId, { forPosting: false });
  const conversation = await ensureClassConversationDoc(cls);
  return listMessages(user.id, conversation._id, query);
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

const sendMessageInsideTx = async (user, conversationId, content, dbSession) => {
  await assertActiveAccountInTx(user.id, dbSession);
  const conversation = await getMyConversation(user.id, conversationId, { forPosting: true, dbSession });

  if (conversation.channelType === "CLASS") {
    const cls = await Class.findOne({ _id: conversation.classId, ...NOT_DELETED }).session(dbSession).lean();
    if (!cls) throw CLASS_NOT_FOUND();
    if (!POSTABLE_CLASS_STATUSES.includes(cls.status)) {
      throw new AppError("Class is not open for new messages; history remains read-only", "CLASS_CHANNEL_READ_ONLY", 409);
    }
    if (conversation.status === "ARCHIVED") {
      throw new AppError("This class conversation has been archived", "CHANNEL_LOCKED", 409);
    }

    const mod = conversation.moderation || {};
    if (mod.isLocked) {
      if (user.role === "STUDENT" || mod.lockedByRole === "ADMIN") {
        throw new AppError(
          mod.lockedReason ? `Class channel is locked: ${mod.lockedReason}` : "Class channel is locked by moderator",
          "CHANNEL_LOCKED",
          403
        );
      }
    }
    if (user.role === "STUDENT" && mod.allowStudentPosts === false) {
      throw new AppError("Student messages are currently disabled in this class channel", "STUDENT_POSTING_DISABLED", 403);
    }
    const activeMute = getActiveMuteEntry(conversation, user.id);
    if (activeMute && user.role === "STUDENT") {
      const err = new AppError("You have been muted in this class channel", "USER_MUTED_IN_CLASS", 403);
      err.details = {
        expiresAt: activeMute.expiresAt || null,
        reason: activeMute.reason || null,
      };
      throw err;
    }

    const liveMembers = await getLiveClassMemberIds(cls, dbSession);
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
          participantIds: liveMembers.map((id) => new mongoose.Types.ObjectId(id)),
        },
      },
      { session: dbSession }
    );

    const sender = await User.findById(user.id).select(PROFILE_SELECT).session(dbSession).lean();
    const senderName = getDisplayProfile(sender).fullName || "Thành viên lớp";
    const recipientIds = liveMembers.filter((id) => id !== toId(user.id));
    let activeRecipientIds = [];
    if (recipientIds.length) {
      const activeRecipients = await User.find({
        _id: { $in: recipientIds },
        status: "ACTIVE",
        ...NOT_DELETED,
      })
        .select("_id")
        .session(dbSession)
        .lean();
      activeRecipientIds = activeRecipients.map((r) => r._id);
    }

    const senderMap = sender ? new Map([[toId(sender._id), sender]]) : null;
    return {
      presented: presentMessage(message.toObject(), { senderMap }),
      postCommitNotify: {
        kind: "CLASS",
        className: cls.className,
        senderName,
        recipientIds: activeRecipientIds,
      },
    };
  }

  // DIRECT 1-1 message: serialize preview update & message creation in tx
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
          kind: "DIRECT",
          recipientId,
          senderName: getDisplayProfile(sender).fullName || "người dùng",
        }
      : null,
  };
};

const dispatchSendNotifications = async (content, postCommitNotify) => {
  if (!postCommitNotify) return;
  if (postCommitNotify.kind === "CLASS" && postCommitNotify.recipientIds.length) {
    await Promise.all(
      postCommitNotify.recipientIds.map((rid) =>
        notify(
          rid,
          `[${postCommitNotify.className}] Tin nhắn mới từ ${postCommitNotify.senderName}`,
          content.slice(0, PREVIEW_LENGTH),
          "CLASS_MESSAGE"
        )
      )
    );
  } else if (postCommitNotify.kind === "DIRECT" && postCommitNotify.recipientId) {
    await notify(
      postCommitNotify.recipientId,
      `Tin nhắn mới từ ${postCommitNotify.senderName}`,
      content.slice(0, PREVIEW_LENGTH),
      "NEW_MESSAGE"
    );
  }
};

const validateMessageContent = (body = {}) => {
  if (isBlank(body.content)) throw validationError("content is required");
  const content = body.content.trim();
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw validationError(`content must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return content;
};

const sendMessage = async (user, conversationId, body = {}) => {
  const content = validateMessageContent(body);
  if (!isValidIdValue(conversationId)) throw conversationNotFound();

  const txResult = await runInTx((dbSession) => sendMessageInsideTx(user, conversationId, content, dbSession));
  await dispatchSendNotifications(content, txResult.postCommitNotify);
  return txResult.presented;
};

const sendClassMessage = async (user, classId, body = {}) => {
  const content = validateMessageContent(body);
  const { cls } = await assertLiveClassMember(user.id, classId, { forPosting: true });
  const conversation = await ensureClassConversationDoc(cls);

  const txResult = await runInTx((dbSession) => sendMessageInsideTx(user, conversation._id, content, dbSession));
  await dispatchSendNotifications(content, txResult.postCommitNotify);
  return txResult.presented;
};

const syncLatestConversationPreview = async (conversationId, dbSession) => {
  const latest = await Message.findOne({ conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .session(dbSession)
    .lean();
  if (!latest) return;
  const preview = latest.isDeleted
    ? RECALLED_PREVIEW
    : latest.moderationStatus === "HIDDEN_BY_MODERATOR"
      ? HIDDEN_PREVIEW
      : String(latest.content || "").slice(0, PREVIEW_LENGTH);
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessagePreview: preview } }, { session: dbSession });
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

// ---------- LMS-13: Message Reporting & Moderation ----------

const presentMessageReport = (report, { audienceRole = "MEMBER", userMap = new Map(), classMap = new Map() } = {}) => {
  const cls = report.classId ? classMap.get(toId(report.classId)) : null;
  const out = {
    id: toId(report._id),
    reportCode: report.reportCode,
    messageId: toId(report.messageId),
    conversationId: toId(report.conversationId),
    classId: report.classId ? toId(report.classId) : null,
    className: cls ? cls.className : null,
    channelType: report.channelType,
    category: report.category,
    reason: report.reason,
    messageSnapshot: report.messageSnapshot,
    status: report.status,
    moderationActionTaken: report.moderationActionTaken || "NONE",
    reviewNote: report.reviewNote || null,
    reviewedAt: report.reviewedAt || null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };

  if (audienceRole === "ADMIN") {
    out.reporterId = toId(report.reporterId);
    out.reporter = toUserSummary(userMap.get(toId(report.reporterId)));
    out.reporterRole = report.reporterRole;
    out.reportedUserId = toId(report.reportedUserId);
    out.reportedUser = toUserSummary(userMap.get(toId(report.reportedUserId)));
    out.reviewedBy = report.reviewedBy ? toId(report.reviewedBy) : null;
  }

  return out;
};

const reportMessage = async (user, messageId, body = {}) => {
  if (!["STUDENT", "TEACHER"].includes(user.role)) {
    throw FORBIDDEN("Only Students or Teachers can report messages");
  }
  if (!isValidIdValue(messageId)) throw messageNotFound();

  const category = assertRequiredEnumString(body.category, MESSAGE_REPORT_CATEGORIES, "category");
  if (isBlank(body.reason) || body.reason.trim().length < 3 || body.reason.trim().length > 1000) {
    throw validationError("reason must be between 3 and 1000 characters");
  }
  const reason = body.reason.trim();

  const report = await runInTx(async (dbSession) => {
    const message = await Message.findById(messageId).session(dbSession);
    if (!message || message.isDeleted) throw messageNotFound();

    const conversation = await getMyConversation(user.id, message.conversationId, { dbSession });
    if (toId(message.senderId) === toId(user.id)) {
      throw new AppError("You cannot report your own message", "CANNOT_REPORT_OWN_MESSAGE", 400);
    }

    const existingOpen = await MessageModerationReport.findOne({
      messageId: message._id,
      reporterId: user.id,
      status: { $in: ["OPEN", "IN_REVIEW"] },
    })
      .select("_id")
      .session(dbSession)
      .lean();
    if (existingOpen) {
      throw new AppError("You already have an active report for this message", "DUPLICATE_MESSAGE_REPORT", 409);
    }

    let createdReport;
    try {
      const [doc] = await MessageModerationReport.create(
        [
          {
            reportCode: generateReportCode(),
            messageId: message._id,
            conversationId: conversation._id,
            classId: conversation.classId || null,
            channelType: conversation.channelType || "DIRECT",
            reporterId: user.id,
            reporterRole: user.role,
            reportedUserId: message.senderId,
            category,
            reason,
            messageSnapshot: {
              content: message.content,
              moderationStatusAtReport: message.moderationStatus || "VISIBLE",
              sentAt: message.createdAt,
            },
            status: "OPEN",
            moderationActionTaken: "NONE",
          },
        ],
        { session: dbSession }
      );
      createdReport = doc;
    } catch (err) {
      if (err && err.code === 11000) {
        throw new AppError("You already have an active report for this message", "DUPLICATE_MESSAGE_REPORT", 409);
      }
      throw err;
    }

    await Message.updateOne(
      { _id: message._id, isDeleted: { $ne: true }, moderationStatus: "VISIBLE" },
      { $set: { moderationStatus: "FLAGGED" } },
      { session: dbSession }
    );

    return createdReport;
  });

  await notifyAdmins(
    "Báo cáo vi phạm tin nhắn mới",
    `[${report.reportCode}] (${category}): ${reason.slice(0, 120)}`,
    "MESSAGE_REPORT_CREATED"
  );

  return presentMessageReport(report.toObject(), { audienceRole: "MEMBER" });
};

const getMyMessageReports = async (userId, paging) => {
  const filter = { reporterId: userId };
  const [items, total] = await Promise.all([
    MessageModerationReport.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    MessageModerationReport.countDocuments(filter),
  ]);
  const classIds = [...new Set(items.map((r) => r.classId).filter(Boolean))];
  const classes = classIds.length ? await Class.find({ _id: { $in: classIds } }).select("className").lean() : [];
  const classMap = new Map(classes.map((c) => [toId(c._id), c]));

  return paged(
    items.map((r) => presentMessageReport(r, { audienceRole: "MEMBER", classMap })),
    total,
    paging
  );
};

const applyHideMessage = async (message, actorId, actorRole, reason, dbSession = null) => {
  const updated = await Message.findOneAndUpdate(
    { _id: message._id },
    {
      $set: {
        moderationStatus: "HIDDEN_BY_MODERATOR",
        moderatedBy: actorId,
        moderatedByRole: actorRole,
        moderatedAt: new Date(),
        hiddenReason: reason,
      },
    },
    { session: dbSession, returnDocument: "after" }
  );
  await syncLatestConversationPreview(message.conversationId, dbSession);
  return updated;
};

const applyRestoreMessage = async (message, actorId, actorRole, dbSession = null) => {
  const updated = await Message.findOneAndUpdate(
    { _id: message._id },
    {
      $set: {
        moderationStatus: "VISIBLE",
        moderatedBy: actorId,
        moderatedByRole: actorRole,
        moderatedAt: new Date(),
        hiddenReason: null,
      },
    },
    { session: dbSession, returnDocument: "after" }
  );
  await syncLatestConversationPreview(message.conversationId, dbSession);
  return updated;
};

const validateChannelModerationBody = (body = {}, actorRole = "TEACHER") => {
  const reason = assertOptionalString(body.reason, "reason", 500);
  const lockedReasonInput = assertOptionalString(body.lockedReason, "lockedReason", 500);

  if (body.isLocked !== undefined && typeof body.isLocked !== "boolean") {
    throw validationError("isLocked must be a boolean");
  }
  if (body.allowStudentPosts !== undefined && typeof body.allowStudentPosts !== "boolean") {
    throw validationError("allowStudentPosts must be a boolean");
  }
  if (body.isLocked === true && !reason && !lockedReasonInput) {
    throw validationError("reason is required when locking a class channel");
  }

  let nextStatus = undefined;
  if (body.status !== undefined && actorRole === "ADMIN") {
    nextStatus = assertRequiredEnumString(body.status, ["ACTIVE", "ARCHIVED"], "status");
  }

  return { reason, lockedReasonInput, nextStatus };
};

const cloneModerationState = (moderation) => {
  if (!moderation) return {};
  return typeof moderation.toObject === "function" ? moderation.toObject() : { ...moderation };
};

const applyChannelModerationSettings = async (conversation, actorId, actorRole, body = {}, dbSession = null) => {
  const { reason, lockedReasonInput, nextStatus } = validateChannelModerationBody(body, actorRole);
  const mod = cloneModerationState(conversation.moderation);
  const now = new Date();
  let updatedConvStatus = conversation.status;

  if (body.isLocked !== undefined) {
    const wantLock = body.isLocked;
    if (!wantLock && mod.isLocked && mod.lockedByRole === "ADMIN" && actorRole !== "ADMIN") {
      throw new AppError("This channel was locked by Administrator and cannot be unlocked by teacher", "LOCKED_BY_ADMIN", 403);
    }
    mod.isLocked = wantLock;
    mod.lockedReason = wantLock ? reason || lockedReasonInput : null;
    mod.lockedBy = wantLock ? actorId : null;
    mod.lockedByRole = wantLock ? actorRole : null;
    mod.lockedAt = wantLock ? now : null;
    mod.moderationHistory = mod.moderationHistory || [];
    mod.moderationHistory.push({
      action: wantLock ? "LOCK_CHANNEL" : "UNLOCK_CHANNEL",
      actorId,
      actorRole,
      reason: mod.lockedReason || reason,
      actedAt: now,
    });
  }

  if (body.allowStudentPosts !== undefined) {
    const allow = body.allowStudentPosts;
    mod.allowStudentPosts = allow;
    mod.moderationHistory = mod.moderationHistory || [];
    mod.moderationHistory.push({
      action: allow ? "ENABLE_STUDENT_POSTS" : "DISABLE_STUDENT_POSTS",
      actorId,
      actorRole,
      reason,
      actedAt: now,
    });
  }

  if (nextStatus !== undefined && actorRole === "ADMIN") {
    updatedConvStatus = nextStatus;
  }

  return Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { $set: { status: updatedConvStatus, moderation: mod } },
    { session: dbSession, returnDocument: "after" }
  );
};

const applyMuteParticipant = async (
  conversation,
  cls,
  actorId,
  actorRole,
  studentId,
  body = {},
  { dbSession = null, deferNotify = false } = {}
) => {
  if (!isValidIdValue(studentId)) {
    throw Array.isArray(studentId) || isPlainObjectOrArray(studentId)
      ? validationError("studentId must be a valid ID")
      : new AppError("Student not found", "USER_NOT_FOUND", 404);
  }
  assertId(studentId, "Student not found", "USER_NOT_FOUND");
  if (toId(studentId) === toId(cls.teacherId)) {
    throw validationError("Cannot mute the class teacher");
  }
  const enrolled = await Enrollment.findOne({
    classId: cls._id,
    studentId,
    enrollmentStatus: { $in: LIVE_ENROLLMENT_STATUSES },
  })
    .select("_id")
    .session(dbSession)
    .lean();
  if (!enrolled) {
    throw new AppError("Target student does not have an active or completed enrollment in this class", "USER_NOT_IN_CLASS", 404);
  }
  if (isBlank(body.reason)) {
    throw validationError("reason is required when muting a participant");
  }
  const reason = body.reason.trim().slice(0, 500);

  const mins = parsePositiveDurationMinutes(body.durationMinutes);
  const expiresAt = mins !== null ? new Date(Date.now() + mins * 60 * 1000) : null;

  const now = new Date();
  const mod = cloneModerationState(conversation.moderation);
  const existing = (mod.mutedParticipants || []).find((m) => toId(m.userId) === toId(studentId));
  if (existing && existing.mutedByRole === "ADMIN" && actorRole !== "ADMIN") {
    throw new AppError("Student mute was set by Administrator and cannot be altered by teacher", "MUTED_BY_ADMIN", 403);
  }

  mod.mutedParticipants = (mod.mutedParticipants || []).filter((m) => toId(m.userId) !== toId(studentId));
  mod.mutedParticipants.push({
    userId: studentId,
    mutedBy: actorId,
    mutedByRole: actorRole,
    mutedAt: now,
    expiresAt,
    reason,
  });
  mod.moderationHistory = mod.moderationHistory || [];
  mod.moderationHistory.push({
    action: "MUTE_USER",
    actorId,
    actorRole,
    targetUserId: studentId,
    reason,
    actedAt: now,
  });

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { $set: { moderation: mod } },
    { session: dbSession, returnDocument: "after" }
  );

  const muteNotifyPayload = {
    userId: studentId,
    title: `[${cls.className}] Tạm khóa quyền gửi tin nhắn`,
    content: reason,
    type: "CLASS_CHANNEL_MUTED",
  };
  if (!deferNotify) {
    await notify(muteNotifyPayload.userId, muteNotifyPayload.title, muteNotifyPayload.content, muteNotifyPayload.type);
  }
  return { conversation: updated, reason, muteNotifyPayload };
};

const applyUnmuteParticipant = async (conversation, actorId, actorRole, targetUserId, dbSession = null) => {
  if (!isValidIdValue(targetUserId)) {
    throw Array.isArray(targetUserId) || isPlainObjectOrArray(targetUserId)
      ? validationError("userId must be a valid ID")
      : new AppError("User not found", "USER_NOT_FOUND", 404);
  }
  assertId(targetUserId, "User not found", "USER_NOT_FOUND");
  const mod = cloneModerationState(conversation.moderation);
  const existing = (mod.mutedParticipants || []).find((m) => toId(m.userId) === toId(targetUserId));
  if (!existing) {
    throw new AppError("User is not currently muted in this class channel", "MUTE_NOT_FOUND", 404);
  }
  if (existing.mutedByRole === "ADMIN" && actorRole !== "ADMIN") {
    throw new AppError("Student mute was set by Administrator and cannot be lifted by teacher", "MUTED_BY_ADMIN", 403);
  }

  mod.mutedParticipants = (mod.mutedParticipants || []).filter((m) => toId(m.userId) !== toId(targetUserId));
  mod.moderationHistory = mod.moderationHistory || [];
  mod.moderationHistory.push({
    action: "UNMUTE_USER",
    actorId,
    actorRole,
    targetUserId,
    reason: null,
    actedAt: new Date(),
  });
  return Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { $set: { moderation: mod } },
    { session: dbSession, returnDocument: "after" }
  );
};

const staffClassConversationSummary = async (conversation, cls, audienceRole) => {
  const userIds = (conversation.moderation?.mutedParticipants || []).map((m) => m.userId);
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select(PROFILE_SELECT).lean() : [];
  const userMap = new Map(users.map((u) => [toId(u._id), u]));

  return {
    id: toId(conversation._id),
    channelType: "CLASS",
    classId: toId(cls._id),
    className: cls.className,
    status: conversation.status,
    moderation: presentModerationForStaff(conversation, audienceRole, userMap),
  };
};

// --- Teacher Moderation APIs (does NOT write AuditLog because AuditLog.actorAdminId requires ADMIN) ---

const teacherUpdateClassConversationModeration = async (teacherId, classId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!READABLE_CLASS_STATUSES.includes(cls.status)) {
    throw new AppError("Class does not have an active messaging channel", "CLASS_CHANNEL_UNAVAILABLE", 409);
  }
  if (body.isLocked === undefined && body.allowStudentPosts === undefined) {
    throw validationError("At least one of isLocked or allowStudentPosts must be provided");
  }
  validateChannelModerationBody(body, "TEACHER");

  const ensured = await ensureClassConversationDoc(cls);
  const updatedConv = await runInTx(async (dbSession) => {
    const freshCls = await getOwnClassInTx(teacherId, classId, dbSession);
    if (!READABLE_CLASS_STATUSES.includes(freshCls.status)) {
      throw new AppError("Class does not have an active messaging channel", "CLASS_CHANNEL_UNAVAILABLE", 409);
    }
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();
    return applyChannelModerationSettings(freshConv, teacherId, "TEACHER", body, dbSession);
  });
  return staffClassConversationSummary(updatedConv.toObject(), cls, "TEACHER");
};

const teacherMuteClassParticipant = async (teacherId, classId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!body.studentId) throw validationError("studentId is required");
  const ensured = await ensureClassConversationDoc(cls);

  const txOut = await runInTx(async (dbSession) => {
    const freshCls = await getOwnClassInTx(teacherId, classId, dbSession);
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();
    return applyMuteParticipant(freshConv, freshCls, teacherId, "TEACHER", body.studentId, body, {
      dbSession,
      deferNotify: true,
    });
  });

  if (txOut.muteNotifyPayload) {
    await notify(
      txOut.muteNotifyPayload.userId,
      txOut.muteNotifyPayload.title,
      txOut.muteNotifyPayload.content,
      txOut.muteNotifyPayload.type
    );
  }
  return staffClassConversationSummary(txOut.conversation.toObject(), cls, "TEACHER");
};

const teacherUnmuteClassParticipant = async (teacherId, classId, studentId) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  const ensured = await ensureClassConversationDoc(cls);

  const updatedConv = await runInTx(async (dbSession) => {
    await getOwnClassInTx(teacherId, classId, dbSession);
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();
    return applyUnmuteParticipant(freshConv, teacherId, "TEACHER", studentId, dbSession);
  });
  return staffClassConversationSummary(updatedConv.toObject(), cls, "TEACHER");
};

const teacherModerateMessage = async (teacherId, classId, messageId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!isValidIdValue(messageId)) throw messageNotFound();

  const action = assertRequiredEnumString(body.action, ["HIDE", "RESTORE"], "action");
  if (action === "HIDE" && isBlank(body.reason)) {
    throw validationError("reason is required when hiding a message");
  }
  const cleanReason = action === "HIDE" ? body.reason.trim().slice(0, 500) : null;

  const ensured = await ensureClassConversationDoc(cls);
  const updatedMsg = await runInTx(async (dbSession) => {
    await getOwnClassInTx(teacherId, classId, dbSession);
    const message = await Message.findOne({ _id: messageId, conversationId: ensured._id }).session(dbSession);
    if (!message) throw messageNotFound();
    if (message.isDeleted) {
      throw new AppError("Cannot moderate a message already recalled by its sender", "MESSAGE_ALREADY_RECALLED", 409);
    }

    if (action === "RESTORE") {
      if (message.moderationStatus !== "HIDDEN_BY_MODERATOR") {
        throw new AppError("Message is not currently hidden by moderator", "MESSAGE_NOT_HIDDEN", 409);
      }
      if (message.moderatedByRole === "ADMIN") {
        throw new AppError("Message hidden by Administrator cannot be restored by teacher", "MODERATED_BY_ADMIN", 403);
      }
      return applyRestoreMessage(message, teacherId, "TEACHER", dbSession);
    }
    return applyHideMessage(message, teacherId, "TEACHER", cleanReason, dbSession);
  });

  return presentMessage(updatedMsg.toObject());
};

// --- Admin Moderation APIs (strictly audited with AuditLog) ---

const adminListMessageReports = async (query = {}, paging) => {
  const filter = {};
  const rawStatus = assertOptionalQueryString(query.status, "status");
  if (rawStatus) {
    const statuses = rawStatus
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!statuses.length || statuses.some((s) => !MESSAGE_REPORT_STATUSES.includes(s))) {
      throw validationError(`status must be subset of ${MESSAGE_REPORT_STATUSES.join(", ")}`);
    }
    filter.status = { $in: statuses };
  }
  const rawCategory = assertOptionalQueryString(query.category, "category");
  if (rawCategory) {
    const cat = rawCategory.toUpperCase();
    if (!MESSAGE_REPORT_CATEGORIES.includes(cat)) {
      throw validationError(`category must be one of ${MESSAGE_REPORT_CATEGORIES.join(", ")}`);
    }
    filter.category = cat;
  }
  const validClassId = assertQueryIdValue(query.classId, "classId", "Class not found", "CLASS_NOT_FOUND");
  if (validClassId) {
    filter.classId = validClassId;
  }

  const [items, total] = await Promise.all([
    MessageModerationReport.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    MessageModerationReport.countDocuments(filter),
  ]);

  const userIds = items.flatMap((r) => [r.reporterId, r.reportedUserId]).filter(Boolean);
  const classIds = items.map((r) => r.classId).filter(Boolean);
  const [users, classes] = await Promise.all([
    userIds.length ? User.find({ _id: { $in: userIds } }).select(PROFILE_SELECT).lean() : [],
    classIds.length ? Class.find({ _id: { $in: classIds } }).select("className").lean() : [],
  ]);
  const userMap = new Map(users.map((u) => [toId(u._id), u]));
  const classMap = new Map(classes.map((c) => [toId(c._id), c]));

  return paged(
    items.map((r) => presentMessageReport(r, { audienceRole: "ADMIN", userMap, classMap })),
    total,
    paging
  );
};

const adminGetMessageReport = async (reportId) => {
  if (!isValidIdValue(reportId)) throw reportNotFound();
  const report = await MessageModerationReport.findById(reportId).lean();
  if (!report) throw reportNotFound();

  const userIds = [report.reporterId, report.reportedUserId].filter(Boolean);
  const [users, cls] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select(PROFILE_SELECT).lean(),
    report.classId ? Class.findById(report.classId).select("className").lean() : null,
  ]);
  const userMap = new Map(users.map((u) => [toId(u._id), u]));
  const classMap = cls ? new Map([[toId(cls._id), cls]]) : new Map();

  return presentMessageReport(report, { audienceRole: "ADMIN", userMap, classMap });
};

const adminReviewMessageReport = async (adminId, reportId, body = {}) => {
  if (!isValidIdValue(reportId)) throw reportNotFound();

  const nextStatus = assertRequiredEnumString(body.status, MESSAGE_REPORT_STATUSES, "status");
  if (["RESOLVED", "DISMISSED"].includes(nextStatus) && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when resolving or dismissing a message report");
  }

  let moderationAction =
    body.moderationAction === undefined || body.moderationAction === null || body.moderationAction === ""
      ? "NONE"
      : assertRequiredEnumString(body.moderationAction, MESSAGE_MODERATION_ACTIONS, "moderationAction");
  if (nextStatus === "IN_REVIEW" || nextStatus === "DISMISSED") {
    moderationAction = "NONE";
  }

  const parsedReviewNote = assertOptionalString(body.reviewNote, "reviewNote", 1000);
  if (body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== "") {
    parsePositiveDurationMinutes(body.durationMinutes);
  }

  const txResult = await runInTx(async (dbSession) => {
    const current = await MessageModerationReport.findById(reportId).session(dbSession);
    if (!current) throw reportNotFound();

    const allowedNext = REPORT_TRANSITIONS[current.status] || [];
    if (!allowedNext.includes(nextStatus)) {
      throw new AppError(
        `A ${current.status} message report cannot transition to ${nextStatus}`,
        "INVALID_REPORT_STATUS",
        409
      );
    }

    const beforeStatus = current.status;
    const note = parsedReviewNote || current.reviewNote || null;

    if (nextStatus === "RESOLVED" && moderationAction !== "NONE") {
      if (["LOCK_CHANNEL", "MUTE_USER"].includes(moderationAction) && current.channelType !== "CLASS") {
        throw validationError("LOCK_CHANNEL and MUTE_USER moderation actions are only available on CLASS channels");
      }
    }

    // Atomic CAS lock on report status inside transaction
    const locked = await MessageModerationReport.findOneAndUpdate(
      { _id: reportId, status: beforeStatus },
      {
        $set: {
          status: nextStatus,
          moderationActionTaken: moderationAction,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      },
      { session: dbSession, returnDocument: "after" }
    );
    if (!locked) {
      throw new AppError("Message report state changed concurrently", "INVALID_REPORT_STATUS", 409);
    }

    let muteNotifyPayload = null;
    if (nextStatus === "RESOLVED" && moderationAction !== "NONE") {
      if (moderationAction === "HIDE_MESSAGE") {
        const msg = await Message.findById(current.messageId).session(dbSession);
        if (msg) await applyHideMessage(msg, adminId, "ADMIN", note, dbSession);
      } else if (moderationAction === "RESTORE_MESSAGE") {
        const msg = await Message.findById(current.messageId).session(dbSession);
        if (msg && msg.isDeleted) {
          throw new AppError(
            "Message was already recalled by sender and cannot be restored to visible",
            "MESSAGE_ALREADY_RECALLED",
            409
          );
        }
        if (msg) await applyRestoreMessage(msg, adminId, "ADMIN", dbSession);
      } else if (moderationAction === "LOCK_CHANNEL") {
        const conv = await Conversation.findById(current.conversationId).session(dbSession);
        if (conv && conv.channelType === "CLASS") {
          await applyChannelModerationSettings(conv, adminId, "ADMIN", { isLocked: true, reason: note }, dbSession);
        }
      } else if (moderationAction === "MUTE_USER") {
        const conv = await Conversation.findById(current.conversationId).session(dbSession);
        if (conv && conv.channelType === "CLASS") {
          const cls = await Class.findOne({ _id: conv.classId, ...NOT_DELETED }).session(dbSession).lean();
          if (cls) {
            const muteOut = await applyMuteParticipant(
              conv,
              cls,
              adminId,
              "ADMIN",
              current.reportedUserId,
              { reason: note, durationMinutes: body.durationMinutes },
              { dbSession, deferNotify: true }
            );
            muteNotifyPayload = muteOut.muteNotifyPayload;
          }
        }
      }
    } else if (nextStatus === "DISMISSED") {
      // Unflag message only if no other active reports exist on it and it was merely FLAGGED
      const msg = await Message.findById(current.messageId).session(dbSession);
      if (msg && msg.moderationStatus === "FLAGGED") {
        const otherOpen = await MessageModerationReport.findOne({
          messageId: msg._id,
          _id: { $ne: current._id },
          status: { $in: ["OPEN", "IN_REVIEW"] },
        })
          .select("_id")
          .session(dbSession)
          .lean();
        if (!otherOpen) {
          await Message.updateOne({ _id: msg._id }, { $set: { moderationStatus: "VISIBLE" } }, { session: dbSession });
        }
      }
    }

    await audit(
      {
        actorAdminId: adminId,
        action: `MESSAGE_REPORT_${nextStatus}`,
        targetType: "MessageModerationReport",
        targetId: current._id,
        beforeState: { status: beforeStatus },
        afterState: {
          status: nextStatus,
          moderationActionTaken: moderationAction,
          reviewNote: note,
        },
      },
      dbSession
    );

    return {
      reportId: current._id,
      reportCode: current.reportCode,
      reporterId: current.reporterId,
      note,
      muteNotifyPayload,
    };
  });

  if (txResult.muteNotifyPayload) {
    await notify(
      txResult.muteNotifyPayload.userId,
      txResult.muteNotifyPayload.title,
      txResult.muteNotifyPayload.content,
      txResult.muteNotifyPayload.type
    );
  }
  if (["RESOLVED", "DISMISSED"].includes(nextStatus)) {
    await notify(
      txResult.reporterId,
      `[${txResult.reportCode}] Kết quả xử lý báo cáo tin nhắn`,
      txResult.note,
      `MESSAGE_REPORT_${nextStatus}`
    );
  }

  return adminGetMessageReport(txResult.reportId);
};

const adminUpdateClassConversationModeration = async (adminId, classId, body = {}) => {
  if (!isValidIdValue(classId)) {
    throw Array.isArray(classId) || isPlainObjectOrArray(classId)
      ? validationError("classId must be a valid ID")
      : CLASS_NOT_FOUND();
  }
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();
  if (body.isLocked === undefined && body.allowStudentPosts === undefined && body.status === undefined) {
    throw validationError("At least one of isLocked, allowStudentPosts, or status is required");
  }
  validateChannelModerationBody(body, "ADMIN");

  const ensured = await ensureClassConversationDoc(cls);
  const updatedConv = await runInTx(async (dbSession) => {
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();

    const beforeState = {
      status: freshConv.status,
      isLocked: Boolean(freshConv.moderation?.isLocked),
      allowStudentPosts: freshConv.moderation?.allowStudentPosts !== false,
    };

    const nextConv = await applyChannelModerationSettings(freshConv, adminId, "ADMIN", body, dbSession);

    await audit(
      {
        actorAdminId: adminId,
        action: "CLASS_CONVERSATION_MODERATED",
        targetType: "Conversation",
        targetId: nextConv._id,
        beforeState,
        afterState: {
          status: nextConv.status,
          isLocked: Boolean(nextConv.moderation?.isLocked),
          allowStudentPosts: nextConv.moderation?.allowStudentPosts !== false,
          lockedReason: nextConv.moderation?.lockedReason || null,
        },
      },
      dbSession
    );

    return nextConv;
  });

  return staffClassConversationSummary(updatedConv.toObject(), cls, "ADMIN");
};

const adminMuteClassParticipant = async (adminId, classId, body = {}) => {
  if (!isValidIdValue(classId)) {
    throw Array.isArray(classId) || isPlainObjectOrArray(classId)
      ? validationError("classId must be a valid ID")
      : CLASS_NOT_FOUND();
  }
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();
  const targetUserId = body.userId || body.studentId;
  if (!targetUserId) throw validationError("userId is required");

  const ensured = await ensureClassConversationDoc(cls);
  const txOut = await runInTx(async (dbSession) => {
    const freshCls = await Class.findOne({ _id: classId, ...NOT_DELETED }).session(dbSession).lean();
    if (!freshCls) throw CLASS_NOT_FOUND();
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();

    const muteOut = await applyMuteParticipant(freshConv, freshCls, adminId, "ADMIN", targetUserId, body, {
      dbSession,
      deferNotify: true,
    });

    await audit(
      {
        actorAdminId: adminId,
        action: "CLASS_PARTICIPANT_MUTED",
        targetType: "Conversation",
        targetId: muteOut.conversation._id,
        beforeState: null,
        afterState: { mutedUserId: toId(targetUserId), reason: muteOut.reason },
      },
      dbSession
    );

    return muteOut;
  });

  if (txOut.muteNotifyPayload) {
    await notify(
      txOut.muteNotifyPayload.userId,
      txOut.muteNotifyPayload.title,
      txOut.muteNotifyPayload.content,
      txOut.muteNotifyPayload.type
    );
  }

  return staffClassConversationSummary(txOut.conversation.toObject(), cls, "ADMIN");
};

const adminUnmuteClassParticipant = async (adminId, classId, targetUserId) => {
  if (!isValidIdValue(classId)) {
    throw Array.isArray(classId) || isPlainObjectOrArray(classId)
      ? validationError("classId must be a valid ID")
      : CLASS_NOT_FOUND();
  }
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const ensured = await ensureClassConversationDoc(cls);
  const updatedConv = await runInTx(async (dbSession) => {
    const freshConv = await Conversation.findById(ensured._id).session(dbSession);
    if (!freshConv) throw conversationNotFound();

    const nextConv = await applyUnmuteParticipant(freshConv, adminId, "ADMIN", targetUserId, dbSession);

    await audit(
      {
        actorAdminId: adminId,
        action: "CLASS_PARTICIPANT_UNMUTED",
        targetType: "Conversation",
        targetId: nextConv._id,
        beforeState: { mutedUserId: toId(targetUserId) },
        afterState: { mutedUserId: null },
      },
      dbSession
    );

    return nextConv;
  });

  return staffClassConversationSummary(updatedConv.toObject(), cls, "ADMIN");
};

const adminModerateMessage = async (adminId, messageId, body = {}) => {
  if (!isValidIdValue(messageId)) throw messageNotFound();
  const action = assertRequiredEnumString(body.action, ["HIDE", "RESTORE"], "action");
  if (action === "HIDE" && isBlank(body.reason)) {
    throw validationError("reason is required when hiding a message");
  }
  const cleanReason = action === "HIDE" ? body.reason.trim().slice(0, 500) : null;

  const updatedMsg = await runInTx(async (dbSession) => {
    const message = await Message.findById(messageId).session(dbSession);
    if (!message) throw messageNotFound();
    if (action === "RESTORE") {
      if (message.isDeleted) {
        throw new AppError("Message was recalled by sender and cannot be restored", "MESSAGE_ALREADY_RECALLED", 409);
      }
      if (message.moderationStatus !== "HIDDEN_BY_MODERATOR") {
        throw new AppError("Message is not currently hidden by moderator", "MESSAGE_NOT_HIDDEN", 409);
      }
    }
    const beforeState = {
      moderationStatus: message.moderationStatus || "VISIBLE",
      hiddenReason: message.hiddenReason || null,
    };

    const nextMsg =
      action === "HIDE"
        ? await applyHideMessage(message, adminId, "ADMIN", cleanReason, dbSession)
        : await applyRestoreMessage(message, adminId, "ADMIN", dbSession);

    await audit(
      {
        actorAdminId: adminId,
        action: `MESSAGE_${action}`,
        targetType: "Message",
        targetId: nextMsg._id,
        beforeState,
        afterState: {
          moderationStatus: nextMsg.moderationStatus,
          hiddenReason: nextMsg.hiddenReason || null,
        },
      },
      dbSession
    );

    return nextMsg;
  });

  return presentMessage(updatedMsg.toObject(), { includeModeratedBy: true });
};

module.exports = {
  openConversation,
  openOrGetClassConversation,
  listMyConversations,
  listMessages,
  listClassMessages,
  sendMessage,
  sendClassMessage,
  deleteMessage,
  reportMessage,
  getMyMessageReports,
  teacherUpdateClassConversationModeration,
  teacherMuteClassParticipant,
  teacherUnmuteClassParticipant,
  teacherModerateMessage,
  adminListMessageReports,
  adminGetMessageReport,
  adminReviewMessageReport,
  adminUpdateClassConversationModeration,
  adminMuteClassParticipant,
  adminUnmuteClassParticipant,
  adminModerateMessage,
};
