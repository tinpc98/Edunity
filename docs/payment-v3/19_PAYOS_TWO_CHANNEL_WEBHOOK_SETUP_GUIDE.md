# HƯỚNG DẪN CẤU HÌNH & XÁC THỰC WEBHOOK PAYOS HAI KÊNH
# DOCUMENT: 19_PAYOS_TWO_CHANNEL_WEBHOOK_SETUP_GUIDE.md
# NHIỆM VỤ: TIN-FIN-PR11 — STAGING INFRASTRUCTURE & PAYOS DEPLOYMENT PREPARATION

> **Dự án**: EDUNITY V3 — Hệ thống Thanh toán & Quản trị Tài chính  
> **Chủ nhiệm**: Tin — Senior DevOps Architect + Payment Integration Engineer  
> **Kênh hỗ trợ**: Kênh 1 (TUITION - Học phí) & Kênh 2 (DONATION - Quỹ học bổng)  
> **Mục tiêu**: Hướng dẫn chi tiết quy trình đăng ký Webhook URL trên payOS Dashboard, cơ chế bắt tay probe test, xác thực chữ ký số HMAC-SHA256 và bảo vệ chống tạo dữ liệu giả mạo.  

---

## 1. TỔNG QUAN HAI KÊNH THANH TOÁN (TWO-CHANNEL OVERVIEW)

Edunity V3 thiết kế 2 kênh thanh toán payOS độc lập hoàn toàn về mặt pháp lý và tài khoản thụ hưởng ngân hàng:

```
+-----------------------------------+---------------------------------------------------+---------------------------------------------------+
| THUỘC TÍNH                        | KÊNH 1: TUITION (HỌC PHÍ)                         | KÊNH 2: DONATION (QUỸ HỌC BỔNG)                   |
+-----------------------------------+---------------------------------------------------+---------------------------------------------------+
| Mục đích nghiệp vụ                | Thu học phí khóa học từ Học sinh / Phụ huynh      | Tiếp nhận đóng góp Quỹ học bổng từ Nhà tài trợ    |
| Tài khoản thụ hưởng               | Tài khoản Doanh nghiệp Edunity (Thu học phí)      | Tài khoản Ngân hàng mở riêng cho Quỹ học bổng     |
| Trích phí sàn (Platform Fee)      | 10% trích về Edunity, 90% phân bổ vào Earning GV   | 0% (Bảo tồn 100% tiền tài trợ cho học sinh nghèo) |
| Client ID Config Key              | PAYOS_TUITION_CLIENT_ID                           | PAYOS_DONATION_CLIENT_ID                          |
| API Key Config Key                | PAYOS_TUITION_API_KEY                             | PAYOS_DONATION_API_KEY                            |
| Checksum Key Config Key           | PAYOS_TUITION_CHECKSUM_KEY                        | PAYOS_DONATION_CHECKSUM_KEY                       |
| Webhook Mount Path                | POST /api/payments/webhooks/payos/tuition         | POST /api/payments/webhooks/payos/donation        |
| Public Webhook URL                | https://<DOMAIN>/api/payments/webhooks/payos/tuition| https://<DOMAIN>/api/payments/webhooks/payos/donation|
| Cú pháp chuyển khoản (Memo)       | EDUNITY <orderCode>                               | EDUNITY DONATE <orderCode>                        |
| Trạng thái Credentials (Repo)     | [ CONFIGURED ] (Đã nạp trong .env)               | [ CONFIGURED ] (Đã nạp trong .env)                |
+-----------------------------------+---------------------------------------------------+---------------------------------------------------+
```

> **LƯU Ý QUAN TRỌNG**: Trạng thái **`CONFIGURED`** ở đây có nghĩa là biến môi trường đã được điền chuỗi ký tự trong file cấu hình local. Trạng thái này **KHÔNG ĐỒNG NGHĨA** với việc payOS Live đã xác nhận khóa này hợp lệ hoặc tài khoản ngân hàng đã liên kết thành công. Điều này chỉ được xác nhận khi thực hiện bước xác minh Webhook URL thực tế.

---

## 2. KIỂM SOÁT BẮT TAY MẪU KHI ĐĂNG KÝ WEBHOOK (TEST PROBE HANDLING)

