# BÁO CÁO NGHIỆM THU KỸ THUẬT PR6: ADMIN FINANCE & PAYMENT RECONCILIATION DASHBOARD
**DỰ ÁN:** EDUNITY V3  
**TASK:** TIN-FIN-PR6  
**NGƯỜI PHỤ TRÁCH:** TIN — PAYMENT & FINANCE ARCHITECT / QA LEAD  
**NGÀY THỰC HIỆN:** 10/11/2026  
**TRẠNG THÁI:** HOÀN THÀNH TOÀN DIỆN (100% PASS — PRODUCTION-READY GATED)

---

## 1. TỔNG QUAN VÀ KẾT QUẢ NGHIỆM THU (EXECUTIVE SUMMARY)
PR6 là chặng tích hợp tài chính và đối soát quan trọng nhất trước khi EDUNITY V3 tiến hành cấu hình khóa bí mật payOS thật trên môi trường Staging/Production. Nhiệm vụ trọng tâm của PR6 gồm:
1. **Đóng dứt điểm lỗ hổng kiểm thử bảo mật PR5:** Xử lý triệt để ca kiểm thử `the gateway webhook needs the right secret` trong file `BackEnd/tests/security.test.js` phát sinh từ chính sách `COMMISSION_POLICY_APPROVED` được siết chặt tại PR5.
2. **Khắc phục lỗi truy vấn Sổ cái Giao dịch (Ledger Bug Fix):** Sửa lỗi trường truy vấn `filter.type` thành `filter.transactionType` trong `financeService.js` (vốn khiến việc lọc giao dịch theo loại không hoạt động trên hệ thống cũ).
3. **Xây dựng Trung tâm Điều hành Tài chính Admin (Admin Finance Overview APIs & UI):** Cung cấp bức tranh toàn cảnh về doanh thu học phí, quỹ tài trợ học bổng, các khoản thu tạm giữ (tiền treo/nợ phải trả), nghĩa vụ hoàn tiền và trạng thái thù lao giảng viên.
4. **Giám sát Webhooks payOS & Outbox Recovery Worker:** Giám sát thời gian thực toàn bộ `BankTransferEvent`, vòng đời xử lý `PENDING_DISPATCH` -> `DISPATCHED`, phát hiện giao dịch thử lại vượt ngưỡng (Exhausted &ge; 5).
5. **Hàng đợi Đối soát Giao dịch Bất thường (Payment Reconciliation Queue & Audit Trail):** Cho phép Admin tiếp nhận sự vụ (chuyển trạng thái CAS sang `IN_REVIEW`), phân công điều tra, thêm ghi chú kiểm toán (`auditReferences`) mà không làm ảnh hưởng hay sai lệch tính bất biến của sổ cái.
6. **Bảo toàn tuyệt đối 4 định lý an toàn tài chính (BR-34, FIN-16):**
   - **Định lý 1 (RECEIPT ≠ REVENUE):** Tiền thu từ học phí đến muộn (`UNAPPLIED_TUITION_RECEIPT`) là nợ phải trả / tiền gửi chờ đối soát, tuyệt đối KHÔNG được kết chuyển vào doanh thu khả dụng.
   - **Định lý 2 (DONATION ≠ TUITION):** Quỹ học bổng MTQ đóng góp chỉ giải ngân cho các chiến dịch học bổng, hạch toán vào tài khoản ngân hàng riêng biệt.
   - **Định lý 3 (PENDING REFUND ≠ REFUNDED):** Yêu cầu hoàn tiền ở trạng thái PENDING là nghĩa vụ nợ, không ghi giảm tài khoản tiền mặt cho đến khi PR8 thực hiện giải ngân.
   - **Định lý 4 (PENDING EARNING ≠ AVAILABLE EARNING):** Thù lao giảng viên từ lớp PAID bị khóa ở trạng thái PENDING cho đến khi lớp học hoàn thành (COMPLETED).

**Kết quả kiểm thử tổng hợp:**
- **PR6 Suite (`tests/adminFinance.pr6.test.js`):** 44/44 PASS (100%).
- **Security Suite (`tests/security.test.js`):** 55/55 PASS (100%).
- **PR5 Hardening Suite (`tests/payosSafetyHardening.pr5.test.js`):** 43/43 PASS (100%).
- **Toàn bộ 7 Suites Thanh toán & Bảo mật (PR1 -> PR6):** 186/186 PASS (100%).
- **Frontend TypeScript / Vite Build:** 0 lỗi biên dịch, bundle thành công (`tsc -b && vite build` PASS).

---

## 2. KIỂM TOÁN TIỀN TRẠM & GIẢI TRÌNH HIỆN TƯỢNG GIT TREE (PREFLIGHT AUDIT)
Trong báo cáo PR5-FIX trước đó, tác giả chỉ trích dẫn 2 dòng thay đổi trong mục 17:
```
M BackEnd/tests/payosSafetyHardening.pr5.test.js
M docs/payment-v3/09_PR5_FIX_ACCEPTANCE_REPORT.md
```
Điều này khiến Team Leader Tin đặt nghi vấn liệu các file PR1–PR5 có bị mất hay reset nhánh hay không.
**Kết quả kiểm tra thực tế bằng Git Engine:**
1. **Hiện trạng nhánh:** Nhánh hiện tại là `feature/teacher-admin`, đang dẫn trước nhánh gốc `origin/feature/teacher-admin` đúng 7 commits.
2. **Trạng thái Working Tree:** Toàn bộ 49 file mã nguồn được chỉnh sửa và tạo mới từ PR1 đến PR5 (gồm `payosService.js`, `payosWebhookService.js`, `financialDispatchService.js`, `financialOutboxWorker.js`, `BankTransferEvent.js`, `PaymentReconciliation.js`, các components Checkout UI, polling hooks...) vẫn **hoàn toàn nguyên vẹn 100% trong working tree**.
3. **Nguyên nhân dòng trích dẫn ngắn trong PR5-FIX:** Tác giả báo cáo PR5-FIX chỉ lọc và liệt kê cục bộ các file được chạm vào riêng trong lượt sửa lỗi PR5-FIX, chứ không phải do Git bị revert hay reset.
4. **Cam kết tuân thủ:** Không có bất kỳ lệnh `git commit`, `git push`, `git merge`, `git checkout` hay `git reset` nào được thực thi trong suốt quá trình triển khai PR6.

