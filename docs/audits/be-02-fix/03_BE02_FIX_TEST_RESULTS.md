# BÁO CÁO KẾT QUẢ KIỂM THỬ — TASK BE-02-FIX
## Chi tiết 15 kịch bản kiểm thử tích hợp & Hồi quy hệ thống

- **Mã task:** `BE-02-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Bộ test suite:** `BackEnd/tests/be02MaintenanceExpiredClass.test.js`
- **Môi trường chạy:** Jest / MongoMemoryReplSet 7.0.14 WiredTiger / Windows PowerShell

---

## 1. KẾT QUẢ TỔNG QUAN

- **Số kịch bản trong Suite BE-02-FIX:** 15/15 Passed (100%)
- **Thời gian thực thi:** 7.152s
- **Hồi quy toàn diện liên quan (6 Suites):** 97/97 Passed (100%)
  - `tests/be01ClassNeedChanges.test.js` (14 passed)
  - `tests/be02MaintenanceExpiredClass.test.js` (15 passed)
  - `tests/be03AcademicSoftDelete.test.js` (22 passed)
  - `tests/chauSafeDeleteConcurrencyReplSet.test.js` (12 passed)
  - `tests/courseLifecycleCur12.test.js` (15 passed)
  - `tests/phase2ReplSet.test.js` (19 passed)

---

## 2. CHI TIẾT 15 TEST CASES CỦA BE-02-FIX

| STT | Kịch bản kiểm thử | Mục đích & Xác minh dữ liệu | Kết quả |
| :---: | :--- | :--- | :---: |
| 1 | Rejects PENDING_APPROVAL class when startDate has arrived or is in the past | Kiểm tra lớp đến hạn hoặc quá hạn: chuyển `REJECTED`, cập nhật `reviewNote`, giữ nguyên `startDate`. | **PASS** |
| 2 | Does not reject PENDING_APPROVAL class when startDate is in the future | Lớp có ngày khai giảng tương lai không bị từ chối, `status` giữ nguyên `PENDING_APPROVAL`. | **PASS** |
| 3 | Only targets PENDING_APPROVAL: OPEN, IN_PROGRESS, NEED_CHANGES, DRAFT are untouched | Không tác động lên các trạng thái khác của vòng đời lớp học. | **PASS** |
| 4 | Precision Timezone Boundary Test: evaluates calendar day boundaries accurately | Kiểm tra ranh giới ngày theo múi giờ: 5 phút trước nửa đêm không từ chối, 5 phút sau nửa đêm từ chối. | **PASS** |
| 5 | Idempotent: Running the job twice produces exactly 1 audit and 1 notification | Chạy lặp lại: Lần 2 từ chối 0 lớp; chỉ sinh đúng 1 AuditLog và 1 Notification duy nhất. | **PASS** |
| 6 | Concurrency Safety: Does not overwrite concurrent Admin approval or double reject | 2 worker chạy song song: đúng 1 worker thực hiện, không nhân đôi audit hay conflict. | **PASS** |
| 7 | Fault Isolation: An error on one class does not crash the processing of other classes | 1 lớp bị lỗi DB không làm dừng việc xử lý các lớp học tiếp theo; lỗi được ghi nhận trong `errors`. | **PASS** |
| 8 | Audit System Actor: Correctly records actorType=SYSTEM without faking Admin ID | Kiểm tra AuditLog: `actorType: "SYSTEM"`, `actorAdminId: null`, ghi đúng `beforeState` & `afterState`. | **PASS** |
| 9 | Integration: runMaintenanceJob executes expiredPendingClasses step successfully | Tích hợp thành công trong `runMaintenanceJob` tổng thể mà không làm gián đoạn các bước khác. | **PASS** |
| 10 | **Atomic Rejection & Rollback: If audit fails, Class is NOT rejected, transaction aborts, and subsequent run recovers** | **Mô phỏng lỗi khi ghi AuditLog trong transaction: Class rollback về `PENDING_APPROVAL`, không gửi notification. Lần chạy kế tiếp tự phục hồi và hoàn tất từ chối.** | **PASS** |
| 11 | **Notification Resilience: If notification service throws, transaction is NOT rolled back** | **Lỗi gửi notification (timeout) sau commit không làm rollback trạng thái `REJECTED` và `AuditLog`, không crash job.** | **PASS** |
| 12 | **Race with Admin approval: If Admin approves class concurrently, job gracefully skips class** | **Admin phê duyệt sang `OPEN` trước khi worker cập nhật: worker bỏ qua an toàn, không ghi đè và không tạo audit sai.** | **PASS** |
| 13 | **Distributed Job Lock Heartbeat: runExclusive extends lockedUntil periodically via heartbeat** | **Worker chạy tác vụ dài: heartbeat định kỳ gọi `extend`, gia hạn `lockedUntil` trong cơ sở dữ liệu.** | **PASS** |
| 14 | **Distributed Job Lock Crash Recovery: Expired lock allows a new instance to acquire lease** | **Worker bị crash để lại lease hết hạn: worker khác có thể acquire ngay lập tức mà không bị deadlock.** | **PASS** |
| 15 | **Default Maintenance Constants: Exported TTL (4 mins) and heartbeat (1 min) are properly configured** | **Xác minh các hằng số xuất bản: `DEFAULT_MAINTENANCE_LOCK_TTL_MS = 240000`, `DEFAULT_MAINTENANCE_HEARTBEAT_MS = 60000`.** | **PASS** |

---

## 3. RAW JEST TEST OUTPUT TRÍCH XUẤT

```text
> backend@1.0.0 test
> jest tests/be02MaintenanceExpiredClass.test.js

  console.error
    [maintenanceJob] Failed to auto-reject expired class 6b00fb47b085d9d9013525ac: Simulated transient DB error on cls1
      at error (src/jobs/maintenanceJob.js:192:15)

  console.error
    [maintenanceJob] Failed to auto-reject expired class 6b00fb47b085d9d9013525c5: Simulated audit write failure
      at error (src/jobs/maintenanceJob.js:192:15)

  console.error
    [maintenanceJob] Failed to send notification for expired class 6b00fb47b085d9d9013525cd: Simulated push gateway timeout
      at error (src/jobs/maintenanceJob.js:184:17)

