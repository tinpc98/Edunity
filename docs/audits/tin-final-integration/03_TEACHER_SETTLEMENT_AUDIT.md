# EDUNITY V3 — TASK TIN-FINAL-INTEGRATION
# BÁO CÁO 03: KIỂM TOÁN QUYẾT TOÁN & THU NHẬP GIÁO VIÊN (TEACHER SETTLEMENT AUDIT)

> **Mã công việc**: `FIN-INT-02` (Thuộc Task `TIN-FINAL-INTEGRATION`)  
> **Chủ quản**: TÍN — Payment & Finance Architect & Security Auditor  
> **Phạm vi kiểm toán**:  
> - `BackEnd/src/models/TeacherEarning.js`  
> - `BackEnd/src/models/TeacherSettlement.js`  
> - `BackEnd/src/services/settlementService.js`  
> - `BackEnd/src/services/financialDispatchService.js`  
> - `BackEnd/src/services/payoutService.js`  
> - `BackEnd/src/models/BankProofRegistry.js`  
> - `BackEnd/tests/teacherSettlement.pr7.test.js`  
> - `BackEnd/tests/finalSecurityGate.pr10.test.js`  

---

## 1. VÒNG ĐỜI THU NHẬP GIÁO VIÊN (TEACHER EARNING LIFECYCLE)

Toàn bộ quy trình từ khi thu học phí đến khi giải ngân chuyển khoản cho giáo viên tuân thủ nghiêm ngặt cỗ máy trạng thái (State Machine):

```
[Webhook payOS Khớp Tiền] 
       │
       ▼
[Tạo TeacherEarning: PENDING] (settlementHoldRequired = true)
       │
       ▼ (Lớp hoàn thành: Class COMPLETED)
[Cỗ Máy Kiểm Soát 12 Rào Chắn: evaluateClassSettlement]
       ├── Kiểm tra buổi học kết thúc (Terminal Sessions)
       ├── Kiểm tra buổi học bù (No Pending Makeup Sessions)
       ├── Kiểm tra khiếu nại (No Active Disputes / Reports)
       ├── Kiểm tra hoàn tiền (No Pending Refund Reviews)
       ├── Kiểm tra đối soát (No Active Payment Reconciliations)
       └── Đếm đủ 7 ngày kể từ mốc cuối cùng (SEVEN_DAY_HOLD_ACTIVE)
       │
       ▼ (Đủ 7 ngày và 0 rào cản)
[Chuyển Trạng Thái: AVAILABLE] (Sẵn sàng cho giáo viên yêu cầu rút tiền)
       │
       ▼ (Thứ Hai, khung giờ 08:00 - 17:00)
[Giáo viên gửi yêu cầu rút tiền: WITHDRAWAL_REQUESTED / PENDING PAYOUT]
       │
       ▼ (Admin 1 phê duyệt hồ sơ rút tiền)
[Hồ sơ Payout: APPROVED] (Lên lịch chi trả vào Thứ Sáu)
       │
       ▼ (Thứ Sáu, khung giờ 08:00 - 17:00)
[Admin 1 thực hiện chuyển khoản ngân hàng ngoài đời thực]
       │
       ▼ (Nộp mã biên lai giao dịch ngân hàng vào hệ thống)
[Hồ sơ Payout: AWAITING_BANK_VERIFICATION] (Lưu vết vào BankProofRegistry)
       │
       ▼ (Admin 2 độc lập kiểm tra sao kê ngân hàng số - Four-Eyes Principle)
[Xác minh hoàn tất: Payout COMPLETED]
       ├── TeacherEarning -> PAID_OUT (Đóng sổ thu nhập)
       ├── TeacherSettlement -> PAID_OUT (Hoàn tất quyết toán)
       └── Ghi sổ cái Transaction -> TEACHER_PAYOUT (Khớp số dư)
```

---

## 2. KIỂM ĐỊNH TÍNH TOÀN VẸN CỦA CƠ CHẾ QUYẾT TOÁN (SETTLEMENT INTEGRITY)

### 2.1. Đảm bảo nguồn tiền & Chống tạo trùng Earning
- `TeacherEarning` chỉ được tạo khi và chỉ khi `Payment.paymentStatus === 'COMPLETED'` hoặc `Scholarship.status === 'CONFIRMED'`.
- Thuộc tính `paymentId` được đánh `unique index` trên collection `teacher_earnings`. Không có kịch bản nào (kể cả webhook retry hay lỗi mạng) có thể sinh 2 bản ghi earning cho cùng 1 đơn hàng thanh toán.

### 2.2. Kiểm soát thời gian giữ an toàn 7 ngày (7-Day Hold Rule - BR-07)
- Quy định `HOLD_DAYS = 7` (tương đương 604.800.000 ms) được bảo vệ bằng mã nguồn bất biến tại `settlementService.js`:
  ```javascript
  const HOLD_DAYS = 7;
  const holdDurationMs = HOLD_DAYS * 24 * 60 * 60 * 1000;
  if (now.getTime() - latestMilestoneMs < holdDurationMs) {
    blockers.push("SEVEN_DAY_HOLD_ACTIVE");
  }
  ```