---

## 3. KHẮC PHỤC TRIỆT ĐỂ LỖI BẢO MẬT TRONG `tests/security.test.js`
### 3.1. Nguyên nhân gốc rễ (Root Cause)
Tại bài kiểm thử:
`tests/security.test.js` > `P0: payment webhooks` > `the gateway webhook needs the right secret`
Bài test thực thi dưới môi trường mô phỏng Production: `withEnv(PROD)` với `NODE_ENV="production"`.
Trong PR5, hệ thống đã bổ sung cơ chế kiểm soát hoa hồng an toàn (Commission Safety Hardening) thông qua `resolveCommissionPolicy()`. Khi chạy ở môi trường `production` hoặc `staging`, hệ thống yêu cầu bắt buộc phải có biến môi trường `COMMISSION_POLICY_APPROVED="true"` cùng chính sách hợp lệ. Nếu thiếu, middleware sẽ lập tức kích hoạt cơ chế an toàn **Fail-Closed**, trả về mã lỗi HTTP `503 SERVICE_UNAVAILABLE` với mã lỗi `COMMISSION_POLICY_NOT_CONFIGURED`.
Do đối tượng `PROD` trong file `security.test.js` cũ chỉ khai báo các biến bảo mật chung mà chưa cập nhật các khóa phê duyệt hoa hồng mới của PR5, webhook bị chặn ở tầng 503 thay vì tiến vào tầng xác thực chữ ký Webhook, dẫn đến `res.body.data` bị undefined.

### 3.2. Giải pháp khắc phục chuẩn mực
1. Cập nhật cấu hình môi trường chuẩn `PROD` và `ALL_KEYS` trong `BackEnd/tests/security.test.js` bổ sung các biến:
   - `COMMISSION_RATE: "0.10"`
   - `COMMISSION_POLICY_VERSION: "POLICY_PROD_APPROVED"`
   - `COMMISSION_POLICY_APPROVED: "true"`
2. Bổ sung thêm ca kiểm thử phủ định (Negative Test): Xác minh rằng nếu một webhook gateway gửi đến môi trường Production khi `COMMISSION_POLICY_APPROVED="false"`, hệ thống bắt buộc phải từ chối xác nhận ghi danh và trả về HTTP 503 Fail-Closed.
3. Kết quả: Toàn bộ suite `tests/security.test.js` đạt **55/55 PASS (100%)**.

---

## 4. KIẾN TRÚC VÀ CÁC ĐỊNH LÝ SỔ CÁI TÀI CHÍNH (FINANCIAL LEDGER INVARIANTS)
Sổ cái tài chính của EDUNITY V3 vận hành theo nguyên lý **Append-Only Immutable Ledger** (Bút toán ghi sổ cộng dồn không thể sửa đổi hoặc xóa cứng).
Bốn định lý cốt lõi được bảo đảm thông qua code và database indexes:
1. **RECEIPT ≠ REVENUE (Khoản thu ≠ Doanh thu):**
   - Khi một học viên chuyển khoản muộn sau khi chỗ học đã hết hạn hoặc bị hủy, hệ thống ghi nhận một BankTransferEvent và tạo bút toán `UNAPPLIED_TUITION_RECEIPT`.
   - Khoản tiền này đại diện cho một **khoản nợ phải trả (Suspense / Liability)** của nền tảng đối với học viên. Nền tảng chưa cung cấp dịch vụ đào tạo nên tuyệt đối không được ghi nhận vào `confirmedTuitionRevenue`.
2. **DONATION ≠ TUITION (Tài trợ MTQ ≠ Học phí):**
   - Tiền tài trợ của Mạnh thường quân được ghi nhận qua bút toán `SPONSOR_CONTRIBUTION` và được điều hướng vào tài khoản ngân hàng chiến dịch học bổng.
   - Nguồn tiền này không chịu chiết khấu hoa hồng của giáo viên và không được dùng để tính doanh thu dịch vụ của công ty.
3. **PENDING REFUND ≠ REFUNDED (Chờ hoàn tiền ≠ Đã hoàn tiền):**
   - Yêu cầu hoàn tiền được ghi nhận ở trạng thái `PENDING`. Sổ cái thể hiện đây là nghĩa vụ hoàn trả (Liability).
   - Chỉ khi Admin hoàn tất thủ tục và ngân hàng xác nhận tiền đã về tài khoản học viên (tại PR8), giao dịch mới chuyển sang `COMPLETED`.
4. **PENDING EARNING ≠ AVAILABLE EARNING (Thù lao tạm giữ ≠ Thù lao khả dụng):**
   - Mỗi khoản học phí thành công sinh ra một bản ghi `TeacherEarning` ở trạng thái `PENDING`.
   - Giảng viên KHÔNG THỂ rút khoản tiền này cho đến khi lớp học kết thúc đạt chuẩn và chuyển trạng thái sang `AVAILABLE`.

---

## 5. NÂNG CẤP BACKEND SERVICE (`financeService.js`)
File `BackEnd/src/services/financeService.js` được nâng cấp toàn diện với các khả năng:
1. **Khắc phục Bug Lọc Giao dịch (Ledger Filter Fix):**
   - Trước đây: `if (type) filter.type = type;` -> Sai lệch do Schema Transaction định nghĩa trường `transactionType`.
   - Nâng cấp: Hỗ trợ linh hoạt cả `transactionType` và bí danh `type` để tương thích ngược:
     ```javascript
     if (transactionType && transactionType !== "ALL") {
       filter.transactionType = transactionType;
     }
     ```
   - Hỗ trợ lọc theo `status`, khoảng thời gian `startDate` / `endDate`, và tra cứu ngược theo `orderCode` thông qua việc tìm kiếm ObjectId trong `BankTransferEvent`, `Payment`, và `SponsorContribution`.
   - Bổ sung trường `summary` phân loại tổng tiền và số lượng theo từng `transactionType`.
