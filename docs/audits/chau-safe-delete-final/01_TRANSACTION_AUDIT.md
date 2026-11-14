# 01_TRANSACTION_AUDIT.md — Rà Soát Chi Tiết Luồng Thực Thi Transaction Course Safe Delete

**Dự án:** Edunity V3  
**Người thực hiện:** Châu  
**Ngày kiểm toán:** 13/11/2026  
**Chế độ:** Source-Based Transaction Audit (Fail-Closed)  

---

## 1. TRUY VẾT ĐƯỜNG THỰC THI (EXECUTION PATH TRACING)

### 1.1. Điểm Tiếp Nhận Request
* **Route:** `DELETE /api/admin/courses/:id`  
  * File: [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js) (Line 38)
  * Middlewares: `authRequired`, `requireRole("ADMIN")`, `validateObjectId("id")`
* **Controller:** `courseCatalogController.deleteCourse`  
  * File: [`BackEnd/src/controllers/courseCatalogController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js) (Lines 77–85)
  * Gọi: `courseCatalogService.deleteCourse(req.user.id, req.params.id)`
  * Trả về: `200 OK` với payload `{ success: true, message, courseId }` hoặc chuyển lỗi sang Global Error Handler.

---

## 2. PHÁT HIỆN LỖ HỔNG P0: ĐƯỜNG FALLBACK KHÔNG DÙNG TRANSACTION

### 2.1. Hiện Trạng Mã Nguồn Trước Khi Sửa
Tại [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) (phiên bản cũ):
```javascript
// DÒNG 429-436 (CŨ):
let session = null;
if (mongoose.connection && mongoose.connection.readyState === 1 && typeof mongoose.startSession === "function") {
  try {
    session = await mongoose.startSession();
  } catch (e) {
    session = null; // Nuốt lỗi khi không mở được session!
  }
}

// DÒNG 598-606 (CŨ):
if (session) {
  let result;
  await session.withTransaction(async () => {
    result = await executeDelete(session);
  });
  return result;
} else {
  return await executeDelete(null); // LỖ HỔNG P0: Fallback chạy xóa KHÔNG TRANSACTION!
}
```

### 2.2. Phân Tích Rủi Ro Nghiêm Trọng (Risk Analysis)
1. **Mất tính Toàn vẹn (Lack of Atomicity):** Khi chạy `executeDelete(null)`, các thao tác:
   - `course.save()`
   - `SyllabusVersion.updateMany()`
   - `CurriculumUnit.updateMany()`
   - `auditService.audit()`
   chạy tuần tự độc lập trên các socket khác nhau mà không có Transaction Coordinator. Nếu tiến trình Node.js crash hoặc MongoDB disconnect giữa chừng, khóa học bị xóa dở dang, để lại dữ liệu mồ côi và rách nát.
2. **Nguy cơ xóa không thể rollback:** Nếu bước ghi `AuditLog` thất bại, khóa học vẫn đã bị soft-delete thành công ngoài transaction mà không có cách nào rollback tự động.

---

## 3. TÁI CẤU TRÚC: CHÍNH SÁCH TRANSACTION FAIL-CLOSED

### 3.1. Loại Bỏ Hoàn Toàn Fallback Không Transaction
Mã nguồn mới tại [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) (Lines 426–456):
```javascript
const deleteCourse = async (adminId, courseId) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");

  if (typeof mongoose.startSession !== "function") {
    throw new AppError(
      "Database session is unavailable; course deletion requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let session;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    throw new AppError(
      "Failed to start database transaction session for course deletion",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503,
      { originalError: sessionErr.message }
    );
  }

  if (!session || typeof session.withTransaction !== "function") {
    throw new AppError(
      "Database session is unavailable; course deletion requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }
```

### 3.2. Đảm Bảo Mọi Thao Tác Dùng Chung Session Duy Nhất
Toàn bộ 100% các câu lệnh đọc/ghi trong `session.withTransaction` đều nhận tham số `{ session }`:
1. **Lấy Lock & Đọc Course:**
   ```javascript
   const course = await Course.findOneAndUpdate(
     { _id: courseId, ...NOT_DELETED },
     { $inc: { lockVersion: 1 } },
     { session, returnDocument: "after" }
   );
   ```
2. **Kiểm tra Phụ thuộc Lớp học:**
   `Class.countDocuments({ courseId: course._id }, { session })`
3. **Kiểm tra Phụ thuộc Đăng ký:**
   `Enrollment.countDocuments({ courseId: course._id }, { session })`
4. **Kiểm tra Phụ thuộc Khiếu nại Tài chính:**
   `SessionRefundReview.countDocuments({ courseId: course._id }, { session })`
5. **Kiểm tra Phụ thuộc Chiến dịch Học bổng:**
   `ScholarshipCampaign.countDocuments({ courseIds: course._id, ...NOT_DELETED }, { session })`
6. **Kiểm tra Phụ thuộc Lộ trình:**
   `LearningPath.countDocuments(..., { session })`
7. **Kiểm tra Phụ thuộc Chính sách Giá:**
   `CoursePricingPolicy.countDocuments({ courseId: course._id, status: "ACTIVE", ...NOT_DELETED }, { session })`
8. **Cập nhật Soft-Delete Course:**
   `await course.save({ session })`
9. **Cập nhật Soft-Delete SyllabusVersions & CurriculumUnits:**
   `SyllabusVersion.updateMany(..., { session })` và `CurriculumUnit.updateMany(..., { session })`
10. **Ghi Nhật Ký Kiểm Toán (AuditLog):**
    `await audit({ ... }, session)`

---

## 4. KẾT LUẬN AUDIT PHASE 1 & 2

- Đường fallback không có transaction đã bị **xóa bỏ triệt để**.
- Nếu môi trường không hỗ trợ multi-document transactions hoặc không thể khởi tạo session, request DELETE sẽ bị từ chối ngay lập tức với mã lỗi `503 DATABASE_TRANSACTION_UNAVAILABLE` (Fail-Closed).
- Tất cả các thao tác đọc và ghi liên quan đến việc xóa khóa học đều dùng chung session và được cam kết tính nguyên tử (ACID).

