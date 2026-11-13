# EDUNITY V3 — TASK TIN-FINAL-MERGE-READINESS
# BÁO CÁO 02: TƯƠNG THÍCH VÒNG ĐỜI LỚP HỌC VÀ ĐỒNG BỘ TÀI CHÍNH
# (CLASS LIFECYCLE & FINANCIAL SETTLEMENT COMPATIBILITY AUDIT — FIN-INT-01)

> **Mã nhiệm vụ**: `TIN-FINAL-MERGE-READINESS`  
> **Chủ quản**: TÍN — Payment & Finance Architect, Financial Security Auditor  
> **Tập tin liên quan**:  
> - `BackEnd/src/services/classLifecycleService.js` (Châu sở hữu)  
> - `BackEnd/src/services/settlementService.js` (Tín sở hữu)  
> - `BackEnd/tests/classLifecycleRegression.test.js` (Châu sở hữu)  
> - `BackEnd/src/models/Class.js` (Châu sở hữu)  

---

## 1. ĐỐI CHIẾU THIẾT KẾ VÒNG ĐỜI LỚP HỌC SAU BẢN VÁ CỦA CHÂU

### 1.1. Thực trạng trước bản vá (Phát hiện tại TIN-FINAL-INTEGRATION)
Trên commit cũ, hàm `completeFinishedClasses` trong `classLifecycleService.js` từng có điểm nghẽn:
- Sử dụng khối `try { ... } catch (_) {}` nuốt toàn bộ lỗi khi kích hoạt quyết toán tài chính.
- Thiếu bao bọc giao dịch ACID giữa việc cập nhật trạng thái lớp học (`Class.status = "COMPLETED"`) và việc cập nhật trạng thái học viên (`Enrollment.enrollmentStatus = "COMPLETED"`).

### 1.2. Bản vá chính thức của Châu trên `dev` (Commits `104e893`, `53e9801`, `1dfd54c`)
Châu đã tái cấu trúc toàn diện cơ chế hoàn tất lớp học và tích hợp tài chính:
1. **Giao dịch ACID MongoDB**:
   Toàn bộ quá trình chuyển `Class` sang `COMPLETED`, cập nhật `Enrollment` sang `COMPLETED`, đánh dấu `settlementSyncStatus = "IN_PROGRESS"` và giải phóng các earning legacy (`settlementHoldRequired: false`) được bọc trong `dbSession.withTransaction`.
2. **Cơ chế Tracking lỗi đồng bộ có cấu trúc (`syncClassSettlementWithTracking`)**:
   - Loại bỏ hoàn toàn silent catch.
   - Khi `settlementService.evaluateClassSettlement(classId, { now })` thành công:
     Cập nhật `settlementSyncStatus = "SYNCED"`, `settlementSyncError = null`, `settlementSyncedAt = now`.
   - Khi có lỗi phát sinh:
     Cập nhật `settlementSyncStatus = "FAILED"`, `settlementSyncError = err.message`, `settlementSyncLastAttemptAt = now`, tăng bộ đếm `settlementSyncAttempts`.
3. **Cơ chế tự động thử lại Idempotent (`retryPendingClassSettlements`)**:
   - Thiết lập hằng số `SETTLEMENT_LEASE_MS = 5 * 60 * 1000` (5 phút).
   - Tự động quét và khóa lease nguyên tử (`findOneAndUpdate`) đối với các lớp có `settlementSyncStatus: "FAILED"` hoặc các lớp bị treo `IN_PROGRESS` quá 5 phút.
   - Ngăn chặn triệt để tình trạng hai cron job cạnh tranh xử lý đồng thời (Race Condition).

---

## 2. PHÁT HIỆN LỖI VÀ SỬA ĐỔI PHÍA FINANCE CỦA TÍN (BUG FIX TRONG SETTLEMENT SERVICE)

### 2.1. Phát hiện lỗ hổng mốc thời gian (Timestamp Flaw)
Trong `BackEnd/src/services/settlementService.js` (dòng 315 cũ):
```javascript
// Mã cũ:
milestones.classCompletedAt = classDoc.completedAt || classDoc.endDate || classDoc.updatedAt;
```
- **Nguyên nhân rủi ro**: Trường `classDoc.updatedAt` là dấu thời gian hệ thống kỹ thuật, tự động cập nhật mỗi khi có bất kỳ thao tác ghi nào trên document `Class`.
- **Hậu quả**: Khi cơ chế `retryPendingClassSettlements` của Châu chạy lại để ghi nhận `settlementSyncStatus`, trường `updatedAt` của `Class` bị cập nhật thành thời điểm hiện tại (`Date.now()`). Điều này vô tình **khởi động lại (restart) toàn bộ chu kỳ 7 ngày** giữ tiền của giáo viên từ đầu, khiến doanh thu bị giam giữ vô tận và sai lệch nghiệp vụ tài chính.

### 2.2. Bản vá tối thiểu và chuẩn xác của Tín
Tín đã sửa đổi trực tiếp trong `BackEnd/src/services/settlementService.js`:
```javascript
// Mã mới (TIN-FINAL-MERGE-READINESS):
// Chỉ chấp nhận mốc nghiệp vụ chính thức: completedAt hoặc endDate.
// Không dùng updatedAt để tránh việc cập nhật trạng thái kỹ thuật làm reset chu kỳ 7 ngày.
milestones.classCompletedAt = classDoc.completedAt || classDoc.endDate || null;
```
- **Tính an toàn**: Nếu một lớp học không có `completedAt` hoặc `endDate`, hệ thống sẽ dựa vào mốc kết thúc của buổi học thực tế cuối cùng (`milestones.lastSessionCompletedAt`) theo đúng Quy tắc BR-07/BR-08.

---

## 3. BẰNG CHỨNG KIỂM THỬ TRÊN BẢN TÍCH HỢP THỬ CÔ LẬP

Chạy kiểm thử kết hợp giữa bộ test học thuật của Châu và bộ test tài chính của Tín trong `d:\Dự Án\Edunity-trial-merge\BackEnd`:
- **Suite**: `tests/classLifecycleRegression.test.js` (Châu)
- **Suite**: `tests/finalSecurityGate.pr10.test.js` (Tín)
- **Kết quả**:
  - `classLifecycleRegression.test.js`: **6 / 6 tests PASS (100%)**
  - `finalSecurityGate.pr10.test.js`: **13 / 13 tests PASS (100%)**
  - Cơ chế retry lease 5 phút và chuyển giao trạng thái `SYNCED` hoạt động hoàn hảo.
  - Chu kỳ giữ tiền 7 ngày được kích hoạt đúng mốc thời gian thực tế, không bị ảnh hưởng bởi retry.

**Kết luận**: **FIN-INT-01: DONE & VERIFIED**. Vòng đời lớp học và phân hệ tài chính tương thích tuyệt đối.