2. **Hàm Tổng quan Tài chính `getFinanceOverview()`:**
   - Sử dụng MongoDB Aggregation pipeline tính toán song song:
     - `confirmedTuitionRevenue`: Tổng tiền `ENROLLMENT_PAYMENT` có `status: "COMPLETED"`.
     - `confirmedDonationRevenue`: Tổng tiền `SPONSOR_CONTRIBUTION` có `status: "COMPLETED"`.
     - `unappliedLateReceipts`: Tổng tiền `UNAPPLIED_TUITION_RECEIPT` có `status: "COMPLETED"`.
     - `pendingRefundLiability`: Tổng tiền `REFUND` có `status: "PENDING"`.
     - `completedRefunds`: Tổng tiền `REFUND` có `status: "COMPLETED"`.
     - Thù lao giảng viên: Phân nhóm `PENDING`, `AVAILABLE`, `PAID_OUT`.
     - Thống kê đối soát: Đếm tổng sự vụ, phân loại theo trạng thái (`needsReview`, `inReview`, `resolvedApproved`...) và lý do phát sinh.
     - Tích hợp trực tiếp dữ liệu đo đạc (telemetry) của `financialOutboxWorker` (chu kỳ quét, backlog thực tế, sự kiện vượt ngưỡng 5 lần thử).
3. **Giám sát Webhook `getAdminBankEvents()` & `getAdminBankEventById()`:**
   - Phân trang danh sách sự kiện từ cổng thanh toán với bộ lọc kênh (`TUITION`/`DONATION`), trạng thái sự kiện, trạng thái dispatch, và cờ `isExhausted=true` (`dispatchAttempts >= 5`).
   - Hàm chuẩn hóa bảo mật `sanitizeBankEvent`: Loại bỏ toàn bộ trường nhạy cảm như `checksum`, `signature`, `apiKey`, `secret` trong `metadata` trước khi trả về client.
4. **Xử lý Hàng đợi Đối soát `PaymentReconciliation`:**
   - `getAdminReconciliations()`: Truy vấn danh sách sự vụ, populate đầy đủ thông tin sự kiện ngân hàng, đơn hàng, người được phân công và người giải quyết.
   - `assignReconciliation()`: Ứng dụng mô hình **CAS (Compare-And-Swap)** — nếu trạng thái hiện tại là `NEEDS_REVIEW`, tự động chuyển thành `IN_REVIEW`. Hỗ trợ gán cho chính Admin thực hiện (`assignedTo: "me"`) hoặc Admin chỉ định. Ghi nhận nhật ký kiểm toán vào mảng `auditReferences`.
   - `addReconciliationNote()`: Thêm ghi chú điều tra nghiệp vụ vĩnh viễn vào `auditReferences` kèm định danh Admin và dấu thời gian.

---

## 6. CONTROLLER TÀI CHÍNH & KIỂM SOÁT PHÂN QUYỀN (`financeController.js`)
Tất cả các endpoint trong `financeController.js` đều được trang bị hàng rào kiểm soát phân quyền tầng 2 (Defense-in-Depth):
```javascript
if (req.user.role !== "ADMIN") {
  return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
}
```
Các hàm xử lý bao gồm:
- `getFinanceOverview`: Trả về dữ liệu tài chính tổng thể và cảnh báo nghiệp vụ.
- `getAdminTransactions`: Nhận các tham số phân trang và bộ lọc nâng cao.
- `getAdminBankEvents` & `getAdminBankEventById`: Trả về danh sách và chi tiết sự kiện webhook đã khử độc PII.
- `getAdminReconciliations` & `getAdminReconciliationById`: Trả về hàng đợi sự vụ đối soát.
- `assignReconciliation`: Tiếp nhận và phân công sự vụ.
- `addReconciliationNote`: Lưu vết điều tra kiểm toán.

---

## 7. ĐỊNH TUYẾN & ĐỒNG BỘ ĐƯỜNG DẪN BÍ DANH (`financeRoutes.js`)
Nhằm ngăn ngừa triệt để lỗi 404 phát sinh giữa các quy ước URL khác nhau của Frontend và tài liệu kỹ thuật, `financeRoutes.js` sử dụng tính năng Route Array của Express:
```javascript
const admin = [authMiddleware, requireRole("ADMIN")];

// Hỗ trợ đồng thời 3 định dạng đường dẫn chuẩn
router.get(["/admin/overview", "/finance/admin/overview", "/admin/finance/overview"], admin, financeController.getFinanceOverview);
router.get(["/admin/transactions", "/finance/admin/transactions", "/admin/finance/transactions"], admin, financeController.getAdminTransactions);
router.get(["/admin/bank-events", "/finance/admin/bank-events"], admin, financeController.getAdminBankEvents);
router.get(["/admin/bank-events/:id", "/finance/admin/bank-events/:id"], admin, financeController.getAdminBankEventById);
router.get(["/admin/reconciliations", "/finance/admin/reconciliations"], admin, financeController.getAdminReconciliations);
router.get(["/admin/reconciliations/:id", "/finance/admin/reconciliations/:id"], admin, financeController.getAdminReconciliationById);
router.patch(["/admin/reconciliations/:id/assign", "/finance/admin/reconciliations/:id/assign"], admin, financeController.assignReconciliation);
router.post(["/admin/reconciliations/:id/notes", "/finance/admin/reconciliations/:id/notes"], admin, financeController.addReconciliationNote);
```
Điều này đảm bảo cho dù Frontend gọi `/api/admin/overview` hay `/api/finance/admin/overview`, Backend đều phản hồi chính xác mã 200.

