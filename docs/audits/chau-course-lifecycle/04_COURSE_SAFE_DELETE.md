# BÁO CÁO 04: CƠ CHẾ XÓA AN TOÀN KHÓA HỌC (TASK 3 COURSE SAFE DELETE)

- **Dự án:** Edunity V3
- **Chế độ:** IMPLEMENTATION & SAFETY AUDIT
- **Người thực hiện:** Châu (Senior Backend Engineer)
- **Thời gian lập:** 13/11/2026

---

## 1. NGUYÊN TẮC BẢO VỆ DỮ LIỆU VÀ CHÍNH SÁCH XÓA AN TOÀN

Trong hệ thống Edunity V3, Khóa học (`Course`) là thực thể trung tâm của cây học thuật. Khóa học có các quan hệ chằng chịt với Lớp học (`Class`), Đơn vị bài học (`CurriculumUnit`), Đơn ghi danh học viên (`Enrollment`), Giao dịch thanh toán (`Payment`/`Transaction`), Chiến dịch học bổng (`ScholarshipCampaign`), Lộ trình học (`LearningPath`), và Chính sách giá (`CoursePricingPolicy`).

### 4 Nguyên tắc Cốt lõi:
1. **Tuyệt đối không Hard Delete:** Không bao giờ thực thi lệnh `Course.deleteOne()` hoặc `Course.findByIdAndDelete()`. Việc xóa cứng sẽ phá vỡ toàn bộ khóa ngoại (`courseId`), làm mất truy vết kiểm toán và gây lỗi crash khi hiển thị lịch sử giao dịch.
2. **Không Cascade Delete Dữ liệu Tài chính hoặc Lớp học:** Không bao giờ tự động xóa lớp học hay đơn ghi danh khi xóa khóa học.
3. **Ưu tiên Tắt trạng thái (`SET_INACTIVE`):** Khi một khóa học đã có dữ liệu phát sinh (đã có lớp, đã có học viên), hệ thống kiên quyết từ chối xóa và yêu cầu Admin chuyển trạng thái khóa học sang `INACTIVE`.
4. **Chỉ Soft Delete khi Khóa học Hoàn toàn Độc lập:** Chỉ cho phép xóa mềm (`isDeleted: true`) khi và chỉ khi khóa học là bản ghi mới tạo nhầm, chưa từng có lớp học hay đơn ghi danh nào được gắn kết.

---

## 2. MA TRẬN PHÂN TÍCH RÀNG BUỘC (DEPENDENCY MATRIX)

Trước khi thực hiện soft-delete, hệ thống thực thi chuỗi kiểm tra tuần tự 5 chốt chặn:

| STT | Thực Thể Ràng Buộc | Điều Kiện Kiểm Tra | Mã Lỗi Trả Về Khi Vi Phạm | Hành Động Đề Xuất |
|---|---|---|---|---|
| 1 | **Class (Lớp học)** | `Class.countDocuments({ courseId }) > 0` | `COURSE_HAS_CLASSES` (409) | `SET_INACTIVE` |
| 2 | **Enrollment (Ghi danh)** | `Enrollment.countDocuments({ courseId }) > 0` | `COURSE_HAS_ENROLLMENTS` (409) | `SET_INACTIVE` |
| 3 | **ScholarshipCampaign** | `ScholarshipCampaign.countDocuments({ courseIds: courseId }) > 0` | `COURSE_IN_SCHOLARSHIP_CAMPAIGN` (409) | `SET_INACTIVE` |
| 4 | **LearningPath (Lộ trình)**| `LearningPath.countDocuments({ steps / prereqs: courseId }) > 0` | `COURSE_IN_LEARNING_PATH` (409) | `SET_INACTIVE` |
| 5 | **CoursePricingPolicy** | `CoursePricingPolicy.countDocuments({ courseId, status: "ACTIVE" }) > 0` | `COURSE_HAS_ACTIVE_PRICING_POLICY` (409) | `SET_INACTIVE` |

---

## 3. HIỆN THỰC KỸ THUẬT SERVICE `deleteCourse`

Trong file [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js):

