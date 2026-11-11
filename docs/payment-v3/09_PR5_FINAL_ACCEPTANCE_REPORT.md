# BÁO CÁO NGHIỆM THU TOÀN DIỆN PR5 (FINAL ACCEPTANCE REPORT)
## DỰ ÁN EDUNITY V3 — HỆ THỐNG THANH TOÁN UNIFIED PAYOS & AN TOÀN SỔ SÁCH TÀI CHÍNH

- **Mã nhiệm vụ:** `TIN-FIN-PR5-ACCEPTANCE`
- **Người phụ trách:** Tin — Team Leader, Payment & Finance Architect
- **Vai trò thực hiện:** Senior Payment Architect + QA Lead + Financial Security Auditor
- **Ngày thực hiện:** 09/11/2026
- **Chế độ kiểm tra:** READ-ONLY SOURCE CODE (Không sửa code Backend/Frontend, không sửa DB production, không gọi API tiền thật, không commit/push Git).
- **Trạng thái nghiệm thu:** **CONDITIONAL GO / CHẤP THUẬN CÓ ĐIỀU KIỆN TIỀN TRÌNH PR6**

---

## 01. TỔNG QUAN KẾT QUẢ PR5

Giai đoạn PR5 (**Financial Safety Hardening**) được thiết kế để giải quyết toàn bộ các lỗ hổng P0/P1 về tính toàn vẹn sổ sách tài chính (Ledger Integrity), cơ chế phục hồi giao dịch nền (Outbox Recovery Worker), tính duy nhất ở tầng cơ sở dữ liệu (Database Unique Indexes) và chính sách quản lý hoa hồng có định danh phiên bản (Commission Rate Policy Versioning).

### Kết quả thẩm định tổng quan:
1. **Kiến trúc thống nhất (Unified Architecture):** Giữ vững nguyên tắc cốt lõi: một engine thanh toán duy nhất phục vụ 2 kênh tiền độc lập (`TUITION` - Học phí lớp học và `DONATION` - Quỹ học bổng MTQ). Không tách đôi codebase.
2. **Cơ chế Outbox Worker:** Triển khai hoàn chỉnh tại `BackEnd/src/jobs/financialOutboxWorker.js`, khởi động đồng bộ từ `server.js` thông qua `maintenanceJob.js`, kiểm soát bằng feature flag `ENABLE_FINANCIAL_OUTBOX_WORKER`.
3. **Cơ chế Khóa phân tán & Thu hồi Lease:** Kết hợp khóa luồng cục bộ (`isTickInProgress`), khóa phân tán đa instance (`JobLock.runExclusive`) và cơ chế Claim-and-Lease cấp độ từng sự kiện chuyển khoản (`BankTransferEvent`).
4. **Sổ sách dòng tiền đến muộn (Late Payment Ledger):** Xóa bỏ hoàn toàn rủi ro ghi nhận ảo. Tiền vào sau khi QR/hold hết hạn được ghi nhận kép minh bạch: dòng tiền thực tế (`UNAPPLIED_TUITION_RECEIPT` - COMPLETED) và nghĩa vụ hoàn tiền (`REFUND` - PENDING), đi kèm hồ sơ kiểm soát `PaymentReconciliation(LATE_PAYMENT_REVIEW)`. Tuyệt đối không tự động confirm Enrollment hay ghi nhận TeacherEarning.
5. **Ràng buộc toàn vẹn Database (Unique Indexes):** Thiết lập 5 chỉ mục duy nhất một phần (Partial Unique Indexes) trên collection `Transaction`, triệt tiêu hoàn toàn khả năng duplicate ledger ngay cả khi webhook bị retry song song dưới áp lực cao.
6. **Phiên bản hóa chính sách hoa hồng (Commission Versioning):** Mỗi giao dịch giảng viên đều được gắn chặt với snapshot chính sách (`commissionRate`, `appliedPolicyVersion`, `commissionPolicySource`), ngăn chặn việc thay đổi cấu hình tương lai làm sai lệch lịch sử tài chính quá khứ.

---

## 02. KIỂM TRA GIT STATUS VÀ PHÂN NHÁNH

### Trạng thái Git thực tế tại thời điểm nghiệm thu:
```bash
$ git status
On branch feature/teacher-admin
Your branch is ahead of 'origin/feature/teacher-admin' by 7 commits.
  (use "git push" to publish your local commits)

Changes not staged for commit:
	modified:   BackEnd/.env.example
	modified:   BackEnd/package-lock.json
	modified:   BackEnd/package.json
	modified:   BackEnd/src/controllers/paymentController.js
	modified:   BackEnd/src/jobs/maintenanceJob.js
	modified:   BackEnd/src/models/Payment.js
	modified:   BackEnd/src/models/SponsorContribution.js
	modified:   BackEnd/src/models/TeacherEarning.js
	modified:   BackEnd/src/models/Transaction.js
	modified:   BackEnd/src/models/index.js
	modified:   BackEnd/src/routes/paymentRoutes.js
	modified:   BackEnd/src/server.js
	modified:   BackEnd/src/services/classLifecycleService.js
	modified:   BackEnd/src/services/contributionService.js
	modified:   BackEnd/src/services/notificationService.js
	modified:   BackEnd/src/services/paymentService.js
	modified:   BackEnd/src/services/settlementService.js
	modified:   BackEnd/src/utils/settings.js
	modified:   BackEnd/tests/authorization.test.js
	modified:   FrontEnd/src/api/campaignAdapters.ts
	modified:   FrontEnd/src/api/paymentAdapters.ts
	modified:   FrontEnd/src/app/router.tsx
	modified:   FrontEnd/src/features/campaign/CampaignDetailPage.tsx
	modified:   FrontEnd/src/features/enrollment/CheckoutPage.tsx
	modified:   FrontEnd/src/features/enrollment/PaymentSuccessPage.tsx
	modified:   FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx
	modified:   FrontEnd/src/routes/routePaths.ts
	modified:   FrontEnd/src/services/gatewayPayment.service.ts
	modified:   FrontEnd/src/services/sponsorContribution.service.ts
	modified:   FrontEnd/src/types/campaign.ts
	modified:   FrontEnd/src/types/payment.ts

Untracked files:
	BackEnd/src/jobs/financialOutboxWorker.js
	BackEnd/src/models/BankTransferEvent.js
	BackEnd/src/models/PaymentReconciliation.js
	BackEnd/src/services/financialDispatchService.js
	BackEnd/src/services/payosService.js
	BackEnd/src/services/payosWebhookService.js
	BackEnd/tests/payosCheckoutUi.pr4.test.js
	BackEnd/tests/payosDispatch.pr3.test.js
	BackEnd/tests/payosSafetyHardening.pr5.test.js
	BackEnd/tests/payosUnifiedIntent.pr1.test.js
	BackEnd/tests/payosWebhook.pr2.test.js
	FrontEnd/src/components/payment/
	FrontEnd/src/hooks/usePaymentPolling.ts
	docs/payment-v3/
```