---

## 8. CÁC SCHEMA DỮ LIỆU & BẢO VỆ CHỈ MỤC SỔ CÁI
1. **`Transaction.js`:**
   - Enums chuẩn: `ENROLLMENT_PAYMENT`, `UNAPPLIED_TUITION_RECEIPT`, `SCHOLARSHIP_USAGE`, `SPONSOR_CONTRIBUTION`, `TEACHER_PAYOUT`, `REFUND`.
   - DB Idempotency Indexes (đã gia cố từ PR5): Ngăn chặn ghi nhận trùng lặp giao dịch trên cùng một Payment hay BankTransferEvent ở tầng database engine.
2. **`BankTransferEvent.js`:**
   - Trạng thái sự kiện (`eventStatus`): `VERIFIED`, `READY_FOR_DISPATCH`, `DISPATCHING`, `DISPATCHED`, `DISPATCH_FAILED`, `LATE_SUCCESS_AFTER_FAILED`, `NEEDS_REVIEW`...
   - Trạng thái hạch toán (`dispatchStatus`): `PENDING_DISPATCH`, `DISPATCHING`, `DISPATCHED`, `DISPATCH_FAILED`, `RECONCILIATION_REQUIRED`.
   - Khóa duy nhất: `fingerprint` (SHA-256 duy nhất cho từng giao dịch ngân hàng).
3. **`PaymentReconciliation.js`:**
   - Enums trạng thái: `NEEDS_REVIEW`, `IN_REVIEW`, `RESOLVED_APPROVED`, `RESOLVED_REFUNDED`, `RESOLVED_IGNORED`.
   - Enums lý do: `UNMATCHED`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `EXPIRED_PAYMENT`, `LATE_PAYMENT_REVIEW`, `LATE_SUCCESS_AFTER_FAILED`...
   - Cấu trúc kiểm toán: `auditReferences: [{ action, note, timestamp }]`.

---

## 9. TÍCH HỢP ĐO ĐẠC OUTBOX WORKER (TELEMETRY INTEGRATION)
Hệ thống kết nối trực tiếp với `financialOutboxWorker.js` thông qua API:
- `getFinancialOutboxWorkerStatus()`: Trả về trạng thái bộ đếm nền (Interval, Batch size, Tổng số đã hạch toán, Trạng thái lượt chạy cuối).
- Kiểm tra trực tiếp trên Database:
  - `backlogCount`: Số sự kiện có `dispatchStatus IN ('PENDING_DISPATCH', 'DISPATCH_FAILED')` và `dispatchAttempts < 5`.
  - `exhaustedCount`: Số sự kiện có `dispatchAttempts >= 5` và `dispatchStatus != 'DISPATCHED'`.
- Khi `exhaustedCount > 0`, giao diện Admin lập tức gắn cờ cảnh báo đỏ để nhân viên tài chính kịp thời can thiệp kiểm tra nguyên nhân nghẽn mạng hoặc xung đột dữ liệu.

---

## 10. ĐỒNG BỘ TYPES VÀ CLIENT SERVICE FRONTEND
1. **`FrontEnd/src/types/payment.ts`:**
   - Bổ sung loại giao dịch `"UNAPPLIED_TUITION_RECEIPT"` vào `TransactionType`.
   - Cung cấp nhãn tiếng Việt chuẩn: `"Khoản thu học phí tạm giữ (đến muộn / cần đối soát)"`.
   - Khai báo giao diện hoàn chỉnh cho `BankTransferEventItem`, `PaymentReconciliationItem`, và `FinanceOverviewData`.
2. **`FrontEnd/src/api/paymentAdapters.ts`:**
   - Nâng cấp `adaptTransaction()`: Tự động trích xuất tên người gửi/người nhận (`sourceUser`, `destinationUser`), mã đơn `orderCode` từ các liên kết quan hệ trong populate.
3. **`FrontEnd/src/services/finance.service.ts`:**
   - Cung cấp đầy đủ các phương thức gọi API có định kiểu:
     - `getFinanceOverview()`
     - `getAdminTransactions(params)`
     - `getAdminBankEvents(params)`
     - `getAdminBankEventById(id)`
     - `getAdminReconciliations(params)`
     - `getAdminReconciliationById(id)`
     - `assignReconciliation(id, payload)`
     - `addReconciliationNote(id, payload)`

---

## 11. GIAO DIỆN TỔNG QUAN TÀI CHÍNH (`AdminFinanceOverviewPage.tsx`)
Trang Tổng quan Tài chính được thiết kế chuyên nghiệp, trực quan theo nguyên tắc điều hành tài chính cao cấp:
- **Biểu ngữ cảnh báo quy tắc sổ cái:** Hiển thị nổi bật các định lý RECEIPT ≠ REVENUE, DONATION ≠ TUITION, và cơ chế khóa thù lao PENDING.
- **Hàng chỉ số KPI tài chính (4 Thẻ chỉ số):**
  1. *Doanh thu Học phí:* Hiển thị số tiền học phí thực thu bằng màu xanh dương nổi bật.
  2. *Quỹ Tài trợ Học bổng:* Hiển thị tiền tài trợ của MTQ bằng màu xanh lá cây sinh thái.
  3. *Khoản thu tạm giữ (Nợ phải trả):* Viền vàng cảnh báo, làm rõ đây là tiền của học viên chuyển khoản muộn đang giữ hộ, không phải doanh thu.
  4. *Nghĩa vụ hoàn tiền:* Hiển thị số tiền đang chờ hoàn và số tiền đã hoàn trả xong.
- **Khu vực chuyên sâu (3 Khối nghiệp vụ):**
  - *Sổ cái Thù lao Giảng viên:* Phân tích chi tiết số dư PENDING (tạm khóa theo lớp), AVAILABLE (sẵn sàng rút), và PAID_OUT (đã giải ngân).
  - *Bộ giám sát Outbox Worker:* Hiển thị nhịp tim của worker (ĐANG CHẠY / DỪNG), chu kỳ quét, số sự kiện trong backlog và số sự kiện vượt ngưỡng retry.
  - *Hàng đợi Đối soát:* Đếm số lượng sự vụ theo từng trạng thái và lý do.
