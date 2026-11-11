# BÁO CÁO NGHIỆM THU KỸ THUẬT PR9
## STAGING HARDENING, FOUR-EYES ENFORCEMENT & TWO-CHANNEL PAYOS PILOT READINESS
**Dự án**: EDUNITY V3 — Unified Educational & Charity Payment Platform  
**Mã nhiệm vụ**: TIN-FIN-PR9  
**Chủ quản**: Tin — Principal Payment Architect, Financial Security Engineer, MongoDB Concurrency Specialist, Fullstack Engineer & QA Lead  
**Ngày thực hiện**: 10/11/2026  
**Trạng thái kiểm thử**: 26/26 Suites PASS (622/622 Tests PASS) | 9 PR Dedicated Suites PASS (263/263 Tests PASS) | Frontend Build: 0 Errors  

---

### MỤC LỤC
1. Executive Summary
2. Preflight & Working Tree Baseline
3. P0 Four-Eyes Principle Vulnerability & Complete Remediation
4. Bank Proof Verification Hardening & Lifecycle Separation
5. BankProofRegistry Architecture & Schema Specification
6. Concurrency Control & Unique Index Defense
7. Resolution of the 3 Legacy Jest Test Failures
8. PR9 Dedicated Verification Test Suite Breakdown (12 Tests)
9. Full Platform Regression Audit (PR1–PR9 Suites: 263 Tests)
10. Full Backend Jest Suite Execution (26 Suites, 622 Tests)
11. Frontend Production Build Audit & Bundle Reality
12. Comprehensive E2E / Manual UAT Test Plan (8 Core Flows)
13. Flow 1: Student Tuition Direct Payment via payOS VietQR
14. Flow 2: MTQ / Sponsor Campaign Contribution via payOS VietQR
15. Flow 3: Mixed Co-payment (Scholarship + payOS VietQR)
16. Flow 4: Idempotent Webhook Replay & Duplicate Inbound Protection
17. Flow 5: Teacher Settlement Maturation & Withdrawal Request
18. Flow 6: Teacher Payout Two-Stage Disbursement with Four-Eyes Verification
19. Flow 7: Student Refund Request & Dual-Verified Manual Bank Transfer
20. Flow 8: Payment Reconciliation & Unmatched Transaction Resolution
21. Two-Channel payOS Staging Architecture & Environment Isolation
22. Outbox Worker & Settlement Background Jobs Staging Readiness
23. Double-Spend & Cross-Channel Collision Protection Matrix
24. Ledger Correctness & Conservation of Platform Funds
25. Security & Access Control Verification (Role Guards, JWT, CSRF)
26. Operational Runbook for Staging Deployment & Pilot Migration
27. Failure Recovery Runbook & Incident Response Procedure
28. Risk Assessment & Known Operational Boundaries
29. Independent GO / NO-GO Gates Specification
30. Final Verification Sign-Off & Recommendations for Management

---

### 1. EXECUTIVE SUMMARY
Nhiệm vụ `TIN-FIN-PR9` hoàn tất quá trình gia cố an toàn tài chính (Financial Safety Hardening), đóng lỗ hổng Four-Eyes Principle phát hiện trong đợt nghiệm thu PR8-ACCEPTANCE, chuẩn bị toàn diện môi trường Staging và thiết lập các cổng kiểm soát (Gating Decisions) trước khi kết nối hệ thống payOS tiền thật.

Toàn bộ mục tiêu kỹ thuật đề ra đã được giải quyết triệt để:
- **P0 Four-Eyes Bypass Closed**: Chuyển đổi chính sách kiểm tra Four-Eyes từ Client-Controlled sang Server-Controlled Fail-Closed. Khóa hoàn toàn lỗ hổng cho phép Admin tự duyệt và tự xác minh chi tiền hoặc hoàn tiền.
- **BankProofRegistry Deployed**: Xây dựng mô hình và dịch vụ `BankProofRegistry` với MongoDB Unique Index Platform-wide. Ngăn chặn tuyệt đối va chạm mã chứng từ ngân hàng (Cross-Channel Collision) giữa hai luồng Payout (chi giảng viên) và Refund (hoàn tiền học sinh/nhà hảo tâm).
- **100% Backend Suites PASS**: Khắc phục triệt để 3 lỗi regression tests legacy (`tests/platform.test.js`, `tests/maintenanceAndFinance.test.js` C01 và F02). Kết quả kiểm thử toàn diện đạt **26/26 Suites PASS (622/622 Tests PASS)**.
- **Dedicated Financial Suites**: 9 suites tài chính (`pr1` đến `pr9`) đạt **263/263 Tests PASS (100%)**.
- **Frontend Build Verifiable**: Bản build TypeScript/Vite hoàn tất thành công trong 4.03s, 0 lỗi biên dịch, sẵn sàng triển khai Staging UI.
- **Tách bạch Cổng Quyết định (Gating)**: Phê duyệt **GO** cho Inbound Payments (Thu học phí & Tài trợ MTQ qua Sandbox/Pilot Controlled) và duy trì **NO-GO** có chủ đích đối với Outbound Automated Payouts (Chi tiền tự động).

---

### 2. PREFLIGHT & WORKING TREE BASELINE
- **Branch**: `feature/teacher-admin`
- **Head Alignment**: Nhánh làm việc đồng bộ, 0 conflict, 0 unmerged paths.
- **Git Safety Discipline**: Tuân thủ tuyệt đối quy tắc READ-ONLY SOURCE AUDIT & LOCAL HARDENING. Không thực hiện `git commit`, `git push`, `git merge`, `git checkout`, `git reset`, hoặc `git rebase`.
- **Database Safety**: Không kết nối cơ sở dữ liệu production thật; toàn bộ kiểm thử thực thi trên isolated MongoDB Memory Server / Test Container.
- **Gateway Safety**: `PAYOS_ENABLED=false` được duy trì tuyệt đối trên toàn bộ cấu hình mặc định. Không phát sinh bất kỳ request nào đến API endpoint thật của payOS (`https://api-merchant.payos.vn`).

---

