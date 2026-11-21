# BÁO CÁO PHÂN TÍCH RỦI RO & ROOT CAUSE — TASK BE-02-FIX
## Tự động từ chối lớp học quá hạn & Tin cậy hóa Maintenance Job

- **Mã task:** `BE-02-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Môi trường:** Node.js / Express / Mongoose 8.x / MongoDB ReplicaSet (WiredTiger)
- **Tệp nguồn trọng tâm:**
  - `BackEnd/src/jobs/maintenanceJob.js`
  - `BackEnd/src/jobs/jobLock.js`
  - `BackEnd/src/models/JobLock.js`
  - `BackEnd/src/models/Class.js`
  - `BackEnd/src/services/auditService.js`
  - `BackEnd/src/services/notificationService.js`

---

## 1. BỐI CẢNH VÀ TỔNG QUAN VẤN ĐỀ

Trong Task BE-02, hệ thống đã triển khai chức năng tự động từ chối các lớp học ở trạng thái `PENDING_APPROVAL` khi đã đến hoặc quá ngày khai giảng (`startDate`) theo múi giờ ứng dụng (`APP_TZ_OFFSET_MINUTES` hoặc UTC+7 mặc định).

Tuy nhiên, qua đợt rà soát mã nguồn (code audit) chi tiết ở mức Senior Backend Architecture, một số nguy cơ nghiêm trọng liên quan đến **tính nguyên tử (atomicity)**, **tính nhất quán của audit log (audit consistency)**, **khả năng phục hồi (fault recovery)** và **phân tán khóa công việc (distributed lock lease renewal)** đã được nhận diện.

---

## 2. CHI TIẾT CÁC RỦI RO ĐÃ PHÁT HIỆN

### 2.1. Rủi ro 1: Partial Update và Mất AuditLog vĩnh viễn (P0 Data Integrity)
- **Hiện trạng trước khi sửa:**
  Trong `rejectExpiredPendingClasses`:
  ```javascript
  const updated = await Class.findOneAndUpdate(
    { _id: cls._id, status: "PENDING_APPROVAL", ...NOT_DELETED },
    { $set: { status: "REJECTED", reviewNote: "...", reviewedAt: now, updatedBy: null } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) continue;

  await audit({ ... });
  await notify(...);
  ```
- **Lỗ hổng:**
  - Thao tác cập nhật `Class` sang `REJECTED` và thao tác ghi `AuditLog` diễn ra độc lập, **không nằm trong MongoDB Transaction session**.
  - Nếu `audit(...)` gặp lỗi (ví dụ: mất kết nối DB tạm thời, disk space, timeout, validation error), khối `catch (err)` sẽ bắt lỗi và in log.
  - Hậu quả nghiêm trọng: Trạng thái `Class` **đã bị chuyển vĩnh viễn sang `REJECTED`** trong cơ sở dữ liệu, nhưng bản ghi `AuditLog` **hoàn toàn không được tạo**.
  - Trong lần chạy tiếp theo của `maintenanceJob`, câu truy vấn `Class.find({ status: "PENDING_APPROVAL", ... })` sẽ bỏ qua lớp học này (vì nó đã là `REJECTED`).
  - Dẫn đến tình trạng hệ thống vi phạm chuẩn kiểm toán **BR-35 / NFR-15**: Lớp học bị hệ thống từ chối mà không có bất kỳ dấu vết kiểm toán nào giải trình lý do và thời điểm.

### 2.2. Rủi ro 2: Thiếu cơ chế Rollback và Khôi phục (Recovery Failure)
- Nếu việc ghi `AuditLog` thất bại, quy trình cần phải **rollback** trạng thái `Class` về lại `PENDING_APPROVAL`.
- Khi trạng thái được rollback, lần quét định kỳ tiếp theo (sau 5 phút) của `maintenanceJob` sẽ tự động tìm thấy lớp học này và thực hiện lại quy trình từ chối kèm ghi audit thành công khi hệ thống đã ổn định.
- Nếu không có MongoDB Transaction, không thể rollback được các thay đổi đã ghi xuống WiredTiger engine khi gặp lỗi ở các bước kế tiếp.

### 2.3. Rủi ro 3: Trôi hạn khóa phân tán (Distributed Lock Lease Expiration & Heartbeat Omission)
- **Hiện trạng trước khi sửa:**
  Trong `startMaintenanceJob`:
  ```javascript
  cron.schedule("*/5 * * * *", () => {
    runExclusive("maintenance", 4 * 60 * 1000, () => runMaintenanceJob());
  });
  ```
  Trong `jobLock.js`, hàm `runExclusive` đã được thiết kế sẵn sàng hỗ trợ cơ chế heartbeat thông qua tham số `options.heartbeatIntervalMs`:
  ```javascript
  const runExclusive = async (name, ttlMs, task, instanceId = INSTANCE_ID, options = {}) => {
    // ...
    const heartbeatMs = Number(options.heartbeatIntervalMs);
    if (Number.isFinite(heartbeatMs) && heartbeatMs > 0) {
      heartbeatTimer = setInterval(() => {
        extend(name, ttlMs, instanceId).catch(...);
      }, heartbeatMs);
    }
    return await task();
  }
  ```
- **Lỗ hổng:**
  - `startMaintenanceJob` đã **không truyền** `options.heartbeatIntervalMs`.
  - Khóa `maintenance` có TTL cố định là 4 phút (`240,000 ms`).
  - Khi hệ thống có lượng dữ liệu lớn (quét hàng nghìn lớp học quá hạn, sweep học bổng, sweep video recording, dọn outbox tài chính), công việc có thể kéo dài vượt quá 4 phút.
  - Khi đó, lease của `JobLock` trong DB sẽ hết hạn (`lockedUntil <= now`).
  - Worker ở instance khác (trong cụm multi-instance container/k8s) có thể chiếm quyền (`acquire`) và chạy song song, dẫn đến nguy cơ xung đột tài nguyên và race conditions.

### 2.4. Rủi ro 4: Ràng buộc tĩnh Destructuring ngăn cản Unit Testing
- Tại đầu tệp `maintenanceJob.js`, việc destructure trực tiếp:
  ```javascript
  const { audit } = require("../services/auditService");
  const { notify } = require("../services/notificationService");
  ```
  khiến các tham chiếu hàm bị đóng cục bộ (closed-over references) tại thời điểm module nạp.
  Khi viết test với `jest.spyOn(auditService, "audit")` hoặc `jest.spyOn(notificationService, "notify")`, Jest không thể can thiệp (intercept) vào các lệnh gọi bên trong `maintenanceJob.js`.
  Cần chuyển sang mô hình Dynamic Delegation Wrapper:
  ```javascript
  const auditService = require("../services/auditService");
  const notificationService = require("../services/notificationService");
  const audit = (...args) => auditService.audit(...args);
  const notify = (...args) => notificationService.notify(...args);
  ```

### 2.5. Rủi ro 5: Khớp nối cứng luồng gửi Notification (Notification Coupling)
- `notify` gửi tin nhắn đến giáo viên phải diễn ra **nghiêm ngặt sau khi transaction đã commit** (post-commit).
- Lỗi từ hệ thống thông báo (ví dụ lỗi mạng, Redis adapter, gateway timeout) tuyệt đối không được phép làm rollback transaction của lớp học đã từ chối và đã ghi audit thành công, cũng như không được làm dừng việc xử lý các lớp học tiếp theo trong vòng lặp.

---

## 3. MỤC TIÊU CẢI TIẾN TRỌNG TÂM

1. **Transaction Fail-Closed:** Sử dụng MongoDB Session Transaction (`session.withTransaction`) cho việc đổi trạng thái `Class` sang `REJECTED` và tạo bản ghi `AuditLog`. Nếu audit fail $\rightarrow$ transaction tự động abort $\rightarrow$ `Class` giữ nguyên `PENDING_APPROVAL` $\rightarrow$ lần chạy tiếp theo tự phục hồi.
2. **Post-Commit Notification Isolation:** Gọi `notify` chỉ sau khi transaction đã commit thành công. Bọc trong khối `try/catch` riêng để cách ly hoàn toàn lỗi thông báo.
3. **Distributed Lock Heartbeat:** Tích hợp `options.heartbeatIntervalMs: 60 * 1000` vào `runExclusive` cho `maintenanceJob`. Tự động gia hạn lease mỗi 1 phút cho lease 4 phút.
4. **Crash Recovery:** Khi worker bị crash đột tử, TTL 4 phút đảm bảo khóa tự động mở để worker khác tiếp quản.
5. **Config & Testability:** Xuất các hằng số `DEFAULT_MAINTENANCE_LOCK_TTL_MS`, `DEFAULT_MAINTENANCE_HEARTBEAT_MS` và kiểm thử toàn diện 15 kịch bản tích hợp.