Khi Quản trị viên nhập Webhook URL vào trang Quản trị payOS và bấm nút **"Xác nhận" / "Kiểm tra kết nối"**, máy chủ payOS sẽ gửi một HTTP POST request mẫu (probe test payload) đến server Edunity.

### 2.1. Cấu trúc Payload mẫu từ payOS:
Theo tài liệu chính thức từ payOS, gói tin mẫu thường chứa:
```json
{
  "code": "00",
  "desc": "success",
  "data": {
    "orderCode": 123,
    "amount": 3000,
    "description": "VQRIO123",
    "accountNumber": "12345678",
    "reference": "TF230204212323",
    "transactionDateTime": "2023-02-04 18:23:23",
    "currency": "VND",
    "paymentLinkId": "0123456789abcdef",
    "code": "00",
    "desc": "success"
  },
  "signature": "..."
}
```

### 2.2. Cơ chế Bảo vệ của Edunity V3 (`isPayosWebhookTestProbe`):
Trong `BackEnd/src/services/payosWebhookService.js:49-68`, hệ thống đã xây dựng hàm lọc kiểm tra độc quyền:
```javascript
const isPayosWebhookTestProbe = (webhookBody, verifiedData) => {
  const orderCode = Number(verifiedData.orderCode);
  const reference = String(verifiedData.reference || "").trim();
  const desc = String(verifiedData.description || "").trim();

  // 1. Nhận diện gói tin mẫu mặc định của payOS
  if (orderCode === 123 && (reference === "TF230204212323" || desc === "VQRIO123")) {
    return true;
  }
  // 2. Nhận diện cờ test tường minh
  if (webhookBody && webhookBody.isWebhookTest === true) {
    return true;
  }
  // 3. Nhận diện tiền tố test probe
  if (/^WEBHOOK[_-]?TEST/i.test(reference) || /^WEBHOOK[_-]?TEST/i.test(desc)) {
    return true;
  }
  return false;
};
```

### 2.3. Cam kết An toàn Sổ cái Tài chính:
Khi phát hiện gói tin là probe test:
- Hệ thống trả về ngay HTTP `200` với body `{ success: true, message: "Webhook test probe acknowledged" }`.
- **TUYỆT ĐỐI KHÔNG**:
  - Không tạo hoặc cập nhật bản ghi `Payment` giả.
  - Không xác nhận `Enrollment` cho bất kỳ học sinh nào.
  - Không tăng số tiền quỹ `Campaign.currentFund` của bất kỳ chiến dịch nào.
  - Không sinh thu nhập `TeacherEarning` giả cho giảng viên.
  - Không ghi bất kỳ giao dịch nào vào `Transaction` sổ cái.
  - Không đưa sự kiện vào hàng đợi xử lý Outbox (`dispatchStatus: "NOT_REQUIRED"`).

---

## 3. THUẬT TOÁN XÁC THỰC CHỮ KÝ SỐ (HMAC-SHA256 SIGNATURE VERIFICATION)

Mỗi request Webhook từ payOS bắt buộc phải đi kèm trường `signature` ở cấp root của JSON payload.

### 3.1. Quy trình tính toán chữ ký số:
1. Trích xuất đối tượng `data` bên trong webhook body.
2. Sắp xếp các khóa của `data` theo thứ tự bảng chữ cái (Alphabetical order).
3. Nối các cặp `key=value` thành chuỗi truy vấn (Query string format):
   ```
   amount=3000&code=00&description=VQRIO123&orderCode=123...
   ```
4. Băm chuỗi bằng thuật toán **HMAC-SHA256** với khóa bí mật là Checksum Key tương ứng của kênh:
   - Đối với webhook Học phí: Dùng `PAYOS_TUITION_CHECKSUM_KEY`.
   - Đối với webhook Học bổng: Dùng `PAYOS_DONATION_CHECKSUM_KEY`.
5. So sánh chuỗi băm sinh ra với trường `signature` của payOS. Nếu không khớp:
   - Server từ chối xử lý ngay lập tức.
   - Ném ngoại lệ `INVALID_SIGNATURE` (HTTP 400).
   - Không thực thi bất kỳ thay đổi nào trong cơ sở dữ liệu.