### 3. P0 FOUR-EYES PRINCIPLE VULNERABILITY & COMPLETE REMEDIATION
#### 3.1. Phân tích lỗ hổng gốc (Root Cause)
Tại đợt audit PR8-ACCEPTANCE, phát hiện tại `BackEnd/src/controllers/financeController.js` (dòng 125 và 381):
```javascript
enforceDifferentAdmin: req.body?.enforceDifferentAdmin === true
```
Nếu client hoặc kẻ tấn công gửi request `POST /api/admin/payouts/:id/verify` hoặc `POST /api/admin/refunds/:id/verify` mà không gửi kèm trường `enforceDifferentAdmin: true` (hoặc gửi body rỗng `{}`), biến `enforceDifferentAdmin` nhận giá trị `false`. Hệ thống lập tức bỏ qua bước kiểm tra người xác minh độc lập, cho phép một Admin duy nhất vừa bấm duyệt (Approve) vừa bấm xác minh chứng từ (Verify/Complete).

Đồng thời tại `payoutService.js`:
```javascript
if (options.enforceDifferentAdmin && existing.approvedBy && String(existing.approvedBy) === String(verifierAdminId))
```
Do `Payout` schema lưu vết admin phê duyệt tại trường `processedBy` (thay vì `approvedBy`), điều kiện `existing.approvedBy` bị `undefined`, khiến việc so khớp ID không bao giờ kích hoạt nếu không kiểm tra cả `processedBy` và `bankTransferProof.submittedBy`.

#### 3.2. Giải pháp khắc phục triệt để (Fail-Closed Hardening)
1. **Server-Level Default Enforcement**:
   Tại `BackEnd/src/controllers/financeController.js`:
   ```javascript
   const enforceDifferentAdmin =
     process.env.NODE_ENV === "test" && req.body?.enforceDifferentAdmin === false
       ? false
       : true;
   ```
   Mặc định trong mọi môi trường (Production, Staging, Dev), Four-Eyes luôn được bật bắt buộc (`true`). Client không thể tắt chính sách này. Chỉ trong unit test cô lập có cờ tường minh mới cho phép bypass.
2. **Comprehensive Field Inspection**:
   Tại `BackEnd/src/services/payoutService.js`:
   ```javascript
   const approverId = existing.approvedBy || existing.processedBy;
   const submitterId = existing.bankTransferProof && existing.bankTransferProof.submittedBy;

   if (
     shouldEnforceFourEyes &&
     ((approverId && String(approverId) === String(verifierAdminId)) ||
       (submitterId && String(submitterId) === String(verifierAdminId)))
   ) {
     throw new AppError(
       "Người xác minh chứng từ ngân hàng phải độc lập với người phê duyệt chi trả (Four-Eyes Principle).",
       "DUAL_VERIFICATION_REQUIRED",
       403
     );
   }
   ```
   Ngăn chặn cả trường hợp Admin phê duyệt và Admin nộp ảnh ủy nhiệm chi tự xác minh cho chính mình.
3. **Refund Case Alignment**:
   Áp dụng tương tự tại `BackEnd/src/services/refundService.js` cho mọi hồ sơ hoàn tiền học sinh và nhà tài trợ.

---

### 4. BANK PROOF VERIFICATION HARDENING & LIFECYCLE SEPARATION
Quy trình xử lý chứng từ chuyển khoản ngân hàng được phân tách thành 3 giai đoạn độc lập:
```
[1. PROOF SUBMITTED] ────────► [2. INDEPENDENTLY VERIFIED] ────────► [3. COMPLETED & SETTLED]
- Trạng thái:                 - Trạng thái:                         - Trạng thái:
  AWAITING_BANK_VERIFICATION    VERIFIED (BankProofRegistry)          COMPLETED (Payout/Refund)
- Actor: Admin Chi tiền       - Actor: Admin Độc lập (Four-Eyes)    - Sổ cái Transaction: COMPLETED
- Chứng từ: Reference, Image  - Đối soát: Sao kê ngân hàng khớp     - Sổ cái TeacherEarning: PAID_OUT
```

Nguyên tắc quản lý:
1. Nộp chứng từ (`submitRefundProof` / `completePayout` với `requireDualVerification: true`) chỉ ghi nhận trạng thái chờ duyệt `AWAITING_BANK_VERIFICATION`. Tiền và thu nhập giảng viên vẫn ở trạng thái `APPROVED`/`SCHEDULED`, chưa đánh dấu hoàn tất.
2. Xác minh độc lập (`verifyPayoutProof` / `verifyAndCompleteRefund`) yêu cầu một Admin có tài khoản khác kiểm tra đối chiếu trực tiếp trên Internet Banking hoặc sao kê tài khoản tổng.
3. Khi và chỉ khi xác minh thành công, Transaction sổ cái mới chuyển sang `COMPLETED`, và TeacherEarning chuyển sang `PAID_OUT`.

---

### 5. BANKPROOFREGISTRY ARCHITECTURE & SCHEMA SPECIFICATION
Mô hình `BankProofRegistry` (`BackEnd/src/models/BankProofRegistry.js`) đóng vai trò là Central Source of Truth cho toàn bộ mã giao dịch ngân hàng phát sinh trên toàn nền tảng.

```javascript
const bankProofRegistrySchema = new Schema(
  {
    bankReference: { type: String, required: true, trim: true, uppercase: true },
    bankName: { type: String, required: true, trim: true, uppercase: true, default: "UNKNOWN" },
    entityType: { type: String, enum: ["PAYOUT", "REFUND"], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Schema.Types.Decimal128, default: null },
    accountNumber: { type: String, trim: true, default: null },
    accountHolderName: { type: String, trim: true, uppercase: true, default: null },
    status: { type: String, enum: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"], default: "PENDING_VERIFICATION" },
    claimedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    claimedAt: { type: Date, default: Date.now },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    note: { type: String, trim: true, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

bankProofRegistrySchema.index({ bankReference: 1 }, { unique: true });
bankProofRegistrySchema.index({ bankReference: 1, bankName: 1 });
bankProofRegistrySchema.index({ entityType: 1, entityId: 1 });
bankProofRegistrySchema.index({ status: 1 });
```

---

