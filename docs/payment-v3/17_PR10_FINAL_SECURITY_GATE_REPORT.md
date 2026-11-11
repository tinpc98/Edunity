# BÁO CÁO NGHIỆM THU AN TOÀN TÀI CHÍNH CUỐI CÙNG (FINAL SECURITY GATE)
# TASK: TIN-FIN-PR10-FINAL-GATE
# DỰ ÁN: EDUNITY V3 — HỆ THỐNG THANH TOÁN & QUẢN TRỊ TÀI CHÍNH

> **Vai trò thực hiện**: Principal Payment Security Auditor + Backend Engineer + QA Lead  
> **Thời điểm thẩm định**: 10/11/2026  
> **Nhánh Git**: `feature/teacher-admin` (Không commit, không push, không merge, không reset)  
> **Môi trường**: Isolated MongoDB Memory Server, Node.js v22, Playwright v1.65.0 Chromium  
> **Trạng thái payOS Live**: `PAYOS_ENABLED=false` (Tuyệt đối không gọi API thật, không chuyển/hoàn tiền thật)  

---

## 01. GIT STATUS TRƯỚC VÀ SAU KHI THỰC HIỆN

### Trước khi thực hiện PR10-FINAL-GATE:
- Nhánh hiện tại: `feature/teacher-admin`
- Xung đột (Unmerged conflicts): `0` (`git ls-files -u` trống hoàn toàn).
- Working tree nguyên vẹn từ các PR1–PR10.

### Sau khi thực hiện PR10-FINAL-GATE:
- **Files đã sửa (Modified)**:
  - `BackEnd/src/server.js`: Đánh dấu `process.env.EDUNITY_RUNNING_SERVER = "true"` khi server khởi động trên network port.
  - `BackEnd/src/app.js`: Tích hợp middleware bảo vệ clock hệ thống, xóa bỏ và cấm tiệt mọi header `x-test-now` từ HTTP client khi chạy server.
  - `BackEnd/src/controllers/financeController.js`: Loại bỏ hoàn toàn việc đọc `req.headers["x-test-now"]`, thay thế 100% bằng `clock.getNow()`.
  - `BackEnd/src/models/TeacherEarning.js`: Đổi `settlementHoldRequired: { type: Boolean, default: true }` (Fail-closed: tất cả thu nhập V3 mới tạo mặc định bắt buộc 7-day hold).
  - `BackEnd/src/services/settlementService.js`: Sửa logic `evaluateEarningSettlement` thành Fail-closed: thiếu hoặc null cờ hold đều bắt buộc 7-day hold, chỉ bypass nếu `settlementHoldRequired === false` rõ ràng.
  - `BackEnd/src/services/classLifecycleService.js`: Sửa bộ lọc auto-release thành `{ settlementHoldRequired: false }` thay vì `{ $ne: true }`.
  - `BackEnd/tests/maintenanceAndFinance.test.js`: Gắn cờ rõ ràng `settlementHoldRequired: false` cho test fixture kế thừa C01.
- **Files tạo mới (Untracked)**:
  - `BackEnd/src/utils/clock.js`: Injectable system clock provider trung tâm, nghiêm cấm fake time ngoài môi trường test.
  - `BackEnd/tests/finalSecurityGate.pr10.test.js`: Suite kiểm thử 13 kịch bản bảo mật chuyên sâu (Boundary Monday/Friday, Fail-closed hold, Chặn fake time).
- **Cam kết Git**:
  - `0` commit, `0` push, `0` merge, `0` checkout, `0` reset, `0` rebase.
  - Giữ nguyên toàn bộ cấu hình file `.env`.

---

## 02. AUDIT x-test-now (LOẠI BỎ HOÀN TOÀN KHẢ NĂNG THAO TÚNG THỜI GIAN)