- **Thanh lối tắt:** Truy cập nhanh 1-click đến Sổ cái giao dịch, Hàng đợi đối soát, và Giám sát webhooks.

---

## 12. GIAO DIỆN SỔ CÁI GIAO DỊCH (`AdminTransactionsPage.tsx`)
Được đại tu toàn bộ dựa trên phản hồi của QA và Team Leader:
- **Bộ lọc mạnh mẽ:**
  - Tìm kiếm chính xác theo mã đơn hàng `orderCode`.
  - Bộ lọc loại giao dịch đầy đủ (bao gồm `ENROLLMENT_PAYMENT`, `UNAPPLIED_TUITION_RECEIPT`, `SPONSOR_CONTRIBUTION`, `SCHOLARSHIP_USAGE`, `TEACHER_PAYOUT`, `REFUND`).
  - Bộ lọc trạng thái (`COMPLETED`, `PENDING`, `FAILED`).
- **Bảng dữ liệu Ledger chuyên nghiệp:**
  - Cột mã bút toán dạng Monospace font.
  - Cột mã đơn hàng `orderCode` màu xanh dương nổi bật.
  - Cột số tiền định dạng VND rõ ràng: Dấu `+` xanh lá đối với dòng tiền vào (Inflow), dấu `-` đỏ đối với dòng tiền ra (Refund, Payout).
  - Cột Nguồn/Đích hiển thị tên và email thay vì mã hex thô.
- **Modal chi tiết giao dịch:** Mở xem nhanh toàn bộ thuộc tính của bút toán ghi sổ.

---

## 13. GIAO DIỆN GIÁM SÁT WEBHOOKS & OUTBOX (`AdminBankEventsPage.tsx`)
Module chuyên trách phục vụ đội ngũ kỹ sư hạ tầng và kỹ thuật viên thanh toán:
- **Bộ lọc kỹ thuật:** Lọc theo kênh thanh toán (TUITION/DONATION), trạng thái webhook (`VERIFIED`, `READY_FOR_DISPATCH`, `DISPATCH_FAILED`...), trạng thái dispatch (`PENDING_DISPATCH`, `DISPATCHING`, `DISPATCHED`...).
- **Cờ lọc sự cố khẩn cấp (Exhausted Switch):** Cho phép bật chế độ chỉ hiển thị các giao dịch đã thử lại thất bại từ 5 lần trở lên để điều tra nguyên nhân.
- **Huy hiệu số lần thử:** Hiển thị tiến trình thử lại (ví dụ: `Thử: 3/5` màu vàng, `Thử: 5/5` màu đỏ).
- **Modal chi tiết sự kiện an toàn:** Hiển thị toàn bộ thông số chuyển khoản ngân hàng và khối dữ liệu metadata JSON đã được che giấu/xóa bỏ mọi khóa bí mật và chữ ký số.

---

## 14. GIAO DIỆN HÀNG ĐỢI ĐỐI SOÁT (`AdminReconciliationsPage.tsx`)
Công cụ trung tâm cho nhân viên kiểm toán tài chính:
- **Hàng đợi sự vụ thông minh:** Phân loại theo mức độ ưu tiên và lý do (Giao dịch muộn, Sai lệch số tiền, Hết hạn hold, Tài khoản không khớp...).
- **Cơ chế Phân công & Tiếp nhận 1-Click (Assignment CAS):**
  - Admin nhấn "Tiếp nhận" -> chọn "Chính tôi" (`me`) hoặc chọn Admin trong danh sách -> hệ thống cập nhật người chịu trách nhiệm và chuyển trạng thái sự vụ từ `NEEDS_REVIEW` sang `IN_REVIEW`.
- **Thêm ghi chú kiểm toán (Audit Trail Note):**
  - Cho phép nhân viên lưu lại biên bản cuộc gọi với học viên, kết quả tra soát với ngân hàng hoặc lý do chấp thuận.
  - Mỗi ghi chú được lưu kèm email Admin và mốc thời gian chính xác, hiển thị dưới dạng dòng thời gian Timeline không thể tẩy xóa.
- **Bảo vệ an toàn thao tác hoàn tiền (PR8 Gating):**
  - Nút "Xử lý Hoàn tiền" được cố tình khóa (Disabled) kèm Tooltip giải thích: *"Chức năng hoàn tiền thật bảo lưu cho PR8. Không xử lý trực tiếp tại giao diện để tránh rủi ro giải ngân ngoài ý muốn."*

---

## 15. TÍCH HỢP ĐIỀU HƯỚNG VÀ ROUTER FRONTEND
1. **`FrontEnd/src/routes/routePaths.ts`:**
   - Bổ sung các đường dẫn mới:
     - `ADMIN.FINANCE_OVERVIEW: "/admin/finance-overview"`
     - `ADMIN.BANK_EVENTS: "/admin/bank-events"`
     - `ADMIN.RECONCILIATIONS: "/admin/reconciliations"`
2. **`FrontEnd/src/app/router.tsx`:**
   - Khai báo các route con trong layout Admin:
     - `<Route path="finance-overview" element={<AdminFinanceOverviewPage />} />`
     - `<Route path="bank-events" element={<AdminBankEventsPage />} />`
     - `<Route path="reconciliations" element={<AdminReconciliationsPage />} />`
3. **`FrontEnd/src/components/layout/AdminLayout.tsx`:**
   - Tái cấu trúc cụm menu **"TÀI CHÍNH & ĐỐI SOÁT"** trên thanh Sidebar:
     1. *Tổng quan tài chính* (Icon BarChartOutlined)
     2. *Sổ cái giao dịch* (Icon FileTextOutlined)
     3. *Hàng đợi đối soát* (Icon AuditOutlined)
     4. *Webhooks & Outbox* (Icon CloudSyncOutlined)
     5. *Thanh toán học phí* (Icon WalletOutlined)
     6. *Rút tiền giáo viên* (Icon WalletOutlined)

