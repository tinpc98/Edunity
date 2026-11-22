# BE-02-FIX-02: Báo Cáo Kiểm Thử Giao Dịch & Khóa Phân Tán (Scenarios 1–15)

**Dự án:** EDUNITY V3  
**File kiểm thử:** [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)  
**Môi trường kiểm thử:** Jest + MongoMemoryReplSet (MongoDB Replica Set phục vụ Transaction)  
**Tổng số test nhóm 1–15:** 15 test cases  
**Kết quả:** 15/15 PASS (100%)  

---

## 1. Chi tiết kiểm thử FIX-01: Transaction Reliability & Fail-Closed (Scenarios 1–7)

### Scenario 1: Giao dịch thành công trọn vẹn (Happy Path)
- **Mục tiêu:** Xác minh lớp `PENDING_APPROVAL` quá hạn được chuyển sang `REJECTED`, cập nhật `reviewNote`, `reviewedAt`, và bản ghi `AuditLog` với action `CLASS_REJECTED` được tạo thành công trong cùng một transaction session.
- **Kết quả:** `PASS (143 ms)`
- **Chứng cứ kiểm chứng:**
  - Class status: `REJECTED`.
  - AuditLog document tồn tại với `resourceId == class._id`, `actorRole: "SYSTEM"`, `metadata.reason: "AUTOMATIC_EXPIRATION_REJECTION"`.
  - Notification document được tạo với `deliveryStatus: "DELIVERED"`.

### Scenario 2: Không khởi tạo được MongoDB Session (Fail-Closed)
- **Mục tiêu:** Giả lập `mongoose.startSession()` ném lỗi (ví dụ không kết nối được DB driver). Hệ thống phải fail-closed an toàn: không cập nhật Class, không ghi AuditLog, không gửi thông báo.
- **Kết quả:** `PASS (168 ms)`
- **Chứng cứ kiểm chứng:**
  - `startSession` throw: `Database session unavailable`.
  - Trạng thái Class trong DB giữ nguyên `PENDING_APPROVAL`.
  - Số lượng AuditLog = 0, Notification = 0.

### Scenario 3: Session không hỗ trợ Transaction (Fail-Closed)
- **Mục tiêu:** Giả lập môi trường session không có hàm `withTransaction`. Hệ thống fail-closed và luôn gọi `session.endSession()` trong `finally`.
- **Kết quả:** `PASS (112 ms)`
- **Chứng cứ kiểm chứng:**
  - Ném ngoại lệ `Database session does not support transactions`.
  - `session.endSession` được gọi chính xác 1 lần.
  - Class vẫn giữ nguyên trạng thái `PENDING_APPROVAL`.

### Scenario 4: Transaction bị MongoDB từ chối do xung đột (WriteConflict)
- **Mục tiêu:** Giả lập MongoDB ném ngoại lệ `WriteConflict` trong transaction. Transaction tự động abort, Class rollback về `PENDING_APPROVAL`.
- **Kết quả:** `PASS (119 ms)`
- **Chứng cứ kiểm chứng:**
  - Lỗi `WriteConflict error: concurrent modification` được bắt và ghi log an toàn.
  - Class status vẫn là `PENDING_APPROVAL`.
  - Không có AuditLog rác nào được lưu lại.

### Scenario 5: Ghi AuditLog thất bại bên trong Transaction (Rollback Atomicity)
- **Mục tiêu:** Giả lập `auditService.log` ném lỗi bên trong transaction (lỗi disk, lỗi validation schema). Đảm bảo Class KHÔNG bị chuyển sang `REJECTED` mà rollback toàn bộ.
- **Kết quả:** `PASS (147 ms)`
- **Chứng cứ kiểm chứng:**
  - `Audit disk failure` gây rollback transaction.
  - Class trong DB giữ nguyên `PENDING_APPROVAL`.
  - Không gửi notification cho giáo viên.

### Scenario 6: Xung đột cập nhật đồng thời với Admin (Concurrent Race Condition)
- **Mục tiêu:** Nếu Admin phê duyệt lớp học (`OPEN`) ngay trước khi câu lệnh update của job chạy, filter `{ status: PENDING_APPROVAL }` không khớp. Job bỏ qua ứng viên mà không ghi đè trạng thái hay tạo AuditLog sai lệch.
- **Kết quả:** `PASS (116 ms)`
- **Chứng cứ kiểm chứng:**
  - Class giữ nguyên `OPEN` (do Admin duyệt).
  - Không có AuditLog `CLASS_REJECTED` nào được tạo bởi SYSTEM.

