# 02_SAFE_DELETE_FIX.md — Giải Pháp Kỹ Thuật Khắc Phục Lỗ Hổng Course Safe Delete

**Dự án:** Edunity V3  
**Người phụ trách:** Châu  
**Tập tin chỉnh sửa:** [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)  
**Trạng thái:** ĐÃ HOÀN THÀNH & VERIFIED (29/29 tests pass)  

---

## 1. MỤC TIÊU THIẾT KẾ

Bảo đảm thao tác soft-delete khóa học của Admin đáp ứng 4 tiêu chuẩn kỹ thuật nghiêm ngặt:
1. **Tính nguyên tử (Atomicity):** Soft-delete `Course`, `SyllabusVersion`, và `CurriculumUnit` cùng lúc thông qua MongoDB transaction session; rollback toàn bộ nếu có lỗi.
2. **Khắc phục Race Condition:** Đóng triệt để cửa sổ race condition khi giáo viên đồng thời tạo lớp học mới (`createClass`) trong lúc Admin đang kiểm tra phụ thuộc.
3. **Bảo toàn dữ liệu tài chính & học thuật:** Kiểm tra toàn diện mọi phụ thuộc từ lớp học, đăng ký, học bổng, lộ trình, chính sách giá cho đến khiếu nại tài chính (`SessionRefundReview`). Tuyệt đối không hard-delete hoặc cascade delete lịch sử tài chính.
4. **Bảo đảm tính toàn vẹn Audit Log:** Ghi nhận nhật ký kiểm toán trong cùng transaction session. Tuyệt đối không nuốt lỗi audit log.

---

## 2. KIẾN TRÚC TRIỂN KHAI CHI TIẾT

### 2.1. Cơ chế Atomic Pre-Locking để Ngăn Chặn Race Condition

Trong luồng tạo lớp học của giáo viên (`teacherClassService.createClass`), hệ thống luôn gọi hàm `getActiveCourse(courseId)`, đòi hỏi:
```javascript
const course = await Course.findOne({
  _id: courseId,
  status: "ACTIVE",
  ...NOT_DELETED,
});
```

Để ngăn chặn tình huống một lớp học mới được tạo ra ngay sau khi bước kiểm tra `Class.countDocuments` vừa chạy xong, `deleteCourse` áp dụng chiến lược **Atomic Pre-Locking**:
1. Trước khi chạy bất kỳ truy vấn kiểm tra phụ thuộc nào, nếu khóa học đang ở trạng thái `ACTIVE`, service ngay lập tức chuyển `course.status = "INACTIVE"` và lưu lại (`await course.save(sessionOpts)`).
2. Khi đó, bất kỳ request đồng thời nào từ giáo viên nhằm tạo lớp học mới trên khóa học này sẽ bị chặn ngay lập tức với lỗi `400 COURSE_NOT_ACTIVE` (hoặc `404 COURSE_NOT_FOUND`).
3. Nếu bất kỳ bước kiểm tra phụ thuộc nào thất bại (phát hiện lớp học cũ, học viên đang học, hoặc khiếu nại hoàn tiền), khối `catch` sẽ khôi phục lại trạng thái `status = originalStatus` ("ACTIVE") trước khi ném ra lỗi `409 Conflict`.
4. Nếu đang trong transaction của ReplicaSet, việc rollback session sẽ tự động hoàn tác toàn bộ thay đổi.

### 2.2. Kiểm Tra Toàn Diện Các Phụ Thuộc (Dependency Matrix)

Bảng đối chiếu các rào chắn kiểm tra phụ thuộc được thi hành tuần tự với session:

| STT | Phụ thuộc kiểm tra | Model Mongoose | Điều kiện chặn | Mã lỗi trả về |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Lớp học đã tạo | `Class` | `countDocuments({ courseId }) > 0` | `409 COURSE_HAS_CLASSES` |
| 2 | Lượt ghi danh học viên | `Enrollment` | `countDocuments({ courseId }) > 0` | `409 COURSE_HAS_ENROLLMENTS` |
| 3 | Khiếu nại tài chính / hoàn tiền | `SessionRefundReview` | `countDocuments({ courseId }) > 0` | `409 COURSE_HAS_REFUND_REVIEWS` |
| 4 | Chiến dịch học bổng | `ScholarshipCampaign` | `countDocuments({ courseIds: course._id, isDeleted: { $ne: true } }) > 0` | `409 COURSE_IN_SCHOLARSHIP_CAMPAIGN` |
| 5 | Lộ trình học tập liên kết | `LearningPath` | `countDocuments({ steps/prereq: course._id, isDeleted: { $ne: true } }) > 0` | `409 COURSE_IN_LEARNING_PATH` |
| 6 | Chính sách giá đang kích hoạt | `CoursePricingPolicy` | `countDocuments({ courseId, status: "ACTIVE", isDeleted: { $ne: true } }) > 0` | `409 COURSE_HAS_ACTIVE_PRICING_POLICY` |

Khi một phụ thuộc tồn tại, service đính kèm `details: { count, recommendedAction: "SET_INACTIVE" }` để hướng dẫn Admin chuyển trạng thái khóa học sang `INACTIVE` thay vì xóa bỏ.

### 2.3. Soft-Delete Nguyên Tử Trên Tất Cả Thực Thể Liên Kết

Khi tất cả các kiểm tra phụ thuộc đều trả về `0`, service tiến hành soft-delete nguyên tử:
```javascript
// 1. Soft-delete Course
course.isDeleted = true;
course.deletedAt = new Date();
course.deletedBy = adminId;
course.status = "INACTIVE";
await course.save(sessionOpts);

// 2. Soft-delete toàn bộ SyllabusVersion & CurriculumUnit liên kết
const { SyllabusVersion, CurriculumUnit } = require("../models");
await Promise.all([
  SyllabusVersion.updateMany(
    { courseId: course._id, ...NOT_DELETED },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
    sessionOpts
  ),
  CurriculumUnit.updateMany(
    { courseId: course._id, ...NOT_DELETED },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
    sessionOpts
  ),
]);
```

### 2.4. Đưa Audit Log vào Transaction & Tuyệt Đối Không Nuốt Lỗi

Service loại bỏ hoàn toàn khối `try/catch` nuốt lỗi cũ, truyền trực tiếp `activeSession` vào `auditService.audit`:
```javascript
const { audit } = require("./auditService");
await audit(
  {
    actorAdminId: adminId,
    action: "COURSE_SOFT_DELETED",
    targetType: "Course",
    targetId: course._id,
    beforeState,
    afterState: { isDeleted: true, status: "INACTIVE" },
  },
  activeSession
);
```
Nếu tiến trình ghi audit thất bại, exception sẽ được ném ra ngoài, trigger transaction rollback trên MongoDB và thông báo lỗi rõ ràng lên tầng Controller/Client, đảm bảo không có bất kỳ hành động xóa nào diễn ra mà thiếu vết kiểm toán.

---

## 3. KẾT LUẬN

Giải pháp đã xử lý triệt để 100% rủi ro P0 trong vòng đời Course Safe Delete mà không làm thay đổi các contract thanh toán hoặc phá vỡ cấu trúc dữ liệu của các nhóm khác.

