# Edunity Supplement A — Profile & Document Hardening

## 1. Scope
Supplement A focuses on fixing and hardening the Teacher Profile, Teacher Avatar, Teacher Verification & Qualification submission pipeline, and Admin Private Document Review (Teacher Verification & Scholarship Applications) as discovered in `EDUNITY_DEEP_COMPLETION_AUDIT.md`.

Target areas addressed:
- **A. Teacher Profile**: Real data binding with `GET /api/me/profile`, editable fields (`fullName`, `biography`, `qualificationSummary`), read-only fields protection, persistence after reload.
- **B. Teacher Avatar**: Multipart upload `POST /api/me/avatar` with field `file`, client pre-validation (JPG/PNG/WebP, <=5MB), magic byte mismatch handling, cache synchronization across Profile, Header, and DashboardShell.
- **C & D. Teacher Verification & Qualification**: Two-step private upload protocol (`POST /api/uploads/private` -> `POST /api/teacher/verification`), deterministic `FRONT`/`BACK`/`SINGLE` side mapping, complete resolution of Ant Design Upload accumulation bug, multi-qualification support.
- **E. Verification State UX**: State machine handling (`UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`), disabling resubmissions when `PENDING` or `VERIFIED`, enabling resubmission when `REJECTED`.
- **F & G. Admin Review Hardening**: Created shared `PrivateDocumentCard` for MIME-aware rendering (images preview with zoom, PDFs preview with embedded iframe modal and new tab action, never rendering raw broken `<img>` tags). Fixed property mismatch in Scholarship Application review (`file.url` vs `file.signedUrl`).
- **H & I. Error Mapping & Cache**: Centralized `apiErrorMap` utility, cache invalidation for profile and verification lists.

---

## 2. Baseline
- Pre-flight working tree: `D:/Dự Án/Edunity`, branch `feature/teacher-admin`.
- Backend clean check before changes: `git status --short BackEnd` was completely empty.
- Baseline build before changes: `npx tsc -b` and `npm run build` passed with exit code 0.

---

## 3. Backend Freeze Verification
- Backend directory: `D:/Dự Án/Edunity/BackEnd`.
- Status: **100% READ ONLY**.
- Files modified in `BackEnd`: **0**.
- Verification command: `git status --short BackEnd` returns empty output.
- `git diff --name-only -- BackEnd` returns empty output.

---

## 4. Teacher Profile Contract
- **Source**: `BackEnd/src/services/profileService.js` and `BackEnd/src/controllers/accountController.js`.
- **Endpoint**: `GET /api/me/profile` & `PATCH /api/me/profile`.
- **Read-only fields**: `id`, `email`, `role`, `status`, `verificationStatus`, `ratingAverage`, `ratingCount`, `createdAt`, `updatedAt`.
- **Editable fields**:
  - `fullName`: string, required, max 120 characters.
  - `qualificationSummary`: string, optional, max 2000 characters.
  - `biography`: string, optional, max 5000 characters.
- **Behavior**: Teacher's `fullName` update is also propagated to denormalized `teacherName` in classes.

---

