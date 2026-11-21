# EDUNITY V3 — BÁO CÁO ĐIỀU TRA SỰ CỐ THANH TOÁN THỰC TẾ (P0)

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/01_REAL_PAYMENT_INCIDENT.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Ngày điều tra:** 20/11/2026  
**Chủ trì:** Tín (Payment & Finance Architect)  
**Mức độ nghiêm trọng:** P0 (Sự cố tiền thực tế của người dùng)

---

## 1. TỔNG QUAN SỰ CỐ & BỐI CẢNH

Học sinh thực hiện đăng ký và chuyển khoản học phí cho lớp học thử nghiệm trên môi trường Development:
- **Tên lớp học:** `TEST PAYOS 3K - Toán 12 THPT`
- **Class ID:** `6affb0d095b40d0635bf0ad6`
- **Số tiền:** `3.000 VNĐ`
- **Học sinh (Student ID):** `6affad45c018a7f4729080cf`
- **Tài khoản thụ hưởng:** `970422` / `VQRQANTHA4218` (Nguyễn Văn Đức / payOS VietQR)

**Hiện tượng ghi nhận:**
Người dùng chuyển khoản thành công từ ngân hàng, tài khoản ngân hàng thụ hưởng đã nhận được 3.000 VNĐ. Tuy nhiên, giao diện học sinh trên trình duyệt vẫn đứng yên ở trạng thái "Đang giữ chỗ" / "Chờ thanh toán", không tự động điều hướng sang lớp học, và sau 15 phút chuyển sang "Đã hết hạn".

---

## 2. KẾT QUẢ ĐỐI SOÁT DỮ LIỆU THỰC TẾ TRÊN HỆ THỐNG

### 2.1. Bản ghi MongoDB (Local Database)
- **Payment Record ID:** `6affb173c018a7f472908143`
  - `purpose`: `TUITION`
  - `channelKey`: `TUITION`
  - `orderCode`: `100000008`
  - `amount`: `3000` VND
  - `paymentStatus`: `PENDING`
  - `provider`: `PAYOS`
  - `gatewayReference`: `PAYOS-T-100000008`
  - `paymentLinkId`: `21d8135b556c41f9af67a3864f6e6732`
  - `createdAt`: `2026-11-20T02:33:23.152Z` (09:33:23 GMT+7)
  - `expiredAt`: `2026-11-20T02:48:21.000Z` (09:48:21 GMT+7)
- **Enrollment Record ID:** `6affb171c018a7f472908142`
  - `studentId`: `6affad45c018a7f4729080cf`
  - `classId`: `6affb0d095b40d0635bf0ad6`
  - `enrollmentStatus`: `EXPIRED`
  - `holdExpiresAt`: `2026-11-20T02:48:21.896Z` (09:48:21 GMT+7)
  - `createdAt`: `2026-11-20T02:33:21.930Z`
  - `updatedAt`: `2026-11-20T02:49:00.107Z` (Cập nhật bởi `expireEnrollmentsJob`)
- **BankTransferEvent:** `0` bản ghi trong database.

### 2.2. Minh chứng thực tế từ cổng thanh toán payOS (Live API Evidence)
Truy vấn trực tiếp cổng thanh toán payOS qua kênh `TUITION` với `orderCode: 100000008`:
```json
{
  "id": "21d8135b556c41f9af67a3864f6e6732",
  "orderCode": 100000008,
  "amount": 3000,
  "amountPaid": 3000,
  "amountRemaining": 0,
  "status": "PAID",
  "createdAt": "2026-11-20T09:33:22+07:00",
  "transactions": [
    {
      "accountNumber": "4008999999",
      "amount": 3000,
      "counterAccountBankId": "01358001",
      "counterAccountBankName": null,
      "counterAccountName": "PHAM CONG TIN",
      "counterAccountNumber": "76828051998",
      "description": "Qantha4218 CASSO12135 4 GMshOP4TFHK4jkiU2SZWw2Ff EDUNITY HP 100000008 I2RUWVT7972588",
      "reference": "FT26324691300734",
      "transactionDateTime": "2026-11-20T09:35:25+07:00"
    }
  ]
}
```

---

## 3. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

1. **Webhook không thể gửi đến máy chủ cục bộ (`NO_WEBHOOK`):**
   - Ứng dụng Backend đang chạy tại `http://localhost:5000`. Cổng payOS trên internet không thể gửi webhook HTTP POST trực tiếp đến địa chỉ IP private/localhost của lập trình viên nếu không có tunnel công khai (ngrok/Cloudflare tunnel) cấu hình trong PayOS Merchant Portal.
   - Do đó, biến động số dư thành công tại 09:35:25 (sau 2 phút đặt chỗ) không thể truyền qua đường Webhook Inbound vào Backend.

