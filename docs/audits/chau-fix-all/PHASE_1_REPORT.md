# PHASE 1 REPORT — CURRICULUM, SYLLABUS, LEARNING PATHS, PROPOSALS & PRICING POLICY (`CUR-01`, `CUR-02`, `CUR-03`, `CUR-05`, `CUR-07`)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 1 & Phạm vi sửa lỗi

1. **CUR-01 (`Course` & Catalog):** Khắc phục truy vấn thiếu `NOT_DELETED`, đồng bộ `Course.level` xuống `Class` ở trạng thái `DRAFT`/`REJECTED`, map `E11000` duplicate slug sang `409 DUPLICATE_SLUG`.
2. **CUR-02 (`SyllabusVersion` & `CurriculumUnit`):** Sửa thiếu `.session(session)` trong giao dịch ReplSet, bọc `migrateForward` trong `jobLock.runExclusive`, chứng minh CRUD/publish/clone/archive/immutability/migration bằng MongoMemoryReplSet thật không mock.
3. **CUR-03 (`LearningPath`):** Thiết kế & triển khai mới toàn bộ model `LearningPath`, service CRUD/publish/archive/soft-delete với DAG prerequisite cycle validator + lọc redaction cho public/student, controller/routes, schema/contract/preflight.
4. **CUR-05 (`CourseProposal`):** Bổ sung `syllabusDraft`, `pricingExpectation`, `submittedAt`, append-only `revisionHistory[]`, lọc redaction `actorId` cho Teacher, transactional tạo `SyllabusVersion` v1 + `CurriculumUnit` khi duyệt đề xuất.
5. **CUR-07 (`CoursePricingPolicy`):** Xây dựng model & service quản trị chính sách học phí/số buổi theo version (`COURSE > SUBJECT > CATEGORY > GLOBAL`), `Decimal128`, `effectiveFrom`/`effectiveTo`, activate/rollback/archive, `verifyClassPricingPolicy` sẵn sàng để tích hợp vào `CUR-10` ở Phase 2, cùng Teacher safe policy view (`GET /api/teacher/courses/:courseId/pricing-policy`) và Admin API (`/api/admin/pricing-policies*`).

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| Schema & Enum | [`BackEnd/src/models/constants.js`](file:///c:/CODE/Edunity/BackEnd/src/models/constants.js), [`BackEnd/src/models/index.js`](file:///c:/CODE/Edunity/BackEnd/src/models/index.js) | Thêm `LEARNING_PATH_STATUSES`, `PRICING_POLICY_SCOPES`, `PRICING_POLICY_STATUSES`, `PRICING_POLICY_CLASS_TYPES`; export `LearningPath`, `CoursePricingPolicy` (**57 models**). |
| `CUR-01` | [`BackEnd/src/services/catalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/catalogService.js), [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) | Bổ sung `...NOT_DELETED` ở các query public/catalog; `updateCourse` cập nhật đồng bộ `level` xuống các `Class` trạng thái `DRAFT`/`REJECTED`; bắt `E11000` trả `409 DUPLICATE_SLUG`. |
| `CUR-02` | [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js), [`BackEnd/scripts/migrateSyllabusVersions.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrateSyllabusVersions.js) | Bổ sung `.session(session)` tại `syllabusService.js` (L167, L588); bọc `migrateForward` trong `jobLock.runExclusive("migration_syllabus_versions_forward", ...)` để ngăn chạy song song multi-instance. |
| `CUR-03` | [`BackEnd/src/models/LearningPath.js`](file:///c:/CODE/Edunity/BackEnd/src/models/LearningPath.js), [`BackEnd/src/services/learningPathService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/learningPathService.js), [`BackEnd/src/controllers/courseCatalogController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js), [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js) | Model `LearningPath` (`adminManagedPlugin` + `softDeletePlugin`, unique partial `slug`), kiểm tra chu trình đồ thị điều kiện tiên quyết (DFS), che giấu thông tin Admin ở public API (`/api/learning-paths*`, `/api/admin/learning-paths*`). |
| `CUR-05` | [`BackEnd/src/models/CourseProposal.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CourseProposal.js), [`BackEnd/src/services/courseProposalService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseProposalService.js) | Thêm `syllabusDraft`, `pricingExpectation`, `submittedAt`, `revisionNumber`, append-only `revisionHistory[]`; redaction `actorId` khi `role === "ADMIN"` với Teacher; transaction đồng bộ `Course` + `SyllabusVersion` v1 + `CurriculumUnit`s khi approve. |
| `CUR-07` | [`BackEnd/src/models/CoursePricingPolicy.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CoursePricingPolicy.js), [`BackEnd/src/services/coursePricingPolicyService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js), [`BackEnd/src/controllers/courseCatalogController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/courseCatalogController.js), [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js) | Model versioned `(policyKey, version)` unique, precedence `COURSE > SUBJECT > CATEGORY > GLOBAL`, transaction activate/rollback/archive, verifier `verifyClassPricingPolicy`, preview endpoint `/api/admin/pricing-policies/verify-preview`, teacher-safe view `/api/teacher/courses/:courseId/pricing-policy`. |
| Contracts, Preflight & Tests | [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js), [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md), [`BackEnd/tests/authorization.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js), [`BackEnd/tests/schemaInventory.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/schemaInventory.test.js), [`BackEnd/tests/migrationPreflight.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/migrationPreflight.test.js), [`BackEnd/tests/academicContract.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/academicContract.test.js), [`BackEnd/tests/phase1ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase1ReplSet.test.js) | Mở rộng preflight lên **52** unique index specs (`learningpaths`, `coursepricingpolicies`); cập nhật `schemaInventory.test.js` lên **57 models / 17 soft-delete**; bổ sung public routes vào `authorization.test.js`; bổ sung toàn bộ ReplSet integration test tại `phase1ReplSet.test.js`. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 20 file `.js` thêm mới/chỉnh sửa trong Phase 1: **20/20 PASS** (exit code 0).
2. **Phase 1 ReplSet & Regression Suites** (`npx jest tests/phase1ReplSet.test.js tests/courseCurriculum.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **7/7 suites PASS (`132/132` tests PASS, `0 FAIL`, `0 SKIP`)** trong `22.237 s`.
   - Đã sửa phát hiện thật trong quá trình test (`phase1ReplSet.test.js`: `JobLock` release gán `lockedUntil = new Date(0)` để tái cấp lease chứ không xóa document; `reorderUnits` nhận `body.unitIds`).
3. **`tests/authorization.test.js`**:
   - **66/68 tests PASS**; toàn bộ `Route matrix` (public routes `/api/courses/:id/syllabus`, `/api/learning-paths`, `/api/learning-paths/:id`, guard 401/403 cho admin/teacher routes mới) và `Responses do not leak` (bao gồm `Course proposals` redaction) **PASS 100%**.
   - **2 test thất bại đã biết trên `PATCH /api/teacher/classes/:id` (L410, L423):** Đúng nguyên nhân thiết kế fail-closed từ `CUR-10` / `TEA-12` (`course.level` thiếu trong seed test & `TEA-12` chưa có hợp đồng từ Bảo — tuyệt đối không bypass).

---

## 4. Ranh giới & Bàn giao sang Phase 2

- `classCreationGateService.js` chủ ý **chưa** nối `CUR-07` vào `CUR-10` trong Phase 1 để giữ green `cur10ClassCreationGate.test.js` theo ranh giới Phase, và sẽ được tích hợp ngay đầu **Phase 2** (`cur07PricingPolicyReady: true`, giữ nguyên `tea12ContractReady: false` fail-closed `503`).
- `CUR-01`, `CUR-02`, `CUR-03`, `CUR-05`, `CUR-07` đã hoàn thành 100% logic, transaction ReplSet, bảo mật IDOR/redaction, và API contract.

