# BÁO CÁO ĐIỀU TRA SỰ CỐ P0: THANH TOÁN THẬT 2 LẦN NHƯNG KHÔNG ĐƯỢC CONFIRM GHI DANH
**Mã sự cố:** `TIN-P0-DOUBLE-RECEIPT-NO-ENROLLMENT`  
**Chủ trì:** Tín — Payment & Finance Architect  
**Mức độ nghiêm trọng:** P0 — Critical Financial & State Machine Incident  
**Thời gian xảy ra:** Ngày 20/11/2026, 09:35:25 GMT+7 (Lần 1) & 10:25:54 GMT+7 (Lần 2)  
**Nhánh Git:** `feature/teacher-admin`  
**Workspace:** `D:\Dự Án\Edunity`  

---

## 1. TÓM TẮT DIỄN BIẾN SỰ CỐ (EXECUTIVE SUMMARY)

Người dùng đã thực hiện **2 lần chuyển khoản ngân hàng THẬT** bằng VietQR qua cổng payOS cho cùng một lớp học:
* **Khóa học / Lớp học:** "TEST PAYOS 3K - Toán 12 THPT"
* **Số tiền mỗi lần:** 3.000 VNĐ
* **Tổng số tiền thực tế tài khoản thụ hưởng đã nhận:** 6.000 VNĐ (Ngân hàng Quân Đội MBBank, STK: `4008999999`, Chủ TK: `PHAM CONG TIN`)
* **Trạng thái trên cổng payOS:** Cả 2 giao dịch đều `PAID` (Thành công 100%)

### Hậu quả thực tế:
1. Giao diện thanh toán (popup modal) không tự động đóng, không hiển thị trạng thái thành công.
2. Học sinh không được tự động chuyển hướng về trang lớp học (`/student/classes/:classId`).
3. Dữ liệu trên hệ thống MongoDB:
   - Cả 2 `Payment` đều kẹt ở `PENDING`.
   - Cả 2 `Enrollment` đều bị Cron chuyển thành `EXPIRED` (hết hạn giữ chỗ 10 phút / 15 phút).
   - 0 quyền lợi học tập được cấp (enrolledCount lớp học vẫn là 0/20).
   - Không có giao dịch `Transaction` nào được ghi sổ.
   - Không có khoản thu nhập `TeacherEarning` nào được tạo cho giáo viên.

---

## 2. MA TRẬN ĐỐI SOÁT DỮ LIỆU THỰC TẾ (AUDIT EVIDENCE MATRIX)

| Chỉ mục | Giao dịch Lần 1 (09:35 GMT+7) | Giao dịch Lần 2 (10:25 GMT+7) |
| :--- | :--- | :--- |
| **OrderCode** | `100000008` | `100000009` |
| **Payment ID MongoDB** | `6affb173c018a7f472908143` | `6affbd51cfd3c19ebc0a4d11` |
| **Enrollment ID MongoDB** | `6affb171c018a7f472908142` | `6affbd50cfd3c19ebc0a4d0c` |
| **PayOS PaymentLink ID** | `21d8135b556c41f9af67a3864f6e6732` | `d9e517a71a25453aa76775d02c2a692b` |
| **Mã tham chiếu ngân hàng (FT)** | `FT26324691300734` | `FT26324478016017` |
| **Thời gian chuyển tiền ngân hàng**| `2026-11-20T09:35:25+07:00` | `2026-11-20T10:25:54+07:00` |
| **STK thụ hưởng thực tế** | `4008999999` (MBBank) | `4008999999` (MBBank) |
| **STK ảo VietQR (PayOS QR)** | `VQRQANTHA4218` | `VQRQANTHX1072` |
| **Nội dung chuyển khoản (CASSO)**| `Qantha4218 CASSO12135 ... EDUNITY HP 100000008` | `Qanthx1072 CASSO12135 ... EDUNITY HP 100000009` |
| **Trạng thái trên payOS API** | `PAID` (amountPaid: 3.000) | `PAID` (amountPaid: 3.000) |
| **BankTransferEvent** | Chưa có (Không có webhook về localhost) | `6affbdc3cfd3c19ebc0a4d18` (`ACCOUNT_MISMATCH`) |
| **PaymentReconciliation** | Chưa có | `6affbdc4cfd3c19ebc0a4d19` (`NEEDS_REVIEW`) |
| **Trạng thái Enrollment hiện tại** | `EXPIRED` | `EXPIRED` |
| **Trạng thái Payment hiện tại** | `PENDING` | `PENDING` |

