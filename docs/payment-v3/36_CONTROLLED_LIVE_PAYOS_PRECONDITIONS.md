# 36 — ĐIỀU KIỆN TIÊN QUYẾT CHO THỬ NGHIỆM PAYOS TIỀN THẬT (CONTROLLED LIVE PAYOS PRECONDITIONS)
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-NO-MOCK-LOCAL-CLOSURE`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** REAL INTEGRATION GATES / SECURITY PRE-FLIGHT  
**NGÀY LẬP:** 11/11/2026  

---

## I. NGUYÊN TẮC BẢO VỆ AN TOÀN TRƯỚC KHI KÍCH HOẠT TIỀN THẬT

Chỉ được phép chuyển đổi từ môi trường **REAL LOCAL RUNTIME** sang **CONTROLLED LIVE PILOT** khi và chỉ khi toàn bộ 6 nhóm điều kiện tiên quyết dưới đây được phê chuẩn bằng văn bản bởi Team Leader và Ban Quản Trị Dự Án:

```
[1. Hạ tầng Staging HTTPS công khai]
                 ↓
[2. Thông tin xác thực payOS 2 Kênh riêng biệt]
                 ↓
[3. Phê duyệt Văn bản Chính sách Tài chính]
                 ↓
[4. Hoàn tất các chốt chặn từ Châu & Bảo]
                 ↓
[5. Đăng ký & Xác thực Webhook trên Merchant Portal]
                 ↓
[6. Phê chuẩn Lệnh thử nghiệm Pilot 10.000 VNĐ]
```

---

## II. CHI TIẾT 6 ĐIỀU KIỆN TIÊN QUYẾT BẮT BUỘC

### 1. Hạ tầng Staging HTTPS công khai (Infrastructure Gate)
- **Yêu cầu:** Triển khai Backend EDUNITY V3 lên máy chủ Staging có tên miền riêng và chứng chỉ SSL/TLS hợp lệ (ví dụ: `https://staging-api.edunity.vn`).
- **Lý do:** payOS không thể gửi Webhook vào IP nội bộ hoặc localhost. Mọi giải pháp mở port tạm thời (tunnel) qua máy cá nhân đều bị cấm vì nguy cơ gián đoạn kết nối làm mất gói tin đối soát.
- **Hiện trạng:** **CHƯA ĐẠT (BLOCKING)** — Hiện tại dự án đang chạy 100% trên Local (127.0.0.1:5000 / 127.0.0.1:5173).

### 2. Thông tin xác thực payOS 2 Kênh độc lập (Credentials Gate)
- **Kênh Học phí (TUITION):**
  + `PAYOS_TUITION_CLIENT_ID`
  + `PAYOS_TUITION_API_KEY`
  + `PAYOS_TUITION_CHECKSUM_KEY`
  + `PAYOS_TUITION_EXPECTED_ACCOUNT_NUMBER` (Tài khoản ngân hàng chuyên thu học phí)
- **Kênh Tài trợ (DONATION):**
  + `PAYOS_DONATION_CLIENT_ID`
  + `PAYOS_DONATION_API_KEY`
  + `PAYOS_DONATION_CHECKSUM_KEY`
  + `PAYOS_DONATION_EXPECTED_ACCOUNT_NUMBER` (Tài khoản ngân hàng chuyên nhận quỹ học bổng)
- **Quy tắc:** Tuyệt đối không dùng chung một bộ ClientID/ChecksumKey cho cả 2 kênh nhằm tránh việc tiền học phí bị hạch toán nhầm sang quỹ từ thiện và ngược lại.
- **Hiện trạng:** **CONFIGURED SẴN SÀNG TRONG CODE (CHỜ NẠP VÀO STAGING .ENV)**.

### 3. Phê duyệt Văn bản Chính sách Tài chính (Policy Gate)
- **Chính sách 1 (Tỷ lệ chiết khấu sàn 10% / thù lao giáo viên 90%):** Cần quyết định bằng văn bản từ Ban Giám Đốc trước khi phân bổ thù lao giáo viên thật.
- **Chính sách 2 (Quy chế xử lý tiền về muộn BR-49):** Cần xác định tiền học phí đóng sau khi lớp đã đầy sẽ được hoàn tiền mặt tự động hay lưu thành voucher.
- **Chính sách 3 (Thời hạn giữ thù lao 7 ngày):** Xác nhận thời hạn tính theo 7 ngày lịch (168 giờ) hay 7 ngày làm việc của ngân hàng.
- **Hiện trạng:** **CHƯA CÓ VĂN BẢN (POLICY_BLOCKED)**.

