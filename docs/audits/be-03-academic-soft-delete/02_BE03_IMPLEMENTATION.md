# BÁO CÁO THỰC THI SOFT DELETE & AN TOÀN PHỤ THUỘC (BE-03.2, BE-03.3, BE-03.4)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 3 — Academic Soft Delete & Dependency Safety  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Trạng thái:** HOÀN THÀNH IMPLEMENTATION  

---

## 1. TỔNG QUAN THAY ĐỔI KIẾN TRÚC & CODE

Chúng tôi đã thiết kế và triển khai cơ chế xóa mềm an toàn (Academic Soft Delete & Dependency Guard) cho toàn bộ hệ thống catalog học thuật Edunity V3, tuân thủ nghiêm ngặt 3 trụ cột:
1. **Dependency Integrity Guard (Chặn xóa khi có phụ thuộc còn tồn tại):** Kiểm tra toàn diện mọi quan hệ trước khi cho phép xóa mềm.
2. **Atomic Fail-Closed Transactions:** Đảm bảo toàn bộ thao tác cập nhật trạng thái xóa mềm và ghi vết `AuditLog` chạy trong cùng một MongoDB session transaction.
3. **Zero Physical & Cascade Deletions:** Bản ghi luôn tồn tại vật lý trong database, bảo vệ tính toàn vẹn của lịch sử và ledger.

---

## 2. CHI TIẾT THỰC THI TỪNG MODULE

### 2.1. BE-03.2 — Category Delete Service & Route
**Tệp chỉnh sửa:**
- [courseCatalogService.js](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)
- [courseCatalogController.js](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js)
- [courseCatalogRoutes.js](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js)

**Luồng thực thi của `deleteCategory(adminId, categoryId)`:**
1. **Định danh & Kiểm tra hợp lệ:** Kiểm tra `categoryId` hợp lệ thông qua `assertId`.
2. **Khởi tạo Transaction Session Fail-Closed:**
   - Nếu `mongoose.startSession` không khả dụng hoặc thất bại, ngay lập tức ném `503 DATABASE_TRANSACTION_UNAVAILABLE`.
3. **Kiểm tra tồn tại trong session:**
   - Tìm Category với điều kiện `{ _id: categoryId, ...NOT_DELETED }`.
   - Nếu không tìm thấy (hoặc đã bị xóa mềm trước đó), ném lỗi `404 CATEGORY_NOT_FOUND`.
4. **Kiểm tra phụ thuộc (Dependency Pre-checks):**
   - **Subject:** Đếm `Subject.countDocuments({ categoryId: category._id, ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_HAS_SUBJECTS`.
   - **Course:** Đếm `Course.countDocuments({ categoryId: category._id, ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_HAS_COURSES`.
   - **Class:** Đếm `Class.countDocuments({ categoryId: category._id, ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_HAS_CLASSES`.
   - **LearningPath:** Đếm `LearningPath.countDocuments({ categoryId: category._id, ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_IN_LEARNING_PATH`.
   - **ScholarshipCampaign:** Đếm `ScholarshipCampaign.countDocuments({ categoryIds: category._id, ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_IN_SCHOLARSHIP_CAMPAIGN`.
   - **CoursePricingPolicy:** Đếm `CoursePricingPolicy.countDocuments({ categoryId: category._id, status: "ACTIVE", ...NOT_DELETED })`. Nếu > 0, ném `409 CATEGORY_HAS_ACTIVE_PRICING_POLICY`.
5. **Thực hiện Xóa mềm (Soft Delete):**
   ```javascript
   category.isDeleted = true;
   category.deletedAt = new Date();
   category.deletedBy = adminId;
   category.status = "INACTIVE";
   await category.save({ session });
   ```
6. **Ghi vết Kiểm toán (AuditLog) nguyên tử trong transaction:**
   ```javascript
   await audit({
     actorAdminId: adminId,
     action: "CATEGORY_SOFT_DELETED",
     targetType: "Category",
     targetId: category._id,
     beforeState: { name: category.name, status: originalStatus },
     afterState: { isDeleted: true, status: "INACTIVE" },
   }, session);
   ```
7. **Đóng Session trong `finally`:** Đảm bảo `session.endSession()` luôn được gọi trong mọi trường hợp (thành công hoặc có ngoại lệ).

---

### 2.2. BE-03.3 — Subject Delete Service & Route
**Tệp chỉnh sửa:**
- [courseCatalogService.js](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)
- [courseCatalogController.js](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js)
- [courseCatalogRoutes.js](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js)

