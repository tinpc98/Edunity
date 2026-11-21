# EDUNITY V3 — DEPENDENCY CHECKS & RESTORATION SPECIFICATION
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Role:** Senior Backend Architect / Security & Data Integrity Engineer  

---

## 1. MẠNG LƯỚI QUAN HỆ RÀNG BUỘC (DEPENDENCY GRAPH)

```
Category (Danh mục)
   └── Subject (Môn học)
         └── Course (Khóa học)
               ├── SyllabusVersion (Phiên bản giáo trình)
               │     └── CurriculumUnit (Bài học)
               ├── CoursePricingPolicy (Biểu phí)
               └── Class (Lớp học)
                     ├── Session (Buổi học)
                     ├── Enrollment (Ghi danh học viên) [PROTECTED]
                     │     ├── Review (Đánh giá)
                     │     └── SessionAttendance (Điểm danh)
                     └── Financial Records [IMMUTABLE]
                           ├── Payment / payOS
                           ├── Transaction
                           ├── TeacherEarning
                           └── RefundCase
```

---

## 2. QUY TRÌNH KIỂM SOÁT XÓA MỀM (SAFE SOFT DELETE EXECUTION)

Trước khi thực hiện cập nhật `isDeleted = true`, từng domain service bắt buộc chạy qua chuỗi kiểm tra độc lập:

1. **Category:**
   - Đếm số môn học chưa xóa: `Subject.countDocuments({ categoryId, isDeleted: { $ne: true } })`. Nếu > 0 -> Báo lỗi `DEPENDENCY_CONFLICT` (409).
   - Đếm số khóa học chưa xóa: `Course.countDocuments({ categoryId, isDeleted: { $ne: true } })`. Nếu > 0 -> Báo lỗi `DEPENDENCY_CONFLICT` (409).

2. **Subject:**
   - Đếm số khóa học chưa xóa: `Course.countDocuments({ subjectId, isDeleted: { $ne: true } })`. Nếu > 0 -> Báo lỗi `DEPENDENCY_CONFLICT` (409).
   - Đếm số lớp học chưa xóa: `Class.countDocuments({ subjectId, isDeleted: { $ne: true } })`. Nếu > 0 -> Báo lỗi `DEPENDENCY_CONFLICT` (409).

3. **Course:**
   - Kiểm tra Lớp học (`Class.countDocuments({ courseId }) === 0`).
   - Kiểm tra Học viên (`Enrollment.countDocuments({ courseId }) === 0`).
   - Kiểm tra Khiếu nại tài chính (`SessionRefundReview.countDocuments({ courseId }) === 0`).
   - Kiểm tra Học bổng (`ScholarshipCampaign.countDocuments({ courseIds: courseId, isDeleted: { $ne: true } }) === 0`).
   - Kiểm tra Lộ trình học (`LearningPath.countDocuments(...) === 0`).
   - Kiểm tra Biểu phí kích hoạt (`CoursePricingPolicy.countDocuments({ courseId, status: "ACTIVE" }) === 0`).
   - Khi xóa thành công: Tự động xóa mềm cascade các phiên bản giáo trình `SyllabusVersion` và `CurriculumUnit` tương ứng.

4. **Class:**
   - Kiểm tra Học viên đã thanh toán/xác nhận: `Enrollment.countDocuments({ classId, enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT"] } })`. Nếu > 0 -> **TUYỆT ĐỐI CHẶN XÓA** với mã lỗi `DEPENDENCY_CONFLICT` (409).
   - Kiểm tra Lớp đang diễn ra: `status === "IN_PROGRESS"` -> Chặn xóa.
   - Kiểm tra Tranh chấp hoàn tiền: `SessionRefundReview.countDocuments({ classId, status: { $in: ["PENDING", "IN_REVIEW"] } })` -> Chặn xóa.
   - Khi xóa thành công: Chuyển `status = "CANCELLED"`, hủy các `Session` có trạng thái `SCHEDULED`.

---

## 3. QUY TRÌNH KHÔI PHỤC AN TOÀN (SAFE RESTORATION & CONFLICT RESOLUTION)

1. **Khôi phục Category:**
   - Kiểm tra slug: Nếu slug của category đang trùng với một category khác đang hoạt động -> Ném lỗi `RESTORE_CONFLICT` (409).
   - Nếu hợp lệ: Đặt lại `isDeleted = false, deletedAt = null, deletedBy = null, deleteReason = null, status = "INACTIVE"`. Không tự động kích hoạt `ACTIVE` để Admin có cơ hội xem lại nội dung trước khi công khai.

2. **Khôi phục Subject:**
   - Kiểm tra Category cha: `Category.findOne({ _id: subject.categoryId, isDeleted: { $ne: true } })`. Nếu Category cha đã bị xóa hoặc không tồn tại -> Ném lỗi `RESTORE_CONFLICT` (409) kèm thông báo: *"Cannot restore subject: parent category is deleted or inactive. Restore category first."*
   - Kiểm tra slug trùng lặp với subject đang hoạt động.
   - Phục hồi về trạng thái `INACTIVE`.

3. **Khôi phục Course:**
   - Kiểm tra Category cha và Subject cha còn sống không. Nếu một trong hai đã bị xóa -> Ném lỗi `RESTORE_CONFLICT` (409).
   - Kiểm tra slug khóa học có bị trùng không.
   - Phục hồi Course về `INACTIVE`, đồng thời khôi phục lại các `SyllabusVersion` và `CurriculumUnit` đã xóa kèm theo.

4. **Khôi phục Class:**
   - Kiểm tra Course cha và Giáo viên phụ trách còn hoạt động không.
   - Nếu ngày khai giảng `startDate` đã qua trong quá khứ -> Lớp phục hồi về trạng thái `DRAFT` để giáo viên/admin điều chỉnh lại lịch học, không đưa về `OPEN`.
   - Lớp học khôi phục luôn ở trạng thái `DRAFT` để tuân thủ quy trình kiểm duyệt mở lớp.

5. **Tính Idempotent (Khôi phục lặp lại):**
   - Nếu gọi restore trên một bản ghi đã active (`isDeleted: false`), API trả về dữ liệu an toàn mà không chỉnh sửa bất kỳ trường nào khác.
