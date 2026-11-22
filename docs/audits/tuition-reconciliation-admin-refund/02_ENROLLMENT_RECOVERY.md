# EDUNITY V3 — AUDIT 02: ENROLLMENT RECOVERY (ORDER 100000009)

## 1. Mục Tiêu Phục Hồi Quyền Học Tập
Xác lập quyền ghi danh chính thức duy nhất cho học viên Phạm Công Tín (`quangtin98hg@gmail.com`) đối với lớp học `6affb0d095b40d0635bf0ad6` ("TEST PAYOS 3K - Toán 12 THPT") dựa trên giao dịch chuyển khoản thật `100000009` (mã giao dịch MBBank: `FT26324478016017`).

## 2. Các Thực Thể Được Khôi Phục Trong Giao Dịch ACID (MongoDB Session)

### 2.1. Payment Intent
- **ID**: `6affbd51cfd3c19ebc0a4d11`
- **OrderCode**: `100000009`
- **Trạng thái**: `COMPLETED`
- **Provider Status**: `PAID`
- **PaidAt**: `2026-11-20T03:25:54.000Z`
- **Số tiền**: 3.000 VNĐ

### 2.2. Enrollment
- **ID**: `6affbd50cfd3c19ebc0a4d0c`
- **Trạng thái**: `CONFIRMED`
- **Nguồn thanh toán**: `DIRECT_PAYMENT`
- **Số tiền đã thanh toán**: 3.000 VNĐ
- **Hạn giữ chỗ**: `null` (đã xác nhận thành công, giải phóng hold lock)

### 2.3. Lớp Học (Class Sizing & Capacity)
- **ID**: `6affb0d095b40d0635bf0ad6`
- **Tên lớp**: TEST PAYOS 3K - Toán 12 THPT
- **EnrolledCount**: Đã tăng nguyên tử (`$inc: { enrolledCount: 1 }`) từ 0 lên **1** (chính xác 1 học viên).
- **Trạng thái**: `OPEN`

### 2.4. Sổ Cái Kế Toán (Financial Ledger Transaction)
- **ID**: `6afff0d91c819e11be06a8f3`
- **Loại giao dịch**: `ENROLLMENT_PAYMENT`
- **Người gửi (Source)**: `6affad45c018a7f4729080cf` (Học viên Phạm Công Tín)
- **Người nhận (Destination)**: `6ae9eea27281b039f5b4a871` (Giáo viên Nguyễn Văn Đức)
- **Số tiền**: 3.000 VNĐ
- **Trạng thái**: `COMPLETED`
- **Liên kết**: Payment `6affbd51cfd3c19ebc0a4d11`, BankTransferEvent `6affbdc3cfd3c19ebc0a4d18`

### 2.5. Thu Nhập Giáo Viên (Teacher Earning & Commission Hold)
- **ID**: `6afff0d91c819e11be06a8f4`
- **Giáo viên**: `6ae9eea27281b039f5b4a871`
- **Doanh thu gộp (Gross Amount)**: 3.000 VNĐ
- **Hoa hồng nền tảng (10%)**: 300 VNĐ
- **Thu nhập ròng (Net Amount)**: 2.700 VNĐ
- **Trạng thái**: `PENDING`
- **Khóa thanh toán (Settlement Hold)**: `true` (tuân thủ quy tắc 7 ngày sau khi kết thúc buổi học)
- **Blockers**: `["POLICY_BLOCKED"]` (chính sách hoa hồng chưa được phê duyệt chính thức)

### 2.6. Sự Kiện Ngân Hàng & Đối Soát
- **BankTransferEvent ID**: `6affbdc3cfd3c19ebc0a4d18`
  - `eventStatus`: `DISPATCHED`
  - `dispatchStatus`: `DISPATCHED`
  - `linkedTransactionIds`: `["6afff0d91c819e11be06a8f3"]`
  - `linkedTeacherEarningId`: `6afff0d91c819e11be06a8f4`
- **PaymentReconciliation ID**: `6affbdc4cfd3c19ebc0a4d19`
  - `status`: `RESOLVED_APPROVED`
  - `resolvedAt`: `2026-11-20T07:03:50.566Z`
  - `resolutionNote`: "Reconciled via approved legitimate enrollment recovery (orderCode: 100000009)"

## 3. Thông Báo Hệ Thống (System Notifications)
1. **Gửi học viên** (`quangtin98hg@gmail.com`):
   - Tiêu đề: *Thanh toán thành công & Ghi danh lớp học*
   - Nội dung: *"Học phí 3.000đ đã được thanh toán thành công. Bạn đã được ghi danh vào lớp 'TEST PAYOS 3K - Toán 12 THPT'."*
   - Mã loại: `ENROLLMENT_CONFIRMED`
2. **Gửi giáo viên** (`duc.nguyen@example.com`):
   - Tiêu đề: *Có học viên mới đăng ký*
   - Nội dung: *"Công Tin Phạm vừa đăng ký lớp 'TEST PAYOS 3K - Toán 12 THPT'."*
   - Mã loại: `NEW_ENROLLMENT`
