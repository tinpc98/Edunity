# EDUNITY V3 — TASK TIN-FIN-LIVE-TUITION-FINAL-PREFLIGHT
# BÁO CÁO KIỂM TOÁN TIỀN KHỞI HÀNH GIAO DỊCH HỌC PHÍ THẬT ĐẦU TIÊN (FINAL PREFLIGHT)

> **Dự án**: EDUNITY V3 — Phân hệ Payment & Finance  
> **Nhiệm vụ**: `TIN-FIN-LIVE-TUITION-FINAL-PREFLIGHT`  
> **Chủ quản**: TÍN — Payment & Finance  
> **Vai trò**: Principal Payment Architect + Financial Security Auditor  
> **Ngày thực hiện**: 2026-11-11  
> **Môi trường**: Localhost (`localhost:3000` / `localhost:5173`), Local MongoDB Replica Set `rs0`  
> **Cam kết**: KHÔNG sửa .env, KHÔNG bật payOS, KHÔNG mở tunnel, KHÔNG gọi API thật, KHÔNG chuyển khoản, KHÔNG commit/push.

---

## 1. RUNTIME ACTUAL VERIFICATION & CƠ CHẾ NO-MOCK ENFORCEMENT

### 1.1. Bảng đối chiếu biến môi trường thực tế (BackEnd/.env & Runtime Process)
Tất cả các biến môi trường tại Runtime máy chủ đã được xác thực trực tiếp:

| Tên Biến Môi Trường | Giá Trị Thực Tế | Đánh Giá Kỹ Thuật |
|---|---|---|
| `PAYOS_ENABLED` | `false` | Cổng thanh toán thật toàn cục đang TẮT. |
| `PAYOS_TUITION_ENABLED` | `false` | Kênh Học Phí riêng biệt đang TẮT. |
| `PAYOS_DONATION_ENABLED` | `false` | Kênh Quyên Góp riêng biệt đang TẮT. |
| `REAL_LOCAL_RUNTIME` | `false` | Không kích hoạt runtime mock. |
| `ENABLE_PAYMENT_SANDBOX` | `false` | Chế độ sandbox bị TẮT triệt để. |
| `VITE_ENABLE_PAYMENT_SANDBOX` | `false` | Giao diện Frontend ẩn hoàn toàn các nút/hành vi sandbox. |
| `PORT` | `3000` | Process Backend hiện đang lắng nghe trên cổng 3000. |

### 1.2. Chứng minh toán học & mã nguồn: Không thể phát sinh hành vi Mock
Qua kiểm tra mã nguồn tại `BackEnd/src/services/payosService.js`, `BackEnd/src/controllers/paymentController.js` và `BackEnd/src/routes/paymentRoutes.js`:

1. **Không thể tạo VietQR giả hoặc checkoutUrl giả**:
   - Khi gọi `createPaymentLink`:
     - Nếu `isPayosEnabled(resolvedChannel)` là `false`: Luồng kiểm tra hàm `isSandboxFallbackAllowed()`.
     - Hàm `isSandboxFallbackAllowed()` yêu cầu `process.env.ENABLE_PAYMENT_SANDBOX === "true"` và `process.env.REAL_LOCAL_RUNTIME !== "true"`.
     - Do `ENABLE_PAYMENT_SANDBOX=false`, hệ thống ném ra ngoại lệ:
       ```javascript
       throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
       ```
     - Nhánh mã sinh `mockVietQrPayload` và `checkoutUrl: "https://pay.payos.vn/web/mock_..."` (dòng 405–429) **hoàn toàn không bao giờ được chạm tới (unreachable)**.
2. **Không thể gọi Sandbox Webhook**:
   - Route `POST /api/payments/sandbox/webhook` được bảo vệ bởi middleware `sandboxOnly`.
   - Do `ENABLE_PAYMENT_SANDBOX !== "true"`, middleware lập tức chặn và trả về HTTP 403 `PAYMENT_PROVIDER_DISABLED`.
