# BE-02-FIX-02: Chi Tiết Các Thay Đổi Triển Khai (Implementation Changes)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-02)  
**Tài liệu:** Implementation Guide & Code Diffs  

---

## 1. Tổng quan các file thay đổi

Các thay đổi mã nguồn tập trung vào 3 file chính trong `BackEnd/src` và 1 file kiểm thử chuyên sâu trong `BackEnd/tests`:
1. [BackEnd/src/jobs/jobLock.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/jobLock.js)
2. [BackEnd/src/services/notificationService.js](file:///c:/CODE/Edunity/BackEnd/src/services/notificationService.js)
3. [BackEnd/src/jobs/maintenanceJob.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js)
4. [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)

Không có file nào ngoài phạm vi trên bị chỉnh sửa. Không thay đổi code Frontend, Payment, Pricing Policy, LiveKit hay BE-03 Academic Soft Delete.

---

## 2. Chi tiết thay đổi tại `BackEnd/src/jobs/jobLock.js`

### 2.1. Quản lý trạng thái Lease và chống Heartbeat chồng lấn
- Khởi tạo biến theo dõi `leaseActive = true`, `lostReason = null`, và `inFlightHeartbeat = false`.
- Trong `heartbeatTimer`, kiểm tra cờ `inFlightHeartbeat`. Nếu đang có heartbeat chạy dở, bỏ qua lượt này để tránh chồng lấn.
- Kiểm tra kết quả trả về của `extend`:
  - Nếu `ok === false`: Đặt `leaseActive = false`, `lostReason = "LEASE_NOT_EXTENDED"`, ghi cảnh báo và hủy `heartbeatTimer`.
  - Nếu ném ngoại lệ: Đặt `leaseActive = false`, `lostReason = HEARTBEAT_ERROR: ...`, ghi lỗi và hủy `heartbeatTimer`.

### 2.2. Xây dựng và truyền `lockContext`
- Tạo đối tượng `lockContext`:
  ```javascript
  const lockContext = {
    name,
    instanceId,
    isLeaseActive: () => leaseActive,
    checkLeaseOrThrow: () => {
      if (!leaseActive) {
        const err = new Error(`Distributed lease lost for lock "${name}": ${lostReason || "UNKNOWN"}`);
        err.code = "LEASE_LOST";
        throw err;
      }
    },
    getLeaseState: () => ({
      leaseActive,
      lostReason,
      name,
      instanceId,
    }),
  };
  ```
- Gọi tác vụ: `const result = await task(lockContext);`.
- Đảm bảo tương thích ngược 100%: Các hàm không nhận tham số vẫn hoạt động bình thường mà không bị ảnh hưởng.

---

## 3. Chi tiết thay đổi tại `BackEnd/src/services/notificationService.js`

### 3.1. Hỗ trợ Session và Tùy chọn `throwOnError`
- Hàm `notify(payload, options = {})` được nâng cấp để hỗ trợ truyền `options.session` khi cần ghi trong transaction và cờ `options.throwOnError`.
- Đảm bảo các thuộc tính `deliveryStatus: "DELIVERED"`, `metadata`, `dedupeKey` được lưu trữ chuẩn xác.

### 3.2. Triển khai `retryFailedNotifications(options)`
- Tìm kiếm các thông báo chưa được gửi thành công:
  ```javascript
  const filter = {
    deliveryStatus: "FAILED",
  };
  const failedNotifications = await Notification.find(filter)
    .sort({ createdAt: 1 })
    .limit(limit);
  ```
- Duyệt qua từng bản ghi, thực hiện dispatch lại và cập nhật:
  ```javascript
  doc.deliveryStatus = "DELIVERED";
  doc.retriedAt = new Date();
  doc.retryCount = (doc.retryCount || 0) + 1;
  doc.lastError = null;
  await doc.save();
  ```
- Xuất khẩu hàm `retryFailedNotifications` trong `module.exports`.

---

## 4. Chi tiết thay đổi tại `BackEnd/src/jobs/maintenanceJob.js`

### 4.1. Loại bỏ hoàn toàn Unsafe Non-Transactional Fallback (FIX-01)
- Xóa bỏ hoàn toàn khối lệnh `else` trong `rejectExpiredPendingClasses`.
- Bắt buộc khởi tạo `mongoose.startSession()`:
  - Nếu `startSession()` ném lỗi hoặc trả về null: Ghi log lỗi và ném `Database session unavailable`.
  - Nếu session không có phương thức `withTransaction`: Ném `Database session does not support transactions`.
- Toàn bộ thao tác cập nhật trạng thái lớp học sang `REJECTED` và ghi bản ghi `AuditLog` được thực thi **nguyên tử** trong `session.withTransaction(...)`:
  ```javascript
  await session.withTransaction(async () => {
    committedDoc = await Class.findOneAndUpdate(
      { _id: cls._id, status: CLASS_STATUS.PENDING_APPROVAL },
      {
        $set: {
          status: CLASS_STATUS.REJECTED,
          reviewNote: "Lớp học bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.",
          reviewedAt: now,
        },
      },
      { new: true, session }
    );

    if (!committedDoc) return;

    await auditService.log({
      action: "CLASS_REJECTED",
      actorId: null,
      actorRole: "SYSTEM",
      resourceType: "Class",
      resourceId: committedDoc._id.toString(),
      before: { status: CLASS_STATUS.PENDING_APPROVAL },
      after: {
        status: CLASS_STATUS.REJECTED,
        reviewNote: committedDoc.reviewNote,
        reviewedAt: committedDoc.reviewedAt,
      },
      metadata: {
        reason: "AUTOMATIC_EXPIRATION_REJECTION",
        scheduledStartDate: committedDoc.startDate,
      },
      session,
    });
  });
  ```
- Đảm bảo `session.endSession()` luôn được gọi trong khối `finally`.

### 4.2. Tích hợp kiểm tra `lockContext` (FIX-02)
- Hàm `rejectExpiredPendingClasses` nhận tham số `(options = {}, lockContext = null)`.
- Trước khi duyệt danh sách các lớp quá hạn:
  ```javascript
  if (lockContext && typeof lockContext.isLeaseActive === "function" && !lockContext.isLeaseActive()) {
    console.warn("[maintenanceJob] Aborting rejectExpiredPendingClasses: lease lost before candidate loop");
    return { count: rejected.length, rejected, abortedDueToLeaseLoss: true };
  }
  ```
- Bên trong vòng lặp từng ứng viên, tiếp tục kiểm tra `lockContext.isLeaseActive()`. Nếu mất lease, ngay lập tức `break` vòng lặp.
- Trong `runMaintenanceJob(options = {}, lockContext = null)`, kiểm tra `lockContext.isLeaseActive()` trước khi thực thi từng bước lớn (`classes`, `notificationRetry`, v.v.). Nếu mất lease, đánh dấu bước bị bỏ qua (`{ skipped: true, reason: "LEASE_LOST" }`) và kết thúc an toàn.

### 4.3. Đảm bảo độ tin cậy thông báo Post-Commit (FIX-03)
- Thông báo chỉ được gửi sau khi transaction đã commit thành công.
- Được bọc trong khối `try/catch` độc lập:
  ```javascript
  try {
    await notificationService.notify({
      userId: committedDoc.teacherId,
      type: "CLASS_STATUS_UPDATED",
      title: "Lớp học bị từ chối tự động",
      message: `Lớp học "${committedDoc.title}" đã bị từ chối tự động...`,
      metadata: { classId: committedDoc._id, newStatus: CLASS_STATUS.REJECTED },
      dedupeKey: `expired_class_rejected:${committedDoc._id}`,
    });
  } catch (notifyErr) {
    console.error(`[maintenanceJob] Failed to send notification for expired class ${committedDoc._id}:`, notifyErr.message);
    try {
      await Notification.create({
        userId: committedDoc.teacherId,
        type: "CLASS_STATUS_UPDATED",
        title: "Lớp học bị từ chối tự động",
        message: `Lớp học "${committedDoc.title}" đã bị từ chối tự động...`,
        deliveryStatus: "FAILED",
        lastError: notifyErr.message,
        metadata: { classId: committedDoc._id, newStatus: CLASS_STATUS.REJECTED },
        dedupeKey: `expired_class_rejected:${committedDoc._id}`,
      });
    } catch (_) {}
  }
  ```
- Bổ sung bước `notificationRetry` vào danh sách các bước bảo trì trong `runMaintenanceJob`:
  ```javascript
  steps: {
    classes: () => rejectExpiredPendingClasses(options, lockContext),
    notificationRetry: () => retryFailedNotifications({ limit: 50 }),
  }
  ```
