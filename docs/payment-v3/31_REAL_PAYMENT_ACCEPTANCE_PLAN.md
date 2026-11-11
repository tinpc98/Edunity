# 31 — KẾ HOẠCH NGHIỆM THU THANH TOÁN TIỀN THẬT (REAL PAYMENT ACCEPTANCE PLAN)
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-REAL-END-TO-END-AUDIT`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** REAL INTEGRATION ONLY / ZERO TOLERANCE FOR FAKE DATA  
**NGÀY THIẾT KẾ:** 11/11/2026  

---

## I. NGUYÊN TẮC NGHIỆM THU TIỀN THẬT

Chỉ công nhận một nhiệm vụ hoặc luồng nghiệp vụ đạt trạng thái **`REAL_E2E_VERIFIED`** khi và chỉ khi vượt qua đầy đủ chuỗi **12 mắt xích bằng chứng thực tế** dưới đây:

```
[1. Payment Intent API thật]
            ↓
[2. payOS trả Payment Link thật]
            ↓
[3. Frontend hiển thị VietQR thật]
            ↓
[4. Giao dịch Ngân hàng thật bởi Người được ủy quyền]
            ↓
[5. Ngân hàng thương mại ghi nhận giao dịch thật]
            ↓
[6. payOS gửi Webhook thật từ Internet]
            ↓
[7. Backend xác minh chữ ký HMAC Webhook thật]
            ↓
[8. Payment đổi trạng thái hợp lệ trong MongoDB thật]
            ↓
[9. Sổ cái Transaction ghi nhận bút toán chính xác]
            ↓
[10. Enrollment CONFIRMED hoặc Campaign fundedAmount cập nhật thật]
            ↓
[11. Admin Finance Dashboard phản ánh số liệu thật]
            ↓
[12. Đối soát 3 bên khớp 100% giữa Sao kê Ngân hàng - payOS - Sổ cái]
```

> [!CAUTION]
> **Quy định bất di bất dịch:**
> Nếu thiếu bất kỳ một mắt xích nào trong 12 mắt xích trên (ví dụ: thiếu sao kê ngân hàng thật, hoặc thiếu webhook gửi từ payOS thật qua Internet), kết quả kiểm thử BẮT BUỘC phải ghi nhận là **`REAL_IMPLEMENTED_NOT_LIVE_VERIFIED`** hoặc **`NOT_REAL_VERIFIED`**, TUYỆT ĐỐI KHÔNG ĐƯỢC GHI NHẬN `REAL_E2E_PASS`.

---

## II. QUY TRÌNH 4 BƯỚC THỬ NGHIỆM PILOT CÓ KIỂM SOÁT (CONTROLLED PILOT RUNBOOK)

### Bước 1: Chuẩn bị Hạ tầng Staging & Môi trường Cách ly
- **Hạ tầng:** Thiết lập máy chủ Staging HTTPS có domain riêng (ví dụ: `https://staging-api.edunity.vn`).
- **Cơ sở dữ liệu:** Khởi tạo MongoDB Replica Set riêng biệt trên Staging (`edunity_staging_pilot`), hoàn toàn độc lập với database phát triển cục bộ và database production sau này.
- **Tài khoản ngân hàng thử nghiệm:** Sử dụng 2 tài khoản ngân hàng thử nghiệm chuyên dụng của dự án (1 tài khoản nhận Học phí, 1 tài khoản nhận Tài trợ).

### Bước 2: Kích hoạt payOS Kênh Học phí (Tuition Channel Pilot)
1. **Cấu hình:** Nạp các biến môi trường thật được cấp bởi payOS Merchant Portal:
   - `PAYOS_TUITION_CLIENT_ID`
   - `PAYOS_TUITION_API_KEY`
   - `PAYOS_TUITION_CHECKSUM_KEY`
   - `PAYOS_TUITION_EXPECTED_ACCOUNT_NUMBER`
   - `PAYOS_ENABLED=true`
   - `ENABLE_PAYMENT_SANDBOX=false`
