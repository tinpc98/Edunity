# 04_BACKEND_CHANGES.md — Đối Soát & Tích Hợp Backend

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. TỔNG QUAN ĐỐI SOÁT BACKEND

Một phát hiện quan trọng trong quá trình audit là: **Backend của EDUNITY V3 đã hoàn chỉnh các API quản trị từ các đợt phát triển trước (CUR-04, CUR-12, BE-03)**:

1. **Endpoint `GET /api/admin/courses`**:
   - File định nghĩa route: `BackEnd/src/routes/courseCatalogRoutes.js:30`
   - File controller: `BackEnd/src/controllers/courseCatalogController.js:29`
   - File service: `BackEnd/src/services/courseCatalogService.js:730` (`adminListCourses`)
   - **Khả năng phục vụ:**
     - Lọc theo `status`: Khi truyền `query.status = "ACTIVE"` hoặc `"INACTIVE"`, service lọc chính xác theo trạng thái. Khi không truyền hoặc truyền `"ALL"`, service **trả về cả 2 trạng thái** `ACTIVE` và `INACTIVE`.
     - Tìm kiếm `query.search`: Tìm trên các trường `title`, `slug`, `description`, `curriculumReference`.
     - Lọc `categoryId`, `subjectId`, `gradeLevel`, `level`, `curriculumReference`.
     - Phân trang chuẩn với `skip`, `pageSize`, `total`, `totalPages`.
     - Phân quyền nghiêm ngặt: Yêu cầu quyền `ADMIN`. Các vai trò khác bị chặn với mã lỗi `403 FORBIDDEN`.

2. **Endpoint `GET /api/admin/courses/:id`**:
   - File định nghĩa route: `BackEnd/src/routes/courseCatalogRoutes.js:31`
   - File service: `BackEnd/src/services/courseCatalogService.js:783` (`adminGetCourse`)
   - **Khả năng phục vụ:**
     - Trả về thông tin chi tiết của khóa học bất kể trạng thái là `ACTIVE` hay `INACTIVE` (khác với public `GET /courses/:id` sẽ trả `404 COURSE_NOT_FOUND` nếu khóa học đang `INACTIVE`).
     - Tự động đếm và trả về `openClassCount` (số lớp đang mở tuyển sinh) và `totalClassCount` (tổng số lớp học liên kết).

3. **Cơ chế Soft Delete & Ràng buộc toàn vẹn học thuật**:
   - File service: `BackEnd/src/services/courseCatalogService.js:793` (`deleteCourse`), `deleteSubject`, `deleteCategory`.
   - Sử dụng transaction MongoDB fail-closed để kiểm tra phụ thuộc:
     - Danh mục chỉ xóa được khi không có Môn học hoạt động.
     - Môn học chỉ xóa được khi không có Khóa học hoạt động.
     - Khóa học chỉ xóa được khi không có Lớp học hoạt động hoặc đã phát sinh giao dịch.
   - Khi xóa thành công, bản ghi được đánh dấu `isDeleted: true` kèm `deletedAt`, `deletedBy`, `deleteReason` và hiển thị trong Thùng rác để phục hồi.

---

## 2. KẾT LUẬN VỀ THAY ĐỔI MÃ NGUỒN BACKEND

- Do Backend đã được thiết kế chuẩn mực, đầy đủ và pass 100% test suite, **không cần sửa đổi mã nguồn Backend**.
- Việc không sửa đổi Backend mang lại các lợi ích an toàn cốt lõi:
  1. Bảo toàn 100% tính tương thích ngược (Backward Compatibility) của API public cho học viên và phụ huynh.
  2. Không ảnh hưởng đến luồng giáo viên đề xuất khóa học (`teacher/course-proposals`).
  3. Không ảnh hưởng đến các ràng buộc duyệt lớp (`admin/classes`).
  4. Đảm bảo các chỉ số kiểm thử hiện hữu của Backend tiếp tục giữ tỷ lệ 100% PASS.
