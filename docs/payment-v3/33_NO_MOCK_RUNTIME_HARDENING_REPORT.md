# 33 — BÁO CÁO CÔ LẬP VÀ LOẠI BỎ GIẢ LẬP THANH TOÁN (NO MOCK RUNTIME HARDENING)
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-NO-MOCK-LOCAL-CLOSURE`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** IMPLEMENTATION + REAL LOCAL INTEGRATION / NO SIMULATED FINANCIAL SUCCESS  
**NGÀY HOÀN TẤT:** 11/11/2026  

---

## I. MỤC TIÊU & NGUYÊN TẮC THỰC THI

Theo chỉ thị nghiêm ngặt từ Team Leader:
1. **Không tạo dữ liệu thanh toán giả mạo:** Tuyệt đối không tạo mã VietQR giả, không trả checkoutUrl giả lập, không cho phép client tự gắn cờ thanh toán thành công trong luồng ứng dụng thực tế.
2. **Không chấp nhận giả lập Webhook:** Endpoint `/api/payments/sandbox/webhook` và các nút bấm giả lập webhook trên giao diện phải bị vô hiệu hóa hoàn toàn trong chế độ chạy thực tế, không thể tác động làm biến động số dư Sổ cái hoặc tự ý xác nhận `Enrollment` trên cơ sở dữ liệu nghiệm thu thật.
3. **Phản hồi trung thực khi Cổng thanh toán chưa kích hoạt:** Khi `PAYOS_ENABLED` chưa bật, Backend phải trả về mã lỗi chuẩn `PAYMENT_PROVIDER_DISABLED` (HTTP 503) và Frontend phải hiển thị thông báo rõ ràng: *"Cổng thanh toán chưa được kích hoạt."*
4. **Không che giấu lỗi bằng việc xóa test:** Bảo toàn 100% các bộ unit tests kiểm thử cú pháp; các test doubles được cô lập tuyệt đối trong Jest test runner và không thể bị kích hoạt qua HTTP request từ bên ngoài vào database thật.

---

## II. DANH SÁCH CÁC TỆP ĐÃ ĐƯỢC CHỈNH SỬA & GIA CỐ (FILES CHANGED)

### 1. `BackEnd/src/services/payosService.js`
- **Hàm `isSandboxFallbackAllowed`:** Được gia cố để trả về `false` trong mọi trường hợp chạy ứng dụng thực tế (`REAL_LOCAL_RUNTIME === "true"` hoặc `NODE_ENV === "production"` hoặc khi `ENABLE_PAYMENT_SANDBOX !== "true"`).
- **Hàm `createPaymentLink`:** Khi `PAYOS_ENABLED` chưa bật và sandbox fallback không được phép, thay vì trả về mã VietQR giả lập tĩnh và checkoutUrl giả lập (`https://pay.payos.vn/web/mock_...`), hệ thống lập tức ném lỗi:
  ```javascript
  throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
  ```

### 2. `BackEnd/src/controllers/paymentController.js`
- **Hàm `isSandboxEnabled`:** Vô hiệu hóa chế độ Sandbox khi `REAL_LOCAL_RUNTIME === "true"`, `NODE_ENV === "production"`, hoặc khi biến `ENABLE_PAYMENT_SANDBOX` không được đặt chính xác là `"true"`.
- **Hàm `createSandboxPayment`:** Khi cổng thanh toán payOS chưa được kích hoạt, phản hồi HTTP 503 kèm mã lỗi `PAYMENT_PROVIDER_DISABLED` và thông điệp *"Cổng thanh toán chưa được kích hoạt."*

### 3. `BackEnd/src/routes/paymentRoutes.js`
- **Middleware `sandboxOnly`:** Được gia cố thành chốt chặn an ninh mạng 3 lớp:
  ```javascript
  const sandboxOnly = (req, res, next) => {
    if (
      process.env.REAL_LOCAL_RUNTIME === "true" ||
      process.env.ENABLE_PAYMENT_SANDBOX !== "true" ||
      !["development", "test"].includes(process.env.NODE_ENV)
    ) {
      return res.status(403).json({
        success: false,
        code: "PAYMENT_PROVIDER_DISABLED",
        message: "Cổng thanh toán chưa được kích hoạt hoặc chế độ sandbox bị vô hiệu hóa.",
      });
    }
    next();
  };
  ```
  Ngăn chặn triệt để mọi hành vi gọi POST vào route `/payments/sandbox/webhook` nhằm ngụy tạo giao dịch thành công trên cơ sở dữ liệu thật.