### 1. Request từ user có tự gửi `x-test-now` để thay đổi thời gian được không?
- **Trước Audit**: **CÓ** (Lỗ hổng nghiêm trọng). `financeController.js` đọc trực tiếp `req.headers["x-test-now"]` mà không kiểm tra môi trường. Bất kỳ request nào từ curl, Postman hay frontend đều có thể truyền header này.
- **Sau Audit**: **HOÀN TOÀN KHÔNG THỂ**.
  1. `financeController.js` đã xóa bỏ 100% việc đọc `req.headers["x-test-now"]`.
  2. Thời gian được lấy tập trung qua `clock.getNow()`.
  3. `app.js` có middleware an ninh: Trên bất kỳ tiến trình server nào đang chạy (`EDUNITY_RUNNING_SERVER === "true"` hoặc `NODE_ENV !== "test"`), header `x-test-now` bị xóa ngay lập tức khỏi request (`delete req.headers["x-test-now"]`).

### 2. Có thể bypass Monday Withdrawal Window (Thứ Hai 08:00 – 17:00)?
- **KHÔNG THỂ**. Giảng viên gửi request rút tiền ngoài khung giờ Thứ Hai (kể cả có cố tình đính kèm header `x-test-now` giả lập Thứ Hai) sẽ bị Server dùng thời gian thực của máy chủ từ chối với lỗi `WITHDRAWAL_WINDOW_CLOSED` (HTTP 400).

### 3. Có thể bypass Friday Payout Window (Thứ Sáu 08:00 – 17:00)?
- **KHÔNG THỂ**. Quản trị viên nộp chứng từ chi trả ngoài khung giờ Thứ Sáu (hoặc cố tình chèn header) đều bị từ chối với lỗi `PAYOUT_EXECUTION_WINDOW_CLOSED` (HTTP 400).

### 4. Có thể bypass 7-day settlement hold?
- **KHÔNG THỂ**. Lệnh gọi `triggerSettlementJob` hay `evaluateClassSettlement` đều lấy thời gian chuẩn từ `clock.getNow()`. Thu nhập chưa đủ 7 ngày kể từ khi lớp kết thúc tuyệt đối không thể giải phóng sang `AVAILABLE`.

### 5. Header có được sử dụng khi `NODE_ENV` khác test không?
- **TUYỆT ĐỐI KHÔNG**. Khi `NODE_ENV` là `production`, `staging`, hoặc `development`, `clock.getNow()` trả về `new Date()` thực tế. Hàm `clock.setTestTime()` sẽ ném ngoại lệ bảo mật ngay lập tức nếu bị gọi.

### 6. Nếu staging vô tình chạy `NODE_ENV=test`, có thể lợi dụng header hay không?
- **KHÔNG THỂ**. Khi `server.js` khởi động (`startServer()`), cờ `process.env.EDUNITY_RUNNING_SERVER = "true"` được thiết lập cố định. Middleware trong `app.js` phát hiện cờ này và xóa sạch header `x-test-now`, ngăn chặn 100% các request qua mạng từ bên ngoài.

---

## 03. SETTLEMENT LEGACY AUDIT (`settlementHoldRequired`)

### 1. `settlementHoldRequired: false` là default trong schema hay chỉ trong fixture?
- **Thực tế trước Audit**: Tồn tại cờ `default: false` trong Schema `TeacherEarning.js` (Lỗ hổng nguy cơ cao do sửa chữa vội ở PR9).
- **Đã khắc phục**: Đổi thành `default: true` trong schema `TeacherEarning.js`. Mọi bản ghi thu nhập mới sinh ra trong V3 đều bắt buộc chịu kiểm soát 7-day hold.

### 2. Thu nhập mới có thể nhận `false` không?
- **KHÔNG THỂ**. Luồng thanh toán V3 tại `financialDispatchService.js:580` gắn cứng `settlementHoldRequired: true`. Schema cũng mặc định là `true`.

