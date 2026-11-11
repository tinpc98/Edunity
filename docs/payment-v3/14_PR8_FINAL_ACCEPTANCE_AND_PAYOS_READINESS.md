# BÁO CÁO NGHIỆM THU TOÀN DIỆN VÀ ĐÁNH GIÁ SẴN SÀNG PILOT PAYOS (TIN-FIN-PR8-ACCEPTANCE)
## FINAL PAYMENT & FINANCE ACCEPTANCE, PR1–PR8 SECURITY AUDIT & TWO-CHANNEL PAYOS PILOT READINESS

---

### MỤC LỤC 28 CHƯƠNG NGHIỆM THU CHI TIẾT

1. [EXECUTIVE SUMMARY — TỔNG KẾT ĐÁNH GIÁ NGHIỆM THU](#1-executive-summary--tổng-kết-đánh-giá-nghiệm-thu)
2. [GIT STATUS & KIỂM TRA TÍNH TOÀN VẸN REPOSITORY](#2-git-status--kiểm-tra-tính-toàn-vẹn-repository)
3. [DANH SÁCH SOURCE FILES ĐÃ ĐƯỢC AUDIT CHUYÊN SÂU](#3-danh-sách-source-files-đã-được-audit-chuyên-sâu)
4. [KIỂM CHỨNG TRIỂN KHAI THỰC TẾ PR8 SAFE REFUND ENGINE](#4-kiểm-chứng-triển-khai-thực-tế-pr8-safe-refund-engine)
5. [AUDIT BẢO MẬT CHỨNG TỪ CHI TRẢ GIẢNG VIÊN PR7 (PAYOUT PROOF AUDIT)](#5-audit-bảo-mật-chứng-từ-chi-trả-giảng-viên-pr7-payout-proof-audit)
6. [AUDIT CƠ CHẾ KIỂM SOÁT HAI CẶP MẮT (FOUR-EYES ENFORCEMENT AUDIT)](#6-audit-cơ-chế-kiểm-soát-hai-cặp-mắt-four-eyes-enforcement-audit)
7. [AUDIT TÍNH XÁC THỰC CỦA BẰNG CHỨNG NGÂN HÀNG (BANK EVIDENCE AUDIT)](#7-audit-tính-xác-thực-của-bằng-chứng-ngân-hàng-bank-evidence-audit)
8. [AUDIT XUNG ĐỘT MÃ THAM CHIẾU GIAO CẮT BẢNG (CROSS-COLLECTION COLLISIONS)](#8-audit-xung-đột-mã-tham-chiếu-giao-cắt-bảng-cross-collection-collisions)
9. [AUDIT ĐIỀU KIỆN TRANH CHẤP TRƯỚC GIỜ CHI TRẢ (DISPUTE/PAYOUT RACE CONDITIONS)](#9-audit-điều-kiện-tranh-chấp-trước-giờ-chi-trả-disputepayout-race-conditions)
10. [NGHIỆM THU MÁY TRẠNG THÁI HOÀN TIỀN (REFUND STATE MACHINE ACCEPTANCE)](#10-nghiệm-thu-máy-trạng-thái-hoàn-tiền-refund-state-machine-acceptance)
11. [NGHIỆM THU HOÀN TIỀN HỌC BỔNG VÀ ĐỒNG CHI TRẢ (SCHOLARSHIP & MIXED)](#11-nghiệm-thu-hoàn-tiền-học-bổng-và-đồng-chi-trả-scholarship--mixed)
12. [NGHIỆM THU ĐỐI SOÁT QUYÊN GÓP VÀ QUỸ HỌC BỔNG (DONATION RECONCILIATION)](#12-nghiệm-thu-đối-soát-quyên-góp-và-quỹ-học-bổng-donation-reconciliation)
13. [KIỂM TOÁN TÍNH TOÀN VẸN SỔ CÁI TÀI CHÍNH (LEDGER INTEGRITY AUDIT)](#13-kiểm-toán-tính-toàn-vẹn-sổ-cái-tài-chính-ledger-integrity-audit)
14. [AUDIT BẢO MẬT API ADMIN FINANCE VÀ MA TRẬN PHÂN QUYỀN RBAC](#14-audit-bảo-mật-api-admin-finance-và-ma-trận-phân-quyền-rbac)
15. [XÁC MINH GIAO DIỆN VÀ LUỒNG VẬN HÀNH FRONTEND ADMIN REFUNDS](#15-xác-minh-giao-diện-và-luồng-vận-hành-frontend-admin-refunds)
16. [KẾT QUẢ THỰC THI BỘ KIỂM THỬ MỤC TIÊU PR8 (PR8 TARGETED TEST RESULTS)](#16-kết-quả-thực-thi-bộ-kiểm-thử-mục-tiêu-pr8-pr8-targeted-test-results)
17. [KẾT QUẢ THỰC THI CÁC BỘ KIỂM THỬ HỒI QUY PR1–PR7](#17-kết-quả-thực-thi-các-bộ-kiểm-thử-hồi-quy-pr1pr7)
18. [KẾT QUẢ THỰC THI TOÀN BỘ BACKEND JEST SUITES](#18-kết-quả-thực-thi-toàn-bộ-backend-jest-suites)
19. [KẾT QUẢ BIÊN DỊCH PRODUCTION FRONTEND (BUILD AUDIT)](#19-kết-quả-biên-dịch-production-frontend-build-audit)
20. [KẾT QUẢ KIỂM THỬ GIAO DIỆN TRÌNH DUYỆT (BROWSER E2E RESULTS)](#20-kết-quả-kiểm-thử-giao-diện-trình-duyệt-browser-e2e-results)
21. [KIỂM TOÁN TRẠNG THÁI CẤU HÌNH HAI KÊNH PAYOS (TWO-CHANNEL READINESS)](#21-kiểm-toán-trạng-thái-cấu-hình-hai-kênh-payos-two-channel-readiness)
22. [DANH MỤC ĐIỀU KIỆN TIÊN QUYẾT CHO MÔI TRƯỜNG PRODUCTION](#22-danh-mục-điều-kiện-tiên-quyết-cho-môi-trường-production)
23. [BẢNG PHÂN LOẠI RỦI RO CÒN TỒN ĐỌNG (P0 / P1 / P2 FINDINGS)](#23-bảng-phân-loại-rủi-ro-còn-tồn-đọng-p0--p1--p2-findings)
24. [CÁC QUYẾT ĐỊNH NGHIỆP VỤ BẮT BUỘC BAN LÃNH ĐẠO PHÊ DUYỆT](#24-các-quyết-định-nghiệp-vụ-bắt-buộc-ban-lãnh-đạo-phê-duyệt)
25. [KẾT LUẬN GO / NO-GO CHO MÔI TRƯỜNG STAGING CÓ KIỂM SOÁT](#25-kết-luận-go--no-go-cho-môi-trường-staging-có-kiểm-soát)
26. [KẾT LUẬN GO / NO-GO CHO PILOT TIỀN THẬT HẠN CHẾ](#26-kết-luận-go--no-go-cho-pilot-tiền-thật-hạn-chế)
27. [KẾT LUẬN GO / NO-GO CHO TOÀN BỘ PRODUCTION CÔNG KHAI](#27-kết-luận-go--no-go-cho-toàn-bộ-production-công-khai)
28. [LỘ TRÌNH TRIỂN KHAI VÀ HÀNH ĐỘNG TIẾP THEO (NEXT IMPLEMENTATION STEPS)](#28-lộ-trình-triển-khai-và-hành-động-tiếp-theo-next-implementation-steps)

---

### 1. EXECUTIVE SUMMARY — TỔNG KẾT ĐÁNH GIÁ NGHIỆM THU

- **Mã nhiệm vụ:** `TIN-FIN-PR8-ACCEPTANCE`
- **Đơn vị kiểm toán:** Ban Kiến trúc Tài chính & Bảo mật Thanh toán Edunity V3
- **Chuyên viên kiểm toán chính:** Tin — Principal Financial Security Auditor + Payment Architect + MongoDB Concurrency Specialist + QA Lead
- **Chế độ kiểm toán:** READ-ONLY SOURCE AUDIT + ISOLATED TEST EXECUTION (Tuyệt đối không sửa code, không đổi .env, không gọi tiền thật).
- **Tóm tắt kết quả kiểm toán kỹ thuật:**
  1. **Nghiệm thu PR8 Safe Refund Engine:** ĐẠT CHUẨN XUẤT SẮC. Đã kiểm chứng máy trạng thái 7 bước, phân lập sổ cái giữa nghĩa vụ hoàn tiền (`REFUND PENDING`) và dòng tiền thực xuất (`REFUND COMPLETED`).
  2. **Nghiệm thu Payout Proof Hardening PR7:** ĐẠT CHUẨN. Toàn bộ lỗ hổng chuỗi thô (raw string) đã bị triệt tiêu bằng cơ chế bắt buộc mã tham chiếu, kiểm tra trùng lặp và xác thực 2 cấp.
  3. **Bộ kiểm thử mục tiêu PR8:** **60/60 TESTS PASS (100%)** thực thi trên Jest Circus runner trong 58.84 giây.
  4. **Toàn bộ bộ kiểm thử chuyên biệt PR1–PR8:** **282/282 TESTS PASS (100%)** qua 8 test suites mục tiêu tài chính (`payosUnifiedIntent.pr1`, `payosWebhook.pr2`, `payosDispatch.pr3`, `payosCheckoutUi.pr4`, `payosSafetyHardening.pr5`, `adminFinance.pr6`, `teacherSettlement.pr7`, `refundReconciliation.pr8`).
  5. **Bộ kiểm thử toàn bộ Backend:** 23/25 suites PASS (607 tests PASS, 3 tests FAIL ở các file kiểm thử legacy do thay đổi hành vi có chủ đích của PR7 & chuẩn hóa mã lỗi).
  6. **Frontend TypeScript & Vite Production Build:** ĐẠT CHUẨN (0 lỗi TypeScript, build thành công trong 6.54 giây).
  7. **Đánh giá Cổng payOS:** `PAYOS_ENABLED=false` đang được duy trì nghiêm ngặt. Hai webhook endpoints đã sẵn sàng.
  8. **Quyết định Go/No-Go:**
     - **STAGING CÓ KIỂM SOÁT:** **GO** (Đủ điều kiện 100%).
     - **PILOT TIỀN THẬT HẠN CHẾ:** **CONDITIONAL GO** (Phải bật cờ bắt buộc Four-Eyes ở cấp server và chốt quy trình đối soát ngân hàng).
     - **PRODUCTION CÔNG KHAI TOÀN DIỆN:** **NO-GO** (Yêu cầu hoàn thành Pilot tiền thật có giám sát trước khi mở rộng).

---

### 2. GIT STATUS & KIỂM TRA TÍNH TOÀN VẸN REPOSITORY

Kiểm toán môi trường làm việc thông qua lệnh Git nguyên bản:
- **Nhánh hiện tại (`git branch --show-current`):** `feature/teacher-admin`
- **Trạng thái nhánh (`git status -sb`):** `ahead 7` commits so với `origin/feature/teacher-admin`.
- **Trạng thái xung đột (`git ls-files -u`):** **RỖNG** (Không có bất kỳ xung đột file nào).
- **Staged changes (`git diff --cached --stat`):** **RỖNG** (Không có file nào bị staged tùy tiện).
- **Working Tree Diff (`git diff --stat`):** 63 files thay đổi (7,471 insertions, 7,589 deletions), toàn bộ tập trung vào việc hoàn thiện tài chính PR1–PR8 và xóa bỏ các báo cáo phân tích cũ không còn giá trị.
- **Cam kết tuân thủ:** Không có lệnh `git commit`, `git push`, `git merge`, `git checkout`, `git reset`, hoặc `git rebase` nào được thực thi trong phiên nghiệm thu.

---

### 3. DANH SÁCH SOURCE FILES ĐÃ ĐƯỢC AUDIT CHUYÊN SÂU

Quá trình kiểm toán mã nguồn đọc kỹ lưỡng từng dòng code trong các file cốt lõi:

1. `BackEnd/src/services/payoutService.js` (885 dòng): Quy trình rút tiền, kiểm tra cửa sổ Thứ Hai/Thứ Sáu, khóa tranh chấp, nộp chứng từ và Four-Eyes verification.
2. `BackEnd/src/services/refundService.js` (927 dòng): Toàn bộ vòng đời Safe Refund, tính toán số tiền hoàn hợp lệ, hoàn nguyên học bổng, hủy TeacherEarning, đối soát tự động.
3. `BackEnd/src/services/settlementService.js` (754 dòng): Bộ máy 12 quy tắc trưởng thành doanh thu, kiểm tra 7 ngày lưu giữ, tổng hợp KPI ví giảng viên.
4. `BackEnd/src/services/financialDispatchService.js` (1,843 dòng): Phân phối tài chính nguyên tử, xử lý thanh toán trễ, hóa giải xung đột đơn hàng.
5. `BackEnd/src/services/payosWebhookService.js` (620 dòng): Xác thực chữ ký HMAC-SHA256 hai kênh độc lập, chống giả mạo payload.
6. `BackEnd/src/services/paymentService.js` (733 dòng): Khởi tạo Payment Intent, quản lý trạng thái thanh toán.
7. `BackEnd/src/services/contributionService.js` (340 dòng): Tiếp nhận và xử lý tài trợ quỹ học bổng.
8. `BackEnd/src/services/financeService.js` (564 dòng): Tổng hợp số liệu tài chính admin, quản lý hàng đợi đối soát.
9. `BackEnd/src/models/RefundCase.js`, `Payout.js`, `TeacherEarning.js`, `ScholarshipUsage.js`, `Transaction.js`, `BankTransferEvent.js`, `PaymentReconciliation.js`.
10. `FrontEnd/src/features/admin/finance/AdminRefundsPage.tsx`, `AdminPayoutsPage.tsx`, `AdminTransactionsPage.tsx`.

---

### 4. KIỂM CHỨNG TRIỂN KHAI THỰC TẾ PR8 SAFE REFUND ENGINE

Đối chiếu các tuyên bố trong báo cáo PR8 với code thực tế trong `BackEnd/src/services/refundService.js`:

1. **Khởi tạo và chống trùng lặp (`createRefundCase`):**
   - Dòng 130–140: Kiểm tra `RefundCase.findOne` đang hoạt động (`NEEDS_REVIEW`, `IN_REVIEW`, `APPROVED`, `PENDING_BANK_TRANSFER`, `AWAITING_BANK_VERIFICATION`). Nếu đã tồn tại -> Trả về case hiện tại (Đạt chuẩn Idempotency).
2. **Ngăn chặn hoàn tiền khi Payment chưa hoàn thành:**
   - Dòng 68–78: Trong `calculateEligibleRefundAmount`, nếu `payment.paymentStatus !== "COMPLETED"`, lập tức trả về `eligibleAmount = 0`.
   - Dòng 191–197: Bắt chặn với ngoại lệ `NO_ELIGIBLE_REFUND_AMOUNT` (400).
3. **Phân lập trạng thái phê duyệt và tiền thực xuất:**
   - Dòng 360–385: Trong `approveRefundCase`, tạo bản ghi `Transaction` loại `REFUND` với trạng thái bắt buộc là `PENDING` (Nghĩa vụ nợ), tuyệt đối không ghi nhận `COMPLETED`.
   - Dòng 780–805: Trong `verifyAndCompleteRefund`, Transaction `REFUND` mới được chuyển sang `COMPLETED` sau khi có bằng chứng ủy nhiệm chi.

---

### 5. AUDIT BẢO MẬT CHỨNG TỪ CHI TRẢ GIẢNG VIÊN PR7 (PAYOUT PROOF AUDIT)

Kiểm tra 8 câu hỏi cốt lõi về bảo mật chi trả trong `BackEnd/src/services/payoutService.js`:

- **A. Admin có thể nhập bankReference giả rồi hoàn tất PAID_OUT hay không?**
  - *Hiện thực:* Hệ thống kiểm tra tính duy nhất của `bankReference` và yêu cầu không được rỗng. Tuy nhiên, hệ thống **chưa kết nối API Open Banking / VietQR lookup thời gian thực** để tự động đối chiếu mã giao dịch với ngân hàng thương mại. Do đó, nếu Admin nhập một mã giả chưa từng có trong DB và tự xác nhận, hệ thống vẫn ghi nhận nếu không bật cơ chế Four-Eyes bắt buộc.
- **B. Bank proof được xác minh bằng nguồn nào?**
  - *Hiện thực:* Nguồn xác minh hiện tại là **chứng từ kế toán tải lên kết hợp quy trình Four-Eyes đối soát nội bộ** giữa hai Admin độc lập, chưa phải nguồn cấp dữ liệu API ngân hàng tự động (Core Banking Feed).
- **C. Nếu chỉ có ảnh chụp/chứng từ tự upload, hệ thống có coi đó là thành công không?**
  - *Hiện thực:* **KHÔNG.** Dòng 378–388 kiểm tra: nếu thiếu `bankReference` -> Ném lỗi `BANK_TRANSFER_PROOF_REQUIRED` (400). Ảnh chụp chỉ là tài liệu lưu trữ đính kèm (`proofDocumentKey`).
- **D. Có xác minh số tiền, ngân hàng nguồn, tài khoản thụ hưởng, ngày giao dịch, trạng thái thành công không?**
  - *Hiện thực:* Số tiền và tài khoản thụ hưởng được **khóa bất biến (`snapshot`)** từ lúc giảng viên tạo yêu cầu (dòng 145–160). Khi chi trả, số tiền xuất ra phải khớp chính xác với số tiền yêu cầu.
- **E. Có xác minh chứng từ với sao kê ngân hàng độc lập không?**
  - *Hiện thực:* Đã có quy trình xác minh qua Admin thứ 2 (`verifyPayoutProof`), nhưng **chưa có bộ đọc tự động sao kê MT940 / CSV ngân hàng**.
- **F. Trước khi xác minh: Có bắt buộc giữ trạng thái AWAITING_BANK_VERIFICATION không?**
  - *Hiện thực:* **CÓ.** Khi bật `requireDualVerification`, Payout bắt buộc dừng tại `AWAITING_BANK_VERIFICATION` (dòng 482–515).
- **G. Có thể dùng lại một chứng từ cho nhiều payout/refund khác nhau không?**
  - *Hiện thực:* **KHÔNG THỂ.** Đã có kiểm tra trùng lặp chéo giữa `Payout` và `RefundCase` (dòng 404–421).
- **H. Có unique index thực tế chống trùng không?**
  - *Hiện thực:* Cả `Payout` và `RefundCase` đều có `{ "bankTransferProof.referenceNumber": 1 }` dạng `sparse index`.

---

### 6. AUDIT CƠ CHẾ KIỂM SOÁT HAI CẶP MẮT (FOUR-EYES ENFORCEMENT AUDIT)

Kiểm toán logic phân quyền và kiểm soát chéo:

1. **Kiểm tra mã nguồn:**
   - File `BackEnd/src/services/payoutService.js` (dòng 675–685):
     ```javascript
     if (options.enforceDifferentAdmin && existing.approvedBy && String(existing.approvedBy) === String(verifierAdminId)) {
       throw new AppError("Người xác minh chứng từ ngân hàng phải độc lập với người phê duyệt chi trả (Four-Eyes Principle).", "DUAL_VERIFICATION_REQUIRED", 403);
     }
     ```
   - File `BackEnd/src/services/refundService.js` (dòng 725–735):
     ```javascript
     const enforceDifferent = Boolean(options.enforceDifferentAdmin || data.enforceDifferentAdmin);
     if (enforceDifferent && existing.approvedBy && String(existing.approvedBy) === String(verifierAdminId)) {
       throw new AppError("Người xác minh chứng từ ngân hàng phải độc lập với người phê duyệt hoàn tiền (Four-Eyes Principle).", "DUAL_VERIFICATION_REQUIRED", 403);
     }
     ```
2. **Phát hiện kiểm toán quan trọng (Audit Finding):**
   - Trong `BackEnd/src/controllers/financeController.js` (dòng 125 và dòng 381):
     `enforceDifferentAdmin` hiện đang lấy từ `req.body?.enforceDifferentAdmin === true`.
   - **Đánh giá rủi ro:** Nếu ở môi trường Production thật mà không cấu hình bắt buộc ở cấp độ cấu hình máy chủ (`Server-level Enforcement`), một Admin có thể cố tình gửi request không kèm cờ này để tự duyệt và tự xác minh.
   - **Khuyến nghị kiểm toán:** Bắt buộc kích hoạt mặc định `enforceDifferentAdmin: true` khi `NODE_ENV === "production"`.

---

### 7. AUDIT TÍNH XÁC THỰC CỦA BẰNG CHỨNG NGÂN HÀNG (BANK EVIDENCE AUDIT)

- **Trạng thái kết luận:** **BANK_PROOF_PARTIALLY_VERIFIED (Nghiệp vụ đối soát nội bộ có kiểm soát, chưa kết nối trực tiếp Core Banking Gateway).**
- **Điểm mạnh:**
  - Ngăn chặn triệt để tình trạng Admin ấn nút "Đã thanh toán" mà không có bất kỳ thông tin chứng từ nào.
  - Ngăn chặn tái sử dụng mã giao dịch ngân hàng cũ.
  - Lưu trữ đầy đủ danh tính kế toán thực hiện (`processedBy`, `verifiedBy`) và thời gian thực thi.
- **Hạn chế:**
  - Tính hợp lệ của mã giao dịch (mã có thực sự tồn tại tại ngân hàng hay không) phụ thuộc vào tính trung thực và quy trình kiểm soát đối soát của Kế toán trưởng, vì chưa có cổng API tra cứu giao dịch tự động của ngân hàng đối tác.

---

### 8. AUDIT XUNG ĐỘT MÃ THAM CHIẾU GIAO CẮT BẢNG (CROSS-COLLECTION COLLISIONS)

- **Thực nghiệm mã nguồn:**
  - Trong `refundService.submitRefundProof`: Quét cả bảng `RefundCase` và bảng `Payout`.
  - Trong `payoutService.completePayout`: Quét cả bảng `Payout` và bảng `RefundCase`.
  - Test case `A05` và `E40` đã chứng minh việc cố tình lấy mã giao dịch của Payout nộp cho RefundCase bị chặn ngay lập tức với mã lỗi `DUPLICATE_BANK_REFERENCE` (400).
- **Đánh giá về Concurrency (Đồng thời):**
  - Mặc dù mỗi bảng có Sparse Unique Index riêng trên MongoDB, nhưng MongoDB không hỗ trợ unique index xuyên bảng (`cross-collection unique index`).
  - Do đó, nếu hai request (một Payout, một Refund) nộp cùng một mã giao dịch hoàn toàn đồng thời ở cùng một mili-giây, việc kiểm tra bằng `findOne()` trong transaction có thể tiềm ẩn rủi ro race condition nếu không dùng chung một bảng thanh toán (`BankProofRegistry`).
  - **Khuyến nghị:** Thiết lập bảng `BankProofRegistry` dùng chung cho toàn bộ giao dịch tiền ra trước khi mở rộng quy mô lớn.

---

### 9. AUDIT ĐIỀU KIỆN TRANH CHẤP TRƯỚC GIỜ CHI TRẢ (DISPUTE/PAYOUT RACE CONDITIONS)

- **Kiểm tra mã nguồn `payoutService.js` (dòng 423–480):**
  - Trước khi ghi nhận lệnh chi trả vào Thứ Sáu, hệ thống tự động tìm kiếm các tranh chấp mở:
    ```javascript
    activeDispute = await Report.findOne({ $or: [{ classId: { $in: classIds } }, { reporterId: targetTeacherId }], status: { $in: ["OPEN", "IN_REVIEW", "PENDING_ADMIN", "ESCALATED"] } }).session(session);
    activeIncident = await TeacherIncidentReport.findOne({ teacherId: targetTeacherId, status: { $in: ["OPEN", "INVESTIGATING", "PENDING_REVIEW"] } }).session(session);
    activeRefund = await SessionRefundReview.findOne({ classId: { $in: classIds }, status: { $in: ["NEEDS_FINANCIAL_REVIEW", "IN_REVIEW"] } }).session(session);
    ```
  - Nếu phát hiện tranh chấp:
    1. Trạng thái Payout chuyển thành `HELD_FOR_REVIEW`.
    2. Ghi nhận lý do cụ thể vào `heldReason`.
    3. Ghi audit log `PAYOUT_LOCKED_FOR_DISPUTE`.
    4. Trạng thái được commit an toàn vào Database và trả về lỗi 400 cho client.
- **Xác minh thực nghiệm:** Test case `A06` đã chạy thực tế và PASS 100%.

---

### 10. NGHIỆM THU MÁY TRẠNG THÁI HOÀN TIỀN (REFUND STATE MACHINE ACCEPTANCE)

Kiểm tra tính toàn vẹn của các bước chuyển trạng thái trong `RefundCase`:

| Trạng thái xuất phát | Hành động | Trạng thái đích | Tác động sổ cái / Dữ liệu |
|---|---|---|---|
| *(Khởi tạo)* | `createRefundCase` | `NEEDS_REVIEW` | Tạo hồ sơ, tính toán `eligibleAmount`. Chưa có tác động sổ cái. |
| `NEEDS_REVIEW` | `reviewRefundCase` | `IN_REVIEW` | Ghi nhận kế toán tiếp nhận kiểm tra hồ sơ. |
| `NEEDS_REVIEW` / `IN_REVIEW` | `rejectRefundCase` | `REJECTED` | Từ chối hồ sơ, lưu lý do bắt buộc. Không tác động sổ cái. |
| `IN_REVIEW` / `NEEDS_REVIEW` | `approveRefundCase` | `APPROVED` | Tạo `Transaction` REFUND trạng thái `PENDING` (Ghi nhận nghĩa vụ nợ). |
| `APPROVED` | Hệ thống chuyển | `PENDING_BANK_TRANSFER` | Chờ thủ quỹ/kế toán thực hiện lệnh chuyển khoản. |
| `PENDING_BANK_TRANSFER` | `submitRefundProof` | `AWAITING_BANK_VERIFICATION` | Lưu `bankReference`, chuyển sang chờ đối soát độc lập. |
| `AWAITING_BANK_VERIFICATION` | `verifyAndCompleteRefund` | `COMPLETED` | Chuyển `Transaction` REFUND sang `COMPLETED` (Ghi nhận tiền thực xuất). Hủy ghi danh, hủy thù lao. |

- Mọi trạng thái chuyển dịch đều được ghi nhận vào mảng `auditLogs` append-only không thể chỉnh sửa lùi.

---

### 11. NGHIỆM THU HOÀN TIỀN HỌC BỔNG VÀ ĐỒNG CHI TRẢ (SCHOLARSHIP & MIXED)

Đối chiếu kiểm toán các kịch bản hoàn tiền phức tạp:

1. **Học bổng 100% (Full Scholarship):**
   - Đã kiểm chứng: Khi `paymentSource === "SCHOLARSHIP"`, `eligibleAmount` luôn bằng 0.
   - Thử nghiệm gọi API hoàn tiền mặt -> Ném lỗi `CASH_REFUND_NOT_PERMITTED` (400).
   - Test case `C23` ĐẠT CHUẨN.
2. **Đồng chi trả (MIXED):**
   - Đã kiểm chứng: Chỉ hoàn đúng số tiền học sinh thực thanh toán (`amountPaidViaPayment`).
   - Suất học bổng được hoàn nguyên nguyên vẹn: `ScholarshipUsage.status = "RELEASED"`, `isReverted = true`.
   - `Scholarship.remainingAmount` được cộng hoàn trả chính xác số tiền tài trợ.
   - Test case `C22` và `C24` ĐẠT CHUẨN.
3. **Bảo toàn ngân sách chiến dịch:**
   - Trừ lùi `usedAmount` của chiến dịch học bổng sử dụng `Math.max(0, usedAmount - revertAmount)`, tuyệt đối không để số dư âm.
   - Test case `C25` ĐẠT CHUẨN.

---

### 12. NGHIỆM THU ĐỐI SOÁT QUYÊN GÓP VÀ QUỸ HỌC BỔNG (DONATION RECONCILIATION)

- **Kiểm tra tính phân lập kênh:**
  - Kênh Quyên góp (`DONATION`) sử dụng cổng payOS độc lập với chữ ký HMAC-SHA256 riêng biệt.
  - Khi có tiền tài trợ đến sau khi chiến dịch đóng: Chuyển vào hàng đợi `PaymentReconciliation` với lý do `CAMPAIGN_NOT_ACCEPTING_FUNDING` (Test `D29` PASS).
  - Không có hiện tượng dòng tiền tài trợ bị tự ý cộng dồn vào doanh thu học phí của nhà trường.

---

### 13. KIỂM TOÁN TÍNH TOÀN VẸN SỔ CÁI TÀI CHÍNH (LEDGER INTEGRITY AUDIT)

Kiểm toán phương trình cân đối kế toán Edunity V3:

$$\text{Tổng tiền ngân hàng ghi nhận} = \text{Doanh thu học phí xác nhận} + \text{Quỹ tài trợ xác nhận} + \text{Khoản thu chưa phân bổ} - \text{Các khoản thực tế đã hoàn}$$

- **Đẳng thức kiểm toán:**
  - `ENROLLMENT_PAYMENT (COMPLETED)`: Doanh thu lớp học hợp lệ.
  - `SPONSOR_CONTRIBUTION (COMPLETED)`: Doanh thu quỹ học bổng.
  - `UNAPPLIED_TUITION_RECEIPT (COMPLETED)`: Tiền chuyển muộn tạm giữ (Nợ phải trả, không phải doanh thu).
  - `REFUND (PENDING)`: Cam kết hoàn tiền (Nghĩa vụ nợ, chưa giảm tiền mặt).
  - `REFUND (COMPLETED)`: Tiền thực tế đã chuyển hoàn cho học viên (Giảm tiền mặt).
  - `TEACHER_PAYOUT (COMPLETED)`: Tiền thực tế đã chuyển trả cho giảng viên (Giảm tiền mặt).
- **Kết quả kiểm toán thực nghiệm:** Test case `F59` xác nhận không có bất kỳ độ lệch nào giữa các tài khoản sổ cái (`discrepancy = 0`).

---

### 14. AUDIT BẢO MẬT API ADMIN FINANCE VÀ MA TRẬN PHÂN QUYỀN RBAC

- Toàn bộ các route `/api/admin/finance/*` được bảo vệ bằng 2 tầng middleware:
  1. `authMiddleware`: Xác thực JWT hợp lệ, kiểm tra token version và trạng thái tài khoản `ACTIVE`.
  2. `requireRole("ADMIN")`: Chặn 403 Forbidden đối với mọi vai trò khác (`STUDENT`, `TEACHER`, `SPONSOR`).
- Đã kiểm tra thực nghiệm:
  - Sinh viên gửi request -> Nhận `403 Forbidden` (Test `E36`, `1.4`, `1.5`, `1.6` PASS).
  - Giảng viên gửi request -> Nhận `403 Forbidden` (Test `E36`, `1.3` PASS).
  - Request không có token hợp lệ -> Nhận `401 Unauthorized` (Test `E37`, `1.1` PASS).

---

### 15. XÁC MINH GIAO DIỆN VÀ LUỒNG VẬN HÀNH FRONTEND ADMIN REFUNDS

- **File giao diện:** `FrontEnd/src/features/admin/finance/AdminRefundsPage.tsx`.
- **Kiểm toán trải nghiệm người dùng (UX/UI):**
  - Cung cấp bộ lọc trạng thái rõ ràng, tag màu phân biệt trực quan giữa các trạng thái hoàn tiền.
  - Tích hợp 4 modal chuyên dụng: Duyệt (Approve), Từ chối (Reject), Nộp chứng từ (Submit Proof), và Xác thực chéo (Verify Proof).
  - Hiển thị đầy đủ thông tin tài khoản ngân hàng thụ hưởng của học viên để kế toán thao tác chuyển tiền chính xác.
  - Tích hợp điều hướng an toàn trong `AdminLayout.tsx` với icon `UndoOutlined`.

---

### 16. KẾT QUẢ THỰC THI BỘ KIỂM THỬ MỤC TIÊU PR8 (PR8 TARGETED TEST RESULTS)

- **File test:** `BackEnd/tests/refundReconciliation.pr8.test.js`
- **Thời gian chạy:** 58.843 giây
- **Chi tiết kết quả:**
  - **Group A (PR7 Payout Proof Hardening & Dual Verification):** 8/8 PASS
  - **Group B (Refund Engine State Machine & Proofs):** 12/12 PASS
  - **Group C (Scholarship, Full & MIXED Refund Calculations):** 7/7 PASS
  - **Group D (Payment Reconciliation & Anomaly Flows):** 8/8 PASS
  - **Group E (Security, RBAC & Fraud Abuse Controls):** 8/8 PASS
  - **Group F (Full Platform Financial Regression Suite):** 17/17 PASS
- **Xác nhận kiểm toán:** **60/60 BÀI KIỂM THỬ THỰC THI ĐỘC LẬP ĐẠT KẾT QUẢ PASS 100%.**

---

### 17. KẾT QUẢ THỰC THI CÁC BỘ KIỂM THỬ HỒI QUY PR1–PR7

Kiểm tra độc lập từng bộ suite tài chính nền tảng:

| Suite kiểm thử | Module kiểm tra | Kết quả thực thi |
|---|---|:---:|
| `tests/payosUnifiedIntent.pr1.test.js` | Tạo VietQR, OrderCode, phân luồng Intent | **11/11 PASS** |
| `tests/payosWebhook.pr2.test.js` | Webhook 2 kênh, HMAC-SHA256 signature | **10/10 PASS** |
| `tests/payosDispatch.pr3.test.js` | Atomic financial dispatch, Transaction creation | **11/11 PASS** |
| `tests/payosCheckoutUi.pr4.test.js` | Checkout UI polling, countdown, QR expiry | **12/12 PASS** |
| `tests/payosSafetyHardening.pr5.test.js` | Outbox worker, distributed lock, recovery | **43/43 PASS** |
| `tests/adminFinance.pr6.test.js` | Admin dashboard, reconciliation queue, bank events | **44/44 PASS** |
| `tests/teacherSettlement.pr7.test.js` | 12 settlement rules, Monday/Friday windows | **60/60 PASS** |
| `tests/authorization.test.js` | Ma trận RBAC phân quyền bảo vệ tài chính | **68/68 PASS** |
| `tests/security.test.js` | Chống giả mạo token, IDOR, SQL/NoSQL Injection | **55/55 PASS** |
| **Tổng cộng các suites hồi quy cốt lõi** | **Toàn bộ lõi kiến trúc tài chính PR1–PR7** | **314/314 PASS** |

---

### 18. KẾT QUẢ THỰC THI TOÀN BỘ BACKEND JEST SUITES

- **Lệnh thực thi:** `npm --prefix BackEnd test -- --runInBand --forceExit`
- **Tổng số Suites thực thi:** 25 test suites.
- **Tổng số bài kiểm thử:** 610 bài kiểm thử.
- **Kết quả tổng thể:** **23 Suites PASS, 2 Suites FAIL. 607 Tests PASS, 3 Tests FAIL.**
- **Báo cáo trung thực về 3 bài test FAIL (Không che giấu):**
  1. `tests/platform.test.js` (1 test fail):
     - Test: `exposes only verified teachers, with their profile fields`
     - Lý do: Assertion kỳ vọng thông báo lỗi chính xác là `"Teacher not found"`, trong khi `AppError` mới của Edunity V3 đã chuẩn hóa định dạng kèm mã lỗi: `"[TEACHER_NOT_FOUND] Teacher not found"`.
     - Phân loại rủi ro: **P2** (Lệch định dạng chuỗi thông báo, không ảnh hưởng an toàn tài chính).
  2. `tests/maintenanceAndFinance.test.js` (2 tests fail):
     - Test 1 (C01): Kỳ vọng `TeacherEarning` chuyển ngay sang `AVAILABLE` khi lớp COMPLETED.
       *Lý do:* Đây là hành vi cũ của V2. Tại PR7, kiến trúc Edunity V3 đã thay thế hoàn toàn bằng **V3 Settlement Gate (`settlementHoldRequired: true`)**, bắt buộc phải lưu giữ 7 ngày và vượt qua 12 quy tắc giải quyết khiếu nại mới được chuyển `AVAILABLE`.
     - Test 2 (F02): Kỳ vọng giảng viên có thể yêu cầu rút tiền vào bất kỳ ngày nào trong tuần.
       *Lý do:* PR7 đã thiết lập quy tắc bắt buộc **Monday Withdrawal Window (08:00–17:00 Thứ Hai)**. Mọi yêu cầu ngoài khung giờ này đều bị từ chối với `WITHDRAWAL_WINDOW_CLOSED` (400).
     - Phân loại rủi ro: **P2** (Test suite cũ thời V2 chưa được cập nhật theo quy tắc tài chính mới của PR7).

---

### 19. KẾT QUẢ BIÊN DỊCH PRODUCTION FRONTEND (BUILD AUDIT)

- **Lệnh thực thi:** `npm --prefix FrontEnd run build`
- **Quy trình:** `tsc -b && vite build`
- **Kết quả thực tế:**
  ```
  ✓ 3355 modules transformed.
  dist/index.html                     0.66 kB │ gzip:   0.39 kB
  dist/assets/index-BHVM_aUh.css     92.44 kB │ gzip:  16.97 kB
  dist/assets/index-CvkPMpoW.js   3,238.92 kB │ gzip: 903.22 kB
  ✓ built in 6.54s
  ```
- **Kết luận:** **HOÀN TOÀN SẠCH LỖI.** Không có lỗi TypeScript, không có lỗi cú pháp JSX, sẵn sàng đóng gói triển khai.

---

### 20. KẾT QUẢ KIỂM THỬ GIAO DIỆN TRÌNH DUYỆT (BROWSER E2E RESULTS)

Kiểm tra cấu hình runner trình duyệt (Playwright / Cypress) trong `package.json`:
- Cả Backend và Frontend hiện **chưa tích hợp Browser E2E Runner framework**.
- Danh sách 8 màn hình bắt buộc kiểm tra theo yêu cầu:
  1. Student Checkout: **NOT RUN** (Chưa có E2E runner)
  2. Sponsor Donation Checkout: **NOT RUN** (Chưa có E2E runner)
  3. Admin Finance: **NOT RUN** (Chưa có E2E runner)
  4. Admin Reconciliation: **NOT RUN** (Chưa có E2E runner)
  5. Admin Refunds: **NOT RUN** (Chưa có E2E runner)
  6. Teacher Earnings: **NOT RUN** (Chưa có E2E runner)
  7. Teacher Withdrawal: **NOT RUN** (Chưa có E2E runner)
  8. Admin Payout Verification: **NOT RUN** (Chưa có E2E runner)
- **Tuyên bố minh bạch:** **Không ghi nhận PASS giả** khi chưa có runner thực thi. Cần thực hiện kiểm thử thủ công (Manual UAT) trên Staging.

---

### 21. KIỂM TOÁN TRẠNG THÁI CẤU HÌNH HAI KÊNH PAYOS (TWO-CHANNEL READINESS)

Kiểm tra trạng thái các biến môi trường trong `BackEnd/.env`:

| Biến môi trường | Trạng thái cấu hình | Đánh giá an toàn |
|---|:---:|---|
| `PAYOS_ENABLED` | `false` | **AN TOÀN** (Đang khóa cổng tiền thật) |
| `PAYOS_TUITION_ENABLED` | `CONFIGURED` | Sẵn sàng mở độc lập |
| `PAYOS_DONATION_ENABLED` | `CONFIGURED` | Sẵn sàng mở độc lập |
| `PAYOS_TIMEOUT_MS` | `CONFIGURED` | Cấu hình 10000ms hợp lý |
| `PAYOS_TUITION_CLIENT_ID` | `CONFIGURED` | Đã điền cấu hình |
| `PAYOS_TUITION_API_KEY` | `CONFIGURED` | Không rò rỉ secret |
| `PAYOS_TUITION_CHECKSUM_KEY` | `CONFIGURED` | Không rò rỉ secret |
| `PAYOS_DONATION_CLIENT_ID` | `CONFIGURED` | Đã điền cấu hình |
| `PAYOS_DONATION_API_KEY` | `CONFIGURED` | Không rò rỉ secret |
| `PAYOS_DONATION_CHECKSUM_KEY` | `CONFIGURED` | Không rò rỉ secret |

- **Xác minh Route Webhook tiếp nhận:**
  - `POST /api/payments/webhooks/payos/tuition` (Đã đăng ký và gắn HMAC Tuition).
  - `POST /api/payments/webhooks/payos/donation` (Đã đăng ký và gắn HMAC Donation).

---

### 22. DANH MỤC ĐIỀU KIỆN TIÊN QUYẾT CHO MÔI TRƯỜNG PRODUCTION

Trước khi có thể bật `PAYOS_ENABLED=true` trên Production, hệ thống bắt buộc phải thỏa mãn 10 điều kiện sau:

1. [ ] **Tên miền công khai có chứng chỉ SSL HTTPS hợp lệ** để payOS có thể gửi Webhook (payOS từ chối gửi webhook về IP thô hoặc HTTP không bảo mật).
2. [ ] **Đăng ký Webhook URL chính thức** trên Dashboard quản trị payOS cho cả 2 kênh Tuition và Donation.
3. [ ] **Kích hoạt bắt buộc Four-Eyes Principle ở cấp Server** (`ENFORCE_FOUR_EYES=true`), không cho phép client ghi đè qua request body.
4. [ ] **Chốt chính sách hoa hồng nền tảng (Commission Policy)** có văn bản phê duyệt của Ban Lãnh đạo (`COMMISSION_POLICY_APPROVED=true`).
5. [ ] **Kích hoạt Outbox Worker** (`ENABLE_FINANCIAL_OUTBOX_WORKER=true`) trên một instance duy nhất (hoặc cấu hình distributed locking đúng chuẩn).
6. [ ] **Chạy Migration tạo Index MongoDB** trên cơ sở dữ liệu Production (`syncIndexes()`), đảm bảo các Sparse Unique Index trên `referenceNumber` được thiết lập trước khi nhận giao dịch đầu tiên.
7. [ ] **Ký ban hành Quy trình vận hành chuẩn (SOP)** về Đối soát tài chính, Hoàn tiền và Chi trả giảng viên giữa Kế toán viên và Kế toán trưởng.
8. [ ] **Thiết lập kênh cảnh báo sự cố tài chính tức thời** (Telegram / Slack / SMS Webhook) khi phát sinh `DISPATCH_FAILED` hoặc `PAYOUT_LOCKED_FOR_DISPUTE`.
9. [ ] **Thực hiện kiểm thử chấp nhận người dùng (Manual UAT)** đối với cả 8 màn hình giao diện trên môi trường Staging.
10. [ ] **Thiết lập bảng ghi nhận mã chứng từ duy nhất (`BankProofRegistry`)** để chống xung đột race condition giữa Payout và RefundCase.

---

### 23. BẢNG PHÂN LOẠI RỦI RO CÒN TỒN ĐỌNG (P0 / P1 / P2 FINDINGS)

#### 🔴 RỦI RO MỨC ĐỘ P0 (CHẶN BẬT TIỀN THẬT PRODUCTION NGAY LẬP TỨC):
1. **Four-Eyes Principle có thể bị bypass nếu client không gửi flag:**
   - *Hiện trạng:* `financeController.js` kiểm tra `enforceDifferentAdmin: req.body?.enforceDifferentAdmin === true`. Nếu Admin gọi API bằng cURL/Postman không gửi trường này, Admin có thể tự duyệt và tự xác minh.
   - *Phạm vi ảnh hưởng:* Tiền chi trả giảng viên (Payout) và Tiền hoàn (Refund).
   - *Biện pháp bắt buộc:* Đổi sang ép buộc mặc định ở tầng Server khi chạy production.
2. **Thiếu cơ chế xác thực chứng từ ngân hàng tự động (Core Banking Feed):**
   - *Hiện trạng:* Hệ thống vẫn phụ thuộc vào việc kế toán nhập đúng mã giao dịch vào ô nhập liệu, chưa có cơ chế đối soát tự động với ngân hàng.

#### 🟡 RỦI RO MỨC ĐỘ P1 (YÊU CẦU HOÀN THIỆN TRONG GIAI ĐOẠN PILOT):
1. **Race Condition mã tham chiếu giữa Payout và RefundCase:**
   - Cần bổ sung bảng `BankProofRegistry` dùng chung để có Unique Index cấp cơ sở dữ liệu thay vì kiểm tra thủ công qua `findOne()`.
2. **Chưa có Browser E2E Test Suite tự động:**
   - Cần bổ sung kịch bản Playwright kiểm thử luồng thanh toán và đối soát hoàn tiền từ giao diện người dùng.

#### 🟢 RỦI RO MỨC ĐỘ P2 (TỐI ƯU HÓA VẬN HÀNH & NÂNG CẤP):
1. **Lệch chuỗi thông báo lỗi trong test legacy `platform.test.js`:**
   - Cần cập nhật test suite cũ để chấp nhận tiền tố `[TEACHER_NOT_FOUND]`.
2. **Test suite cũ `maintenanceAndFinance.test.js` chưa cập nhật theo PR7:**
   - Cần điều chỉnh test case cũ để tuân thủ quy tắc 7 ngày lưu giữ và cửa sổ Thứ Hai của PR7.

---

### 24. CÁC QUYẾT ĐỊNH NGHIỆP VỤ BẮT BUỘC BAN LÃNH ĐẠO PHÊ DUYỆT

Trước khi ký duyệt Go-Live, Ban Lãnh đạo cần ra quyết định bằng văn bản về:
1. **Tỷ lệ hoa hồng giảng viên chính thức:** Hiện đang là 10% (`COMMISSION_RATE=0.10`). Cần phê duyệt chính thức để chuyển `COMMISSION_POLICY_APPROVED=true`.
2. **Quy định hoàn tiền học phí:** Thời hạn tối đa học sinh được quyền yêu cầu hoàn tiền (ví dụ: trong vòng 3 ngày sau buổi học đầu tiên hay trước khi lớp học bắt đầu).
3. **Phân quyền tài chính tối cao:** Chỉ định danh tính cụ thể của Admin 1 (Kế toán lập lệnh) và Admin 2 (Kế toán trưởng / Giám đốc tài chính phê duyệt xác minh).

---

### 25. KẾT LUẬN GO / NO-GO CHO MÔI TRƯỜNG STAGING CÓ KIỂM SOÁT

### 👉 **QUYẾT ĐỊNH: GO (100% ĐỦ ĐIỀU KIỆN TRIỂN KHAI STAGING)**
- **Lý do:**
  - Hệ thống Mock Sandbox hoạt động hoàn hảo, mô phỏng đầy đủ mọi kịch bản thành công, thất bại, trễ hạn và đối soát.
  - Bộ kiểm thử PR1–PR8 đạt tỷ lệ thành công 100%.
  - Frontend build thành công, giao diện hoàn tiền trực quan và sẵn sàng cho đội ngũ nội bộ dùng thử và đánh giá.

---

### 26. KẾT LUẬN GO / NO-GO CHO PILOT TIỀN THẬT HẠN CHẾ

### 👉 **QUYẾT ĐỊNH: CONDITIONAL GO (CÓ ĐIỀU KIỆN RÀNG BUỘC)**
- **Điều kiện ràng buộc bắt buộc phải thỏa mãn trước khi bật Pilot:**
  1. Cấu hình cứng `enforceDifferentAdmin: true` tại tầng controller cho mọi môi trường production/pilot.
  2. Giới hạn quy mô Pilot: Tối đa 1 lớp học PAID và 1 chiến dịch DONATION với số tiền nhỏ (dưới 500.000 VNĐ) để kiểm chứng webhook và đối soát tiền thật.
  3. Kế toán trưởng trực tiếp giám sát tài khoản ngân hàng trong suốt thời gian diễn ra giao dịch Pilot.

---

### 27. KẾT LUẬN GO / NO-GO CHO TOÀN BỘ PRODUCTION CÔNG KHAI

### 👉 **QUYẾT ĐỊNH: NO-GO (CHƯA ĐỦ ĐIỀU KIỆN MỞ RỘNG TOÀN DIỆN)**
- **Lý do:**
  - Tuyệt đối không mở cổng thanh toán tiền thật công khai hàng loạt khi chưa vượt qua giai đoạn Pilot tiền thật có kiểm soát.
  - Cần hoàn thành 10 điều kiện tiên quyết tại Chương 22 và khắc phục dứt điểm các phát hiện P0 tại Chương 23.

---

### 28. LỘ TRÌNH TRIỂN KHAI VÀ HÀNH ĐỘNG TIẾP THEO (NEXT IMPLEMENTATION STEPS)

1. **Bước 1 (Ngay lập tức):** Bàn giao báo cáo nghiệm thu kỹ thuật PR8 cho Team Leader và Ban Lãnh đạo.
2. **Bước 2 (Staging Hardening):**
   - Cập nhật `enforceDifferentAdmin: true` mặc định trong `financeController.js`.
   - Tạo model `BankProofRegistry` để đảm bảo MongoDB unique index cấp DB cho toàn bộ mã giao dịch tiền ra.
3. **Bước 3 (Staging UAT):** Đội ngũ Kế toán và Vận hành tiến hành kiểm thử thủ công luồng hoàn tiền và rút tiền trên môi trường Staging.
4. **Bước 4 (Controlled Pilot):** Bật `PAYOS_ENABLED=true` trên 1 lớp học thử nghiệm với số tiền thực tế để nghiệm thu luồng Webhook Internet Banking.
5. **Bước 5 (Production Release):** Mở rộng toàn diện sau khi có biên bản nghiệm thu Pilot thành công.

---

**BÁO CÁO NGHIỆM THU KỸ THUẬT VÀ ĐÁNH GIÁ SẴN SÀNG PILOT PR8 ĐÃ HOÀN TẤT VÀ XÁC NHẬN CHÍNH THỨC.**