---

## 16. KIẾN TRÚC TEST SUITE PR6 (`tests/adminFinance.pr6.test.js`)
File test `BackEnd/tests/adminFinance.pr6.test.js` được xây dựng với cấu trúc 6 Suite bao phủ toàn bộ 44 yêu cầu kiểm thử kỹ thuật:
- **Suite 1: RBAC & Security Authorization (8 tests):** Kiểm tra chặn truy cập đối với yêu cầu ẩn danh (401) và các vai trò không hợp lệ như STUDENT, TEACHER (403 FORBIDDEN) trên toàn bộ 8 endpoint tài chính Admin.
- **Suite 2: Admin Finance Overview Metrics (8 tests):** Kiểm tra độ chính xác của phép tính doanh thu học phí, tiền tài trợ MTQ, tiền treo đến muộn, công nợ hoàn tiền, thù lao giảng viên và số liệu telemetry outbox.
- **Suite 3: Admin Transactions Ledger & Filter Fix (9 tests):** Xác minh phân trang, khắc phục lỗi lọc `transactionType`, khả năng tương thích ngược của `type`, lọc `orderCode`, và cấu trúc summary.
- **Suite 4: BankTransferEvents Webhooks & Outbox Monitoring (7 tests):** Kiểm tra lọc sự kiện theo kênh, trạng thái hạch toán, cờ lọc sự kiện cạn kiệt lần thử (`isExhausted`), tính năng khử độc thông tin nhạy cảm trong metadata, và xử lý 404.
- **Suite 5: PaymentReconciliations Queue & Management (8 tests):** Kiểm tra lọc danh sách đối soát, chuyển đổi trạng thái CAS khi phân công (`NEEDS_REVIEW` -> `IN_REVIEW`), ngăn chặn phân công cho non-admin (400), thêm ghi chú kiểm toán, và từ chối ghi chú rỗng.
- **Suite 6: Financial Ledger Invariants & Aliases (4 tests):** Xác minh bất biến kế toán (UNAPPLIED_TUITION_RECEIPT không vào doanh thu, SPONSOR_CONTRIBUTION không vào học phí, PENDING REFUND không trừ hoàn tiền) và tính tương đương của 3 đường dẫn bí danh URL.

---

## 17. BẢNG MA TRẬN KẾT QUẢ THỰC THI TOÀN BỘ KIỂM THỬ
Toàn bộ các bộ kiểm thử tự động của hệ thống được thực thi độc lập và liên hoàn trên môi trường in-memory MongoDB replica set:

| STT | Tên Test Suite | File Kiểm Thử | Số Tests | Kết Quả | Thời Gian Chạy | Ghi Chú |
|:---:|:---|:---|:---:|:---:|:---:|:---|
| 1 | **PR6 Admin Finance & Reconciliation** | `tests/adminFinance.pr6.test.js` | 44 | **PASS (44/44)** | 18.67s | Mới tạo, đạt 100% chỉ tiêu |
| 2 | **PR5 Safety Hardening** | `tests/payosSafetyHardening.pr5.test.js` | 43 | **PASS (43/43)** | 17.34s | Giữ vững toàn vẹn sau PR5-FIX |
| 3 | **Security & Webhook Fail-Closed** | `tests/security.test.js` | 55 | **PASS (55/55)** | 22.64s | Đã fix lỗi webhook secret |
| 4 | **PR1 Unified Payment Intent** | `tests/payosUnifiedIntent.pr1.test.js` | 13 | **PASS (13/13)** | 14.28s | Hoạt động hoàn hảo |
| 5 | **PR2 Two-Channel Webhook** | `tests/payosWebhook.pr2.test.js` | 11 | **PASS (11/11)** | 16.37s | Hoạt động hoàn hảo |
| 6 | **PR3 Financial Dispatcher** | `tests/payosDispatch.pr3.test.js` | 10 | **PASS (10/10)** | 18.29s | Hoạt động hoàn hảo |
| 7 | **PR4 Checkout UI Integration** | `tests/payosCheckoutUi.pr4.test.js` | 10 | **PASS (10/10)** | 17.35s | Hoạt động hoàn hảo |
| **Tổng** | **Tổng hợp 7 Suites Thanh toán & Bảo mật** | **Tất cả các file trên** | **186** | **PASS (186/186)** | **100% PASS** | **Không có bất kỳ test nào thất bại** |

**Kết quả kiểm tra Frontend:**
```bash
npm --prefix FrontEnd run build
```
- Kết quả: `tsc -b && vite build` hoàn thành trong 8.53 giây, **0 lỗi TypeScript, 0 lỗi cảnh báo build**.

---

## 18. PHÂN TÍCH CÁC TÌNH HUỐNG BIÊN & CHẾ ĐỘ XỬ LÝ LỖI (FAILURE MODES)
1. **Xung đột ghi nhận phân công (CAS Assignment Race Condition):**
   - Nếu hai Admin cùng mở một sự vụ ở trạng thái `NEEDS_REVIEW` và cùng gửi lệnh tiếp nhận, hệ thống áp dụng cơ chế cập nhật trạng thái nguyên tử. Sự vụ chuyển sang `IN_REVIEW` và lưu vết rõ ràng danh tính Admin gửi lệnh sau cùng trong `auditReferences`.
2. **Ngăn chặn phân công sai vai trò:**
   - Nếu Admin vô tình nhập ID của tài khoản STUDENT hoặc TEACHER vào API phân công, service kiểm tra vai trò `targetUser.role !== 'ADMIN'` và lập tức ném lỗi HTTP 400 `INVALID_ASSIGNEE`, bảo đảm tính nghiêm ngặt về thẩm quyền tài chính.
