# EDUNITY V3 — SOFT DELETE ARCHITECTURE: IMPLEMENTATION REPORT
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Architect:** Senior Backend Architect / Fullstack Engineer  

---

## 1. PHẠM VI TRIỂN KHAI HOÀN TẤT
Chúng tôi đã triển khai kiến trúc Xóa mềm (Soft Delete), Thùng rác (Trash Management) và Khôi phục (Restore) an toàn, có kiểm soát cho hệ thống EDUNITY V3:

1. **Schema Standardization:**
   - Cập nhật plugin dùng chung `softDeletePlugin` trong `BackEnd/src/models/plugins.js` bổ sung trường `deleteReason: { type: String, default: null }`.
   - Toàn bộ các model đăng ký plugin này tự động đồng bộ 4 trường:
     * `isDeleted: Boolean` (indexed, default false)
     * `deletedAt: Date` (default null)
     * `deletedBy: ObjectId ref User` (default null)
     * `deleteReason: String` (default null)

2. **Domain Services Implementation:**
   - **`courseCatalogService.js`:**
     * `deleteCategory(adminId, categoryId, reason)`: Kiểm tra ràng buộc Subject và Course trước khi xóa.
     * `restoreCategory(adminId, categoryId)`: Kiểm tra xung đột slug, phục hồi trạng thái `INACTIVE`.
     * `deleteSubject(adminId, subjectId, reason)`: Kiểm tra ràng buộc Course và Class trước khi xóa.
     * `restoreSubject(adminId, subjectId)`: Kiểm tra Category cha còn sống không, phục hồi trạng thái `INACTIVE`.
     * `deleteCourse(adminId, courseId, reason)`: Kiểm tra toàn diện Class, Enrollment, PricingPolicy, RefundReview, v.v., xóa mềm kèm SyllabusVersion và CurriculumUnit, lưu `deleteReason`.
     * `restoreCourse(adminId, courseId)`: Kiểm tra Category và Subject cha, kiểm tra slug, khôi phục Course và các version giáo trình liên quan.
   - **`adminClassService.js`:**
     * `deleteClass(adminId, classId, reason)`: Kiểm tra học viên đã thanh toán (`CONFIRMED`, `COMPLETED`, `PENDING_PAYMENT`), kiểm tra lớp đang diễn ra (`IN_PROGRESS`), kiểm tra khiếu nại chưa xử lý. Nếu đạt điều kiện, hủy các Session tương ứng, chuyển `status = "CANCELLED"`.
     * `restoreClass(adminId, classId)`: Kiểm tra Course cha và tài khoản Teacher, phục hồi về `DRAFT` để tuân thủ quy trình kiểm duyệt mở lớp.
   - **`reviewService.js`:**
     * `deleteReview(adminId, reviewId, reason)`: Gỡ đánh giá vi phạm, cập nhật lại điểm trung bình của Lớp và Giảng viên, ghi audit log.
     * `restoreReview(adminId, reviewId)`: Khôi phục đánh giá, tính toán lại rating.
   - **`trashService.js`:**
     * `listTrash(filters, paging)`: Tổng hợp toàn bộ dữ liệu xóa mềm từ 5 domain (`CATEGORY`, `SUBJECT`, `COURSE`, `CLASS`, `REVIEW`), chuẩn hóa DTO, hỗ trợ tìm kiếm từ khóa, lọc theo loại dữ liệu và phân trang.
     * `getTrashDetail(type, id)`: Thực hiện pre-flight validation trả về `canRestore` và `restoreBlockReason`.
     * `restoreTrash(adminId, type, id)`: Điều hướng phục hồi an toàn về đúng domain service tương ứng.

3. **Backend API Endpoints:**
   - `GET /api/admin/trash`: Danh sách thùng rác toàn hệ thống (Admin only).
   - `GET /api/admin/trash/:type/:id`: Chi tiết và kiểm tra tính toàn vẹn trước khôi phục.
   - `POST /api/admin/trash/:type/:id/restore`: Khôi phục bản ghi từ thùng rác.
   - `DELETE /api/admin/categories/:id` & `POST /api/admin/categories/:id/restore`
   - `DELETE /api/admin/subjects/:id` & `POST /api/admin/subjects/:id/restore`
   - `DELETE /api/admin/courses/:id` & `POST /api/admin/courses/:id/restore`
   - `DELETE /api/admin/classes/:id` & `POST /api/admin/classes/:id/restore`
   - `DELETE /api/admin/reviews/:id` & `POST /api/admin/reviews/:id/restore`

4. **Frontend Integration:**
   - Tạo trang Quản lý Thùng rác `AdminTrashPage.tsx` tại route `/admin/trash` theo chuẩn Mint/Teal Admin Design System.
   - Bổ sung nút "Xóa" và Modal xác nhận kèm lý do xóa tại `AdminCatalogPage.tsx` (cho Category, Subject, Course) và `AdminClassesPage.tsx` (cho Class).
   - Tích hợp liên kết Thùng rác vào menu "VẬN HÀNH" trong `AdminSidebar.tsx`.
