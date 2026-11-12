# 00. BASELINE & ENVIRONMENT VERIFICATION — TASK FIX-FINAL (CHÂU)

- **Ngày kiểm chứng:** `12/11/2026`
- **Nhánh làm việc:** `BE-2`
- **Base HEAD Commit:** `46567997548cc4bad62e52364760fa5a4c8cd69a`
- **Phạm vi phụ trách:** **Châu** — Backend Đào tạo, LMS và Database phi tài chính (**34 tasks**, `Phase 0 → Phase 6`)
- **Tài liệu baseline được bảo toàn:** [`docs/audits/chau-fix-all/`](file:///c:/CODE/Edunity/docs/audits/chau-fix-all) (giữ nguyên 100%, không chỉnh sửa/ghi đè)

---

## 1. Runtime, Stack & Dependencies (Verified từ Environment & `package.json`)

| Thành phần | Giá trị xác minh thực tế | Nguồn xác minh |
|---|---|---|
| **Operating System / Shell** | Windows / PowerShell | Workspace host |
| **Node.js Runtime** | `v24.18.0` | `node -v` |
| **Framework Backend** | `express: ^5.2.1` (`query parser` mặc định `"simple"` / `querystring`) | [`BackEnd/package.json`](file:///c:/CODE/Edunity/BackEnd/package.json#L20) |
| **ODM / Driver** | `mongoose: ^9.10.1`, `mongodb: 7.5.0` (overrides) | [`BackEnd/package.json`](file:///c:/CODE/Edunity/BackEnd/package.json#L25-L36) |
| **Test Framework** | `jest: ^30.5.2`, `supertest: ^7.2.2`, `testTimeout: 600000` | [`BackEnd/package.json`](file:///c:/CODE/Edunity/BackEnd/package.json#L30-L33), [`jest.config.js`](file:///c:/CODE/Edunity/BackEnd/jest.config.js#L1-L4) |
| **In-Memory Database** | `mongodb-memory-server: ^11.2.0` (`MongoMemoryReplSet` — WiredTiger `7.0.14`) | [`BackEnd/tests/helpers/db.js`](file:///c:/CODE/Edunity/BackEnd/tests/helpers/db.js) |
| **Schema Inventory** | `57` Mongoose models, `17` soft-delete models, `54` unique/partial index specs | [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js), [`schema-inventory-g0-02.md`](file:///c:/CODE/Edunity/BackEnd/docs/schema-inventory-g0-02.md#L7-L18) |

> **Lưu ý về Express 5 `query parser`:** Express `5.2.1` phân tích tham số lặp kiểu `?teacherId=id1&teacherId=id2` thành `Array<string>`, còn kiểu dấu ngoặc vuông `?teacherId[]=...` giữ nguyên key `"teacherId[]"`. Các bài test Query Injection trong `FIX-FINAL` sử dụng đúng cú pháp query lặp của Express 5.

---

## 2. Trạng thái Baseline trước FIX-FINAL & Xác minh Ranh giới Sở hữu

| Hạng mục | Thực tế xác minh khi mở vòng FIX-FINAL | Ghi chú / Sở hữu |
|---|---|---|
| **Baseline Final TEST 2 (`chau-fix-all`)** | Báo cáo `44/46` suites PASS, `615/618` tests PASS, `0` open handles, `219/219` syntax PASS | Được lưu tại [`final-acceptance/`](file:///c:/CODE/Edunity/docs/audits/chau-fix-all/final-acceptance) |
| **Pre-existing working-tree diff ngoài Châu trên `BackEnd/tests/authorization.test.js`** | Đã có sẵn diff **`+3` dòng (`L55-57`)** thêm 3 public GET routes (`courses/:id/syllabus`, `learning-paths`, `learning-paths/:id`) vào `PUBLIC_ROUTES` so với `HEAD` | Không phải do FIX-FINAL sửa; được ghi nhận minh bạch tại [`02_ACCEPTANCE_CONTRADICTIONS.md`](./02_ACCEPTANCE_CONTRADICTIONS.md) |
| **`BackEnd/tests/platform.test.js`** | Sạch 100% so với `HEAD 4656799` | Giữ nguyên sạch trên working tree; chỉ đề xuất patch qua [`proposed-patches/`](./proposed-patches/README.md) |
| **File thuộc Tin (`enrollmentService.js`, `paymentService.js`, `settlementService.js`, `reservationService.js`)** | `0` chỉnh sửa | Tuân thủ tuyệt đối |
| **File thuộc Bảo (`app.js`, `storageService.js`, `fileController.js`, `authMiddleware.js`, `requireRole.js`)** | `0` chỉnh sửa | Tuân thủ tuyệt đối |
| **File `FrontEnd/*` và `.env`** | `0` chỉnh sửa | Tuân thủ tuyệt đối |
| **`BackEnd/src/server.js`** | Diff sẵn trước FIX-FINAL chỉ gọi `warmSettingsCache().catch(...)` (từ `G0-05` trong `chau-fix-all`) | Không sửa thêm trong FIX-FINAL |

---

## 3. Quy tắc An toàn & Kiểm chứng được tuân thủ tuyệt đối trong FIX-FINAL

1. Không dùng `--forceExit` và không dùng `--passWithNoTests` trong bất kỳ lần chạy Jest chính thức nào.
2. Toàn bộ cổng **fail-closed** (`CUR-10`: `COURSE_LEVEL_REQUIRED`, `TEA-07`, `CUR-07`, `TEA-12` `503 CONTRACT_DEPENDENCY_BLOCKED`; `AID-08`: `503 CONSENT_DEPENDENCY_BLOCKED`; `AI-02..04`: `503 AI_PROVIDER_BLOCKED`) được giữ nguyên nghiêm ngặt.
3. Không chạy `git commit`, `git push`, `git reset`, `git clean`, `git merge`.
4. Kiểm chứng đề xuất vá 2 shared test files hoàn toàn trong thư mục tạm ngoài repo, tạo file patch chuẩn tại [`proposed-patches/`](./proposed-patches/), xác nhận `git apply --check` hợp lệ trên `BE-2` và xóa sạch thư mục tạm sau khi kiểm chứng.

