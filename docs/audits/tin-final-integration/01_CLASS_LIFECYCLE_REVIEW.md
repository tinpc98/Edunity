# EDUNITY V3 — TASK TIN-FINAL-INTEGRATION
# BÁO CÁO 01: KIỂM TOÁN VÀ ĐÁNH GIÁ CHU TRÌNH LỚP HỌC (CLASS LIFECYCLE REVIEW)

> **Mã công việc**: `FIN-INT-01` (Thuộc Task `TIN-FINAL-INTEGRATION`)  
> **Chủ quản**: TÍN — Payment & Finance Architect & Security Auditor  
> **Đối tác liên quan**: CHÂU — Academic & Class Lifecycle Owner  
> **Tập tin kiểm toán chính**:  
> - `BackEnd/src/services/classLifecycleService.js`  
> - `BackEnd/src/services/settlementService.js`  
> - `BackEnd/src/models/Class.js`  
> - `BackEnd/src/models/TeacherEarning.js`  
> - `BackEnd/tests/classLifecycleRegression.test.js` (commit `53e9801` trên nhánh `dev`)  

---

## 1. TỔNG QUAN HIỆN TRẠNG & ĐỐI SOÁT GIỮA CÁC NHÁNH (CROSS-BRANCH AUDIT)

### 1.1. Hiện trạng trên nhánh `feature/teacher-admin` (Trước khi Châu sửa)
Tại `BackEnd/src/services/classLifecycleService.js` dòng 56–72:
```javascript
// Mã cũ trên feature/teacher-admin:
const res = await Class.updateOne({ _id: cls._id, status: "IN_PROGRESS" }, { $set: { status: "COMPLETED" } });
if (res.modifiedCount !== 1) continue;

await Enrollment.updateMany(
  { classId: cls._id, enrollmentStatus: "CONFIRMED" },
  { $set: { enrollmentStatus: "COMPLETED" } }
);
await TeacherEarning.updateMany(
  { classId: cls._id, status: "PENDING", settlementHoldRequired: false },
  { $set: { status: "AVAILABLE" } }
);
try {
  const settlementService = require("./settlementService");
  await settlementService.evaluateClassSettlement(cls._id, { now });
} catch (_) {} // ⚠️ LỖ HỔNG P0: Silent catch nuốt lỗi đánh giá quyết toán!
```
**Các điểm yếu nghiêm trọng đã phát hiện**:
1. **Thiếu tính nguyên tử (No Transaction)**: `Class.updateOne`, `Enrollment.updateMany` và `TeacherEarning.updateMany` chạy rời rạc không có MongoDB session. Nếu server sập giữa chừng, Class thành COMPLETED nhưng Enrollment vẫn CONFIRMED.
2. **Nuốt lỗi nghiêm trọng (Silent Catch `catch (_) {}`)**: Nếu `evaluateClassSettlement` gặp lỗi (DB connection timeout, deadlock, logic exception), lỗi bị nuốt hoàn toàn, Class không ghi nhận trạng thái đồng bộ, và thu nhập của giáo viên bị treo vĩnh viễn mà không có cơ chế retry tự động.

---

### 1.2. Phân tích bản vá của Châu trên nhánh `dev` (Commit `53e9801` / `104e893`)
Châu đã tiếp thu kiến nghị và tái cấu trúc toàn diện `classLifecycleService.js`:
1. **Bổ sung giao dịch phân tán ACID**:
   - Sử dụng `dbSession.withTransaction(...)` bao bọc:
     - `Class.updateOne({ _id: cls._id, status: "IN_PROGRESS" }, { $set: { status: "COMPLETED", completedAt: now, settlementSyncStatus: "IN_PROGRESS" } })`
     - `Enrollment.updateMany({ classId: cls._id, enrollmentStatus: "CONFIRMED" }, { $set: { enrollmentStatus: "COMPLETED" } })`
     - `TeacherEarning.updateMany({ classId: cls._id, status: "PENDING", settlementHoldRequired: false }, { $set: { status: "AVAILABLE" } })`
2. **Loại bỏ triệt để Silent Catch với `syncClassSettlementWithTracking`**:
   - Tách riêng hàm đồng bộ quyết toán sau khi commit transaction.
   - Thành công: Ghi nhận `settlementSyncStatus: "SYNCED"`, `settlementSyncedAt: now`.
   - Thất bại: Bắt lỗi có cấu trúc (`console.error`), cập nhật vào database `Class.settlementSyncStatus: "FAILED"`, `settlementSyncError: err.message`, và tăng `settlementSyncAttempts`.
