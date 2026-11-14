# BÁO CÁO 03: TRUY XUẤT GIÁO TRÌNH SNAPSHOT THEO LỚP HỌC (TASK CUR-12 SYLLABUS SNAPSHOT API)

- **Dự án:** Edunity V3
- **Chế độ:** IMPLEMENTATION REPORT & AUDIT VERIFICATION
- **Người thực hiện:** Châu (Senior Backend Engineer)
- **Thời gian lập:** 13/11/2026

---

## 1. MỤC TIÊU VÀ NGUYÊN TẮC BẢO VỆ SNAPSHOT

Một khóa học (`Course`) theo thời gian sẽ tiến hóa nội dung qua nhiều phiên bản giáo trình (`SyllabusVersion` V1, V2, V3...). Tuy nhiên, khi một lớp học (`Class`) được mở ra, nội dung giảng dạy của lớp đó phải **bất biến và trung thực** theo đúng phiên bản giáo trình đã được chốt tại thời điểm mở lớp.

### Các nguyên tắc bắt buộc:
1. **Không Fallback sang bản mới nhất (No Fallback to Latest):** Lớp học mở theo V1 thì học viên của lớp đó mãi mãi học theo V1. Kể cả khi Course đã xuất bản V2 hay V3, API của lớp học vẫn phải trả về chính xác V1.
2. **Độc lập với trạng thái Khóa học:** Kể cả khi Course cha bị chuyển sang `INACTIVE` (ngừng tuyển sinh mới), các lớp học cũ đang chạy hoặc đã kết thúc vẫn phải đọc được đầy đủ giáo trình hợp lệ của mình.
3. **Không suy đoán dữ liệu thiếu:** Nếu một lớp học cũ thiếu trường snapshot (`syllabusVersionId = null`), hệ thống phải trả về mã lỗi cấu trúc `404 CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND`, tuyệt đối không được tự ý "đoán" hoặc lấy tạm phiên bản khác đắp vào.
4. **Kiểm soát quyền truy cập theo ngữ cảnh (Contextual RBAC):** 
   - Với lớp đã công khai (`OPEN`, `IN_PROGRESS`, `COMPLETED`): Cho phép học viên, giáo viên và khách vãng lai xem trước lộ trình bài học.
   - Với lớp chưa công khai (`DRAFT`, `PENDING_APPROVAL`, `REJECTED`): Chỉ Giáo viên chủ nhiệm của lớp hoặc Admin mới có quyền xem giáo trình.

---

## 2. TRUY VẾT DỮ LIỆU: CLASS → SYLLABUSVERSION → CURRICULUMUNIT

```mermaid
classDiagram
    class Class {
        +ObjectId _id
        +ObjectId courseId
        +String className
        +String status
        +ObjectId syllabusVersionId
        +Number syllabusVersionNumber
    }

    class SyllabusVersion {
        +ObjectId _id
        +ObjectId courseId
        +Number versionNumber
        +String title
        +String summary
        +String status
        +Date publishedAt
    }

    class CurriculumUnit {
        +ObjectId _id
        +ObjectId syllabusVersionId
        +ObjectId courseId
        +Number unitOrder
        +String title
        +String description
        +Number durationMinutes
        +Array topics
    }

    Class --> SyllabusVersion : "syllabusVersionId (Snapshot pointer)"
    SyllabusVersion --> CurriculumUnit : "1 - N (Ordered Units)"
```