### 4. `BackEnd/src/services/payosWebhookService.js`
- **Hàm `isPayosWebhookTestProbe`:** Được kiểm tra và gia cố theo đúng chuẩn bảo mật ngân hàng:
  + Bắt buộc phải vượt qua bước xác minh chữ ký mã hóa HMAC-SHA256 (`verifyWebhookPayload`) trước khi xét duyệt payload probe.
  + Kiểm tra chặt chẽ đối chiếu với Hợp đồng kiểm tra URL của payOS (`orderCode === 123`, `reference === "TF230204212323"`, `amount === 3000`, `accountNumber === "12345678"`).
  + Tuyệt đối không cho phép bypass chữ ký số chỉ dựa vào chuỗi `orderCode = 123` đơn thuần.
  + Payload probe hợp lệ được phản hồi xác nhận HTTP 200 cho payOS Merchant Portal nhưng hoàn toàn bị bỏ qua (`WEBHOOK_TEST_IGNORED`), không ghi nhận Sổ cái, không tăng doanh thu, không tạo `TeacherEarning` và không mở lớp.

### 5. `FrontEnd/src/components/payment/PaymentErrorState.tsx`
- Bổ sung loại lỗi `PAYMENT_PROVIDER_DISABLED` vào hệ thống thông báo trạng thái thanh toán.
- Định nghĩa thông điệp hiển thị tiêu chuẩn:
  + Tiêu đề: *"Cổng thanh toán chưa được kích hoạt"*
  + Nội dung: *"Cổng thanh toán chưa được kích hoạt."*

### 6. `FrontEnd/src/features/enrollment/CheckoutPage.tsx`
- **Gỡ bỏ hiển thị nút Sandbox:** Biến `canShowSandboxControls` yêu cầu `import.meta.env.VITE_ENABLE_PAYMENT_SANDBOX === "true"`. Ở chế độ chạy thực tế, nút bấm giả lập hoàn toàn biến mất khỏi giao diện học sinh.
- **Bắt lỗi khởi tạo thanh toán:** Khi Backend trả về lỗi `PAYMENT_PROVIDER_DISABLED` hoặc HTTP 503, giao diện chuyển sang `PaymentErrorState` hiển thị đúng thông báo: *"Cổng thanh toán chưa được kích hoạt."*

### 7. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`
- **Gỡ bỏ hiển thị nút Sandbox Tài trợ:** Ẩn hoàn toàn khối nút bấm mô phỏng thanh toán tài trợ sandbox khi `VITE_ENABLE_PAYMENT_SANDBOX !== "true"`.
- **Thông báo lỗi trung thực:** Bắt lỗi `PAYMENT_PROVIDER_DISABLED` từ Backend và hiển thị `message.error("Cổng thanh toán chưa được kích hoạt.")`.

---

## III. SO SÁNH HÀNH VI HỆ THỐNG TRƯỚC VÀ SAU KHI GIA CỐ

| Tiêu chí | Trước khi gia cố (Legacy Mock Mode) | Sau khi gia cố (Real Local Runtime) |
| :--- | :--- | :--- |
| **Tạo Payment Intent khi PAYOS_ENABLED=false** | Trả về chuỗi VietQR giả lập tĩnh và link thanh toán giả lập `https://pay.payos.vn/web/mock_...` | Trả về lỗi HTTP 503 `PAYMENT_PROVIDER_DISABLED`: *"Cổng thanh toán chưa được kích hoạt."* |
| **Giao diện Checkout học sinh** | Hiển thị mã QR giả lập kèm nút "Xác nhận giả lập Webhook Sandbox" | Hiển thị thẻ thông báo: *"Cổng thanh toán chưa được kích hoạt."*, không có nút giả lập |
| **Giao diện Chi tiết Chiến dịch tài trợ** | Cho phép nhập số tiền và bấm nút giả lập thanh toán thành công | Hiển thị thông báo lỗi trung thực khi Cổng chưa kích hoạt, ẩn hoàn toàn nút giả lập |
| **Endpoint `/payments/sandbox/webhook`** | Bất kỳ ai gửi request trong môi trường local đều cập nhật `Payment` sang `COMPLETED` | Bị chặn ngay bằng mã lỗi HTTP 403 `PAYMENT_PROVIDER_DISABLED`, bảo vệ tuyệt đối cơ sở dữ liệu thật |
| **Xác thực Webhook URL Probe** | Kiểm tra chuỗi lỏng lẻo có thể bị lợi dụng | Yêu cầu chữ ký HMAC-SHA256 hợp lệ trước khi xét probe; probe được bỏ qua không ghi nhận tài chính |
| **Cơ sở dữ liệu MongoDB** | Tiềm ẩn rủi ro phát sinh số dư và bút toán giả | Bất biến 100%: Chỉ ghi nhận dữ liệu khi có giao dịch và webhook thật |

---

## IV. KẾT LUẬN

Mã nguồn EDUNITY V3 đã loại bỏ hoàn toàn các luồng thanh toán giả mạo trong ứng dụng runtime thực tế. Toàn bộ hệ thống Backend và Frontend đã sẵn sàng kết nối trực tiếp với cổng thanh toán payOS thật ngay khi được Team Leader phê duyệt chuyển sang giai đoạn Live Pilot.