- **Nguyên tắc tính mốc động (Dynamic Milestone Pushback)**:
  - Nếu lớp học kết thúc vào Ngày 0, nhưng phát sinh một buổi học bù hoàn thành vào Ngày 4, hoặc phát sinh khiếu nại xử lý xong vào Ngày 5:
  - `latestMilestoneAt` lập tức được đẩy lùi về Ngày 5. Thời hạn 7 ngày sẽ được tính lại từ Ngày 5 (đến Ngày 12 mới trưởng thành sang AVAILABLE).
- **Nguyên tắc Fail-Closed đối với dữ liệu cũ (Legacy Earning)**:
  - Bản ghi `TeacherEarning` thiếu cờ `settlementHoldRequired` mặc định được xem như `true` (`{ $ne: false }`), không bao giờ bị auto-release lén lút khi lớp kết thúc.

### 2.3. Khóa cứng hai khung giờ vàng (Monday Withdrawal & Friday Payout Windows)
- **Cửa sổ yêu cầu rút tiền của Giáo viên**: Chỉ mở từ **08:00:00 đến 16:59:59 ngày Thứ Hai hàng tuần** (Giờ hành chính Việt Nam). Mọi yêu cầu gửi vào 07:59:59 Thứ Hai hoặc 17:00:00 Thứ Hai trở đi đều bị từ chối với mã lỗi `400 WITHDRAWAL_WINDOW_CLOSED`.
- **Cửa sổ giải ngân Payout của Kế toán/Admin**: Chỉ mở từ **08:00:00 đến 16:59:59 ngày Thứ Sáu hàng tuần**.

### 2.4. Nguyên tắc kiểm soát kép Four-Eyes & Phòng chống tái sử dụng biên lai
- Admin 1 (người tạo hoặc duyệt yêu cầu rút tiền) **không thể tự xác nhận hoàn tất Payout**.
- Bắt buộc Admin 2 (có vai trò quản trị viên tài chính độc lập) đăng nhập và gọi endpoint xác minh kèm mã biên nhận ngân hàng thực tế.
- Mã tham chiếu ngân hàng (`bankReference`) được lưu vào bảng `BankProofRegistry` có `unique index`. Cấm tuyệt đối hành vi tái sử dụng một biên lai chuyển khoản cũ cho hai đợt payout khác nhau hoặc giữa Payout và Refund.

---

## 3. CHÍNH SÁCH HOA HỒNG (COMMISSION RATE IMMUTABILITY)

- Tỷ lệ hoa hồng nền tảng (`commissionRate`, ví dụ 20%) và tỷ lệ chia sẻ giáo viên (80%) được chụp snapshot vĩnh viễn vào `TeacherEarning` tại thời điểm tạo đơn:
  - `earning.grossAmount`: Toàn bộ học phí lớp học (100%).
  - `earning.commissionRate`: Tỷ lệ hoa hồng nền tảng tại thời điểm giao dịch.
  - `earning.commissionAmount`: Số tiền nền tảng giữ lại.
  - `earning.netAmount`: Số tiền thực nhận của giáo viên.
- Nếu Ban Quản Trị sau đó điều chỉnh chính sách hoa hồng của sàn lên 30% hay 15%, thu nhập của các lớp học đã thanh toán trước đó **hoàn toàn giữ nguyên giá trị snapshot ban đầu**, không bị thay đổi hồi tố.

---

## 4. KẾT QUẢ KIỂM THỬ XÁC MINH (TEST EVIDENCE)

1. **Bộ kiểm thử toàn diện `BackEnd/tests/teacherSettlement.pr7.test.js`**:
   - Chạy thành công **60/60 tests (PASS 100%)** trong 40.5s:
     - Group A: 14/14 tests động cơ 12 rào cản quyết toán.
     - Group B: 11/11 tests khung giờ rút tiền Thứ Hai.
     - Group C: 12/12 tests khung giờ giải ngân Thứ Sáu và kiểm soát kép Four-Eyes.
     - Group D: 9/9 tests tính bất biến hoa hồng và chống race condition đồng thời.
     - Group E: 14/14 tests hồi quy toàn bộ chuỗi thanh toán PR1–PR6.
2. **Bộ kiểm thử cổng an ninh tài chính `BackEnd/tests/finalSecurityGate.pr10.test.js`**:
   - Chạy thành công **13/13 tests (PASS 100%)** trong 12.7s.
   - Xác minh: Không thể bypass thời gian qua HTTP headers; cờ `settlementHoldRequired` mặc định fail-closed; đủ 7 ngày mới cho phép chuyển `AVAILABLE`.

---

## 5. KẾT LUẬN NGHIỆP VỤ

- Toàn bộ cơ chế hạch toán doanh thu, tính toán hoa hồng, giữ tiền an toàn 7 ngày và giải ngân có kiểm soát kép của Tín đã đạt chuẩn mực an toàn cao nhất của hệ thống thanh toán giáo dục trực tuyến.
- **Trạng thái**: **FIN-INT-02: DONE (HOÀN THÀNH)**.

