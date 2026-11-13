# EDUNITY V3 — TASK P0: FIX CLASS LIFECYCLE REGRESSION AFTER TIN MERGE
**Mode:** AUDIT → CONTROLLED IMPLEMENTATION → REGRESSION TEST  
**Role:** Senior Backend Engineer — Edunity V3  
**Owner:** Châu + Tin (shared integration)  
**Date:** 2026-11-13  
**Status:** **PASS** (Core Lifecycle & Settlement Sync Fully Verified)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Bối Cảnh & Nguy Cơ Regression
Sau khi hợp nhất các PR của Tin (PR1–PR11 về Payment, Settlement, Outbox Worker), hàm `completeFinishedClasses` trong [`BackEnd/src/services/classLifecycleService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classLifecycleService.js) bị sửa đổi:
1. **Mất MongoDB Replica Set Transaction (`dbSession.withTransaction`)**:
   - Trước khi sửa: Cập nhật `Class` (`COMPLETED`), `Enrollment` (`COMPLETED`) và `TeacherEarning` (`AVAILABLE`) diễn ra trong cùng 1 MongoDB transaction.
   - Sau khi Tin merge: 3 lệnh ghi bị tách thành 3 thao tác độc lập không có transaction session:
     ```javascript
     const res = await Class.updateOne({ _id: cls._id, status: "IN_PROGRESS" }, { $set: { status: "COMPLETED" } });
     if (res.modifiedCount !== 1) continue;
     await Enrollment.updateMany({ classId: cls._id, enrollmentStatus: "CONFIRMED" }, { $set: { enrollmentStatus: "COMPLETED" } });
     await TeacherEarning.updateMany({ classId: cls._id, status: "PENDING", settlementHoldRequired: false }, { $set: { status: "AVAILABLE" } });
     ```
   - **Hậu quả trực tiếp**: Nếu `Enrollment.updateMany` hoặc `TeacherEarning.updateMany` thất bại (ví dụ: DB network glitch, write conflict, deadlock, memory pressure), `Class` đã vĩnh viễn chuyển sang `COMPLETED`. Trong lần chạy cron bảo trì tiếp theo, lớp này bị bỏ qua (`status: "IN_PROGRESS"` không khớp), khiến `Enrollment` bị kẹt ở `CONFIRMED` và `TeacherEarning` bị kẹt không được xử lý.
2. **Nuốt lỗi âm thầm (`catch (_) {}`) khi gọi Settlement**:
   ```javascript
   try {
     const settlementService = require("./settlementService");
     await settlementService.evaluateClassSettlement(cls._id, { now });
   } catch (_) {}
   ```
   - Lỗi bị nuốt hoàn toàn, không log `console.error`, không lưu trạng thái trên `Class`, không có cơ chế retry tự động.
3. **Mất guard đồng thời cục bộ trong `maintenanceJob.js`**:
   - Tin đã vô tình xóa cờ `isRunning` cục bộ trong [`BackEnd/src/jobs/maintenanceJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js), gây fail test `cronLockIdempotency.test.js` (`G0-08.PROC.1: maintenanceJob rejects concurrent local execution with LOCAL_EXECUTION_IN_PROGRESS`).

---

## 2. Before / After Behavior Comparison

| Tiêu chí | Trước khi sửa (Tin Merge) | Sau khi sửa (Controlled Fix) |
|---|---|---|
| **Atomicity** | 3 non-transactional writes riêng biệt. Class cập nhật trước, Enrollment/Earning cập nhật sau. | Gộp `Class`, `Enrollment`, và `TeacherEarning` (`settlementHoldRequired: false`) vào **`dbSession.withTransaction()`**. Rollback toàn bộ nếu bất kỳ write nào throw error. |
| **Notification Safety** | Gửi `CLASS_COMPLETED` ngay cả khi write sau bị lỗi. | Chỉ gửi notification sau khi transaction đã commit thành công. |
| **Settlement Call** | `try { ... } catch (_) {}` nuốt sạch lỗi, không retry. | `syncClassSettlementWithTracking()` bắt lỗi, ghi structured `console.error`, lưu `settlementSyncStatus: "FAILED"`, `settlementSyncError`, `settlementSyncAttempts` lên `Class`. |
| **Retry Idempotency** | Không có cơ chế quét lại các lớp đã `COMPLETED` nhưng chưa sync settlement. | Thêm hàm `retryPendingClassSettlements(now)` tự động claim lease và retry các lớp có status `FAILED` hoặc `IN_PROGRESS` bị stale (> 5 phút). |
| **V3 Settlement Hold** | `settlementHoldRequired !== false` không chuyển sang `AVAILABLE` (đúng hướng V3). | Tiếp tục bảo toàn quy tắc fail-closed: chỉ release earning có `settlementHoldRequired === false`, các earning V3 giữ nguyên `PENDING` chờ 7 ngày trưởng thành. |
| **Job Concurrency** | Thiếu cờ `isRunning` trong `maintenanceJob.js`. | Khôi phục `isRunning` và error isolation cho từng step trong `runMaintenanceJob()`. |