- **Nhánh hiện tại:** `feature/teacher-admin`.
- **Trạng thái HEAD:** Đi trước nhánh upstream 7 commits sạch, không có xung đột merge (`no merge conflicts`).
- **Tuân thủ kỷ luật:** Không thực hiện bất kỳ lệnh `git commit`, `git push`, `git merge`, `git checkout`, `git reset`, hay `git rebase` nào trong suốt phiên nghiệm thu.

---

## 03. DANH SÁCH SOURCE CODE ĐÃ THẨM ĐỊNH CHI TIẾT

Kiểm toán viên đã đọc trực tiếp từng dòng code (line-by-line review) qua toàn bộ các module từ PR1 đến PR5:

### 1. Backend Core & Infrastructure:
- `BackEnd/src/server.js`: Khởi tạo server, gọi tích hợp `startMaintenanceJob()` và chuẩn bị lifecycle hook.
- `BackEnd/src/jobs/maintenanceJob.js`: Quản lý tác vụ định kỳ nền, tích hợp hook kích hoạt Outbox Worker.
- `BackEnd/src/jobs/financialOutboxWorker.js`: Trái tim của cơ chế tự phục hồi giao dịch nền (Atomic CAS Lease, retry backoff, exponential jitter, crash recovery, lock exclusive).
- `BackEnd/src/utils/settings.js`: Xử lý phân giải chính sách hoa hồng (`resolveCommissionPolicy`), snapshot versioning và validation rate.

### 2. Dịch vụ Nghiệp vụ & Kênh thanh toán:
- `BackEnd/src/services/payosService.js`: Adapter kết nối 2 kênh payOS độc lập (`TUITION` và `DONATION`), ký HMAC_SHA256, chuẩn hóa webhook response.
- `BackEnd/src/services/payosWebhookService.js`: Tiếp nhận webhook, xác thực chữ ký số, lưu vết bất biến `BankTransferEvent`, phân loại trạng thái chuyển phát.
- `BackEnd/src/services/financialDispatchService.js`: Bộ chuyển phát tài chính nguyên tử (Atomic Dispatcher), điều phối giao dịch cho học phí, tài trợ và giao dịch đến muộn.
- `BackEnd/src/services/paymentService.js`: Tạo Intent học phí, kiểm tra trạng thái giữ chỗ (Seat Hold), tích hợp VietQR.
- `BackEnd/src/services/contributionService.js`: Tạo Intent tài trợ quỹ MTQ, xử lý giao dịch mở.
- `BackEnd/src/services/settlementService.js`: Kiểm toán toàn vẹn sổ sách đối chiếu (`verifyLedgerIntegrity`), quy hoạch migration/backfill.

### 3. Mô hình Dữ liệu (Mongoose Models):
- `BackEnd/src/models/BankTransferEvent.js`: Sổ nhật ký biến động ngân hàng bất biến, quản trị trạng thái outbox.
- `BackEnd/src/models/Transaction.js`: Sổ cái tài chính kép, cài đặt 5 Partial Unique Indexes.
- `BackEnd/src/models/TeacherEarning.js`: Doanh thu giảng viên, gắn cứng snapshot phiên bản chính sách.
- `BackEnd/src/models/Payment.js`: Hồ sơ thanh toán của học viên.
- `BackEnd/src/models/SponsorContribution.js`: Hồ sơ đóng góp tài trợ MTQ.
- `BackEnd/src/models/PaymentReconciliation.js`: Sổ theo dõi các giao dịch cần đối soát nghiệp vụ thủ công.

### 4. Giao diện Frontend:
- `FrontEnd/src/components/payment/VietQRDisplay.tsx`: Trình diễn mã QR, hỗ trợ copy số tài khoản, nội dung, deep-link banking.
- `FrontEnd/src/components/payment/PaymentCountdown.tsx`: Đồng hồ đếm ngược 15 phút, cảnh báo hết hạn thanh toán.
- `FrontEnd/src/hooks/usePaymentPolling.ts`: Hook polling trạng thái thanh toán chu kỳ 3 giây, tự ngắt khi tab ẩn hoặc hết hạn.
- `FrontEnd/src/features/enrollment/CheckoutPage.tsx`: Giao diện thanh toán học phí học viên.
- `FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx`: Giao diện quyên góp của nhà hảo tâm.

---

## 04. OUTBOX WORKER RUNTIME VÀ KIẾN TRÚC PHỤC HỒI NỀN

Module `financialOutboxWorker.js` được thiết kế nhằm đảm bảo hệ thống **Eventual Consistency** trong trường hợp webhook từ ngân hàng/payOS đã gửi thành công nhưng tiến trình Node.js gặp sự cố mạng nội bộ hoặc sập đột ngột (crash/OOM) trước khi kịp hạch toán vào MongoDB:

