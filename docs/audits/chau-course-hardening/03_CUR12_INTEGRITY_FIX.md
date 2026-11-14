# 03_CUR12_INTEGRITY_FIX.md — Giải Pháp Gia Cố Tính Toàn Vẹn Snapshot Giáo Trình (CUR-12)

**Dự án:** Edunity V3  
**Người phụ trách:** Châu  
**Tập tin chỉnh sửa:** [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js)  
**Trạng thái:** ĐÃ HOÀN THÀNH & VERIFIED  

---

## 1. MỤC TIÊU THIẾT KẾ

Yêu cầu nghiệp vụ cốt lõi của CUR-12 trong Edunity V3:
1. Khi một Lớp học (`Class`) được kích hoạt, lớp học phải được gắn chặt (immutable snapshot) với một phiên bản giáo trình cụ thể (`SyllabusVersion`).
2. Khóa học (`Course`) có thể tiếp tục được biên soạn, cập nhật, xuất bản các phiên bản mới (V2, V3...), hoặc thậm chí chuyển sang trạng thái `INACTIVE`, nhưng Lớp học cũ **bắt buộc** phải luôn đọc chính xác phiên bản giáo trình đã được chốt (snapshot) khi lớp thành lập.
3. Không bao giờ được tự ý fallback về giáo trình mới nhất (latest/published).
4. Phải bảo vệ tính toàn vẹn dữ liệu: phát hiện ngay nếu snapshot trỏ nhầm sang Course khác hoặc sai lệch Version Number.
5. Kiểm soát quyền truy cập (RBAC) nghiêm ngặt, an toàn trước giá trị `null`/`undefined` của `teacherId`.

---

## 2. CHI TIẾT CẢI TIẾN TRONG `getClassSyllabus`

### 2.1. Xử Lý An Toàn `teacherId` (Safe Null Handling)

Mã nguồn trước đây:
```javascript
const isTeacherOwner = Boolean(user && user.id === classDoc.teacherId.toString());
```
Gây ra `TypeError` làm crash hệ thống nếu lớp học chưa có giáo viên (`teacherId === null || teacherId === undefined`).

Mã nguồn mới đã được gia cố:
```javascript
const isAdmin = Boolean(user && user.role === "ADMIN");
const isTeacherOwner = Boolean(
  user && classDoc.teacherId && user.id === classDoc.teacherId.toString()
);
```
Với cơ chế kiểm tra `classDoc.teacherId` trước khi gọi `.toString()`, hệ thống hoạt động hoàn toàn an toàn ngay cả với lớp học mồ côi (chưa gán giáo viên) hoặc lớp template hệ thống.

### 2.2. Chính Sách RBAC Thống Nhất cho Trạng Thái Non-Public

Quy chuẩn kiểm soát quyền truy nhập cho syllabus snapshot:
1. **Trạng thái công khai (`PUBLIC_STATUSES`):** `["OPEN", "IN_PROGRESS", "COMPLETED"]`. Bất kỳ ai (kể cả khách vãng lai unauthenticated) đều có thể xem giáo trình của lớp học để tìm hiểu và đăng ký.
2. **Trạng thái nhạy cảm / Đang biên tập / Xét duyệt:** `["DRAFT", "PENDING_APPROVAL", "REJECTED"]`.
   - **Chỉ duy nhất** Giáo viên chủ lớp (`isTeacherOwner`) và Quản trị viên (`isAdmin`) mới có quyền truy cập.
   - Nếu chưa đăng nhập: Trả về mã lỗi `401 UNAUTHORIZED`.
   - Nếu là học viên hoặc giáo viên khác: Trả về mã lỗi `403 FORBIDDEN`.
3. **Các trạng thái không công khai khác (ví dụ: `CANCELLED`):**
   - Cho phép Quản trị viên, Giáo viên chủ lớp, và các Học viên đã có ghi danh hợp lệ (`PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`) xem lại tài liệu học tập của lớp.

```javascript
// Unified RBAC policy
if (["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(classDoc.status)) {
  if (!isAdmin && !isTeacherOwner) {
    if (!user) {
      throw new AppError("Authentication required to view non-public class syllabus", "UNAUTHORIZED", 401);
    }
    throw new AppError("You do not have permission to view this class syllabus", "FORBIDDEN", 403);
  }
}
```

### 2.3. Quy Tắc "Zero-Fallback" Chặt Chẽ

Nếu lớp học thiếu thông tin snapshot (`syllabusVersionId` là `null` hoặc `undefined`), service lập tức ném ra lỗi cấu trúc, tuyệt đối không đoán mò hoặc fallback về `course.publishedSyllabusVersionId`:
```javascript
if (!classDoc.syllabusVersionId) {
  throw new AppError(
    "Class does not have a linked syllabus version snapshot",
    "CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND",
    404
  );
}
```

### 2.4. Xác Minh Toàn Vẹn Khóa Học Chéo (`Cross-Course Mismatch`)

Ngăn chặn trường hợp `classDoc.syllabusVersionId` bị trỏ nhầm sang phiên bản giáo trình thuộc về một khóa học hoàn toàn khác:
```javascript
const versionCourseId = version.courseId ? version.courseId.toString() : null;
const classCourseId = classDoc.courseId ? classDoc.courseId.toString() : null;
if (!versionCourseId || versionCourseId !== classCourseId) {
  throw new AppError(
    "Syllabus version does not belong to the class course",
    "SYLLABUS_VERSION_COURSE_MISMATCH",
    409
  );
}
```

### 2.5. Xác Minh Tính Nhất Quán của Version Number

Nếu bản ghi lớp học có lưu số hiệu phiên bản (`syllabusVersionNumber !== null && syllabusVersionNumber !== undefined`), service kiểm tra tính đồng nhất với `version.versionNumber`. Nếu có bất kỳ sai lệch nào:
```javascript
if (
  classDoc.syllabusVersionNumber !== null &&
  classDoc.syllabusVersionNumber !== undefined &&
  version.versionNumber !== classDoc.syllabusVersionNumber
) {
  throw new AppError(
    `Syllabus version number mismatch: expected ${classDoc.syllabusVersionNumber}, found ${version.versionNumber}`,
    "SYLLABUS_VERSION_NUMBER_MISMATCH",
    409
  );
}
```

---

## 3. BẰNG CHỨNG KIỂM CHỨNG TỰ ĐỘNG

Bộ test `BackEnd/tests/courseLifecycleCur12.test.js` đã bổ sung đầy đủ các kịch bản kiểm chứng:
- `CUR-12.5`: Trả về `409 SYLLABUS_VERSION_COURSE_MISMATCH` khi `version.courseId` khác `class.courseId` -> **PASS**.
- `CUR-12.6`: Trả về `409 SYLLABUS_VERSION_NUMBER_MISMATCH` khi versionNumber không khớp -> **PASS**.
- `CUR-12.7`: Kiểm tra `teacherId = null` không gây ra TypeError, xử lý đúng cho cả lớp OPEN và DRAFT -> **PASS**.
- `CUR-12.8`: Kiểm tra thống nhất RBAC cho `PENDING_APPROVAL` và `REJECTED` (Guest 401, Student 403, Teacher Owner 200, Admin 200) -> **PASS**.