---

## 3. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### Nguyên nhân gốc rễ 1: Lỗi so khớp tài khoản nhận trên VietQR ảo (`ACCOUNT_MISMATCH`)
* **Cơ chế VietQR của payOS:** Khi Edunity gọi `payOS.createPaymentLink`, payOS sinh ra mã QR chứa **Số tài khoản ảo VietQR Pro** (ví dụ `VQRQANTHX1072` hoặc `VQRQANTHA4218`).
* Thông tin này được lưu vào `Payment.providerMetadata.accountNumber = "VQRQANTHX1072"`.
* **Cơ chế báo cáo giao dịch ngân hàng của payOS:** Khi học sinh quét mã QR và chuyển khoản thành công, ngân hàng MBBank ghi nhận tiền vào **Số tài khoản chính của chủ tài khoản** (`4008999999`), đồng thời hệ thống Open Banking / Casso ghi nhận mã định danh tài khoản ảo vào nội dung giao dịch: `Qanthx1072 CASSO12135 ...`.
* Do đó, trong webhook payload và trong API `getPaymentLinkInformation` của payOS:
  - `transaction.accountNumber = "4008999999"` (Số tài khoản vật lý).
  - `transaction.description` chứa `Qanthx1072`.
* **Đoạn code kiểm tra cũ trong `payosWebhookService.js`:**
  ```javascript
  const trustedAccount = resolveTrustedExpectedAccount(channelKey, matchedIntent);
  if (trustedAccount && parsed.accountNumber && trustedAccount !== parsed.accountNumber) {
    eventStatus = "ACCOUNT_MISMATCH";
    reconciliationReason = "ACCOUNT_MISMATCH";
    normalizedError = "Receiver bank account does not match verified channel account";
  }
  ```
  Hàm `resolveTrustedExpectedAccount` lấy `intent.providerMetadata.accountNumber` (`"VQRQANTHX1072"`) làm `trustedAccount`.  
  Khi so sánh `"VQRQANTHX1072"` !== `"4008999999"`, kết quả **LUÔN LUÔN BỊ LỆCH (MISMATCH)**!
* **Hậu quả trực tiếp:** Toàn bộ các khoản thanh toán thật qua VietQR payOS đều bị gắn cờ `ACCOUNT_MISMATCH`, chuyển thành `dispatchStatus: "RECONCILIATION_REQUIRED"`. Bộ điều phối tài chính `financialDispatchService` **bị chặn đứng**, không thể chuyển trạng thái Payment sang `COMPLETED`, không confirm `Enrollment`, không tạo `Transaction` và không tạo `TeacherEarning`!

### Nguyên nhân gốc rễ 2: Hạ tầng Local Runtime & Không có Webhook từ Internet
* Backend đang chạy ở môi trường Local:
  - Port `3000`: Backend Node.js Express (PID 3324).
  - Port `5173`: Frontend React Vite (PID 12644).
  - Không có tiến trình tunnel/ngrok nào đang mở cổng ra Internet (Port 4040 không hoạt động).
* Máy chủ payOS trên Internet **không thể gửi Webhook HTTP POST** trực tiếp đến `http://localhost:3000/api/payments/webhooks/payos/tuition`.
* **Tại sao Lần 1 thất bại hoàn toàn?**
  - Vào thời điểm 09:35, tính năng **Active Polling Sync** chưa được kích hoạt.
  - Không có Webhook đến, không có Active Polling -> Giao diện chỉ đọc `Payment` trong MongoDB (`PENDING`). Sau 15 phút, Cron job tự động quét và đánh dấu Enrollment là `EXPIRED`.
* **Tại sao Lần 2 đã có Active Polling nhưng vẫn thất bại?**
  - Vào thời điểm 10:25:55 (chỉ 1 phút sau khi tạo thanh toán), tính năng Active Polling trong `getPaymentById` đã truy vấn payOS thành công và phát hiện `status: "PAID"`.
  - Active Polling ký chữ ký HMAC và gọi `processPayosChannelWebhook`.
  - **NHƯNG ngay tại đây, giao dịch va phải Nguyên nhân gốc rễ 1 (`ACCOUNT_MISMATCH`)**, khiến sự kiện bị đẩy vào đối soát thay vì dispatch thành công!

---