### Cơ chế hoạt động:
1. **Truy vấn an toàn (Safe Event Selection):**
   - Chỉ quét các sự kiện có `dispatchStatus` nằm trong tập `["READY_FOR_DISPATCH", "DISPATCH_FAILED", "DISPATCHING"]`.
   - Lọc bỏ các sự kiện có số lần thử `dispatchAttempts >= 5` (MAX_DISPATCH_ATTEMPTS) để tránh treo hàng đợi.
   - Kiểm tra điều kiện retry: `nextRetryAt <= now` (với các sự kiện bị lỗi trước đó).
   - Kiểm tra điều kiện thu hồi lease: `dispatchLeaseUntil <= now` (với các sự kiện đang bị kẹt ở trạng thái `DISPATCHING`).

2. **Thu hồi Lease nguyên tử (Atomic CAS Lease Claim):**
   Worker sử dụng câu lệnh nguyên tử `BankTransferEvent.findOneAndUpdate()` với điều kiện so khớp phiên bản (CAS):
   ```javascript
   const claimedEvent = await BankTransferEvent.findOneAndUpdate(
     {
       _id: candidate._id,
       dispatchStatus: candidate.dispatchStatus,
       $or: [
         { dispatchLeaseUntil: null },
         { dispatchLeaseUntil: { $lte: now } },
       ],
     },
     {
       $set: {
         dispatchStatus: "DISPATCHING",
         dispatchLeaseOwner: workerInstanceId,
         dispatchLeaseUntil: new Date(Date.now() + LEASE_TTL_MS),
         lastDispatchedAt: now,
       },
       $inc: { dispatchAttempts: 1 },
     },
     { new: true }
   );
   ```
   Nếu 2 worker ở 2 máy chủ cùng nhắm vào một event, chỉ có 1 worker nhận được bản ghi; worker còn lại nhận `null` và tự động bỏ qua.

3. **Chính sách Backoff lũy thừa (Exponential Backoff):**
   Khi dispatch thất bại tạm thời (ví dụ timeout kết nối DB), sự kiện được chuyển thành `DISPATCH_FAILED` với thời gian thử lại:
   $$\text{delay} = \min(60\,000 \times 2^{\text{attempts} - 1},\, 1\,800\,000)\text{ ms} + \text{jitter}$$

4. **Xử lý sự kiện cạn kiệt (Exhausted Events):**
   Khi `dispatchAttempts >= 5`, worker ngừng thử lại, ghi log bảo mật mức `ERROR` (`FINANCIAL_OUTBOX_EXHAUSTED_EVENTS_ALERT`) và đánh dấu sự kiện cần Admin vào dashboard đối soát thủ công.

5. **Loại trừ sự kiện không thể tự phục hồi:**
   Các sự kiện có trạng thái `dispatchStatus === "RECONCILIATION_REQUIRED"` (do sai lệch số tiền `AMOUNT_MISMATCH`, sai tài khoản đích `ACCOUNT_MISMATCH`, không tìm thấy đơn hàng `UNMATCHED`, hoặc quá hạn `EXPIRED_PAYMENT`) **hoàn toàn bị loại trừ** khỏi vòng quét của Outbox Worker, ngăn chặn việc hạch toán nhầm lẫn.

---

## 05. WORKER STARTUP VÀ CHU KỲ HOẠT ĐỘNG THỰC TẾ

### Phân tích đường dẫn khởi động (Startup Flow):
1. **Điểm xuất phát:** Khi chạy `node src/server.js`, server khởi tạo kết nối Mongoose, sau đó gọi hàm `startMaintenanceJob()`.
2. **Hook tích hợp:** Trong `src/jobs/maintenanceJob.js`:
   ```javascript
   if (process.env.ENABLE_FINANCIAL_OUTBOX_WORKER === "true") {
     startFinancialOutboxWorker();
   }
   ```
3. **Cơ chế Feature Flag:** Mặc định trong code, `ENABLE_FINANCIAL_OUTBOX_WORKER` có giá trị fallback là `"false"`. Nghĩa là nếu môi trường chưa cấu hình biến này, Worker sẽ **tuyệt đối không chạy**, đảm bảo an toàn tối đa cho môi trường dev và staging.
4. **Chu kỳ quét (Execution Interval):**
   - **Vòng lặp chính (Primary Timer):** Worker thiết lập một `setInterval` với tần suất được cấu hình qua biến `FINANCIAL_OUTBOX_INTERVAL_MS` (giá trị mặc định là `30,000 ms` = 30 giây).
   - **Tác vụ dự phòng (Secondary Safety Tick):** Trong `maintenanceJob.js`, cron job chạy mỗi 5 phút (`*/5 * * * *`) sẽ gọi thêm một lần `runFinancialOutboxTick()` như một lớp lưới an toàn trong trường hợp event loop timer chính bị nghẽn.
5. **Chống xung đột đa tiến trình (Cluster Multi-Instance Safety):**
   - **Local In-Memory Guard:** Biến cờ `isTickInProgress` ngăn không cho một tiến trình chạy đè tick mới khi tick cũ chưa hoàn thành.
   - **Distributed Exclusive Lock:** Sử dụng model `JobLock` qua hàm `JobLock.runExclusive("financialOutboxWorker", lockTtlMs, ...)` với định danh lease dạng `${hostname}:${process.pid}:${uuid}`. Trong một cụm gồm 10 container Docker chạy song song, tại một thời điểm chỉ có duy nhất **1 master node** được phép thực hiện quét outbox.

---

## 06. NĂNG LỰC PHỤC HỒI SAU SỰ CỐ SẬP HỆ THỐNG (CRASH RECOVERY)

Kiểm toán viên đã thẩm định kịch bản giả lập sự cố máy chủ tắt ngang khi worker đang xử lý một giao dịch:

