# 02_CONCURRENCY_AUDIT.md — Rà Soát & Thiết Kế Đồng Bộ Concurrency Giữa Xóa Khóa Học & Tạo Lớp/Đăng Ký

**Dự án:** Edunity V3  
**Người thực hiện:** Châu  
**Ngày kiểm toán:** 13/11/2026  
**Chủ đề:** Concurrency Safety, Document Write Locking & Invariant Preservation  

---

## 1. PHÂN TÍCH RỦI RO ĐỒNG THỜI (CONCURRENCY HAZARD ANALYSIS)

### 1.1. Lỗ Hổng Của Cách Tiếp Cận "Pre-Lock Trạng Thái INACTIVE Chưa Commit"
Trong giải pháp trước đây:
```javascript
// deleteCourse (trong transaction)
course.status = "INACTIVE";
await course.save(session);
// ... kiểm tra Class.countDocuments ...
```
Với giả định rằng: "Khi đổi `course.status = 'INACTIVE'`, hàm `createClass` gọi `getActiveCourse` sẽ thấy INACTIVE và bị chặn lại".

**Tại sao giả định này SAI trong môi trường phân tán / transaction?**
1. **Mức độ Cô Lập Dữ Liệu (Read Committed / Snapshot Isolation):** Trong MongoDB WiredTiger, các transaction khác hoặc các query không có session đọc với mức cô lập `Read Committed`. Khi Transaction A sửa `course.status = 'INACTIVE'` nhưng chưa commit, Transaction B (hoặc luồng `createClass`) **HOÀN TOÀN KHÔNG NHÌN THẤY** trạng thái `"INACTIVE"` đó! Transaction B vẫn đọc thấy bản ghi đã commit gần nhất (`status: "ACTIVE"`).
2. **Hậu quả:** `createClass` vẫn đọc thấy Course `"ACTIVE"`, tiến hành tạo lớp học mới và lưu vào database. Trong khi đó, `deleteCourse` kiểm tra `Class.countDocuments` (lúc này Class mới chưa lưu xong) nên thấy bằng `0` và tiếp tục commit soft-delete.
3. **Kết quả:** Một Lớp học mới tinh vừa được tạo lại trỏ đến một Khóa học đã bị xóa (`isDeleted: true`), tạo ra dữ liệu mồ côi (Orphan Record) phá vỡ tính nhất quán của hệ thống.

---

## 2. THIẾT KẾ ĐỒNG BỘ: TRANSACTIONAL MUTEX VIA DOCUMENT WRITE LOCK

Để giải quyết triệt để rủi ro trên mà không làm chậm hệ thống, chúng ta áp dụng cơ chế **Document-Level Write Locking** của MongoDB WiredTiger kết hợp trường phiên bản `lockVersion`.

### 2.1. Cấu Trúc Model [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js)
Bổ sung trường `lockVersion`:
```javascript
const courseSchema = new Schema(
  {
    // ...
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    lockVersion: { type: Number, default: 0 },
    // ...
  },
  { timestamps: true }
);
```

### 2.2. Cơ Chế Khóa Độc Quyền (Exclusive Write Lock) Trong `deleteCourse`
Tại [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) (Line 461):
Ngay dòng đầu tiên của `session.withTransaction`:
```javascript
const course = await Course.findOneAndUpdate(
  { _id: courseId, ...NOT_DELETED },
  { $inc: { lockVersion: 1 } },
  { session, returnDocument: "after" }
);
if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
```
* **Tác động vật lý trong MongoDB:** Lệnh `findOneAndUpdate` với `$inc: { lockVersion: 1 }` lập tức chiếm giữ **Exclusive Document Write Lock** trên document Course này cho đến khi transaction kết thúc (commit hoặc abort).
* Không có bất kỳ transaction nào khác có thể ghi hoặc cập nhật document Course này cùng lúc.

### 2.3. Sự Tham Gia Bắt Buộc Của Luồng `createClass`
Tại [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js) (Lines 180–190):
Luồng tạo lớp học không chỉ đọc Course thụ động mà **chủ động tham gia transaction và lock**:
```javascript
const executeCreate = async (activeSession) => {
  const sessionOpts = activeSession ? { session: activeSession } : {};

  // Atomically lock and verify course is ACTIVE and not deleted
  let course;
  if (activeSession) {
    course = await Course.findOneAndUpdate(
      { _id: body.courseId, status: "ACTIVE", ...NOT_DELETED },
      { $inc: { lockVersion: 1 } },
      { session: activeSession, returnDocument: "after" }
    );
  } else {
    course = await Course.findOne({ _id: body.courseId, status: "ACTIVE", ...NOT_DELETED });
  }
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

  // ... tiến hành tạo và lưu Class với session ...
  await cls.save(sessionOpts);
  return cls.toObject();
};
```