2. **Kịch bản thanh toán tối thiểu (Minimal Real Money Test):**
   - Học sinh thử nghiệm đăng ký 1 lớp học có học phí thử nghiệm: **10.000 VNĐ**.
   - Hệ thống tạo Payment Intent thật, hiển thị mã VietQR payOS thật trên `CheckoutPage.tsx`.
   - Tester được ủy quyền dùng ứng dụng Mobile Banking quét mã VietQR và thực hiện chuyển đúng **10.000 VNĐ**.
3. **Thu thập bằng chứng:**
   - Biên lai chuyển tiền thành công từ ứng dụng ngân hàng (Bank Transaction Reference, thời gian, số tiền).
   - Nhật ký (log) nhận Webhook tại máy chủ Staging kèm chữ ký HMAC hợp lệ.
   - Bản ghi `BankTransferEvent` trong MongoDB thật.
   - Bản ghi `Transaction` (`ENROLLMENT_PAYMENT`) trong MongoDB thật.
   - Trạng thái `Enrollment` chuyển sang `CONFIRMED`.
   - Trạng thái `TeacherEarning` chuyển sang `PENDING` (khóa 7 ngày).

### Bước 3: Kích hoạt payOS Kênh Tài trợ (Donation Channel Pilot)
1. **Cấu hình:** Nạp các biến môi trường thật của Kênh Tài trợ:
   - `PAYOS_DONATION_CLIENT_ID`
   - `PAYOS_DONATION_API_KEY`
   - `PAYOS_DONATION_CHECKSUM_KEY`
   - `PAYOS_DONATION_EXPECTED_ACCOUNT_NUMBER`
2. **Kịch bản đóng góp tối thiểu:**
   - Nhà tài trợ thực hiện đóng góp thử nghiệm: **10.000 VNĐ** vào 1 chiến dịch học bổng mở.
   - Quét mã VietQR trên `CampaignDetailPage.tsx` và thực hiện chuyển tiền ngân hàng thật.
3. **Thu thập bằng chứng:**
   - Webhook Kênh Tài trợ gửi về URL `/api/payments/webhooks/payos/donation`.
   - Bản ghi `SponsorContribution` cập nhật `contributionStatus = "CONFIRMED"`.
   - Quỹ chiến dịch `ScholarshipCampaign.fundedAmount` tăng đúng 10.000 VNĐ.
   - Sổ cái quỹ hiển thị đủ 5 chỉ số đối soát chính xác.

### Bước 4: Kiểm tra Đối soát 3 Bên (Tripartite Reconciliation)
- Xuất sao kê giao dịch từ Ngân hàng thương mại trong ngày thử nghiệm.
- Xuất báo cáo lịch sử giao dịch từ Cổng quản trị Merchant của payOS.
- Gọi API `GET /api/admin/transactions` và `GET /api/admin/finance/overview` để đối chiếu:
  $$\text{Tổng tiền nhận Sổ cái} = \text{Tổng tiền payOS xác nhận} = \text{Tổng tiền thực có trong tài khoản Ngân hàng}$$
- Bất kỳ khoản chênh lệch nào dù chỉ 1 đồng cũng phải lập tức đình chỉ thử nghiệm để điều tra nguyên nhân.

---

## III. DANH SÁCH BẰNG CHỨNG BẮT BUỘC PHẢI THU THẬP TRƯỚC KHI KÝ BIÊN BẢN NGHIỆM THU

1. **Ảnh chụp màn hình biên lai chuyển tiền thành công từ Mobile Banking** (hiển thị rõ số tiền, thời gian, mã tham chiếu ngân hàng).
2. **Sao kê tài khoản ngân hàng thụ hưởng** có dòng ghi có tương ứng.
3. **Ảnh chụp chi tiết giao dịch trên Merchant Portal của payOS** (trạng thái `ĐÃ THANH TOÁN`, khớp mã đơn hàng `orderCode`).
4. **JSON snapshot của bản ghi `BankTransferEvent`** trong MongoDB thật (`signatureVerified: true`, `dispatchStatus: "DISPATCHED"`).
5. **JSON snapshot của bản ghi `Transaction`** trong MongoDB thật (`status: "COMPLETED"`).
6. **Ảnh chụp giao diện Admin Finance** (`/admin/finance-overview`) hiển thị dòng tiền tăng lên đúng bằng số tiền giao dịch thật.