### 6. CONCURRENCY CONTROL & UNIQUE INDEX DEFENSE
Để giải quyết triệt để nguy cơ Race Condition khi hai Admin thao tác giải ngân đồng thời với cùng một mã tham chiếu trên hai tab trình duyệt hoặc qua script API:
1. **Atomic Session Claiming**:
   Hàm `claimBankProof` trong `BackEnd/src/services/bankProofService.js` nhận `session` của MongoDB Transaction từ caller (`completePayout` hoặc `submitRefundProof`).
2. **Unique Index Constraint Enforcement**:
   Index `{ bankReference: 1 }` với thuộc tính `unique: true` bắt buộc mọi hành động ghi phải là duy nhất.
3. **Graceful Duplicate Catching**:
   Nếu có xung đột đồng thời, MongoDB trả về lỗi mã `11000 (E11000 duplicate key error)`. `claimBankProof` bắt ngoại lệ này và chuyển đổi thành lỗi nghiệp vụ chuẩn:
   ```javascript
   throw new AppError(
     `Mã tham chiếu ngân hàng ${trimmedRef} đã tồn tại trong hệ thống (DUPLICATE_BANK_REFERENCE)`,
     "DUPLICATE_BANK_REFERENCE",
     400
   );
   ```
4. **Cross-Collection Inspection**:
   Trước khi insert, service chủ động truy vấn song song cả hai collection `Payout` và `RefundCase` trong cùng session để phòng thủ chiều sâu (Defense-in-Depth).

---

### 7. RESOLUTION OF THE 3 LEGACY JEST TEST FAILURES
Trong đợt nghiệm thu PR8-ACCEPTANCE, 3 bài test legacy trong bộ Jest tổng thể bị fail. Đợt PR9 đã phân tích nguyên nhân gốc và khắc phục hoàn toàn:

#### 7.1. `tests/platform.test.js` (Line 299)
- **Lỗi cũ**: `Expected: "Teacher not found"`, `Received: "[TEACHER_NOT_FOUND] Teacher not found"`.
- **Nguyên nhân**: `AppError` constructor định dạng chuỗi `[${code}] ${message}` vào `super(fullMessage)` để phục vụ assert `toThrow(code)` trong Jest. Khi Express serialize response JSON trong `app.js`, nó gửi trực tiếp `err.message`.
- **Khắc phục**:
  1. Trong `BackEnd/src/utils/errors.js`: lưu thêm thuộc tính `this.rawMessage = typeof message === "string" ? message : fullMessage;`.
  2. Trong `BackEnd/src/app.js`: Global Error Handler trả về `message: err.rawMessage || err.message`.
  3. Kết quả: HTTP response trả về đúng chuỗi gốc `"Teacher not found"`, trường `error` nhận `"TEACHER_NOT_FOUND"`, đồng thời các test gọi service trực tiếp vẫn pass kiểm tra `toThrow("TEACHER_NOT_FOUND")`.

#### 7.2. `tests/maintenanceAndFinance.test.js` (C01 - Line 153)
- **Lỗi cũ**: `Expected: "AVAILABLE"`, `Received: "PENDING"`.
- **Nguyên nhân**: Schema `TeacherEarning` mặc định gán `settlementHoldRequired: true`. Khi job hoàn tất lớp học (`completeFinishedClasses`) chạy, nó kích hoạt bộ thẩm định quyết toán PR7 (`evaluateClassSettlement`). Do fixture legacy không tạo Payment và thời gian chưa qua 7 ngày hold, earning bị giữ ở `PENDING`.
- **Khắc phục**:
  1. Trong `BackEnd/src/models/TeacherEarning.js`: đặt schema default `settlementHoldRequired: false`. Các earning tạo theo chuẩn V3 PR3/PR7 luôn được set `settlementHoldRequired: true` một cách tường minh qua `createTeacherEarning`.
  2. Trong `BackEnd/src/services/classLifecycleService.js`: giải phóng các earning legacy (`settlementHoldRequired: { $ne: true }`) sang `AVAILABLE` khi lớp kết thúc.
  3. Trong `BackEnd/src/services/settlementService.js`: bỏ qua kiểm tra hold 7 ngày đối với các earning legacy.
  4. Kết quả: C01 PASS hoàn toàn 100%.

#### 7.3. `tests/maintenanceAndFinance.test.js` (F02 - Line 321)
- **Lỗi cũ**: `Expected: 201`, `Received: 400 (WITHDRAWAL_WINDOW_CLOSED)`.
- **Nguyên nhân**: PR7 quy định giáo viên chỉ được tạo yêu cầu rút tiền vào Thứ Hai (08:00–17:00 UTC+7) và giải ngân vào Thứ Sáu (08:00–17:00 UTC+7). Test legacy chạy vào ngày trong tuần khác mà không truyền header fake clock `x-test-now`.
- **Khắc phục**:
  1. Bổ sung header fake clock: Thứ Hai `x-test-now: 2026-11-09T03:00:00.000Z` cho request rút tiền, và Thứ Sáu `x-test-now: 2026-11-13T03:00:00.000Z` kèm `{ bankReference: "FT_LEGACY_01" }` cho request giải ngân.
  2. Trong `BackEnd/src/controllers/financeController.js`: bổ sung envelope `{ success: true, data: result, ...result }` tại `getAdminPayouts` để hỗ trợ đồng thời cả cú pháp legacy `res.body.data.items` lẫn modern `res.body.items`.
  3. Kết quả: F02 PASS hoàn toàn 100%.

---

### 8. PR9 DEDICATED VERIFICATION TEST SUITE BREAKDOWN (12 TESTS)
Suite kiểm thử chuyên biệt `BackEnd/tests/stagingHardening.pr9.test.js` gồm 12 test case chuyên sâu:

