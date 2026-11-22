# EDUNITY V3 — ADMIN REVIEWS & COMMENTS MODERATION UI

**Task ID:** `EDUNITY-ADMIN-REVIEW-COMMENT-MODERATION-V1`  
**Workspace:** `D:\Dự Án\Edunity`  
**Route:** `/admin/reviews`  
**Design Theme:** Mint/Teal Modern Professional (`#0D9488` / `#14B8A6`)  

---

## 1. Vị trí & Điều hướng

- Menu Admin Sidebar: Nằm trong nhóm **"VẬN HÀNH"**.
- Tên hiển thị: **"Đánh giá & Bình luận"** (Icon: `<CommentOutlined />`).
- URL: `http://localhost:5173/admin/reviews`.

---

## 2. Các thành phần giao diện chính

### A. Header & Thống kê
- Tiêu đề: **Quản lý Đánh giá & Bình luận**
- Mô tả: *Kiểm duyệt đánh giá của học viên, ẩn bình luận vi phạm và đồng bộ điểm xếp hạng công khai.*

### B. Bộ lọc & Tìm kiếm (Filter Bar)
1. **Trạng thái hiển thị (Segmented):**
   - Tất cả
   - Đang hiển thị (Công khai)
   - Đang bị ẩn (Kiểm duyệt)
   - Có khiếu nại (Có Report liên kết)
2. **Số sao đánh giá (Select):**
   - Tất cả mức sao (1 sao đến 5 sao)
3. **Tìm kiếm từ khóa (Search Input):**
   - Tìm kiếm theo nội dung bình luận (debounced).

### C. Bảng dữ liệu (Data Table)
Bảng gồm 7 cột chuẩn hóa tiếng Việt:
1. **Học viên:** Họ tên, Avatar, Email học viên tạo đánh giá.
2. **Lớp học & Giáo viên:** Tên lớp học (`className`) và Tên giảng viên phụ trách.
3. **Đánh giá & Nội dung:**
   - Số sao (Antd `<Rate disabled />`).
   - Đoạn trích bình luận.
   - Tag cảnh báo khiếu nại (nếu có `reportsCount > 0`).
4. **Trạng thái:**
   - Tag Xanh lá: `Đang hiển thị`
   - Tag Cam / Xám: `Đang bị ẩn`
5. **Thông tin ẩn:** Thời điểm ẩn, người thực hiện, lý do ẩn (nếu đang bị ẩn).
6. **Ngày tạo:** Thời gian học viên gửi đánh giá.
7. **Thao tác:**
   - Nút **[Chi tiết]**: Xem modal chi tiết đầy đủ (kèm lịch sử khiếu nại và nhật ký kiểm duyệt).
   - Nút **[Ẩn]** (nếu đang hiển thị): Mở modal xác nhận ẩn kèm nhập lý do.
   - Nút **[Hiện lại]** (nếu đang bị ẩn): Phục hồi hiển thị và tính lại xếp hạng sao.
   - Nút **[Xóa mềm]**: Đưa đánh giá vào Thùng rác.

### D. Modal chi tiết kiểm duyệt (Detail Modal)
Hiển thị 3 tab/khối thông tin:
1. **Thông tin đánh giá:** Học viên, Giảng viên, Lớp học, Điểm đánh giá (1-5 sao), Nội dung phản hồi đầy đủ.
2. **Lịch sử khiếu nại liên kết:** Hiển thị danh sách các `Report` liên quan đến đánh giá này (loại khiếu nại, người gửi, mô tả, trạng thái xử lý).
3. **Nhật ký kiểm duyệt (Audit Trail):** Lịch sử các thao tác của Admin (`REVIEW_HIDDEN`, `REVIEW_UNHIDDEN`, `REVIEW_SOFT_DELETED`, `REVIEW_RESTORED`) gồm Admin thực hiện, thời gian, và chi tiết thay đổi.
