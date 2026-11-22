# 03_FRONTEND_CHANGES.md — Chi Tiết Thay Đổi Frontend

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. DANH SÁCH FILE ĐÃ THAY ĐỔI & TẠO MỚI

| STT | Đường dẫn File | Trạng thái | Mục đích thay đổi |
|---|---|---|---|
| 1 | `FrontEnd/src/types/catalog.ts` | Sửa | Bổ sung `status`, `curriculumReference`, `sortBy`, `sortOrder` vào types và payloads |
| 2 | `FrontEnd/src/api/catalogAdapters.ts` | Sửa | Ánh xạ trường `curriculumReference` trong adapter `adaptCourse` |
| 3 | `FrontEnd/src/services/course.service.ts` | Sửa | Bổ sung `adminListCourses` (`GET /admin/courses`) và `adminGetCourse` (`GET /admin/courses/:id`) |
| 4 | `FrontEnd/src/features/admin/catalog/AdminCategoriesPage.tsx` | **Tạo mới** | Trang độc lập Quản lý Danh mục đào tạo (`/admin/categories`) |
| 5 | `FrontEnd/src/features/admin/catalog/AdminSubjectsPage.tsx` | **Tạo mới** | Trang độc lập Quản lý Môn học (`/admin/subjects`) |
| 6 | `FrontEnd/src/features/admin/catalog/AdminCoursesPage.tsx` | **Tạo mới** | Trang độc lập Quản lý Khóa học chuẩn (`/admin/courses`), hỗ trợ lọc ACTIVE/INACTIVE |
| 7 | `FrontEnd/src/features/admin/catalog/AdminSyllabusPage.tsx` | **Tạo mới** | Trang độc lập Quản lý Giáo trình & Phiên bản (`/admin/syllabus`) |
| 8 | `FrontEnd/src/features/admin/catalog/AdminSyllabusManagementPage.tsx` | Sửa | Xóa banner kỹ thuật, nạp khóa học bằng `adminListCourses` (cả ACTIVE/INACTIVE) |
| 9 | `FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx` | Sửa | Chuyển thành redirect component an toàn sang `/admin/categories` |
| 10 | `FrontEnd/src/components/layout/admin/AdminSidebar.tsx` | Sửa | Cập nhật hàm `isItemActive` chính xác theo từng path riêng |
| 11 | `FrontEnd/src/app/router.tsx` | Sửa | Định tuyến 4 trang riêng biệt và cấu hình redirect cho `/admin/catalog` |

---

## 2. CHI TIẾT TRIỂN KHAI TỪNG TRANG ĐỘC LẬP

### 2.1. Quản lý Danh mục (`AdminCategoriesPage.tsx` — `/admin/categories`)
- **Header:** Tiêu đề "Quản lý Danh mục đào tạo", Icon `FolderOutlined`, Breadcrumb `Admin / Danh mục đào tạo`, nút "Thêm danh mục".
- **Bảng dữ liệu:** Hiển thị Tên danh mục, Slug, Khối lớp áp dụng, Trạng thái (Tag xanh cho ACTIVE, Tag xám cho INACTIVE), Ngày tạo.
- **Thao tác:**
  - Nút Xem chi tiết: Mở Modal hiển thị toàn bộ thuộc tính của danh mục.
  - Nút Sửa: Mở Modal chỉnh sửa Tên, Mô tả, Trạng thái.
  - Nút Xóa: Mở Modal xác nhận chuyển vào Thùng rác kèm ô nhập lý do xóa an toàn.
- **Loading & Error:** Skeleton paragraph và Alert thân thiện khi xảy ra sự cố mạng.

### 2.2. Quản lý Môn học (`AdminSubjectsPage.tsx` — `/admin/subjects`)
- **Header:** Tiêu đề "Quản lý Môn học", Icon `ReadOutlined`, Breadcrumb `Admin / Môn học`, nút "Thêm môn học".
- **Bộ lọc:** Dropdown chọn Danh mục đào tạo cha để lọc danh sách môn học.
- **Bảng dữ liệu:** Hiển thị Tên môn học, Slug, Danh mục cha (Tag ngọc), Trạng thái (ACTIVE/INACTIVE), Ngày tạo.
- **Thao tác:**
  - Nút Xem chi tiết: Hiển thị thông tin môn học và danh sách các khóa học chuẩn đang trực thuộc môn này (gọi `catalogService.getSubject`).
  - Nút Sửa: Mở Modal sửa tên, mô tả, trạng thái.
  - Nút Xóa: Mở Modal xác nhận chuyển môn học vào Thùng rác.