3. **Cơ chế phục hồi tự động (Auto-Recovery Worker)**:
   - Bổ sung hàm `retryPendingClassSettlements(now, skipClassIds)`:
   - Quét các Class có `settlementSyncStatus: "FAILED"` hoặc `IN_PROGRESS` quá 5 phút (`SETTLEMENT_LEASE_MS = 300000`).
   - Sử dụng Compare-And-Swap nguyên tử `findOneAndUpdate` để tránh race condition giữa các tiến trình chạy song song, sau đó retry đánh giá quyết toán.

---

## 2. KIỂM ĐỊNH 8 BẢO ĐẢM TÀI CHÍNH BẮT BUỘC (FINANCIAL INVARIANTS)

Qua rà soát đối chiếu giữa `classLifecycleService.js` và `settlementService.js`:

| STT | Ràng Buộc Bắt Buộc | Cơ Chế Kiểm Soát Kỹ Thuật | Đánh Giá |
|:---:|---|---|:---:|
| 1 | **Không hoàn thành Class sai điều kiện** | Kiểm tra `sessions.every(isTerminalSession)` và `periodEnd <= now.getTime()`. Nếu còn buổi học chưa kết thúc, Class tuyệt đối không chuyển `COMPLETED`. | 🟢 **PASS** |
| 2 | **Không tính earning từ Payment chưa hợp lệ** | `settlementService.evaluateEarningSettlement` đối chiếu `Payment.paymentStatus === 'COMPLETED'`. Payment PENDING/FAILED không bao giờ sinh earning hợp lệ. | 🟢 **PASS** |
| 3 | **Không quyết toán lớp chưa hoàn thành** | Khóa chặn `CLASS_NOT_COMPLETED`: Earning của lớp có trạng thái `OPEN`, `IN_PROGRESS` bị chặn 100% không cho quyết toán. | 🟢 **PASS** |
| 4 | **Không quyết toán khi còn học bù** | Khóa chặn `PENDING_MAKEUP_SESSIONS`: Kiểm tra toàn bộ buổi học bù có `sessionType: 'MAKEUP'`. Nếu chưa kết thúc, earning giữ nguyên trạng thái `PENDING`. | 🟢 **PASS** |
| 5 | **Không quyết toán khi còn tranh chấp** | Khóa chặn `ACTIVE_DISPUTES` và `ACTIVE_TEACHER_INCIDENTS`: Kiểm tra bảng `Report` và `TeacherIncidentReport`. Khiếu nại mở sẽ khóa chặt dòng tiền. | 🟢 **PASS** |
| 6 | **Không giải ngân khi còn Refund blocker** | Khóa chặn `PENDING_REFUND_REVIEWS` và `ACTIVE_PAYMENT_RECONCILIATIONS`: Mọi yêu cầu hoàn tiền hoặc chênh lệch đối soát chưa đóng đều ngăn chặn quyết toán. | 🟢 **PASS** |
| 7 | **Bảo lưu tuyệt đối thời gian giữ 7 ngày** | Khóa chặn `SEVEN_DAY_HOLD_ACTIVE`: `latestMilestoneAt` tính từ mốc muộn nhất (ngày lớp xong, buổi bù xong, hoặc tranh chấp xong). Dưới 7 ngày (604.800 giây) thì earning giữ `PENDING`. | 🟢 **PASS** |
| 8 | **Chống trùng Earning & Settlement** | Unique Index `{ earningId: 1 }` trên `TeacherSettlement` và `{ paymentId: 1 }` trên `TeacherEarning` ngăn ngừa 100% nhân đôi bản ghi. | 🟢 **PASS** |

---

## 3. PHÂN ĐỊNH RANH GIỚI TRÁCH NHIỆM (CODE OWNERSHIP & HANDOFF)

- **Thuộc sở hữu của CHÂU**:
  - Module `BackEnd/src/services/classLifecycleService.js`
  - Vòng đời Class/Session/Makeup Session
  - Bản vá `syncClassSettlementWithTracking` và `retryPendingClassSettlements` đã được Châu hoàn thành xuất sắc trên nhánh `dev`.
- **Thuộc sở hữu của TÍN**:
  - Module `BackEnd/src/services/settlementService.js`
  - Logic tính toán `evaluateClassSettlement`, quy tắc 12 chốt chặn quyết toán và thời gian giữ 7 ngày.
- **Kết luận nghiệm thu FIN-INT-01**: **DONE (ĐẠT)**. Bản vá của Châu trên `dev` hoàn toàn tương thích và khớp nối chặt chẽ với kiến trúc Tài chính của Tín.

