# BÁO CÁO HIỆN TRẠNG SOFT DELETE HỌC THUẬT (BE-03.1 — AUDIT REPORT)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 3 — Academic Soft Delete & Dependency Safety  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Trạng thái:** HOÀN TẤT AUDIT  

---

## 1. BỐI CẢNH & NGUYÊN TẮC THIẾT KẾ HỆ THỐNG

Trong hệ sinh thái EDUNITY V3, các thực thể danh mục học thuật (Academic Catalog Entities) gồm:
1. **Category** (Danh mục bộ môn / lĩnh vực)
2. **Subject** (Môn học)
3. **Course** (Khóa học chuẩn)
4. **SyllabusVersion** & **CurriculumUnit** (Phiên bản giáo trình & Chuyên đề bài học)
5. **Class** (Lớp học thực tế mở bởi giáo viên)

### Nguyên tắc bất biến (Invariants):
- **Tuyệt đối không Hard-Delete (Xóa vật lý):** Mọi hành vi xóa danh mục/môn học/khóa học chỉ được thực hiện dưới dạng **Soft-Delete (Xóa mềm)** thông qua plugin `softDeletePlugin` (`isDeleted: true`, `deletedAt: Date`, `deletedBy: ObjectId`, `status: "INACTIVE"`).
- **Tuyệt đối không Cascade Delete:** Không bao giờ tự động xóa lan truyền sang các thực thể phụ thuộc nhằm tránh mất dấu vết lịch sử học tập, giao dịch tài chính, điểm danh hoặc phân quyền giáo viên.
- **Dependency Safety (Chặn xóa khi có phụ thuộc còn hoạt động):** Khi một thực thể đang có quan hệ phụ thuộc active (hoặc non-deleted) trỏ tới, hệ thống phải từ chối xóa với mã lỗi `409 CONFLICT` và hướng dẫn chuyển trạng thái sang `INACTIVE` thay vì xóa.
- **Transaction Fail-Closed:** Khi thực hiện xóa mềm và ghi vết `AuditLog`, hệ thống phải thực thi trong MongoDB Session Transaction. Nếu session không khả dụng, hệ thống phải trả lỗi `503 DATABASE_TRANSACTION_UNAVAILABLE` (fail-closed), không bao giờ thực hiện ngoài transaction.

---

## 2. HIỆN TRẠNG SCHEMA & MODEL AUDIT

### 2.1. Plugin Xóa Mềm (`BackEnd/src/models/plugins.js`)
Plugin `softDeletePlugin` đã được định nghĩa chuẩn:
```javascript
function softDeletePlugin(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });
  schema.index({ isDeleted: 1 });
}
```
Các model học thuật đã tích hợp plugin này:
- `Category`: Có `softDeletePlugin`, `adminManagedPlugin`, enum status `["ACTIVE", "INACTIVE"]`.
- `Subject`: Có `softDeletePlugin`, `adminManagedPlugin`, enum status `["ACTIVE", "INACTIVE"]`, denormalized `categoryName`.
- `Course`: Có `softDeletePlugin`, `adminManagedPlugin`, `lockVersion`, status `["ACTIVE", "INACTIVE"]`.
- `SyllabusVersion`: Có `softDeletePlugin`, `adminManagedPlugin`.
- `CurriculumUnit`: Có `softDeletePlugin`, `adminManagedPlugin`.
- `Class`: Có `softDeletePlugin`, `reviewablePlugin`.

### 2.2. Kiểm tra các liên kết dữ liệu (Foreign References)
Khảo sát toàn bộ model tham chiếu đến `Category` và `Subject`:
1. Tham chiếu đến `Category`:
   - `Subject` (`categoryId`)
   - `Course` (`categoryId`)
   - `Class` (`categoryId`)
   - `CoursePricingPolicy` (`categoryId`)
   - `LearningPath` (`categoryId`)
   - `ScholarshipCampaign` (`categoryIds`)
   - `TeacherSubjectAuthorization` (`categoryId`)
   - `CourseProposal` (`categoryId`)
