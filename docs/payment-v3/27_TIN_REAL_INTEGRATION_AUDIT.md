# 27 — BÁO CÁO KIỂM TOÁN TÍCH HỢP HỆ THỐNG THẬT (REAL INTEGRATION AUDIT)
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-REAL-END-TO-END-AUDIT`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** REAL INTEGRATION FIRST / NO MOCK ACCEPTANCE / STRICT CODE OWNERSHIP  
**NGÀY KIỂM TOÁN:** 11/11/2026  

---

## I. MỤC TIÊU & CHỈ THỊ NGHIỆM THU TỪ TEAM LEADER

Theo chỉ thị tối cao từ Team Leader:
1. **Tuyệt đối không dùng Mock để nghiệm thu:** Không chấp nhận Mock API, Mock payment success, Fake webhook success, Fake bank transaction, Fake refund completion, Fake payout completion, Fake financial balance, Hardcoded dashboard stats, Fake frontend data, Giả lập backend response, Giả lập thời gian (fake clock) để tuyên bố Live PASS.
2. **Không tự ghi nhận trạng thái:** Tuyệt đối không tự cập nhật thủ công `Payment COMPLETED`, `Enrollment CONFIRMED`, `TeacherEarning PAID_OUT`, `REFUND COMPLETED` nếu chưa có bằng chứng tiền thật và ngân hàng thật.
3. **Phân định rạch ròi bằng chứng:** Các bài kiểm thử đơn vị (Unit tests) dùng mock trước đây chỉ phục vụ kiểm tra tính toàn vẹn của mã nguồn (code integrity) trong môi trường CI/CD cục bộ, **không được tính là bằng chứng REAL E2E**.
4. **Bảo tồn mã nguồn:** Không được xóa hoặc sửa các unit test đã có chỉ để đạt chỉ tiêu "không mock".

---

## II. ĐÁNH GIÁ HIỆN TRẠNG HỆ THỐNG THẬT (LOCAL RUNTIME)

### 1. Cơ sở dữ liệu MongoDB thật (Dedicated Local Instance)
- **Địa chỉ kết nối:** `mongodb://127.0.0.1:27017/edunity_test_verify`
- **Phiên bản MongoDB:** `8.3.2`
- **Chế độ hoạt động:** `Replica Set` (Tên Replica Set: `rs0`, Engine: WiredTiger).
- **Hỗ trợ Multi-Document ACID Transactions:** ĐÃ KIỂM CHỨNG HOẠT ĐỘNG THẬT (Hỗ trợ đầy đủ `session.startTransaction()`, `session.commitTransaction()`, `session.abortTransaction()`).
- **Unique Indexes:** Đã được kiểm chứng ở mức cơ sở dữ liệu thật:
  + `Payment.orderCode` (Unique, Sparse)
  + `Transaction.{ relatedPaymentId: 1, transactionType: 1 }` (Partial Unique)
  + `BankTransferEvent.fingerprint` (Unique, SHA-256)
  + `BankTransferEvent.{ channelKey: 1, providerReference: 1 }` (Unique)
  + `BankProofRegistry.proofHash` (Unique, SHA-256)
  + `BankProofRegistry.referenceCode` (Unique)
  + `ScholarshipUsage.{ enrollmentId: 1 }` (Partial Unique)
- **Tính toán số dư Sổ cái:** Mọi số liệu trên Admin Finance Dashboard (`GET /api/admin/finance/overview`), Ví thù lao giáo viên (`GET /api/teacher/earnings`), Lịch sử giao dịch (`GET /api/admin/transactions`) đều được tính toán bằng các hàm gom cụm tổng hợp (`$group`, `$sum`, `$match`) trực tiếp từ MongoDB thật, không có bất kỳ hằng số hardcode nào.

### 2. Tích hợp cổng thanh toán payOS (`@payos/node` v2.0.5)
- **Mã nguồn SDK:** Sử dụng SDK chính thức của payOS v2.0.5 (`new PayOS(...)`).
- **Hai kênh độc lập (Two-Channel Architecture):**
  + Kênh Học phí (`TUITION`): Cấu hình qua tiền tố `PAYOS_TUITION_*`.
  + Kênh Tài trợ (`DONATION`): Cấu hình qua tiền tố `PAYOS_DONATION_*`.
- **Trạng thái cấu hình hiện tại:**
  + `PAYOS_ENABLED`: Đang đặt `false` (theo quy tắc an toàn nghiêm ngặt).
  + Môi trường chạy hiện tại: `localhost` (127.0.0.1:5000 / 127.0.0.1:5173).
  + Trạng thái kết nối Live: Chưa thực hiện cuộc gọi Live API nào.