### 2.3. Quản lý Khóa học chuẩn (`AdminCoursesPage.tsx` — `/admin/courses`)
- **Header:** Tiêu đề "Quản lý Khóa học chuẩn", Icon `BookOutlined`, Breadcrumb `Admin / Khóa học chuẩn`, nút "Thêm khóa học".
- **Bộ lọc đa chiều:**
  - Ô tìm kiếm text: Tìm theo tên khóa học, slug, sách tham chiếu.
  - Dropdown Danh mục.
  - Dropdown Môn học (tự động phụ thuộc vào Danh mục đã chọn).
  - Dropdown Khối lớp.
  - Dropdown Trình độ.
  - **Dropdown Trạng thái:** Hỗ trợ chọn `Tất cả trạng thái`, `ACTIVE (Hoạt động)`, `INACTIVE (Tạm ngưng)`.
  - Nút Xóa bộ lọc.
- **Bảng dữ liệu:**
  - Khóa học & Mã giáo trình/sách tham chiếu (`curriculumReference`).
  - Danh mục & Môn học (Tags).
  - Khối lớp & Cấp độ.
  - Badge trạng thái `ACTIVE` / `INACTIVE`.
  - Ngày tạo.
  - Thao tác Chi tiết, Sửa, Xóa.
- **Modal Chi tiết Khóa học:**
  - Kết nối endpoint `adminGetCourse(id)` — lấy dữ liệu chi tiết đầy đủ cho cả khóa học `ACTIVE` và `INACTIVE`.
  - Tích hợp nút chuyển trạng thái nhanh (Bật/Tắt kích hoạt khóa học) với xác nhận an toàn qua Popconfirm.
  - **Đã gỡ bỏ 100% banner kỹ thuật** cảnh báo API chỉ trả khóa học ACTIVE.

### 2.4. Quản lý Giáo trình & Phiên bản (`AdminSyllabusPage.tsx` — `/admin/syllabus`)
- **Header:** Tiêu đề "Quản lý Giáo trình & Phiên bản", Icon `FileTextOutlined`, Breadcrumb `Admin / Giáo trình & Phiên bản`.
- **Nội dung:**
  - Bọc component quản lý giáo trình chuyên sâu `AdminSyllabusManagementPage`.
  - **Đã gỡ bỏ banner kỹ thuật:** `"Quản lý syllabus có version thật từ Backend..."`.
  - Dropdown Khóa học nạp dữ liệu từ `courseService.adminListCourses({ page: 1, pageSize: 100, status: "ALL" })` — hỗ trợ quản trị giáo trình cho cả khóa học ACTIVE và INACTIVE.
  - Đầy đủ tính năng: Tạo bản nháp (Draft), chỉnh sửa bài học (Curriculum Units), công bố phiên bản (Publish), lưu trữ phiên bản cũ (Archive).

---

## 3. LOẠI BỎ THANH TAB NGANG VÀ ĐỒNG BỘ ĐIỀU HƯỚNG

- Trong file `router.tsx`, 4 route:
  - `/admin/categories` ➔ `AdminCategoriesPage`
  - `/admin/subjects` ➔ `AdminSubjectsPage`
  - `/admin/courses` ➔ `AdminCoursesPage`
  - `/admin/syllabus` ➔ `AdminSyllabusPage`
- Route cũ `/admin/catalog` được chuyển hướng bằng `<Navigate to="/admin/categories" replace />`.
- Không còn bất kỳ component `<Tabs>` nào bao bọc giữa 4 màn hình. Mỗi trang là một khối layout hoàn chỉnh, tải độc lập, hỗ trợ direct access và bookmark trình duyệt.