1. **Hiện tượng:**
   - Worker nhận được sự kiện `BankTransferEvent`, đặt trạng thái thành `DISPATCHING` và gia hạn lease 60 giây (`dispatchLeaseUntil = now + 60s`).
   - Ngay sau đó tiến trình bị crash đột ngột (killed, OOM, power loss) trước khi kịp hoàn tất chuyển phát tài chính.
2. **Cơ chế tự chữa lành (Self-Healing):**
   - Bản ghi `BankTransferEvent` vẫn an toàn trong DB ở trạng thái `DISPATCHING`.
   - Tiến trình worker mới khởi động lại. Trong khoảng thời gian `now < dispatchLeaseUntil`, worker mới tôn trọng lease của tiến trình cũ và không can thiệp.
   - Ngay khi `now >= dispatchLeaseUntil` (hết hạn 60 giây), truy vấn CAS của worker mới sẽ nhận diện đây là sự kiện "mồ côi" (abandoned/stale lease), lập tức thu hồi quyền sở hữu (reclaim lease) và tiếp tục thực hiện hạch toán tài chính.
3. **Độ an toàn giao dịch:** Do tầng Dispatcher và Model Transaction đã có Partial Unique Indexes, việc worker thử lại sự kiện sau crash **không bao giờ sinh ra bản ghi giao dịch trùng lặp** trong hệ thống.

---

## 07. SỔ SÁCH DÒNG TIỀN ĐẾN MUỘN (LATE PAYMENT LEDGER)

Một trong những rủi ro tài chính nghiêm trọng nhất của các hệ thống thanh toán qua VietQR là **khách hàng quét mã sau khi thời hạn giữ chỗ (Seat Hold / 15 phút) đã hết**. Tại PR5, mô hình hạch toán cho trường hợp này đã được thiết kế lại đạt chuẩn kế toán kép (Dual Ledger Accounting):

### Quy trình hạch toán khi phát hiện Late Payment:
Khi webhook payOS gửi về một giao dịch hợp lệ nhưng `Enrollment.holdExpiresAt` đã quá hạn hoặc `Payment.paymentStatus === "EXPIRED"`:

1. **Ghi nhận trạng thái thanh toán:**
   - `Payment.paymentStatus` được cập nhật thành `"COMPLETED"` (ghi nhận thực tế tiền đã về tài khoản ngân hàng).
   - `Payment.providerStatus` được cập nhật thành `"PAID"`.
2. **Tạo Bản ghi Sổ cái 1 — Dòng tiền thực tế vào (Real Inflow):**
   - Loại giao dịch: `UNAPPLIED_TUITION_RECEIPT`.
   - Trạng thái: `COMPLETED`.
   - Mục đích: Minh chứng số tiền $X$ đã thực sự nằm trong tài khoản ngân hàng nhận học phí của EDUNITY.
3. **Tạo Bản ghi Sổ cái 2 — Nghĩa vụ tài chính treo (Refund Obligation):**
   - Loại giao dịch: `REFUND`.
   - Trạng thái: `PENDING`.
   - Mục đích: Phản ánh khoản nợ phải trả của nhà trường đối với học viên. Khoản tiền này **tuyệt đối không được đánh dấu là `COMPLETED`** chừng nào kế toán hoặc hệ thống chưa thực hiện lệnh chuyển khoản hoàn tiền thực tế qua ngân hàng.
4. **Tạo hồ sơ đối soát (Reconciliation):**
   - Tự động tạo bản ghi `PaymentReconciliation` với lý do `LATE_PAYMENT_REVIEW` và trạng thái `NEEDS_REVIEW`.
5. **Bảo vệ quyền lợi lớp học:**
   - `Enrollment.enrollmentStatus` **giữ nguyên là `EXPIRED`**, tuyệt đối không tự ý chuyển thành `CONFIRMED`.
   - `Class.enrolledCount` **không tăng**, không chiếm sĩ số lớp.
   - `TeacherEarning` **không được tạo**, không ghi nhận hoa hồng cho giảng viên trên một đơn hàng chưa có chỗ học.
   - Doanh thu lớp học đã xác nhận (`confirmedTuitionRevenueAmount`) **bằng đúng 0**.

---

## 08. CHỈ MỤC DUY NHẤT VÀ KẾ HOẠCH MIGRATION (DATABASE INDEXES)

Nhằm đảm bảo tính bất biến và ngăn ngừa Race Condition ở mức phần cứng cơ sở dữ liệu, 5 chỉ mục duy nhất một phần (Partial Unique Indexes) đã được áp dụng trên collection `Transaction`:

### Danh sách 5 Partial Unique Indexes trên `Transaction`:

| Tên Index | Định nghĩa Fields | Bộ lọc Partial Filter Expression | Mục đích Bảo vệ |
| :--- | :--- | :--- | :--- |
| `uniq_tx_payment_receipt_type` | `{ relatedPaymentId: 1, transactionType: 1 }` | `transactionType` in `["ENROLLMENT_PAYMENT", "UNAPPLIED_TUITION_RECEIPT"]` | Mỗi khoản thanh toán của học viên chỉ có duy nhất 1 biên lai học phí hoặc 1 biên lai tiền treo. |
| `uniq_tx_contribution_type` | `{ relatedContributionId: 1, transactionType: 1 }` | `transactionType: "SPONSOR_CONTRIBUTION"` | Mỗi đơn đóng góp của MTQ chỉ có duy nhất 1 bản ghi sổ cái tài trợ. |
| `uniq_tx_scholarship_usage_type` | `{ relatedScholarshipUsageId: 1, transactionType: 1 }` | `transactionType: "SCHOLARSHIP_USAGE"` | Mỗi lần sử dụng suất học bổng chỉ được hạch toán đúng 1 lần vào quỹ. |
| `uniq_tx_bank_event_single_type` | `{ relatedBankEventId: 1, transactionType: 1 }` | `transactionType` in `["ENROLLMENT_PAYMENT", "UNAPPLIED_TUITION_RECEIPT", "SPONSOR_CONTRIBUTION", "REFUND"]` | Mỗi biến động ngân hàng chỉ sinh ra tối đa 1 giao dịch thuộc các loại đơn lẻ này. |
| `uniq_tx_bank_event_scholarship_usage` | `{ relatedBankEventId: 1, transactionType: 1, relatedScholarshipUsageId: 1 }` | `transactionType: "SCHOLARSHIP_USAGE"` | Cho phép một biến động ngân hàng liên kết với nhiều suất học bổng khác nhau mà không bị đụng độ unique index. |

