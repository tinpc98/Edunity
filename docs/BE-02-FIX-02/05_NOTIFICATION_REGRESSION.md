# BE-02-FIX-02: Báo Cáo Kiểm Thử Thông Báo & Hồi Quy (Scenarios 16–25 & Regression Suites)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-02)  
**Tài liệu:** Notification & Full Regression Report  

---

## 1. Chi tiết kiểm thử FIX-03: Notification Reliability, Deduplication & Recovery (Scenarios 16–20)

### Scenario 16: Gửi thông báo thành công sau Commit (Happy Path)
- **Mục tiêu:** Xác minh sau khi transaction commit thành công, thông báo được tạo với `deliveryStatus: "DELIVERED"`.
- **Kết quả:** `PASS (91 ms)`
- **Chứng cứ kiểm chứng:**
  - Bản ghi thông báo được lưu trữ với `userId == teacherId`.
  - `deliveryStatus === "DELIVERED"`.
  - `metadata.newStatus === "REJECTED"`.

### Scenario 17: Thông báo thất bại post-commit được lưu với trạng thái FAILED
- **Mục tiêu:** Giả lập socket gateway của kênh thông báo bị đóng sau khi transaction đã commit. Xác minh hệ thống lưu bản ghi với `deliveryStatus: "FAILED"` kèm `lastError`, và đặc biệt KHÔNG làm ảnh hưởng/rollback lớp học hay AuditLog đã commit.
- **Kết quả:** `PASS (100 ms)`
- **Chứng cứ kiểm chứng:**
  - Class status: `REJECTED` (không bị rollback sai quy tắc).
  - AuditLog: Đầy đủ và nguyên vẹn.
  - Notification: Tồn tại document với `deliveryStatus: "FAILED"` và `lastError: "Push gateway socket closed"`.

### Scenario 18: Tự động Retry thông báo thất bại (`retryFailedNotifications`)
- **Mục tiêu:** Xác minh hàm `retryFailedNotifications` tìm các bản ghi `deliveryStatus: "FAILED"`, gửi lại thành công và cập nhật thành `DELIVERED`.
- **Kết quả:** `PASS (89 ms)`
- **Chứng cứ kiểm chứng:**
  - Sau khi gọi `retryFailedNotifications()`, document chuyển sang `deliveryStatus: "DELIVERED"`.
  - `retryCount` tăng lên 1, `retriedAt` được gán mốc thời gian hiện tại, `lastError` được xóa (`null`).

### Scenario 19: Chống trùng lặp thông báo (Deduplication qua `dedupeKey`)
- **Mục tiêu:** Khi gửi lặp lại thông báo với cùng một `dedupeKey`, hệ thống phát hiện bản ghi đã tồn tại và không tạo thêm bản ghi rác thứ 2.
- **Kết quả:** `PASS (90 ms)`
- **Chứng cứ kiểm chứng:**
  - Gửi thông báo 2 lần với `dedupeKey: "dup-key-test"`.
  - Tổng số bản ghi trong bảng `Notification` vẫn là 1.

### Scenario 20: Job Crash và Khởi động lại — Tự phục hồi thông báo
- **Mục tiêu:** Khi job bị dừng đột ngột để lại các thông báo `FAILED`, lần chạy tiếp theo của `runMaintenanceJob` tự động kích hoạt bước `notificationRetry` và khôi phục toàn bộ các thông báo này thành `DELIVERED`.
- **Kết quả:** `PASS (141 ms)`
- **Chứng cứ kiểm chứng:**
  - Toàn bộ thông báo tồn đọng được phục hồi thành công trong quy trình bảo trì định kỳ.

---

## 2. Chi tiết kiểm thử Ranh Giới Nghiệp Vụ & Múi Giờ (Scenarios 21–25)

### Scenario 21: Lớp có ngày khai giảng trong tương lai không bị từ chối
- **Mục tiêu:** Lớp có `startDate > now` không nằm trong danh sách cần từ chối.
- **Kết quả:** `PASS (107 ms)` — Class giữ nguyên trạng thái `PENDING_APPROVAL`.

### Scenario 22: Chỉ nhắm tới `PENDING_APPROVAL` (Strict Scope Filtering)
- **Mục tiêu:** Các lớp ở trạng thái `OPEN`, `IN_PROGRESS`, `NEED_CHANGES`, `DRAFT` dù có ngày khai giảng trong quá khứ cũng không bị bảo trì từ chối.
- **Kết quả:** `PASS (150 ms)` — Không lớp nào bị ảnh hưởng.

### Scenario 23: Kiểm tra ranh giới ngày theo múi giờ (`APP_TZ_OFFSET_MINUTES`)
- **Mục tiêu:** Xác minh tính toán bắt đầu ngày theo múi giờ Việt Nam (`+420` phút). Lớp có ngày khai giảng 5 phút trước nửa đêm không bị từ chối, lớp quá nửa đêm 5 phút bị từ chối đúng quy định.
- **Kết quả:** `PASS (141 ms)` — Ranh giới ngày hoạt động chính xác tuyệt đối.

### Scenario 24: Cô lập lỗi ứng viên (Fault Isolation)
- **Mục tiêu:** Khi một lớp trong danh sách gặp lỗi (ví dụ lỗi transient), job bắt lỗi độc lập và tiếp tục xử lý thành công cho các lớp hợp lệ khác.
- **Kết quả:** `PASS (159 ms)` — Lớp 1 lỗi không ảnh hưởng lớp 2; lớp 2 được reject và audit đầy đủ.

### Scenario 25: Cấu hình hằng số mặc định bảo trì
- **Mục tiêu:** Xác minh các hằng số mặc định `DEFAULT_CRON_SCHEDULE`, `DEFAULT_LEASE_MS` (4 phút), `DEFAULT_HEARTBEAT_MS` (30s) được xuất chính xác.
- **Kết quả:** `PASS (129 ms)`.

---

## 3. Kết quả các Test Suite hồi quy toàn diện (Regression Suites)

Đã chạy kiểm tra đồng thời tất cả các suite hồi quy liên quan bằng Jest:

```bash
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/classLifecycleRegression.test.js
```

### Kết quả chi tiết:
1. **`tests/classLifecycleRegression.test.js`**: `PASS (5.271 s)` — 15/15 tests.
   - Vòng đời lớp học từ `DRAFT → PENDING_APPROVAL → APPROVED/REJECTED/NEED_CHANGES` ổn định tuyệt đối.
2. **`tests/chauSafeDeleteConcurrencyReplSet.test.js`**: `PASS (6.276 s)` — 3/3 tests.
   - Kiểm tra an toàn xóa đồng thời trên Replica Set không bị ảnh hưởng bởi thay đổi của maintenance job.
3. **`tests/be01ClassNeedChanges.test.js`**: `PASS (7.949 s)` — 18/18 tests.
   - Toàn bộ luồng `NEED_CHANGES`, audit consistency và notification độc lập của BE-01 hoạt động hoàn hảo.
4. **`tests/be03AcademicSoftDelete.test.js`**: `PASS (8.003 s)` — 20/20 tests.
   - Toàn bộ ma trận xóa mềm học thuật của BE-03 (Category, Subject, Course, Syllabus, Dependency Check) được bảo toàn 100%.

**Tổng cộng:** 56/56 regression tests PASS (100%).
