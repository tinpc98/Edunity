# EDUNITY V3 — ADMIN NOTIFICATIONS AUDIT
## Document 02: Admin Notifications UI & Experience Design

### 1. Bố cục tổng thể & Ngôn ngữ thiết kế (Mint/Teal Design System)
Trang Thông báo Quản trị viên (`AdminNotificationsPage.tsx`) được đặt hoàn chỉnh bên trong `AdminLayout`, thừa hưởng toàn bộ cấu trúc:
- **Sidebar bên trái:** Menu điều hướng với mục "Thông báo" được kích hoạt tự động theo URL `/admin/notifications`.
- **Admin Header:** Thanh tìm kiếm nhanh, nút chuông thông báo (Bell Badge), chuyển đổi theme và thông tin tài khoản Admin.
- **Bảng màu:** Đồng bộ tuyệt đối với hệ thống Admin EDUNITY:
  - Màu chủ đạo: Xanh ngọc / Mint / Teal (`#0d9488`, `#14b8a6`, `#0f766e`, `#f0fdfa`).
  - Nền & Thẻ: Sử dụng thẻ chuẩn `AdminSectionCard` và tiêu đề chuẩn `AdminPageHeader`.

---

### 2. Các thành phần chính của giao diện

#### A. Tiêu đề chuẩn Admin (`AdminPageHeader`)
- **Tiêu đề chính:** "Thông báo"
- **Mô tả:** "Cập nhật các hoạt động và yêu cầu cần theo dõi trong hệ thống."
- **Nút hành động nhanh:** "Đánh dấu tất cả đã đọc" (kèm icon `CheckCheck`). Tự động vô hiệu hóa (disabled) khi số lượng thông báo chưa đọc bằng 0.

#### B. Hệ thống Thẻ thống kê (Overview Metric Cards)
Ba thẻ thống kê tổng quan trực quan ở đầu trang:
1. **Tổng thông báo:** Đếm toàn bộ số lượng thông báo của tài khoản Admin hiện tại.
2. **Chưa đọc:** Số lượng thông báo chưa đọc (nổi bật với tông màu cảnh báo cam/hổ phách hoặc ngọc đậm).
3. **Đã đọc:** Số lượng thông báo đã được xử lý/đánh dấu đã đọc (tông màu xanh ngọc/lục).

#### C. Thanh công cụ Lọc & Tìm kiếm
- **Tabs trạng thái (Segmented Tabs):**
  - "Tất cả" (hiển thị toàn bộ).
  - "Chưa đọc" (lọc nhanh các sự kiện cần xử lý).
  - "Đã đọc" (lưu trữ lịch sử thông báo đã xem).
- **Bộ lọc Phân loại (Category Select):**
  - Tất cả phân loại
  - Tài chính & Hoàn tiền (`REFUND_`, `PAYMENT_`, `PAYOUT_`, `RECONCIL_`)
  - Giáo viên & Vi phạm (`TEACHER_`, `DISCIPLINE_`, `INCIDENT_`, `REPORT_`)
  - Lớp học & Khóa học (`CLASS_`, `COURSE_`)
  - Học bổng (`SCHOLARSHIP_`)
  - Hệ thống (`SYSTEM_`, mặc định khác)

#### D. Danh sách Thông báo (Notification Items)
Mỗi dòng thông báo được cấu trúc rõ ràng:
- **Badge phân loại:** Nhãn phân loại có màu sắc phân biệt trực quan (Teal cho Tài chính, Xanh dương cho Giáo viên, Tím cho Lớp học, Vàng hổ phách cho Học bổng).
- **Chấm chỉ báo chưa đọc:** Chấm tròn màu ngọc (`bg-teal-500`) nổi bật ở cạnh trái.
- **Tiêu đề & Nội dung:** Hiển thị chi tiết nội dung sự kiện phát sinh.
- **Thời gian phát sinh:** Thời gian tương đối (ví dụ: "vừa xong", "5 phút trước", "2 ngày trước") định dạng thân thiện tiếng Việt.
- **Nút Deep-link điều hướng:** Nút bấm dẫn trực tiếp tới phân hệ xử lý nghiệp vụ tương ứng (Hoàn tiền, Đối soát, Rút tiền, Xác minh giáo viên, Báo cáo...).
- **Nút thao tác nhanh:** Đánh dấu đã đọc cho từng thông báo cá nhân.

#### E. Phân trang & Trạng thái Rỗng / Lỗi
- **Phân trang:** Sử dụng chuẩn Ant Design Pagination với 10 mục/trang, hiển thị tổng số bản ghi và hỗ trợ nhảy trang mượt mà.
- **Trạng thái rỗng (Empty State):** Minh họa thân thiện khi không có thông báo nào trong bộ lọc đã chọn.
- **Trạng thái lỗi (Error State):** Báo lỗi kèm nút "Thử lại" kết nối lại backend.