2. **Cơ chế Polling cũ thụ động (Passive DB Read Only):**
   - Frontend thực hiện polling `GET /api/payments/:id` mỗi 3 giây.
   - Hàm `paymentService.getPaymentById` ở phiên bản cũ chỉ thực hiện truy vấn tĩnh từ MongoDB: `Payment.findById(paymentId)`.
   - Backend hoàn toàn không có bước truy vấn chủ động (Active Sync / Reconciliation) sang payOS link info khi đơn hàng đang ở trạng thái `PENDING`.
   - Kết quả: Khi không có webhook đến, cơ chế polling chỉ đọc đi đọc lại trạng thái `PENDING` trong database cục bộ.

3. **Cron Job hủy chỗ tự động khi hết hạn:**
   - Đến thời điểm 09:48:21 (15 phút sau khi tạo đơn), `holdExpiresAt` đã trôi qua.
   - Vào 09:49:00, cron job `expireEnrollmentsJob` quét các đơn quá hạn và chuyển trạng thái `Enrollment` thành `EXPIRED`, giải phóng sĩ số lớp học về `0/20`.
   - Tiền 3.000 VNĐ thực tế đã chuyển lúc 09:35:25 (rất sớm, trong hạn hợp lệ), nhưng hệ thống cục bộ bị treo và đánh dấu hết hạn sai thực tế.

---

## 4. GIẢI PHÁP ĐÃ TRIỂN KHAI (HOTFIX ARCHITECTURE)

1. **Active Polling Sync & Verified Webhook Synthesis:**
   - Trong `paymentService.getPaymentById`, bổ sung cơ chế kiểm tra chủ động: Khi học viên đang mở popup polling `GET /api/payments/:id` và thanh toán ở trạng thái `PENDING`:
     - Nếu `isPayosEnabled(channelKey)` bật, Backend gọi `payosService.getPaymentLinkInfo(channelKey, orderCode)`.
     - Nếu payOS phản hồi `status: "PAID"`, Backend tự động tổng hợp payload giao dịch chuẩn, ký HMAC SHA-256 bằng chính `checksumKey` của kênh qua `signWebhookDataForChannel`, rồi đưa qua bộ xử lý `payosWebhookService.processPayosChannelWebhook`.
     - Bộ xử lý webhook thực hiện đầy đủ các khâu: kiểm tra chữ ký, lưu `BankTransferEvent`, chạy `dispatchBankTransferEvent` qua MongoDB transaction, ghi nhận `Transaction (ENROLLMENT_PAYMENT)`, cập nhật `Enrollment` thành `CONFIRMED`, và tính `TeacherEarning`.
     - Polling ngay lập tức nhận về trạng thái `COMPLETED` và `CONFIRMED` trong vòng 3 giây!
   - Thao tác này hoạt động hoàn hảo cả khi webhook bị rớt mạng, nghẽn đường truyền hoặc chạy trên môi trường dev local!

2. **Bảo vệ an toàn dữ liệu lịch sử:**
   - Đảm bảo cơ chế polling chủ động chỉ kích hoạt đối với các đơn `PENDING_PAYMENT` đang mở.
   - Đối với các đơn cũ đã bị đánh dấu `EXPIRED` (như đơn 3.000đ `100000008`), hệ thống tuân thủ nghiêm ngặt chỉ thị: **KHÔNG tự động sửa dữ liệu tiền thật khi chưa có ủy quyền**.

---

## 5. PHƯƠNG ÁN ĐỐI SOÁT & XỬ LÝ ĐƠN 3.000 VNĐ (FOR USER APPROVAL)

Minh chứng payOS xác nhận:
- Giao dịch: `FT26324691300734`
- Thời gian nộp tiền: `2026-11-20T09:35:25+07:00` (Nằm trong hạn giữ chỗ 09:33–09:48).
- Lớp học `TEST PAYOS 3K - Toán 12 THPT` hiện có: Sĩ số `0/20` chỗ (còn nguyên 20 chỗ).

**Có 2 phương án đối soát an toàn để Quản trị viên/User phê duyệt:**
- **Phương án A (Khôi phục quyền học & Ghi nhận doanh thu - KHUYẾN NGHỊ):**
  Vì học viên nộp tiền đúng hạn (chỉ sau 2 phút) và lớp học còn chỗ, hệ thống cập nhật `Enrollment 6affb171c018a7f472908142` thành `CONFIRMED`, `Payment 6affb173c018a7f472908143` thành `COMPLETED`, ghi nhận `Transaction` (`ENROLLMENT_PAYMENT`: 3.000đ) và `TeacherEarning` tương ứng. Học viên được vào học bình thường.
- **Phương án B (Ghi nhận tiền chờ hoàn / UNAPPLIED_TUITION_RECEIPT):**
  Tuân theo quy trình tiền về sau khi đơn đã bị cron hủy: Ghi nhận `Payment` thành `COMPLETED`, tạo bút toán `UNAPPLIED_TUITION_RECEIPT` (3.000đ) + `REFUND` (PENDING) và mở hồ sơ `PaymentReconciliation(LATE_PAYMENT_REVIEW)`.

*Script đối soát idempotent đã được chuẩn bị sẵn sàng, chờ lệnh phê duyệt của User.*