- Schema [`Class`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js#L76-L82) lưu trữ con trỏ `syllabusVersionId` và số thứ tự phiên bản `syllabusVersionNumber`.
- Bản ghi `SyllabusVersion` lưu metadata của phiên bản (tiêu đề, tóm tắt, ngày xuất bản).
- Các bản ghi `CurriculumUnit` chứa chi tiết từng bài học/chuyên đề, thời lượng (`durationMinutes`) và danh sách chủ đề (`topics`), được sắp xếp theo thứ tự tăng dần `unitOrder: 1`.

---

## 3. HIỆN THỰC KỸ THUẬT

### 3.1. Middleware `optionalAuth`
Trong file [`BackEnd/src/middlewares/authMiddleware.js`](file:///c:/CODE/Edunity/BackEnd/src/middlewares/authMiddleware.js):
```javascript
const optionalAuth = async (req, res, next) => {
  const hasAuthHeader = Boolean(req.headers["authorization"]);
  const hasTestHeader = process.env.NODE_ENV === "test" && Boolean(req.headers["x-user-id"] || req.headers["x-user-role"]);
  if (!hasAuthHeader && !hasTestHeader) {
    return next();
  }
  return authMiddleware(req, res, next);
};
```
Middleware này cho phép các request không có header đăng nhập đi qua an toàn để phục vụ việc xem giáo trình của các lớp học công khai, nhưng đồng thời trích xuất được `req.user` khi có token để phục vụ kiểm tra phân quyền nâng cao.

### 3.2. Service Truy xuất Giáo trình Lớp học (`getClassSyllabus`)
Trong file [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js):
```javascript
const getClassSyllabus = async (classId, user = null) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const { Class, Enrollment } = require("../models");
  const classDoc = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!classDoc) throw new AppError("Class not found", "CLASS_NOT_FOUND", 404);

  // 1. Kiểm tra quyền truy cập theo vai trò và trạng thái lớp
  const PUBLIC_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED"];
  const isPublic = PUBLIC_STATUSES.includes(classDoc.status);
  const isAdmin = user && user.role === "ADMIN";
  const isTeacherOwner = user && user.id === classDoc.teacherId.toString();

  if (!isPublic && !isAdmin && !isTeacherOwner) {
    let isEnrolled = false;
    if (user && user.role === "STUDENT") {
      isEnrolled = await Enrollment.exists({
        classId: classDoc._id,
        studentId: user.id,
        enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] },
      });
    }
    if (!isEnrolled) {
      if (!user) {
        throw new AppError("Authentication required to view non-public class syllabus", "UNAUTHORIZED", 401);
      }
      throw new AppError("You do not have permission to view this class syllabus", "FORBIDDEN", 403);
    }
  }

  // 2. Chốt chặn bắt buộc: Lớp phải có snapshot giáo trình
  if (!classDoc.syllabusVersionId) {
    throw new AppError(
      "Class does not have a linked syllabus version snapshot",
      "CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND",
      404
    );
  }

  // 3. Đọc đúng phiên bản được Class tham chiếu (kể cả khi Course INACTIVE hoặc Version ARCHIVED)
  const version = await SyllabusVersion.findOne({
    _id: classDoc.syllabusVersionId,
    ...NOT_DELETED,
  }).lean();

  if (!version) {
    throw new AppError("Referenced syllabus version not found", "SYLLABUS_VERSION_NOT_FOUND", 404);
  }

  // 4. Lấy danh sách bài học thuộc đúng phiên bản đó
  const units = await CurriculumUnit.find({
    syllabusVersionId: version._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();

  return {
    classId: classDoc._id,
    className: classDoc.className,
    courseId: classDoc.courseId,
    courseTitle: classDoc.courseTitle,
    syllabusVersionId: version._id,
    versionNumber: version.versionNumber,
    title: version.title,
    summary: version.summary || "",
    status: version.status,
    publishedAt: version.publishedAt || null,
    units: units.map(toPublicCurriculumUnit),
  };
};
```

---

## 4. BẰNG CHỨNG KIỂM THỬ BẮT BUỘC (MANDATORY TESTS)

Toàn bộ 4 kịch bản bắt buộc đã được kiểm chứng tự động và **100% PASS** trong [`BackEnd/tests/courseLifecycleCur12.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/courseLifecycleCur12.test.js):

1. **Class dùng V1, Course ra V2:**
   - Fixture: Class gắn `syllabusVersionId = V1._id`. Course đã có bản ghi V2.
   - Kết quả: `GET /api/classes/:id/syllabus` trả về đúng V1 (`versionNumber: 1`), bài học của V1. Không hề bị trôi sang V2.
2. **Course chuyển sang INACTIVE:**
   - Fixture: Khóa học bị Admin đánh dấu `status: "INACTIVE"`.
   - Kết quả: Lớp học cũ vẫn gọi API thành công và nhận đủ giáo trình V1 kèm danh sách `units`.
3. **Class thiếu snapshot giáo trình:**
   - Fixture: `classDoc.syllabusVersionId = null`.
   - Kết quả: Ném lỗi `404 CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND`, bảo đảm không fallback sang bản mới nhất.
4. **Phân quyền lớp DRAFT:**
   - Giáo viên chủ nhiệm (`TEACHER`) và `ADMIN` xem được giáo trình (`200 OK`).
   - Học viên ngoài lớp hoặc người chưa đăng nhập bị từ chối (`403 FORBIDDEN` / `401 UNAUTHORIZED`).