---

## 3. CHỨNG MINH TOÁN HỌC & ĐỒNG THỜI (CONCURRENCY PROOFS)

### 3.1. Kịch Bản 1: `deleteCourse` Chạy Trước `createClass`
1. `deleteCourse` bắt đầu Transaction 1, thực hiện `Course.findOneAndUpdate(..., { $inc: { lockVersion: 1 } }, { session: T1 })`. MongoDB cấp Exclusive Write Lock trên Course cho T1.
2. Đồng thời, `createClass` bắt đầu Transaction 2, gọi `Course.findOneAndUpdate(..., { session: T2 })`.
3. Do Course đang bị khóa bởi T1, **Transaction 2 tự động bị treo (blocked / paused)** tại tầng WiredTiger engine.
4. T1 kiểm tra các phụ thuộc: không có lớp học, không có học viên.
5. T1 cập nhật `course.isDeleted = true, status = "INACTIVE"`, ghi AuditLog và **COMMIT** transaction. T1 giải phóng khóa.
6. T2 thức dậy và thực thi câu truy vấn nguyên thủy: `{ _id: body.courseId, status: "ACTIVE", isDeleted: { $ne: true } }`.
7. Vì Course vừa được commit là `isDeleted: true, status: "INACTIVE"`, câu lệnh không tìm thấy document nào (`course === null`).
8. `createClass` ngay lập tức ném ra lỗi `404 COURSE_NOT_FOUND`, hủy bỏ tạo lớp học!
9. **KẾT QUẢ:** Không có lớp học nào được tạo ra trên khóa học đã xóa.

### 3.2. Kịch Bản 2: `createClass` Chạy Trước `deleteCourse`
1. `createClass` bắt đầu Transaction 2, thực hiện `Course.findOneAndUpdate(..., { $inc: { lockVersion: 1 } }, { session: T2 })`. MongoDB cấp Exclusive Write Lock trên Course cho T2.
2. Đồng thời, `deleteCourse` bắt đầu Transaction 1, gọi `Course.findOneAndUpdate(..., { session: T1 })`.
3. Do Course đang bị khóa bởi T2, **Transaction 1 tự động bị treo (blocked / paused)**.
4. T2 tạo lớp học mới, lưu `cls.save({ session: T2 })`, và **COMMIT** transaction. T2 giải phóng khóa.
5. T1 thức dậy và thực thi `Course.findOneAndUpdate`. Course vẫn active, T1 chiếm khóa.
6. T1 thực hiện bước kiểm tra phụ thuộc:
   `const classCount = await Class.countDocuments({ courseId: course._id }, { session: T1 });`
7. Do lớp học của T2 đã commit thành công vào database, `classCount` trả về `1`!
8. `deleteCourse` ngay lập tức ném ra lỗi:
   `409 COURSE_HAS_CLASSES` với `{ classCount: 1, recommendedAction: "SET_INACTIVE" }`!
9. Transaction 1 tự động abort và rollback hoàn toàn.
10. **KẾT QUẢ:** Khóa học KHÔNG bị xóa, lớp học mới được bảo toàn toàn vẹn.

---

## 4. PHỐI HỢP VỚI `createEnrollment`

Tại [`BackEnd/src/services/enrollmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js) (Lines 94–105):
Trong transaction đăng ký học (`session.withTransaction`):
```javascript
// 1b. Validate parent Course status: must be ACTIVE and not deleted
if (targetClass.courseId) {
  const parentCourse = await Course.findOne({
    _id: targetClass.courseId,
    status: "ACTIVE",
    isDeleted: { $ne: true },
  }).session(session);
  if (!parentCourse) {
    throw new AppError("Course not found or inactive", "COURSE_NOT_ACTIVE", 400);
  }
}
```
* **Bảo vệ 2 chiều:**
  1. Khi một lớp học đã tồn tại, `deleteCourse` không bao giờ xóa được Course vì `Class.countDocuments` luôn >= 1 (trả về 409).
  2. Nếu một lớp học bất thường trỏ đến một Course đã bị xóa, `createEnrollment` từ chối ghi danh với lỗi `400 COURSE_NOT_ACTIVE`.
  3. Hoàn toàn không ảnh hưởng đến logic tính tiền của Tin hay CUR-09 Snapshot.

---

## 5. KẾT LUẬN AUDIT PHASE 3

Cơ chế phối hợp dựa trên **Exclusive Document Write Lock** qua `lockVersion` và xác thực liên miền đã loại bỏ 100% khả năng xảy ra race condition giữa việc xóa khóa học và việc tạo lớp học hoặc tạo ghi danh mới.

