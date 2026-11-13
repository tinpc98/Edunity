# EDUNITY V3 — TASK TIN-FINAL-MERGE-READINESS
# BÁO CÁO 04: QUYẾT TOÁN THU NHẬP GIÁO VIÊN VÀ CHÍNH SÁCH HOA HỒNG
# (TEACHER SETTLEMENT ENGINE, IDEMPOTENCY & COMMISSION POLICY AUDIT — FIN-INT-02)

> **Mã nhiệm vụ**: `TIN-FINAL-MERGE-READINESS`  
> **Chủ quản**: TÍN — Payment & Finance Architect, Financial Security Auditor  
> **Tập tin liên quan**:  
> - `BackEnd/src/services/settlementService.js`  
> - `BackEnd/src/services/financialDispatchService.js`  
> - `BackEnd/src/models/TeacherEarning.js`  
> - `BackEnd/src/models/Transaction.js`  
> - `BackEnd/src/utils/settings.js`  

---

## 1. XÁC MINH RÀO CẢN BẢO VỆ DOANH THU VÀ CHỐNG TRÙNG LẶP (IDEMPOTENCY & GATES)

### 1.1. Chống tạo bản ghi thu nhập trùng lặp (Anti-Double Count)
- **Mức Database**: Model `TeacherEarning.js` thiết lập ràng buộc duy nhất:
  ```javascript
  enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, unique: true }
  ```
  Mỗi đơn ghi danh (`Enrollment`) chỉ được phép sinh tối đa đúng **1** bản ghi `TeacherEarning`. Bất kỳ race condition nào cố gắng chèn bản ghi thứ hai đều bị MongoDB từ chối với mã lỗi `E11000 duplicate key error`.
- **Mức Ứng dụng**: `financialDispatchService.js` kiểm tra cờ CAS trong transaction trước khi gọi `createTeacherEarning`.
- **Sổ cái kế toán `Transaction`**: Được bảo vệ bởi 5 Unique Partial Indexes (PR5 hardened) ngăn chặn hoàn toàn việc ghi nhận hai lần cho cùng một mã thanh toán payOS (`uniq_tx_payment_receipt_type`) hoặc sự kiện ngân hàng (`uniq_tx_bank_event_single_type`).

### 1.2. Tuân thủ 12 quy tắc quyết toán và chu kỳ giữ tiền 7 ngày
`settlementService.evaluateEarningSettlement` thực thi 12 điều kiện bắt buộc:
1. `ENROLLMENT_NOT_ELIGIBLE`: Đơn ghi danh phải `CONFIRMED` hoặc `COMPLETED`.
2. `PAYMENT_NOT_COMPLETED`: Thanh toán học phí phải hoàn tất `COMPLETED`.
3. `CLASS_NOT_COMPLETED`: Lớp học phải có trạng thái `COMPLETED`.
4. `NO_SESSIONS_FOUND` & `UNFINISHED_SESSIONS`: Tất cả buổi học phải kết thúc (`COMPLETED` / `CANCELLED`).
5. `PENDING_MAKEUP_SESSIONS`: Không còn buổi học bù nào đang treo.
6. `PENDING_RESCHEDULE_REQUESTS`: Không có yêu cầu đổi lịch học nào đang chờ duyệt.
7. `ACTIVE_TEACHER_INCIDENTS`: Không có sự cố giảng dạy nào đang bị điều tra.
8. `ACTIVE_DISPUTES`: Không có báo cáo khiếu nại nào từ học sinh đang chờ giải quyết.
9. `PENDING_REFUND_REVIEWS`: Không có yêu cầu hoàn tiền nào đang xem xét.
10. `ACTIVE_PAYMENT_RECONCILIATIONS`: Không có đối soát giao dịch ngân hàng nào đang mở.
11. `COMMISSION_POLICY_INVALID`: Tỷ lệ hoa hồng phải hợp lệ trong khoảng `[0, 1]`.
12. `SEVEN_DAY_HOLD_ACTIVE`: Phải trải qua đủ **604.800 giây (7 ngày)** tính từ mốc muộn nhất giữa: ngày kết thúc lớp, buổi học cuối cùng, buổi học bù cuối cùng, hoặc khiếu nại được giải quyết dứt điểm.

### 1.3. Khóa chặt mọi đường giải ngân sớm
- Toàn bộ runtime được khóa chặt bởi cờ `PAYOUT_ENABLED = false`.
- Khung giờ rút tiền: Chỉ mở vào **Thứ Hai hàng tuần (08:00 – 17:00)**.
- Khung giờ chi trả: Chỉ thực thi vào **Thứ Sáu hàng tuần (08:00 – 17:00)**.
- Kiểm soát kép Four-Eyes: Tối thiểu 2 Admin khác nhau thực hiện phê duyệt và hoàn tất.
- Đối soát mã ủy nhiệm chi qua `BankProofRegistry`.

---

## 2. BẢN CHẤT CHÍNH SÁCH HOA HỒNG (COMMISSION POLICY AUDIT)

### 2.1. Đính chính số liệu và hiện trạng mã nguồn
- Con số "70% giáo viên / 30% nền tảng" đề cập trong các bản tóm tắt trước là một câu chữ ví dụ lý thuyết, **KHÔNG HỀ TỒN TẠI** trong bất kỳ fixture test hay mã nguồn nghiệp vụ nào.
- Trong mã nguồn hiện hành:
  - Cấu hình mẫu `.env.example`: `COMMISSION_RATE = 0.10` (Nền tảng 10%, Giáo viên 90%).
  - Cơ chế giải quyết chính sách `resolveCommissionPolicy()` trong `BackEnd/src/utils/settings.js`:
    - Ở môi trường test/local dev: Dùng fallback có gắn thẻ rõ ràng:
      `{ rate: 0.1, version: "DEV_TEST_FALLBACK_V1", source: "DEV_TEST_UNAPPROVED_FALLBACK", isApproved: false }`.
    - Ở môi trường Staging/Production: Nếu `COMMISSION_POLICY_APPROVED !== "true"`, hệ thống chặn hoàn toàn với mã lỗi HTTP 503 `COMMISSION_POLICY_NOT_CONFIGURED` / `COMMISSION_POLICY_NOT_APPROVED`.
  - Trên nhánh `dev`, Châu bổ sung `platformSettingService` và chủ động giữ nguyên cơ chế bảo vệ của Tín khi không có ghi đè từ DB.

### 2.2. Phán quyết chính sách hoa hồng
- Hiện tại, **chưa có văn bản pháp lý chính thức nào từ Product Owner / Ban Lãnh Đạo** phê duyệt tỷ lệ hoa hồng cố định cho Production.
- **Phán quyết**: **`POLICY_BLOCKED`** đối với việc vận hành Live Production. Tín giữ nguyên cơ chế bảo vệ fail-closed, tuyệt đối không tự ý quyết định tỷ lệ khi chưa có sự phê duyệt chính thức.

**Kết luận**: **FIN-INT-02: DONE & VERIFIED**. Hệ thống quyết toán an toàn, không thể tạo thu nhập trùng hay giải ngân sớm.