## 5. Avatar Contract
- **Endpoint**: `POST /api/me/avatar`.
- **Multipart field name**: `file` (single file memory upload via `singleFile` middleware).
- **Maximum file size**: 5 MB (`MAX_PUBLIC_SIZE = 5 * 1024 * 1024`).
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`.
- **Allowed extensions**: `.jpg`, `.jpeg`, `.png`, `.webp`.
- **Backend response**: `{ success: true, data: { avatarUrl: string } }`.
- **Server validation**: Performs magic byte signature checking (`matchesSignature`). Fails with 400 `UNSUPPORTED_FILE_TYPE` if magic bytes do not match declared MIME.
- **Account compatibility**: If `teacherProfile` is not embedded in User document, Backend throws 400 `PROFILE_NOT_EDITABLE`.

---

## 6. Avatar Frontend Changes
- **Client pre-validation**:
  - Validates MIME type against `image/jpeg`, `image/png`, `image/webp` and file extensions `.jpg`, `.jpeg`, `.png`, `.webp`.
  - Blocks unsupported formats (e.g. GIF, SVG, AVIF, HEIC, TXT) before making any HTTP request.
  - Validates file size `<= 5MB`. Blocks files > 5MB before sending.
- **Form Data Construction**:
  - Constructs `const formData = new FormData(); formData.append("file", file);`.
  - Let browser/fetch set boundary automatically without manual `Content-Type` header manipulation.
- **UI Guidelines**:
  - Displays visible format constraint below avatar: `"Chấp nhận JPG, PNG hoặc WebP • Tối đa 5 MB"`.

---

## 7. Avatar Error Mapping
Handled through `getFriendlyErrorMessage` (`src/utils/apiErrorMap.ts`):
- `UNSUPPORTED_FILE_TYPE`: "Định dạng tệp không được hỗ trợ. Chỉ chấp nhận tệp JPG, PNG hoặc WebP (tối đa 5MB)."
- `FILE_TOO_LARGE` / 413: "Kích thước tệp vượt quá giới hạn cho phép."
- `PROFILE_NOT_EDITABLE`: "Hồ sơ giáo viên chưa được khởi tạo đầy đủ. Không thể cập nhật ảnh đại diện."
- 401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
- 403: "Bạn không có quyền thực hiện hành động này."

---

## 8. Avatar Cache Synchronization
- When avatar is successfully uploaded:
  1. React Query cache for `["teacherProfile", user?.userId]` is updated immediately with `data.avatarUrl`.
  2. Query `["teacherProfile"]` is invalidated for canonical server fetch.
  3. `useAuthStore.getState().updateUser({ avatarUrl: data.avatarUrl })` is called.
  4. Header (`src/components/layout/Header.tsx`) and DashboardShell (`src/components/dashboard/DashboardShell.tsx`) immediately re-render with the new avatar.
  5. Persistence to `localStorage` (`edunity-auth`) guarantees the new avatar remains visible after F5 or logout/login.

---

## 9. Verification State Machine
Backend Verification Statuses: `UNVERIFIED` | `PENDING` | `VERIFIED` | `REJECTED`.
- `UNVERIFIED`:
  - UI shows information banner with "Nộp hồ sơ xác minh" button.
  - Modal enables document selection and submission.
- `PENDING`:
  - UI shows amber banner: "Hồ sơ đang chờ duyệt. Edunity đang xem xét hồ sơ của bạn...".
  - Submission buttons hidden/disabled. Prevents accidental double-submits.
  - Direct API calls receive 409 `VERIFICATION_PENDING` (expected business response).
- `VERIFIED`:
  - UI shows emerald banner: "Hồ sơ đã được xác minh...".
  - Submission controls hidden/disabled.
  - Direct API calls receive 409 `ALREADY_VERIFIED` (expected business response).
- `REJECTED`:
  - UI shows rose banner: "Hồ sơ bị từ chối" along with Admin `reviewNote` callout.
  - Enables "Cập nhật và nộp lại hồ sơ" action, allowing teacher to resubmit.

---

## 10. Private Upload Contract
- **Endpoint**: `POST /api/uploads/private`.
- **Multipart fields**:
  - `purpose`: `"IDENTITY"` | `"QUALIFICATION"`.
  - `file`: binary buffer.
- **Allowed MIME types**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- **Maximum file size**: 10 MB (`10 * 1024 * 1024`).
- **Response**: `{ success: true, data: { storageKey, mimeType, size, originalName } }`.
- **Storage security**: Files stored in private storage; access restricted via signed URLs.

---

## 11. Identity Document Flow
- Teacher uploads identity documents through dedicated slot:
  - **Mặt trước (Required)**: CCCD / CMND / Hộ chiếu.
  - **Mặt sau (Optional)**: Mặt sau CCCD / CMND.
- Side mapping:
  - If both front & back are uploaded: front is mapped to `side: "FRONT"`, back is mapped to `side: "BACK"`.
  - If only front is uploaded: front is mapped to `side: "SINGLE"`.
- Each file uploaded to `POST /api/uploads/private` with `purpose: "IDENTITY"`. Returned `storageKey` is collected.

---

## 12. Qualification Document Flow
- Teacher uploads up to 3 qualification documents (degrees, certificates).
- Supported formats: PDF, JPG, PNG, WebP (max 10MB each).
- Each file uploaded to `POST /api/uploads/private` with `purpose: "QUALIFICATION"`.
- Every qualification file mapped with `side: "SINGLE"`.

---

## 13. Upload State Accumulation Fix
- **Root Cause Discovered in Audit**: Ant Design Upload Dragger with `beforeUpload={(file) => { setFiles(prev => [...prev, file]); return false; }}` continuously appended files on every file-chooser trigger, leading to stale historical file accumulation and broken array order.
- **Solution Implemented**:
  - Separate dedicated state: `identityFrontFile: File | null`, `identityBackFile: File | null`, `qualificationFiles: File[]`.
  - Single-file slots replace on new selection and clear on delete.
  - Qualification array enforces `maxCount = 3` with deduplication by name & size.
  - Explicit delete buttons (`DeleteOutlined`) remove exactly the targeted file item without side effects.

---

## 14. Verification Submission Flow
- **Two-Step Protocol**:
  1. Sequential private uploads:
     - Upload front identity -> retrieve `storageKey` & `mimeType`.
     - Upload back identity (if present) -> retrieve `storageKey` & `mimeType`.
     - Upload qualification files -> retrieve each `storageKey` & `mimeType`.
  2. If any upload fails, execution stops immediately, displaying which specific document failed. No partial or incomplete dossier is sent.
  3. Once all uploads succeed, assemble JSON dossier:
     ```json
     {
       "documents": [
         { "documentType": "IDENTITY", "files": [...] },
         { "documentType": "QUALIFICATION", "files": [...] }
       ],
       "qualificationSummary": "...",
       "biography": "..."
     }
     ```
  4. Submit to `POST /api/teacher/verification`.
  5. On 201 success: clear state, close modal, invalidate queries, and transition UI immediately to `PENDING`.

---

## 15. Pending / Verified / Rejected UX
- **PENDING**: Explains review turnaround (1-3 business days), suppresses submit triggers.
- **VERIFIED**: Confirms verified badge and teaching permission, suppresses submit triggers.
- **REJECTED**: Displays rejection reason (`reviewNote`), offers "Cập nhật và nộp lại hồ sơ" button that reopens modal with pre-filled text.

---

## 16. Admin Verification Document Viewer
- Updated `TeacherVerificationDetailPage.tsx` to use shared `PrivateDocumentCard`.
- Clean card-based document presentation for Identity files and Qualification certificates.
- Image documents render with Ant Design `<Image>` preview and zoom controls.
- PDF documents render with PDF metadata and "Xem PDF" modal button.
- Replaced previous broken `<img src={file.url} />` tags.

---

## 17. PDF Handling
- PDFs are detected via `mimeType.includes("pdf")` or `.pdf` extension/URL.
- Instead of feeding PDF URLs into `<img>` tags, `PrivateDocumentCard` provides:
  1. In-page Preview Modal embedding a full-height `<iframe>` displaying the PDF document inline.
  2. "Mở trong tab mới" action button (`target="_blank" rel="noopener noreferrer"`).
- Backend serves PDF downloads with headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline`
  - `Cache-Control: private, no-store`
  allowing seamless iframe embedding and browser-native PDF viewer rendering.

