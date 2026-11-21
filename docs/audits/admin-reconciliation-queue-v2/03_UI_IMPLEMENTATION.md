# 03. THIẾT KẾ VÀ TRIỂN KHAI GIAO DIỆN MỚI (UI IMPLEMENTATION)

## 1. Tinh gọn Trang và Bỏ Banner
- Tiêu đề trang: **Hàng đợi đối soát**
- Mô tả trang: *"Kiểm tra và xử lý các giao dịch thanh toán cần xác minh."*
- Xóa bỏ 100% banner nguyên tắc kỹ thuật `"Nguyên tắc xử lý Đối soát & An toàn quỹ (BR-34, PR8 Reserved)"`.

## 2. Hệ thống 4 Tab Trạng thái
Trang được tổ chức theo 4 Tab rõ ràng:
1. **Cần xử lý** (Mặc định - `NEEDS_REVIEW`): Hiển thị hồ sơ chờ xử lý. Huy hiệu màu hổ phách hiển thị số lượng theo thời gian thực.
2. **Đang xử lý** (`IN_REVIEW`): Hiển thị hồ sơ đã có Admin tiếp nhận và đang tiến hành xử lý. Huy hiệu màu xanh dương.
3. **Đã giải quyết** (`RESOLVED`): Hiển thị hồ sơ đã có kết luận (RESOLVED_APPROVED, RESOLVED_REFUNDED, RESOLVED_IGNORED). Huy hiệu màu xanh lá.
4. **Tất cả** (`ALL`): Tra cứu toàn bộ lịch sử.

## 3. Rút gọn Bảng Danh sách xuống 7 Cột
Loại bỏ các nút `Tiếp nhận` và `Ghi chú` khỏi hàng danh sách; chỉ giữ DUY NHẤT một nút `Chi tiết`.

| STT | Cột | Kiểu hiển thị | Đặc điểm kỹ thuật |
|---|---|---|---|
| 1 | Mã đơn | `#100000009` | Phông đơn cách font-mono, màu xanh teal, có nút sao chép 1-click |
| 2 | Vấn đề phát sinh | Badge tiếng Việt | Nhãn ngắn gọn: "Tài khoản nhận không khớp", "Đơn hết hạn", v.v. |
| 3 | Số tiền | Số tiền VND | Căn phải, in đậm, không ngắt dòng (`whitespace-nowrap`) |
| 4 | Trạng thái | Badge ngắn gọn | Màu sắc phân định: Cần kiểm tra (vàng), Đang xử lý (lam), Đã duyệt (lục), Đã lập hồ sơ hoàn tiền (tím) |
| 5 | Người phụ trách | Tên Admin / Trống | Hiển thị tên Admin (kèm tooltip xem email đầy đủ). Nếu chưa có: "Chưa có người xử lý" dạng nghiêng |
| 6 | Thời gian | DD/MM/YYYY HH:mm | Hiển thị 1 dòng, không bị ép vỡ |
| 7 | Thao tác | Nút "Chi tiết" | Mở Modal chi tiết theo ngữ cảnh |

## 4. Modal Chi tiết đối soát Tái cấu trúc
Tiêu đề: `Chi tiết đối soát #{orderCode}`
Gồm 7 phân vùng khoa học:
- **Phần A (Tổng quan)**: 3 thẻ KPI nhanh (Mã đơn, Số tiền thực nhận, Trạng thái).
- **Phần B (Vấn đề phát sinh)**: Thẻ cảnh báo giải thích rõ ràng bằng tiếng Việt nguyên nhân lỗi.
- **Phần C (Thông tin giao dịch)**: Bảng thông tin chi tiết về Kênh thanh toán, Số tiền cần nộp, Số tiền thực nhận, Lớp học, Bằng chứng ngân hàng, Người phụ trách.
- **Phần D (Kết quả xử lý)**:
  * Nếu duyệt hợp lệ: Thông báo thành công và xác nhận học viên đã được ghi danh.
  * Nếu hoàn tiền: Thông báo nghĩa vụ nợ kèm liên kết 1-click chuyển đến trang Quản lý hoàn tiền (`/admin/refunds`).
  * Nếu chưa có kết luận: Thông báo chờ xử lý.
- **Phần E (Ghi chú xử lý - Thu gọn)**: Form nhập ghi chú nhanh và danh sách ghi chú kiểm toán nội bộ.
- **Phần F (Lịch sử xử lý)**: Timeline tiếng Việt trực quan, loại bỏ các mã sự kiện thô.
- **Phần G (Thông tin kỹ thuật - Thu gọn)**: Dành riêng cho kỹ sư khi cần xem ID kỹ thuật MongoDB, Event ID.

## 5. Kiểm soát Thao tác Theo Trạng thái (Action Lockdown)
- Với hồ sơ **Đã giải quyết**: Chế độ CHỈ ĐỌC (Read-Only). Ẩn hoàn toàn các nút "Bắt đầu xử lý", "Tiếp nhận", "Phân công". Chân modal chỉ có nút duy nhất: `[Đóng]`.
- Với hồ sơ **Cần xử lý**: Nút chính `[Bắt đầu xử lý]` (1-click nhận việc sang IN_REVIEW), nút phụ `[Chuyển người phụ trách]`, nút `[Đóng]`.
- Với hồ sơ **Đang xử lý**: Nút phụ `[Chuyển người phụ trách]`, nút `[Đóng]`.