### 3. Earning không có trường này sẽ xử lý như thế nào?
- **Nguyên tắc Fail-Closed**:
  - Trong `settlementService.js`: Code cũ kiểm tra `if (earning.settlementHoldRequired !== true) return eligible: true`. Code mới sửa thành: `if (earning.settlementHoldRequired === false)` mới bypass. Nếu trường này bị thiếu, `null`, hoặc `undefined`, hệ thống tự động coi là `true` (bắt buộc hold).
  - Mongoose schema default tự động điền `true` khi load bất kỳ bản ghi nào thiếu trường này từ MongoDB.

### 4. Client có tự gửi `false` được không?
- **KHÔNG THỂ**. `TeacherEarning` không được tạo trực tiếp từ Client payload mà chỉ sinh ra từ backend webhook dispatch (`payosWebhookService` & `financialDispatchService`).

### 5. Có đường legacy API nào mở khóa tiền ngay sau khi Class `COMPLETED` không?
- **Đã đóng hoàn toàn**. Trong `classLifecycleService.js`, lệnh `TeacherEarning.updateMany` trước đây dùng `{ status: "PENDING", settlementHoldRequired: { $ne: true } }` (dẫn đến việc bản ghi thiếu trường này bị mở khóa ngay lập tức). Đã sửa thành `{ status: "PENDING", settlementHoldRequired: false }`. Chỉ những bản ghi được đánh dấu rõ ràng là dữ liệu cũ mới được bỏ qua.

### 6. Phân loại Earning V2:
- Toàn bộ thu nhập V3 phải tuân thủ 12 Business Rules (BR-01 đến BR-12) và thời hạn 7 ngày. Không áp dụng chính sách legacy cho bất kỳ dữ liệu V3 nào.
- Kế hoạch migration dữ liệu: Chỉ lập kế hoạch chạy dry-run khi triển khai thật, không can thiệp thủ công vào cơ sở dữ liệu.

---

## 04. VERIFY FOUR-EYES PRINCIPLE (NGUYÊN TẮC KIỂM SOÁT KÉP)

1. **Loại bỏ hoàn toàn bypass từ Client**:
   - `financeController.verifyPayoutProof` và `financeController.verifyAndCompleteRefund` không đọc `req.body.enforceDifferentAdmin`.
   - Luôn ép buộc `enforceDifferentAdmin: true`.
2. **Kiểm tra chéo vai trò kép (Approver & Submitter)**:
   - Người xác minh (`verifierAdminId`) bị từ chối nếu trùng với `approvedBy` (người duyệt yêu cầu).
   - Người xác minh (`verifierAdminId`) bị từ chối nếu trùng với `submittedBy` (người nộp ủy nhiệm chi/mã giao dịch).
   - Lỗi trả về: `DUAL_VERIFICATION_REQUIRED` (HTTP 403).
3. **Fail-Closed khi thiếu dữ liệu danh tính**:
   - Nếu hồ sơ Payout hoặc RefundCase bị mất cả `approverId` lẫn `submitterId`, server lập tức trả lỗi `MISSING_APPROVER_IDENTITY` (HTTP 400).
4. **Role Guard**:
   - Người gọi verify bắt buộc phải có tài khoản tồn tại trong hệ thống, `role === "ADMIN"` và `status === "ACTIVE"`. Nếu không, bị chặn với `FORBIDDEN_VERIFIER` (HTTP 403) hoặc `INVALID_VERIFIER_IDENTITY` (HTTP 400).
5. **Audit Trail**:
   - Bản ghi Payout và RefundCase lưu trữ chính xác `bankTransferProof.verifiedBy` và `bankTransferProof.verifiedAt`.
6. **Concurrent Verify**:
   - Nhờ MongoDB Session Transaction, các request verify đồng thời đều đảm bảo tính lũy kế (idempotent), không xảy ra race condition ghi nhận kép.

---

## 05. VERIFY BANKPROOFREGISTRY (CHỐNG GIAN LẬN CHỨNG TỪ NGÂN HÀNG)

1. **Mô hình Model**:
   - Collection `BankProofRegistry` lưu trữ: `bankReference`, `entityType` (`PAYOUT` | `REFUND`), `entityId`, `amount`, `status`, `claimedByAdmin`, `verifiedByAdmin`.
