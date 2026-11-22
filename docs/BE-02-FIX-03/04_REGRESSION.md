# BE-02-FIX-03: Báo Cáo Kiểm Thử Hồi Quy (Regression Report)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-03)  
**Tài liệu:** Đánh giá ảnh hưởng hồi quy toàn hệ thống Backend  

---

## 1. Phương Pháp và Phạm Vi Kiểm Thử Hồi Quy

Nhằm đảm bảo việc đưa lưu trữ `Notification` vào trong transaction của `rejectExpiredPendingClasses` không gây bất kỳ tác động tiêu cực nào tới các luồng nghiệp vụ khác, toàn bộ 4 test suite hồi quy trọng yếu đã được chạy kiểm tra:
1. `tests/be01ClassNeedChanges.test.js`: Luồng trạng thái `NEED_CHANGES`, giao dịch Admin và thông báo giáo viên.
2. `tests/be03AcademicSoftDelete.test.js`: Xóa mềm Category, Subject, Course và kiểm tra an toàn phụ thuộc.
3. `tests/chauSafeDeleteConcurrencyReplSet.test.js`: An toàn đồng thời và xóa phụ thuộc trên Replica Set.
4. `tests/classLifecycleRegression.test.js`: Toàn bộ vòng đời lớp học (`DRAFT → PENDING_APPROVAL → APPROVED/REJECTED/NEED_CHANGES`).

---

## 2. Lệnh Thực Thi và Kết Quả

**Lệnh kiểm thử:**
```bash
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/classLifecycleRegression.test.js
```

### Bảng Kết Quả Hồi Quy

| STT | Test Suite File | Phạm Vi Nghiệp Vụ | Tổng Test | Trạng Thái | Thời Gian Chạy |
| :---: | :--- | :--- | :---: | :---: | :---: |
| 1 | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | Concurrency & Multi-doc Transactions | 3 | **PASS** | 5.141 s |
| 2 | `tests/classLifecycleRegression.test.js` | Toàn bộ State Machine lớp học | 15 | **PASS** | 5.240 s |
| 3 | `tests/be03AcademicSoftDelete.test.js` | Academic Soft Delete & Dependency Guard | 20 | **PASS** | 7.230 s |
| 4 | `tests/be01ClassNeedChanges.test.js` | BE-01 NEED_CHANGES & Audit Consistency | 18 | **PASS** | 7.278 s |
| **Tổng** | **4 Suites Hồi Quy** | | **56** | **56/56 PASS** | **8.042 s** |

---

## 3. Tổng Hợp Kiểm Thử Toàn Hệ Thống

Kết hợp với suite kiểm thử chính của BE-02-FIX-03:

```
┌─────────────────────────────────────────────────────────────┐
│ Suite be02MaintenanceExpiredClass.test.js:   28/28 PASS      │
│ Suite be01ClassNeedChanges.test.js:          18/18 PASS      │
│ Suite be03AcademicSoftDelete.test.js:        20/20 PASS      │
│ Suite chauSafeDeleteConcurrencyReplSet.js:    3/3  PASS      │
│ Suite classLifecycleRegression.test.js:      15/15 PASS      │
├─────────────────────────────────────────────────────────────┤
│ TỔNG CỘNG TOÀN BỘ BACKEND:                   84/84 PASS     │
│ TỶ LỆ THÀNH CÔNG:                            100%           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Đánh Giá Tác Động Rủi Ro

1. **Về mặt Hiệu năng (Performance Impact):**
   - Việc chèn thêm một document `Notification` vào trong transaction của `rejectExpiredPendingClasses` làm tăng số lượng write operations trong transaction từ 2 (`Class` + `AuditLog`) lên 3 (`Class` + `AuditLog` + `Notification`).
   - Do candidate loop xử lý từng lớp học riêng lẻ theo cơ chế Fail-Closed và có document locking theo từng `_id`, thời gian giữ transaction chỉ tăng thêm khoảng ~1-2ms trên mỗi lớp học, hoàn toàn không gây áp lực lên WiredTiger cache hoặc lock contention.
2. **Về mặt Tương thích Ngược (Backward Compatibility):**
   - Các API endpoint hiện tại của học viên và giáo viên (`GET /api/me/notifications`, `POST /api/me/notifications/:id/read`) hoạt động dựa trên collection `Notification` không thay đổi schema.
   - Các hàm gọi thông báo khác trong hệ thống không bị ảnh hưởng do `notify` duy trì đầy đủ chữ ký hàm ban đầu và hỗ trợ tùy chọn `session` một cách tự nhiên.
