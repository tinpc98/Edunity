# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 04: Cải tiến Giao diện Quản lý Thùng rác (Admin Trash UI Redesign)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**File điều chỉnh:** `FrontEnd/src/features/admin/trash/AdminTrashPage.tsx`  
**Đường dẫn:** `/admin/trash` (Admin $\rightarrow$ Vận hành $\rightarrow$ Thùng rác)  

---

### 1. Chuẩn hóa Tiêu đề & Loại bỏ Hoàn toàn Banner Kỹ thuật

#### A. Tiêu đề Trang (AdminPageHeader):
- **Tiêu đề cũ:** `Thùng rác hệ thống (Trash Management)`
- **Tiêu đề mới:** **`Thùng rác`** (100% tiếng Việt, dứt khoát, chuyên nghiệp).
- **Mô tả phụ mới:** `Quản lý, khôi phục hoặc xóa vĩnh viễn các dữ liệu đã được chuyển vào Thùng rác.`
- **Eyebrow Tag:** `Vận hành hệ thống` kèm biểu tượng thùng rác.

#### B. Gỡ bỏ Hoàn toàn Banner Nguyên tắc:
- Xóa bỏ thẻ `<Alert message="Nguyên tắc an toàn dữ liệu Soft Delete & Restore" ... />`.
- Toàn bộ nội dung giải thích kỹ thuật dài dòng, container và khoảng trắng dư thừa đã được gỡ bỏ.
- Không thay thế bằng bất kỳ banner kỹ thuật gây rối mắt nào khác, trả lại không gian tối đa cho bảng dữ liệu.

---

### 2. Thiết kế Lại Trạng thái Trống (Empty State) Chuẩn mực

Bảng dữ liệu phân biệt rõ ràng 3 tình huống giao diện, loại bỏ hoàn toàn chữ "No data" tiếng Anh:

1. **Thùng rác hoàn toàn trống (Chưa có dữ liệu xóa mềm):**
   - Icon: `<DeleteOutlined />`
   - Tiêu đề: **`Thùng rác hiện trống`**
   - Mô tả: `Chưa có dữ liệu nào được xóa mềm.`
2. **Không tìm thấy kết quả theo bộ lọc hoặc từ khóa tìm kiếm:**
   - Icon: `<SearchOutlined />`
   - Tiêu đề: **`Không tìm thấy dữ liệu phù hợp`**
   - Mô tả: `Không có bản ghi nào khớp với điều kiện tìm kiếm hoặc bộ lọc.`
3. **Lỗi tải dữ liệu từ máy chủ (Backend Error):**
   - Icon: `<ExclamationCircleOutlined />` màu đỏ
   - Tiêu đề: **`Không thể tải dữ liệu Thùng rác`**
   - Mô tả: `Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại sau.` kèm nút "Thử lại".
   - *Cam kết: Tuyệt đối không hiển thị "Thùng rác hiện trống" khi backend gặp lỗi.*

---

### 3. Cột Thao tác và Nút Hành động trong Bảng

Cột "Thao tác" được thiết kế tối ưu, chống tràn màn hình (responsive) với 3 nút chức năng rõ ràng:
- **`[Chi tiết]`**: Nút viền xám bạc (`border-[#D6E5E2]`), cho phép xem thông tin liên kết và trạng thái điều kiện khôi phục / xóa vĩnh viễn.
- **`[Khôi phục]`**: Nút chính màu xanh ngọc/xanh lá (`#0D9488`), khôi phục dữ liệu về trạng thái an toàn.
- **`[Xóa vĩnh viễn]`**: Nút cảnh báo màu đỏ (`danger`).
  - Nếu bản ghi **không đủ điều kiện** xóa vĩnh viễn (`canPermanentDelete === false`): Nút tự động vô hiệu hóa (`disabled`) kèm Tooltip giải thích lý do cụ thể (ví dụ: *"Không thể xóa vĩnh viễn vì vẫn còn môn học liên kết"*).
  - Nếu bản ghi **đủ điều kiện**: Nút được kích hoạt để mở Popup xác nhận.

---

### 4. Popup Xác nhận Xóa Vĩnh viễn (Confirmation Modal)

Khi người dùng nhấn "Xóa vĩnh viễn":
- **Tiêu đề Popup:** **`Xóa vĩnh viễn dữ liệu?`** (kèm biểu tượng cảnh báo màu đỏ).
- **Khối cảnh báo nguy hiểm:**
  > *Cảnh báo: Hành động này không thể hoàn tác! Dữ liệu sau khi xóa vĩnh viễn sẽ bị loại bỏ hoàn toàn khỏi cơ sở dữ liệu và không thể khôi phục từ Thùng rác.*
- **Thông tin tóm tắt bản ghi:**
  - Loại dữ liệu: Thẻ Tag màu sắc chuẩn (Danh mục, Môn học, Khóa học, Lớp học, Đánh giá).
  - Tên bản ghi: Chữ đậm nổi bật.
  - Mã / Slug: Font monospace rõ nét.
  - Ngày xóa mềm & Người đã xóa.
- **Cơ chế xác nhận bằng văn bản (Double-Confirmation Guard):**
  - Quản trị viên **bắt buộc phải nhập chính xác chuỗi ký tự**:
    ```text
    XÓA VĨNH VIỄN
    ```
  - Nút "Xóa vĩnh viễn" trong Modal chỉ được kích hoạt (enable) khi nhập đúng từng ký tự (kể cả dấu tiếng Việt viết hoa).
  - Cung cấp thêm trường nhập: *"Lý do xóa vĩnh viễn (ghi nhận kiểm toán)"* để lưu vết phục vụ thanh tra.
- **Sau khi xóa thành công:** Tự động đóng Popup, tải lại bảng dữ liệu, cập nhật số lượng bản ghi thực tế và hiển thị thông báo thành công xanh ngọc.
