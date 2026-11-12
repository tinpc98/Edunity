# 09. REMAINING FIX BACKLOG — PHÂN NHÓM THEO OWNER

Danh sách tồn đọng còn lại sau khi kết thúc vòng `FIX-FINAL`, phân định rõ ràng theo từng người phụ trách để tránh chồng chéo trách nhiệm.

---

## 1. Phần việc của Châu (`P2 / Deferred — Không chặn nghiệm thu phạm vi Châu`)

| ID | Ưu tiên | Hạng mục | Mô tả kỹ thuật & Vị trí | Thời điểm thực hiện |
|---|---|---|---|---|
| **CHAU-DEFER-01** | **P2 (Multi-node scaling)** | Chuyển bộ đếm rate-limit & daily token budget của AI sang store phân tán | [`aiGovernanceService.js:46`](file:///c:/CODE/Edunity/BackEnd/src/services/aiGovernanceService.js#L46) đang dùng `inMemoryRateWindow = new Map()`. Khi chỉ chạy 1 process Node.js thì chính xác, nhưng khi triển khai nhiều worker/pod sau này cần Redis hoặc Mongo TTL bucket để chia sẻ quota. | Cùng lúc mở `DEP-INFRA-01` hoặc trước khi scale multi-instance |
| **CHAU-DEFER-02** | **P3 (Cleanup warning)** | Chuẩn hóa `{ new: true }` → `{ returnDocument: 'after' }` trong các code legacy còn lại | Log Jest ghi nhận `[MONGOOSE] Warning: the 'new' option for findOneAndUpdate()... is deprecated` từ một số service/test cũ ngoài phần sửa chính. Không gây lỗi chức năng hay memory leak. | Dọn kỹ thuật trước khi nâng cấp Mongoose major |
| **CHAU-SYNC-01** | **P1 (Cross-team verification)** | Chạy lại test liên module cùng Tin & Bảo ngay khi có code thật | Phối hợp chạy integration test thật cho `CUR-09` (`Enrollment`), `AID-01 ↔ AID-06`, `TEA-12`, `AID-08` và upload LMS qua browser. | Ngay khi Tin/Bảo bàn giao nhánh tích hợp |

---

## 2. Phần việc của Tin (`DEP-TIN-01`, `DEP-TIN-02`)

| ID | Ưu tiên | Hạng mục | File mục tiêu & Tham chiếu |
|---|---|---|---|
| **TIN-BL-01** (`DEP-TIN-01`) | **P1 (Integration)** | Copy snapshot `CUR-09` từ `targetClass` vào `Enrollment` khi ghi danh (`buildEnrollmentSnapshotFromClass`) | [`BackEnd/src/services/enrollmentService.js:117-131`](file:///c:/CODE/Edunity/BackEnd/src/services/enrollmentService.js#L117-L131) — chi tiết tại [`03_HANDOVER_TIN.md`](./03_HANDOVER_TIN.md#L9-L50) |
| **TIN-BL-02** (`DEP-TIN-02`) | **P1 (Integration)** | Nối luồng cấp quỹ `AID-06` nhận đầu vào `status === "DOSSIER_VERIFIED"` (cộng trừ quỹ nguyên tử + `Decimal128` trong ReplSet tx) | Chi tiết tại [`03_HANDOVER_TIN.md`](./03_HANDOVER_TIN.md#L53-L72) |

---

## 3. Phần việc của Bảo (`DEP-BAO-01..04` + Review working-tree diff)

| ID | Ưu tiên | Hạng mục | File mục tiêu & Tham chiếu |
|---|---|---|---|
| **BAO-BL-01** (`DEP-BAO-01`) | **P0 (Production Blocker)** | Triển khai module `TeacherContract` (`TEA-12`) và đăng ký `contractVerifier` thật cho `classCreationGateService` | [`04_HANDOVER_BAO.md`](./04_HANDOVER_BAO.md#L8-L32) |
| **BAO-BL-02** (`DEP-BAO-02`) | **P0 (Production Blocker)** | Triển khai module Guardian Consent cho học sinh `< 18` tuổi (`AID-08`) và nối vào `scholarshipDossierGateService.setConsentVerifier(...)` | [`04_HANDOVER_BAO.md`](./04_HANDOVER_BAO.md#L35-L50) |
| **BAO-BL-03** (`DEP-BAO-03`) | **P1 (LMS Browser Flow)** | Bổ sung `LEARNING_RESOURCE`, `ASSIGNMENT_ATTACHMENT`, `SUBMISSION_ATTACHMENT` vào `PRIVATE_PURPOSES`; thêm kiểm tra magic bytes `video/mp4` (`ftyp`); cập nhật phân quyền `fileController.uploadPrivate` cho giáo viên `VERIFIED` & học viên | [`storageService.js:20,32-47`](file:///c:/CODE/Edunity/BackEnd/src/services/storageService.js#L20), [`fileController.js:15-42`](file:///c:/CODE/Edunity/BackEnd/src/controllers/fileController.js#L15-L42) — xem [`04_HANDOVER_BAO.md`](./04_HANDOVER_BAO.md#L54-L70) |
| **BAO-BL-04** (`DEP-BAO-04`) | **P1 (Browser CORS)** | Thêm `"Idempotency-Key"` vào `corsOptions.allowedHeaders` | [`BackEnd/src/app.js:29`](file:///c:/CODE/Edunity/BackEnd/src/app.js#L29) — xem [`04_HANDOVER_BAO.md`](./04_HANDOVER_BAO.md#L73-L79) |
| **BAO-REV-01** | **P2 (Git Hygiene)** | Review 3 dòng diff pre-existing trong working tree `authorization.test.js:55-57` (`PUBLIC_ROUTES`) trước khi commit | [`02_ACCEPTANCE_CONTRADICTIONS.md`](./02_ACCEPTANCE_CONTRADICTIONS.md) (`CONTR-05`) |

---

## 4. Phần việc của Owner / Core QA

| ID | Ưu tiên | Hạng mục | Hành động cụ thể |
|---|---|---|---|
| **OWNER-CI-01** | **P1 (CI Green)** | Phê duyệt chiến lược test-scoped mock `TEA-12` cho legacy E2E suites và áp 2 patch đề xuất vào `BE-2` | Kiểm tra với `git apply --check`, sau đó apply [`platform.test.js.patch`](./proposed-patches/platform.test.js.patch) & [`authorization.test.js.patch`](./proposed-patches/authorization.test.js.patch) theo hướng dẫn tại [`proposed-patches/README.md`](./proposed-patches/README.md). |
| **OWNER-DOC-01** | **P2 (Doc Sync)** | Đính chính Mục 1.4 trong [`coordination-and-handover.md:60-69`](file:///c:/CODE/Edunity/BackEnd/docs/coordination-and-handover.md#L60-L69) | Ghi chú rõ `paymentController.js` đã bật sandbox & webhook test mode mặc định và `platform.test.js:804` đã pass `LATE_SUCCESS_AFTER_FAILED` (`CONTR-01`). |

---

## 5. Phần việc của PO / Infra / DBA

| ID | Ưu tiên | Hạng mục | Hành động cụ thể |
|---|---|---|---|
| **INFRA-AI-01** (`DEP-INFRA-01`) | **P0 (AI Release Blocker)** | Chọn nhà cung cấp AI chính thức, ký DPA, cấp API credentials vào secret manager & cài SDK để mở khóa `AI-02..04` | Chỉ bật AI sau khi có DPA & `AID-08` consent |
| **DBA-MIG-01** | **P0 (Pre-Deploy Prod)** | Chạy `backupRestoreClone.js` (backup SHA-256), chạy [`migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js) chế độ dry-run để quét trùng/orphan, xử lý data bẩn rồi mới `--apply` 54 index specs lên Production | Bắt buộc trước khi bật traffic V3 trên DB thật |