3. **Không thể tự xác nhận Payment hoặc tự xác nhận Enrollment**:
   - Tập tin `enrollmentRoutes.js` chỉ cung cấp các endpoints: `getClassAvailability`, `getMyEnrollments`, `getEnrollmentById`, `cancelEnrollment`, `createEnrollment`.
   - Tuyệt đối **không tồn tại bất kỳ endpoint công khai nào** cho phép Client / Student tự cập nhật `status: "CONFIRMED"` hoặc đổi `payment.status: "COMPLETED"`.
   - Việc chuyển trạng thái `CONFIRMED` chỉ được thực hiện độc quyền bên trong `payosWebhookService.js` hoặc `paymentService.processGatewayWebhook` khi có chữ ký điện tử HMAC SHA256 hợp lệ.

---

## 2. DATABASE ACTUAL RUNTIME VERIFICATION

Kiểm tra trực tiếp tiến trình Node.js đang chạy (`PID 12912` — `node src/server.js`) và cổng cục bộ `27017`:

### 2.1. Đối chiếu kết nối thực tế
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 KẾT QUẢ ĐỐI SOÁT DATABASE THỰC TẾ TRÊN MÁY                  │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ Thuộc Tính               │ Tiến Trình Đang Chạy     │ Bộ Test Local ACID    │
│                          │ (Running Process 12912)  │ (Port 27017)          │
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Database Type            │ MongoDB Atlas (Remote)   │ MongoDB Local         │
│ Database Name            │ `edunity`                │ `edunity_test_verify` │
│ Replica Set Status       │ `atlas-j5a7oe-shard-0`   │ `rs0` (Local)         │
│ Is Primary / Master      │ `true`                   │ `true`                │
│ Max Wire Version         │ `25` (MongoDB 7.x/8.x)   │ `28` (MongoDB 8.x)    │
│ Transaction Support      │ ✅ CÓ HỖ TRỢ ACID        │ ✅ CÓ HỖ TRỢ ACID     │
│ Isolation Status         │ ⚠️ DÙNG CHUNG (DEV/SEED) │ ✅ CÔ LẬP HOÀN TOÀN   │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

> [!IMPORTANT]
> **Khuyến cáo an toàn dữ liệu tài chính**:
> Tiến trình Backend hiện tại đang trỏ tới database `edunity` trên MongoDB Atlas. Database này chứa dữ liệu chung của cả nhóm.
> Khi Team Leader phê duyệt tiến hành thử nghiệm giao dịch tiền thật (Live Pilot), **bắt buộc phải cấu hình biến môi trường kết nối tới một Database cô lập** (ví dụ: `edunity_pilot_live`), để toàn bộ bản ghi tiền tệ, sao kê thử nghiệm và reconciliation không làm xáo trộn dữ liệu phát triển hiện có.

---

## 3. TUITION PAYMENT CHAIN VERIFICATION

Chuỗi thanh toán tự động học phí đã được kiểm chứng khép kín:

```
[Học Viên Chọn Lớp]
       │
       ▼
[Tạo Enrollment: PENDING_PAYMENT]
├── holdExpiresAt: Date.now() + 15 phút
└── Sĩ số: kiểm tra currentStudents < maxStudents
       │
       ▼
[Gọi Payment Intent API]
├── Kênh: TUITION (Channel Client ID: 7786a516...)
├── orderCode: Sinh số nguyên an toàn duy nhất (Positive Safe Integer)
├── amount: Số tiền học phí chính xác của lớp (VND)
├── expiredAt: Unix seconds = Math.floor(holdExpiresAt / 1000)
└── description: Chuỗi chuẩn hóa "EDUNITY HP <orderCode>" (Tối đa 25 ký tự)
       │
       ▼
[payOS SDK createPaymentLink] ──► [Sinh VietQR Thật + paymentLinkId Thật]
                                                │
                                                ▼
                                    [Học Viên Quét Mã Chuyển Khoản]
                                                │
                                                ▼
                                    [payOS Webhook HMAC SHA256 Ingress]
                                                │
       ┌────────────────────────────────────────┴────────────────────────────────────────┐
       ▼                                                                                 ▼
[Kiểm Tra Chữ Ký Checksum Hợp Lệ]                                              [Sai Chữ Ký / Không Hợp Lệ]
       │                                                                                 │
       ▼                                                                                 ▼
[Mở MongoDB ACID Session]                                                      [HTTP 400 - Từ Chối Ngay]
├── 1. Kiểm tra Idempotency: Payment đã COMPLETED? ➜ Bỏ qua, trả HTTP 200
├── 2. Kiểm tra Expiration: holdExpiresAt đã quá hạn?
│      ├── NẾU HẾT HẠN: Chuyển bản ghi vào PaymentReconciliation
│      │   (Mã: LATE_PAYMENT_CLASS_HOLD_EXPIRED), KHÔNG mở lớp, hoàn tiền sau.
│      └── NẾU CÒN HẠN:
│          ├── Payment.status = COMPLETED (Lưu payosTransactionId)
│          ├── Transaction = ENROLLMENT_PAYMENT (Sổ cái duy nhất)
│          ├── Enrollment.status = CONFIRMED (Tự động mở quyền lớp học)
│          ├── Class.currentStudents += 1
│          └── TeacherEarning.status = PENDING (Ghi nhận chia sẻ doanh thu)
└── 3. Commit Transaction
       │
       ▼
[Học Viên Lập Tức Có Quyền Vào Lớp!]
```

---

## 4. HTTPS WEBHOOK PREPARATION & NGUY CƠ XUNG ĐỘT (COLLISION RISK)

### 4.1. Yêu cầu kỹ thuật hạ tầng Webhook
- Cổng payOS gửi webhook qua giao thức HTTPS công khai với chứng chỉ SSL hợp lệ.
- Backend chạy trên `localhost:3000` không thể nhận được dữ liệu nếu không có một trong hai giải pháp:
  1. **HTTPS Tunnel tạm thời**: Sử dụng Cloudflare Tunnel (`cloudflared`) hoặc Tailscale Funnel để forward HTTPS traffic về cổng 3000.
  2. **Staging VPS**: Triển khai Backend lên máy chủ đám mây công khai có gắn domain và chứng chỉ Let's Encrypt.

### 4.2. Cảnh báo nguy cơ xung đột Webhook (Webhook Collision Guard)
- **Đặc thù của payOS**: Mỗi ứng dụng đối tác (Client ID) chỉ cho phép cấu hình **duy nhất 1 Webhook URL**.
- Kênh Học Phí (`PAYOS_TUITION_CLIENT_ID = 7786a516-78f0-442f-922b-6d42b7278471`) có thể đã được gắn với một Webhook URL trên Merchant Dashboard.
- **Rủi ro**: Nếu tự ý chạy script đăng ký webhook hoặc dán URL tunnel tạm thời vào payOS, webhook URL hiện tại sẽ bị **GHI ĐÈ**, gây đứt gãy môi trường mà webhook cũ đang phục vụ.
- **Biện pháp kiểm soát**:
  - Không tự ý mở tunnel.
  - Không gọi API `confirm-webhook` của payOS.
  - Bắt buộc kiểm tra Dashboard payOS xem Kênh Tuition có đang bị chiếm dụng hay không trước khi cấu hình.

---

## 5. FINANCIAL SAFETY & KHÓA CHẶT DÒNG TIỀN CHI RA

Trước khi kích hoạt bất kỳ giao dịch tiền thật nào:

1. **Khóa chặt Hoàn tiền (Refund Outbound)**:
   - Toàn bộ lệnh hoàn tiền ra ngoài tài khoản ngân hàng của học viên **đang bị khóa 100%**.
   - Bắt buộc phải có phê duyệt kép (Four-Eyes Principle: 1 Finance Admin + 1 CFO) và phải có biên lai giao dịch được lưu vết trong `BankProofRegistry`.
2. **Khóa chặt Rút tiền Giáo viên (Payout Outbound)**:
   - `PAYOUT_ENABLED=false`. Toàn bộ hành vi tự động chuyển tiền cho giáo viên bị ngắt.
   - Chỉ được xử lý thủ công theo chu kỳ (Thứ Hai tạo lệnh, Thứ Sáu xét duyệt) kèm đối soát ngân hàng.