2. **Unique Index thực tế**:
   - Index `{ bankReference: 1 }` có thuộc tính `unique: true`.
   - Đã kiểm chứng trên MongoDB Memory Server: Hai giao dịch khác nhau không thể sử dụng chung một `bankReference`.
3. **Chia sẻ liên kênh (Payout & Refund)**:
   - Nộp mã `FT_REF_001` cho Payout thành công -> Cố tình nộp lại `FT_REF_001` cho RefundCase sẽ bị chặn ngay lập tức với lỗi `DUPLICATE_BANK_REFERENCE` (HTTP 400/409).
4. **Không tự động coi `referenceNumber` là chứng từ đã xác minh**:
   - Mã giao dịch khi nộp chỉ đưa hồ sơ vào trạng thái `AWAITING_BANK_VERIFICATION` (chờ xác minh ngân hàng). Tiền trong sổ cái không được giải phóng cho đến khi Admin thứ hai độc lập xác nhận `VERIFIED`.

---

## 06. DANH SÁCH CÁC FILE ĐÃ CHỈNH SỬA / BỔ SUNG

| Đường dẫn file | Thao tác | Mục đích kỹ thuật |
| :--- | :---: | :--- |
| `BackEnd/src/utils/clock.js` | **Tạo mới** | Bộ cung cấp giờ hệ thống tập trung, cấm can thiệp ngoài test |
| `BackEnd/src/server.js` | **Sửa** | Đặt `process.env.EDUNITY_RUNNING_SERVER = "true"` khi khởi động |
| `BackEnd/src/app.js` | **Sửa** | Middleware an ninh tự động tước bỏ header `x-test-now` trên server |
| `BackEnd/src/controllers/financeController.js` | **Sửa** | Thay thế 9 vị trí đọc `req.headers["x-test-now"]` bằng `clock.getNow()` |
| `BackEnd/src/models/TeacherEarning.js` | **Sửa** | Đổi `settlementHoldRequired` schema default thành `true` |
| `BackEnd/src/services/settlementService.js` | **Sửa** | Logic Fail-closed cho hold 7 ngày; kiểm tra mã chứng từ trước |
| `BackEnd/src/services/payoutService.js` | **Sửa** | Bắt buộc kiểm tra `bankRef` trước, kiểm tra Four-Eyes fail-closed |
| `BackEnd/src/services/classLifecycleService.js` | **Sửa** | Sửa query auto-release chỉ áp dụng cho `settlementHoldRequired: false` |
| `BackEnd/tests/maintenanceAndFinance.test.js` | **Sửa** | Gắn cờ legacy tường minh cho fixture C01 |
| `BackEnd/tests/finalSecurityGate.pr10.test.js` | **Tạo mới** | Suite 13 test bảo mật cửa sổ giờ, fake time và 7-day hold |

---

## 07. TARGETED TESTS (KIỂM THỬ TRỌNG ĐIỂM BẢO MẬT PR10)

### 1. `fourEyesHardening.pr10.test.js` (Four-Eyes & Bypass Elimination):
- Kết quả: **12 / 12 Tests PASS** (100%)
- Thời gian: **6.76s**
- Chi tiết:
  - 1. Client bỏ qua `enforceDifferentAdmin` -> Bị chặn (403 DUAL_VERIFICATION_REQUIRED)
  - 2. Client gửi `enforceDifferentAdmin: false` -> Vẫn bị chặn (403, không thể bypass)
  - 3. Client gửi `enforceDifferentAdmin: true` và cùng admin -> Bị chặn (403)
  - 4. Cùng admin duyệt và nộp chứng từ -> Bị chặn verify (403)
  - 5. Admin thứ hai độc lập verify Payout -> Thành công (200, COMPLETED)
  - 6. Role guard: Người dùng không phải ADMIN gọi verify -> Bị chặn (403)
  - 7. Thiếu danh tính approver/submitter -> Fail-closed (400 MISSING_APPROVER_IDENTITY)
  - 8. Refund: Client gửi `enforceDifferentAdmin: false` -> Vẫn bị chặn (403)
  - 9. Refund: Admin thứ hai độc lập verify -> Thành công (200, COMPLETED)
  - 10. Refund: Thiếu danh tính approver -> Fail-closed (400 MISSING_APPROVER_IDENTITY)
  - 11. Chống tái sử dụng chứng từ ngân hàng giữa Payout và Refund -> Bị chặn (400 DUPLICATE_BANK_REFERENCE)
  - 12. Vòng đời trạng thái nghiêm ngặt: APPROVED -> AWAITING_BANK_VERIFICATION -> COMPLETED