---

## 18. Signed URL Handling
- Private file URLs are signed HMAC-SHA256 URLs generated on-demand by Backend (`/api/files/download?key=...&expires=...&signature=...`).
- Signed URLs have a short TTL (default 300s / 5 minutes).
- Frontend never stores signed URLs in `localStorage`, `sessionStorage`, or Zustand.
- If a URL expires or is unavailable, `PrivateDocumentCard` renders a safe unavailable fallback card with instructions to refresh the page.

---

## 19. Scholarship Proof Document Fix
- **Root Cause Discovered in Audit**: `ScholarshipApplicationReviewPage.tsx` checked `file.signedUrl`, while Backend returned `file.url`. As a result, the action button was permanently disabled with label "Chưa có URL xem".
- **Solution Implemented**:
  1. Updated `VerificationDocumentFile` interface in `src/types/scholarship.ts` to include `url?: string | null; urlExpiresAt?: string | null;`.
  2. Updated `adaptScholarshipApplication` in `src/api/scholarshipAdapters.ts` to normalize `url` and `signedUrl`.
  3. Integrated `PrivateDocumentCard` into `ScholarshipApplicationReviewPage.tsx`.
  4. "Xem tài liệu" button is enabled with valid URLs for both PDFs and images.

---

## 20. Private Document Security Audit
- Private storage keys (`private/<userId>/<purpose>/<uuid>.<ext>`) are kept internal in DTOs and never displayed prominently as raw strings.
- Frontend never constructs public paths for private documents (e.g. `/uploads/...`).
- Zero private documents, storage keys, or signed URL parameters stored in `localStorage` or `sessionStorage`.
- Non-admin attempts to access Admin verification routes return 403 `FORBIDDEN` from server.

