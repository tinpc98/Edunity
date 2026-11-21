# EDUNITY V3 — AUDIT 05: ADMIN FINANCIAL NOTIFICATION & ALERT ROUTING

## 1. Cơ Chế Thông Báo Quản Trị Viên (Admin Persistent Notifications)
Hệ thống tích hợp thông báo nội bộ bền vững trong cơ sở dữ liệu MongoDB (`Notification` collection) nhằm cảnh báo ngay cho đội ngũ Quản trị viên Tài chính về các khoản thanh toán thừa cần xử lý hoàn trả.

## 2. Thông Báo Thực Tế Đã Được Khởi Tạo
Được phát tự động tới tất cả các Quản trị viên đang hoạt động (`status: "ACTIVE"`) ngay sau khi đối soát khoản thừa `100000008`:

### 2.1. Quản trị viên 1 (`admin@example.com`)
- **Notification ID**: `6afff0da1167e8fad5ac3361`
- **User ID**: `6ae9eea27281b039f5b4a86f`
- **Tiêu đề**: *Yêu cầu hoàn tiền học phí thừa (Order #100000008)*
- **Nội dung**: *"Phát hiện thanh toán thừa 3.000đ từ học viên quangtin98hg@gmail.com cho lớp TEST PAYOS 3K - Toán 12 THPT. Đã tạo hồ sơ hoàn tiền cần xử lý."*
- **Loại thông báo**: `REFUND_REQUIRED`
- **DedupeKey**: `refund:100000008:admin_notice:admin:6ae9eea27281b039f5b4a86f`
- **Trạng thái**: `DELIVERED`, `isRead: false`

### 2.2. Quản trị viên 2 (`vanhanh@example.com`)
- **Notification ID**: `6afff0da1167e8fad5ac3360`
- **User ID**: `6ae9eea27281b039f5b4a870`
- **Tiêu đề**: *Yêu cầu hoàn tiền học phí thừa (Order #100000008)*
- **Nội dung**: *"Phát hiện thanh toán thừa 3.000đ từ học viên quangtin98hg@gmail.com cho lớp TEST PAYOS 3K - Toán 12 THPT. Đã tạo hồ sơ hoàn tiền cần xử lý."*
- **Loại thông báo**: `REFUND_REQUIRED`
- **DedupeKey**: `refund:100000008:admin_notice:admin:6ae9eea27281b039f5b4a870`
- **Trạng thái**: `DELIVERED`, `isRead: false`

## 3. Điều Hướng 1-Click (Deep Linking & Route Resolution)
Tại `FrontEnd/src/features/notifications/notificationRoute.ts`, logic điều hướng khi click vào thông báo đã được cấu hình toàn diện:
```typescript
case "REFUND_REQUIRED":
case "REFUND_REQUESTED":
case "REFUND_APPROVED":
case "REFUND_REJECTED":
case "REFUND_COMPLETED":
  return role === "ADMIN" ? ROUTES.ADMIN.REFUNDS : ROUTES.STUDENT.PAYMENTS;
```
- Khi Quản trị viên bấm vào thông báo chuông trên thanh Header (`NotificationPopover`), hệ thống lập tức mở trang `/admin/refunds` (`ROUTES.ADMIN.REFUNDS`).
- Quản trị viên nhìn thấy hồ sơ `REF-20261120-F7304D` ở đầu hàng đợi và có thể bấm nút **Chi tiết** hoặc **Duyệt** ngay tức thì.

## 4. Chống Spam & Đảm Bảo Tính Bền Vững (Deduplication)
- Khóa chống trùng lặp (`dedupeKey`) được định dạng duy nhất cho từng cặp sự cố và quản trị viên (`refund:100000008:admin_notice:admin:<adminId>`).
- Khi hệ thống chạy lại worker đối soát hoặc quét định kỳ, thông báo sẽ không bao giờ bị nhân bản nhiều lần gây nhiễu cho Admin.
