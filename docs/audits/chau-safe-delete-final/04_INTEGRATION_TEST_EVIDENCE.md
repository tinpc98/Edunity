# 04_INTEGRATION_TEST_EVIDENCE.md — Bằng Chứng Kiểm Thử Tích Hợp & Concurrency Trên MongoMemoryReplSet Thực Tế

**Dự án:** Edunity V3  
**Người thực hiện:** Châu  
**Ngày kiểm thử:** 13/11/2026  
**Môi trường:** `mongodb-memory-server` MongoMemoryReplSet (MongoDB v7.0.14, storageEngine WiredTiger, Replica Set 1 node)  
**Tập tin kiểm thử:** [`BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js)  

---

## 1. TỔNG HỢP KẾT QUẢ KIỂM THỬ TÍCH HỢP

> [!IMPORTANT]
> Toàn bộ 8/8 kịch bản kiểm thử bắt buộc theo yêu cầu của Task đều được chạy trực tiếp trên MongoMemoryReplSet thật, không dùng mock đơn thuần cho transaction.

| STT | Kịch bản kiểm thử bắt buộc | Mục tiêu kiểm chứng | Kết quả | Thời gian |
| :---: | :--- | :--- | :---: | :---: |
| **1** | **Session Unavailable Fail-Closed** | Khi session/transaction không khả dụng, request DELETE bị từ chối với mã lỗi `503`, dữ liệu khóa học trong MongoDB không đổi. | **PASS** | 99 ms |
| **2** | **Mid-Transaction Rollback** | Phát sinh lỗi giữa chừng (trong `CurriculumUnit.updateMany`), toàn bộ thay đổi trên `Course`, `SyllabusVersion`, `CurriculumUnit` đều được rollback 100%. | **PASS** | 130 ms |
| **3** | **AuditLog Failure Rollback** | Khi ghi AuditLog thất bại, lỗi ném ra ngoài và transaction xóa khóa học tự động rollback, bảo đảm tính toàn vẹn kiểm toán. | **PASS** | 115 ms |
| **4** | **DELETE Course & CREATE Class Concurrency (Barrier)** | Sử dụng synchronization barrier ép 2 thao tác giao nhau: không bao giờ tạo ra lớp học mồ côi trỏ vào khóa học bị xóa. | **PASS** | 106 ms |
| **5** | **DELETE Course & CREATE Enrollment Concurrency** | Khi lớp học đang mở tuyển sinh, DELETE Course bị từ chối với `409 COURSE_HAS_CLASSES`, ghi danh thành công, không mất dữ liệu. | **PASS** | 141 ms |
| **6** | **Multiple Concurrent DELETEs** | 3 Admin cùng gửi request xóa một Course đồng thời: chính xác 1 request thành công, các request còn lại nhận 404, chỉ đúng 1 bản ghi AuditLog. | **PASS** | 127 ms |
| **7** | **Transient Conflict Retry** | Xử lý lỗi `TransientTransactionError` / `WriteConflict`: `session.withTransaction` tự động retry thành công. | **PASS** | 126 ms |
| **8** | **Deleted Course Invariant** | Khóa học đã xóa từ chối mọi yêu cầu tạo Class mới (404) và từ chối ghi danh học viên (400). | **PASS** | 129 ms |

---

## 2. BẰNG CHỨNG RAW OUTPUT TỪ JEST

**Lệnh thực thi:**
```bash
npm --prefix BackEnd test tests/chauSafeDeleteConcurrencyReplSet.test.js
```

**Raw Output:**
```text
> backend@1.0.0 test
> jest tests/chauSafeDeleteConcurrencyReplSet.test.js

PASS tests/chauSafeDeleteConcurrencyReplSet.test.js
  TASK CHAU-P0-SAFE-DELETE-VERIFY: Real MongoMemoryReplSet Concurrency & Transaction Integrity Suite
    √ 1. Session Unavailable Fail-Closed: DELETE rejected with 503, course data unchanged (99 ms)
    √ 2. Mid-Transaction Failure: Full multi-document rollback on error (130 ms)
    √ 3. AuditLog Integrity: Audit failure propagates and rolls back course soft-delete (115 ms)
    √ 4. Deterministic Concurrency Barrier: DELETE Course and CREATE Class cannot race to produce orphan class (106 ms)
    √ 5. Concurrency Barrier: DELETE Course and CREATE Enrollment cannot orphan enrollment (141 ms)
    √ 6. Multiple Concurrent DELETEs: Exactly one succeeds, others 404, exactly 1 audit entry (127 ms)
    √ 7. Transaction Conflict Handling: session.withTransaction retries transient errors cleanly (126 ms)
    √ 8. Invariant: Deleted course rejects new Class creation and new Enrollment creation (129 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        4.247 s
Ran all test suites matching tests/chauSafeDeleteConcurrencyReplSet.test.js.
```

---

## 3. PHÂN TÍCH CHI TIẾT CÁC BÀI TEST CHỦ CHỐT

### 3.1. Test 4: Concurrency Barrier giữa DELETE Course và CREATE Class
Để chứng minh khoa học và không suy đoán qua `Promise.all()`, test case sử dụng 2 Deferred Promises làm rào cản đồng bộ (Barrier):
1. `enterDeletePromise`: Đợi cho đến khi `deleteCourse` chạy xong câu lệnh chiếm khóa độc quyền `Course.findOneAndUpdate(..., { $inc: { lockVersion: 1 } })`.
2. Khi `deleteCourse` đang giữ khóa và chưa commit, tiến trình `createClass` được kích hoạt cho cùng `courseId`.
3. `continueDeletePromise` được giải phóng để `deleteCourse` tiếp tục kiểm tra phụ thuộc và commit soft-delete.
4. `createClass` bị WiredTiger chặn tại câu lệnh `findOneAndUpdate` cho đến khi `deleteCourse` commit.
5. Sau khi `deleteCourse` commit xong, `createClass` thức dậy, kiểm tra điều kiện `{ status: "ACTIVE", isDeleted: { $ne: true } }` thì không còn tìm thấy khóa học nữa và ném lỗi `404 COURSE_NOT_FOUND`.
6. **Kiểm tra trực tiếp database:**
   - `Class.countDocuments({ courseId }) === 0`
   - `Course.findById(courseId).isDeleted === true`
   - Tuyệt đối không có lớp học mồ côi nào được sinh ra!

### 3.2. Test 6: Nhiều Request DELETE Đồng Thời
- 3 requests `deleteCourse` chạy song song trên cùng một document.
- Nhờ atomic write lock, request đầu tiên thay đổi `lockVersion` và soft-delete.
- 2 requests tiếp theo thức dậy tìm `{ _id, isDeleted: { $ne: true } }` thì không còn tìm thấy document hợp lệ nữa và bị từ chối với lỗi `404 COURSE_NOT_FOUND`.
- Số lượng bản ghi `AuditLog` ghi nhận trong database chính xác bằng `1`.

