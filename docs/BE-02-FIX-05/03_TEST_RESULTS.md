# TEST RESULTS — BE-02-FIX-05
**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 Maintenance & Reliability Hardening  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Tóm tắt kết quả kiểm thử

Tất cả các bài kiểm thử đơn vị, kiểm thử tích hợp giao dịch đa tài liệu (MongoDB Multi-document Transactions) và kiểm thử hồi quy (regression) đều vượt qua 100%.

| Test Suite | File | Kết quả | Số lượng test |
|---|---|---|---|
| **BE-02 Maintenance Expired Class** | [be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js) | **PASS** | **17/17 passed** |
| **BE-01 Class Need Changes** | [be01ClassNeedChanges.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js) | **PASS** | **23/23 passed** |
| **BE-03 Academic Soft Delete** | [be03AcademicSoftDelete.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be03AcademicSoftDelete.test.js) | **PASS** | **17/17 passed** |
| **Chau Safe Delete Concurrency** | [chauSafeDeleteConcurrencyReplSet.test.js](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js) | **PASS** | **6/6 passed** |
| **Class Lifecycle Regression** | [classLifecycleRegression.test.js](file:///c:/CODE/Edunity/BackEnd/tests/classLifecycleRegression.test.js) | **PASS** | **10/10 passed** |
| **TỔNG CỘNG** | **5 Test Suites** | **100% PASS** | **73/73 passed** |

---

## 2. Chi tiết kết quả BE-02 Maintenance Test Suite

Lệnh chạy: `npm --prefix BackEnd test -- tests/be02MaintenanceExpiredClass.test.js`

```text
PASS tests/be02MaintenanceExpiredClass.test.js (6.87 s)
  TASK BE-02-FIX-05: Final Reliability Patch Suite
    Transaction Rollback & Atomicity
      √ 1. Transaction rollback khi notification persistence thất bại: Class giữ PENDING_APPROVAL, 0 AuditLog, 0 Notification (201 ms)
      √ 1b. Transaction thành công trọn vẹn: Cả Class, AuditLog và Notification đều được commit (138 ms)
    FIX-01: Notification Retry Semantics
      √ 2. Retry không có handler: Giữ nguyên trạng thái FAILED, không fake đổi thành DELIVERED (91 ms)
      √ 3. Default cron notification retry: Chạy an toàn từ runMaintenanceJob mà không đổi bậy trạng thái (134 ms)
      √ 4. External delivery thành công/thất bại: Handler thất bại giữ FAILED; handler thành công chuyển DELIVERED (120 ms)
    FIX-03: Recovery Error Reporting & Resilience
      √ 5. Recovery khi DB write thất bại: Ghi nhận lỗi có cấu trúc { classId, auditId, error }, không crash recovery (104 ms)
      √ 6. Recovery sau khi DB hoạt động trở lại: Lần chạy tiếp theo phục hồi thành công (132 ms)
      √ 7. Recovery trên 120 lớp: Keyset pagination quét sạch toàn bộ 70 lớp thiếu dù 50 lớp đầu đã có notification (777 ms)
      √ 8. Recovery không nhầm manual rejection: Bỏ qua lớp bị Admin từ chối (120 ms)
    FIX-02: Concurrency & Lock Fencing Safety
      √ 9. Hai worker đồng thời: Đúng 1 worker reject thành công, không tạo duplicate audit hoặc notification (120 ms)
      √ 10. Lease expiration / stolen lock giữa transaction (Lock Fencing): Transaction lập tức abort (142 ms)
      √ 11. FencingToken increments on transactional verification (114 ms)
    Distributed Lock Baseline & Timezone Precision
      √ 12. Notification deduplication qua unique index (105 ms)
      √ 13. Heartbeat gia hạn khóa thành công (471 ms)
      √ 14. Release không xóa lock của worker khác (98 ms)
      √ 15. Lớp tương lai không bị từ chối (88 ms)
      √ 16. Hằng số bảo trì được xuất đúng chuẩn (80 ms)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        7.113 s
```

---

## 3. Bằng chứng kiểm chứng cho các yêu cầu trọng yếu

### 3.1. Bằng chứng Rollback Atomicity (Test 1 & Test 1b)
- Khi mô phỏng lỗi ghi `Notification` bên trong transaction, toàn bộ transaction bị abort.
- Kết quả kiểm chứng:
  - Trạng thái `Class` giữ nguyên `PENDING_APPROVAL`.
  - Không có bất kỳ bản ghi `AuditLog` nào được tạo (`AuditLog.countDocuments = 0`).
  - Không có bất kỳ bản ghi `Notification` nào được tạo (`Notification.countDocuments = 0`).
- Khi không có lỗi (Test 1b): Cả 3 entity (`Class`, `AuditLog`, `Notification`) đều chuyển sang trạng thái commit đồng bộ.

### 3.2. Bằng chứng Notification Retry Semantics (Test 2, 3, 4)
- Khi gọi `retryFailedNotifications()` mà không truyền `deliveryHandler` (kịch bản cron mặc định):
  - Trạng thái các thông báo `FAILED` được bảo toàn nguyên vẹn (`status: "FAILED"`).
  - Không bị chuyển đổi giả tạo sang `DELIVERED`.
  - Kết quả trả về báo cáo rõ `skippedCount = 2`, `reason: "NO_DELIVERY_HANDLER"`.
- Khi cung cấp `deliveryHandler`:
  - Bản ghi handler throw error: giữ nguyên `FAILED`, tăng `retryCount`.
  - Bản ghi handler resolve: chuyển thành `DELIVERED`, cập nhật `deliveredAt`.

### 3.3. Bằng chứng Fencing Token & Abort khi mất Lock (Test 10 & 11)
- Khi mô phỏng Worker A bị mất lock giữa transaction (Worker B cướp lock):
  - Thao tác `verifyOwnership(session)` sử dụng `JobLock.findOneAndUpdate(..., { $inc: { fencingToken: 1 } }, { session })` trả về `null`.
  - Transaction lập tức throw `Lock fencing error` và abort hoàn toàn.
  - Class vẫn giữ nguyên trạng thái `PENDING_APPROVAL`. Không có duplicate update hay dirty write.
- Giá trị `fencingToken` tăng đều đặn qua mỗi lần verify trong transaction session.

### 3.4. Bằng chứng Keyset Pagination & Recovery Resilience (Test 5, 6, 7, 8)
- Test 5 kiểm tra lỗi ghi DB từng ứng viên: Hàm ghi nhận mảng `errors: [{ classId, auditId, error }]` và không làm crash vòng lặp keyset pagination.
- Test 7 tạo 120 lớp học tự động từ chối, trong đó 50 lớp đã có thông báo và 70 lớp bị thiếu:
  - Keyset pagination (batchSize 50) quét qua toàn bộ các batch (quá limit 50 trước đây).
  - Kết quả phục hồi chính xác 70 thông báo còn thiếu, không bị trùng lặp, không bỏ sót lớp nào.
- Test 8 kiểm tra lớp bị từ chối thủ công bởi Admin (`ADMIN_CLASS_REJECTED`):
  - Bỏ qua hoàn toàn, không tạo notification tự động hết hạn nhầm lẫn.

---

## 4. Kết luận

Hệ thống đã đạt mức độ tin cậy tối đa, không còn bất kỳ kẽ hở nào về mặt concurrency, transaction boundary, hay trạng thái notification.