### 2. `finalSecurityGate.pr10.test.js` (Clock & Hold Hardening):
- Kết quả: **13 / 13 Tests PASS** (100%)
- Thời gian: **6.30s**
- Chi tiết:
  - 1.1 Thứ Hai 07:59:59 -> Từ chối rút tiền (400 WITHDRAWAL_WINDOW_CLOSED)
  - 1.2 Thứ Hai 08:00:00 -> Chấp nhận rút tiền (201 PENDING)
  - 1.3 Thứ Hai 16:59:59 -> Chấp nhận rút tiền (201 PENDING)
  - 1.4 Thứ Hai 17:00:00 -> Từ chối rút tiền (400 WITHDRAWAL_WINDOW_CLOSED)
  - 1.5 Thứ Sáu 07:59:59 -> Từ chối chi trả (400 PAYOUT_EXECUTION_WINDOW_CLOSED)
  - 1.6 Thứ Sáu 08:00:00 -> Chấp nhận chi trả (200 SUCCESS)
  - 1.7 Thứ Sáu 16:59:59 -> Chấp nhận chi trả (200 SUCCESS)
  - 1.8 Thứ Sáu 17:00:00 -> Từ chối chi trả (400 PAYOUT_EXECUTION_WINDOW_CLOSED)
  - 1.9 Server đang chạy (Staging/Production mode) -> Header `x-test-now` bị xóa bỏ và vô hiệu hóa hoàn toàn
  - 1.10 Gọi `clock.setTestTime` khi server đang chạy -> Ném ngoại lệ Security Violation
  - 2.1 Earning mới tạo mặc định `settlementHoldRequired: true` trong Schema
  - 2.2 Earning thiếu cờ hold -> Fail-closed (yêu cầu đủ 7 ngày)
  - 2.3 Earning hold 7 ngày: Ngày thứ 6 bị chặn PENDING, Ngày thứ 8 tự động đạt điều kiện AVAILABLE

---

## 08. FULL BACKEND JEST REGRESSION (TOÀN BỘ BACKEND TEST SUITE)

Chạy toàn bộ test suites trong `BackEnd/tests/`:
```bash
npm --prefix BackEnd test
```
- **Kết quả thực tế**:
  - **Test Suites**: **28 passed, 28 total** (100% PASS)
  - **Tests**: **647 passed, 647 total** (100% PASS)
  - **Snapshots**: 0 total
  - **Thời gian thực thi**: **67.145 s**
  - **Mã thoát (Exit Code)**: `0`

### Danh sách 28 Suites đã vượt qua:
1. `tests/authorization.test.js`
2. `tests/fourEyesHardening.pr10.test.js`
3. `tests/community.test.js`
4. `tests/sessionLifecycle.test.js`
5. `tests/smartClassroomAndIncidents.test.js`
6. `tests/teacherVerificationAccess.test.js`
7. `tests/adminFinance.pr6.test.js`
8. `tests/security.test.js`
9. `tests/payosSafetyHardening.pr5.test.js`
10. `tests/payosDispatch.pr3.test.js`
11. `tests/sessionJoin.test.js`
12. `tests/catalogSearch.test.js`
13. `tests/stagingHardening.pr9.test.js`
14. `tests/platform.test.js`
15. `tests/finalSecurityGate.pr10.test.js`
16. `tests/sessionRecordingFixes.test.js`
17. `tests/payosUnifiedIntent.pr1.test.js`
18. `tests/payosWebhook.pr2.test.js`
19. `tests/videoProvider.test.js`
20. `tests/sessionConcurrency.test.js`
21. `tests/jobs.test.js`
22. `tests/payment.test.js`
23. `tests/payosCheckoutUi.pr4.test.js`
24. `tests/enrollment.test.js`
25. `tests/rateLimit.test.js`
26. `tests/maintenanceAndFinance.test.js`
27. `tests/refundReconciliation.pr8.test.js`
28. `tests/teacherSettlement.pr7.test.js`

