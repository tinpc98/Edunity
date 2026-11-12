# BÁO CÁO KỸ THUẬT: SYLLABUS VERSIONING & CURRICULUM UNIT (TASK CUR-02)

**Dự án:** Edunity V3 Platform  
**Task ID:** TASK CUR-02 — SyllabusVersion CurriculumUnit  
**Chế độ:** IMPLEMENTATION — PHASE 2  
**Kỹ sư thực hiện:** Senior Backend Engineer  
**Trạng thái:** COMPLETE (Hoàn thành 100%, 30/30 test cases `syllabusVersion.test.js` PASS; 7/7 suites sandbox 127/127 tests PASS)

---

## 1. TỔNG QUAN VÀ MỤC TIÊU TRIỂN KHAI

Nhiệm vụ **CUR-02** giải quyết triệt để tình trạng giáo trình hiện chỉ là một chuỗi văn bản phẳng (`Course.syllabus: String`) dễ bị ghi đè mất lịch sử khi chỉnh sửa khóa học:
1. **Phiên bản hóa giáo trình (`SyllabusVersion`)**: Triển khai vòng đời `DRAFT` $\rightarrow$ `PUBLISHED` $\rightarrow$ `ARCHIVED` gắn với `Course`, đánh số `versionNumber` tăng dần và duy nhất theo khóa học.
2. **Đơn vị bài học có cấu trúc (`CurriculumUnit`)**: Lưu trữ danh sách bài học (`unitOrder`, `title`, `description`, `learningObjectives`, `durationMinutes`, `topics`) gắn chặt với một `SyllabusVersion`, hỗ trợ CRUD và sắp xếp thứ tự an toàn.
3. **Bất biến bản đã publish (Published Immutability)**: Chặn mọi chỉnh sửa nội dung hoặc revert từ `PUBLISHED`/`ARCHIVED` về `DRAFT` ở cả tầng Service và Mongoose Schema Validation Hook (`409 SYLLABUS_VERSION_IMMUTABLE`), đồng thời chặn ghi đè `Course.syllabus` qua `PATCH /api/admin/courses/:id` một khi khóa học đã có `publishedSyllabusVersionId`.
4. **Transaction & Concurrency Safety**: Publish/Clone/Reorder thực thi trong MongoDB Transaction; dùng Partial Unique Index đảm bảo tối đa 1 phiên bản `PUBLISHED` cho mỗi khóa học; bắt lỗi `E11000` để trả mã `409` chuẩn hóa.
5. **Tương thích ngược & Migration**: Giữ nguyên `Course.syllabus`, endpoint công khai tự động fallback sang dữ liệu cũ khi khóa học chưa có phiên bản, và cung cấp engine migration `forward` / `backward` có `dry-run`, `preflight`, kiểm soát DB an toàn.

---

## 2. CHI TIẾT CÁC THAY ĐỔI VÀ KIẾN TRÚC