## 4. GIẢI PHÁP VÀ BẢN VÁ TRIỂN KHAI (CODE FIX DETAILS)

### 4.1. Sửa hàm xác thực tài khoản nhận `isReceiverAccountMatch` trong `payosWebhookService.js`
Thay thế logic so khớp chuỗi thô bằng cơ chế xác thực đa tầng an toàn:
1. **Ưu tiên cấu hình máy chủ:** Nếu máy chủ có cấu hình biến môi trường `PAYOS_EXPECTED_ACCOUNT_NUMBER` hoặc `PAYOS_TUITION_EXPECTED_ACCOUNT_NUMBER`, kiểm tra trực tiếp với số tài khoản cấu hình.
2. **Khớp trực tiếp:** Nếu số tài khoản gửi về khớp số tài khoản lưu trong `providerMetadata.accountNumber` hoặc `virtualAccountNumber` -> Chấp thuận.
3. **Khớp tài khoản ảo VietQR Pro:** Nếu tài khoản lưu có tiền tố `VQR` (ví dụ `VQRQANTHX1072`), trích xuất hậu tố alias (ví dụ `QANTHX1072`) và kiểm tra sự hiện diện của alias trong `description` của giao dịch ngân hàng đã được ký số -> Chấp thuận 100% hợp lệ.
4. **Bảo mật tuyệt đối:** Nếu số tài khoản gửi về là một tài khoản lạ không khớp cấu hình và không chứa mã VietQR hợp lệ (ví dụ `UNTRUSTED_ACCOUNT_000` như trong Test 13), hệ thống tiếp tục chặn đứng với lỗi `ACCOUNT_MISMATCH`.

### 4.2. Cập nhật Parser trích xuất `virtualAccountNumber`
Trong `validateVerifiedWebhookData`, bổ sung trường `virtualAccountNumber` để sẵn sàng tiếp nhận khi payOS gửi kèm trong data payload.

---

## 5. KẾT QUẢ KIỂM THỬ HỒI QUY CÔ LẬP (REGRESSION TEST SUITE)

Đã xây dựng và thực thi bộ kiểm thử hồi quy tự động độc lập: `BackEnd/tests/p0DoubleReceiptIncident.test.js`:
* **Test 1 (Unit):** `isReceiverAccountMatch` đối soát chính xác giữa tài khoản ảo `VQRQANTHX1072` và tài khoản MBBank `4008999999` kèm mã trong description; chặn tài khoản lạ không có alias. -> **PASS**
* **Test 2 (E2E Webhook):** Mô phỏng toàn diện webhook payOS thật với tài khoản `4008999999` và nội dung thật. Kết quả: Chuyển trạng thái `DISPATCHED`, `Payment` thành `COMPLETED`, `Enrollment` thành `CONFIRMED`, `Class.enrolledCount` tăng từ 0 lên 1, tạo `TeacherEarning` thành công. -> **PASS**
* **Test 3 (Active Polling Recovery):** Mô phỏng polling `GET /api/payments/:id` khi payOS trả về `PAID`. Kết quả: Active Polling tự động khôi phục giao dịch thành `COMPLETED` và `CONFIRMED` mà không bị kẹt `ACCOUNT_MISMATCH`. -> **PASS**

### Kết quả chạy kiểm thử toàn diện:
```bash
npm --prefix BackEnd test -- tests/p0DoubleReceiptIncident.test.js tests/tuitionPaymentFinalFix.test.js tests/payosWebhook.pr2.test.js
```
* `tests/p0DoubleReceiptIncident.test.js`: **3/3 PASSED**
* `tests/tuitionPaymentFinalFix.test.js`: **5/5 PASSED**
* `tests/payosWebhook.pr2.test.js`: **11/11 PASSED**
* **Tổng cộng: 19/19 tests PASSED (0 lỗi)**

### Kiểm tra Build Frontend:
```bash
npm --prefix FrontEnd run build
```
* `tsc -b && vite build`: **Thành công trong 6.99 giây, 0 lỗi TypeScript, 0 lỗi cú pháp.**

---

## 6. PHƯƠNG ÁN ĐỐI SOÁT TÀI CHÍNH AN TOÀN CHO 2 KHOẢN TIỀN THẬT (RECONCILIATION PROPOSAL)

