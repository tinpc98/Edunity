# 03. CROSS-TEAM HANDOVER SPECIFICATION — TIN (CORE / STUDENT / ENROLLMENT / FINANCE)

- **Người nhận bàn giao:** **Tin** (Student, Enrollment, Reservations, Scholarship Financial Allocation `AID-06`)
- **Phạm vi file Tin quản lý:** [`BackEnd/src/services/enrollmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js) (và module cấp quỹ `AID-06` tương ứng)
- **Nguyên tắc:** Châu **không** chỉnh sửa bất kỳ file nào của Tin. Tài liệu này cung cấp đúng chữ ký hàm, schema fields, bất biến giao dịch và test tích hợp để Tin đấu nối trực tiếp.

---

## 1. `DEP-TIN-01`: `CUR-09` — Bổ sung Immutable Snapshot vào `Enrollment`

### 1.1. Tình trạng hiện có (Châu đã hoàn tất)
1. **Model [`Class.js:16-30`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js#L16-L30):** Đã có sẵn 6 trường snapshot (`syllabusVersionId`, `syllabusVersionNumber`, `pricingPolicyId`, `pricingPolicyKey`, `pricingPolicyVersion`, `pricingPolicySnapshot`) với kiểu `Decimal128` cho `minPrice`, `maxPrice`.
2. **Model [`Enrollment.js:12-30`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js#L12-L30):** Đã khai báo đầy đủ 6 trường snapshot tương ứng (đều `default: null` để tương thích ngược 100% với bản ghi cũ).
3. **Helper chuẩn xác tại [`coursePricingPolicyService.js:825-861`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js#L825-L861)** (cũng được re-export tại [`classCreationGateService.js:317`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js#L317)):
   `buildEnrollmentSnapshotFromClass(cls)`

### 1.2. Vị trí & Đoạn mã Tin cần bổ sung trong `enrollmentService.js`
Kiểm tra tại [`enrollmentService.js:117-131`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js#L117-L131):
1. Import ở đầu file:
   ```javascript
   const { buildEnrollmentSnapshotFromClass } = require("./coursePricingPolicyService");
   ```
2. Trong `session.withTransaction(...)` của `createEnrollment`, ngay trước `new Enrollment({ ... })` (tại [`enrollmentService.js:117-128`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js#L117-L128)):
   ```javascript
   // 5. Create Enrollment (copy immutable CUR-09 snapshots from targetClass)
   const cur09Snapshot = buildEnrollmentSnapshotFromClass(targetClass);
   const enrollmentDoc = new Enrollment({
     classId: targetClass._id,
     courseId: targetClass.courseId,
     teacherId: targetClass.teacherId,
     studentId: studentId,
     enrollmentStatus,
     paymentSource,
     tuitionAmount,
     enrolledAt: now,
     holdExpiresAt,
     ...cur09Snapshot,
   });
   ```

### 1.3. Ràng buộc bất biến & Lỗi cần tránh
- **Copy 1 lần duy nhất lúc tạo `Enrollment`:** Tuyệt đối không ghi đè/đồng bộ lại `syllabusVersionId`, `syllabusVersionNumber`, `pricingPolicyVersion` hay `pricingPolicySnapshot` nếu sau này `Course` publish `SyllabusVersion` mới hoặc Admin cập nhật/rollback `CoursePricingPolicy`.
- **Legacy Class Fallback:** Nếu `targetClass` được tạo trước `CUR-09` (các trường snapshot là `null`), `buildEnrollmentSnapshotFromClass(targetClass)` trả toàn bộ `null` — **không** chặn student ghi danh.
- **`Decimal128` Parity:** `pricingPolicySnapshot.minPrice` và `maxPrice` được lưu ở dạng `Decimal128` khớp schema [`Enrollment.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js).