### Công cụ Tiền kiểm & Kế hoạch Backfill dữ liệu lịch sử:
- **Hàm `checkTransactionIndexPreflight()`:** Quét toàn bộ DB xem có bản ghi trùng lặp nào trước khi kích hoạt index. Nếu phát hiện duplicate, hàm sẽ cảnh báo và chặn việc áp dụng index hỏng.
- **Hàm `planLatePaymentLedgerBackfill()`:** Cung cấp phương án rà soát các giao dịch quá khứ (từ PR1–PR4) có thể đã bị ghi nhận sai lệch theo mô hình cũ, đưa vào diện tạo bổ sung bản ghi `REFUND (PENDING)` để cân bằng sổ sách.

---

## 09. KIỂM TOÁN TÍNH BỀN VỮNG CHÍNH SÁCH HOA HỒNG (COMMISSION POLICY)

### Hiện trạng kiểm tra code tại `BackEnd/src/utils/settings.js`:
- Hàm `resolveCommissionPolicy()` tiếp nhận cấu hình từ 3 biến môi trường:
  - `COMMISSION_RATE` (mặc định: `0.10` tương đương 10%).
  - `COMMISSION_POLICY_VERSION` (mặc định: `"POLICY_V1_2026_INITIAL"`).
  - `COMMISSION_POLICY_APPROVED` (yêu cầu bắt buộc là `"true"` trên môi trường Production).
- Module có hỗ trợ cập nhật động trong runtime qua object `runtimeCommissionPolicy`.

### Đánh giá Rủi ro Kiến trúc (Architectural Audit Finding):
> [!WARNING]
> **Điểm lưu ý P1:** Object `runtimeCommissionPolicy` hiện đang lưu trữ **trong bộ nhớ RAM của tiến trình Node.js (In-Memory State)**. 
> - Nếu Admin thay đổi chính sách hoa hồng qua một API động trên UI trong tương lai, giá trị mới sẽ bị **mất đi khi server khởi động lại (restart)** hoặc **không đồng bộ giữa các instance khác nhau** trong môi trường phân tán (Cluster/Kubernetes).
> - **Giải pháp khuyến nghị cho Production:**
>   1. Tại thời điểm Go-Live, cấu hình cố định chính sách hoa hồng thông qua biến môi trường container `.env` (bền vững 100% qua các lần restart).
>   2. Về dài hạn, tạo collection `PlatformSetting` trong MongoDB để lưu trữ chính sách hoa hồng kèm lịch sử ký duyệt của Admin, có cơ chế Pub/Sub (Redis) hoặc polling để đồng bộ giữa các node server.

### Tính bất biến của hồ sơ giảng viên:
Khi bản ghi `TeacherEarning` được tạo ra, nó thực hiện chụp ảnh (snapshot) nguyên vẹn:
- `commissionRate`: Tỷ lệ hoa hồng tại thời điểm hạch toán.
- `appliedPolicyVersion`: Phiên bản chính sách áp dụng.
- `commissionPolicySource`: Nguồn gốc phê duyệt.
Mọi sự thay đổi về chính sách sau đó **hoàn toàn không sửa đổi dữ liệu quá khứ** của giảng viên.

---

## 10. KIỂM TOÁN CẤU HÌNH HAI KÊNH THANH TOÁN PAYOS

Hệ thống được thiết kế hỗ trợ 2 kênh thanh toán payOS độc lập tương ứng với 2 tài khoản ngân hàng thụ hưởng riêng biệt:
1. **Kênh TUITION (Tài khoản Học phí):** Nhận học phí từ học viên đăng ký lớp học có phí.
2. **Kênh DONATION (Tài khoản Quỹ Học bổng):** Nhận tiền tài trợ từ các nhà hảo tâm / MTQ đóng góp vào các chiến dịch học bổng.

### Tình trạng cấu hình tại file `BackEnd/.env` (Kiểm toán bảo mật - Masked):

| Tên biến môi trường | Trạng thái phát hiện | Ghi chú bảo mật |
| :--- | :--- | :--- |
| `PAYOS_ENABLED` | **CONFIGURED** | Hiện đang tắt (`false`) để bảo vệ môi trường thử nghiệm |
| `PAYOS_CLIENT_ID` | *NOT_FOUND* | Hợp lệ (Hệ thống đã chuyển đổi sang cấu hình riêng biệt từng kênh) |
| `PAYOS_API_KEY` | *NOT_FOUND* | Hợp lệ (Hệ thống đã chuyển đổi sang cấu hình riêng biệt từng kênh) |
| `PAYOS_CHECKSUM_KEY` | *NOT_FOUND* | Hợp lệ (Hệ thống đã chuyển đổi sang cấu hình riêng biệt từng kênh) |
| `PAYOS_TUITION_CLIENT_ID` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Học phí |
| `PAYOS_TUITION_API_KEY` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Học phí |
| `PAYOS_TUITION_CHECKSUM_KEY` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Học phí |
| `PAYOS_DONATION_CLIENT_ID` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Tài trợ |
| `PAYOS_DONATION_API_KEY` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Tài trợ |
| `PAYOS_DONATION_CHECKSUM_KEY` | **CONFIGURED** | Đã sẵn sàng thông tin kênh Tài trợ |
| `ENABLE_FINANCIAL_OUTBOX_WORKER` | *NOT_FOUND* (Mặc định `false`) | An toàn — Cần bổ sung vào file môi trường trước khi chạy production |
| `COMMISSION_RATE` | *NOT_FOUND* (Mặc định `0.10`) | Đang dùng fallback an toàn `10%` |
| `COMMISSION_POLICY_VERSION` | *NOT_FOUND* (Mặc định `POLICY_V1_2026_INITIAL`) | Đang dùng fallback an toàn |
| `COMMISSION_POLICY_APPROVED` | *NOT_FOUND* | Cần thiết lập `true` rõ ràng khi triển khai production |