---

## 09. FRONTEND BUILD VERIFICATION

Thực thi kiểm tra TypeScript compiler và Vite production packaging:
```bash
npm --prefix FrontEnd run build
```
- **Lệnh thực thi**: `tsc -b && vite build`
- **Modules transformed**: `3,355 modules`
- **Output files**:
  - `dist/index.html` (0.66 kB)
  - `dist/assets/index-BHVM_aUh.css` (92.44 kB)
  - `dist/assets/index-CvkPMpoW.js` (3,238.92 kB)
- **Lỗi TypeScript**: **0 errors**
- **Thời gian build**: **3.62 s**
- **Mã thoát (Exit Code)**: `0`

---

## 10. BROWSER E2E EVIDENCE & PHÂN BIỆT TRẠNG THÁI KIỂM THỬ

Thực thi bộ Playwright Browser End-to-End trên Chromium Headless Engine:
```bash
npx --prefix FrontEnd playwright test --config FrontEnd/playwright.config.ts
```
- **Thời gian chạy**: **9.7 s**
- **Số luồng kiểm thử**: **8/8 Flows PASS**
- **Mã thoát (Exit Code)**: `0`

```
Running 8 tests using 1 worker
  ok 1 Flow 1: Student Tuition Checkout with VietQR / payOS (3.6s)
  ok 2 Flow 2: Sponsor Campaign Donation Checkout with DONATION Channel (405ms)
  ok 3 Flow 3: Admin Finance Overview Dashboard renders ledger metrics (488ms)
  ok 4 Flow 4: Admin Reconciliation page loads reconciliation cases (427ms)
  ok 5 Flow 5: Admin Refunds page displays refund lifecycle cases (559ms)
  ok 6 Flow 6: Teacher Revenue page displays earnings breakdown and platform fee (453ms)
  ok 7 Flow 7: Teacher Withdrawal button verifies settlement request window (474ms)
  ok 8 Flow 8: Admin Payouts page lists settlements and enforces Four-Eyes verification (443ms)

  8 passed (9.7s)
```

### Phân định minh bạch 3 trạng thái kiểm thử theo yêu cầu bảo mật:
1. **Browser UI Rendering & Interactions**: **PASS (8/8 Flows)**  
   Giao diện render đầy đủ, định tuyến đúng, QR code, các modal xác nhận và bảng biểu tài chính hoạt động chính xác trên Chromium thật.
2. **Mock Integration & Isolated Ledger Assertions**: **PASS (647/647 Tests)**  
   Toàn bộ luồng tính toán số học, webhook signature, Four-Eyes principle, Outbox worker và chống trùng chứng từ đều đã được kiểm chứng trên MongoDB Memory Server.
3. **Real payOS Live Network Integration**: **NOT RUN (CHƯA THỰC THI)**  
   Chưa gửi bất kỳ HTTP request nào đến máy chủ payOS live, chưa thực hiện giao dịch ngân hàng thật để bảo vệ an toàn tài chính tuyệt đối theo quy định.

---

## 11. COMMISSION POLICY & REVENUE SHARING STATUS

- **Tỷ lệ phí sàn**: `0.10` (10% flat rate).
- **Phân bổ học phí**:
  - Giảng viên nhận: 90% học phí thực đóng.
  - Nền tảng giữ lại: 10% phí vận hành.
- **Quỹ học bổng (Donation)**:
  - 100% tiền tài trợ được chuyển vào quỹ học bổng, phí sàn: `0.00%`.
