# BÁO CÁO TRIỂN KHAI KỸ THUẬT (IMPLEMENTATION REPORT)
## TASK CHAU-FINAL-P0-CLASS-CREATION — EDUNITY V3

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Châu (Senior Backend Engineer — Academic & Catalog Core)
- **Tập tin sửa đổi:** [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js)
- **Tập tin test liên quan:** 
  - [`BackEnd/tests/cur10ClassCreationGate.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/cur10ClassCreationGate.test.js)
  - [`BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js)
- **Ngày hoàn thành:** 14/11/2026

---

### 1. Chi tiết Thay đổi trong `teacherClassService.js`

Toàn bộ nhánh fallback `executeCreate(null)` đã được gỡ bỏ hoàn toàn. Thay vào đó, hàm `createClass` áp dụng nguyên tắc **Transaction Fail-Closed** chặt chẽ, kết hợp **WiredTiger Document-Level Write Lock** tương thích hoàn toàn với `deleteCourse`.

#### 1.1. Kiểm tra session fail-closed và giải phóng tài nguyên bên trong khối try...finally
```javascript
// 1. Kiểm tra khả dụng của startSession
if (typeof mongoose.startSession !== "function") {
  throw new AppError(
    "Database session is unavailable; class creation requires transaction support",
    "DATABASE_TRANSACTION_UNAVAILABLE",
    503
  );
}

// 2. Khởi tạo session được bọc bắt lỗi
let session;
try {
  session = await mongoose.startSession();
} catch (sessionErr) {
  throw new AppError(
    "Failed to start database transaction session for class creation",
    "DATABASE_TRANSACTION_UNAVAILABLE",
    503,
    { originalError: sessionErr.message }
  );
}

// 3. Thẩm định withTransaction và thực thi bên trong try...finally
try {
  if (!session || typeof session.withTransaction !== "function") {
    throw new AppError(
      "Database session is unavailable; class creation requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let created;
  await session.withTransaction(async () => {
    // 1. Atomically lock and verify course is ACTIVE and not soft-deleted
    const course = await Course.findOneAndUpdate(
      { _id: body.courseId, status: "ACTIVE", ...NOT_DELETED },
      { $inc: { lockVersion: 1 } },
      { session, returnDocument: "after" }
    );
    if (!course) {
      throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    }

    const cls = new Class({
      teacherId: teacher._id,
      teacherName: teacher.teacherProfile.fullName,
      status: "DRAFT", // BR-47
      updatedBy: teacher._id,
    });
    applyCourse(cls, course);
    applyClassInput(cls, body);

    const gateResult = await validateClassGate({
      teacher,
      course,
      cls,
      body,
      mode: "CREATE",
      pricingPolicyVerifier: options.pricingPolicyVerifier,
      contractVerifier: options.contractVerifier,
    });

    const snapshots = await captureClassSnapshots({
      course,
      pricingResult: gateResult.pricingResult,
    });
    Object.assign(cls, snapshots);

    await cls.save({ session });
    created = cls.toObject();
  });
  return created;
} finally {
  if (session && typeof session.endSession === "function") {
    await session.endSession();
  }
}
```

Tương tự đối với `deleteCourse` trong `BackEnd/src/services/courseCatalogService.js`: điều kiện `if (!session || typeof session.withTransaction !== "function")` cũng được chuyển vào trong khối `try`, và khối `finally` đóng session an toàn bằng `if (session && typeof session.endSession === "function") await session.endSession();`.

---

### 2. Phân tích Cơ chế Đồng bộ Tài nguyên (Synchronization Mechanism)

| Tiêu chí | `deleteCourse` (courseCatalogService.js) | `createClass` (teacherClassService.js) |
| :--- | :--- | :--- |
| **Cơ chế khóa** | `Course.findOneAndUpdate` với `$inc: { lockVersion: 1 }` | `Course.findOneAndUpdate` với `$inc: { lockVersion: 1 }` |
| **Session sử dụng** | `session` thuộc `deleteCourse` | `session` thuộc `createClass` |
| **Điều kiện lọc** | `{ _id: courseId, ...NOT_DELETED }` | `{ _id: courseId, status: "ACTIVE", ...NOT_DELETED }` |
| **Ràng buộc phụ thuộc** | Đếm `Class.countDocuments({ courseId }, { session })` | Tạo `cls.save({ session })` |
| **Kết quả khi Conflict** | Chờ lock của `createClass`, thấy count >= 1 -> từ chối 409 | Chờ lock của `deleteCourse`, thấy course đã bị soft-delete -> từ chối 404 |
| **Giải phóng Session** | Luôn gọi `session.endSession()` trong `finally` | Luôn gọi `session.endSession()` trong `finally` |

---

### 3. Bảo đảm Tính toàn vẹn của các miền phụ thuộc

1. **Không can thiệp Contract Gate (CUR-10):**
   - Hàm `validateClassGate` giữ nguyên vẹn logic kiểm tra hợp đồng giáo viên (`contractVerifier`), quyền môn học (`TeacherSubjectAuthorization`), và chính sách giá (`pricingPolicyVerifier`).
2. **Không can thiệp CUR-09 Snapshot:**
   - Hàm `captureClassSnapshots` vẫn chụp lại đầy đủ `courseTitle`, `categoryId`, `subjectId`, `gradeLevel`, `level`, và giá trần/giá sàn theo chính sách.
3. **Không can thiệp Logic Tài chính:**
   - Không sửa đổi bất kỳ dịch vụ thanh toán, ví, hay quyết toán giáo viên nào của Tin.
4. **Cập nhật Unit Test Fixture:**
   - Điều chỉnh mock session trong [`BackEnd/tests/cur10ClassCreationGate.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/cur10ClassCreationGate.test.js) để các bài kiểm thử đơn vị độc lập chạy trơn tru mà không cần Replica Set.