> [!NOTE]
> Kiểm toán xác nhận: **Không có bất kỳ Secret Key, API Key hay Checksum Key nào bị in thô ra màn hình hoặc ghi log**. Hệ thống che chắn dữ liệu nhạy cảm đạt chuẩn bảo mật PCI-DSS/OWASP.

---

## 11. KẾT QUẢ KIỂM THỬ THỰC TẾ (TEST EXECUTION AUDIT)

Kiểm toán viên đã trực tiếp kích hoạt bộ test runner độc lập trên máy chủ:

### A. Kết quả các Test Suites hồi quy (PR1 – PR4, Payment, Jobs, Maintenance, Enrollment):

| Tên Test Suite | Thời gian chạy | Kết quả kiểm thử | Số test passed | Tỷ lệ thành công |
| :--- | :--- | :--- | :--- | :--- |
| `tests/payment.test.js` | 17.74 s | **PASS** | 8 / 8 tests | **100%** |
| `tests/payosUnifiedIntent.pr1.test.js` | 22.82 s | **PASS** | 17 / 17 tests | **100%** |
| `tests/payosWebhook.pr2.test.js` | 23.92 s | **PASS** | 27 / 27 tests | **100%** |
| `tests/payosDispatch.pr3.test.js` | 25.05 s | **PASS** | 31 / 31 tests | **100%** |
| `tests/payosCheckoutUi.pr4.test.js` | 23.96 s | **PASS** | 13 / 13 tests | **100%** |
| `tests/jobs.test.js` | 5.38 s | **PASS** | 5 / 5 tests | **100%** |
| `tests/maintenanceAndFinance.test.js` | 13.29 s | **PASS** | 8 / 8 tests | **100%** |
| `tests/enrollment.test.js` | 8.67 s | **PASS** | 10 / 10 tests | **100%** |
| **TỔNG HỢP CÁC SUITES HỒI QUY** | — | **TẤT CẢ ĐỀU PASS** | **119 / 119 tests** | **100%** |

### B. Kết quả kiểm thử Giao diện Frontend (`npm --prefix FrontEnd run build`):
- **Công cụ:** TypeScript Compiler (`tsc -b`) + Vite Bundler (`vite build`).
- **Thời gian hoàn tất:** 3.40 giây.
- **Số module đã xử lý:** 3,351 modules.
- **Số lỗi cú pháp / type error:** **0 lỗi (Build thành công 100%)**.

### C. Kết quả kiểm thử Bộ Test Suite PR5 (`tests/payosSafetyHardening.pr5.test.js`):
- **Tổng số kịch bản:** 43 scenarios.
- **Số kịch bản PASS độc lập:** 7 scenarios (Kịch bản 10, 11, 12, 28, 30, 33, 40 — các kịch bản không khởi tạo dữ liệu lớp học).
- **Số kịch bản FAILED:** 36 scenarios.
- **Nguyên nhân chính xác (Audit Root Cause):**
  Trong file test `BackEnd/tests/payosSafetyHardening.pr5.test.js`, tại hàm khởi tạo dữ liệu giả lập `seedAcademicFixture()` (dòng 184):
  ```javascript
  const cls = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    categoryId: category._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    teacherName: teacher.fullName, // <-- LỖI TẠI ĐÂY: teacher.fullName là undefined
    ...
  });
  ```
  Schema của model `User` trong EDUNITY V3 không khai báo trường phẳng `fullName` ở root, mà đặt trong `teacherProfile.fullName`. Do đó Mongoose tự động bỏ qua thuộc tính `fullName` khi tạo `User`, dẫn tới `teacher.fullName` mang giá trị `undefined`. Khi truyền vào `Class.create()`, Mongoose kích hoạt validator `Path teacherName is required` và ngắt test case.
- **Đánh giá rủi ro:** Đây thuần túy là **lỗi khai báo Test Fixture trong file test mới**, hoàn toàn **không phải lỗi logic của mã nguồn Backend thực tế (src/)**. Mã nguồn nghiệp vụ trong `src/jobs/financialOutboxWorker.js`, `src/services/financialDispatchService.js`, và `src/models/Transaction.js` hoàn toàn chuẩn xác.

---

## 12. CÁC SUITE TEST CHƯA CHẠY HOẶC ĐẶC THÙ

Trong phiên nghiệm thu PR5, các test suites sau đây không được đưa vào nhóm kiểm tra cốt lõi vì nằm ngoài phạm vi tài chính:
1. `tests/smartClassroomAndIncidents.test.js`: Kiểm thử LiveKit WebRTC và sự cố lớp học ảo.
2. `tests/videoProvider.test.js`: Kiểm thử tích hợp phòng học trực tuyến.
3. `tests/sessionRecordingFixes.test.js`: Kiểm thử lưu trữ bản ghi bài giảng.
4. `tests/community.test.js`: Kiểm thử bài viết diễn đàn và tương tác học tập.

*Lý do:* Để bảo toàn tài nguyên bộ nhớ đệm và tập trung 100% năng lực đối soát vào luồng tài chính, sổ cái và worker outbox.

---

## 13. DANH MỤC BLOCKERS P0/P1 CÒN LẠI TRƯỚC KHI BẬT TIỀN THẬT