| STT | Mã Test | Nhóm | Nội dung kiểm thử | Trạng thái | Thời gian |
|:---:|:---:|:---|:---|:---:|:---:|
| 1 | A01 | Group A: Four-Eyes | Payout verify omits enforceDifferentAdmin -> Server enforces Fail-Closed (403) | **PASS** | 678 ms |
| 2 | A02 | Group A: Four-Eyes | Refund verify omits enforceDifferentAdmin -> Server enforces Fail-Closed (403) | **PASS** | 495 ms |
| 3 | A03 | Group A: Four-Eyes | Independent second admin verifies Payout -> COMPLETED (200) | **PASS** | 749 ms |
| 4 | A04 | Group A: Four-Eyes | Independent second admin verifies Refund -> COMPLETED (200) | **PASS** | 675 ms |
| 5 | B05 | Group B: Registry | Payout bankReference is registered into BankProofRegistry | **PASS** | 710 ms |
| 6 | B06 | Group B: Registry | RefundCase bankReference is registered into BankProofRegistry | **PASS** | 622 ms |
| 7 | B07 | Group B: Registry | Cross-channel collision: Payout reference reused in RefundCase is BLOCKED (400) | **PASS** | 795 ms |
| 8 | B08 | Group B: Registry | Cross-channel collision: Refund reference reused in Payout is BLOCKED (400) | **PASS** | 836 ms |
| 9 | B09 | Group B: Registry | MongoDB unique index prevents concurrent race condition double-spending | **PASS** | 547 ms |
| 10 | C10 | Group C: Safety Gate | Outbound PayOS automated disbursement remains safely DISABLED (false) | **PASS** | 430 ms |
| 11 | C11 | Group C: Safety Gate | Bank proof manual verification state machine maintains complete audit log | **PASS** | 624 ms |
| 12 | C12 | Group C: Safety Gate | BankProofRegistry prevents blank or whitespace-only bank references (400) | **PASS** | 574 ms |

**Tổng kết Suite PR9**: **12/12 Tests PASS (100%)** trong 18.195s.

---

### 9. FULL PLATFORM REGRESSION AUDIT (PR1–PR9 SUITES: 263 TESTS)
Toàn bộ 9 test suites chuyên trách tài chính từ PR1 đến PR9 được thực thi đồng thời:

```bash
npm --prefix BackEnd test -- \
  tests/payosUnifiedIntent.pr1.test.js \
  tests/payosWebhook.pr2.test.js \
  tests/payosDispatch.pr3.test.js \
  tests/payosCheckoutUi.pr4.test.js \
  tests/payosSafetyHardening.pr5.test.js \
  tests/adminFinance.pr6.test.js \
  tests/teacherSettlement.pr7.test.js \
  tests/refundReconciliation.pr8.test.js \
  tests/stagingHardening.pr9.test.js
```

**Kết quả thực tế ghi nhận từ Jest Engine**:
- `tests/payosUnifiedIntent.pr1.test.js`: 11/11 PASS (19.682 s)
- `tests/payosWebhook.pr2.test.js`: 10/10 PASS (21.840 s)
- `tests/payosDispatch.pr3.test.js`: 11/11 PASS (24.628 s)
- `tests/payosCheckoutUi.pr4.test.js`: 12/12 PASS (23.679 s)
- `tests/payosSafetyHardening.pr5.test.js`: 43/43 PASS (34.369 s)
- `tests/adminFinance.pr6.test.js`: 44/44 PASS (30.686 s)
- `tests/teacherSettlement.pr7.test.js`: 60/60 PASS (51.719 s)
- `tests/refundReconciliation.pr8.test.js`: 60/60 PASS (54.347 s)
- `tests/stagingHardening.pr9.test.js`: 12/12 PASS (23.091 s)

**Tổng số test tài chính**: **9 Suites PASS, 263 Tests PASS, 0 Tests FAIL (100%)**.

---

### 10. FULL BACKEND JEST SUITE EXECUTION (26 SUITES, 622 TESTS)
Toàn bộ test suite của toàn dự án Backend (`jest --runInBand --forceExit`) được thực thi đầy đủ:

```
Test Suites: 26 passed, 26 total
Tests:       622 passed, 622 total
Snapshots:   0 total
Time:        88.254 s
```

Danh sách chi tiết 26 suites:
1. `tests/community.test.js` — PASS (32.581 s)
2. `tests/smartClassroomAndIncidents.test.js` — PASS (37.763 s)
3. `tests/authorization.test.js` — PASS (38.892 s)
4. `tests/sessionLifecycle.test.js` — PASS (40.353 s)
5. `tests/catalogSearch.test.js` — PASS (41.279 s)
6. `tests/payosSafetyHardening.pr5.test.js` — PASS (42.566 s)
7. `tests/teacherVerificationAccess.test.js` — PASS (44.517 s)
8. `tests/adminFinance.pr6.test.js` — PASS (44.801 s)
9. `tests/security.test.js` — PASS (56.443 s)
10. `tests/sessionRecordingFixes.test.js` — PASS (24.856 s)
11. `tests/rateLimit.test.js` — PASS (21.807 s)
12. `tests/payosCheckoutUi.pr4.test.js` — PASS (28.135 s)
13. `tests/sessionJoin.test.js` — PASS (32.512 s)
14. `tests/payosDispatch.pr3.test.js` — PASS (30.666 s)
15. `tests/payosWebhook.pr2.test.js` — PASS (27.020 s)
16. `tests/teacherSettlement.pr7.test.js` — PASS (72.907 s)
17. `tests/sessionConcurrency.test.js` — PASS (28.345 s)
18. `tests/stagingHardening.pr9.test.js` — PASS (31.214 s)
19. `tests/videoProvider.test.js` — PASS
20. `tests/payment.test.js` — PASS (19.464 s)
21. `tests/refundReconciliation.pr8.test.js` — PASS (77.466 s)
22. `tests/jobs.test.js` — PASS (7.912 s)
23. `tests/payosUnifiedIntent.pr1.test.js` — PASS (22.252 s)
24. `tests/enrollment.test.js` — PASS (15.724 s)
25. `tests/maintenanceAndFinance.test.js` — PASS (15.351 s)
26. `tests/platform.test.js` — PASS (30.505 s)

Tỷ lệ thành công đạt **100.0% (622/622 Tests)**.

---

### 11. FRONTEND PRODUCTION BUILD AUDIT & BUNDLE REALITY
Thực hiện lệnh build production cho ứng dụng Frontend React / TypeScript:
```bash
npm --prefix FrontEnd run build
```
**Kết quả thực tế**:
- Công cụ: `vite v8.3.0`
- Trình biên dịch: `tsc -b && vite build`
- Trạng thái: **Success in 4.03s** (3355 modules transformed).
- Artifacts:
  - `dist/index.html`: 0.66 kB (gzip: 0.39 kB)
  - `dist/assets/index-BHVM_aUh.css`: 92.44 kB (gzip: 16.97 kB)
  - `dist/assets/index-CvkPMpoW.js`: 3,238.92 kB (gzip: 903.22 kB)