---

## 21. Files Created
1. `FrontEnd/src/utils/apiErrorMap.ts`: Centralized API error code mapping into safe, user-friendly Vietnamese messages.
2. `FrontEnd/src/components/common/PrivateDocumentCard.tsx`: Shared MIME-aware document card for private files with image preview and PDF iframe modal viewer.
3. `FE_SUPPLEMENT_A_PROFILE_DOCUMENT_HARDENING_REPORT.md`: This comprehensive completion report.

---

## 22. Files Modified
1. `FrontEnd/src/api/apiClient.ts`: Exported `FetchError` class for type checking.
2. `FrontEnd/src/types/scholarship.ts`: Added `url` and `urlExpiresAt` to `VerificationDocumentFile`.
3. `FrontEnd/src/api/scholarshipAdapters.ts`: Normalized `url` and `signedUrl` in `adaptScholarshipApplication`.
4. `FrontEnd/src/features/teacher/profile/TeacherProfilePage.tsx`: Hardened avatar validation, fixed upload accumulation bug, updated verification modal workflow, integrated `apiErrorMap`, added cache invalidation.
5. `FrontEnd/src/features/admin/teachers/verifications/TeacherVerificationDetailPage.tsx`: Replaced broken `<img>` tags with `PrivateDocumentCard`, hardened approve/reject mutations with query list invalidation and error mapping.
6. `FrontEnd/src/features/admin/scholarships/ScholarshipApplicationReviewPage.tsx`: Integrated `PrivateDocumentCard`, fixed `file.url` mapping, resolved disabled "Chưa có URL xem" bug, hardened action mutations.

---

## 23. Runtime E2E — Teacher Profile
- Registered fresh Teacher: `POST /api/auth/register` -> 201 Created.
- Real API load: `GET /api/me/profile` returns `fullName: "Giáo Viên Test Supplement A"`.
- Profile edit: `PATCH /api/me/profile` updates `fullName`, `qualificationSummary`, and `biography`.
- Persistence: Re-fetched profile after page reload / session refresh confirms updated data persisted.

---

## 24. Runtime E2E — Avatar
- Valid PNG avatar upload -> 200 OK, returns `avatarUrl`.
- Valid JPEG avatar upload -> 200 OK.
- Valid WebP avatar upload -> 200 OK.
- Client validation: Unsupported file type (`.txt`) blocked before request.
- Magic-byte validation: Fake image (PNG extension with text buffer) rejected by Backend with 400 `UNSUPPORTED_FILE_TYPE`.
- Oversized file (>5MB) rejected with 413 `FILE_TOO_LARGE`.
- Cache synchronization: Header avatar, Profile avatar, and Auth store synchronized and persisted across F5.

---

## 25. Runtime E2E — Verification
- Initial state: Fresh teacher displays `UNVERIFIED` banner.
- Private upload: Uploaded Front CCCD (PNG), Back CCCD (JPEG), Qualification degree (PDF), and Qualification certificate (WebP).
- Two-step protocol: `POST /api/uploads/private` -> `POST /api/teacher/verification` -> 201 Created.
- State transition: Verification status immediately updates to `PENDING`.
- Duplicate submit prevention: Controls disabled in UI; direct API call returns 409 `VERIFICATION_PENDING`.

---

## 26. Runtime E2E — Admin Review
- Logged in as Admin (`admin@test.com`).
- Opened Teacher Verification Detail (`/admin/teachers/verifications/:teacherId`).
- Image identity preview displayed via Ant Design `<Image>`.
- PDF qualification certificate displayed with "Xem PDF" modal action (no broken `<img>` icon).
- Admin approved teacher -> Teacher status became `VERIFIED`.
- Tested Admin rejection on second test teacher with `reviewNote`: Teacher status updated to `REJECTED`, displayed note, and enabled resubmission.

---