### 1.4. Checklist Acceptance Test Tin cần bổ sung sau khi nối `DEP-TIN-01`
1. Tạo `Course` + `SyllabusVersion` v1 (`PUBLISHED`) + `CoursePricingPolicy` v1 (`ACTIVE`) → tạo/mở `Class`.
2. Đóng vai `Student` gọi `POST /api/classes/:classId/enrollments` → xác nhận `Enrollment` mới lưu đúng `syllabusVersionId`, `syllabusVersionNumber: 1`, `pricingPolicyVersion: 1`, `pricingPolicySnapshot.minPrice`/`maxPrice`.
3. Publish `SyllabusVersion` v2 trên `Course` + tạo `CoursePricingPolicy` v2 (`SUPERSEDED` v1) → xác nhận `Enrollment` đã tạo trước đó vẫn giữ nguyên v1 (`syllabusVersionNumber: 1`, `pricingPolicyVersion: 1`).

---

## 2. `DEP-TIN-02`: `AID-06` — Ranh giới Duyệt Hồ sơ Phi Tài chính (`DOSSIER_VERIFIED`) & Cấp phát Quỹ Học bổng

### 2.1. Luồng phân tách trách nhiệm (Separation of Duties)
1. **Phần của Châu (`AID-01` & `AID-04`):**
   - API `POST /api/admin/scholarship-applications/:id/verify-dossier` ([`scholarshipRoutes.js:48`](file:///c:/CODE/Edunity/BackEnd/src/routes/scholarshipRoutes.js#L48), [`scholarshipService.js:978-1059`](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipService.js#L978-L1059)) kiểm tra:
     - Thông tin bắt buộc (`guardianInfo`, `schoolInfo`),
     - Tiến độ checklist online (`VerificationDocument`) + biên nhận giấy (`PaperDossierReceipt` `RECONCILED`, không còn `DISCREPANCY`),
     - Cổng đồng thuận người giám hộ `AID-08` (fail-closed `503 CONSENT_DEPENDENCY_BLOCKED` nếu campaign bật `requireGuardianConsentForMinor`).
   - Chốt trạng thái **`DOSSIER_VERIFIED`** bằng Compare-And-Swap `{ _id, status: "SUBMITTED" }`, ghi `AuditLog`, **tuyệt đối KHÔNG đụng số dư `Scholarship`, `allocatedAmount` hay `Transaction`** (`{ financialAllocated: false, readyForAid06GrantReview: true }`).
2. **Phần của Tin (`AID-06`):**
   - Chiến dịch V3 (`documentChecklist.length > 0` hoặc `dossierPolicy.requireGuardianInfo/requireSchoolInfo/requireGuardianConsentForMinor`) **chỉ được cấp quỹ/tạo `Scholarship`** khi hồ sơ đạt `status === "DOSSIER_VERIFIED"`.
   - Khi cấp quỹ, cần thực hiện trong `MongoDB` replica-set `withTransaction`, trừ ngân sách khả dụng chiến dịch có điều kiện nguyên tử (`allocatedAmount + award <= fundedAmount`), chuyển trạng thái hồ sơ sang `"APPROVED"`, tạo `Scholarship` và gắn phần chi trả đúng chuẩn `Decimal128`.
3. **Lưu ý về Endpoint Legacy `POST /api/admin/scholarship-applications/:id/approve` (`scholarshipService.js:1152+`):**
   - Hiện hỗ trợ cả `SUBMITTED` (chỉ chiến dịch legacy không bật V3) và `DOSSIER_VERIFIED`.
   - Đã khóa cứng chặn bypass: mọi chiến dịch V3 không đủ checklist / paper discrepancy chưa xử lý / thiếu consent sẽ bị từ chối (`409` / `503`), không thể dùng `/approve` để nhảy cóc quy trình `AID-01`/`AID-04`.

### 2.2. Dữ liệu & Trạng thái lỗi cần đồng bộ với `AID-06`
- Trạng thái đầu vào hợp lệ cho `AID-06`: `ScholarshipApplication.status === "DOSSIER_VERIFIED"`.
- Index duy nhất cần tôn trọng: `ScholarshipApplication` có partial unique index trên `{ studentId: 1, campaignId: 1 }` cho `{ status: { $in: ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"] } }` — không tạo nhiều đơn trùng cùng student + campaign.
- Nếu chiến dịch dùng V3 nhưng hồ sơ mới ở `"DRAFT"` hoặc `"SUBMITTED"` / `"NEED_MORE_INFORMATION"`, `AID-06` phải trả về `409` (`DOSSIER_NOT_VERIFIED` hoặc `APPLICATION_NOT_REVIEWABLE`), không tự ý ép trạng thái.

