# BE-02-FIX-04: Chi Tiết Triển Khai Kỹ Thuật (Implementation Details)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Hardening & Final Reliability (BE-02-FIX-04)  
**Tài liệu:** Kiến trúc giải pháp & Các thay đổi mã nguồn  

---

## 1. Tổng Quan Phạm Vi Sửa Đổi

Các chỉnh sửa được thực hiện tập trung trên 3 file nguồn và 1 file kiểm thử chuyên sâu:
1. [BackEnd/src/jobs/jobLock.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/jobLock.js): Thêm cơ chế Fencing `verifyOwnership`.
2. [BackEnd/src/services/notificationService.js](file:///c:/CODE/Edunity/BackEnd/src/services/notificationService.js): Chuẩn hóa retry semantics với `deliveryHandler`.
3. [BackEnd/src/jobs/maintenanceJob.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js): Tích hợp Lock Fencing và Keyset Pagination cho Recovery Scan.
4. [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js): Bộ test suite toàn diện kiểm chứng 10 yêu cầu kỹ thuật.

---

## 2. Chi Tiết Triển Khai

### 2.1. FIX-01: Chuẩn Hóa Notification Retry Semantics (`notificationService.js`)
Hàm `retryFailedNotifications` nhận thêm tham số `options.deliveryHandler`:
```javascript
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

  for (const notif of failedDocs) {
    try {
      // FIX-01: Nếu có kênh truyền tin thực tế, thực thi thao tác truyền tin
      if (deliveryHandler) {
        await deliveryHandler(notif);
      }

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

  return { retriedCount: retried.length, retried, errors };
};
```
- Nếu `deliveryHandler` ném lỗi (ví dụ cổng thông báo bên ngoài gặp sự cố): Trạng thái bản ghi được giữ nguyên `FAILED`, `retryCount` tăng lên 1, lưu vết `lastError`.
- Nếu thành công: Cập nhật `DELIVERED`, xóa lỗi và ghi nhận `retriedAt`.

---

### 2.2. FIX-02: Quét Phục Hồi An Toàn Bằng Keyset Pagination (`maintenanceJob.js`)
Loại bỏ regex trên `reviewNote`, chuyển sang truy vấn `AuditLog` với `action: "CLASS_EXPIRED_REJECTED"` kết hợp Keyset Pagination:
```javascript
const recoverMissingExpiredClassNotifications = async (now = new Date(), options = {}) => {
  const { lockContext = null, batchSize = 100 } = options || {};

  if (
    lockContext &&
    typeof lockContext.isLeaseActive === "function" &&
    !lockContext.isLeaseActive()
  ) {
    return { count: 0, recoveredCount: 0, recovered: [], abortedDueToLeaseLoss: true };
  }

  const recovered = [];
  let lastId = options?.lastAuditId || null;
  let hasMore = true;

  while (hasMore) {
    if (
      lockContext &&
      typeof lockContext.isLeaseActive === "function" &&
      !lockContext.isLeaseActive()
    ) {
      break;
    }

    const query = {
      action: "CLASS_EXPIRED_REJECTED",
      targetType: "Class",
    };
    if (lastId) {
      query._id = { $gt: lastId };
    }

    const auditEntries = await AuditLog.find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!auditEntries || auditEntries.length === 0) {
      hasMore = false;
      break;
    }

    for (const entry of auditEntries) {
      lastId = entry._id; // Luôn tịnh tiến con trỏ keyset!

      const classId = entry.targetId;
      if (!classId) continue;

      const dedupeKey = `CLASS_EXPIRED_REJECTED:${classId.toString()}`;
      const existingNotif = await Notification.findOne({ dedupeKey }).lean();
      if (existingNotif) {
        continue;
      }

      const cls = await Class.findById(classId).select("_id teacherId className status").lean();
      if (!cls || cls.status !== "REJECTED") {
        continue;
      }

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

    if (options && options.singleBatch) {
      break;
    }
    if (auditEntries.length < batchSize) {
      hasMore = false;
    }
  }

  return { recoveredCount: recovered.length, recovered, lastAuditId: lastId };
};
```
- **Không bao giờ bị Batch Hogging:** Dù 50 hoặc 1,000 bản ghi đầu tiên đã có notification, con trỏ `lastId` liên tục tịnh tiến sang các batch tiếp theo.
- **Bảo vệ tuyệt đối lớp từ chối thủ công:** Các lớp do Admin từ chối có action `CLASS_REJECTED`, hoàn toàn nằm ngoài bộ lọc của query `action: "CLASS_EXPIRED_REJECTED"`.

---

### 2.3. FIX-03: Kiểm Tra Lease & Lock Fencing (`jobLock.js` & `maintenanceJob.js`)
Trong `jobLock.js`:
```javascript
const verifyOwnership = async (name, instanceId = INSTANCE_ID, session = null) => {
  const now = new Date();
  const query = JobLock.findOne({
    name,
    owner: instanceId,
    lockedUntil: { $gt: now },
  });
  if (session) query.session(session);
  const lock = await query.lean();
  return Boolean(lock);
};
```
Được tích hợp vào `lockContext` và truyền vào `rejectExpiredPendingClasses`:
1. **Kiểm tra trước khi mở Transaction:**
   ```javascript
   if (options.lockContext && typeof options.lockContext.verifyOwnership === "function") {
     const isOwner = await options.lockContext.verifyOwnership();
     if (!isOwner) {
       console.warn(`[maintenanceJob] Aborting class rejection loop: lock ownership verification failed`);
       break;
     }
   }
   ```
2. **Lock Fencing bên trong Session của Transaction:**
   ```javascript
   await session.withTransaction(async () => {
     if (options.lockContext && typeof options.lockContext.verifyOwnership === "function") {
       const isStillOwner = await options.lockContext.verifyOwnership(session);
       if (!isStillOwner) {
         const fencingErr = new Error(
           `Lock fencing error: distributed lock "${options.lockContext.name}" is no longer owned by ${options.lockContext.instanceId}`
         );
         fencingErr.code = "LOCK_FENCING_FAILED";
         throw fencingErr; // Hủy transaction lập tức
       }
     }
     // ... Thực hiện Class update, AuditLog, Notification
   });
   ```
- Nếu lease bị worker khác cướp khi transaction đang thực thi dở, `verifyOwnership(session)` trả về `false`, kích hoạt lỗi `LOCK_FENCING_FAILED` và rollback toàn bộ transaction. Worker bị mất khóa lập tức `break` vòng lặp và nhường quyền cho worker mới.