### Scenario 7: Tính Idempotent và khả năng phục hồi khi chạy lại
- **Mục tiêu:** Sau khi job từ chối 1 lớp học quá hạn, chạy lại job lần thứ hai.
- **Kết quả:** `PASS (143 ms)`
- **Chứng cứ kiểm chứng:**
  - Lần chạy 1: Reject 1 lớp, tạo 1 AuditLog.
  - Lần chạy 2: Trả về `count: 0`, không từ chối thêm lớp nào, không tạo thêm AuditLog hay Notification trùng lặp.

---

## 2. Chi tiết kiểm thử FIX-02: Distributed Lock Lease Safety & Heartbeat (Scenarios 8–15)

### Scenario 8: Chiếm khóa thành công khi khóa tự do
- **Mục tiêu:** Kiểm tra hàm `jobLock.acquire` khi khóa chưa có ai giữ hoặc đã hết hạn.
- **Kết quả:** `PASS (123 ms)`
- **Chứng cứ kiểm chứng:** `acquire` trả về `true`, document trong collection `JobLock` ghi nhận đúng `lockedBy` và `lockedUntil`.

### Scenario 9: Khóa đang được worker khác giữ
- **Mục tiêu:** Khi worker khác đang giữ khóa còn hạn (`lockedUntil > now`), một worker mới gọi `acquire` phải bị từ chối.
- **Kết quả:** `PASS (130 ms)`
- **Chứng cứ kiểm chứng:** `acquire` trả về `false`.

### Scenario 10: Heartbeat gia hạn khóa định kỳ
- **Mục tiêu:** Trong `runExclusive`, `heartbeatTimer` định kỳ gọi `extend` để gia hạn `lockedUntil`.
- **Kết quả:** `PASS (729 ms)`
- **Chứng cứ kiểm chứng:** `lockedUntil` được kéo dài liên tục sau mỗi chu kỳ heartbeat.

### Scenario 11: Heartbeat trả về false -> Đánh dấu Lease mất lập tức
- **Mục tiêu:** Khi `jobLock.extend` trả về `false` (khóa bị worker khác ghi đè hoặc document bị xóa), cờ `isLeaseActive()` lập tức chuyển thành `false`.
- **Kết quả:** `PASS (485 ms)`
- **Chứng cứ kiểm chứng:**
  - `lockContext.isLeaseActive() === false`.
  - `lostReason === "LEASE_NOT_EXTENDED"`.
  - `heartbeatTimer` được dọn dẹp (clear).

### Scenario 12: Heartbeat ném lỗi ngoại lệ mạng -> Đánh dấu Lease mất
- **Mục tiêu:** Giả lập socket timeout trong heartbeat. Đảm bảo hệ thống không nuốt lỗi mà đánh dấu `isLeaseActive() === false`.
- **Kết quả:** `PASS (498 ms)`
- **Chứng cứ kiểm chứng:**
  - `lockContext.isLeaseActive() === false`.
  - `lostReason` chứa thông tin lỗi ngoại lệ.

### Scenario 13: Maintenance Job dừng ngay khi phát hiện mất Lease
- **Mục tiêu:** Khi `lockContext.isLeaseActive() === false` trong lúc `runMaintenanceJob` đang chạy, job hủy bỏ các bước tiếp theo để tránh split-brain.
- **Kết quả:** `PASS (89 ms)`
- **Chứng cứ kiểm chứng:**
  - Bước `classes` trả về `{ skipped: true, reason: "LEASE_LOST" }`.
  - Các bước sau không được thực thi.

### Scenario 14: Hai Worker chạy đồng thời trên cùng danh sách lớp học
- **Mục tiêu:** Hai worker đồng thời chạy `rejectExpiredPendingClasses` trên cùng 1 lớp học.
- **Kết quả:** `PASS (101 ms)`
- **Chứng cứ kiểm chứng:**
  - Đúng 1 worker reject thành công (`count = 1`), worker còn lại ghi nhận `count = 0`.
  - Chỉ có duy nhất 1 bản ghi `AuditLog` và 1 `Notification` được tạo.

### Scenario 15: Safe Release không xóa nhầm khóa của worker khác
- **Mục tiêu:** Khi Worker A hết hạn lease và Worker B đã acquire khóa mới, Worker A khi kết thúc gọi `release` không được phép xóa khóa của Worker B.
- **Kết quả:** `PASS (85 ms)`
- **Chứng cứ kiểm chứng:**
  - `release("test-lock", "worker-A")` chỉ xóa nếu `lockedBy == "worker-A"`.
  - Document khóa của Worker B vẫn nguyên vẹn.
