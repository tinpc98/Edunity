# 01_ROOT_CAUSE.md — Phân Tích Nguyên Nhân Gốc Rễ Lỗ Hổng Vòng Đời Khóa Học & Snapshot

**Dự án:** Edunity V3 — Backend Đào tạo & Vòng đời Khóa học  
**Người phụ trách:** Châu  
**Ngày hoàn thiện:** 13/11/2026  
**Chế độ:** Hardening Audit & Root Cause Analysis  

---

## 1. BỐI CẢNH & PHẠM VI

Sau khi hoàn thành đợt triển khai ban đầu cho `CUR-04` (Admin Course Management), `CUR-12` (Syllabus Snapshot), và `Course Safe Delete`, kiểm tra chi tiết mã nguồn phát hiện các điểm rủi ro tiềm ẩn (P0/P1) về:
1. Tính nguyên tử (atomicity) và tính bảo toàn dữ liệu tài chính trong `deleteCourse`.
2. Lỗ hổng nuốt lỗi audit log và cửa sổ race condition khi tạo Class đồng thời.
3. Rủi ro crash tiến trình do `TypeError` khi `teacherId` mang giá trị `null`/`undefined`.
4. Thiếu xác thực toàn vẹn giữa `Class` và `SyllabusVersion` (mismatch courseId/versionNumber).

---

## 2. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 2.1. P0 — Course Safe Delete (`courseCatalogService.js`)

#### Lỗ hổng 1: Thiếu tính Nguyên tử (Atomicity) & Transaction Rollback
- **Mã nguồn cũ:** Thao tác cập nhật `course.isDeleted = true`, `SyllabusVersion.updateMany(...)`, và `CurriculumUnit.updateMany(...)` được thực thi tuần tự nhưng không liên kết qua session MongoDB transaction.
- **Hệ quả:** Nếu có lỗi xảy ra ở bước cuối hoặc process bị kill đột ngột, `Course` đã bị đánh dấu xóa nhưng `SyllabusVersion`/`CurriculumUnit` vẫn còn nguyên vẹn, gây trạng thái dữ liệu "nửa xóa nửa tồn tại" (inconsistent partial state).

#### Lỗ hổng 2: Nuốt lỗi AuditLog (`Silently Swallowing Audit Error`)
- **Mã nguồn cũ:**
  ```javascript
  try {
    await audit({ ... });
  } catch (err) {
    // Bị nuốt lỗi, không throw ra ngoài
  }
  ```
- **Hệ quả:** Vi phạm nghiêm trọng chuẩn bảo mật và kiểm toán (Compliance & Auditability). Nếu hệ thống ghi log gặp sự cố hoặc bảng `AuditLog` bị khóa, hành động xóa khóa học của Admin vẫn thành công mà không để lại bất kỳ dấu vết kiểm toán nào.

#### Lỗ hổng 3: Cửa sổ Race Condition giữa Kiểm tra Dependency và Tạo Lớp Mới
- **Kịch bản:**
  - Tuyến trình A (Admin): Gọi `deleteCourse(courseId)`. Service kiểm tra `Class.countDocuments({ courseId })` và thấy bằng `0`.
  - Tiến trình B (Teacher): Ngay thời điểm sau khi bước kiểm tra của A hoàn tất, Teacher gọi `createClass` chọn `courseId` này (vì lúc đó `course.status` vẫn đang là `ACTIVE`). Lớp học mới được tạo thành công.
  - Tiến trình A: Tiếp tục thực thi soft-delete khóa học.
- **Hệ quả:** Một khóa học vừa bị soft-deleted lại đang chứa một lớp học mới toanh vừa mở tuyển sinh, gây xung đột nghiệp vụ nghiêm trọng.

#### Lỗ hổng 4: Thiếu Rào chắn Dependency Tài chính (`SessionRefundReview`)
- **Mã nguồn cũ:** Chỉ kiểm tra `Class`, `Enrollment`, `ScholarshipCampaign`, `LearningPath`, `CoursePricingPolicy`. Không kiểm tra model `SessionRefundReview`.
- **Hệ quả:** Các trường hợp hoàn tiền, khiếu nại tài chính đang chờ giải quyết hoặc lịch sử tranh chấp của buổi học thuộc khóa học đó có nguy cơ mất liên kết nghiệp vụ với Course cha.

---

### 2.2. P1 — CUR-12 Syllabus Snapshot Integrity (`syllabusService.js`)

#### Lỗ hổng 1: Crash `TypeError` khi `teacherId` mang giá trị `null` hoặc `undefined`
- **Mã nguồn cũ:**
  ```javascript
  const isTeacherOwner = Boolean(user && user.id === classDoc.teacherId.toString());
  ```
- **Hệ quả:** Trong thực tế, các lớp học ở trạng thái `DRAFT` vừa tạo từ template, hoặc các lớp hệ thống chưa gán giáo viên chính thức thì `classDoc.teacherId` có thể là `null` hoặc `undefined`. Lệnh gọi `.toString()` trực tiếp dẫn tới `TypeError: Cannot read properties of undefined/null (reading 'toString')`, làm crash HTTP request và trả về lỗi 500 INTERNAL_SERVER_ERROR.

#### Lỗ hổng 2: Thiếu Ràng buộc Toàn vẹn Khóa học chéo (`Cross-Course Syllabus Mismatch`)
- **Mã nguồn cũ:** `getClassSyllabus` chỉ truy vấn `SyllabusVersion.findOne({ _id: classDoc.syllabusVersionId })`. Nếu dữ liệu snapshot trỏ nhầm sang version của một Course khác, hệ thống vẫn nạp và trả về cho học viên/giáo viên nội dung bài học không hề thuộc về môn học đó.

#### Lỗ hổng 3: Thiếu Xác minh Phiên bản (`Version Number Mismatch`)
- **Mã nguồn cũ:** Khi `classDoc.syllabusVersionNumber` được lưu lại tại thời điểm chốt hợp đồng đào tạo (ví dụ Version 1), nếu snapshot ID trỏ sang Version 2 hoặc 3, hệ thống không so khớp lại, dẫn đến học viên học sai chương trình đào tạo đã thỏa thuận.

#### Lỗ hổng 4: Chính sách RBAC Chưa Đồng Nhất cho các Trạng Thái Non-Public
- **Mã nguồn cũ:** Các trạng thái `PENDING_APPROVAL`, `REJECTED`, `DRAFT` áp dụng logic kiểm tra rời rạc, có nguy cơ để lọt học viên hoặc giáo viên khác xem trước nội dung giáo trình đang trong quá trình xét duyệt bản quyền hoặc đã bị từ chối phê duyệt.

---

## 3. KẾT LUẬN & ĐỊNH HƯỚNG KHẮC PHỤC

Tất cả các nguyên nhân gốc rễ trên xuất phát từ việc thiếu atomic lock và thiếu validation chặt chẽ ở ranh giới service. Các giải pháp kỹ thuật cần được triển khai ngay lập tức:
1. Đưa transaction MongoDB vào `deleteCourse`, bổ sung rào chắn `SessionRefundReview`, cơ chế atomic pre-lock trạng thái `INACTIVE`, và propagate audit log errors.
2. Gia cố `getClassSyllabus` với safe navigation cho `teacherId`, xác minh `courseId` và `versionNumber`, chuẩn hóa RBAC cho trạng thái non-public.

