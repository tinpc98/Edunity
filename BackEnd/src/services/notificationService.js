const Notification = require("../models/Notification");
const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { assertId, paged } = require("../utils/http");

/**
 * Database-based notification (mục 11.9). Notifications are a side effect:
 * a failure here must never break the business operation that triggered it.
 */
const notify = async (userId, title, content, type) => {
  try {
    await Notification.create({ userId, title, content, type });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
};

const notifyAdmins = async (title, content, type) => {
  try {
    const admins = await User.find({ role: "ADMIN", status: "ACTIVE", isDeleted: { $ne: true } }).select("_id").lean();
    if (!admins.length) return;
    await Notification.insertMany(admins.map((admin) => ({ userId: admin._id, title, content, type })));
  } catch (err) {
    console.error("Failed to notify admins:", err.message);
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

module.exports = { notify, notifyAdmins, getMyNotifications, markAsRead, markAllAsRead };