> [!IMPORTANT]
> **Quy tắc bảo mật tài chính:** Tuyệt đối không can thiệp sửa đổi trái phép sổ cái dữ liệu tài chính (Ledger / Payments / Enrollments) khi chưa có sự chấp thuận từ cấp quản lý. Dưới đây là phương án đề xuất cụ thể:

### Thực trạng tài chính:
* Tổng tiền Edunity đã thực nhận từ học sinh: **6.000 VNĐ** (2 giao dịch 3.000 VNĐ).
* Học phí lớp học "TEST PAYOS 3K - Toán 12 THPT": **3.000 VNĐ**.
* Sĩ số hiện tại: 0/20 (Còn 20 chỗ trống, đảm bảo còn quyền giữ chỗ).

### Phương án đề xuất: Mô hình "Ghi danh 1 lần + Hoàn trả khoản thừa" (Atomic Confirm & Refund Obligation)

#### Bước 1: Kích hoạt ghi danh hợp lệ bằng Giao dịch Lần 2 (`orderCode: 100000009`)
* **Lý do chọn Lần 2:** Lần 2 diễn ra gần nhất (10:25 GMT+7) và đã có sẵn bản ghi `BankTransferEvent` (`6affbdc3cfd3c19ebc0a4d18`) và `PaymentReconciliation` (`6affbdc4cfd3c19ebc0a4d19`).
* **Hành động hệ thống:**
  1. Cập nhật `BankTransferEvent.eventStatus` = `READY_FOR_DISPATCH`, xóa lỗi `normalizedError`.
  2. Khôi phục `Enrollment 6affbd50cfd3c19ebc0a4d0c` về `PENDING_PAYMENT` với thời hạn gia hạn giữ chỗ.
  3. Kích hoạt `financialDispatchService.dispatchBankTransferEvent(eventId)`.
  4. Hệ thống tự động ghi nhận:
     - `Payment 6affbd51cfd3c19ebc0a4d11` -> `COMPLETED`.
     - `Enrollment 6affbd50cfd3c19ebc0a4d0c` -> `CONFIRMED`.
     - `Class.enrolledCount` tăng thành 1.
     - Tạo bản ghi `Transaction` ghi nhận khoản thu 3.000 VNĐ vào tài khoản nền tảng.
     - Tạo bản ghi `TeacherEarning` (Gross: 3.000, Net: 2.700, Platform Fee: 300 VNĐ).
     - Đóng `PaymentReconciliation` với `status: RESOLVED`, note: "Reconciled with verified payOS reference FT26324478016017".

#### Bước 2: Xử lý khoản thanh toán trùng Lần 1 (`orderCode: 100000008`)
* **Bản chất tài chính:** Đây là khoản tiền thừa (Duplicate Tuition Payment) do học sinh thanh toán 2 lần cho cùng một lớp học.
* **Hành động hệ thống:**
  1. Tạo bản ghi `BankTransferEvent` cho `100000008` liên kết với reference `FT26324691300734`.
  2. Tạo bản ghi `PaymentReconciliation` với `reason: "DUPLICATE_PAYMENT_REFUND_REQUIRED"`, `status: "NEEDS_REVIEW"`.
  3. Mở hồ sơ `RefundCase` tự động với số tiền **3.000 VNĐ**:
     - Người nhận: `PHAM CONG TIN`
     - STK: `76828051998`
     - Ngân hàng: `MBBank` (Mã `01358001`)
  4. **Tuyệt đối KHÔNG confirm Enrollment lần thứ 2** và **KHÔNG nhân đôi khoản TeacherEarning** của giáo viên để tránh thất thoát tài chính.

---

## 7. KẾT LUẬN VÀ BÀN GIAO

1. **Root cause đã được triệt tiêu hoàn toàn trong code:** Từ thời điểm này, tất cả các giao dịch thanh toán thật qua VietQR của payOS sẽ được khớp chính xác thông qua định danh ảo VietQR Pro, không bao giờ bị dính lỗi `ACCOUNT_MISMATCH` giả.
2. **Cơ chế Active Polling đã hoàn thiện:** Dù chạy trên môi trường local không có ngrok webhook, hệ thống vẫn tự động phát hiện thanh toán thành công và kích hoạt dispatch ngay lập tức khi học sinh mở giao diện.
3. **Toàn bộ 19 test case tài chính và build frontend đều đạt chuẩn 100%.**
4. **Dữ liệu tài chính được giữ nguyên vẹn**, sẵn sàng để quản trị viên phê duyệt phương án đối soát an toàn.
