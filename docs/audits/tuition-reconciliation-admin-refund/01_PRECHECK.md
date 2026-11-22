# EDUNITY V3 — AUDIT 01: PRECHECK & INCIDENT CONTEXT

## 1. Thông Tin Sự Cố Thực Tế (P0 Incident)
- **Học viên**: Phạm Công Tín (`quangtin98hg@gmail.com` / `6affad45c018a7f4729080cf`)
- **Tài khoản thụ hưởng**: MBBank `4008999999` (Edunity Tuition Account, VietQR Pro alias `VQRQANTHA4218` & `VQRQANTHX1072`)
- **Lớp học mục tiêu**: `6affb0d095b40d0635bf0ad6` — "TEST PAYOS 3K - Toán 12 THPT"
- **Giáo viên**: Nguyễn Văn Đức (`6ae9eea27281b039f5b4a871`)
- **Số tiền mỗi giao dịch**: 3.000 VNĐ

## 2. Chi Tiết Hai Giao Dịch Chuyển Khoản Thực Tế
| Thông số | Giao dịch 1 (Lần 1 - 09:35) | Giao dịch 2 (Lần 2 - 10:25) |
| :--- | :--- | :--- |
| **OrderCode** | `100000008` | `100000009` |
| **Payment ID** | `6affb173c018a7f472908143` | `6affbd51cfd3c19ebc0a4d11` |
| **Enrollment ID** | `6affb171c018a7f472908142` | `6affbd50cfd3c19ebc0a4d0c` |
| **payOS PaymentLinkId** | `21d8135b556c41f9af67a3864f6e6732` | `d9e517a71a25453aa76775d02c2a692b` |
| **Mã tham chiếu ngân hàng** | `FT26324691300734` | `FT26324478016017` |
| **Tài khoản nguồn** | MBBank `76828051998` (PHAM CONG TIN) | MBBank `76828051998` (PHAM CONG TIN) |
| **Trạng thái payOS** | `PAID` (3.000đ) | `PAID` (3.000đ) |
| **Trạng thái DB ban đầu** | `Payment`: PENDING, `Enrollment`: EXPIRED | `Payment`: PENDING, `Enrollment`: EXPIRED |
| **Nguyên nhân gốc** | Webhook bị chặn do `ACCOUNT_MISMATCH` khi đối chiếu số tài khoản thụ hưởng vật lý với VietQR Pro alias trước bản vá PR2. |

## 3. Trạng Thái Trước Khi Thực Hiện Đối Soát (Precheck State)
- `Class.enrolledCount`: 0 / 20.
- Cả 2 đơn đăng ký đều ở trạng thái `EXPIRED` do hết hạn giữ chỗ (hold countdown 10 phút) trong khi webhook chưa kích hoạt ghi danh.
- Không có bất kỳ khoản thu nhập giáo viên (`TeacherEarning`) nào được tạo.
- Không có bất kỳ giao dịch sổ cái kế toán (`Transaction`) nào được tạo.

## 4. Quyết Định Đã Được Người Dùng Phê Duyệt
1. **Khôi phục quyền ghi danh hợp lệ**: Sử dụng đơn hàng `100000009` làm căn cứ ghi danh chính thức duy nhất.
2. **Xử lý khoản thanh toán thừa / trùng**: Phân loại đơn hàng `100000008` thành khoản thanh toán thừa, hạch toán `UNAPPLIED_TUITION_RECEIPT` (thu tiền vào tài khoản ngân hàng) và `REFUND` (nghĩa vụ hoàn trả tiền), tạo hồ sơ `RefundCase` chờ Admin duyệt và thực hiện chuyển khoản thủ công có lưu bằng chứng (Proof of Transfer).
3. **Tuyệt đối không tự động chuyển khoản**: Cấm gọi API tự động rút tiền hoặc refund tự động ra cổng thanh toán ngoài.
