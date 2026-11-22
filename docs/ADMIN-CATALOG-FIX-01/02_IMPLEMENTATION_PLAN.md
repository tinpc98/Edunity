# 02_IMPLEMENTATION_PLAN.md — Kế Hoạch Sửa Đổi & Thực Thi

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. MỤC TIÊU VÀ PHẠM VI CẢI TỔ

Kế hoạch được chia thành 5 giai đoạn liên hoàn, tập trung vào kiến trúc trang độc lập, kết nối API chuẩn và làm sạch giao diện:

```
[Phase 1: API & Types Ext] ──> [Phase 2: Tách 4 Trang] ──> [Phase 3: Router & Nav] ──> [Phase 4: Dọn Banners] ──> [Phase 5: Kiểm Thử]
```

---

## 2. CHI TIẾT CÁC GIAI ĐOẠN

### Giai đoạn 1: Mở rộng Types và Service Client
- **File tác động:**
  - `FrontEnd/src/types/catalog.ts`
  - `FrontEnd/src/api/catalogAdapters.ts`
  - `FrontEnd/src/services/course.service.ts`
- **Mục tiêu:**
  1. Thêm `status?: CourseStatus | "ALL"`, `curriculumReference?: string`, `sortBy?: string`, `sortOrder?: "asc" | "desc"` vào interface `CourseSearchParams`.
  2. Bổ sung `curriculumReference?: string | null` vào `ApiCourse`, `Course`, `CreateCoursePayload`, `UpdateCoursePayload`.
  3. Cập nhật `adaptCourse` để ánh xạ trường `curriculumReference`.
  4. Bổ sung 2 phương thức admin chuẩn trong `courseService`:
     - `adminListCourses(params)`: Gọi `GET /admin/courses` kèm query string đã xây dựng.
     - `adminGetCourse(id)`: Gọi `GET /admin/courses/:id`.

### Giai đoạn 2: Tách 4 Trang Độc Lập
- **File tạo mới:**
  1. `FrontEnd/src/features/admin/catalog/AdminCategoriesPage.tsx`
     - Chuyên biệt quản lý Danh mục: Bảng dữ liệu, Modal Tạo/Sửa, Modal Chi tiết, Modal Xóa mềm vào Thùng rác.
  2. `FrontEnd/src/features/admin/catalog/AdminSubjectsPage.tsx`
     - Chuyên biệt quản lý Môn học: Bộ lọc theo Danh mục cha, Bảng môn học, Modal Tạo/Sửa, Modal Chi tiết (kèm danh sách khóa học con), Modal Xóa mềm.
  3. `FrontEnd/src/features/admin/catalog/AdminCoursesPage.tsx`
     - Chuyên biệt quản lý Khóa học chuẩn: 6 bộ lọc (Search, Danh mục, Môn, Khối lớp, Trình độ, Trạng thái ACTIVE/INACTIVE), Bảng khóa học, Modal Tạo/Sửa (cho phép đổi trạng thái), Modal Chi tiết (dùng `adminGetCourse`, hỗ trợ bật/tắt nhanh trạng thái), Modal Xóa mềm.
  4. `FrontEnd/src/features/admin/catalog/AdminSyllabusPage.tsx`
     - Chuyên biệt quản lý Giáo trình & Phiên bản: Card Header chuẩn Admin, bọc `AdminSyllabusManagementPage`.

### Giai đoạn 3: Cấu hình Router & Sidebar Navigation
- **File tác động:**
  - `FrontEnd/src/app/router.tsx`
  - `FrontEnd/src/components/layout/admin/AdminSidebar.tsx`
  - `FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx`
- **Mục tiêu:**
  1. Cấu hình 4 route độc lập trong `router.tsx` trỏ trực tiếp đến 4 component mới.
  2. Cấu hình route `/admin/catalog` sử dụng `<Navigate to="/admin/categories" replace />` để tránh redirect loop và đảm bảo backward compatibility.
  3. Cập nhật hàm `isItemActive` trong `AdminSidebar.tsx` thành `location.pathname === path || location.pathname.startsWith(path + "/")` để tránh hiện tượng va chạm tiền tố URL.

### Giai đoạn 4: Loại bỏ Triệt để Banners Kỹ thuật & Tinh Chỉnh Giao Diện
- **File tác động:**
  - `FrontEnd/src/features/admin/catalog/AdminSyllabusManagementPage.tsx`
  - `FrontEnd/src/features/admin/catalog/AdminCoursesPage.tsx`
- **Mục tiêu:**
  1. Xóa bỏ banner kỹ thuật tại trang Syllabus:
     `"Quản lý syllabus có version thật từ Backend. Chỉ bản nháp có thể sửa..."`
  2. Cập nhật dropdown chọn khóa học ở Syllabus gọi `courseService.adminListCourses({ page: 1, pageSize: 100, status: "ALL" })` để nạp cả khóa học ACTIVE và INACTIVE.
  3. Xóa bỏ banner cảnh báo tại danh sách khóa học và modal chi tiết khóa học.
  4. Đảm bảo 100% không còn thanh Tab ngang giữa 4 trang.

### Giai đoạn 5: Kiểm Thử & Kiểm Soát Hồi Quy
- **Thao tác:**
  1. Chạy TypeScript typecheck và Vite production build (`npm --prefix FrontEnd run build`).
  2. Chạy toàn bộ 6 test suite học thuật Backend (`courseLifecycleCur12.test.js`, `syllabusVersion.test.js`, `courseCurriculum.test.js`, `be03AcademicSoftDelete.test.js`, `catalogSearch.test.js`, `academicContract.test.js`).
  3. Rà soát git diff bảo đảm không sửa sang các trang ngoài phạm vi (Student, Teacher, Sponsor, Payment, Enrollment).
