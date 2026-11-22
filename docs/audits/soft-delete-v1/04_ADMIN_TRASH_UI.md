# EDUNITY V3 — ADMIN TRASH UI IMPLEMENTATION
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Role:** Senior React/TypeScript Engineer / UI Specialist  

---

## 1. GIAO DIỆN TRANG THÙNG RÁC TOÀN HỆ THỐNG (`/admin/trash`)
- **Tập tin:** `FrontEnd/src/features/admin/trash/AdminTrashPage.tsx`
- **Route:** `ROUTES.ADMIN.TRASH = "/admin/trash"` (Khai báo trong `routePaths.ts`, tích hợp vào `AdminLayout` trong `router.tsx`).
- **Phong cách thiết kế:** Đồng bộ 100% với Design System Mint/Teal Admin (#0D9488, #0F766E, #163B40, #F0FDFA, #D6E5E2).
- **Bộ lọc đa chiều:**
  * Lọc theo Loại dữ liệu: Dropdown chọn `Tất cả`, `📁 Danh mục`, `📖 Môn học`, `📚 Khóa học`, `🎓 Lớp học`, `💬 Đánh giá`.
  * Ô tìm kiếm từ khóa real-time: Tìm kiếm theo tiêu đề bản ghi, mã/slug hoặc thông tin liên kết cha.
  * Nút "Làm mới": Tải lại dữ liệu thùng rác tức thì với hiệu ứng spin.
- **Bảng hiển thị (Table Columns):**
  1. *Loại dữ liệu:* Tag có màu và icon tương ứng (Category: Cyan, Subject: Blue, Course: Purple, Class: Orange, Review: Green).
  2. *Tên bản ghi / Thông tin:* Tiêu đề in đậm, kèm mã slug và thông tin cha (ví dụ: Khóa học cha, Giáo viên phụ trách).
  3. *Thời gian xóa:* Format định dạng ngày giờ Việt Nam `DD/MM/YYYY HH:mm`.
  4. *Người xóa:* Họ tên + Email của Quản trị viên đã thực hiện thao tác.
  5. *Lý do xóa:* Hiển thị lý do do Admin nhập lúc xóa.
  6. *Hành động:*
     - Nút "Chi tiết": Mở modal xem thông tin sâu và kết quả pre-flight kiểm tra tính toàn vẹn khôi phục.
     - Nút "Khôi phục": Mở modal xác nhận khôi phục an toàn.
- **Tuân thủ quy định:** **TUYỆT ĐỐI KHÔNG CÓ NÚT "XÓA VĨNH VIỄN"** theo đúng yêu cầu đề bài.

---

## 2. TÍCH HỢP NÚT XÓA TẠI CÁC TRANG CRUD HIỆN HỮU

### 2.1. Quản lý Danh mục, Môn học, Khóa học (`AdminCatalogPage.tsx`)
- Thêm nút "Xóa" (màu đỏ, icon `<DeleteOutlined />`) tại cột Thao tác của từng bảng Category, Subject, Course.
- Khi click: Mở Modal xác nhận "Chuyển vào Thùng rác (Soft Delete)".
- Modal yêu cầu nhập "Lý do xóa" để lưu vết kiểm toán.
- Nếu có ràng buộc phụ thuộc (ví dụ Danh mục đang có Môn học hoạt động, Môn học đang có Khóa học hoạt động, Khóa học đang có Lớp học), modal hiển thị thông báo lỗi cụ thể từ Backend thay vì để lỗi chung chung.

### 2.2. Quản lý Lớp học (`AdminClassesPage.tsx`)
- Thêm nút "Xóa" tại cột Hành động của danh sách lớp học.
- Khi click: Mở Modal xác nhận xóa mềm.
- Nếu lớp đang có học viên (`enrolledCount > 0`), hiển thị Alert màu vàng cảnh báo kiểm tra trạng thái thanh toán của học viên.
- Nếu học viên đã thanh toán hoặc lớp đang diễn ra, Backend từ chối với lỗi `DEPENDENCY_CONFLICT` và giao diện hiển thị cảnh báo đỏ bảo vệ quyền lợi học sinh.

---

## 3. ĐIỀU HƯỚNG THANH SIDEBAR ADMIN (`AdminSidebar.tsx`)
- Bổ sung mục điều hướng:
  * Key: `ROUTES.ADMIN.TRASH`
  * Label: "Thùng rác"
  * Icon: `<DeleteOutlined className="text-[17px]" />`
  * Vị trí: Đặt trong nhóm "VẬN HÀNH" bên cạnh mục "Khiếu nại" và "Thông báo".