2. Tham chiếu đến `Subject`:
   - `Course` (`subjectId`)
   - `Class` (`subjectId`)
   - `CoursePricingPolicy` (`subjectId`)
   - `ScholarshipCampaign` (`subjectIds`)
   - `TeacherSubjectAuthorization` (`subjectId`)
   - `CourseProposal` (`subjectId`)

---

## 3. HIỆN TRẠNG ROUTE & SERVICE TRƯỚC KHI TRIỂN KHAI

### 3.1. Điểm thiếu hụt nghiêm trọng (Gaps Identified)
1. **Category:**
   - Trong `courseCatalogRoutes.js`: Có `GET /categories`, `POST /admin/categories`, `PATCH /admin/categories/:id`.
   - **HOÀN TOÀN THIẾU API `DELETE /admin/categories/:id`**. Admin không thể xóa mềm Category theo chuẩn API RESTful.
2. **Subject:**
   - Trong `courseCatalogRoutes.js`: Có `GET /categories/:id/subjects`, `GET /subjects/:id`, `POST /admin/subjects`, `PATCH /admin/subjects/:id`.
   - **HOÀN TOÀN THIẾU API `DELETE /admin/subjects/:id`**. Admin không thể xóa mềm Subject.
3. **Course:**
   - Đã có `DELETE /admin/courses/:id` trong `courseCatalogService.js`.
   - Tuy nhiên, cần rà soát lại điều kiện phụ thuộc Class: kiểm tra phải chặn nếu có lớp học ở trạng thái `OPEN`, `IN_PROGRESS` hoặc bất kỳ Class nào chưa bị xóa (`...NOT_DELETED`).

### 3.2. Rà soát an toàn truy vấn (Query Safety Audit)
Khảo sát các API listing hiện hữu:
- `listCategories`: Đang dùng `Category.find({ status: "ACTIVE", ...NOT_DELETED })`. Đảm bảo an toàn không lộ Category đã xóa.
- `listSubjectsByCategory`: Đang dùng `getCategoryOrThrow(categoryId)` (kiểm tra `...NOT_DELETED`) và `Subject.find({ categoryId: category._id, status: "ACTIVE", ...NOT_DELETED })`. Đảm bảo an toàn.
- `getSubject`: Đang dùng `getSubjectOrThrow(subjectId)` và `Course.find({ subjectId: subject._id, status: "ACTIVE", ...NOT_DELETED })`. Đảm bảo an toàn.
- `searchCourses` & `getCourse`: Đều áp dụng `...NOT_DELETED`.
- `adminListCourses`: Đang áp dụng `filter = { ...NOT_DELETED }`. Các Course đã soft-deleted bị loại trừ khỏi danh sách quản trị mặc định.

---

## 4. KẾT LUẬN & ĐỊNH HƯỚNG THỰC THI (ACTION ITEMS)

1. **BE-03.2:** Bổ sung hàm `deleteCategory` vào `courseCatalogService.js`, controller `deleteCategory` vào `courseCatalogController.js`, và đăng ký route `DELETE /admin/categories/:id` với RBAC `ADMIN`.
2. **BE-03.3:** Bổ sung hàm `deleteSubject` vào `courseCatalogService.js`, controller `deleteSubject` vào `courseCatalogController.js`, và đăng ký route `DELETE /admin/subjects/:id` với RBAC `ADMIN`.
3. **BE-03.4:** Chuẩn hóa điều kiện kiểm tra Class trong `deleteCourse` với `{ courseId: course._id, ...NOT_DELETED }`.
4. **BE-03.5 & BE-03.6:** Viết bộ integration test toàn diện `BackEnd/tests/be03AcademicSoftDelete.test.js` kiểm tra mọi ràng buộc phụ thuộc, fail-closed transaction, audit logging và an toàn truy vấn.