### 2.1. Models, Constants & Indexes
- [`BackEnd/src/models/constants.js`](file:///c:/CODE/Edunity/BackEnd/src/models/constants.js):
  - Bổ sung constant `SYLLABUS_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"]`.
- [`BackEnd/src/models/SyllabusVersion.js`](file:///c:/CODE/Edunity/BackEnd/src/models/SyllabusVersion.js) *(Mới)*:
  - Sử dụng `adminManagedPlugin` (`createdBy`, `updatedBy`) và `softDeletePlugin`.
  - Unique Index `{ courseId: 1, versionNumber: 1 }` chống trùng số phiên bản khi tạo đồng thời.
  - Partial Unique Index `{ courseId: 1 }` (`status: "PUBLISHED"`, `isDeleted: { $ne: true }`) bảo đảm mỗi `Course` chỉ có tối đa 1 giáo trình đang `PUBLISHED`.
  - Mongoose hook `post("init")` + `pre("validate")`: chặn sửa nội dung hoặc revert về `DRAFT` đối với bản `PUBLISHED`/`ARCHIVED` (`AppError` `409 SYLLABUS_VERSION_IMMUTABLE`), chỉ cho phép chuyển trạng thái `PUBLISHED` $\rightarrow$ `ARCHIVED` kèm metadata lưu trữ.
- [`BackEnd/src/models/CurriculumUnit.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CurriculumUnit.js) *(Mới)*:
  - Chứa `syllabusVersionId`, `courseId`, `unitOrder` ($\ge 1$), `title`, `description`, `learningObjectives`, `durationMinutes`, `topics`, `migratedFromLegacy`.
  - Partial Unique Index `{ syllabusVersionId: 1, unitOrder: 1 }` (`isDeleted: { $ne: true }`).
- [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js):
  - Bổ sung `publishedSyllabusVersionId: { type: Schema.Types.ObjectId, ref: "SyllabusVersion", default: null }`, giữ nguyên trường `syllabus`.
- [`BackEnd/src/models/index.js`](file:///c:/CODE/Edunity/BackEnd/src/models/index.js):
  - Re-export `SyllabusVersion` và `CurriculumUnit`.

### 2.2. Service Layer & Backward Compatibility
- [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js) *(Mới)*:
  - `createDraftVersion`: Tạo bản `DRAFT` mới (khởi tạo hoặc clone toàn bộ `CurriculumUnit` từ phiên bản trước trong transaction), ghi `AuditLog` (`SYLLABUS_VERSION_CREATED`).
  - `listVersions` / `getVersionDetail`: Truy vấn quản trị kèm kiểm tra IDOR (`courseId` khớp với `:versionId`).
  - `getPublishedSyllabus`: Endpoint công khai chỉ trả về bản `PUBLISHED`, ẩn các trường nội bộ (`publishedBy`, `archivedBy`, `createdBy`, `updatedBy`, `clonedFromVersionId`, `migratedFromLegacy`), fallback về `legacySyllabus` nếu khóa học chưa version hóa.
  - `updateDraftVersion`, `addUnit`, `updateUnit`, `deleteUnit`, `reorderUnits`: Tất cả đều kiểm tra trạng thái `DRAFT`, thực hiện two-phase offset (`+100000` $\rightarrow$ `bulkWrite`) khi sắp xếp lại `unitOrder` để tránh xung đột unique index tạm thời.
  - `publishVersion` & `archiveVersion`: Thực hiện nguyên tử trong transaction (archive bản `PUBLISHED` cũ, promote bản `DRAFT`, đồng bộ `Course.publishedSyllabusVersionId` + tóm tắt `Course.syllabus`, ghi `AuditLog`).
- [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js):
  - Trong `updateCourse`: chặn ghi đè `body.syllabus` (`409 SYLLABUS_VERSION_IMMUTABLE`) nếu khóa học đã được quản lý bởi `publishedSyllabusVersionId`; vẫn cho phép cập nhật các khóa học legacy chưa có `SyllabusVersion`.

### 2.3. Routes & Controllers (RBAC)
- [`BackEnd/src/controllers/courseCatalogController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js) & [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js):
  - **Public:** `GET /api/courses/:id/syllabus`
  - **Admin (`[authMiddleware, requireRole("ADMIN")]`):**
    - `GET /api/admin/courses/:id/syllabus-versions`
    - `POST /api/admin/courses/:id/syllabus-versions`
    - `GET /api/admin/courses/:id/syllabus-versions/:versionId`
    - `PATCH /api/admin/courses/:id/syllabus-versions/:versionId`
    - `POST /api/admin/courses/:id/syllabus-versions/:versionId/publish`
    - `POST /api/admin/courses/:id/syllabus-versions/:versionId/archive`
    - `POST /api/admin/courses/:id/syllabus-versions/:versionId/units`
    - `PATCH /api/admin/courses/:id/syllabus-versions/:versionId/units/:unitId`
    - `DELETE /api/admin/courses/:id/syllabus-versions/:versionId/units/:unitId`
    - `PUT /api/admin/courses/:id/syllabus-versions/:versionId/units/reorder`

### 2.4. Migration Script (Forward / Backward / Preflight / Dry-Run)
- [`BackEnd/scripts/migrateSyllabusVersions.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrateSyllabusVersions.js) *(Mới)*:
  - Bảo vệ DB production (`assertSafeMigrationTarget`), mặc định chạy `dryRun = true`.
  - `runSyllabusPreflight`: Kiểm tra trùng bản `PUBLISHED`, trùng `versionNumber`, bản ghi orphan trước khi migration.
  - `migrateForward`: Parse dòng `Course.syllabus` cũ thành `SyllabusVersion` v1 (`PUBLISHED`, `migratedFromLegacy: true`) + `CurriculumUnit`, liên kết `Course.publishedSyllabusVersionId` mà vẫn giữ nguyên `Course.syllabus`. Chạy lặp lại idempotent.
  - `migrateBackward`: Gỡ riêng các bản ghi đánh dấu `migratedFromLegacy: true` và khôi phục `Course.publishedSyllabusVersionId = null`, tuyệt đối giữ nguyên giáo trình do người dùng tự tạo và giữ nguyên `Course.syllabus`.

---

## 3. BẢNG ĐỐI SOÁT FILE ĐÃ THAY ĐỔI VÀ TẠO MỚI

| STT | File / Đường dẫn | Loại thay đổi | Chi tiết nội dung thay đổi |
| :---: | :--- | :---: | :--- |
| 1 | [`BackEnd/src/models/constants.js`](file:///c:/CODE/Edunity/BackEnd/src/models/constants.js) | Sửa đổi | Thêm `SYLLABUS_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"]`. |
| 2 | [`BackEnd/src/models/SyllabusVersion.js`](file:///c:/CODE/Edunity/BackEnd/src/models/SyllabusVersion.js) | Tạo mới | Schema `SyllabusVersion`, index unique/partial, hook bất biến `PUBLISHED`/`ARCHIVED`. |
| 3 | [`BackEnd/src/models/CurriculumUnit.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CurriculumUnit.js) | Tạo mới | Schema `CurriculumUnit`, index partial unique `{ syllabusVersionId, unitOrder }`. |
| 4 | [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js) | Sửa đổi | Bổ sung trường nullable `publishedSyllabusVersionId`. |
| 5 | [`BackEnd/src/models/index.js`](file:///c:/CODE/Edunity/BackEnd/src/models/index.js) | Sửa đổi | Export thêm `SyllabusVersion` và `CurriculumUnit`. |
| 6 | [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js) | Tạo mới | Logic version, clone, CRUD/reorder unit, publish/archive transaction, public view. |
| 7 | [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) | Sửa đổi | Guard `updateCourse` chặn ghi đè `syllabus` khi đã có `publishedSyllabusVersionId`. |
| 8 | [`BackEnd/src/controllers/courseCatalogController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js) | Sửa đổi | Bổ sung 11 controller handler cho public syllabus và admin version/unit APIs. |
| 9 | [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js) | Sửa đổi | Khai báo route công khai và nhóm route `ADMIN` với `[authMiddleware, requireRole("ADMIN")]`. |
| 10 | [`BackEnd/scripts/migrateSyllabusVersions.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrateSyllabusVersions.js) | Tạo mới | Migration engine forward/backward idempotent kèm `preflight`, `dryRun` và DB guard. |
| 11 | [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md) | Sửa đổi | Bổ sung ma trận lỗi, RBAC endpoints và mục `C03` cho SyllabusVersion & CurriculumUnit. |
| 12 | [`BackEnd/tests/syllabusVersion.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/syllabusVersion.test.js) | Tạo mới | Bộ kiểm thử tự động 30/30 test cases PASS (Schema, Hook, CRUD, Transaction, HTTP/RBAC/IDOR, Migration). |
| 13 | [`BackEnd/docs/cur-02-syllabus-version-report.md`](file:///c:/CODE/Edunity/BackEnd/docs/cur-02-syllabus-version-report.md) | Tạo mới | Báo cáo kỹ thuật hoàn thành Task CUR-02. |

---

## 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG

- **Suite CUR-02** (`tests/syllabusVersion.test.js`): **30/30 PASS** (3.501s).
- **Hồi quy toàn bộ sandbox suites (7 suites)**:
  - `academicContract.test.js`
  - `academicSeedIdempotent.test.js`
  - `backupRestoreClone.test.js`
  - `cronLockIdempotency.test.js`
  - `migrationPreflight.test.js`
  - `courseCurriculum.test.js`
  - `syllabusVersion.test.js`
  - **Tổng hợp:** **7/7 suites passed, 127/127 tests passed (4.096s)**.
- *Lưu ý môi trường:* Các suite sử dụng `MongoMemoryReplSet` (`platform.test.js`, `livekitAndRefundSafety.test.js`, ...) không chạy được bên trong sandbox Windows do giới hạn bind loopback port (`EACCES`); đã xác minh luồng Express HTTP đầy đủ thông qua in-memory dispatch trên `src/app.js` và Mongoose model validation trực tiếp.

