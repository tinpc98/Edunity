# BE-02-FIX-03: Chi Tiết Triển Khai (Implementation Details)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-03)  
**Tài liệu:** Hướng dẫn triển khai kỹ thuật & Mã nguồn sửa đổi  

---

## 1. Danh sách các file thay đổi (Modified Files)

Toàn bộ giải pháp được triển khai tinh gọn, chính xác trong phạm vi Backend, không thêm thư viện thứ ba và không sửa các module ngoài phạm vi:
1. [BackEnd/src/services/notificationService.js](file:///c:/CODE/Edunity/BackEnd/src/services/notificationService.js)
2. [BackEnd/src/jobs/maintenanceJob.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js)
3. [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)

---

## 2. Thay đổi tại `BackEnd/src/services/notificationService.js`

### 2.1. Hỗ trợ Session và Transaction trong hàm `notify`
Hàm `notify` được nâng cấp để truyền `session` vào các thao tác Mongoose (`findOneAndUpdate`, `create`, `findOne`):

```javascript
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
```

---

## 3. Thay đổi tại `BackEnd/src/jobs/maintenanceJob.js`

### 3.1. FIX-01 & FIX-02: Đưa Notification vào cùng Transaction với Class và AuditLog
Toàn bộ quy trình từ chối lớp quá hạn được thực thi trong cùng một `session.withTransaction`:

```javascript
await session.withTransaction(async () => {
  const doc = await Class.findOneAndUpdate(
    {
      _id: cls._id,
      status: "PENDING_APPROVAL",
      ...NOT_DELETED,
    },
    {
      $set: {
        status: "REJECTED",
        reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
        reviewedAt: now,
        updatedBy: null,
      },
    },
    { session, returnDocument: "after" }
  ).lean();

  if (!doc) return;

  // 1. AuditLog với SYSTEM actor được ghi trong cùng transaction
  await audit(
    {
      actorAdminId: null,
      actorType: "SYSTEM",
      action: "CLASS_EXPIRED_REJECTED",
      targetType: "Class",
      targetId: doc._id,
      beforeState: { status: "PENDING_APPROVAL" },
      afterState: {
        status: "REJECTED",
        reviewNote: doc.reviewNote,
        reason: "START_DATE_PASSED_WITHOUT_APPROVAL",
      },
    },
    session
  );

  // 2. Notification được lưu trữ nguyên tử trong cùng transaction (FIX-01)
  const dedupeKey = `CLASS_EXPIRED_REJECTED:${doc._id.toString()}`;
  await notify(
    doc.teacherId,
    "Lớp học bị từ chối tự động",
    `Lớp "${doc.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
    "CLASS_EXPIRED_REJECTED",
    {
      dedupeKey,
      session,
      deliveryStatus: "DELIVERED",
      throwOnError: true,
    }
  );

  committedDoc = doc;
});
```

### 3.2. FIX-03: Bổ sung Cơ chế Tự Phục Hồi Dữ Liệu Thiếu (`recoverMissingExpiredClassNotifications`)
Hàm phục hồi quét các lớp đã `REJECTED` do quá hạn nhưng chưa có notification để tạo bù:

```javascript
const recoverMissingExpiredClassNotifications = async (now = new Date(), options = {}) => {
  const { lockContext = null, limit = 50 } = options || {};

  if (
    lockContext &&
    typeof lockContext.isLeaseActive === "function" &&
    !lockContext.isLeaseActive()
  ) {
    console.warn(
      "[maintenanceJob] Aborting recoverMissingExpiredClassNotifications: lease lost"
    );
    return { count: 0, recovered: [], abortedDueToLeaseLoss: true };
  }

  const expiredClasses = await Class.find({
    status: "REJECTED",
    reviewNote: { $regex: /ngày khai giảng.*chưa được phê duyệt/i },
    ...NOT_DELETED,
  })
    .select("_id teacherId className reviewNote")
    .limit(limit)
    .lean();

  const recovered = [];
  for (const cls of expiredClasses) {
    if (
      lockContext &&
      typeof lockContext.isLeaseActive === "function" &&
      !lockContext.isLeaseActive()
    ) {
      break;
    }

    const dedupeKey = `CLASS_EXPIRED_REJECTED:${cls._id.toString()}`;
    const existingNotif = await Notification.findOne({
      userId: cls.teacherId,
      dedupeKey,
    }).lean();

    if (!existingNotif) {
      const res = await notify(
        cls.teacherId,
        "Lớp học bị từ chối tự động",
        `Lớp "${cls.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
        "CLASS_EXPIRED_REJECTED",
        {
          dedupeKey,
          deliveryStatus: "DELIVERED",
        }
      );
      if (res && res.success) {
        recovered.push(cls._id.toString());
      }
    }
  }

  return { recoveredCount: recovered.length, recovered };
};
```

### 3.3. Tích hợp vào `runMaintenanceJob`
```javascript
const steps = {
  classes: () => advanceClassStatuses(now),
  expiredPendingClasses: () =>
    rejectExpiredPendingClasses(now, { ...options, lockContext }),
  notificationRecovery: () =>
    recoverMissingExpiredClassNotifications(now, { ...options, lockContext }),
  scholarships: () => expireScholarships(now),
  expiredRecordings: () => expireOldRecordings(now),
  staleRecordings: () => failStaleProcessingRecordings(now),
  teacherReverification: () => runReverificationSweep(now),
  notificationRetry: () => retryFailedNotifications(),
};
```
