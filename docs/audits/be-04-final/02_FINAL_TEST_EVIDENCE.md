# BẰNG CHỨNG THỰC THI KIỂM THỬ THỰC TẾ (FINAL TEST EVIDENCE)
## Báo cáo Kiểm toán Chuyên sâu — Task BE-04-FINAL

- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer / QA Lead phụ trách EDUNITY V3
- **Thời điểm chạy test:** 21/11/2026
- **Môi trường thực thi:**
  - OS: Windows 11 Enterprise (x64)
  - Node.js: `v24.18.0`
  - npm: `11.16.0`
  - Test Framework: `Jest 30.5.2` / `Supertest 7.2.2`
  - In-Memory Database: `MongoMemoryReplSet 11.2.0` (MongoDB Binary `7.0.14`, Storage Engine `wiredTiger`)
  - Execution Isolation: Mỗi file test khởi tạo một Replica Set riêng biệt, sync indexes và dọn dẹp sạch sẽ sau mỗi test case (`clearDB`, `disconnectDB`).

---

## 1. LOG THỰC THI LẦN 1: BỘ 5 TEST SUITES TRỌNG TÂM THEO ĐẶC TẢ

Lệnh thực thi:
```powershell
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/classLifecycleRegression.test.js
```

Kết quả:
```text
> backend@1.0.0 test
> jest tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/classLifecycleRegression.test.js

PASS tests/classLifecycleRegression.test.js (5.371 s)
PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (6.34 s)
PASS tests/be02MaintenanceExpiredClass.test.js (7.446 s)
  ● Console

    console.error
      [maintenanceJob] Failed to auto-reject expired class 6b00ff8e039883135b63e543: Simulated transient DB error on cls1
      at error (src/jobs/maintenanceJob.js:192:15)

    console.error
      [maintenanceJob] Failed to auto-reject expired class 6b00ff8f039883135b63e55c: Simulated audit write failure
      at error (src/jobs/maintenanceJob.js:192:15)

    console.error
      [maintenanceJob] Failed to send notification for expired class 6b00ff8f039883135b63e564: Simulated push gateway timeout
      at error (src/jobs/maintenanceJob.js:184:17)

PASS tests/be03AcademicSoftDelete.test.js (7.653 s)
PASS tests/be01ClassNeedChanges.test.js (7.782 s)
  ● Console

    console.error
      Unhandled Error: Error: Simulated database write error during AuditLog creation
          at Object.<anonymous> (tests/be01ClassNeedChanges.test.js:473:7)
      at error (src/app.js:114:11)

    console.error
      [adminClassService] Failed to send notification for class 6b00ff90cc1935512cf5e740: Simulated transient socket timeout contacting notification queue
      at Object.error [as requestChanges] (src/services/adminClassService.js:282:13)

Test Suites: 5 passed, 5 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        8.647 s
```

---

## 2. LOG THỰC THI LẦN 2: BỘ 6 TEST SUITES HỒI QUY BỔ SUNG

Lệnh thực thi:
```powershell
npm --prefix BackEnd test -- tests/courseLifecycleCur12.test.js tests/phase2ReplSet.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/cronLockIdempotency.test.js tests/platform.test.js
```

Kết quả:
```text
> backend@1.0.0 test
> jest tests/courseLifecycleCur12.test.js tests/phase2ReplSet.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/cronLockIdempotency.test.js tests/platform.test.js

PASS tests/cur10ClassCreationGate.test.js
PASS tests/courseLifecycleCur12.test.js
PASS tests/cur11ScheduleAndTimezone.test.js
PASS tests/phase2ReplSet.test.js (6.338 s)
PASS tests/platform.test.js (9.42 s)
PASS tests/cronLockIdempotency.test.js (81.646 s)

Test Suites: 6 passed, 6 total
Tests:       80 passed, 80 total
Snapshots:   0 total
Time:        82.376 s
```

---

## 3. TỔNG KẾT TOÀN DIỆN VỀ BẰNG CHỨNG KIỂM THỬ

- **Tổng số test suites đã chạy thành công:** 11/11 Suites (100%)
- **Tổng số test cases đã kiểm chứng thực tế:** 151/151 Tests (100% Passed)
- **Số lượng test cases bị Fail:** 0 (0%)
- **Số lượng test cases bị Skip / Pending:** 0 (0%)
- **Đánh giá về tính trung thực của Console Error trong Logs:**
  - Toàn bộ các log `console.error` xuất hiện ở trên đều bắt nguồn từ các test cases giả lập lỗi có chủ đích (Simulated Fault Injection) nhằm chứng minh:
    1. Khi cơ sở dữ liệu hoặc dịch vụ Audit gặp lỗi, hệ thống bắt được lỗi, rollback transaction sạch sẽ và không làm sập tiến trình.
    2. Khi dịch vụ gửi thông báo (Push notification / Email queue) gặp lỗi mạng, giao dịch cốt lõi (Class status & AuditLog) vẫn được bảo toàn trọn vẹn, không bị rollback sai lệch.