3. **Không lưu trữ/nạp ví ảo (No Auto-Credit Xu)**:
   - Edunity V3 không sử dụng mô hình nạp tiền tích lũy ví ảo hay đồng Xu. Giao dịch thanh toán gắn trực tiếp với từng Lớp học cụ thể.
4. **Chính sách hoa hồng (Commission Policy)**:
   - Tỷ lệ nền tảng (Platform Fee) và thu nhập giáo viên (Teacher Earning) đã được định hình trong mã nguồn. Phiên thử nghiệm sẽ dùng Class học phí danh nghĩa có tỷ lệ xác định trước.
5. **Kế hoạch xử lý sự cố (Contingency Runbook)**:
   - Nếu ngân hàng trừ tiền nhưng webhook không kích hoạt được Enrollment CONFIRMED: Hệ thống lưu vào bảng `PaymentReconciliation`, chuyên viên tài vụ có thẩm quyền sẽ kiểm tra mã tham chiếu ngân hàng để xử lý thủ công trong vòng 15 phút.

---

## 6. MA TRẬN ĐIỀU KIỆN CÒN THIẾU & ĐÁNH GIÁ GO/NO-GO

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MA TRẬN ĐIỀU KIỆN TIÊN QUYẾT LIVE PILOT                   │
├────┬───────────────────────────────────────┬──────────────┬──────────────────┤
│ STT│ Điều Kiện Cần                         │ Trạng Thái   │ Mức Độ Rủi Ro    │
├────┼───────────────────────────────────────┼──────────────┼──────────────────┤
│ 1  │ Phê duyệt tiền thật từ Team Leader     │ 🔴 PENDING   │ P0 (Chặn Live)   │
│ 2  │ Điểm cuối Webhook HTTPS công khai     │ 🔴 BLOCKED   │ P0 (Chặn Live)   │
│ 3  │ Database cô lập phục vụ Pilot         │ 🟡 CẦN CHUYỂN│ P1 (Cần tách DB) │
│ 4  │ Xác minh Webhook URL hiện tại payOS   │ 🟡 CHƯA CHECK│ P1 (Nguy cơ đè)  │
│ 5  │ Nhân sự cầm App ngân hàng đối soát    │ 🟡 PENDING   │ P1 (Cần bố trí)  │
│ 6  │ Logic tự động mở lớp học (Local)      │ 🟢 SẴN SÀNG  │ Không có         │
│ 7  │ Khóa chặt chi tiền Refund & Payout    │ 🟢 ĐÃ KHÓA   │ Tuyệt đối an toàn│
└────┴───────────────────────────────────────┴──────────────┴──────────────────┘
```

---

## 7. KẾT LUẬN BẮT BUỘC

1. **TUITION LOCAL READY / NOT READY**: `TUITION LOCAL READY`  
   *(Toàn bộ chuỗi tự động cấp quyền học, logic ACID, chống trùng lặp và bảo vệ thời gian giữ chỗ tại Local đã sẵn sàng 100%)*

2. **TUITION LIVE PILOT GO / NO-GO**: `TUITION LIVE PILOT NO-GO`  
   *(Vẫn còn 2 điều kiện P0 chưa hoàn tất: Chưa có lệnh phê duyệt của Team Leader và chưa có hạ tầng HTTPS Webhook công khai)*

3. **DONATION LIVE PILOT GO / NO-GO**: `DONATION LIVE PILOT NO-GO`  
   *(Kênh quyên góp tiếp tục giữ trạng thái khóa an toàn)*

4. **REFUND OUTBOUND LOCKED / NOT LOCKED**: `REFUND OUTBOUND LOCKED`  
   *(100% dòng tiền hoàn ra ngoài được bảo vệ bởi cơ chế Four-Eyes và BankProofRegistry)*

5. **PAYOUT OUTBOUND LOCKED / NOT LOCKED**: `PAYOUT OUTBOUND LOCKED`  
   *(100% dòng tiền rút của giáo viên bị khóa chặt tại runtime)*