3. **Phòng chống lộ khóa bảo mật qua Webhook Metadata:**
   - Dữ liệu `metadata` của BankTransferEvent có thể chứa payload thô từ gateway. Hàm `sanitizeBankEvent()` lọc sạch các thuộc tính `checksum`, `signature`, `apiKey`, `secret` trước khi gửi ra REST API, ngăn chặn nguy cơ nhân viên Admin vô tình sao chép dữ liệu nhạy cảm ra ngoài.
4. **Bảo toàn dữ liệu khi Mongo aggregation rỗng:**
   - Các hàm tính tổng `sumAmounts()` sử dụng kiểm tra mảng kết quả phòng ngừa trường hợp bảng giao dịch chưa có bản ghi nào, luôn bảo đảm trả về chuỗi `"0"` an toàn thay vì gây sập tiến trình với lỗi `TypeError: Cannot read properties of undefined`.

---

## 19. TỐI ƯU HÓA TRUY VẤN VÀ ĐÁNH GIÁ CHỈ MỤC (INDEX AUDIT)
Hệ thống sử dụng các chỉ mục tối ưu trên MongoDB cho các tác vụ truy vấn tài chính:
1. `Transaction`:
   - `{ relatedPaymentId: 1, transactionType: 1 }` (Unique partial guard)
   - `{ relatedBankEventId: 1, transactionType: 1 }` (Unique partial guard)
   - `{ sourceUserId: 1, createdAt: -1 }` (Index phục vụ lọc lịch sử người dùng)
   - `{ createdAt: -1 }` (Index phục vụ phân trang sổ cái)
2. `BankTransferEvent`:
   - `{ fingerprint: 1 }` (Unique index chống ghi nhận trùng lặp webhook)
   - `{ orderCode: 1 }` (Index tra cứu nhanh theo mã đơn hàng)
   - `{ dispatchStatus: 1, nextRetryAt: 1 }` (Compound index phục vụ Outbox recovery worker)
3. `PaymentReconciliation`:
   - `{ eventId: 1 }` (Unique index bảo đảm 1 sự kiện chỉ có tối đa 1 hồ sơ đối soát)
   - `{ status: 1, reason: 1, createdAt: -1 }` (Index phục vụ lọc hàng đợi Admin)

---

## 20. BẢO MẬT, QUYỀN RIÊNG TƯ & KHỬ ĐỘC THÔNG TIN NGÂN HÀNG (PII REDACTION)
- Tuyệt đối không lưu trữ thông tin thẻ tín dụng, CVV hoặc mã PIN.
- Số tài khoản ngân hàng của học viên và nhà tài trợ chỉ hiển thị 4 số cuối trong nhật ký giao diện công khai nếu cần thiết.
- Khóa bảo mật API payOS (`PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`) được lưu trữ trong biến môi trường bảo mật, không xuất hiện trong bất kỳ phản hồi JSON nào của Admin API.
- Báo cáo này đã che giấu (mask) toàn bộ các giá trị bí mật thực tế.

---

## 21. CẤU HÌNH MÔI TRƯỜNG & GIÁ TRỊ AN TOÀN MẶC ĐỊNH (SAFE DEFAULTS)
Các biến môi trường được duy trì ở trạng thái an toàn:
- `PAYOS_ENABLED=false` (Mặc định sử dụng mock/sandbox adapter, không gọi ra cổng thanh toán thật).
- `ENABLE_FINANCIAL_OUTBOX_WORKER=true` (Worker phục hồi tự động kích hoạt để bảo vệ tính nhất quán cuối cùng).
- `COMMISSION_RATE=0.10` (Mức hoa hồng nền tảng mặc định 10%).
- `COMMISSION_POLICY_APPROVED=true` (Đã được cấu hình trong môi trường kiểm thử và triển khai có kiểm soát).

---

## 22. KIỂM TRA TOÀN VẸN CÂY MÃ NGUỒN VÀ TRẠNG THÁI GIT (GIT PREFLIGHT)
- **Branch:** `feature/teacher-admin`
- **Ahead:** 7 commits so với `origin/feature/teacher-admin`
- **Lệnh cấm vi phạm:** Tuyệt đối không thực hiện `git commit`, `git push`, `git merge`, `git checkout` hay `git reset`.
- **Thống kê các file thay đổi chính trong PR6:**
  - `BackEnd/src/services/financeService.js` (Nâng cấp Overview, Transactions fix, BankEvents, Reconciliations)
  - `BackEnd/src/controllers/financeController.js` (Bổ sung RBAC và các action controller mới)
  - `BackEnd/src/routes/financeRoutes.js` (Cấu hình route array và middleware `requireRole("ADMIN")`)
  - `BackEnd/tests/security.test.js` (Khắc phục môi trường commission policy trong test P0)
  - `BackEnd/tests/adminFinance.pr6.test.js` (44 tests mới bao phủ toàn bộ chức năng PR6)
  - `FrontEnd/src/types/payment.ts` (Bổ sung types đối soát, outbox và nhãn giao dịch)
  - `FrontEnd/src/api/paymentAdapters.ts` (Nâng cấp adapter giao dịch sổ cái)
  - `FrontEnd/src/services/finance.service.ts` (Bổ sung client API methods)
  - `FrontEnd/src/routes/routePaths.ts` (Khai báo route paths mới cho Admin)
  - `FrontEnd/src/app/router.tsx` (Đăng ký routes Admin)
  - `FrontEnd/src/components/layout/AdminLayout.tsx` (Menu Tài chính & Đối soát)
  - `FrontEnd/src/features/admin/finance/AdminFinanceOverviewPage.tsx` (Giao diện Tổng quan tài chính)
  - `FrontEnd/src/features/admin/finance/AdminTransactionsPage.tsx` (Giao diện Sổ cái giao dịch)
  - `FrontEnd/src/features/admin/finance/AdminBankEventsPage.tsx` (Giao diện Giám sát webhooks & outbox)
  - `FrontEnd/src/features/admin/finance/AdminReconciliationsPage.tsx` (Giao diện Hàng đợi đối soát)

