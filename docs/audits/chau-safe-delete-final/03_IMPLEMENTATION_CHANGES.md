# 03_IMPLEMENTATION_CHANGES.md — Chi Tiết Thay Đổi Triển Khai Mã Nguồn

**Dự án:** Edunity V3  
**Người thực hiện:** Châu  
**Ngày hoàn thiện:** 13/11/2026  
**Chế độ:** Controlled Implementation (Fail-Closed & Concurrency-Safe)  

---

## 1. TỔNG QUAN CÁC TẬP TIN THAY ĐỔI

| STT | Đường dẫn tập tin | Loại thay đổi | Mục đích kỹ thuật |
| :--- | :--- | :--- | :--- |
| **1** | [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js) | Modification | Bổ sung trường `lockVersion: { type: Number, default: 0 }` hỗ trợ transactional document write lock. |
| **2** | [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) | Refactor | Xóa bỏ hoàn toàn fallback non-transaction, thi hành Transaction Fail-Closed (503), chiếm giữ exclusive write lock trên Course doc. |
| **3** | [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js) | Modification | Đưa `createClass` vào session/transaction, tham gia khóa độc quyền trên Course qua `findOneAndUpdate(..., { $inc: { lockVersion: 1 } })`. |
| **4** | [`BackEnd/src/services/enrollmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js) | Modification | Bổ sung xác thực kiểm tra Course của Class phải ở trạng thái `ACTIVE` và chưa xóa trong transaction ghi danh. |
| **5** | [`BackEnd/tests/courseLifecycleCur12.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/courseLifecycleCur12.test.js) | Test update | Mock `mongoose.startSession` và `Course.findOneAndUpdate` trong `beforeEach` để unit test tương thích với chuẩn fail-closed mới. |
| **6** | [`BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js) | New Test Suite | Bộ 8 bài test tích hợp đa tiến trình và barrier trên `MongoMemoryReplSet` thực tế. |

---

## 2. CHI TIẾT THAY ĐỔI THEO TỪNG TẬP TIN

### 2.1. [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js)
```diff
@@ -23,6 +23,7 @@ const courseSchema = new Schema(
     prerequisites: String,
     status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
+    lockVersion: { type: Number, default: 0 },
 
     sourceProposalId: { type: Schema.Types.ObjectId, ref: "CourseProposal", default: null },
```

---

### 2.2. [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)
* **Xóa bỏ fallback chạy không transaction (`executeDelete(null)`).**
* **Kiểm tra khả năng mở session; nếu không được, ném ngay lỗi `503 DATABASE_TRANSACTION_UNAVAILABLE`.**
* **Thao tác đầu tiên trong transaction:** Chiếm giữ exclusive lock trên Course document.
* **Tất cả các lệnh:** `countDocuments`, `save`, `updateMany`, `audit` đều truyền session trực tiếp.

```javascript
// DÒNG 426-465
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

  try {
    let result;
    await session.withTransaction(async () => {
      // 1. Concurrency guard & exclusive write lock on Course document:
      const course = await Course.findOneAndUpdate(
        { _id: courseId, ...NOT_DELETED },
        { $inc: { lockVersion: 1 } },
        { session, returnDocument: "after" }
      );
      if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
      // ... kiểm tra phụ thuộc và soft-delete ...
    });
    return result;
  } finally {
    if (session) await session.endSession();
  }
};
```

---

### 2.3. [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js)
* Bọc `createClass` trong `session.withTransaction` khi session khả dụng.
* Sử dụng `Course.findOneAndUpdate` với `$inc: { lockVersion: 1 }` để cùng tham gia khóa độc quyền với `deleteCourse`.

```javascript
// DÒNG 165-225
const createClass = async (teacherId, body = {}, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  if (!body.courseId) throw validationError("courseId is required");

  let session = null;
  if (mongoose.connection && mongoose.connection.readyState === 1 && typeof mongoose.startSession === "function") {
    try {
      session = await mongoose.startSession();
    } catch (e) {
      session = null;
    }
  }

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
      course = await getActiveCourse(body.courseId);
    }
    if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

    const cls = new Class({
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      status: "DRAFT",
      updatedBy: teacher._id,
    });
    applyCourse(cls, course);
    applyClassInput(cls, body);

    const gateResult = await validateClassGate({ ... });
    const snapshots = await captureClassSnapshots({ ... });
    Object.assign(cls, snapshots);

    await cls.save(sessionOpts);
    return cls.toObject();
  };

  if (session) {
    try {
      let created;
      await session.withTransaction(async () => {
        created = await executeCreate(session);
      });
      return created;
    } finally {
      await session.endSession();
    }
  } else {
    return await executeCreate(null);
  }
};
```

---

### 2.4. [`BackEnd/src/services/enrollmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js)
* Thêm kiểm tra Course của Class bên trong `session.withTransaction` của `createEnrollment`:

```javascript
// DÒNG 94-105
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

---

## 3. TÍNH TƯƠNG THÍCH NGHIỆP VỤ & BẢO TOÀN RANH GIỚI

1. **Nghiệp Vụ Contract Gate (CUR-10, TEA-12):** Không hề bị sửa đổi hay nới lỏng. Toàn bộ các bước kiểm tra giáo viên, môn học được duyệt (`TeacherSubjectAuthorization`), và hợp đồng hoạt động (`TEA-12`) vẫn chạy đúng vị trí ban đầu.
2. **Nghiệp Vụ CUR-09 Enrollment Snapshot:** Không bị thay đổi. Việc snapshot giá và syllabus version vào Enrollment vẫn được giữ nguyên vẹn từ `coursePricingPolicyService.buildEnrollmentSnapshotFromClass`.
3. **Các Dịch Vụ Thanh Toán & Quyết Toán (Tin):** Hoàn toàn không bị can thiệp.

