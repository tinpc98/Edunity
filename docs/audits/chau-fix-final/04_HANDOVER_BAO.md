# 04. CROSS-TEAM HANDOVER SPECIFICATION — BẢO (AUTH / CORE / CONTRACT / STORAGE / TESTS)

- **Người nhận bàn giao:** **Bảo** (Auth Core, App Security, `TeacherContract` `TEA-12`, Guardian Consent `AID-08`, File Storage & Shared Integration Test Governance)
- **Nguyên tắc:** Châu **không** chỉnh sửa bất kỳ file nào thuộc quyền sở hữu của Bảo (`app.js`, `storageService.js`, `fileController.js`, `authMiddleware.js`, `requireRole.js`).

---

## 1. `DEP-BAO-01`: `TEA-12` — Cổng Hợp đồng Giảng dạy (`CUR-10` & `TEA-16`)

### 1.1. Tình trạng hiện tại
- Hàm `defaultVerifiers().contractVerifier` tại [`classCreationGateService.js:21-24`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js#L21-L24) đang để **`null`** (fail-closed có chủ đích).
- Khi gọi tạo/sửa/gửi duyệt lớp (`CUR-10` `createClass`, `updateClass`, `submitClass`, `approveClass`) hoặc điều phối hợp đồng sự cố (`TEA-16` `adminUpdateContractReviewPacketStatus` / packet escalation), hệ thống trả **`503 CONTRACT_DEPENDENCY_BLOCKED`** với payload chi tiết `{ dependency: "TEA-12", owner: "Bao", status: "BLOCKED" }` ([`classCreationGateService.js:179-189`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js#L179-L189), [`incidentContractCoordinationService.js:53-122`](file:///c:/CODE/Edunity/BackEnd/src/services/incidentContractCoordinationService.js#L53-L122)).
- Quy tắc an toàn bắt buộc ([`classCreationGateService.js:18-19`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js#L18-L19)): **Tuyệt đối không dùng `User.teacherProfile.verificationStatus === "VERIFIED"` thay cho `TeacherContract` `ACTIVE`.**

### 1.2. Hợp đồng hàm Bảo cần đăng ký khi hoàn thiện `TEA-12`
Khi module `TeacherContract` sẵn sàng, Bảo đăng ký verifier khi bootstrap app (hoặc gắn mặc định trong port của `classCreationGateService`):
```javascript
const classCreationGateService = require("./services/classCreationGateService");
// Chữ ký async nhận ({ teacherId, teacher, now })
classCreationGateService.setDependencyVerifiers({
  contractVerifier: async ({ teacherId, now = new Date() }) => {
    // Query TeacherContract mới nhất/còn hiệu lực của teacherId:
    // Trả về null nếu không có; hoặc object { id, status: "ACTIVE" | "EXPIRED" | "TERMINATED" | ..., expiresAt }
  },
});
```
- **Kiểm tra hợp lệ tự động phía `assertTeacherContractGate` ([`classCreationGateService.js:191-208`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js#L191-L208)):**
  - `!contract` → `403 TEACHER_CONTRACT_NOT_FOUND`
  - `contract.status !== "ACTIVE"` → `403 TEACHER_CONTRACT_NOT_ACTIVE`
  - `contract.expiresAt && new Date(contract.expiresAt) <= now` → `403 TEACHER_CONTRACT_EXPIRED`
- **Điểm lưu ý cho `TEA-16` ([`incidentContractCoordinationService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/incidentContractCoordinationService.js)):** `TEA-16` **chỉ tạo hồ sơ correlation (`TeacherContractReviewPacket`) và AuditLog**, không bao giờ tự mutate/hủy hợp đồng `TeacherContract` của Bảo.

---

## 2. `DEP-BAO-02`: `AID-08` — Đồng thuận Người Giám hộ cho Học sinh `< 18` Tuổi (`AID-01`, `AI-01`, `AI-04`)

### 2.1. Tình trạng hiện tại
- `registeredConsentVerifier` tại [`scholarshipDossierGateService.js:23-35`](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipDossierGateService.js#L23-L35) mặc định là **`null`**.
- Thông tin liên hệ `guardianInfo` trong `AID-01` **chỉ là thông tin khai báo hành chính**, không thay thế đồng thuận pháp lý `AID-08`.
- Khi chiến dịch học bổng bật `dossierPolicy.requireGuardianConsentForMinor = true` (hoặc gọi kiểm tra AI cần consent), hệ thống fail-closed trả **`503 CONSENT_DEPENDENCY_BLOCKED`**; hàm [`aiGovernanceService.getAiProviderStatus()`](file:///c:/CODE/Edunity/BackEnd/src/services/aiGovernanceService.js#L77-L86) liệt kê blocker `"AID_08_CONSENT_DEPENDENCY_BLOCKED"`.

### 2.2. Hợp đồng hàm Bảo cần đăng ký khi hoàn thiện `AID-08`
```javascript
const scholarshipDossierGateService = require("./services/scholarshipDossierGateService");
scholarshipDossierGateService.setConsentVerifier(async ({ student, campaign, application, guardianInfo, schoolInfo }) => {
  // Kiểm tra Student dưới 18 tuổi & bản ghi Consent đã được ký/xác nhận hợp lệ hay chưa
  // Trả về { verified: true, consentRecordId, signedAt, guardianName } nếu đạt;
  // hoặc throw AppError(..., "GUARDIAN_CONSENT_REQUIRED", 403) / { verified: false, reason } nếu thiếu
});
```

---

## 3. `DEP-BAO-03`: `storageService.js` & `fileController.js` — Upload Học liệu & Bài nộp LMS (`LMS-03`, `LMS-05`)

> **Mở rộng phát hiện trong FIX-FINAL:** Không chỉ thiếu enum trong `storageService.js`, rà soát [`BackEnd/src/controllers/fileController.js:15-42`](file:///c:/CODE/Edunity/BackEnd/src/controllers/fileController.js#L15-L42) cho thấy rào cản thứ hai chặn trực tiếp giáo viên đã xác minh.

### 3.1. Ba điểm Bảo cần bổ sung
1. **[`storageService.js:20`](file:///c:/CODE/Edunity/BackEnd/src/services/storageService.js#L20) — Mở rộng `PRIVATE_PURPOSES`:**
   - Hiện tại chỉ có `["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF", "INCIDENT_EVIDENCE"]`.
   - Cần bổ sung các purpose LMS chuẩn: `"LEARNING_RESOURCE"`, `"ASSIGNMENT_ATTACHMENT"`, `"SUBMISSION_ATTACHMENT"`.
2. **[`storageService.js:32-47`](file:///c:/CODE/Edunity/BackEnd/src/services/storageService.js#L32-L47) — Sửa hàm `matchesSignature` cho `"video/mp4"`:**
   - Dù [`storageService.js:26`](file:///c:/CODE/Edunity/BackEnd/src/services/storageService.js#L26) đã liệt kê `"video/mp4": "mp4"` trong `PRIVATE_TYPES`, hàm `matchesSignature` hiện **thiếu `case "video/mp4":`**, rơi xuống `default: return false;` nên mọi file `.mp4` đều bị reject `400 UNSUPPORTED_FILE_TYPE`.
   - Cần kiểm tra magic bytes ISO Base Media (`ftyp` tại offset `4..8`: `buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp"`).
3. **[`fileController.js:15-42`](file:///c:/CODE/Edunity/BackEnd/src/controllers/fileController.js#L15-L42) — Quyền upload theo role & purpose mới:**
   - Hiện một **`TEACHER` đã `VERIFIED`** gọi `POST /api/uploads/private` bị chặn ở `SCHOLARSHIP_PROOF` (`403`), bị chặn ở `IDENTITY`/`QUALIFICATION` (`403 ALREADY_VERIFIED`), chỉ còn `"INCIDENT_EVIDENCE"` là lọt qua được.
   - Cần chỉ rõ ma trận cho phép:
     - `LEARNING_RESOURCE`, `ASSIGNMENT_ATTACHMENT`: chỉ `TEACHER` (`VERIFIED`) và `ADMIN`; `STUDENT` / `SPONSOR` bị `403`.
     - `SUBMISSION_ATTACHMENT`: chỉ `STUDENT` (cần kèm validate enrollment hoặc do `assignmentService` kiểm chứng ownership qua `assertOwnedKeys`).

---

## 4. `DEP-BAO-04`: `app.js` CORS `allowedHeaders` — Header `Idempotency-Key` (`CUR-11`, `LMS-05`, `LMS-08`)

- **Hiện trạng tại [`BackEnd/src/app.js:29`](file:///c:/CODE/Edunity/BackEnd/src/app.js#L29):**
  `allowedHeaders: ["Content-Type", "Authorization"]`
- **Tác động:** Các endpoint hỗ trợ chống gửi trùng từ phía trình duyệt (`POST /api/teacher/classes/:id/sessions`, `POST /api/teacher/classes/:id/sessions/generate`, `POST /api/assignments/:id/submissions`, `POST /api/assessments/:id/attempts`) đọc `req.header("Idempotency-Key")`. Trình duyệt chạy khác origin sẽ bị CORS preflight (`OPTIONS`) từ chối nếu thiếu header này.
- **Hành động Bảo cần làm:** Bổ sung `"Idempotency-Key"` vào mảng `allowedHeaders`:
  `allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]`.

---

## 5. Quản trị 2 Shared Tests (`platform.test.js` & `authorization.test.js`) + Lưu ý Working Tree

1. **Patch đề xuất (chưa tự apply vào repo chính):**
   - Xem [`proposed-patches/README.md`](./proposed-patches/README.md), [`platform.test.js.patch`](./proposed-patches/platform.test.js.patch) và [`authorization.test.js.patch`](./proposed-patches/authorization.test.js.patch).
   - Cả hai bản vá đã vượt qua `git apply --check` và chạy chứng minh đạt **`81/81` tests PASS, `0` open handles** trong môi trường cô lập ([`06_proposed_patch_verification.log`](./evidence/06_proposed_patch_verification.log)).
2. **Thông báo minh bạch về pre-existing diff trên `BackEnd/tests/authorization.test.js`:**
   - Trước khi bắt đầu vòng FIX-FINAL, working tree nhánh `BE-2` đã có sẵn diff **`+3` dòng tại `authorization.test.js:55-57`** (`PUBLIC_ROUTES`: `courses/:id/syllabus`, `learning-paths`, `learning-paths/:id`). Bảo/Owner cần review cùng khi rà soát trước khi commit nhánh `BE-2`.

