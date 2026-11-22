# EDUNITY V3 — AUDIT 03: DUPLICATE PAYMENT SURPLUS & REFUND CASE (ORDER 100000008)

## 1. Bản Chất Khoản Thanh Toán Thừa (Duplicate Payment Surplus)
Học viên Phạm Công Tín chuyển khoản 3.000 VNĐ lần đầu tiên vào lúc 09:35 (Order `100000008`, mã giao dịch MBBank: `FT26324691300734`). Tiền đã thực vào tài khoản ngân hàng thụ hưởng MBBank `4008999999` của Edunity và payOS xác nhận `PAID`. Tuy nhiên, do học viên đã được phục hồi quyền ghi danh hợp lệ bằng Order `100000009`, khoản thanh toán `100000008` trở thành khoản thu thừa (Surplus / Overpayment) cần hoàn trả cho học viên.

## 2. Hạch Toán Kế Toán & Minh Bạch Dòng Tiền (TIN-FIN-PR5 Compliance)
Theo chuẩn mực kế toán kiểm soát dòng tiền, tiền thực tế đã vào tài khoản ngân hàng nên không thể đơn thuần coi là giao dịch hủy hoặc bỏ qua. Hệ thống đã hạch toán 2 bút toán độc lập trong cùng một transaction:

1. **Bút toán Ghi nhận Dòng Tiền Vào (Cash-in Receipt)**:
   - **Transaction ID**: `6afff0d91c819e11be06a8f7`
   - **Loại giao dịch**: `UNAPPLIED_TUITION_RECEIPT`
   - **Trạng thái**: `COMPLETED`
   - **Số tiền**: 3.000 VNĐ
   - **Mục đích**: Ghi nhận số dư tiền thực tế đã vào tài khoản ngân hàng của Edunity nhưng chưa được phân bổ vào doanh thu lớp học.

2. **Bút toán Ghi nhận Nghĩa Vụ Phải Trả Hoàn Tiền (Refund Obligation)**:
   - **Transaction ID**: `6afff0d91c819e11be06a8f8`
   - **Loại giao dịch**: `REFUND`
   - **Trạng thái**: `PENDING`
   - **Số tiền**: 3.000 VNĐ
   - **Mục đích**: Treo nghĩa vụ hoàn trả tiền cho học viên trên sổ cái tài chính cho đến khi có ủy nhiệm chi ngân hàng thực tế.

## 3. Hồ Sơ Hoàn Tiền (Refund Case Details)
- **ID**: `6afff0d91c819e11be06a8fb`
- **Mã hồ sơ (Case Number)**: `REF-20261120-F7304D`
- **Mục đích**: `TUITION` (Học phí)
- **Kênh thanh toán**: `TUITION`
- **Nguồn thanh toán gốc**: Payment `6affb173c018a7f472908143` (Order `100000008`)
- **Đơn đăng ký liên kết**: Enrollment `6affb171c018a7f472908142` (giữ nguyên trạng thái `EXPIRED`)
- **Lớp học liên kết**: `6affb0d095b40d0635bf0ad6`
- **Người nhận tiền**: `6affad45c018a7f4729080cf` (Phạm Công Tín - `quangtin98hg@gmail.com`)
- **Tài khoản ngân hàng thụ hưởng**:
  - Ngân hàng: `MBBank`
  - Số tài khoản: `76828051998`
  - Tên chủ tài khoản: `PHAM CONG TIN`
- **Số tiền gốc**: 3.000 VNĐ
- **Số tiền đủ điều kiện hoàn (Eligible Amount)**: 3.000 VNĐ
- **Số tiền đã duyệt (Approved Amount)**: `null` (chờ Admin duyệt)
- **Lý do hoàn tiền**: `OVERPAYMENT` (Thanh toán trùng / thừa)
- **Chi tiết lý do**: *"Thanh toán trùng lặp học phí cho lớp TEST PAYOS 3K - Toán 12 THPT (Mã GD payOS: 100000008, FT26324691300734). Học viên đã được ghi danh hợp lệ qua Order 100000009."*
- **Trạng thái hồ sơ**: `NEEDS_REVIEW`
- **Phương thức hoàn tiền**: `MANUAL_BANK_TRANSFER` (Chuyển khoản thủ công qua ngân hàng, có ủy nhiệm chi đối soát)
- **Obligation Transaction ID**: `6afff0d91c819e11be06a8f8`
- **Audit Logs**:
  - `action`: `REFUND_CASE_CREATED`
  - `actorRole`: `SYSTEM`
  - `note`: *"Auto-generated from duplicate tuition surplus reconciliation per user approved decision"*
  - `timestamp`: `2026-11-20T07:03:50.566Z`

## 4. Các Bất Biến Tài Chính Được Bảo Vệ Tuyệt Đối
- `Enrollment 6affb171c018a7f472908142` vẫn giữ nguyên trạng thái `EXPIRED` -> Không bao giờ xác nhận 2 lần ghi danh.
- `Class.enrolledCount` KHÔNG bị tăng lần thứ 2 -> Sĩ số lớp vẫn chính xác là 1 / 20.
- KHÔNG tạo `TeacherEarning` thứ 2 -> Giáo viên không bao giờ nhận 2 lần doanh thu cho 1 học viên.
- Không có bất kỳ API rút tiền tự động nào được gọi ra ngoài hệ thống.