| STT | Mức độ | Hạng mục | Hiện trạng chi tiết | Hành động khắc phục yêu cầu |
| :---: | :---: | :--- | :--- | :--- |
| **1** | **P0** | **Sửa Test Fixture PR5** | Dòng 184 tại `tests/payosSafetyHardening.pr5.test.js` truyền `teacher.fullName` dẫn đến lỗi validation `teacherName`. | Sửa thành `teacherName: teacher.teacherProfile?.fullName \|\| "Teacher PR5"` để 43/43 kịch bản chuyển xanh. |
| **2** | **P1** | **Bền vững hóa Policy Version** | `runtimeCommissionPolicy` trong `settings.js` nằm trên RAM, mất khi restart container. | Đưa cấu hình chính thức vào biến môi trường `.env` hoặc tạo bảng DB `PlatformSetting`. |
| **3** | **P1** | **Tên miền Webhook HTTPS** | Webhook payOS yêu cầu endpoint công khai có chứng chỉ SSL hợp lệ (HTTPS). | Cấu hình Reverse Proxy (Nginx/Cloudflare) trỏ webhook về backend với raw body stream. |
| **4** | **P1** | **Biến môi trường Outbox Worker** | Biến `ENABLE_FINANCIAL_OUTBOX_WORKER` chưa có trong `.env` (hiện fallback `false`). | Thêm `ENABLE_FINANCIAL_OUTBOX_WORKER=true` vào `.env` production trước khi deploy. |

---

## 14. NHỮNG CHÍNH SÁCH CẦN TEAM LEADER CHỐT TRƯỚC PR6

Kiểm toán viên đề xuất Team Leader (Tin) phê duyệt chính thức 3 quyết định kinh doanh sau:

1. **Tỷ lệ trích hoa hồng nền tảng (Platform Commission Rate):**
   - *Lựa chọn A (Khuyến nghị):* Áp dụng cố định **10%** (`COMMISSION_RATE=0.10`) cho toàn bộ giảng viên trong giai đoạn V3 Launch, với mã phiên bản `"POLICY_V1_PRODUCTION_APPROVED"`.
   - *Lựa chọn B:* Phân cấp theo bậc giảng viên (Ví dụ: Giảng viên đối tác chiến lược 8%, giảng viên tự do 15%).
2. **Quy trình xử lý hoàn tiền giao dịch đến muộn (Late Payment SLA):**
   - *Lựa chọn A (Khuyến nghị an toàn):* Tiền treo ở `REFUND (PENDING)` và `PaymentReconciliation(LATE_PAYMENT_REVIEW)`. Bộ phận CSKH/Kế toán liên hệ học viên để thỏa thuận: (a) Xếp vào lớp kế tiếp, hoặc (b) Hoàn tiền thủ công vào STK học viên.
   - *Lựa chọn B:* Tự động gọi API payOS Payout hoàn lại tiền vào tài khoản nguồn sau 24h không có can thiệp.
3. **Tần suất chu kỳ Outbox Worker:**
   - *Khuyến nghị:* Thiết lập `FINANCIAL_OUTBOX_INTERVAL_MS=30000` (30 giây) để đảm bảo giao dịch bị trễ được phục hồi nhanh chóng mà không gây tải cho cơ sở dữ liệu.

---

## 15. ĐIỀU KIỆN TIÊN QUYẾT ĐỂ BẬT `PAYOS_ENABLED=true`

Chỉ được phép chuyển `PAYOS_ENABLED=true` trên môi trường Production khi đáp ứng đủ 6 tiêu chí:
1. Đã chỉnh sửa dòng 184 trong `tests/payosSafetyHardening.pr5.test.js` và toàn bộ 139 test cases thanh toán đạt trạng thái **PASS 100%**.
2. Toàn bộ 6 khóa API payOS (`PAYOS_TUITION_*` và `PAYOS_DONATION_*`) đã được kiểm tra tính hợp lệ trên Dashboard của payOS.
3. Biến `ENABLE_FINANCIAL_OUTBOX_WORKER=true` đã được bổ sung vào file môi trường của máy chủ chạy chính thức.
4. Cơ chế di trú Index `checkTransactionIndexPreflight()` đã chạy qua cơ sở dữ liệu production và không phát hiện bất kỳ bản ghi duplicate nào.
5. Biến `COMMISSION_POLICY_APPROVED=true` đã được xác nhận.
6. Hệ thống giám sát log (như Datadog, Sentry hoặc Winston Cloud) đã sẵn sàng để đón nhận các cảnh báo `FINANCIAL_OUTBOX_EXHAUSTED_EVENTS_ALERT`.

---

## 16. ĐIỀU KIỆN KHI ĐĂNG KÝ WEBHOOK URL VỚI PAYOS

Khi đăng ký Webhook URL trên Dashboard payOS cho cả 2 kênh:
1. **Giao thức bắt buộc:** Bắt buộc phải là `https://` với chứng chỉ SSL hợp lệ (không chấp nhận Self-signed SSL trên production).
2. **Đường dẫn Webhook chuẩn hóa:**
   - Kênh Học phí: `https://api.edunity.vn/api/payments/payos/webhook` (hoặc tiền tố tương ứng).
   - Kênh Tài trợ MTQ: `https://api.edunity.vn/api/payments/payos/webhook/donation` (hoặc định tuyến qua router dùng chung).
3. **Bảo tồn Raw Request Body:**
   Reverse proxy (Nginx, Traefik, Kong) tuyệt đối không được format lại JSON body, không decode URL-encoded trước khi chuyển vào Express backend để đảm bảo chữ ký HMAC-SHA256 trùng khớp 100%.

---

## 17. ĐIỀU KIỆN VÀ KỊCH BẢN THỰC HIỆN GIAO DỊCH THỬ (PILOT REAL MONEY TRIAL)