**Luồng thực thi của `deleteSubject(adminId, subjectId)`:**
1. **Định danh & Kiểm tra hợp lệ:** Kiểm tra `subjectId` hợp lệ thông qua `assertId`.
2. **Khởi tạo Transaction Session Fail-Closed:** Tương tự `deleteCategory`, ném `503 DATABASE_TRANSACTION_UNAVAILABLE` nếu session không sẵn sàng.
3. **Kiểm tra tồn tại trong session:** Tìm Subject với `{ _id: subjectId, ...NOT_DELETED }`. Nếu không có, ném `404 SUBJECT_NOT_FOUND`.
4. **Kiểm tra phụ thuộc (Dependency Pre-checks):**
   - **Course:** Đếm `Course.countDocuments({ subjectId: subject._id, ...NOT_DELETED })`. Nếu > 0, ném `409 SUBJECT_HAS_COURSES`.
   - **Class:** Đếm `Class.countDocuments({ subjectId: subject._id, ...NOT_DELETED })`. Nếu > 0, ném `409 SUBJECT_HAS_CLASSES`.
   - **TeacherSubjectAuthorization:** Đếm `TeacherSubjectAuthorization.countDocuments({ subjectId: subject._id, status: { $in: ["PENDING", "APPROVED"] } })`. Nếu > 0, ném `409 SUBJECT_HAS_TEACHER_AUTHORIZATIONS`.
   - **ScholarshipCampaign:** Đếm `ScholarshipCampaign.countDocuments({ subjectIds: subject._id, ...NOT_DELETED })`. Nếu > 0, ném `409 SUBJECT_IN_SCHOLARSHIP_CAMPAIGN`.
   - **CourseProposal:** Đếm `CourseProposal.countDocuments({ subjectId: subject._id, status: { $in: ["PENDING", "CHANGES_REQUESTED"] }, ...NOT_DELETED })`. Nếu > 0, ném `409 SUBJECT_HAS_COURSE_PROPOSALS`.
   - **CoursePricingPolicy:** Đếm `CoursePricingPolicy.countDocuments({ subjectId: subject._id, status: "ACTIVE", ...NOT_DELETED })`. Nếu > 0, ném `409 SUBJECT_HAS_ACTIVE_PRICING_POLICY`.
5. **Thực hiện Xóa mềm (Soft Delete):**
   ```javascript
   subject.isDeleted = true;
   subject.deletedAt = new Date();
   subject.deletedBy = adminId;
   subject.status = "INACTIVE";
   await subject.save({ session });
   ```
6. **Ghi vết Kiểm toán (AuditLog) nguyên tử trong transaction:**
   ```javascript
   await audit({
     actorAdminId: adminId,
     action: "SUBJECT_SOFT_DELETED",
     targetType: "Subject",
     targetId: subject._id,
     beforeState: { name: subject.name, status: originalStatus },
     afterState: { isDeleted: true, status: "INACTIVE" },
   }, session);
   ```
7. **Đóng Session an toàn trong `finally`:** Luôn đóng session.

---

### 2.3. BE-03.4 — Course Delete Safety Hardening
**Tệp chỉnh sửa:**
- [courseCatalogService.js](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)

**Nội dung hoàn thiện trong `deleteCourse`:**
- Điều kiện kiểm tra Class: Cập nhật thành `Class.countDocuments({ courseId: course._id, ...NOT_DELETED }, { session })`. Đảm bảo chặn xóa nếu có bất kỳ lớp học nào chưa bị xóa thuộc Course.
- Khóa tương tranh `lockVersion`: `Course.findOneAndUpdate({ _id: courseId, ...NOT_DELETED }, { $inc: { lockVersion: 1 } }, { session, returnDocument: "after" })`.
- Xóa mềm đồng thời toàn bộ `SyllabusVersion` và `CurriculumUnit` liên quan trong transaction:
  ```javascript
  await Promise.all([
    SyllabusVersion.updateMany(
      { courseId: course._id, ...NOT_DELETED },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
      { session }
    ),
    CurriculumUnit.updateMany(
      { courseId: course._id, ...NOT_DELETED },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
      { session }
    ),
  ]);
  ```
- Ghi vết `AuditLog` nguyên tử: `action: "COURSE_SOFT_DELETED"`.

---

## 3. BẢNG TỔNG HỢP MÃ LỖI HTTP VÀ CODE BUSINESS

| API | Trạng thái lỗi | HTTP Status | Code Trả Về | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `DELETE /admin/categories/:id` | Thiếu quyền | 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | Chỉ Admin được phép gọi |
| `DELETE /admin/categories/:id` | Không tồn tại / đã xóa | 404 | `CATEGORY_NOT_FOUND` | Category không tồn tại hoặc đã xóa mềm |
| `DELETE /admin/categories/:id` | Có Subject liên kết | 409 | `CATEGORY_HAS_SUBJECTS` | Chặn xóa danh mục khi còn môn học |
| `DELETE /admin/categories/:id` | Có Course liên kết | 409 | `CATEGORY_HAS_COURSES` | Chặn xóa danh mục khi còn khóa học |
| `DELETE /admin/categories/:id` | Có Class liên kết | 409 | `CATEGORY_HAS_CLASSES` | Chặn xóa danh mục khi còn lớp học |
| `DELETE /admin/subjects/:id` | Không tồn tại / đã xóa | 404 | `SUBJECT_NOT_FOUND` | Subject không tồn tại hoặc đã xóa mềm |
| `DELETE /admin/subjects/:id` | Có Course liên kết | 409 | `SUBJECT_HAS_COURSES` | Chặn xóa môn học khi còn khóa học |
| `DELETE /admin/subjects/:id` | Có Class liên kết | 409 | `SUBJECT_HAS_CLASSES` | Chặn xóa môn học khi còn lớp học |
| `DELETE /admin/subjects/:id` | Có Phân quyền GV | 409 | `SUBJECT_HAS_TEACHER_AUTHORIZATIONS` | Chặn xóa môn học khi còn giáo viên được phân quyền |
| `DELETE /admin/courses/:id` | Có Class liên kết | 409 | `COURSE_HAS_CLASSES` | Chặn xóa khóa học khi còn lớp học |
| Tất cả Delete APIs | Lỗi Transaction | 503 | `DATABASE_TRANSACTION_UNAVAILABLE` | Fail-closed bảo đảm tính nhất quán dữ liệu |