```javascript
const deleteCourse = async (adminId, courseId) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: courseId, ...NOT_DELETED });
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

  // 1. Chốt chặn: Lớp học
  const classCount = await Class.countDocuments({ courseId: course._id });
  if (classCount > 0) {
    throw new AppError(
      `Cannot delete course: ${classCount} class(es) exist. Deactivate the course by setting status to INACTIVE instead.`,
      "COURSE_HAS_CLASSES",
      409,
      { classCount, recommendedAction: "SET_INACTIVE" }
    );
  }

  // 2. Chốt chặn: Ghi danh
  const { Enrollment } = require("../models");
  const enrollmentCount = await Enrollment.countDocuments({ courseId: course._id });
  if (enrollmentCount > 0) {
    throw new AppError(
      `Cannot delete course: ${enrollmentCount} enrollment(s) exist. Deactivate the course by setting status to INACTIVE instead.`,
      "COURSE_HAS_ENROLLMENTS",
      409,
      { enrollmentCount, recommendedAction: "SET_INACTIVE" }
    );
  }

  // 3. Chốt chặn: Chiến dịch học bổng
  const { ScholarshipCampaign } = require("../models");
  const scholarshipCount = await ScholarshipCampaign.countDocuments({
    courseIds: course._id,
    ...NOT_DELETED,
  });
  if (scholarshipCount > 0) {
    throw new AppError(
      `Cannot delete course: referenced in ${scholarshipCount} active scholarship campaign(s). Deactivate the course by setting status to INACTIVE instead.`,
      "COURSE_IN_SCHOLARSHIP_CAMPAIGN",
      409,
      { scholarshipCount, recommendedAction: "SET_INACTIVE" }
    );
  }

  // 4. Chốt chặn: Lộ trình học
  const { LearningPath } = require("../models");
  const learningPathCount = await LearningPath.countDocuments({
    $or: [{ "steps.courseId": course._id }, { prerequisiteCourseIds: course._id }],
    ...NOT_DELETED,
  });
  if (learningPathCount > 0) {
    throw new AppError(
      `Cannot delete course: referenced in ${learningPathCount} learning path(s). Deactivate the course by setting status to INACTIVE instead.`,
      "COURSE_IN_LEARNING_PATH",
      409,
      { learningPathCount, recommendedAction: "SET_INACTIVE" }
    );
  }

  // 5. Chốt chặn: Chính sách giá
  const { CoursePricingPolicy } = require("../models");
  const activePolicyCount = await CoursePricingPolicy.countDocuments({
    courseId: course._id,
    status: "ACTIVE",
    ...NOT_DELETED,
  });
  if (activePolicyCount > 0) {
    throw new AppError(
      `Cannot delete course: active pricing policy exists. Deactivate the course by setting status to INACTIVE instead.`,
      "COURSE_HAS_ACTIVE_PRICING_POLICY",
      409,
      { activePolicyCount, recommendedAction: "SET_INACTIVE" }
    );
  }

  // Khi sạch toàn bộ dependency: Thực hiện Soft Delete
  const beforeState = { title: course.title, status: course.status };
  course.isDeleted = true;
  course.deletedAt = new Date();
  course.deletedBy = adminId;
  course.status = "INACTIVE";
  await course.save();

  // Đồng thời dọn dẹp các giáo trình nháp và bài học mồ côi của khóa học này
  const { SyllabusVersion, CurriculumUnit } = require("../models");
  await Promise.all([
    SyllabusVersion.updateMany(
      { courseId: course._id, ...NOT_DELETED },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } }
    ),
    CurriculumUnit.updateMany(
      { courseId: course._id, ...NOT_DELETED },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } }
    ),
  ]);

  // Ghi nhật ký kiểm toán
  await audit({
    actorAdminId: adminId,
    action: "COURSE_SOFT_DELETED",
    targetType: "Course",
    targetId: course._id,
    beforeState,
    afterState: { isDeleted: true, status: "INACTIVE" },
  });

  return {
    success: true,
    message: "Course soft-deleted successfully",
    courseId: course._id,
  };
};
```

---

## 4. BẰNG CHỨNG KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST VERIFICATION)

Trong [`BackEnd/tests/courseLifecycleCur12.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/courseLifecycleCur12.test.js), nhóm kiểm thử Task 3 đạt **100% PASS (8/8 tests)**:
- `√ SAFE-DEL.1: Course with NO dependencies is soft-deleted successfully`
- `√ SAFE-DEL.2: Course with existing Class is REJECTED with 409 COURSE_HAS_CLASSES and recommendedAction SET_INACTIVE`
- `√ SAFE-DEL.3: Course with existing Enrollment is REJECTED with 409 COURSE_HAS_ENROLLMENTS`
- `√ SAFE-DEL.4: Course in ScholarshipCampaign is REJECTED with 409 COURSE_IN_SCHOLARSHIP_CAMPAIGN`
- `√ SAFE-DEL.5: Course in LearningPath is REJECTED with 409 COURSE_IN_LEARNING_PATH`
- `√ SAFE-DEL.6: Course with active CoursePricingPolicy is REJECTED with 409 COURSE_HAS_ACTIVE_PRICING_POLICY`
- `√ SAFE-DEL.7: Soft-delete on already deleted course throws 404 COURSE_NOT_FOUND`
- `√ SAFE-DEL.8: HTTP DELETE /api/admin/courses/:id returns 403 for non-admin user`