---

## 23. BẢNG TƯƠNG THÍCH LIÊN PHÂN HỆ (CROSS-PR COMPATIBILITY)
- **PR1 (Payment Intent Engine):** Các Payment Intent được tạo từ PR1 hiển thị chính xác trong màn hình Thanh toán học phí (`/admin/payments`) và liên kết mượt mà với các bút toán Sổ cái PR6.
- **PR2 (Webhook Processor):** Toàn bộ sự kiện lưu trữ trong `BankTransferEvent` từ PR2 được hiển thị chi tiết, minh bạch trên trang Giám sát Webhooks PR6 (`/admin/bank-events`).
- **PR3 (Financial Dispatcher):** Các bản ghi Sổ cái `Transaction` do Dispatcher tạo ra được phản ánh tức thì lên biểu đồ doanh thu và bảng Sổ cái giao dịch PR6.
- **PR4 (Checkout UI):** Các mã QR VietQR và OrderCode học viên thanh toán trên Checkout UI được tra cứu tức thì thông qua ô tìm kiếm `orderCode` của PR6.
- **PR5 (Safety Hardening):** Outbox Worker phục hồi giao dịch và các khóa Unique Index từ PR5 được giám sát trực tiếp trên widget Telemetry của PR6.

---

## 24. CÁC ĐIỂM CHỜ VÀ BƯỚC ĐI TIẾP THEO CHO PR7 VÀ PR8
1. **PR7 — Teacher Payout Execution (Giải ngân cho Giảng viên):**
   - Hiện tại PR6 đã thể hiện minh bạch số dư `AVAILABLE` của giảng viên.
   - PR7 sẽ hiện thực hóa quy trình chuyển khoản ngân hàng qua payOS Payout API hoặc đối soát lệnh chuyển khoản hàng loạt (Batch Payout).
2. **PR8 — Automated/Live Refund Flow (Quy trình Hoàn tiền Thực tế):**
   - PR6 đã tạo sẵn hàng đợi đối soát và nút "Xử lý Hoàn tiền" ở chế độ an toàn (Disabled).
   - PR8 sẽ xây dựng form xác nhận hoàn tiền, tính năng gọi API đảo lệnh ngân hàng và tự động cập nhật trạng thái sự vụ thành `RESOLVED_REFUNDED`.

---

## 25. ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG TRIỂN KHAI (PRODUCTION READINESS ASSESSMENT)
- [x] Sổ cái tài chính bất biến, không thể bị ghi đè hoặc can thiệp thủ công từ Frontend.
- [x] Tách biệt tuyệt đối giữa Doanh thu Học phí và Quỹ Tài trợ Học bổng.
- [x] Khoản thu học phí tạm giữ do đến muộn được ghi nhận đúng chuẩn mực là Nợ phải trả (RECEIPT ≠ REVENUE).
- [x] Thù lao giảng viên được bảo vệ ở trạng thái PENDING cho đến khi lớp học hoàn thành.
- [x] Toàn bộ dữ liệu nhạy cảm của ngân hàng được khử độc trước khi hiển thị cho người dùng.
- [x] Hệ thống kiểm thử tự động 186/186 tests đạt trạng thái PASS 100%.
- [x] Mã nguồn Frontend biên dịch thành công, không có lỗi TypeScript hay Vite build.

---

## 26. QUY TRÌNH VẬN HÀNH DÀNH CHO ADMIN TÀI CHÍNH (OPERATIONAL PLAYBOOK)
1. **Kiểm tra đầu ngày:**
   - Truy cập `/admin/finance-overview`, kiểm tra chỉ số `Vượt ngưỡng retry (Exhausted)`.
   - Nếu số lượng > 0, nhấn vào liên kết để mở `/admin/bank-events?isExhausted=true` và kiểm tra chi tiết lỗi kỹ thuật.
2. **Xử lý sự vụ đối soát bất thường:**
   - Truy cập `/admin/reconciliations`, kiểm tra các sự vụ ở trạng thái `NEEDS_REVIEW`.
   - Nhấn "Tiếp nhận" để nhận sự vụ về mình (trạng thái chuyển sang `IN_REVIEW`).
   - Mở chi tiết xem số tiền nhận được và lý do (ví dụ: `LATE_PAYMENT_REVIEW`).
   - Liên hệ học viên theo thông tin email/điện thoại để xác nhận học viên muốn nhận lại tiền hay bảo lưu chỗ học.
   - Nhấn "Thêm ghi chú" để ghi nhận lại kết quả trao đổi vào nhật ký kiểm toán.
3. **Tra soát giao dịch kế toán:**
   - Khi có yêu cầu kiểm toán hoặc đối soát từ ngân hàng, truy cập `/admin/transactions`.
   - Nhập `orderCode` vào thanh tìm kiếm để kiểm tra toàn bộ lịch sử ghi sổ liên quan đến giao dịch đó.

---

## 27. KẾT LUẬN & KIẾN NGHỊ BÀN GIAO
Giai đoạn **TIN-FIN-PR6: ADMIN FINANCE & PAYMENT RECONCILIATION DASHBOARD KẾT HỢP FINAL SECURITY REGRESSION HARDENING** đã hoàn thành xuất sắc 100% mục tiêu kỹ thuật đặt ra:
- Khắc phục triệt để lỗi kiểm thử bảo mật của PR5.
- Sửa lỗi truy vấn sổ cái giao dịch cũ.
- Hoàn thiện toàn bộ hệ sinh thái Dashboard quản trị tài chính, webhooks outbox và hàng đợi đối soát từ Backend đến Frontend.
- Giữ vững tính bất biến và chuẩn mực an toàn kế toán cao nhất của EDUNITY V3.

Đề xuất Team Leader Tin phê duyệt nghiệm thu PR6 để tiến hành các bước tiếp theo trong lộ trình tích hợp cổng thanh toán payOS.

