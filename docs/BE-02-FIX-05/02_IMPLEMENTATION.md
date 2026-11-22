# IMPLEMENTATION DETAILS — BE-02-FIX-05
**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 Maintenance & Reliability Hardening  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Tổng quan các file thay đổi

Các chỉnh sửa kỹ thuật trong đợt patch BE-02-FIX-05 được thực hiện tập trung, chuẩn xác và không gây side-effect sang các module khác:

| File | Thành phần | Thay đổi chính |
|---|---|---|
| [JobLock.js](file:///c:/CODE/Edunity/BackEnd/src/models/JobLock.js) | Model | Thêm trường `fencingToken: { type: Number, default: 0, min: 0 }`. |
| [jobLock.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/jobLock.js) | Distributed Lock Engine | Nâng cấp `verifyOwnership` hỗ trợ write lock với `$inc: { fencingToken: 1 }` khi có `session`, tích hợp `verifyOwnership(session)` vào `lockContext`. |
| [notificationService.js](file:///c:/CODE/Edunity/BackEnd/src/services/notificationService.js) | Service | Chuẩn hóa `retryFailedNotifications(options)`: bắt buộc `options.deliveryHandler` trước khi chuyển `DELIVERED`. Không có handler thì ghi nhận `skipped` với reason `"NO_DELIVERY_HANDLER"`. |
| [maintenanceJob.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js) | Scheduled Job | Gọi `verifyOwnership(session)` trước và trong transaction; bọc try/catch per-candidate trong `recoverMissingExpiredClassNotifications` và trả về `errors: [{ classId, auditId, error }]`. |
| [be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js) | Test Suite | Tái cấu trúc thành 17 test cases độc lập, kiểm thử sâu 3 FIX items cùng toàn bộ invariant nghiệp vụ. |

---

## 2. Chi tiết triển khai

### 2.1. FIX-01 — Chuẩn hóa ngữ nghĩa Notification Retry (`notificationService.js`)

#### Nguyên tắc:
1. Thông báo trong Edunity là DB inbox.
2. Nếu không có `deliveryHandler` bên ngoài (như email adapter, SMS, push gateway), việc retry không được tự tiện chuyển trạng thái `FAILED` -> `DELIVERED`.
3. Cron mặc định (`cronJobs.js`) gọi hàm không truyền handler -> các thông báo `FAILED` phải được giữ nguyên là `FAILED`, đánh dấu `skipped` kèm lý do `"NO_DELIVERY_HANDLER"`.
4. Khi có `deliveryHandler` được cung cấp:
   - Handler thực thi thành công -> chuyển trạng thái thành `DELIVERED`, cập nhật `deliveredAt = now`.
   - Handler ném exception -> tăng `retryCount`, ghi nhận `lastError = err.message`, nếu vượt `maxRetries` (3) thì giữ `FAILED`.

#### Code thực tế:
```javascript
async function retryFailedNotifications(options = {}) {
  const maxRetries = options.maxRetries || 3;
  const batchSize = options.batchSize || 50;
  const deliveryHandler =
    typeof options.deliveryHandler === "function"
      ? options.deliveryHandler
      : null;

  const failedNotifications = await Notification.find({
    status: "FAILED",
    retryCount: { $lt: maxRetries },
  })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  let retriedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const notification of failedNotifications) {
    if (!deliveryHandler) {
      skippedCount += 1;
      results.push({
        notificationId: notification._id,
        status: "SKIPPED",
        reason: "NO_DELIVERY_HANDLER",
        retryCount: notification.retryCount,
      });
      continue;
    }

    try {
      await deliveryHandler(notification);
      notification.retryCount += 1;
      notification.status = "DELIVERED";
      notification.deliveredAt = new Date();
      notification.lastError = null;
      await notification.save();

      retriedCount += 1;
      results.push({
        notificationId: notification._id,
        status: "DELIVERED",
        retryCount: notification.retryCount,
      });
    } catch (err) {
      notification.retryCount += 1;
      notification.lastError = err.message;
      notification.status = "FAILED";
      await notification.save();

      failedCount += 1;
      results.push({
        notificationId: notification._id,
        status: "FAILED",
        error: err.message,
        retryCount: notification.retryCount,
      });
    }
  }

  return {
    processed: failedNotifications.length,
    retriedCount,
    skippedCount,
    failedCount,
    results,
  };
}
```

---

### 2.2. FIX-02 — Distributed Lock Safety & Fencing Token (`JobLock.js`, `jobLock.js`, `maintenanceJob.js`)

#### Cơ chế Fencing Token:
Trong `src/models/JobLock.js`, thêm trường:
```javascript
fencingToken: {
  type: Number,
  default: 0,
  min: 0,
}
```

Trong `src/jobs/jobLock.js`, hàm `verifyOwnership(name, owner, session = null)` được cập nhật:
```javascript
async function verifyOwnership(name, owner, session = null) {
  const now = new Date();
  if (session) {
    // Thực hiện atomic write lock bên trong MongoDB Transaction
    const lock = await JobLock.findOneAndUpdate(
      { name, owner, lockedUntil: { $gt: now } },
      { $inc: { fencingToken: 1 } },
      { session, new: true }
    );
    return lock ? { valid: true, fencingToken: lock.fencingToken } : { valid: false };
  }

  // Đọc snapshot ngoài transaction (pre-transaction check)
  const lock = await JobLock.findOne({
    name,
    owner,
    lockedUntil: { $gt: now },
  });
  return lock ? { valid: true, fencingToken: lock.fencingToken } : { valid: false };
}
```

Trong `maintenanceJob.js`, quy trình từ chối lớp học tận dụng triệt để cơ chế này:
```javascript
// 1. Pre-transaction check ngoài session
const preCheck = await verifyOwnership();
if (!preCheck || !preCheck.valid) {
  throw new Error(`LOCK_OWNERSHIP_LOST: Lost distributed lock before transaction for ${jobName}`);
}

// 2. Chạy transaction với Fencing Token write lock
await session.withTransaction(async () => {
  // Ghi nhận write lock trên JobLock document ngay đầu transaction
  const inTxCheck = await verifyOwnership(session);
  if (!inTxCheck || !inTxCheck.valid) {
    const err = new Error(
      `Lock fencing error: distributed lock "${jobName}" is no longer owned by ${instanceId}`
    );
    err.code = "LOCK_FENCING_FAILED";
    throw err;
  }

  // 3. Thực hiện conditional update trên Class
  // 4. Ghi AuditLog
  // 5. Ghi Notification
});
```

**Lợi ích kỹ thuật:**
- Nếu lock của worker hết hạn hoặc bị worker khác cướp, câu lệnh `findOneAndUpdate` với điều kiện `{ name, owner, lockedUntil: { $gt: now } }` sẽ trả về `null`.
- Transaction ném lỗi và abort ngay lập tức, không có bất kỳ thay đổi nào trên `Class`, `AuditLog`, hay `Notification` được commit ra database.
- Bất kỳ thao tác concurrent write nào trên `JobLock` giữa 2 transaction đều được MongoDB WiredTiger phát hiện và xử lý chuẩn xác.

---

### 2.3. FIX-03 — Recovery Error Handling & Resilience (`maintenanceJob.js`)

Trong `recoverMissingExpiredClassNotifications`, mỗi ứng viên trong keyset batch được xử lý trong một khối `try/catch` độc lập:
```javascript
for (const candidate of candidates) {
  const classId = candidate.entityId;
  const auditId = candidate._id;

  try {
    const existingNotification = await Notification.findOne({
      recipient: candidate.recipientId,
      type: "CLASS_EXPIRED",
      "metadata.classId": classId,
    });

    if (existingNotification) {
      continue;
    }

    const cls = await Class.findById(classId).select("_id code title instructor").lean();
    if (!cls) continue;

    await Notification.create({
      recipient: cls.instructor,
      type: "CLASS_EXPIRED",
      title: "Lớp học đã bị từ chối do quá hạn",
      message: `Lớp học ${cls.code} - ${cls.title} đã bị hệ thống tự động từ chối do quá thời hạn phê duyệt.`,
      metadata: { classId: cls._id, autoExpired: true, recoveredAt: new Date() },
      status: "DELIVERED",
      deliveredAt: new Date(),
    });

    recovered += 1;
    recoveredIds.push(classId.toString());
  } catch (notifyErr) {
    console.error(
      `[maintenanceJob] Failed to recover notification for class ${classId}:`,
      notifyErr.message
    );
    errors.push({
      classId: classId ? classId.toString() : null,
      auditId: auditId ? auditId.toString() : null,
      error: notifyErr.message,
    });
    // Không ném lỗi ra ngoài; tiếp tục xử lý các candidate kế tiếp trong batch!
  }
}
```

Kết quả trả về của hàm:
```javascript
return {
  scanned: totalScanned,
  recovered,
  recoveredIds,
  errors, // Danh sách lỗi có cấu trúc giúp admin theo dõi
};
```
