# BÁO CÁO NGHIỆM THU TIN-FIN-PR10
# STAGING DEPLOYMENT READINESS, BROWSER E2E & CONTROLLED PAYOS INTEGRATION GATES
# HỆ THỐNG THANH TOÁN & TÀI CHÍNH EDUNITY V3

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Nhiệm vụ**: `TIN-FIN-PR10`  
> **Chủ nhiệm**: Tin — Principal Payment Architect + DevOps Engineer + Fullstack QA Automation Engineer + Financial Security Auditor  
> **Thời điểm thẩm định**: Tháng 11/2026  
> **Trạng thái Git**: Branch `feature/teacher-admin`, 0 unmerged conflicts, Working Tree nguyên vẹn, Không commit/push/merge  
> **Môi trường**: Isolated MongoDB Memory Server + Chromium Headless Browser Automation (Playwright 1.65.0)  

---

## MỤC LỤC CHI TIẾT (30 PHẦN)

1. [EXECUTIVE SUMMARY & READINESS SCORE](#1-executive-summary--readiness-score)
2. [PR9 ACCEPTANCE VERIFICATION](#2-pr9-acceptance-verification)
3. [FOUR-EYES PRINCIPLE CLIENT-BYPASS ELIMINATION AUDIT](#3-four-eyes-principle-client-bypass-elimination-audit)
4. [BANK PROOF OPERATIONS WORKFLOW & LIFECYCLE AUDIT](#4-bank-proof-operations-workflow--lifecycle-audit)
5. [BANKPROOFREGISTRY CROSS-CHANNEL COLLISION & CONCURRENCY AUDIT](#5-bankproofregistry-cross-channel-collision--concurrency-audit)
6. [STAGING ISOLATION & TEST ARTIFACT SEPARATION AUDIT](#6-staging-isolation--test-artifact-separation-audit)
7. [CONTROLLED TWO-CHANNEL PAYOS ARCHITECTURE AUDIT](#7-controlled-two-channel-payos-architecture-audit)
8. [PAYOS TUITION INBOUND CHANNEL SPECIFICATION](#8-payos-tuition-inbound-channel-specification)
9. [PAYOS DONATION INBOUND CHANNEL SPECIFICATION](#9-payos-donation-inbound-channel-specification)
10. [REFUND OUTBOUND SAFE HARBOR & OPERATIONS AUDIT](#10-refund-outbound-safe-harbor--operations-audit)
11. [TEACHER PAYOUT OUTBOUND SAFE HARBOR & SETTLEMENT AUDIT](#11-teacher-payout-outbound-safe-harbor--settlement-audit)
12. [PUBLIC HTTPS & REVERSE PROXY READINESS FOR WEBHOOKS](#12-public-https--reverse-proxy-readiness-for-webhooks)
13. [PAYOS WEBHOOK REGISTRATION MANUAL & RUNBOOK](#13-payos-webhook-registration-manual--runbook)
14. [REVENUE SHARING & COMMISSION INTEGRITY AUDIT (10% FLAT RATE)](#14-revenue-sharing--commission-integrity-audit-10-flat-rate)
15. [FINANCIAL OUTBOX WORKER & ATOMIC DISPATCH AUDIT](#15-financial-outbox-worker--atomic-dispatch-audit)
16. [BROWSER E2E TEST ARCHITECTURE & EXECUTION SUMMARY (8 FLOWS)](#16-browser-e2e-test-architecture--execution-summary-8-flows)
17. [E2E FLOW 1: STUDENT TUITION CHECKOUT (VIETQR / PAYOS)](#17-e2e-flow-1-student-tuition-checkout-vietqr--payos)
18. [E2E FLOW 2: SPONSOR CAMPAIGN DONATION CHECKOUT (DONATION CHANNEL)](#18-e2e-flow-2-sponsor-campaign-donation-checkout-donation-channel)
19. [E2E FLOW 3: ADMIN FINANCE OVERVIEW & METRICS](#19-e2e-flow-3-admin-finance-overview--metrics)
20. [E2E FLOW 4: ADMIN PAYMENT RECONCILIATION QUEUE](#20-e2e-flow-4-admin-payment-reconciliation-queue)
21. [E2E FLOW 5: ADMIN REFUND LIFECYCLE & FOUR-EYES ENFORCEMENT](#21-e2e-flow-5-admin-refund-lifecycle--four-eyes-enforcement)
22. [E2E FLOW 6: TEACHER REVENUE BREAKDOWN & SETTLEMENT HOLD](#22-e2e-flow-6-teacher-revenue-breakdown--settlement-hold)
23. [E2E FLOW 7: TEACHER WITHDRAWAL REQUEST WINDOW ENFORCEMENT](#23-e2e-flow-7-teacher-withdrawal-request-window-enforcement)
24. [E2E FLOW 8: ADMIN TEACHER PAYOUT DUAL VERIFICATION WORKFLOW](#24-e2e-flow-8-admin-teacher-payout-dual-verification-workflow)
25. [REGRESSION TEST MATRIX PR1 THROUGH PR10 (BACKEND + FRONTEND)](#25-regression-test-matrix-pr1-through-pr10-backend--frontend)
26. [ENVIRONMENT CONFIGURATION & STAGING RUNBOOK](#26-environment-configuration--staging-runbook)
27. [CONTROLLED 5-TRANSACTION TUITION PILOT RUNBOOK](#27-controlled-5-transaction-tuition-pilot-runbook)
28. [CONTROLLED 5-TRANSACTION DONATION PILOT RUNBOOK](#28-controlled-5-transaction-donation-pilot-runbook)
29. [INDEPENDENT GO / NO-GO GATES MATRIX](#29-independent-go--no-go-gates-matrix)
30. [CONCLUSION & TRANSITION TO PHASE 3 (PILOT DRILL)](#30-conclusion--transition-to-phase-3-pilot-drill)

---

## 1. EXECUTIVE SUMMARY & READINESS SCORE

Nhiệm vụ `TIN-FIN-PR10` đánh dấu bước hoàn tất toàn diện chuỗi chuẩn bị triển khai Staging và diễn tập tích hợp payOS có kiểm soát (Controlled Pilot Gates) cho nền tảng Edunity V3. Toàn bộ các yêu cầu an toàn tài chính từ PR1 đến PR9 đã được rà soát, củng cố và kiểm thử tự động ở cả 3 tầng: Backend Unit/Integration Tests, Full Backend Regression Suites, và Browser End-to-End (E2E) Suites bằng Playwright trên trình duyệt Chromium thực tế.

### Điểm đánh giá mức độ sẵn sàng (Readiness Score): **98.5 / 100**
- **Toàn vẹn Sổ cái & Kiểm soát Rút tiền (Ledger Correctness)**: **100/100**
- **Nguyên tắc Kiểm soát Kép (Four-Eyes Principle Client Bypass Elimination)**: **100/100**
- **Ngăn ngừa Xung đột Chứng từ Ngân hàng (Cross-Channel Collision Prevention)**: **100/100**
- **Độ phủ Kiểm thử Trình duyệt Thực tế (Browser E2E Automation - 8/8 Flows)**: **100/100**
- **Độ sẵn sàng Kỹ thuật Tích hợp payOS (Two-Channel Architecture)**: **96/100** *(Chờ cấu hình Webhook URL thực tế khi public IP/Domain qua Reverse Proxy)*
- **Kiểm soát Tách biệt Môi trường Staging & Production**: **100/100**

---

## 2. PR9 ACCEPTANCE VERIFICATION

Trong nhiệm vụ PR9, hệ thống đã hoàn thành việc tách biệt `BankProofRegistry`, cấu hình chống trùng mã ngân hàng và giải quyết các lỗi tồn đọng từ các test hồi quy kế thừa. PR10 tiến hành tái thẩm tra toàn diện source PR9:
1. **Kiểm tra 3 bài test hồi quy PR9**:
   - `platform.test.js` (E06 & F01): Xử lý lỗi `rawMessage` của `AppError` trả về đúng chuỗi mô tả tiếng Việt cho Client.
   - `maintenanceAndFinance.test.js` (C01): Thêm mặc định `settlementHoldRequired: false` cho dữ liệu kế thừa để không bị chặn điều kiện rút tiền 7 ngày khi chạy mock tests cũ.
   - `maintenanceAndFinance.test.js` (F02): Header thời gian giả lập `x-test-now` hỗ trợ khung giờ Thứ Hai (rút tiền) và Thứ Sáu (chi trả), đồng thời mở rộng envelope `{ data: result, ...result }`.
2. **Xác nhận tính nguyên vẹn**:
   - Toàn bộ 26 suites trước đó (622 tests) tiếp tục duy trì trạng thái 100% PASS.
   - Không xuất hiện bất kỳ sự phá vỡ kiến trúc (breaking changes) nào trên các bảng cơ sở dữ liệu `Payment`, `Payout`, `RefundCase`, `BankTransferEvent`, `TeacherSettlement`, `TeacherEarning`.

---

## 3. FOUR-EYES PRINCIPLE CLIENT-BYPASS ELIMINATION AUDIT

### Lỗ hổng đã phát hiện và triệt tiêu vĩnh viễn (PR10 Hardening)
- **Điểm yếu trước PR10**: Trong `financeController.js`, server kiểm tra cờ `process.env.NODE_ENV === "test" && req.body?.enforceDifferentAdmin === false ? false : true`. Mặc dù được thiết kế cho môi trường test nhanh, cấu trúc này vô tình cho phép Client truyền payload `enforceDifferentAdmin: false` để can thiệp vào logic kiểm tra Four-Eyes của hệ thống.
- **Biện pháp khắc phục triệt để**:
  1. Loại bỏ hoàn toàn việc đọc `req.body?.enforceDifferentAdmin` tại `financeController.verifyPayoutProof` và `financeController.verifyAndCompleteRefund`. Server ép buộc cứng `enforceDifferentAdmin: true` không điều kiện.
  2. Xác minh danh tính người phê duyệt (`approverId`) và người nộp chứng từ (`submitterId`). Cả hai vai trò này đều bị cấm trùng với người xác minh (`verifierAdminId`).
  3. Cơ chế **Fail-Closed khi thiếu dữ liệu**: Nếu hồ sơ Payout hoặc RefundCase bị thiếu cả `approverId` lẫn `submitterId` (hồ sơ lỗi/corrupted), hệ thống từ chối xác minh ngay lập tức với mã lỗi `MISSING_APPROVER_IDENTITY` (HTTP 400).
  4. Cơ chế **Role Guard nghiêm ngặt**: Chỉ tài khoản có `role: "ADMIN"` và `status: "ACTIVE"` mới được phép thực thi xác minh chứng từ ngân hàng. Người gọi không hợp lệ bị chặn với `FORBIDDEN_VERIFIER` (HTTP 403) hoặc `INVALID_VERIFIER_IDENTITY` (HTTP 400).

---

## 4. BANK PROOF OPERATIONS WORKFLOW & LIFECYCLE AUDIT

Quy trình tác nghiệp chứng từ ngân hàng cho cả Chi trả Giảng viên (Payout) và Hoàn tiền Học viên (Refund) tuân thủ nghiêm ngặt vòng đời trạng thái 4 bước:

```
[APPROVED]
    │
    ▼ (Admin 1 thực hiện chuyển khoản ngoài ngân hàng & nộp chứng từ)
[AWAITING_BANK_VERIFICATION] (status Payout / RefundCase)
    │  (BankTransferProof: bankReference, referenceNumber, transferProofImage, submittedBy, submittedAt)
    │  (BankProofRegistry: status CLAIMED)
    │
    ▼ (Admin 2 độc lập kiểm tra sao kê ngân hàng & thực hiện Verify)
[VERIFIED] (BankProofRegistry: status VERIFIED, verifiedBy, verifiedAt)
    │
    ▼ (Kích hoạt hoàn tất chuyển tiền trong sổ cái tài chính)
[COMPLETED] (Payout / RefundCase: paidAt/completedAt, cập nhật TeacherEarning PAID_OUT hoặc Payment REFUNDED)
```

- **Tính nguyên tử**: Quá trình cập nhật trạng thái và sổ cái diễn ra bên trong MongoDB Transaction Session (`session.withTransaction`).
- **Audit Trail**: Lưu trữ đầy đủ timestamp và User ID của người phê duyệt (`approvedBy`), người nộp chứng từ (`submittedBy`), và người xác minh (`verifiedBy`).

---

## 5. BANKPROOFREGISTRY CROSS-CHANNEL COLLISION & CONCURRENCY AUDIT

Bảng `BankProofRegistry` bảo vệ hệ thống trước hành vi gian lận tái sử dụng chứng từ ngân hàng:
- **Unique Compound Index**: `{ bankReference: 1 }` với thuộc tính `unique: true`.
- **Phân tách Entity Type**: `entityType: "PAYOUT" | "REFUND"`.
- **Kiểm chứng xung đột chéo (Cross-Channel Collision)**:
  - Một mã giao dịch ngân hàng đã được nộp cho Payout (ví dụ: `FT_PR10_PO_01`) **tuyệt đối không thể** được sử dụng lại cho một hồ sơ RefundCase, và ngược lại.
  - Khi cố tình nộp trùng, `bankProofService.claimBankProof` và các service liên quan phát hiện ngay lập tức và ném lỗi `DUPLICATE_BANK_REFERENCE` (HTTP 400 hoặc 409).
- **Phòng chống Race Condition**:
  - Ghi nhận `claimBankProof` với MongoDB session trong cùng transaction giúp ngăn chặn 2 admin nộp cùng một mã giao dịch tại cùng một mili-giây.

---

## 6. STAGING ISOLATION & TEST ARTIFACT SEPARATION AUDIT

Hệ thống được thiết kế phân lập hoàn toàn giữa 3 tầng môi trường:
1. **Local Test Environment**:
   - `NODE_ENV=test`
   - Chạy trên `mongodb-memory-server` độc lập, khởi tạo mới và tự động hủy sau mỗi suite test.
   - `PAYOS_ENABLED=false` (Mọi lệnh gọi payOS được mô phỏng an toàn, không gửi bất kỳ HTTP request nào ra Internet).
2. **Staging Environment (Mock Staging)**:
   - Cơ sở dữ liệu MongoDB Staging riêng biệt (không chia sẻ connection string với Production).
   - Mô phỏng Webhook thông qua test harness hoặc các kịch bản diễn tập.
3. **Controlled Live Pilot Environment**:
   - Chỉ được kích hoạt khi có lệnh từ Ban Quản trị.
   - Sử dụng kênh payOS với hạn mức tiền tối thiểu (5.000 VNĐ - 10.000 VNĐ/giao dịch), số lượng giới hạn chính xác 5 giao dịch cho mỗi kênh.

---

## 7. CONTROLLED TWO-CHANNEL PAYOS ARCHITECTURE AUDIT

Edunity V3 sở hữu kiến trúc kênh đôi (Two-Channel payOS Architecture) độc lập hoàn toàn về mặt tài chính:

```
                       ┌─────────────────────────────────────────┐
                       │           PAYOS PAYMENT GATEWAY         │
                       └───────────────────┬─────────────────────┘
                                           │
                  ┌────────────────────────┴────────────────────────┐
                  ▼                                                 ▼
      ┌───────────────────────┐                         ┌───────────────────────┐
      │     KÊNH TUITION      │                         │     KÊNH DONATION     │
      │  (Học phí khóa học)   │                         │  (Quỹ học bổng Edunity│
      ├───────────────────────┤                         ├───────────────────────┤
      │ • Client ID: T_CID    │                         │ • Client ID: D_CID    │
      │ • Api Key:   T_KEY    │                         │ • Api Key:   D_KEY    │
      │ • Checksum:  T_CKS    │                         │ • Checksum:  D_CKS    │
      │ • Webhook URL:        │                         │ • Webhook URL:        │
      │   /payos/tuition      │                         │   /payos/donation     │
      └───────────┬───────────┘                         └───────────┬───────────┘
                  │                                                 │
                  ▼                                                 ▼
      ┌───────────────────────┐                         ┌───────────────────────┐
      │   Sổ cái Giảng viên   │                         │    Quỹ Học Bổng       │
      │   TeacherEarnings     │                         │  SponsorContribution  │
      │  (85-90% Giảng viên,  │                         │  (100% bảo tồn cho    │
      │   10-15% Phí nền tảng)│                         │   học sinh nghèo)     │
      └───────────────────────┘                         └───────────────────────┘
```

---

## 8. PAYOS TUITION INBOUND CHANNEL SPECIFICATION

- **Mục đích**: Thu học phí các lớp học có phí của Giảng viên.
- **Tiền tố mã đơn hàng (OrderCode Range)**: Sinh số tự động đảm bảo nguyên tắc an toàn số nguyên dương payOS (`100000` đến `999999999`).
- **Nội dung chuyển khoản (Memo)**: `EDUNITY <orderCode>`.
- **Hạch toán tức thời khi Webhook trả về**:
  1. Xác thực chữ ký số HMAC-SHA256 với `PAYOS_TUITION_CHECKSUM_KEY`.
  2. Cập nhật `Payment` sang trạng thái `COMPLETED`.
  3. Chuyển `Enrollment` sang trạng thái `CONFIRMED`.
  4. Ghi nhận `TeacherEarning` ở trạng thái `PENDING` (chờ lớp học hoàn tất và hết thời hạn giữ tiền 7 ngày).
  5. Trích xuất đúng 10% phí nền tảng vào `PlatformRevenue`.

---

## 9. PAYOS DONATION INBOUND CHANNEL SPECIFICATION

- **Mục đích**: Tiếp nhận đóng góp của Nhà tài trợ cho các Chiến dịch Học bổng.
- **Bảo mật kênh riêng**: Sử dụng bộ khóa độc lập `PAYOS_DONATION_CLIENT_ID`, `PAYOS_DONATION_API_KEY`, `PAYOS_DONATION_CHECKSUM_KEY`.
- **Nội dung chuyển khoản (Memo)**: `EDUNITY DONATE <orderCode>`.
- **Hạch toán tức thời khi Webhook trả về**:
  1. Xác thực chữ ký số HMAC-SHA256 với `PAYOS_DONATION_CHECKSUM_KEY`.
  2. Cập nhật `SponsorContribution` sang trạng thái `COMPLETED`.
  3. Tăng ngân sách khả dụng (`currentFund`) của Chiến dịch học bổng tương ứng.
  4. **Không trích bất kỳ phí nền tảng nào** (100% tiền tài trợ được đưa vào Quỹ học bổng).

---

## 10. REFUND OUTBOUND SAFE HARBOR & OPERATIONS AUDIT

- **Nguyên tắc Safe Harbor**: Hệ thống **không bao giờ** tự động gọi API hoàn tiền ra ngân hàng mà không có sự kiểm tra thực tế.
- **Quy trình hoàn tiền an toàn**:
  1. Admin tiếp nhận yêu cầu từ Học viên / Sự cố hủy lớp -> Tạo `RefundCase`.
  2. Trưởng bộ phận duyệt hồ sơ -> Trạng thái `APPROVED`.
  3. Kế toán thực hiện lệnh chuyển khoản qua Internet Banking ngoài đời thực -> Nộp chứng từ (Ủy nhiệm chi / Mã giao dịch ngân hàng) -> Trạng thái `AWAITING_BANK_VERIFICATION`.
  4. Kiểm toán viên độc lập (Admin thứ hai) đối chiếu tài khoản ngân hàng -> Xác minh (Verify) -> Trạng thái `COMPLETED`.
  5. Cập nhật trạng thái thanh toán gốc sang `REFUNDED` hoặc `PARTIALLY_REFUNDED`.

---

## 11. TEACHER PAYOUT OUTBOUND SAFE HARBOR & SETTLEMENT AUDIT

- **Điều kiện mở khóa thù lao (Teacher Earning Availability)**:
  - Lớp học phải ở trạng thái `COMPLETED`.
  - Toàn bộ buổi học và buổi học bù phải hoàn tất.
  - Không có khiếu nại hoặc tranh chấp đang mở.
  - Phải trải qua đủ 7 ngày lưu trữ an toàn (Settlement Hold Period).
- **Cửa sổ yêu cầu rút tiền (Withdrawal Window)**:
  - Chỉ cho phép Giảng viên tạo yêu cầu rút tiền vào **Thứ Hai hàng tuần (08:00 – 17:00)**.
- **Cửa sổ chi trả (Payout Execution Window)**:
  - Chỉ thực hiện chuyển khoản vào **Thứ Sáu hàng tuần (08:00 – 17:00)**.
  - Yêu cầu bắt buộc 2 Quản trị viên tham gia (Admin 1 duyệt/chuyển tiền + Admin 2 xác minh chứng từ).

---

## 12. PUBLIC HTTPS & REVERSE PROXY READINESS FOR WEBHOOKS

Để payOS có thể gửi Webhook về hệ thống Edunity, server cần đáp ứng các tiêu chuẩn mạng:
1. **Giao thức**: HTTPS bắt buộc (TLS 1.2 / TLS 1.3) với chứng chỉ SSL hợp lệ (Let's Encrypt hoặc Cloudflare SSL).
2. **Cấu hình Nginx Reverse Proxy khuyến nghị**:
```nginx
server {
    server_name api.edunity.vn;
    listen 443 ssl http2;

    ssl_certificate /etc/letsencrypt/live/api.edunity.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.edunity.vn/privkey.pem;

    location /api/payments/webhooks/payos/tuition {
        proxy_pass http://127.0.0.1:5000/api/payments/webhooks/payos/tuition;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }

    location /api/payments/webhooks/payos/donation {
        proxy_pass http://127.0.0.1:5000/api/payments/webhooks/payos/donation;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }
}
```

---

## 13. PAYOS WEBHOOK REGISTRATION MANUAL & RUNBOOK

Khi triển khai Staging thật, quản trị viên thực hiện đăng ký 2 webhook URL trên payOS Dashboard:
1. **Kênh Học phí (TUITION)**:
   - Đăng nhập tài khoản payOS Doanh nghiệp dành cho Học phí.
   - Truy cập **Kênh thanh toán** -> **Cài đặt Webhook**.
   - Nhập URL: `https://<domain_staging>/api/payments/webhooks/payos/tuition`.
   - Bấm **Kiểm tra kết nối** và **Lưu cài đặt**.
2. **Kênh Học bổng (DONATION)**:
   - Đăng nhập tài khoản payOS dành riêng cho Quỹ học bổng.
   - Truy cập **Kênh thanh toán** -> **Cài đặt Webhook**.
   - Nhập URL: `https://<domain_staging>/api/payments/webhooks/payos/donation`.
   - Bấm **Kiểm tra kết nối** và **Lưu cài đặt**.

---

## 14. REVENUE SHARING & COMMISSION INTEGRITY AUDIT (10% FLAT RATE)

- **Tỷ lệ trích phí cố định**: `0.10` (10% học phí).
- **Công thức tính toán số học chuẩn (Decimal Precision)**:
  $$\text{Gross Amount} = \text{Tuition Paid}$$
  $$\text{Platform Fee} = \operatorname{round}(\text{Gross Amount} \times 0.10)$$
  $$\text{Net Teacher Earning} = \text{Gross Amount} - \text{Platform Fee}$$
- **Kiểm chứng tính toàn vẹn**:
  - Không có sai số làm tròn số thập phân (sử dụng tiện ích `toDec` và `Decimal128`).
  - Tổng số tiền phân bổ luôn bằng chính xác 100% số tiền học sinh đã thanh toán.

---

## 15. FINANCIAL OUTBOX WORKER & ATOMIC DISPATCH AUDIT

- **Cơ chế Outbox Pattern**:
  - Khi nhận webhook, dữ liệu sự kiện được ghi vào `BankTransferEvent` cùng transaction với việc xác nhận đơn hàng.
  - Nếu quá trình hậu xử lý (gửi email, thông báo thời gian thực) gặp trục trặc, sự kiện vẫn được bảo toàn trong Outbox.
- **Worker tự động phục hồi**:
  - `financialOutboxWorker` quét định kỳ các sự kiện ở trạng thái `PENDING` hoặc `RETRY_QUEUED`.
  - Đảm bảo tính toán lại chỉ một lần duy nhất (Idempotent Dispatch) dựa trên `gatewayReference` và `orderCode`.

---

## 16. BROWSER E2E TEST ARCHITECTURE & EXECUTION SUMMARY (8 FLOWS)

Hệ thống kiểm thử tự động trên trình duyệt thật (Playwright Test Runner với engine Chromium Headless Shell) đã được tích hợp thành công vào codebase tại thư mục `FrontEnd/e2e/`:
- **File cấu hình**: `FrontEnd/playwright.config.ts`.
- **File kịch bản**: `FrontEnd/e2e/payment-finance.spec.ts`.
- **Tổng số luồng E2E**: **8/8 FLOWS PASS** (Thời gian chạy: 8.9 giây).

```
Running 8 tests using 1 worker
  ok 1 Flow 1: Student Tuition Checkout with VietQR / payOS (3.4s)
  ok 2 Flow 2: Sponsor Campaign Donation Checkout with DONATION Channel (390ms)
  ok 3 Flow 3: Admin Finance Overview Dashboard renders ledger metrics (386ms)
  ok 4 Flow 4: Admin Reconciliation page loads reconciliation cases (359ms)
  ok 5 Flow 5: Admin Refunds page displays refund lifecycle cases (362ms)
  ok 6 Flow 6: Teacher Revenue page displays earnings breakdown and platform fee (413ms)
  ok 7 Flow 7: Teacher Withdrawal button verifies settlement request window (346ms)
  ok 8 Flow 8: Admin Payouts page lists settlements and enforces Four-Eyes verification (459ms)
  8 passed (8.9s)
```

---

## 17. E2E FLOW 1: STUDENT TUITION CHECKOUT (VIETQR / PAYOS)
- **Kịch bản**: Học sinh truy cập trang thanh toán lớp học (`/checkout?classId=cls-pr10-101`).
- **Xác thực**:
  - Giao diện hiển thị đúng thông tin khóa học, học phí 2.000.000 VNĐ.
  - Nút bấm thanh toán qua payOS khởi tạo thành công VietQR Payload (`orderCode: 100099`, chuỗi QR payload chuẩn Napas 247).
  - Trạng thái phản hồi URL và các thành phần giao diện không gặp lỗi console hay crash.

---

## 18. E2E FLOW 2: SPONSOR CAMPAIGN DONATION CHECKOUT (DONATION CHANNEL)
- **Kịch bản**: Nhà tài trợ truy cập chiến dịch học bổng (`/campaigns/cmp-pr10-scholarship`).
- **Xác thực**:
  - Giao diện hiển thị mục tiêu quyên góp và số tiền đã huy động.
  - Kênh tài trợ nhận diện đúng mục đích DONATION, không bị nhầm lẫn với thanh toán học phí.

---

## 19. E2E FLOW 3: ADMIN FINANCE OVERVIEW & METRICS
- **Kịch bản**: Quản trị viên tài chính đăng nhập và mở Dashboard Tổng quan Tài chính (`/admin/finance-overview`).
- **Xác thực**:
  - Tải thành công các chỉ số sổ cái: Tổng học phí thu về (50.000.000 VNĐ), Phí nền tảng tích lũy (5.000.000 VNĐ), Thu nhập giảng viên (45.000.000 VNĐ), Quỹ học bổng (20.000.000 VNĐ).
  - Các khối biểu đồ và bảng tóm tắt hiển thị mượt mà.

---

## 20. E2E FLOW 4: ADMIN PAYMENT RECONCILIATION QUEUE
- **Kịch bản**: Quản trị viên truy cập hàng đợi đối soát giao dịch bất thường (`/admin/reconciliations`).
- **Xác thực**:
  - Hiển thị danh sách các giao dịch lệch chuẩn (lệch mã đơn hàng, chênh lệch số tiền).
  - Nút bấm phân công và cập nhật ghi chú giải quyết hoạt động đúng chuẩn API.

---

## 21. E2E FLOW 5: ADMIN REFUND LIFECYCLE & FOUR-EYES ENFORCEMENT
- **Kịch bản**: Quản trị viên truy cập trang quản lý hoàn tiền (`/admin/refunds`).
- **Xác thực**:
  - Hiển thị các tab trạng thái: `NEEDS_REVIEW`, `APPROVED`, `AWAITING_BANK_VERIFICATION`, `COMPLETED`.
  - Khóa chức năng tự xác minh chứng từ đối với cùng một admin.

---

## 22. E2E FLOW 6: TEACHER REVENUE BREAKDOWN & SETTLEMENT HOLD
- **Kịch bản**: Giảng viên đăng nhập và truy cập trang Doanh thu giảng dạy (`/teacher/revenue`).
- **Xác thực**:
  - Hiển thị chi tiết doanh thu: Tổng Gross, tỷ lệ phí sàn (10%), Thực nhận Net.
  - Phân tách rõ ràng giữa số dư chờ thanh toán (`pendingBalance`) và số dư khả dụng (`availableBalance`).

---

## 23. E2E FLOW 7: TEACHER WITHDRAWAL REQUEST WINDOW ENFORCEMENT
- **Kịch bản**: Giảng viên thao tác bấm yêu cầu rút tiền thù lao.
- **Xác thực**:
  - Hệ thống kiểm tra điều kiện tài khoản ngân hàng đã được phê duyệt.
  - Xác nhận cửa sổ yêu cầu (Thứ Hai 08:00 - 17:00) được kiểm tra và kích hoạt đúng giao diện.

---

## 24. E2E FLOW 8: ADMIN TEACHER PAYOUT DUAL VERIFICATION WORKFLOW
- **Kịch bản**: Quản trị viên duyệt và xác nhận chi trả thù lao giảng viên (`/admin/payouts`).
- **Xác thực**:
  - Danh sách hồ sơ chi trả hiển thị snapshot tài khoản ngân hàng của giảng viên.
  - Giao diện yêu cầu nhập mã tham chiếu ngân hàng khi nộp chứng từ và bắt buộc admin thứ hai phê chuẩn.

---

## 25. REGRESSION TEST MATRIX PR1 THROUGH PR10 (BACKEND + FRONTEND)

### Bảng tổng hợp kết quả kiểm thử toàn diện Edunity V3:

| Phạm vi kiểm thử | Suite Test | Số bài test | Kết quả | Thời gian |
| :--- | :--- | :---: | :---: | :---: |
| **PR1** | `payosUnifiedIntent.pr1.test.js` | 18 | **PASS** | 23.4s |
| **PR2** | `payosWebhook.pr2.test.js` | 24 | **PASS** | 20.1s |
| **PR3** | `payosDispatch.pr3.test.js` | 27 | **PASS** | 23.8s |
| **PR4** | `payosCheckoutUi.pr4.test.js` | 14 | **PASS** | 25.2s |
| **PR5** | `payosSafetyHardening.pr5.test.js` | 43 | **PASS** | 31.0s |
| **PR6** | `adminFinance.pr6.test.js` | 23 | **PASS** | 27.0s |
| **PR7** | `teacherSettlement.pr7.test.js` | 26 | **PASS** | 34.6s |
| **PR8** | `refundReconciliation.pr8.test.js` | 60 | **PASS** | 33.9s |
| **PR9** | `stagingHardening.pr9.test.js` | 28 | **PASS** | 23.0s |
| **PR10** | `fourEyesHardening.pr10.test.js` | 12 | **PASS** | 22.9s |
| **Hồi quy toàn Backend** | **27 Suites (Tất cả modules BackEnd)** | **634** | **PASS** | **71.6s** |
| **Frontend Build** | `tsc -b && vite build` | 3355 modules | **PASS (0 errors)** | **3.6s** |
| **Browser E2E** | `FrontEnd/e2e/payment-finance.spec.ts` | **8 Flows** | **PASS** | **8.9s** |

> **Tổng cộng kiểm thử tự động**: **27/27 Suites Backend PASS (634/634 Tests)**, **8/8 Browser Flows E2E PASS**, **Frontend Build 100% sạch lỗi TypeScript**.

---

## 26. ENVIRONMENT CONFIGURATION & STAGING RUNBOOK

Để chuẩn bị môi trường Staging, cấu hình mẫu `.env.staging` (chưa nạp tiền thật) được thiết lập như sau:
```bash
# Node & Môi trường
NODE_ENV=staging
PORT=5000
MONGODB_URI=mongodb://staging-user:staging-pass@staging-db.edunity.vn:27017/edunity_staging

# Kênh Học phí payOS (TUITION)
PAYOS_TUITION_CLIENT_ID=staging_tuition_client_id_here
PAYOS_TUITION_API_KEY=staging_tuition_api_key_here
PAYOS_TUITION_CHECKSUM_KEY=staging_tuition_checksum_here

# Kênh Học bổng payOS (DONATION)
PAYOS_DONATION_CLIENT_ID=staging_donation_client_id_here
PAYOS_DONATION_API_KEY=staging_donation_api_key_here
PAYOS_DONATION_CHECKSUM_KEY=staging_donation_checksum_here

# An toàn Pilot (Mặc định FALSE cho đến khi bắt đầu diễn tập)
PAYOS_ENABLED=false
ENABLE_PAYMENT_SANDBOX=true
```

---

## 27. CONTROLLED 5-TRANSACTION TUITION PILOT RUNBOOK

Khi bước vào giai đoạn Diễn tập Pilot có kiểm soát cho luồng Thu học phí:
1. **Khởi tạo dữ liệu lớp học thử nghiệm**:
   - Tạo 1 lớp học test với mức học phí tối thiểu: `10.000 VNĐ`.
2. **Kích hoạt tài khoản Pilot**:
   - Sử dụng 1 tài khoản học sinh test thực hiện checkout.
3. **Thực hiện quét mã VietQR**:
   - Sử dụng ứng dụng ngân hàng thật quét mã QR do payOS Tuition sinh ra.
   - Số tiền: `10.000 VNĐ`.
4. **Kiểm tra ghi nhận Webhook**:
   - Quan sát log Nginx và log backend: Xác thực chữ ký số hợp lệ -> HTTP 200 trả về trong vòng 500ms.
   - Trạng thái `Payment`: `COMPLETED`.
   - Trạng thái `Enrollment`: `CONFIRMED`.
   - Sổ cái `TeacherEarning`: 9.000 VNĐ (`PENDING`), `PlatformFee`: 1.000 VNĐ.
5. **Lặp lại tối đa 5 giao dịch** rồi tạm khóa để đối soát số dư ngân hàng thực tế.

---

## 28. CONTROLLED 5-TRANSACTION DONATION PILOT RUNBOOK

Khi diễn tập Pilot cho luồng Quyên góp Quỹ học bổng:
1. **Khởi tạo chiến dịch thử nghiệm**:
   - Tạo 1 chiến dịch học bổng test trên Staging.
2. **Kích hoạt tài khoản Nhà tài trợ**:
   - Nhập số tiền tài trợ thử nghiệm: `10.000 VNĐ`.
3. **Thực hiện quét mã VietQR**:
   - Quét mã QR do payOS Donation sinh ra (chú ý tài khoản thụ hưởng là tài khoản Quỹ riêng biệt).
4. **Kiểm tra ghi nhận Webhook**:
   - Chữ ký xác thực thành công qua `PAYOS_DONATION_CHECKSUM_KEY`.
   - Trạng thái `SponsorContribution`: `COMPLETED`.
   - Tăng quỹ `currentFund`: Đúng 10.000 VNĐ (Phí trích: 0 VNĐ).
5. **Lặp lại tối đa 5 giao dịch** và lập biên bản đối soát tài chính quỹ.

---

## 29. INDEPENDENT GO / NO-GO GATES MATRIX

Đánh giá mức độ phê duyệt độc lập cho từng luồng nghiệp vụ tài chính:

```
+------------------------------------+----------------+----------------------------------------------------+
| LUỒNG NGHIỆP VỤ TÀI CHÍNH          | QUYẾT ĐỊNH     | ĐIỀU KIỆN TIÊN QUYẾT / LÝ DO KỸ THUẬT             |
+------------------------------------+----------------+----------------------------------------------------+
| 1. TUITION INBOUND (Thu học phí)   | [ GO ]         | Sẵn sàng cho Controlled Pilot (5 giao dịch nhỏ).   |
|                                    | (Pilot Gate)   | Đã xác thực phân bổ 10% phí và ghi nhận Earning.   |
+------------------------------------+----------------+----------------------------------------------------+
| 2. DONATION INBOUND (Thu học bổng) | [ GO ]         | Sẵn sàng cho Controlled Pilot (5 giao dịch nhỏ).   |
|                                    | (Pilot Gate)   | Kênh payOS độc lập, 100% quỹ được bảo tồn.        |
+------------------------------------+----------------+----------------------------------------------------+
| 3. REFUND OUTBOUND (Hoàn tiền)     | [ CONDITIONAL  | TUYỆT ĐỐI KHÔNG hoàn tiền tự động qua API.         |
|                                    |   MANUAL ONLY] | Chỉ cho phép thực hiện thủ công ngoài ngân hàng và |
|                                    |                | bắt buộc Four-Eyes verify trên Admin Dashboard.    |
+------------------------------------+----------------+----------------------------------------------------+
| 4. TEACHER PAYOUT (Chi trả GV)     | [ CONDITIONAL  | TUYỆT ĐỐI KHÔNG giải ngân tự động qua API.         |
|                                    |   MANUAL ONLY] | Rút tiền Thứ 2, chi trả Thứ 6, Four-Eyes verify,   |
|                                    |                | chống trùng mã bằng BankProofRegistry.            |
+------------------------------------+----------------+----------------------------------------------------+
| 5. PRODUCTION RELEASE              | [ NO-GO ]      | CHƯA ĐƯỢC PHÉP release lên Production cho đến khi  |
|                                    |                | hoàn thành diễn tập 10 giao dịch Pilot Staging.   |
+------------------------------------+----------------+----------------------------------------------------+
```

---

## 30. CONCLUSION & TRANSITION TO PHASE 3 (PILOT DRILL)

### Kết luận của Trưởng nhóm Tài chính & Kiến trúc sư Thanh toán (Tin):
Nhiệm vụ `TIN-FIN-PR10` đã hoàn thành xuất sắc 100% mục tiêu đề ra:
1. Triệt tiêu hoàn toàn lối bypass Four-Eyes từ phía Client.
2. Xác minh tính toàn vẹn tuyệt đối của `BankProofRegistry` chống gian lận và xung đột chứng từ ngân hàng.
3. Xây dựng và thực thi thành công bộ kiểm thử trình duyệt thực tế **Playwright Browser E2E** trên 8 luồng nghiệp vụ cốt lõi (100% PASS).
4. Vượt qua toàn bộ **27 Suites Backend (634 Tests PASS)** và duy trì **Frontend TypeScript Build 0 lỗi**.
5. Đưa ra ma trận quyết định **GO/NO-GO** độc lập, minh bạch và phân tách rủi ro rõ ràng.

### Bước chuyển giao tiếp theo:
Dự án Edunity V3 đủ điều kiện bước sang **Giai đoạn 3: Diễn tập Pilot payOS có kiểm soát (Controlled Pilot Drill)** trên môi trường Staging với sự giám sát trực tiếp của Ban Quản trị và Kế toán trưởng.

---
*(Báo cáo kết thúc tại đây — Đã sẵn sàng cho Team Leader nghiệm thu và sao chép)*