- **Độ chính xác số học**: Sử dụng `Decimal128` và hàm chuyển đổi chuẩn `toDec`, không có sai số phần bù thập phân trong toàn bộ chu trình.

---

## 12. TUITION INBOUND GO / NO-GO ASSESSMENT

- **Quyết định**: **[ GO — CONTROLLED PILOT GATE ]**
- **Căn cứ kỹ thuật**:
  - API tạo link thanh toán VietQR học phí đã hoàn chỉnh (`/api/payments/payos/checkout`).
  - Webhook tiếp nhận `/api/payments/webhooks/payos/tuition` xác thực chữ ký số HMAC-SHA256 chuẩn payOS.
  - Outbox pattern đảm bảo ghi nhận đơn hàng và kích hoạt `Enrollment` nguyên tử.
  - Tự động trích xuất đúng 10% phí nền tảng và đưa 90% vào `TeacherEarning` ở trạng thái `PENDING`.
- **Hạn chế**: Chỉ được phép chạy tối đa 5 giao dịch pilot với hạn mức 10.000 VNĐ.

---

## 13. DONATION INBOUND GO / NO-GO ASSESSMENT

- **Quyết định**: **[ GO — CONTROLLED PILOT GATE ]**
- **Căn cứ kỹ thuật**:
  - Kênh thanh toán `DONATION` hoàn toàn tách biệt về Client ID, API Key và Checksum Key.
  - Webhook tiếp nhận `/api/payments/webhooks/payos/donation` cập nhật trực tiếp vào chiến dịch học bổng (`SponsorContribution`).
  - Bảo toàn 100% tiền tài trợ, không trích phí nền tảng.
- **Hạn chế**: Chỉ được phép chạy tối đa 5 giao dịch pilot với hạn mức 10.000 VNĐ.

---

## 14. REFUND OUTBOUND GO / NO-GO ASSESSMENT

- **Quyết định**: **[ NO-GO FOR AUTOMATED API — GO FOR CONTROLLED MANUAL FOUR-EYES ONLY ]**
- **Căn cứ kỹ thuật**:
  - payOS không hỗ trợ tự động trừ tài khoản ngân hàng để hoàn tiền qua API thông thường.
  - Tuyệt đối cấm tự động hoàn tiền qua script/code.
  - Chỉ cho phép hoàn tiền theo quy trình thủ công: Kế toán chuyển khoản ngoài Internet Banking -> Nộp mã chứng từ -> Admin thứ hai độc lập xác minh qua Four-Eyes Dashboard.

---

## 15. PAYOUT OUTBOUND GO / NO-GO ASSESSMENT

- **Quyết định**: **[ NO-GO FOR AUTOMATED DISBURSEMENT — GO FOR CONTROLLED MANUAL FOUR-EYES ONLY ]**
- **Căn cứ kỹ thuật**:
  - Tuyệt đối không tự động giải ngân tiền từ tài khoản công ty sang tài khoản giảng viên bằng code.
  - Giảng viên chỉ được yêu cầu rút tiền vào Thứ Hai (08:00 – 17:00).
  - Kế toán chỉ chi trả vào Thứ Sáu (08:00 – 17:00).
  - Bắt buộc Four-Eyes verify: Admin nộp ủy nhiệm chi không được tự duyệt; Admin thứ hai độc lập kiểm tra sao kê ngân hàng mới được hoàn tất hồ sơ.
  - `BankProofRegistry` ngăn chặn 100% việc dùng lại mã giao dịch ngân hàng cũ.

---

## 16. PUBLIC HTTPS & REVERSE PROXY READINESS

- **Backend Route Readiness**:
  - `POST /api/payments/webhooks/payos/tuition` (Đã cấu hình và kiểm thử an toàn).
  - `POST /api/payments/webhooks/payos/donation` (Đã cấu hình và kiểm thử an toàn).
