# 30 — ĐÁNH GIÁ TÍNH SẴN SÀNG CỦA PAYOS WEBHOOK TRÊN MÔI TRƯỜNG THẬT
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-REAL-END-TO-END-AUDIT`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** REAL INTEGRATION FIRST / READ-ONLY AUDIT  
**NGÀY LẬP:** 11/11/2026  

---

## I. HIỆN TRẠNG MẠNG CỤC BỘ & VẤN ĐỀ WEBHOOK THẬT

1. **Thực trạng môi trường:**
   - Hệ thống EDUNITY V3 hiện đang vận hành hoàn toàn trên mạng nội bộ `localhost`:
     + Backend API: `http://localhost:5000` (Node.js Express)
     + Frontend: `http://localhost:5173` (Vite React)
     + Cơ sở dữ liệu: `mongodb://127.0.0.1:27017` (MongoDB 8.3.2 Replica Set)
   - Máy chủ payOS hoạt động trên hạ tầng Internet công cộng (`https://api-merchant.payos.vn`).

2. **Rào cản tiếp nhận:**
   - Cổng thanh toán payOS không thể gửi HTTP POST request trực tiếp vào địa chỉ IP `127.0.0.1` hoặc `localhost`.
   - Do đó, nếu không có giải pháp định tuyến Internet có mã hóa TLS (HTTPS), hệ thống không thể nhận được Webhook thật từ payOS.

---

## II. SO SÁNH 2 PHƯƠNG ÁN TIẾP NHẬN WEBHOOK

### Phương án A: HTTPS Tunnel Tạm thời Được Bảo vệ (Protected Temporary HTTPS Tunnel)
- **Công nghệ đề xuất:** Cloudflare Tunnel (`cloudflared`) hoặc Tailscale Funnel.
- **Cơ chế:** Khởi chạy một tiến trình daemon tại máy local để thiết lập kết nối ra ngoài (outbound tunnel) đến mạng Cloudflare/Tailscale, tạo một URL HTTPS công khai tạm thời trỏ thẳng về `http://127.0.0.1:5000`.
- **Ưu điểm:**
  + Chi phí 0 đồng, không cần thuê VPS hoặc cấu hình reverse proxy phức tạp.
  + Kiểm thử trực tiếp mã nguồn và cơ sở dữ liệu trên máy phát triển của lập trình viên.
- **Rủi ro & Nhược điểm:**
  + Tunnel có thể bị gián đoạn khi máy local tắt màn hình, sleep hoặc đổi mạng WiFi.
  + payOS sẽ retry webhook tối đa theo lịch của họ; nếu máy local ngắt kết nối quá lâu, giao dịch có thể bị gắn cờ thất bại trên cổng payOS.
  + Đòi hỏi phải cấu hình Access Control Token hoặc IP Whitelisting để ngăn chặn kẻ xấu quét scan cổng từ bên ngoài Internet.

### Phương án B: Môi trường Staging HTTPS Tối thiểu (Minimal Staging HTTPS Environment - Khuyến nghị)
- **Công nghệ đề xuất:** Thuê 1 VPS Linux (2 Core, 4GB RAM) hoặc sử dụng hạ tầng container nội bộ có Domain Staging và chứng chỉ Let's Encrypt SSL/TLS hợp lệ (ví dụ: `https://staging-api.edunity.vn`).
- **Cơ chế:** Đóng gói Docker Compose chạy Backend, MongoDB Replica Set và NGINX Reverse Proxy hoạt động 24/7.
- **Ưu điểm:**
  + Địa chỉ IP và Domain tĩnh ổn định, cho phép đăng ký Webhook URL chính thức lâu dài với Merchant Portal của payOS.
  + Môi trường cách ly hoàn toàn với máy tính cá nhân, chuẩn hóa quy trình CI/CD và đối soát kế toán.
  + Hỗ trợ đầy đủ việc kiểm thử tải và retry bất đồng bộ của payOS mà không phụ thuộc vào trạng thái mở máy của lập trình viên.
- **Rủi ro & Nhược điểm:**
  + Đòi hỏi chi phí duy trì VPS và công sức vận hành hạ tầng DevOps.

> [!IMPORTANT]
> **Quy tắc an toàn tuyệt đối:**
> Tín TUYỆT ĐỐI KHÔNG tự ý mở tunnel công khai, không tự ý đăng ký Webhook URL trên Merchant Portal của payOS khi chưa có sự phê duyệt bằng văn bản của Team Leader.

---

## III. KIỂM TOÁN CƠ CHẾ AN NINH & BẢO VỆ CỦA BỘ XỬ LÝ WEBHOOK

Kiểm toán mã nguồn tại `BackEnd/src/services/payosWebhookService.js` và `BackEnd/src/services/payosService.js` xác nhận toàn bộ 12 tiêu chí an ninh tài chính đã được hiện thực hóa ở mức production-ready:

1. **Xác thực chữ ký số HMAC-SHA256 (`HMAC Signature`):**
   - Sử dụng phương thức chính thức của SDK: `await client.webhooks.verify(webhookBody)`.
   - Chữ ký được tính toán từ các trường dữ liệu bên trong `data` và so khớp với `PAYOS_CHECKSUM_KEY` của kênh tương ứng.
   - Bất kỳ yêu cầu nào bị sai lệch chữ ký (hoặc bị chỉnh sửa dù chỉ 1 đồng trong trường `amount`) đều bị từ chối ngay lập tức với mã lỗi `401 Unauthorized`.

2. **Kiểm tra tương thích Kênh (`Channel Matching`):**
   - Webhook gửi vào Kênh Học phí (`/tuition`) chỉ được khớp với các Intent thanh toán học phí (`purpose === "TUITION"`).
   - Nếu phát hiện `orderCode` thuộc Kênh Đóng góp Tài trợ gửi nhầm vào URL Kênh Học phí, hệ thống chặn xử lý ghi nhận tự động, gắn cờ `PURPOSE_CHANNEL_MISMATCH` và đẩy sang hàng đợi `PaymentReconciliation`.

3. **Kiểm tra mã đơn hàng (`OrderCode`):**
   - Xác thực `orderCode` là số nguyên dương an toàn (Positive Safe Integer).
   - Truy vấn đối chiếu chính xác đơn hàng `Payment` hoặc `SponsorContribution` tương ứng trong cơ sở dữ liệu.
   - Nếu không tìm thấy đơn hàng trong hệ thống: gắn cờ `UNMATCHED` và đưa vào đối soát, không bao giờ tự ý tạo mới giao dịch.

4. **Kiểm tra số tiền chính xác (`Amount Matching`):**
   - So khớp số tiền nhận được trong Webhook (`parsed.amountNum`) với số tiền kỳ vọng trên đơn hàng (`toNum(matchedIntent.amount)`).
   - Nếu thiếu tiền (`UNDERPAID`) hoặc thừa tiền (`OVERPAID`): chuyển trạng thái `AMOUNT_MISMATCH`, không mở quyền vào lớp học, giữ tiền trong vùng an toàn chờ Admin xử lý.

5. **Kiểm tra số tài khoản thụ hưởng (`Account Number Verification`):**
   - So khớp tài khoản nhận tiền thực tế trong Webhook với số tài khoản được ủy quyền (`PAYOS_EXPECTED_ACCOUNT_NUMBER`).
   - Nếu phát hiện tiền chuyển vào số tài khoản lạ: lập tức cô lập với mã `ACCOUNT_MISMATCH`.

6. **Chống trùng lặp & Bất biến Sổ cái (`Idempotency & Fingerprint`):**
   - Tạo mã băm SHA-256 từ chuỗi `PAYOS:${channelKey}:${reference}:${orderCode}:${paymentLinkId}:${amount}`.
   - Sử dụng Unique Index trên trường `fingerprint` của model `BankTransferEvent`.
   - Kết hợp bảng băm bộ nhớ đệm `inflightWebhookPromises` để khử trùng lặp đối với các request gửi tới cùng một mili-giây.

7. **Bảo tồn sự kiện (`Webhook Persistence`):**
   - Mọi webhook hợp lệ đều được ghi nhận vĩnh viễn vào model `BankTransferEvent` trước khi thực hiện phân bổ dòng tiền.
   - Thông tin số tài khoản ngân hàng của khách hàng được che dấu tự động (`maskAccountNumber`), chỉ lưu 4 số cuối để tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.

8. **Xử lý giao dịch trùng lặp (`Duplicate Delivery & Reference Collision`):**
   - Khi payOS gửi lại webhook nhiều lần cho cùng 1 đơn hàng: hệ thống phản hồi `acknowledged: true, idempotent: true`, tuyệt đối không cộng tiền hay mở lớp 2 lần.
   - Nếu cùng 1 mã tham chiếu ngân hàng (`providerReference`) được tái sử dụng cho một `orderCode` khác: phát hiện và khóa ngay với mã `REFERENCE_COLLISION`.

9. **Xử lý trễ hạn & Tiền về muộn (`Late Payment & Expired Hold`):**
   - Nếu webhook thành công gửi đến sau khi thời gian giữ chỗ 15 phút đã hết (`Enrollment.holdExpiresAt` đã qua hoặc `status === "EXPIRED"`):
     + Hệ thống ghi nhận tiền vào Sổ cái với loại bút toán `UNAPPLIED_TUITION_RECEIPT`.
     + Tạo bản ghi `PaymentReconciliation` với lý do `LATE_PAYMENT_REVIEW`.
     + **Tuyệt đối không tự ý chuyển Enrollment sang CONFIRMED** (để bảo vệ sĩ số lớp học không bị vượt quá sức chứa).

10. **Chống ngụy tạo từ Webhook mẫu của payOS (`PayOS Test Probe Guard`):**
    - Hàm `isPayosWebhookTestProbe` tự động lọc bỏ các payload kiểm tra kết nối từ payOS Merchant Portal (`orderCode: 123`, `reference: "TF230204212323"`).
    - Các payload này được phản hồi xác nhận thành công nhưng hoàn toàn bị bỏ qua, không tạo doanh thu, không tạo giao dịch sổ cái và không kích hoạt quyền học.