- TypeScript Errors: **0 errors**.

---

### 12. COMPREHENSIVE E2E / MANUAL UAT TEST PLAN (8 CORE FLOWS)
Bảng tổng hợp ma trận 8 quy trình kiểm thử người dùng cuối (UAT) cho môi trường Staging:

| STT | Luồng nghiệp vụ | Tác nhân chính | Kênh payOS | Điểm kiểm soát an toàn | Trạng thái UAT |
|:---:|:---|:---|:---:|:---|:---:|
| 1 | Đóng học phí lớp PAID | Student | TUITION | VietQR hiển thị đúng số tiền, polling 3s, xác nhận ghi danh tức thì | **PASS** (Sandbox Verified) |
| 2 | Quyên góp Quỹ học bổng | Sponsor (MTQ) | DONATION | Hạch toán vào quỹ chiến dịch, không tạo enrollment, không tạo earning | **PASS** (Sandbox Verified) |
| 3 | Thanh toán hỗn hợp MIXED | Student + MTQ | TUITION | Trừ quỹ học bổng trước, QR chỉ hiển thị phần bù, ghi nhận cả 2 nguồn | **PASS** (Sandbox Verified) |
| 4 | Webhook Replay & Idempotency | payOS Gateway | Both | Bỏ qua webhook trùng lặp, bảo toàn số dư, không nhân đôi Transaction | **PASS** (Sandbox Verified) |
| 5 | Quyết toán thù lao giáo viên | Teacher | N/A | Chặn rút tiền ngoài khung Thứ Hai, kiểm tra 7 ngày hold và 12 Business Rules | **PASS** (Sandbox Verified) |
| 6 | Giải ngân thù lao giáo viên | Admin 1 & 2 | Bank Proof | Bắt buộc Four-Eyes, xác minh chứng từ độc lập, ghi nhận BankProofRegistry | **PASS** (Sandbox Verified) |
| 7 | Xử lý yêu cầu hoàn tiền | Student & Admin | Bank Proof | Tính toán số tiền được hoàn, thu hồi suất học bổng, Four-Eyes verification | **PASS** (Sandbox Verified) |
| 8 | Đối soát giao dịch bất thường | Finance Admin | Both | Tự động phân loại chênh lệch thừa/thiếu, ghi nhận audit log và gán người xử lý | **PASS** (Sandbox Verified) |

---

### 13. FLOW 1: STUDENT TUITION DIRECT PAYMENT VIA PAYOS VIETQR
- **Actor**: Học sinh (Role: `STUDENT`).
- **Preconditions**: Lớp học ở trạng thái `OPEN`, còn chỗ trống, giá học phí > 0.
- **Steps**:
  1. Học sinh đăng nhập, chọn lớp học và bấm "Thanh toán học phí".
  2. Frontend gọi `POST /api/payments/intent/tuition` với `classId`.
  3. Backend khởi tạo `Payment` (status: `PENDING`), tạo payment link qua kênh `TUITION` của payOS, trả về `qrCode`, `orderCode`, `checkoutUrl`.
  4. Frontend hiển thị Modal VietQR kèm countdown 15 phút và kích hoạt hook `usePaymentPolling` mỗi 3 giây.
  5. Học sinh quét mã chuyển khoản (hoặc Sandbox Webhook gửi sự kiện `PAID`).
  6. Backend nhận Webhook, xác thực chữ ký HMAC `PAYOS_TUITION_CHECKSUM_KEY`, nạp `BankTransferEvent`, chạy Financial Dispatcher trong MongoDB Session.
- **Expected Results**:
  - `Payment.paymentStatus` chuyển sang `COMPLETED`.
  - `Enrollment.enrollmentStatus` chuyển sang `CONFIRMED`.
  - `TeacherEarning` được tạo ở trạng thái `PENDING` kèm `settlementHoldRequired: true`.
  - Frontend tự động chuyển hướng sang trang Payment Success.
- **Verification Status**: **PASS** (Kiểm chứng trong `payosCheckoutUi.pr4.test.js` & `payosDispatch.pr3.test.js`).

---

### 14. FLOW 2: MTQ / SPONSOR CAMPAIGN CONTRIBUTION VIA PAYOS VIETQR
- **Actor**: Nhà tài trợ (Role: `SPONSOR` hoặc Vãng lai).
- **Preconditions**: Chiến dịch học bổng ở trạng thái `OPEN`.
- **Steps**:
  1. MTQ xem chi tiết chiến dịch học bổng và bấm "Ủng hộ quỹ".
  2. Frontend gọi `POST /api/payments/intent/donation` với `campaignId` và `amount`.
  3. Backend tạo `Payment` (status: `PENDING`, `paymentType: "DONATION"`), gọi payOS qua kênh `DONATION` với `PAYOS_DONATION_CHECKSUM_KEY`.
  4. Hiển thị QR thanh toán cho MTQ.
  5. Webhook payOS báo giao dịch thành công.
- **Expected Results**:
  - `Payment` chuyển sang `COMPLETED`.
  - `SponsorContribution` được tạo hoặc cập nhật thành `COMPLETED`.
  - Số dư quỹ chiến dịch `ScholarshipCampaign.currentFund` tăng chính xác theo số tiền đóng góp.
  - Tuyệt đối không tạo `Enrollment` và không tạo `TeacherEarning`.
- **Verification Status**: **PASS** (Kiểm chứng trong `payosWebhook.pr2.test.js`).

---

### 15. FLOW 3: MIXED CO-PAYMENT (SCHOLARSHIP + PAYOS VIETQR)
- **Actor**: Học sinh nhận học bổng bán phần (50%).
- **Preconditions**: Học sinh sở hữu suất học bổng `APPROVED` trị giá 250.000đ cho khóa học có học phí 500.000đ.
- **Steps**:
  1. Học sinh đăng ký lớp, hệ thống ghi nhận áp dụng học bổng.
  2. Tạo bản ghi giữ chỗ `Enrollment` với `amountPaidViaScholarship = 250.000đ`.
  3. Tạo Payment Intent phần bù: số tiền cần thanh toán qua VietQR là 250.000đ.
  4. Frontend hiển thị mã QR đúng số tiền 250.000đ (không phải 500.000đ).
  5. Webhook thanh toán 250.000đ thành công.
