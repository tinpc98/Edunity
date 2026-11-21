# 05. CHUẨN HÓA VÀ VIỆT HÓA NHẬT KÝ KIỂM TOÁN (VIETNAMESE AUDIT TIMELINE)

## 1. Bảng Đối Chiếu Mã Sự Kiện (Event Mapping)

| Mã Sự Kiện Backend | Nhãn Tiếng Việt Mới | Màu Sắc | Diễn Giải Nghiệp Vụ |
|---|---|---|---|
| `WEBHOOK_RECONCILIATION_OPENED` | Phát hiện giao dịch cần kiểm tra | Cam / Hổ phách | Webhook ngân hàng phát hiện bất thường và tự động mở hồ sơ đối soát |
| `IN_REVIEW` | Bắt đầu kiểm tra giao dịch | Xanh dương | Admin bắt đầu tiếp nhận kiểm tra sự vụ |
| `ASSIGNED` | Đã phân công người xử lý | Xanh dương | Hồ sơ được tiếp nhận bởi admin hoặc phân công cho quản trị viên khác |
| `NOTE_ADDED` | Đã bổ sung ghi chú xử lý | Xanh lục lam | Quản trị viên ghi lại tiến trình điều tra hoặc trao đổi |
| `POST_RESOLVED_NOTE` | Bổ sung ghi chú sau khi giải quyết | Tím | Ghi chú kiểm toán sau khi hồ sơ đối soát đã kết thúc |
| `RECONCILIATION_RESOLVED` | Đã hoàn tất đối soát | Xanh lá | Đã đưa ra kết luận xử lý hợp lệ và đóng sự vụ |
| `REFUND_REQUIRED` | Phát sinh yêu cầu hoàn tiền | Đỏ cam | Phát hiện khoản tiền thừa cần lập hồ sơ hoàn trả |
| `REFUND_RESOLVED` | Đã hoàn tất xử lý hoàn tiền | Tím | Kế toán đã hoàn tất việc chuyển khoản tiền hoàn cho người thụ hưởng |
| `DUPLICATE_SURPLUS_CLASSIFIED` | Phát hiện khoản nộp thừa trùng lặp chuyển hoàn tiền | Đỏ cam | Hệ thống tự động phân loại giao dịch trùng chuyển sang hoàn tiền |
| `REFERENCE_COLLISION_DETECTED` | Phát hiện trùng lặp mã tham chiếu giao dịch | Đỏ | Mã tham chiếu ngân hàng bị gửi lặp lại trên đơn hàng khác |

## 2. Việt Hóa Nội Dung Ghi Chú Tự Động (Auto-Generated Text Localization)
- `"Receiver bank account does not match verified channel account"` ➔
  *"Tài khoản thụ hưởng nhận tiền thực tế không khớp với tài khoản quy định của kênh giao dịch."*
- `"No Payment or SponsorContribution found for orderCode ..."` ➔
  *"Không tìm thấy đơn thanh toán hoặc khoản tài trợ tương ứng với mã đơn."*
- `"Duplicate payment surplus classified for refund. Enrollment already granted via order ..."` ➔
  *"Khoản thanh toán thừa trùng lặp đã được phân loại chuyển sang quy trình hoàn tiền cho học viên."*
- `"Enrollment recovered and confirmed legitimately per approved decision"` ➔
  *"Giao dịch đã được xác minh thành công và kích hoạt ghi danh hợp lệ."*
- `"Assigned to [Name] ([Email]) by [Admin]"` ➔
  *"Đã phân công cho [Name] ([Email]) bởi [Admin]"*

## 3. Bảo Tồn Dữ Liệu Lịch Sử Gốc
- Toàn bộ chuỗi sự kiện kiểm toán trong trường `auditReferences` của cơ sở dữ liệu MongoDB được giữ nguyên vẹn 100%.
- Việc Việt hóa được thực hiện tại tầng trình diễn (Presentation Layer) của Frontend, đảm bảo không bóp méo nhật ký kiểm toán nguyên bản.
- Kỹ sư hệ thống vẫn có thể xem mã sự kiện gốc và ID kỹ thuật thông qua mục `"Thông tin kỹ thuật"` (mặc định thu gọn).