- **Trạng thái Mạng**:
  - Localhost / Memory Server: **Route Exists & Verified**.
  - Public Domain & SSL: **CHƯA CẤU HÌNH TRÊN PRODUCTION** (Cần thiết lập Nginx Reverse Proxy với SSL Let's Encrypt / Cloudflare khi triển khai máy chủ Staging).
- **Lưu ý**: Chỉ khi server có IP tĩnh công khai và domain có chứng chỉ SSL hợp lệ thì payOS mới có thể gọi Webhook thành công.

---

## 17. REMAINING BLOCKERS (CÁC ĐIỂM CHẶN CÒN LẠI TRƯỚC LIVE)

1. **Tên miền công khai và SSL Staging**: Cần gán domain staging (ví dụ: `api-staging.edunity.vn`) và cài đặt chứng chỉ SSL.
2. **Đăng ký Webhook trên Portal payOS**: Cần nhân sự có thẩm quyền đăng nhập Portal payOS Doanh nghiệp và dán 2 Webhook URL chính thức.
3. **Diễn tập Pilot 10 giao dịch (5 Tuition + 5 Donation)**: Phải thực hiện chuyển tiền thật hạn mức nhỏ (10.000 VNĐ) để nghiệm thu sao kê ngân hàng thực tế.

---

## 18. GO / NO-GO CHO CONTROLLED LIVE PILOT (STAGING)

- **QUYẾT ĐỊNH**: **[ CONDITIONAL GO ]**
- **Điều kiện kích hoạt**:
  1. Chỉ kích hoạt trên môi trường Staging có domain HTTPS hợp lệ.
  2. Bật `PAYOS_ENABLED=true` có kiểm soát trong file `.env.staging`.
  3. Giới hạn tối đa 5 giao dịch học phí (mỗi giao dịch 10.000 VNĐ) và 5 giao dịch học bổng (mỗi giao dịch 10.000 VNĐ).
  4. Có sự giám sát trực tiếp của Kế toán trưởng và Trưởng nhóm kỹ thuật Tin.

---

## 19. GO / NO-GO CHO PUBLIC PRODUCTION RELEASE

- **QUYẾT ĐỊNH**: **[ STRICT NO-GO ]**
- **Lý do**:
  - Chưa hoàn thành diễn tập thực tế 10 giao dịch Pilot có kiểm soát trên Staging.
  - Chưa đối soát sao kê tiền vào tài khoản ngân hàng thực tế với số liệu Outbox Worker và Ledger.
  - Chưa có biên bản bàn giao và phê duyệt chữ ký số từ Ban Giám đốc.

---

## 20. HƯỚNG DẪN BƯỚC TIẾP THEO CHO TEAM LEADER VÀ BAN QUẢN TRỊ

1. **Bước 1 — Duyệt Báo cáo PR10-FINAL-GATE**:
   Team Leader nghiệm thu toàn bộ 647 tests Backend PASS và 8 flows Browser E2E PASS.
2. **Bước 2 — Cấu hình Máy chủ Staging**:
   Triển khai mã nguồn từ nhánh `feature/teacher-admin` lên máy chủ Staging, cấu hình Nginx Reverse Proxy với HTTPS.
3. **Bước 3 — Đăng ký Webhook trên payOS Portal**:
   Đăng ký URL cho 2 kênh `tuition` và `donation` trên portal đối tác payOS.
4. **Bước 4 — Diễn tập Pilot 10 Giao dịch**:
   Thực hiện kịch bản quét mã VietQR thật 10.000 VNĐ cho 5 đơn học phí và 5 đơn quyên góp; kiểm tra tự động kích hoạt Enrollment và đối soát ngân hàng.
5. **Bước 5 — Họp Hội đồng Nghiệm thu Cuối cùng (Final Sign-off)**:
   Sau khi 10 giao dịch pilot thành công 100%, tiến hành phê duyệt chuyển trạng thái sang `PRODUCTION READY`.

---
*(Báo cáo kết thúc tại đây — Đã sẵn sàng cho Team Leader kiểm tra và lưu trữ)*