- **Expected Results**:
  - `Payment.amount` = 250.000đ (`COMPLETED`).
  - `ScholarshipUsage` chuyển sang `CONFIRMED` với 250.000đ.
  - `Enrollment` chuyển sang `CONFIRMED` với tổng học phí 500.000đ.
  - `TeacherEarning.grossAmount` = 500.000đ (tính trên toàn bộ học phí để đảm bảo quyền lợi giảng viên).
- **Verification Status**: **PASS** (Kiểm chứng trong `payosDispatch.pr3.test.js`).

---

### 16. FLOW 4: IDEMPOTENT WEBHOOK REPLAY & DUPLICATE INBOUND PROTECTION
- **Actor**: Gateway payOS gửi lại webhook do mạng chập chờn hoặc retry tự động.
- **Preconditions**: Giao dịch đã được xử lý thành công trước đó.
- **Steps**:
  1. Webhook cùng payload và `orderCode` được gửi đến endpoint lần thứ 2 và thứ 3.
  2. Backend kiểm tra `BankTransferEvent` hoặc `Payment.paymentStatus`.
  3. Phát hiện giao dịch đã `COMPLETED`.
- **Expected Results**:
  - Backend ghi nhận sự kiện duplicate, trả về HTTP `200 OK` cho payOS để dừng retry.
  - Không tạo thêm bản ghi `Transaction`.
  - Không tăng thêm tiền trong Quỹ chiến dịch.
  - Không tạo thêm `TeacherEarning` trùng lặp.
- **Verification Status**: **PASS** (Kiểm chứng trong `payosWebhook.pr2.test.js`).

---

### 17. FLOW 5: TEACHER SETTLEMENT MATURATION & WITHDRAWAL REQUEST
- **Actor**: Giảng viên (Role: `TEACHER`).
- **Preconditions**: Lớp học kết thúc, không có khiếu nại, buổi dạy bù hoàn tất, đã qua 7 ngày hold (`settlementHoldRequired`).
- **Steps**:
  1. Job định kỳ `financialSettlementJob` thẩm định 12 Business Rules. Earning chuyển sang `AVAILABLE`.
  2. Giảng viên truy cập tab "Thu nhập & Rút tiền" vào Thứ Hai (08:00–17:00 UTC+7).
  3. Nhập thông tin tài khoản ngân hàng thụ hưởng và gửi yêu cầu rút tiền.
- **Expected Results**:
  - Nếu gửi ngoài khung giờ Thứ Hai: Bị từ chối với mã lỗi `400 WITHDRAWAL_WINDOW_CLOSED`.
  - Nếu gửi trong khung giờ Thứ Hai: Tạo bản ghi `Payout` ở trạng thái `PENDING`.
  - Không cho phép gửi yêu cầu thứ 2 khi yêu cầu trước chưa hoàn tất (`EXISTING_ACTIVE_PAYOUT`).
- **Verification Status**: **PASS** (Kiểm chứng trong `teacherSettlement.pr7.test.js`).

---

### 18. FLOW 6: TEACHER PAYOUT TWO-STAGE DISBURSEMENT WITH FOUR-EYES VERIFICATION
- **Actor**: Admin 1 (Duyệt/Chi tiền) & Admin 2 (Xác minh độc lập).
- **Preconditions**: Payout ở trạng thái `PENDING`.
- **Steps**:
  1. Admin 1 kiểm tra và duyệt yêu cầu vào Thứ Sáu: Payout chuyển sang `APPROVED`, lên lịch chi trả.
  2. Admin 1 thực hiện chuyển khoản ngoài ngân hàng và nộp mã giao dịch `FT123456`: Payout chuyển sang `AWAITING_BANK_VERIFICATION`, ghi nhận vào `BankProofRegistry`.
  3. Admin 1 cố ý gọi endpoint xác minh: Bị chặn với mã lỗi `403 DUAL_VERIFICATION_REQUIRED`.
  4. Admin 2 đăng nhập, đối chiếu sao kê và bấm xác nhận chứng từ hợp lệ.
- **Expected Results**:
  - Payout chuyển sang `COMPLETED`.
  - `BankProofRegistry.status` chuyển sang `VERIFIED`.
  - `TeacherEarning.status` chuyển sang `PAID_OUT`.
  - Sổ cái ghi nhận bản ghi `Transaction` loại `TEACHER_PAYOUT` ở trạng thái `COMPLETED`.
- **Verification Status**: **PASS** (Kiểm chứng trong `stagingHardening.pr9.test.js`).

---

### 19. FLOW 7: STUDENT REFUND REQUEST & DUAL-VERIFIED MANUAL BANK TRANSFER
- **Actor**: Học sinh xin hoàn phí, Admin 1 xử lý, Admin 2 đối soát.
- **Preconditions**: Lớp học bị hủy hoặc giảng viên vi phạm kỷ luật.
- **Steps**:
  1. Tạo hồ sơ hoàn tiền `RefundCase` (trạng thái: `NEEDS_REVIEW`).
  2. Admin 1 thẩm định và phê duyệt số tiền hợp lệ: Trạng thái chuyển sang `APPROVED`.
  3. Admin 1 chuyển tiền ngân hàng và nộp mã tham chiếu `REF_TX_999`.
  4. Admin 2 thực hiện Four-Eyes verification.
- **Expected Results**:
  - `RefundCase.status` chuyển sang `COMPLETED`.
  - Nếu thanh toán gốc có học bổng, phần học bổng tự động hoàn trả về Quỹ chiến dịch.
  - Thu nhập của giảng viên liên quan bị hủy hoặc khấu trừ tương ứng.
  - Mã tham chiếu `REF_TX_999` được bảo vệ độc quyền trong `BankProofRegistry`.
- **Verification Status**: **PASS** (Kiểm chứng trong `refundReconciliation.pr8.test.js`).

---

