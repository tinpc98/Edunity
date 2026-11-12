# 04. CROSS-TEAM HANDOVER REPORT — GIAO TIẾP LIÊN NHÓM (`TIN`, `BẢO`, `BĂNG`, `INFRA`)

Mọi tích hợp liên nhóm tuân thủ ranh giới quyền sở hữu mã nguồn tại [`BackEnd/docs/coordination-and-handover.md`](file:///c:/CODE/Edunity/BackEnd/docs/coordination-and-handover.md) và [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md). Châu tuyệt đối không sửa trực tiếp các file thuộc owner khác.

---

## 1. Bàn giao cho TIN (Student, Enrollment, Catalog Core, Financial Allocation)

### 1.1. `CUR-09` — Bổ sung Snapshot Giáo trình & Chính sách giá vào `Enrollment` (`DEP-TIN-01`)
- **Phía Châu đã hoàn thành:**
  - Schema [`Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js) & [`Enrollment.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js) đã có sẵn 6 trường snapshot (`syllabusVersionId`, `syllabusVersionNumber`, `pricingPolicyId`, `pricingPolicyKey`, `pricingPolicyVersion`, `pricingPolicySnapshot` mặc định `null` — tương thích ngược 100%).
  - `Class` luôn lưu & khóa snapshot tại `createClass`/`updateClass`/`submitClass`/`approveClass`.
  - Đã export helper chuẩn `buildEnrollmentSnapshotFromClass(targetClass)` tại [`BackEnd/src/services/coursePricingPolicyService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js) (và hướng dẫn chi tiết tại Mục 8 [`coordination-and-handover.md`](file:///c:/CODE/Edunity/BackEnd/docs/coordination-and-handover.md#L329-L359)).
- **Tin cần làm trong `BackEnd/src/services/enrollmentService.js`:**
  - Gọi `const cur09Snapshot = buildEnrollmentSnapshotFromClass(targetClass);` trong transaction của `createEnrollment` và spread vào `new Enrollment({ ..., ...cur09Snapshot })`. Không cập nhật lại các trường snapshot này sau khi `Enrollment` được tạo.

### 1.2. `AID-06` — Cấp phát Học bổng Tài chính sau bước `DOSSIER_VERIFIED` (`DEP-TIN-02`)
- **Ranh giới đã cố định:**
  - Endpoint `POST /api/admin/scholarship-applications/:id/verify-dossier` (`AID-01`) chỉ xác minh hồ sơ phi tài chính (`guardianInfo`, `schoolInfo`, checklist online + biên nhận `PaperDossierReceipt` `RECONCILED`), chốt trạng thái `DOSSIER_VERIFIED` với **0 thay đổi số dư** (`Scholarship`, `allocatedAmount`, `Transaction`).
  - Phân hệ `AID-06` của Tin chỉ nên cấp quỹ/tạo `Scholarship` đối với các hồ sơ chiến dịch V3 đã đạt `status === "DOSSIER_VERIFIED"`.
  - Endpoint legacy `POST /api/admin/scholarship-applications/:id/approve` vẫn được giữ tương thích cho test payment/campaign cũ, nhưng đã chặn bỏ qua `documentChecklist` / `dossierPolicy` khi chiến dịch có cấu hình V3.

---

## 2. Bàn giao & Chờ mở khóa từ BẢO (Auth, Security, App Core, Contract, Storage)

| Hạng mục | File liên quan | Tình trạng hiện tại | Hành động Bảo cần làm để mở khóa |
|---|---|---|---|
| **`TEA-12` (`DEP-BAO-01`)** | `classCreationGateService.js`, `incidentContractCoordinationService.js` | Giữ `contractVerifier: null` → trả **`503 CONTRACT_DEPENDENCY_BLOCKED`** tại `CUR-10` & `TEA-16` execute | Khi hoàn tất model/service `TeacherContract`, truyền/đăng ký `registerContractVerifier` kiểm tra hợp đồng `ACTIVE` chưa hết hạn theo `(teacherId, subjectId, gradeLevel, level)` và thay bộ đôi verifier cho `CUR-10` / `TEA-16`. |
| **`AID-08` (`DEP-BAO-02`)** | `scholarshipDossierGateService.js`, `aiGovernanceService.js` | Chiến dịch bật `requireGuardianConsentForMinor` trả **`503 CONSENT_DEPENDENCY_BLOCKED`**; `AI` báo blocker `AID_08_CONSENT_DEPENDENCY_BLOCKED` | Xây dựng module xác minh đồng thuận người giám hộ cho học sinh `< 18` tuổi và đăng ký verifier vào `scholarshipDossierGateService` & `aiGovernanceService`. |
| **`storageService` (`DEP-BAO-03`)** | [`BackEnd/src/services/storageService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/storageService.js) | `PRIVATE_PURPOSES` mới có `["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF", "INCIDENT_EVIDENCE"]`; chưa có magic signature `"video/mp4"` | Bổ sung purpose `"LEARNING_RESOURCE"` và `"ASSIGNMENT_SUBMISSION"` vào `PRIVATE_PURPOSES` + magic signature `"video/mp4"` nếu Frontend tách purpose riêng khi upload qua `/api/uploads/private`. |
| **`app.js` CORS (`DEP-BAO-04`)** | [`BackEnd/src/app.js`](file:///c:/CODE/Edunity/BackEnd/src/app.js#L29) | `allowedHeaders` chỉ gồm `["Content-Type", "Authorization"]` | Bổ sung `"Idempotency-Key"` vào `allowedHeaders` của `cors(...)` để trình duyệt gọi các API `CUR-11`, `LMS-05`, `LMS-08` gửi header idempotency không bị preflight CORS chặn. |
| **Test Shared (`platform.test.js`)** | [`BackEnd/tests/platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js#L96-L105) | Fixture test cũ tạo `Course` thiếu `level`, thiếu `TEA-07` & `CUR-07` & bị cổng fail-closed `CUR-10` chặn `400` | Owner điều phối / Core cập nhật fixture test (gồm patch Payment trước đó `..\platform-test-fix.patch` nếu áp dụng và fixture `Course.level` / `TEA-07` / `CUR-07` / mock `TEA-12` nếu được PO duyệt). |

---

## 3. Bàn giao cho BĂNG (Frontend) & PO / INFRA

1. **Contract cho Frontend (`Băng`):**
   - Xem bản chuẩn hóa mới nhất tại [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md) (Phiên bản 3.1, 12/11/2026): toàn bộ `Decimal128` trả về kiểu `string`; phân trang `{ items, total, page, pageSize, totalPages }`; `GET /api/sessions/:id/join` trả `405` (bắt buộc `POST`); các luồng `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08`, `LMS-10`, `LMS-12`, `LMS-13`, `LMS-14`, `AID-01`, `AID-04`, `SPO-07`, `TEA-07`, `TEA-16`, `AI-01..04` và `G0-05` Admin Settings đều có bảng endpoint & mã lỗi rõ ràng.
   - Lưu ý không hiển thị raw `storageKey` trên UI học viên (`LMS-03`/`05`); dùng `downloadUrl` hoặc gọi endpoint cấp signed URL.
   - Với `AI-02..04`, giao diện phải xử lý mã **`503 AI_PROVIDER_BLOCKED`** gracefully cho đến khi Infra cấp key/DPA; `AI-01` fallback trả `mode: "DETERMINISTIC_FALLBACK"` kèm `200 OK`.
2. **Hạ tầng AI Production (`PO / Infra` — `DEP-INFRA-01`):**
   - Bổ sung SDK chính thức, API key qua biến môi trường bảo mật, ký DPA với nhà cung cấp AI, cấu hình `setAiProviderAdapter` và chính sách ngân sách token trước khi gỡ blocker `NO_APPROVED_AI_PROVIDER`.
3. **Database Preflight trước Production Deploy (`DevOps / DBA`):**
   - Chạy `node BackEnd/scripts/migrationPreflight.js` ở chế độ mặc định (read-only/dry-run) và `node BackEnd/scripts/backupRestoreClone.js` tạo backup có SHA-256 trước khi chạy `--apply` tạo đủ **54 unique/partial indexes**.

