# BE-02-FIX-02: Báo Cáo Hiện Trạng Hệ Thống (Current State)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-02)  
**Ngày thực hiện:** 21/11/2026  
**Vai trò:** Senior Backend Engineer  

---

## 1. Bối cảnh và Mục tiêu

Dự án EDUNITY V3 đã hoàn thành ba tính năng nền tảng:
- **BE-01:** Class `NEED_CHANGES` workflow và state machine.
- **BE-02:** Tự động từ chối lớp học quá hạn khai giảng (`PENDING_APPROVAL → REJECTED`).
- **BE-03:** Academic Soft Delete cho Category, Subject, Course và Dependency Safety.

Audit kỹ thuật chuyên sâu ngày 21/11/2026 đối với tác vụ nền (Maintenance Job) đã phát hiện 3 rủi ro nghiêm trọng về tính toàn vẹn dữ liệu:
1. **Fallback không giao dịch (Unsafe Non-Transactional Fallback):** Trong `maintenanceJob.js`, khi không khởi tạo được MongoDB session hoặc trong môi trường standalone, hàm tự động từ chối lớp học rơi vào nhánh `else` thực hiện `findOneAndUpdate` mà không có session/transaction. Nếu bước ghi AuditLog thất bại, Class đã chuyển thành `REJECTED` nhưng AuditLog không tồn tại, gây vi phạm tính bất biến và mất dấu vết kiểm toán.
2. **Khuyết tật quản lý Lease và Heartbeat của Distributed Lock:** Trong `jobLock.js`, hàm `runExclusive` thực hiện gia hạn khóa thông qua `setInterval`, nhưng bỏ qua giá trị trả về của `extend()` (khi trả về `false`) hoặc nuốt ngoại lệ khi heartbeat gặp lỗi mạng. Worker đang chạy tác vụ (`task`) không có cơ chế biết mình đã mất lease và có thể tiếp tục ghi đè dữ liệu (split-brain).
3. **Mất thông báo khi lỗi sau Commit (Notification Drop on Post-Commit Error):** Khi giao dịch MongoDB đã commit thành công, nếu lời gọi thông báo qua `notificationService` bị timeout hoặc ném lỗi socket, ngoại lệ bị nuốt hoặc gây lỗi không phục hồi, khiến giáo viên không nhận được thông báo từ chối lớp mà hệ thống không có cơ chế lưu vết để retry.

---

## 2. Kiểm tra mã nguồn thực tế trước khi sửa đổi

### 2.1. `BackEnd/src/jobs/maintenanceJob.js`
- **Nhánh không an toàn:**
  ```javascript
  // Đoạn mã cũ tiềm ẩn rủi ro:
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (sessErr) {
    session = null;
  }
  if (session && typeof session.withTransaction === "function") {
    // ... chạy withTransaction
  } else {
    // RỦI RO NGHIÊM TRỌNG: Cập nhật Class ngoài transaction
    const updated = await Class.findOneAndUpdate(...);
    await auditService.log(...); // Nếu lỗi tại đây, Class đã bị REJECTED mà không có Audit!
  }
  ```
- **Thiếu kiểm tra Lease:** Hàm `rejectExpiredPendingClasses` và luồng chính `runMaintenanceJob` lặp qua danh sách ứng viên mà không kiểm tra xem distributed lock còn hiệu lực hay không.

### 2.2. `BackEnd/src/jobs/jobLock.js`
- **Heartbeat nuốt lỗi:**
  ```javascript
  // Đoạn mã cũ:
  heartbeatTimer = setInterval(async () => {
    try {
      await extend(name, instanceId, leaseMs);
    } catch (_) {}
  }, heartbeatMs);
  ```
  `extend` trả về `false` nếu document lock đã bị worker khác ghi đè hoặc bị xóa. Nhưng `runExclusive` không lưu trạng thái mất lease và không cung cấp context cho `task`.

### 2.3. `BackEnd/src/services/notificationService.js`
- **Hệ thống thông báo dựa trên MongoDB:** Trong Edunity, Notification được lưu trữ trực tiếp trong bảng `Notification` của MongoDB.
- **Không có cơ chế Retry:** Khi một thông báo bị lỗi trong quá trình dispatch post-commit, document không được đánh dấu trạng thái lỗi có hệ thống (`deliveryStatus: "FAILED"`), dẫn đến không thể quét và gửi lại định kỳ.

---

## 3. Tình trạng sau khi áp dụng BE-02-FIX-02

1. **100% Giao dịch bắt buộc (Mandatory Transaction):** Loại bỏ hoàn toàn nhánh `else` fallback. Nếu không mở được session hoặc transaction thất bại, lớp học giữ nguyên `PENDING_APPROVAL`, không có AuditLog mồ côi và không gửi thông báo rác (Fail-Closed).
2. **Distributed Lock Context & Heartbeat Guard:**
   - Cung cấp `lockContext` (`name`, `instanceId`, `isLeaseActive()`, `checkLeaseOrThrow()`, `getLeaseState()`) cho task.
   - Khi `extend()` trả về `false` hoặc throw error, đánh dấu ngay lập tức `leaseActive = false`.
   - Ngăn chặn heartbeat chạy chồng lấn bằng `inFlightHeartbeat`.
   - `maintenanceJob.js` kiểm tra `lockContext.isLeaseActive()` trước mỗi bước và trước mỗi candidate lớp học. Nếu mất lease, lập tức dừng xử lý các bước còn lại một cách an toàn.
3. **Notification Persistence & Auto-Recovery:**
   - Khi dispatch thông báo post-commit gặp lỗi, lưu bản ghi `Notification` với `deliveryStatus: "FAILED"`, `lastError`, và `dedupeKey`.
   - Thêm bước `notificationRetry` vào quy trình định kỳ của `maintenanceJob` thông qua hàm `retryFailedNotifications`.

---

## 4. Bảng tổng hợp hiện trạng kiểm thử

| Nhóm Kiểm Thử | Suite File | Tổng số Test | Kết Quả |
| :--- | :--- | :---: | :---: |
| **BE-02 Transaction & Lock** | `tests/be02MaintenanceExpiredClass.test.js` | 25 | **25/25 PASS** |
| **BE-01 Class Workflow** | `tests/be01ClassNeedChanges.test.js` | 18 | **18/18 PASS** |
| **BE-03 Soft Delete Safety** | `tests/be03AcademicSoftDelete.test.js` | 20 | **20/20 PASS** |
| **Concurrency ReplicaSet** | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | 3 | **3/3 PASS** |
| **Class Lifecycle Regression** | `tests/classLifecycleRegression.test.js` | 15 | **15/15 PASS** |
| **Tổng cộng toàn bộ hệ thống**| | **81** | **81/81 PASS (100%)** |