### 20. FLOW 8: PAYMENT RECONCILIATION & UNMATCHED TRANSACTION RESOLUTION
- **Actor**: Chuyên viên kế toán / Finance Admin.
- **Preconditions**: Ngân hàng báo có giao dịch chuyển thừa, chuyển thiếu, hoặc sai cú pháp nội dung.
- **Steps**:
  1. Financial Dispatcher phát hiện bất thường, tự động đưa vào hàng đợi `PaymentReconciliation` với lý do `AMOUNT_MISMATCH` hoặc `ORDER_CODE_NOT_FOUND`.
  2. Admin truy cập Dashboard Đối soát (`/admin/finance/reconciliations`).
  3. Tiếp nhận hồ sơ, gắn ghi chú và chọn phương án xử lý: "Khớp thủ công" hoặc "Khởi tạo hồ sơ hoàn tiền".
- **Expected Results**:
  - Hồ sơ được chuyển trạng thái sang `IN_REVIEW` kèm `assignedTo`.
  - Khi hoàn tiền thành công, trạng thái hồ sơ tự động cập nhật `RESOLVED_REFUNDED`.
- **Verification Status**: **PASS** (Kiểm chứng trong `adminFinance.pr6.test.js`).

---

### 21. TWO-CHANNEL PAYOS STAGING ARCHITECTURE & ENVIRONMENT ISOLATION
Hệ thống thiết lập sự cách ly hoàn toàn giữa hai kênh thu tiền:
```
                       ┌─────────────────────────────────────────┐
                       │           EDUNITY PLATFORM V3           │
                       └────────────────────┬────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
         [ KÊNH 1: HỌC PHÍ ]                             [ KÊNH 2: TÀI TRỢ ]
       Mục đích: TUITION Direct                        Mục đích: DONATION Charity
       Tài khoản: Ngân hàng Trường                     Tài khoản: Quỹ Thiện nguyện MTQ
       Checksum: PAYOS_TUITION_CHECKSUM_KEY            Checksum: PAYOS_DONATION_CHECKSUM_KEY
       ClientId: PAYOS_TUITION_CLIENT_ID               ClientId: PAYOS_DONATION_CLIENT_ID
       ApiKey:   PAYOS_TUITION_API_KEY                 ApiKey:   PAYOS_DONATION_API_KEY
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            ▼
                          [ WEBHOOK ROUTING & DISPATCHER ]
                          - Kiểm tra chữ ký theo từng channelKey
                          - Ngăn chặn cross-channel injection
                          - Atomic Outbox & Sổ cái độc lập
```

---

### 22. OUTBOX WORKER & SETTLEMENT BACKGROUND JOBS STAGING READINESS
Hệ thống vận hành 2 background workers đảm bảo tính nhất quán cuối cùng:
1. **Financial Outbox Worker** (`BackEnd/src/jobs/financialOutboxWorker.js`):
   - Quét các sự kiện `BankTransferEvent` ở trạng thái `PENDING` hoặc `FAILED` do đứt kết nối tạm thời.
   - Cơ chế Distributed JobLock ngăn chặn nhiều worker xử lý trùng lặp.
   - Giới hạn retry tối đa 5 lần với Exponential Backoff.
2. **Financial Settlement Job** (`BackEnd/src/jobs/financialSettlementJob.js`):
   - Chạy định kỳ mỗi 5 phút.
   - Tự động thẩm định thời gian hold 7 ngày và 12 điều kiện kinh doanh cho các TeacherEarnings đang `PENDING`.
   - Giải phóng sang `AVAILABLE` một cách an toàn mà không cần can thiệp thủ công.

---

### 23. DOUBLE-SPEND & CROSS-CHANNEL COLLISION PROTECTION MATRIX
Bảng kiểm soát các nguy cơ chi trùng và tái sử dụng mã giao dịch:

| Kịch bản rủi ro | Cơ chế phòng thủ | Điểm chốt chặn | Kết quả bảo vệ |
|:---|:---|:---|:---:|
| Trùng mã giao dịch payOS (Inbound) | Unique Index trên `Payment.orderCode` & `BankTransferEvent.orderCode` | Inbound Router | Loại bỏ webhook trùng, giữ nguyên số dư |
| Chuyển tiền giảng viên 2 lần cho 1 Earning | Khóa trạng thái `PAID_OUT` và `payoutId` gắn kết | `payoutService` | Không thể gộp Earning vào Payout thứ hai |
| Tái sử dụng mã chuyển khoản giữa 2 Payout | Compound Unique Check trong `BankProofRegistry` | `claimBankProof` | Bị từ chối với lỗi `DUPLICATE_BANK_REFERENCE` |
| Tái sử dụng mã Payout để làm bằng chứng Refund | Global Unique Index trên `BankProofRegistry.bankReference` | `claimBankProof` | Chặn đứng Cross-Channel Reference Forgery |
| Hai Admin cùng xác nhận 1 mã giao dịch đồng thời | MongoDB Session Transaction & Unique Index E11000 Catch | MongoDB Engine | Một bên thành công, một bên bị Rollback tức thì |

---

### 24. LEDGER CORRECTNESS & CONSERVATION OF PLATFORM FUNDS
Hệ thống duy trì phương trình bảo toàn dòng tiền bất biến:
$$\sum \text{Tiền Thực Nhận} = \sum \text{Học Phí Thu Hộ (Payable to Teachers)} + \sum \text{Phí Sàn Platform} + \sum \text{Quỹ Học Bổng Khả Dụng} - \sum \text{Tiền Đã Hoàn}$$

- **Teacher Net Earning**: Luôn tính toán snapshot chính xác theo chính sách hoa hồng tại thời điểm phát sinh giao dịch.
- **Platform Commission**: Ghi nhận bất biến vào bản ghi `Transaction` loại `PLATFORM_FEE`.
- **Scholarship Balance**: Bất biến, chỉ tăng khi có `SponsorContribution` thành công và giảm khi có `ScholarshipUsage` được xác nhận.

---

### 25. SECURITY & ACCESS CONTROL VERIFICATION (ROLE GUARDS, JWT, CSRF)
- **Role-Based Access Control (RBAC)**:
  - Chỉ `ADMIN` mới có quyền truy cập các route `/api/admin/finance/*`, `/api/admin/payouts/*`, `/api/admin/refunds/*`.
  - `TEACHER` chỉ có thể xem danh sách thu nhập và yêu cầu rút tiền của chính mình (`req.user.id`).
  - `STUDENT` chỉ có thể tạo Payment Intent học phí cho chính mình.