---

## 3. Files Changed & Implementation Details

1. **[`BackEnd/src/models/Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js)**:
   - Bổ sung các field theo dõi settlement sync:
     ```javascript
     completedAt: { type: Date, default: null },
     settlementSyncStatus: {
       type: String,
       enum: ["NONE", "IN_PROGRESS", "SYNCED", "FAILED"],
       default: "NONE",
     },
     settlementSyncAttempts: { type: Number, default: 0, min: 0 },
     settlementSyncError: { type: String, default: null },
     settlementSyncLastAttemptAt: { type: Date, default: null },
     settlementSyncedAt: { type: Date, default: null },
     ```
2. **[`BackEnd/src/services/classLifecycleService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classLifecycleService.js)**:
   - Khôi phục `mongoose.startSession()` và `dbSession.withTransaction()`.
   - Cập nhật atomic CAS: `{ _id: cls._id, status: "IN_PROGRESS" }` sang `COMPLETED`, `completedAt: now`, `settlementSyncStatus: "IN_PROGRESS"`.
   - Update `Enrollment` và `TeacherEarning` (`settlementHoldRequired: false`) kèm `{ session: dbSession }`.
   - Gọi `syncClassSettlementWithTracking()` sau transaction commit; nếu lỗi thì cập nhật `settlementSyncStatus: "FAILED"`.
   - Chạy `retryPendingClassSettlements()` để thu hồi và xử lý lại các lớp chưa đồng bộ xong.
3. **[`BackEnd/src/jobs/maintenanceJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js)**:
   - Khôi phục biến `let isRunning = false;` và guard `{ skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" }`.
4. **[`BackEnd/src/utils/settings.js`](file:///c:/CODE/Edunity/BackEnd/src/utils/settings.js)**:
   - Tích hợp đồng bộ giữa DB `PlatformSetting` và policy commission của Tin (zero-safe, respect DB value nếu có, fallback về `resolveCommissionPolicy()`).
5. **[`BackEnd/src/models/index.js`](file:///c:/CODE/Edunity/BackEnd/src/models/index.js)**:
   - Khôi phục export đầy đủ cho các model core đã bị merge thiếu.
6. **[`BackEnd/tests/classLifecycleRegression.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/classLifecycleRegression.test.js)**:
   - Bộ test hồi quy 6 kịch bản P0 chuyên biệt tái hiện và xác minh toàn diện.

---

## 4. Test Verification Evidence

Chạy bộ test hồi quy chuyên biệt và toàn bộ ReplSet suite:
```
npm --prefix BackEnd test -- tests/classLifecycleRegression.test.js tests/phase0ReplSet.test.js tests/phase1ReplSet.test.js tests/phase2ReplSet.test.js tests/phase3ReplSet.test.js tests/phase4ReplSet.test.js tests/phase5ReplSet.test.js tests/phase6ReplSet.test.js tests/maintenanceAndFinance.test.js tests/cronLockIdempotency.test.js tests/jobs.test.js tests/payosDispatch.pr3.test.js --runInBand --no-cache
```

**Kết quả:**
```
Test Suites: 12 passed, 12 total
Tests:       86 passed, 86 total
Snapshots:   0 total
Time:        71.351 s
```
- `tests/classLifecycleRegression.test.js`: **6/6 PASS**
- `tests/phase0ReplSet.test.js`: **PASS** (gồm test rollback khi TeacherEarning updateMany thất bại)
- `tests/cronLockIdempotency.test.js`: **PASS** (xác minh cả in-process concurrency guard và error isolation)
- `tests/maintenanceAndFinance.test.js`: **PASS**
- `tests/payosDispatch.pr3.test.js`: **PASS**

---

## 5. Handover & Ghi Chú Cho Tin
1. **Module Finance của Tin**: Giữ nguyên vẹn không sửa đổi code lõi (`settlementService.js`, `financialDispatchService.js`, `payoutService.js`).
2. **Settlement Sync Tracking**: `classLifecycleService` đã hỗ trợ retry tự động qua field `settlementSyncStatus` trên `Class`. Khi cần debug các lớp chưa quyết toán, Tin có thể query:
   ```javascript
   await Class.find({ status: "COMPLETED", settlementSyncStatus: "FAILED" });
   ```
3. **Environment Flag**: Lưu ý trong môi trường test/CI cần đảm bảo `ENABLE_PAYMENT_SANDBOX=true` khi chạy các test intent PayOS của PR5/PR7 nếu chưa cấu hình gateway thực.

---
**Kết luận:** **PASS — Sẵn sàng cho tích hợp hệ thống.**

