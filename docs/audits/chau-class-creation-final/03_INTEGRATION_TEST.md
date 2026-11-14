# BÁO CÁO KIỂM THỬ TÍCH HỢP CONCURRENCY & REPLICA SET
## TASK CHAU-FINAL-P0-CLASS-CREATION — EDUNITY V3

- **Tập tin test:** [`BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js)
- **Môi trường:** `MongoMemoryReplSet` (Replica Set 1 node thực thụ, hỗ trợ MongoDB Transactions & WiredTiger write locking)
- **Số lượng kịch bản:** 14/14 passed (100%)
- **Thời gian thực thi:** ~9.502 s

---

### 1. Tổng hợp Danh mục 14 Kịch bản Kiểm thử

| STT | Tên Kịch bản / Mục tiêu | Kết quả Thực tế | Trạng thái |
| :---: | :--- | :--- | :---: |
| **01** | `deleteCourse` Fail-Closed khi `startSession()` lỗi | HTTP 503 `DATABASE_TRANSACTION_UNAVAILABLE`, không xóa gì | **PASS** |
| **01b**| **RESOURCE LEAK GUARD:** `deleteCourse` Fail-Closed khi `withTransaction` thiếu -> ném 503 và gọi `session.endSession()` | HTTP 503, session được đóng hoàn toàn, không rò rỉ | **PASS** |
| **02** | `deleteCourse` Rollback khi xảy ra lỗi giữa chừng (CurriculumUnit fail) | Transaction tự động rollback, Course/Syllabus/Unit nguyên vẹn | **PASS** |
| **03** | `deleteCourse` Rollback khi AuditLog fail | AuditLog fail propagates, Course nguyên vẹn | **PASS** |
| **04** | **Concurrency Barrier 1:** DELETE Course bắt đầu TRƯỚC CREATE Class | DELETE thành công -> CREATE bị từ chối 404, 0 Class tạo thừa | **PASS** |
| **05** | **Concurrency Barrier:** DELETE Course và CREATE Enrollment | DELETE bị từ chối 409 `COURSE_HAS_CLASSES`, Enrollment thành công | **PASS** |
| **06** | Nhiều request DELETE cùng Course đồng thời | Đúng 1 request thành công, các request sau nhận 404 | **PASS** |
| **07** | `deleteCourse` Tự động Retry khi gặp `TransientTransactionError` (WriteConflict) | `session.withTransaction` thử lại thành công | **PASS** |
| **08** | Invariant: Course đã xóa từ chối tạo Class mới (404) và Enrollment mới (400) | Bảo toàn bất biến toàn vẹn dữ liệu | **PASS** |
| **09** | **MANDATORY 09:** `createClass` Fail-Closed khi `startSession()` lỗi | HTTP 503 `DATABASE_TRANSACTION_UNAVAILABLE`, 0 Class tạo thừa | **PASS** |
| **10** | **MANDATORY 10 & RESOURCE LEAK GUARD:** `createClass` Fail-Closed khi `withTransaction` thiếu -> ném 503 và gọi `session.endSession()` | HTTP 503, 0 Class tạo thừa, session được đóng hoàn toàn | **PASS** |
| **11** | **MANDATORY 11:** `createClass` Mid-Transaction Rollback khi `Class.save()` lỗi | Toàn bộ transaction bị hủy, 0 Class được lưu vào DB | **PASS** |
| **12** | **Concurrency Barrier 2:** CREATE Class bắt đầu TRƯỚC DELETE Course | Class tạo thành công -> DELETE bị từ chối 409, Course nguyên vẹn | **PASS** |
| **13** | **MANDATORY 13:** `createClass` Tự động Retry khi gặp `TransientTransactionError` | `session.withTransaction` retry thành công, Class được tạo an toàn | **PASS** |

---

### 2. Phân tích Chi tiết Kịch bản Concurrency Hai Chiều (Barrier Tests)

#### 2.1. Kịch bản 1: DELETE Course giành khóa trước (Test 8)
- **Thiết lập:** Sử dụng `Promise` barrier chặn tiến trình của `deleteCourse` ngay sau khi lấy được write lock trên Course document.
- **Tiến trình:**
  1. `deleteCourse` cập nhật `lockVersion` của Course bên trong Transaction $Tx_1$.
  2. `createClass` được kích hoạt, cố gắng cập nhật `lockVersion` trên cùng Course document bên trong Transaction $Tx_2$.
  3. Moteur WiredTiger đặt $Tx_2$ vào trạng thái chờ (lock wait).
  4. Rào cản mở: $Tx_1$ hoàn tất soft-delete (`status = INACTIVE`, `isDeleted = true`) và commit.
  5. $Tx_2$ tiếp tục, thực hiện truy vấn với điều kiện `status: "ACTIVE", isDeleted: false` -> không tìm thấy document.
  6. $Tx_2$ ném lỗi `404 COURSE_NOT_FOUND` và kết thúc mà không tạo ra bất kỳ Class mồ côi nào.

#### 2.2. Kịch bản 2: CREATE Class giành khóa trước (Test 12)
- **Thiết lập:** Sử dụng `Promise` barrier chặn tiến trình của `createClass` ngay sau khi lấy được write lock trên Course document.
- **Tiến trình:**
  1. `createClass` cập nhật `lockVersion` của Course bên trong Transaction $Tx_A$.
  2. `deleteCourse` được kích hoạt, cố gắng cập nhật `lockVersion` trên cùng Course document bên trong Transaction $Tx_B$.
  3. WiredTiger đặt $Tx_B$ vào trạng thái chờ (lock wait).
  4. Rào cản mở: $Tx_A$ lưu `Class` mới với `courseId` tương ứng và commit.
  5. $Tx_B$ tiếp tục, chạy `Class.countDocuments({ courseId }, { session })` -> đếm được `1` lớp học.
  6. $Tx_B$ phát hiện dependency đang tồn tại, lập tức ném lỗi `409 COURSE_HAS_CLASSES` và abort transaction.
  7. Course giữ nguyên trạng thái `ACTIVE`, không bị xóa oan.

---

### 3. Minh chứng Thực thi (Test Execution Output)

```text
PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (9.502 s)
  TASK CHAU-P0-SAFE-DELETE-VERIFY: Real MongoMemoryReplSet Concurrency & Transaction Integrity Suite
    √ 1. Session Unavailable Fail-Closed: DELETE rejected with 503, course data unchanged (100 ms)
    √ 1b. deleteCourse Fail-Closed: Transaction unavailable returns 503 and closes session (103 ms)
    √ 2. Mid-Transaction Failure: Full multi-document rollback on error (217 ms)
    √ 3. AuditLog Integrity: Audit failure propagates and rolls back course soft-delete (109 ms)
    √ 4. Deterministic Concurrency Barrier: DELETE Course and CREATE Class cannot race to produce orphan class (111 ms)
    √ 5. Concurrency Barrier: DELETE Course and CREATE Enrollment cannot orphan enrollment (162 ms)
    √ 6. Multiple Concurrent DELETEs: Exactly one succeeds, others 404, exactly 1 audit entry (124 ms)
    √ 7. Transaction Conflict Handling: session.withTransaction retries transient errors cleanly (122 ms)
    √ 8. Invariant: Deleted course rejects new Class creation and new Enrollment creation (130 ms)
    √ 9. createClass Fail-Closed: Session unavailable returns 503, zero Class created (102 ms)
    √ 10. createClass Fail-Closed: Transaction unavailable returns 503, zero Class created and closes session (100 ms)
    √ 11. createClass Mid-Transaction Failure: Class.save() error rolls back transaction (117 ms)
    √ 12. Concurrency Barrier: CREATE Class begins BEFORE DELETE Course -> Class is created, DELETE rejected with 409 (104 ms)
    √ 13. createClass Conflict Handling: session.withTransaction retries transient errors cleanly (109 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        11.572 s
```