## 27. Runtime E2E — Scholarship Proof
- Opened Admin Scholarship Application Review (`/admin/scholarship-applications/:id`).
- Fixed property mapping: `file.url` successfully recognized.
- Action button enabled with `PrivateDocumentCard` for viewing proof documents.
- Both image proofs and PDF proofs handled with MIME awareness.

---

## 28. Responsive Audit
Audited Teacher Profile, Verification Modal, Admin Verification Detail, and Scholarship Review Detail at:
- **Desktop (1440x900)**: PASS (scrollWidth <= 1440, no horizontal overflow).
- **Tablet (768x1024)**: PASS (scrollWidth <= 768, grids wrap cleanly).
- **Mobile (390x844)**: PASS (scrollWidth <= 390, modal buttons stack properly).

---

## 29. Accessibility
- All Upload controls feature explicit text labels and accepted format indicators.
- Document view/download buttons contain accessible text and tooltips.
- Verification status banners use icons (`CheckCircleFilled`, `ClockCircleFilled`, `CloseCircleFilled`, `InfoCircleFilled`) and clear descriptive Vietnamese text in addition to colors.
- PDF preview modal supports keyboard navigation and Escape dismissal.

---

## 30. Regression
- **Auth**: Login, refresh, and logout remain functional.
- **Teacher navigation**: Classes, courses, revenue, and reviews routes unaffected.
- **Admin actions**: Verification list filtering, approval, and rejection operate normally.
- **Scholarship review**: Request information, approve, and reject mutations continue to function.
- **Profile service**: Compatible with all consumer roles without type regressions.

---

## 31. Known Backend/Data Gaps
1. **PROFILE_NOT_EDITABLE on legacy uninitialized accounts**:
   - Accounts seeded or created without an embedded `teacherProfile` subdocument in MongoDB receive 400 `PROFILE_NOT_EDITABLE` when calling `POST /api/me/avatar`.
   - Frontend safely catches and explains this gap: *"Hồ sơ giáo viên chưa được khởi tạo đầy đủ. Không thể cập nhật ảnh đại diện."*
   - Per Backend Freeze rules, no manual database modification was made.
2. **Avatar format limitation**:
   - Current Backend contract strictly allows only JPEG, PNG, and WebP (max 5MB). Formats like AVIF, HEIC, and SVG are unsupported by design.

---

## 32. TypeScript
- Command: `npx tsc -b`.
- Result: **PASS** (Exit code 0, zero diagnostic errors).

---

## 33. Build
- Command: `npm run build` (`tsc -b && vite build`).
- Result: **PASS** (Built in 2.13s, production bundle generated successfully).

---

## 34. Backend Files Modified
**NONE** (0 files changed).

---

## 35. Final Status
**PASS**

---

## RUNTIME MATRIX

| Scenario | Result |
|---|---|
| Teacher profile GET | PASS |
| Teacher profile PATCH | PASS |
| Profile persists after F5 | PASS |
| Valid PNG avatar | PASS |
| Valid JPEG avatar | PASS |
| Valid WebP avatar | PASS |
| Avatar header sync | PASS |
| Avatar profile sync | PASS |
| Avatar F5 persistence | PASS |
| Unsupported avatar type | PASS |
| Avatar >5MB | PASS |
| Fake image magic-byte rejection | PASS |
| PROFILE_NOT_EDITABLE handling | PASS |
| Fresh Teacher UNVERIFIED | PASS |
| Identity upload | PASS |
| Qualification image upload | PASS |
| Qualification PDF upload | PASS |
| No stale upload accumulation | PASS |
| File remove/reselect | PASS |
| Verification submit 201 | PASS |
| Verification becomes PENDING | PASS |
| PENDING submit disabled | PASS |
| VERIFIED submit disabled | PASS |
| Admin identity image preview | PASS |
| Admin PDF document view | PASS |
| Admin approve | PASS |
| Admin reject | PASS |
| Teacher VERIFIED state refresh | PASS |
| Rejected-state behavior | PASS |
| Scholarship proof link | PASS |
| Scholarship PDF proof view | PASS |
| Scholarship image proof view | PASS |
| Signed URLs not persisted | PASS |
| Non-admin document access blocked | PASS |
| Desktop responsive | PASS |
| Tablet responsive | PASS |
| Mobile responsive | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Backend files changed = 0 | PASS |