### 3. Phân biệt các cấp độ xác thực thực tế
| Cấp độ trạng thái | Định nghĩa kỹ thuật | Trạng thái hiện tại |
| :--- | :--- | :---: |
| **CONFIGURED** | Các biến môi trường và SDK đã được nạp | ĐẠT (Mã nguồn sẵn sàng) |
| **LIVE_API_REACHABLE** | Đã ping và kết nối thành công tới máy chủ payOS | CHƯA TEST LIVE (Read-only gate) |
| **LIVE_PAYMENT_LINK_CREATED** | Tạo thành công Payment Link thật trên payOS | CHƯA KÍCH HOẠT |
| **LIVE_WEBHOOK_VERIFIED** | Webhook thật từ payOS gửi về và xác minh chữ ký HMAC thành công | CHƯA CÓ TUNNEL/STAGING |
| **LIVE_PAYMENT_RECEIVED** | Tài khoản ngân hàng thực tế nhận tiền thật | CHƯA THỰC HIỆN |
| **BANK_RECONCILED** | Đối soát 3 bên khớp 100% giữa Ngân hàng - payOS - Sổ cái | CHƯA THỰC HIỆN |

---

## III. KẾT QUẢ ĐỐI SOÁT NGHIỆP VỤ TÀI CHÍNH

### 1. Thu học phí (Student Tuition Checkout)
- **Cơ chế:** Tạo Payment Intent với thời hạn đếm ngược 15 phút khớp `holdExpiresAt`.
- **Frontend:** `CheckoutPage.tsx` gọi trực tiếp API `POST /api/enrollments/:id/payments`, thực hiện polling mỗi 3 giây qua `GET /api/payments/:id`.
- **An toàn ứng dụng:** Không tự động hoàn tất thanh toán ở client. Khi hết hạn 15 phút, giao diện tự động chuyển trạng thái `EXPIRED` và vô hiệu hóa thanh toán.
- **Hiện trạng:** Đã triển khai hoàn chỉnh bằng code thật; chưa kích hoạt giao dịch tiền thật.

### 2. Thu tiền tài trợ (Sponsor Contribution)
- **Cơ chế:** Tạo Contribution Intent với mã `orderCode` dải `2...`, liên kết chiến dịch học bổng `ScholarshipCampaign`.
- **Frontend:** `CampaignDetailPage.tsx` và `SponsorContributionsPage.tsx` đọc dữ liệu thực từ `GET /api/sponsor/contributions`.
- **An toàn quỹ:** Quỹ chiến dịch (`fundedAmount`) chỉ tăng khi có webhook hợp lệ được dispatch thành công.
- **Hiện trạng:** Đã triển khai hoàn chỉnh bằng code thật; chưa kích hoạt giao dịch tiền thật.

### 3. Quyết toán thù lao giáo viên (Settlement & Withdrawal)
- **Cơ chế:** Khóa 7 ngày đối soát (`SETTLEMENT_HOLD_DAYS = 7`) sau khi lớp học hoàn tất học thuật, không còn học bù, không còn khiếu nại.
- **Rút tiền:** Chỉ mở cổng Thứ Hai từ 08:00 đến trước 17:00 (`Asia/Ho_Chi_Minh`).
- **Chi trả:** Chỉ duyệt đợt Thứ Sáu từ 08:00 đến trước 17:00 kèm nguyên tắc Four-Eyes Dual Verification và BankProofRegistry.
- **Hiện trạng:** Logic và ràng buộc an ninh đã được kiểm chứng; chưa thực hiện giải ngân tiền ngân hàng thật.

### 4. Hoàn tiền & Đối soát (Refund & Reconciliation)
- **Cơ chế:** Bảo vệ sổ cái không tự động hoàn tiền. Mọi sự cố sai lệch tiền/sai nội dung/đến muộn đều vào hàng đợi `PaymentReconciliation`.
- **Quy trình:** Admin lập lệnh hoàn tiền `PENDING_BANK_TRANSFER`, Admin độc lập xác minh chứng từ ngân hàng hợp lệ mới hoàn tất `COMPLETED`.
- **Hiện trạng:** Logic và sổ cái đã sẵn sàng; chưa thực hiện hoàn tiền ngân hàng thật.

---

## IV. BẢNG TỔNG KẾT TỶ LỆ NGHIỆM THU

- **Tổng số nhiệm vụ thuộc phạm vi Tín:** 26 tasks.
- **Số task đã hoàn thiện mã nguồn và sẵn sàng chạy thật (LOCAL_REAL_IMPLEMENTATION):** 26/26 (100.0%).
- **Số task đã xác minh bằng giao dịch tiền thật qua ngân hàng và payOS (REAL_E2E_VERIFIED):** **0/26 (0.0%)**.
- **Lý do:** Hệ thống đang chạy localhost, chưa triển khai HTTPS endpoint đón Webhook từ Internet, chưa kích hoạt `PAYOS_ENABLED=true` và chưa thực hiện nạp/rút tiền thật qua tài khoản ngân hàng.

---

## V. ĐỀ XUẤT HÀNH ĐỘNG TIẾP THEO

1. **Thiết lập hạ tầng Staging HTTPS:** Triển khai VPS có chứng chỉ SSL hợp lệ và domain công khai để làm điểm tiếp nhận Webhook thật.
2. **Kích hoạt Kênh thử nghiệm hạn chế (Controlled Pilot):** Tiến hành nạp thử 10.000 VNĐ qua Kênh Học phí và 10.000 VNĐ qua Kênh Tài trợ trên môi trường Staging có kiểm soát.
3. **Thực hiện quy trình đối soát 3 bên:** Đối chiếu sao kê ngân hàng VietinBank/MBBank với báo cáo Merchant payOS và Sổ cái Transaction của EDUNITY V3.