PASS tests/be02MaintenanceExpiredClass.test.js (6.9 s)
  TASK BE-02: Automatic Class Expiration Rejection Integration Suite
    √ 1. Rejects PENDING_APPROVAL class when startDate has arrived or is in the past (146 ms)
    √ 2. Does not reject PENDING_APPROVAL class when startDate is in the future (116 ms)
    √ 3. Only targets PENDING_APPROVAL: OPEN, IN_PROGRESS, NEED_CHANGES, DRAFT are untouched (127 ms)
    √ 4. Precision Timezone Boundary Test: evaluates calendar day boundaries accurately (112 ms)
    √ 5. Idempotent: Running the job twice produces exactly 1 audit and 1 notification (120 ms)
    √ 6. Concurrency Safety: Does not overwrite concurrent Admin approval or double reject (126 ms)
    √ 7. Fault Isolation: An error on one class does not crash the processing of other classes (161 ms)
    √ 8. Audit System Actor: Correctly records actorType=SYSTEM without faking Admin ID (106 ms)
    √ 9. Integration: runMaintenanceJob executes expiredPendingClasses step successfully (137 ms)
    √ 10. Atomic Rejection & Rollback: If audit fails, Class is NOT rejected (remains PENDING_APPROVAL), transaction aborts, no notification sent, and subsequent run recovers (109 ms)
    √ 11. Notification Resilience: If notification service throws, transaction is NOT rolled back, class remains REJECTED, AuditLog is recorded, and job completes successfully (94 ms)
    √ 12. Race with Admin approval: If Admin approves class concurrently, job gracefully skips class without overwriting OPEN status and without emitting audit (92 ms)
    √ 13. Distributed Job Lock Heartbeat: runExclusive extends lockedUntil periodically via heartbeat interval (835 ms)
    √ 14. Distributed Job Lock Crash Recovery: Expired lock allows a new instance to acquire lease after TTL expires (122 ms)
    √ 15. Default Maintenance Constants: Exported TTL (4 mins) and heartbeat (1 min) are properly configured (106 ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        7.152 s, estimated 8 s
```