### 4. Bàn giao Chốt chặn từ Châu & Bảo (Cross-Owner Gate)
- **Châu (Học thuật & Hồ sơ):**
  + Phải hoàn tất luồng đóng lớp học chính thức (`Class.status = "COMPLETED"`) thì Tín mới có thể kích hoạt đếm ngược 7 ngày đối soát.
  + Phải duyệt hồ sơ học bổng thật (`AID-01`, `AID-04`) thì Tín mới có thể giải ngân tiền quỹ vào suất học.
- **Bảo (Định danh & Quyền riêng tư):**
  + Phải hoàn tất luồng thẩm định tài khoản ngân hàng chính chủ của giáo viên (`TEA-13`) để Tín ngăn chặn chuyển tiền nhầm.
  + Phải hoàn tất cơ chế che PII trẻ vị thành niên theo Nghị định 13/2023/NĐ-CP trước khi Tín công khai báo cáo nhà tài trợ.
- **Hiện trạng:** **CHỜ OWNER KHÁC (OWNER_BLOCKED)**.

### 5. Đăng ký Webhook trên Merchant Portal payOS (Webhook Verification Gate)
- **Đăng ký URL Kênh 1:** `https://staging-api.edunity.vn/api/payments/webhooks/payos/tuition`
- **Đăng ký URL Kênh 2:** `https://staging-api.edunity.vn/api/payments/webhooks/payos/donation`
- **Kiểm tra URL Probe:** Thực hiện bấm nút "Xác nhận Webhook" trên payOS Portal. Hệ thống Backend đã gia cố hàm `isPayosWebhookTestProbe` để phản hồi HTTP 200 hợp lệ cho payOS mà không làm sai lệch Sổ cái.
- **Hiện trạng:** **SẴN SÀNG VỀ MÃ NGUỒN (CHỜ DOMAIN HTTPS)**.

### 6. Quy trình Pilot Tiền Thật Hạn chế (10.000 VNĐ Controlled Pilot)
- Chỉ thực hiện giao dịch thử nghiệm với số tiền tối thiểu quy định bởi Napas247: **10.000 VNĐ**.
- Người thực hiện chuyển tiền phải là nhân sự được Ban Giám Đốc ủy quyền bằng văn bản.
- Sau khi chuyển tiền, phải lập tức xuất sao kê ngân hàng và báo cáo giao dịch payOS để đối chiếu 3 bên với Sổ cái Transaction của EDUNITY.
- Nếu có bất kỳ khoản chênh lệch nào: Dừng ngay toàn bộ hệ thống để kiểm toán lại.

---

## III. BẢNG ĐÁNH GIÁ QUYẾT ĐỊNH GO / NO-GO TRƯỚC GIAI ĐOẠN PILOT

| Kênh tài chính | Trạng thái kỹ thuật | Trạng thái thủ tục / Hạ tầng | Quyết định hiện tại |
| :--- | :---: | :---: | :---: |
| **Kênh 1: Thu Học phí (Tuition)** | **SẴN SÀNG (100%)** | Thiếu Staging HTTPS & Phê duyệt chiết khấu 10% | **NO-GO CHO TIỀN THẬT** |
| **Kênh 2: Thu Tài trợ (Donation)** | **SẴN SÀNG (100%)** | Thiếu Staging HTTPS & Webhook Kênh 2 | **NO-GO CHO TIỀN THẬT** |
| **Quyết toán Thù lao Giáo viên (Settlement)** | **SẴN SÀNG (100%)** | Bị chặn bởi luồng đóng lớp của Châu | **NO-GO CHO GIẢI NGÂN** |
| **Chi trả Thù lao Thứ Sáu (Payout)** | **SẴN SÀNG (100%)** | Bị chặn bởi thẩm định tài khoản của Bảo | **NO-GO CHO CHI TIỀN** |
| **Hệ thống Hoàn tiền (Refund Engine)** | **SẴN SÀNG (100%)** | Bị chặn bởi quy chế hoàn tiền chính thức | **NO-GO CHO HOÀN TIỀN** |

---

## IV. LỆNH DỪNG THỰC THI (SAFETY STOP)

Theo quy định an toàn của Task `TIN-FIN-NO-MOCK-LOCAL-CLOSURE`:
- Tín DỪNG TOÀN BỘ mọi hành vi can thiệp vào mã nguồn sau khi hoàn tất gia cố.
- Giữ nguyên trạng thái `PAYOS_ENABLED=false` trên Local.
- Không chỉnh sửa file `.env` thật.
- Không thực hiện commit/push/merge Git.
- Bàn giao báo cáo và chờ quyết định phê duyệt hạ tầng Staging từ Team Leader.

