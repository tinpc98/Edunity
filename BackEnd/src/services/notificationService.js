const Notification = require("../models/Notification");
const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { assertId, paged } = require("../utils/http");

/**
 * Database-based notification (mục 11.9). Notifications are a side effect:
 * a failure here must never break the business operation that triggered it.
 */
const notify = async (userId, title, content, type, options = {}) => {
  try {
    const {
      dedupeKey = null,
      sessionId = null,
      deliveryStatus = "DELIVERED",
      throwOnError = false,
      session = null,
    } = options || {};

    if (dedupeKey) {
      const opts = { upsert: true, returnDocument: "after" };
      if (session) opts.session = session;

      const doc = await Notification.findOneAndUpdate(
        { userId, dedupeKey },
        {
          $setOnInsert: {
            userId,
            title,
            content,
            type,
            dedupeKey,
            sessionId,
            deliveryStatus,
            retryCount: 0,
            lastError: null,
          },
        },
        opts
      );
      return { success: true, notification: doc && doc.toObject ? doc.toObject() : doc };
    }

    if (session) {
      const [doc] = await Notification.create(
        [
          {
            userId,
            title,
            content,
            type,
            sessionId,
            deliveryStatus,
            retryCount: 0,
            lastError: null,
          },
        ],
        { session }
      );
      return { success: true, notification: doc ? doc.toObject() : null };
    }

    const doc = await Notification.create({
      userId,
      title,
      content,
      type,
      sessionId,
      deliveryStatus,
      retryCount: 0,
      lastError: null,
    });
    return { success: true, notification: doc ? doc.toObject() : null };
  } catch (err) {
    if (err && err.code === 11000) {
      const findOpts = {};
      if (options?.session) findOpts.session = options.session;
      const existing = await Notification.findOne(
        { userId, dedupeKey: options?.dedupeKey },
        null,
        findOpts
      );
      return {
        success: true,
        notification: existing && existing.toObject ? existing.toObject() : existing,
        deduplicated: true,
      };
    }
    console.error("Failed to create notification:", err.message);
    if (options && options.throwOnError) {
      throw err;
    }
    return { success: false, error: err.message };
  }
};

/**
 * FIX-01 (BE-02-FIX-05): Notification Retry Semantics.
 * Edunity Notification is a DB inbox where deliveryStatus reflects real delivery status.
 * If external delivery is required or a notification is in FAILED status, retrying requires
 * a delivery handler to perform the transmission.
 * When `options.deliveryHandler` is not provided (e.g. default cron sweep without a delivery channel),
 * the notification CANNOT be declared DELIVERED and remains FAILED (recorded in `skipped`).
 * When `options.deliveryHandler` is provided:
 * - If handler succeeds: notification transitions to DELIVERED, lastError is cleared, retriedAt updated.
 * - If handler throws: notification remains FAILED, retryCount increments, lastError updated.
 */
const retryFailedNotifications = async (options = {}) => {
  const maxRetries = options.maxRetries !== undefined ? Number(options.maxRetries) : 3;
  const limit = options.limit !== undefined ? Number(options.limit) : 25;
  const deliveryHandler = typeof options.deliveryHandler === "function" ? options.deliveryHandler : null;

  const failedDocs = await Notification.find({
    deliveryStatus: "FAILED",
    retryCount: { $lt: maxRetries },
  })
    .sort({ updatedAt: 1 })
    .limit(limit);

  const retried = [];
  const errors = [];
  const skipped = [];

  for (const notif of failedDocs) {
    // FIX-01: Without an actual delivery handler, do NOT fake delivery by changing FAILED to DELIVERED
    if (!deliveryHandler) {
      skipped.push({
        notificationId: notif._id.toString(),
        reason: "NO_DELIVERY_HANDLER",
      });
      continue;
    }

    try {
      await deliveryHandler(notif);
      notif.deliveryStatus = "DELIVERED";
      notif.lastError = null;
      notif.retriedAt = new Date();
      await notif.save();
      retried.push(notif._id.toString());
    } catch (err) {
      notif.retryCount += 1;
      notif.lastError = err.message;
      notif.deliveryStatus = "FAILED";
      await notif.save().catch(() => {});
      errors.push({ notificationId: notif._id.toString(), error: err.message });
    }
  }

  return {
    retriedCount: retried.length,
    retried,
    skippedCount: skipped.length,
    skipped,
    errors,
  };
};

const notifyOnce = async (userId, title, content, type, dedupeKey, sessionId = null) =>
  notify(userId, title, content, type, { dedupeKey, sessionId });

const notifyAdmins = async (title, content, type, options = {}) => {
  try {
    const { dedupeKey = null, sessionId = null } = options || {};
    const admins = await User.find({ role: "ADMIN", status: "ACTIVE", isDeleted: { $ne: true } }).select("_id").lean();
    if (!admins.length) return;
    if (dedupeKey) {
      await Promise.all(
        admins.map((admin) =>
          notify(admin._id, title, content, type, {
            dedupeKey: `${dedupeKey}:admin:${admin._id.toString()}`,
            sessionId,
          })
        )
      );
      return;
    }
    await Notification.insertMany(admins.map((admin) => ({ userId: admin._id, title, content, type, sessionId })));
  } catch (err) {
    console.error("Failed to notify admins:", err.message);
  }
};

const notifyAdminsOnce = async (title, content, type, dedupeKey, sessionId = null) =>
  notifyAdmins(title, content, type, { dedupeKey, sessionId });

/**
 * Tells the Teacher that a student is now enrolled (free enrollment, completed payment or scholarship payment).
 * Looks the enrollment up itself so callers only pass the id. Best effort, like every notification.
 */
const notifyTeacherOfEnrollment = async (enrollmentId) => {
  try {
    if (!enrollmentId) return;
    const mongoose = require("mongoose");
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
    const Enrollment = require("../models/Enrollment");
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("classId", "className")
      .populate("studentId", "studentProfile.fullName email")
      .lean();
    if (!enrollment || !enrollment.teacherId) return;
    const studentName = enrollment.studentId?.studentProfile?.fullName || enrollment.studentId?.email || "Một học viên";
    const className = enrollment.classId?.className || "lớp học";
    await notify(
      enrollment.teacherId,
      "Có học viên mới đăng ký",
      `${studentName} vừa đăng ký lớp "${className}".`,
      "NEW_ENROLLMENT",
      { dedupeKey: `enrollment:${enrollment._id}:teacher:new` }
    );
  } catch (err) {
    console.error("Failed to notify teacher of enrollment:", err.message);
  }
};

const getMyNotifications = async (userId, paging, unreadOnly) => {
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return { ...paged(items, total, paging), unreadCount };
};

const markAsRead = async (userId, notificationId) => {
  assertId(notificationId, "Notification not found", "NOTIFICATION_NOT_FOUND");
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: "after" }
  ).lean();
  if (!notification) throw new AppError("Notification not found", "NOTIFICATION_NOT_FOUND", 404);
  return notification;
};

const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
  return { updated: result.modifiedCount };
};

module.exports = {
  notify,
  retryFailedNotifications,
  notifyTeacherOfEnrollment,
  notifyOnce,
  notifyAdmins,
  notifyAdminsOnce,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