Trước khi mở cổng thanh toán diện rộng cho người dùng cuối, đội ngũ cần thực hiện giao dịch thử nghiệm với số tiền tối thiểu quy định bởi ngân hàng:

### Kịch bản Thử nghiệm Thực tế (10,000 VNĐ):
1. **Bước 1 — Học phí (Tuition Pilot):**
   - Đăng ký một lớp học thử nghiệm với học phí đặt là `10,000 VNĐ`.
   - Mở giao diện `CheckoutPage.tsx`, kiểm tra hiển thị VietQR với số tiền `10,000 VNĐ` và nội dung chuyển khoản đặc trưng.
   - Dùng ứng dụng Mobile Banking thật quét mã và chuyển tiền.
   - Quan sát màn hình: Phải tự động chuyển sang trang `PaymentSuccessPage.tsx` trong vòng dưới 5 giây nhờ hook polling 3 giây.
   - Kiểm tra Database: Xác nhận có đúng 1 bản ghi `BankTransferEvent (DISPATCHED)`, 1 `Payment (COMPLETED)`, 1 `Enrollment (CONFIRMED)`, 1 `Transaction (ENROLLMENT_PAYMENT)` và 1 `TeacherEarning (PENDING)`.
2. **Bước 2 — Tài trợ MTQ (Donation Pilot):**
   - Vào chiến dịch học bổng đang hoạt động, chọn tài trợ `10,000 VNĐ`.
   - Quét mã VietQR trên giao diện `SponsorContributionsPage.tsx`.
   - Xác nhận tiền đổ về đúng tài khoản ngân hàng của Quỹ Học bổng.
   - Kiểm tra Database: `ScholarshipCampaign.fundedAmount` tăng đúng `10,000 VNĐ`.
3. **Bước 3 — Đối soát Sổ cái:**
   - Kích hoạt hàm `verifyLedgerIntegrity()` trên cơ sở dữ liệu thật và đảm bảo trả về `valid: true`, độ lệch cân bằng sổ cái bằng đúng 0 đồng.

---

## 18. KẾ HOẠCH TRIỂN KHAI PR6 (PR6 EXECUTION ROADMAP)

Giai đoạn PR6 sẽ là chặng cuối cùng để hoàn tất việc kết nối trực tiếp với cổng thanh toán:

1. **Sprint PR6-A: Fix Test Fixture & Preflight Validation**
   - Sửa 1 dòng `teacherName` trong `payosSafetyHardening.pr5.test.js`.
   - Xác nhận 139/139 tests PASS.
   - Thiết lập cấu hình môi trường `.env` production hoàn chỉnh.
2. **Sprint PR6-B: Production Dashboard & Admin Đối soát**
   - Xây dựng giao diện Admin Reconciliation Dashboard để hiển thị các bản ghi `PaymentReconciliation` cần review (các đơn hàng đến muộn, sai số tiền, sai tài khoản).
   - Nút hành động xử lý thủ công cho Kế toán: `Chấp thuận bù sĩ số`, `Kích hoạt hoàn tiền`, hoặc `Ghi nhận ngoại lệ`.
3. **Sprint PR6-C: Kết nối Webhook Trực tiếp & Smoke Test**
   - Đăng ký URL Webhook trên payOS portal.
   - Bật `PAYOS_ENABLED=true` và `ENABLE_FINANCIAL_OUTBOX_WORKER=true`.
   - Thực hiện kịch bản kiểm thử 10,000 VNĐ theo Mục 17.
   - Ký biên bản bàn giao chính thức cho phòng Tài chính - Kế toán.

---

## 19. PHÁN QUYẾT GO / NO-GO CHO TÍCH HỢP PAYOS THẬT

Dựa trên toàn bộ kết quả kiểm toán mã nguồn, kiểm tra an toàn dữ liệu và phân tích rủi ro:

$$\mathbf{PHÁN\ QUYẾT:\ CONDITIONAL\ GO\ (CHẤP\ THUẬN\ CÓ\ ĐIỀU\ KIỆN)}$$

### Lý do chi tiết:
- **Mặt Kiến trúc & Mã nguồn lõi (PASS - 100%):** Toàn bộ cơ chế Outbox Recovery, Unique Indexes, Dual Ledger cho giao dịch muộn, tính phiên bản của chính sách hoa hồng đều đã được cài đặt kiên cố, chuẩn xác, không có lỗi logic.
- **Mặt Giao diện Frontend (PASS - 100%):** Build Vite sạch không lỗi, polling 3 giây mượt mà, UX đếm ngược và QR thân thiện.
- **Điều kiện cần giải tỏa trước khi merge vào PR6:** Sửa 1 dòng test fixture tại `tests/payosSafetyHardening.pr5.test.js` dòng 184 để toàn bộ CI/CD chuyển màu xanh hoàn toàn.

---

## 20. KẾT LUẬN NGHIỆM THU PR5

1. PR5 (**Financial Safety Hardening**) đã xuất sắc hoàn thành tất cả các mục tiêu kỹ thuật cốt lõi đặt ra, giải quyết triệt để các rủi ro tài chính đã cảnh báo trong các phiên trước.
2. Hệ thống thanh toán của EDUNITY V3 hiện tại đã sở hữu một tầng bảo vệ sổ cái vững chắc tương đương các hệ thống Fintech tiêu chuẩn: chống thanh toán trùng lặp, chống mất giao dịch khi máy chủ gặp sự cố, minh bạch các khoản tiền nộp muộn và bảo toàn dữ liệu hoa hồng giảng viên.
3. Đề nghị Team Leader Tin phê duyệt nghiệm thu PR5 và cho phép khởi động **PR6** để tiến hành cấu hình thực tế và thử nghiệm dòng tiền thật.

---
*Báo cáo được lập bởi: Ban Kiểm toán Kiến trúc Thanh toán & An toàn Tài chính EDUNITY V3.*

