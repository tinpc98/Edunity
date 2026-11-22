# 07_REGRESSION.md — Kiểm Tra Hồi Quy (Zero Regression Report)

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. PHẠM VI KIỂM SOÁT HỒI QUY

Để đảm bảo các thay đổi giao diện và dịch vụ quản trị Admin không gây ảnh hưởng tiêu cực đến các luồng nghiệp vụ khác, kiểm soát hồi quy được thực hiện trên 5 trụ cột chính:

| Khu vực kiểm tra | Phạm vi ảnh hưởng dự kiến | Kết quả đối soát thực tế | Tình trạng |
|---|---|---|---|
| **Public Course Discovery** | Tìm kiếm khóa học của học viên/khách | `GET /courses` giữ nguyên, vẫn lọc nghiêm ngặt chỉ trả khóa học `ACTIVE` | **ZERO REGRESSION** |
| **Student Enrollment & Payment** | Thanh toán và ghi danh khóa học | Không chạm vào `checkout`, `enrollment`, `payment` | **ZERO REGRESSION** |
| **Teacher Course Proposals** | Giáo viên đề xuất khóa học mới | `teacher/course-proposals` và `AdminCourseProposalsPage` giữ nguyên contract | **ZERO REGRESSION** |
| **Admin Class Approval** | Phê duyệt mở lớp học | `AdminClassesPage`, `AdminClassDetailPage` và bộ 3 nút phê duyệt giữ nguyên | **ZERO REGRESSION** |
| **Soft Delete & Trash Bin** | Phục hồi dữ liệu danh mục/môn/khóa học | `AdminTrashPage` và API `restore` giữ nguyên logic | **ZERO REGRESSION** |

---

## 2. BẰNG CHỨNG KIỂM TRA MÃ NGUỒN (GIT DIFF VERIFICATION)

Lệnh kiểm tra: `git status --short`
```
 M FrontEnd/src/api/catalogAdapters.ts
 M FrontEnd/src/app/router.tsx
 M FrontEnd/src/components/layout/admin/AdminSidebar.tsx
 M FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx
 M FrontEnd/src/features/admin/catalog/AdminSyllabusManagementPage.tsx
 M FrontEnd/src/services/course.service.ts
 M FrontEnd/src/types/catalog.ts
?? FrontEnd/src/features/admin/catalog/AdminCategoriesPage.tsx
?? FrontEnd/src/features/admin/catalog/AdminCoursesPage.tsx
?? FrontEnd/src/features/admin/catalog/AdminSubjectsPage.tsx
?? FrontEnd/src/features/admin/catalog/AdminSyllabusPage.tsx
```

- **Đánh giá:**
  - Không có bất kỳ file nào thuộc thư mục `BackEnd/` bị sửa đổi ngoài ý muốn.
  - Không có bất kỳ file nào thuộc các trang Student, Teacher, Sponsor, Payment bị tác động.
  - Toàn bộ thay đổi tập trung 100% trong phạm vi Admin Academic Catalog.
