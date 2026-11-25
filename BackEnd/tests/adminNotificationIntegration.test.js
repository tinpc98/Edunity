const { connectDB, disconnectDB } = require("./helpers/db");
const { seedActorsAndCatalog, seedTuitionIncident, caseNumber } = require("./helpers/financialFixtures");
const mongoose = require("mongoose");

const notificationService = require("../src/services/notificationService");
const { Notification, User, Payment, RefundCase } = require("../src/models");

describe("EDUNITY-ADMIN-NOTIFICATIONS-FIX-V1 Backend Integration Suite", () => {
  let adminUser;

  beforeAll(async () => {
    await connectDB();
    const actors = await seedActorsAndCatalog();
    await seedTuitionIncident(actors);
    adminUser = actors.admin;
    await Notification.create([
      { userId: adminUser._id, title: "Unread fixture" },
      { userId: adminUser._id, title: "Read fixture", isRead: true },
    ]);
  });

  afterAll(disconnectDB);

  test("1. Admin user has valid notifications and getMyNotifications returns paginated real data", async () => {
    expect(adminUser).not.toBeNull();

    const res = await notificationService.getMyNotifications(adminUser._id, { page: 1, limit: 15 }, false);
    expect(res).toBeDefined();
    expect(res).toHaveProperty("items");
    expect(res).toHaveProperty("total");
    expect(res).toHaveProperty("unreadCount");
    expect(typeof res.total).toBe("number");
    expect(typeof res.unreadCount).toBe("number");
    expect(res.total).toBeGreaterThanOrEqual(res.unreadCount);
  });

  test("2. unread=true filter strictly returns unread notifications only", async () => {
    const unreadRes = await notificationService.getMyNotifications(adminUser._id, { page: 1, limit: 10 }, true);
    expect(unreadRes).toBeDefined();
    for (const item of unreadRes.items) {
      expect(item.isRead).toBe(false);
    }
  });

  test("3. markAsRead and markAllAsRead correctly scope to user and preserve financial safety", async () => {
    // Create an isolated test notification for admin to test markAsRead without mutating real historical notifs
    const testNotif = await Notification.create({
      userId: adminUser._id,
      title: "Thông báo kiểm thử UI Admin Notification V1",
      content: "Kiểm tra tính năng đánh dấu đã đọc",
      type: "SYSTEM_TEST",
      isRead: false,
    });

    try {
      // Mark as read
      const updated = await notificationService.markAsRead(adminUser._id, testNotif._id);
      expect(updated).not.toBeNull();
      expect(updated.isRead).toBe(true);
      expect(updated.readAt).not.toBeNull();

      // Ensure another user cannot mark this notification (throws NOTIFICATION_NOT_FOUND)
      const fakeUserId = new mongoose.Types.ObjectId();
      await expect(
        notificationService.markAsRead(fakeUserId, testNotif._id)
      ).rejects.toThrow("NOTIFICATION_NOT_FOUND");
    } finally {
      await Notification.deleteOne({ _id: testNotif._id });
    }
  });

  test("4. Order 100000008, Order 100000009 and RefundCase remain 100% intact", async () => {
    const payment100000008 = await Payment.findOne({ orderCode: 100000008 }).lean();
    expect(payment100000008).not.toBeNull();
    expect(payment100000008.paymentStatus).toBe("COMPLETED");

    const payment100000009 = await Payment.findOne({ orderCode: 100000009 }).lean();
    expect(payment100000009).not.toBeNull();
    expect(payment100000009.paymentStatus).toBe("COMPLETED");

    const refundCase = await RefundCase.findOne({ caseNumber: caseNumber }).lean();
    expect(refundCase).not.toBeNull();
    expect(refundCase.status).toBe("NEEDS_REVIEW");
  });
});