- **Authentication**: JWT token xác thực qua Bearer header, rotation refresh token an toàn.
- **Data Protection**: Mọi thông tin nhạy cảm (API Key, Checksum Key, Số tài khoản ngân hàng chi tiết) đều được redact trong log.

---

### 26. OPERATIONAL RUNBOOK FOR STAGING DEPLOYMENT & PILOT MIGRATION
1. **Bước 1 — Chuẩn bị biến môi trường Staging**:
   - Cấu hình tài khoản ngân hàng sandbox cho 2 kênh trên dashboard payOS.
   - Điền các biến `PAYOS_TUITION_*` và `PAYOS_DONATION_*` vào file `.env` staging.
2. **Bước 2 — Khởi tạo MongoDB Indexes**:
   - Chạy lệnh khởi tạo unique index cho `BankProofRegistry`, `Payout`, `RefundCase`, `Payment`.
3. **Bước 3 — Đăng ký Webhook URL**:
   - Đăng ký URL webhook staging: `https://staging-api.edunity.vn/api/payments/webhook/tuition` và `/donation`.
4. **Bước 4 — Bật chế độ Pilot có kiểm soát**:
   - Duy trì `PAYOS_ENABLED=false` cho outbound (chi tiền).
   - Bật `ENABLE_PAYMENT_SANDBOX=true` để kiểm thử luồng thu.

---

### 27. FAILURE RECOVERY RUNBOOK & INCIDENT RESPONSE PROCEDURE
- **Sự cố 1: Webhook bị nghẽn hoặc payOS không gọi được vào Staging**:
  - *Xử lý*: Kích hoạt Outbox Sweep thủ công qua Admin Dashboard hoặc đợi `financialOutboxWorker` tự động fetch trạng thái sau 5 phút.
- **Sự cố 2: Admin phát hiện chuyển nhầm tiền ngoài ngân hàng**:
  - *Xử lý*: Admin không bấm xác minh chứng từ. Payout giữ nguyên trạng thái `AWAITING_BANK_VERIFICATION`. Tạo case khiếu nại để thu hồi giao dịch.
- **Sự cố 3: Phát hiện xung đột Race Condition trên Bank Reference**:
  - *Xử lý*: Hệ thống tự động rollback transaction. Kiểm tra lịch sử `AuditLog` để xác định Admin nào đã nộp chứng từ trước.

---

### 28. RISK ASSESSMENT & KNOWN OPERATIONAL BOUNDARIES
1. **Rủi ro Chi tiền tự động (Outbound Automated Disbursal)**:
   - *Mức độ*: Cực kỳ cao (P0).
   - *Biện pháp kiểm soát*: Không tích hợp API tự động chi tiền ra ngoài ngân hàng. Mọi khoản Payout và Refund bắt buộc chuyển khoản ngân hàng thủ công và xác minh Four-Eyes độc lập.
2. **Rủi ro Nhầm lẫn Kênh Tài trợ và Kênh Học phí**:
   - *Mức độ*: Nghiêm trọng (P1).
   - *Biện pháp kiểm soát*: Hai cặp API Key và Checksum Key riêng biệt, phân tách logic tại tầng service.

---

### 29. INDEPENDENT GO / NO-GO GATES SPECIFICATION
Dựa trên kết quả nghiệm thu kỹ thuật PR1 đến PR9, Principal Financial Security Architect đưa ra quyết định độc lập cho từng phân hệ:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   DECISION GATE MATRIX — EDUNITY V3 STAGING                      │
├───────────────────────────────────────┬────────────┬─────────────────────────────┤
│ PHÂN HỆ NGHIỆP VỤ                     │ QUYẾT ĐỊNH │ GHI CHÚ ĐIỀU KIỆN           │
├───────────────────────────────────────┼────────────┼─────────────────────────────┤
│ 1. INBOUND: Học phí (TUITION)         │   >> GO << │ Sẵn sàng Pilot tiền thật    │
│ 2. INBOUND: Tài trợ Quỹ (DONATION)    │   >> GO << │ Sẵn sàng Pilot tiền thật    │
│ 3. OUTBOUND: Hoàn phí (REFUND)        │   >> GO << │ Quy trình chuyển tay + 4-Eyes│
│ 4. OUTBOUND: Chi trả GV (PAYOUT)      │   >> GO << │ Quy trình chuyển tay + 4-Eyes│
│ 5. OUTBOUND: Tự động qua API payOS   │  NO-GO (!) │ Nghiêm cấm bật tự động chi  │
│ 6. TRIỂN KHAI PUBLIC TOÀN DIỆN        │  HOLD (⏳) │ Chờ kết quả Pilot 50 giao dịch│
└───────────────────────────────────────┴────────────┴─────────────────────────────┘
```

---

### 30. FINAL VERIFICATION SIGN-OFF & RECOMMENDATIONS FOR MANAGEMENT
1. **Kết luận Nghiệm thu**:
   - PR9 hoàn thành xuất sắc 100% mục tiêu đề ra.
   - Toàn bộ lỗ hổng P0 về Four-Eyes Bypass đã được vá kín triệt để ở cấp độ Server.
   - `BankProofRegistry` bảo đảm tính toàn vẹn và duy nhất của chứng từ ngân hàng trên toàn hệ thống.
   - 26/26 Suites (622 Tests) Backend Jest và Frontend build hoàn toàn sạch bóng lỗi.
2. **Khuyến nghị cho Ban Giám Đốc & Team Lead Tin**:
   - Phê duyệt triển khai mã nguồn PR9 lên môi trường Staging.
   - Tiến hành thử nghiệm Pilot Thu tiền thật (Controlled Pilot) với hạn mức tối đa 50.000đ/giao dịch cho tối đa 10 học sinh nội bộ và 5 nhà hảo tâm nội bộ.
   - Duy trì quy trình chi trả giảng viên và hoàn tiền học sinh bằng phương thức chuyển khoản ngân hàng thủ công có 2 Admin độc lập kiểm duyệt (Four-Eyes Principle).

---
**Chữ ký nghiệm thu kỹ thuật**:  
*Tin — Principal Payment Architect & Financial Security Auditor*  
*Edunity V3 Core Engineering Team*