### 3.2. Chống Xung đột Chéo Kênh (Cross-Channel Protection):
Nếu một gói tin Webhook của Kênh Học bổng (được ký bằng `PAYOS_DONATION_CHECKSUM_KEY`) bị gửi nhầm sang URL của Kênh Học phí (`/api/payments/webhooks/payos/tuition`), hàm xác thực sẽ sử dụng `PAYOS_TUITION_CHECKSUM_KEY` để kiểm tra. Chữ ký số sẽ **không khớp 100%**, gói tin bị loại bỏ ngay tại lớp gateway bảo vệ.

---

## 4. QUY TRÌNH ĐĂNG KÝ WEBHOOK TỪNG BƯỚC TRÊN PAYOS PORTAL

Sau khi máy chủ Staging đã được cấu hình Nginx và cài đặt SSL Let's Encrypt thành công:

### Bước 1: Đăng ký Webhook Kênh Học Phí (TUITION)
1. Đăng nhập vào trang quản trị payOS bằng tài khoản doanh nghiệp Kênh Học phí: [https://my.payos.vn](https://my.payos.vn).
2. Chọn **Kênh thanh toán** (hoặc Ứng dụng thanh toán) tương ứng với Kênh Học phí.
3. Điều hướng tới mục **Cài đặt Webhook (Webhook Settings)**.
4. Nhập Webhook URL:
   ```
   https://<BACKEND_STAGING_DOMAIN>/api/payments/webhooks/payos/tuition
   ```
   *(Ví dụ: `https://api-staging.edunity.vn/api/payments/webhooks/payos/tuition`)*
5. Bấm nút **"Xác nhận" / "Lưu cài đặt"**.
6. payOS sẽ gửi probe test request tới Edunity. Backend sẽ trả về `200 OK`. payOS hiển thị thông báo: *"Đăng ký Webhook thành công"*.

### Bước 2: Đăng ký Webhook Kênh Học Bổng (DONATION)
1. Đăng xuất và đăng nhập vào trang quản trị payOS bằng tài khoản Kênh Quỹ học bổng.
2. Chọn **Kênh thanh toán** tương ứng với Quỹ học bổng.
3. Điều hướng tới mục **Cài đặt Webhook (Webhook Settings)**.
4. Nhập Webhook URL:
   ```
   https://<BACKEND_STAGING_DOMAIN>/api/payments/webhooks/payos/donation
   ```
   *(Ví dụ: `https://api-staging.edunity.vn/api/payments/webhooks/payos/donation`)*
5. Bấm nút **"Xác nhận" / "Lưu cài đặt"**.
6. Kiểm tra phản hồi `200 OK` từ máy chủ Edunity và lưu cấu hình.

---

## 5. XỬ LÝ SỰ CỐ, GIAO LẠI (RETRY) VÀ ĐỐI SOÁT BẤT THƯỜNG

1. **Cơ chế Giao lại từ payOS (Exponential Retry)**:
   Nếu server Edunity không phản hồi kịp (timeout quá 5 giây) hoặc trả về mã lỗi 5xx, payOS sẽ tự động gửi lại webhook theo chu kỳ: sau 1 phút, 5 phút, 15 phút, 30 phút, 1 giờ, 3 giờ...
2. **Cơ chế Chống ghi nhận trùng (Idempotent Webhook)**:
   - Dựa trên `gatewayReference` (mã tham chiếu giao dịch ngân hàng do payOS cấp) và `orderCode`.
   - Bảng `BankTransferEvent` có unique compound index: `{ gatewayReference: 1, orderCode: 1 }`.
   - Khi nhận webhook lần thứ 2 cho cùng một giao dịch, server phát hiện bản ghi đã tồn tại, trả về ngay lập tức HTTP `200` với cờ `idempotent: true`, không thực thi cộng tiền hay phân bổ lại thù lao.
3. **Phát hiện Giao dịch Bất thường (Reconciliation Trigger)**:
   Nếu số tiền thanh toán thực tế khác số tiền đơn hàng, hoặc mã đơn hàng không khớp với bất kỳ lớp học/chiến dịch nào đang mở:
   - Hệ thống vẫn lưu sự kiện vào `BankTransferEvent`.
   - Đánh dấu trạng thái `dispatchStatus: "RECONCILIATION_REQUIRED"`.
   - Đẩy hồ sơ vào hàng đợi `PaymentReconciliation` trên Admin Finance Dashboard để kế toán tiếp nhận và xử lý thủ công.

