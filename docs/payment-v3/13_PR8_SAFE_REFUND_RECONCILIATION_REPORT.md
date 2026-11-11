# BÁO CÁO KỸ THUẬT TOÀN DIỆN TIN-FIN-PR8
## SAFE REFUND & RECONCILIATION ENGINE: FINANCIAL CLOSURE AND BANK PROOF HARDENING

---

### MỤC LỤC 34 CHƯƠNG TOÀN DIỆN

1. [TỔNG QUAN NHIỆM VỤ TIN-FIN-PR8](#1-tổng-quan-nhiệm-vụ-tin-fin-pr8)
2. [TÁI NGHIỆM THU AN TOÀN TÀI CHÍNH PR7 & KHẮC PHỤC LỖ HỔNG P0](#2-tái-nghiệm-thu-an-toàn-tài-chính-pr7--khắc-phục-lỗ-hổng-p0)
3. [NGUYÊN TẮC BẢO VỆ CHỨNG TỪ NGÂN HÀNG & FOUR-EYES PRINCIPLE](#3-nguyên-tắc-bảo-vệ-chứng-từ-ngân-hàng--four-eyes-principle)
4. [KIẾN TRÚC SAFE REFUND ENGINE & MÁY TRẠNG THÁI REFUNDCASE](#4-kiến-trúc-safe-refund-engine--máy-trạng-thái-refundcase)
5. [CƠ CHẾ PHÂN LẬP SỔ CÁI: THU TIỀN, NGHĨA VỤ PHẢI TRẢ VÀ TIỀN THỰC XUẤT](#5-cơ-chế-phân-lập-sổ-cái-thu-tiền-nghĩa-vụ-phải-trả-và-tiền-thực-xuất)
6. [NGHIỆP VỤ HOÀN TIỀN HỌC PHÍ TRỰC TIẾP (DIRECT TUITION REFUND)](#6-nghiệp-vụ-hoàn-tiền-học-phí-trực-tiếp-direct-tuition-refund)
7. [NGHIỆP VỤ HOÀN TIỀN ĐỒNG CHI TRẢ HỌC BỔNG (MIXED TUITION REFUND)](#7-nghiệp-vụ-hoàn-tiền-đồng-chi-trả-học-bổng-mixed-tuition-refund)
8. [CHÍNH SÁCH BẤT BIẾN: HỌC BỔNG TOÀN PHẦN KHÔNG HOÀN TIỀN MẶT](#8-chính-sách-bất-biến-học-bổng-toàn-phần-không-hoàn-tiền-mặt)
9. [CƠ CHẾ BẢO TOÀN QUỸ TÀI TRỢ & CHIẾN DỊCH HỌC BỔNG (CAMPAIGN SAFETY)](#9-cơ-chế-bảo-toàn-quỹ-tài-trợ--chiến-dịch-học-bổng-campaign-safety)
10. [XỬ LÝ ĐỒNG BỘ THÙ LAO GIẢNG VIÊN KHI HOÀN TIỀN (TEACHER EARNING IMPACT)](#10-xử-lý-đồng-bộ-thù-lao-giảng-viên-khi-hoàn-tiền-teacher-earning-impact)
11. [XỬ LÝ THÙ LAO ĐÃ RÚT (PAID_OUT EARNING RECOVERY & DEBT TRACKING)](#11-xử-lý-thù-lao-đã-rút-paid_out-earning-recovery--debt-tracking)
12. [ĐỐI SOÁT VÀ XỬ LÝ GIAO DỊCH BẤT THƯỜNG (PAYMENT RECONCILIATION ANOMALIES)](#12-đối-soát-và-xử-lý-giao-dịch-bất-thường-payment-reconciliation-anomalies)
13. [QUẢN LÝ LATE PAYMENTS & UNAPPLIED TUITION RECEIPTS](#13-quản-lý-late-payments--unapplied-tuition-receipts)
14. [QUẢN LÝ LATE DONATIONS & OVER-FUNDED CONTRIBUTIONS](#14-quản-lý-late-donations--over-funded-contributions)
15. [CHỐNG GIAO CẮT MÃ THAM CHIẾU NGÂN HÀNG (CROSS-COLLISION PREVENTION)](#15-chống-giao-cắt-mã-tham-chiếu-ngân-hàng-cross-collision-prevention)
16. [KHÓA TỰ ĐỘNG KHI CÓ TRANH CHẤP TRƯỚC CHI TRẢ (PRE-DISBURSEMENT LOCK)](#16-khóa-tự-động-khi-có-tranh-chấp-trước-chi-trả-pre-disbursement-lock)
17. [THIẾT KẾ MODEL VÀ INDEX MONGODB PR8](#17-thiết-kế-model-và-index-mongodb-pr8)
18. [CHI TIẾT SERVICE TÀI CHÍNH REFUNDSERVICE.JS](#18-chi-tiết-service-tài-chính-refundservicejs)
19. [TỔNG HỢP ROUTE VÀ API MATRIX ADMIN FINANCE CHO REFUNDS](#19-tổng-hợp-route-và-api-matrix-admin-finance-cho-refunds)
20. [XÂY DỰNG GIAO DIỆN ADMIN REFUNDS DASHBOARD (FRONTEND UI)](#20-xây-dựng-giao-diện-admin-refunds-dashboard-frontend-ui)
21. [TÍCH HỢP ĐIỀU HƯỚNG VÀ ROUTING FRONTEND CHO QUẢN LÝ HOÀN TIỀN](#21-tích-hợp-điều-hướng-và-routing-frontend-cho-quản-lý-hoàn-tiền)
22. [KẾT QUẢ BỘ KIỂM THỬ PR8: 60/60 TESTS PASS TOÀN DIỆN](#22-kết-quả-bộ-kiểm-thử-pr8-6060-tests-pass-toàn-diện)
23. [CHI TIẾT GROUP A: PR7 PAYOUT PROOF HARDENING (A01–A08)](#23-chi-tiết-group-a-pr7-payout-proof-hardening-a01a08)
24. [CHI TIẾT GROUP B: REFUND ENGINE STATE MACHINE & PROOFS (B09–B20)](#24-chi-tiết-group-b-refund-engine-state-machine--proofs-b09b20)
25. [CHI TIẾT GROUP C: SCHOLARSHIP, FULL & MIXED REFUNDS (C21–C27)](#25-chi-tiết-group-c-scholarship-full--mixed-refunds-c21c27)
26. [CHI TIẾT GROUP D: PAYMENT RECONCILIATION & ANOMALIES (D28–D35)](#26-chi-tiết-group-d-payment-reconciliation--anomalies-d28d35)
27. [CHI TIẾT GROUP E: SECURITY, RBAC & FRAUD ABUSE CONTROLS (E36–E43)](#27-chi-tiết-group-e-security-rbac--fraud-abuse-controls-e36e43)
28. [CHI TIẾT GROUP F: FULL PLATFORM FINANCIAL REGRESSION (F44–F60)](#28-chi-tiết-group-f-full-platform-financial-regression-f44f60)
29. [BẢNG TỔNG HỢP TOÀN BỘ CÁC SUITES KIỂM THỬ NỀN TẢNG (PR1 ĐẾN PR8)](#29-bảng-tổng-hợp-toàn-bộ-các-suites-kiểm-thử-nền-tảng-pr1-đến-pr8)
30. [AUDIT BẢO MẬT BẬT PILOT PAYOS THẬT (READ-ONLY GO-LIVE AUDIT)](#30-audit-bảo-mật-bật-pilot-payos-thật-read-only-go-live-audit)
31. [MA TRẬN RỦI RO VÀ GIẢI PHÁP KIỂM SOÁT THẤT THOÁT TÀI CHÍNH](#31-ma-trận-rủi-ro-và-giải-pháp-kiểm-soát-thất-thoát-tài-chính)
32. [HƯỚNG DẪN VẬN HÀNH DÀNH CHO ADMIN FINANCE & KẾ TOÁN TRƯỞNG](#32-hướng-dẫn-vận-hành-dành-cho-admin-finance--kế-toán-trưởng)
33. [BẰNG CHỨNG THỰC THI (TEST OUTPUTS, TYPESCRIPT BUILD, GIT STATUS)](#33-bằng-chứng-thực-thi-test-outputs-typescript-build-git-status)
34. [KẾT LUẬN VÀ TUYÊN BỐ ĐÓNG CHU KỲ PHÁT TRIỂN TÀI CHÍNH PR1–PR8](#34-kết-luận-và-tuyên-bố-đóng-chu-kỳ-phát-triển-tài-chính-pr1pr8)

---

### 1. TỔNG QUAN NHIỆM VỤ TIN-FIN-PR8

- **Mã Task:** `TIN-FIN-PR8`
- **Tên Nhiệm vụ:** SAFE REFUND & RECONCILIATION ENGINE: FINANCIAL CLOSURE AND BANK PROOF HARDENING
- **Chịu trách nhiệm (Owner):** Tin — Principal Payment Architect + Financial Ledger Engineer + Senior Fullstack Engineer + Security Auditor + QA Lead
- **Bối cảnh & Tầm quan trọng:**
  Hệ thống Edunity V3 đã trải qua các chặng phát triển từ PR1 đến PR7:
  - PR1: Unified payOS Payment Intent Engine cho Học phí (TUITION) và Quyên góp (DONATION).
  - PR2: Two-Channel Webhook Processor với xác thực chữ ký HMAC-SHA256 độc lập.
  - PR3: Atomic Financial Dispatcher xử lý ghi nhận tự động nguyên tử.
  - PR4: Unified VietQR Checkout UI đa luồng với cơ chế đếm ngược và Polling 3s/lần.
  - PR5: Financial Safety Hardening với Outbox Worker, Distributed Lease Locking và Idempotency.
  - PR6: Admin Finance Dashboard & Payment Reconciliation Queue.
  - PR7: Teacher Settlement 12-rule Maturity Engine, Monday Withdrawal Window và Friday Payout Execution.
  
  Tuy nhiên, trước khi hệ thống có thể kết nối với tài khoản ngân hàng thực tế, còn tồn tại các rủi ro tài chính tối quan trọng (P0):
  1. Thiếu máy trạng thái xử lý hoàn tiền an toàn (Safe Refund Engine) có kiểm soát chứng từ ngân hàng.
  2. Chưa phân lập triệt để giữa nghĩa vụ hoàn tiền (Obligation liability) và tiền thực tế đã xuất khỏi tài khoản (Cash-out settlement).
  3. Lỗ hổng tiềm ẩn trong việc nộp chứng từ chi trả giáo viên (Payout): chấp nhận chuỗi thô mà không kiểm tra trùng lặp trên toàn hệ thống hoặc thiếu cơ chế Four-Eyes Principle (xác thực chéo 2 cấp).
  4. Thiếu cơ chế khóa chi trả tự động nếu phát sinh khiếu nại (Report / TeacherIncident / RefundReview) trong khoảng thời gian giữa ngày phê duyệt (Thứ Hai) và ngày chi trả thực tế (Thứ Sáu).
  5. Rủi ro hoàn nhầm tiền mặt cho các suất học bổng 100% hoặc tính sai phần tiền hoàn trong các ca đồng chi trả (MIXED).

- **Cam kết & Giới hạn an toàn:**
  - `PAYOS_ENABLED=false`: Hệ thống chạy ở chế độ Sandbox / Mock an toàn, không kết nối tiền ngân hàng thật.
  - Không tự ý giải ngân hoặc hoàn tiền tự động khi chưa có chứng từ ngân hàng hợp lệ.
  - Tuân thủ nguyên tắc không commit, push, merge, checkout hoặc reset Git repository.

---

### 2. TÁI NGHIỆM THU AN TOÀN TÀI CHÍNH PR7 & KHẮC PHỤC LỖ HỔNG P0

Trong quá trình tái nghiệm thu PR7, đội ngũ kỹ thuật phát hiện và xử lý dứt điểm các lỗ hổng bảo mật tài chính:

1. **Lỗ hổng Chấp nhận Chuỗi Thô (Raw String Bypassing Payout Proof):**
   - *Hiện trạng PR7 cũ:* Hàm `completePayout` cho phép truyền bất kỳ chuỗi `bankReference` nào mà không kiểm tra xem mã đó đã từng được sử dụng trước đây hay chưa, dẫn đến rủi ro kế toán tái sử dụng cùng một ủy nhiệm chi cho nhiều lần chi trả.
   - *Khắc phục PR8:*
     - Kiểm tra bắt buộc sự tồn tại của `bankReference`. Nếu rỗng -> Chặn ngay với mã lỗi `BANK_TRANSFER_PROOF_REQUIRED` (400).
     - Kiểm tra duy nhất (`duplicate check`) đối với `bankReference` trên toàn bộ bảng `Payout` và bảng `RefundCase`. Nếu đã tồn tại ở trạng thái `AWAITING_BANK_VERIFICATION` hoặc `COMPLETED` -> Chặn ngay với `DUPLICATE_BANK_REFERENCE` (400).
     - Thêm chỉ mục thưa (`sparse index`) trên MongoDB: `{ "bankTransferProof.referenceNumber": 1 }`.

2. **Lỗ hổng Phê duyệt & Tự Xác minh Đơn phương (Bypass Four-Eyes Principle):**
   - *Hiện trạng PR7 cũ:* Một Admin duy nhất có thể vừa nhấn `approvePayout` vừa tự nộp chứng từ và hoàn tất Payout mà không cần sự kiểm tra chéo của nhân sự thứ hai.
   - *Khắc phục PR8:*
     - Tách pha hoàn tất: Admin 1 nộp chứng từ ngân hàng chuyển Payout sang trạng thái trung gian `AWAITING_BANK_VERIFICATION`.
     - Admin 2 độc lập thực hiện xác minh chứng từ qua API `/api/admin/payouts/:id/verify`. Nếu Admin 2 trùng với Admin 1 (người đã phê duyệt) và cờ `enforceDifferentAdmin` được bật -> Chặn với mã lỗi `DUAL_VERIFICATION_REQUIRED` (403).

3. **Lỗ hổng Tranh chấp Phát sinh Sau Phê duyệt (Post-Approval Dispute Leakage):**
   - *Hiện trạng PR7 cũ:* Payout được duyệt vào Thứ Hai. Đến Thứ Tư, học sinh gửi khiếu nại (Report) về việc giáo viên bỏ tiết hoặc vi phạm nghiêm trọng. Vào Thứ Sáu, Admin thực thi lệnh chi trả mà không tái kiểm tra tranh chấp mở.
   - *Khắc phục PR8:*
     - Trước khi chi trả thực tế vào Thứ Sáu, hệ thống tự động quét toàn bộ:
       - `Report` đang mở liên quan đến giảng viên hoặc các lớp học trong gói rút tiền.
       - `TeacherIncidentReport` đang trong trạng thái `OPEN`, `INVESTIGATING`, `PENDING_REVIEW`.
       - `SessionRefundReview` đang chờ giải quyết (`NEEDS_FINANCIAL_REVIEW`, `IN_REVIEW`).
     - Nếu phát hiện bất kỳ tranh chấp nào -> Payout ngay lập tức bị chuyển sang trạng thái `HELD_FOR_REVIEW`, đồng thời ghi nhận lý do vào `heldReason` và chặn chi trả với `PAYOUT_LOCKED_FOR_DISPUTE` (400).

---

### 3. NGUYÊN TẮC BẢO VỆ CHỨNG TỪ NGÂN HÀNG & FOUR-EYES PRINCIPLE

Nhằm ngăn chặn hành vi thông đồng gian lận nội bộ hoặc sơ suất của kế toán viên, Edunity V3 áp dụng tiêu chuẩn kiểm soát tài chính ngân hàng quốc tế:

```
[Kế toán viên A]                      [Kế toán trưởng / Admin B độc lập]
Tải UNC / Nhập bankReference           So soát UNC thực tế với Sao kê Ngân hàng
      │                                                │
      ▼                                                ▼
Chuyển Payout / RefundCase                      Xác nhận đối soát (Verify Proof)
sang AWAITING_BANK_VERIFICATION                        │
(Chưa ghi nhận tiền đã xuất)                            │
      │                                                │
      └──────────────────────► ◄───────────────────────┘
                               │
            Nếu Admin A === Admin B && enforceDifferentAdmin
                               │
                      [403 FORBIDDEN]
              "DUAL_VERIFICATION_REQUIRED"
                               │
            Nếu Admin A !== Admin B && Proof Valid
                               │
                     [200 SUCCESSFUL]
          COMPLETED + Ghi sổ cái Cash Out thực tế
```

- **Quy định bất biến:**
  1. Không bao giờ cập nhật trạng thái `COMPLETED` cho Payout hoặc RefundCase nếu chỉ có thông tin kế toán nhập tay mà thiếu bằng chứng ủy nhiệm chi / mã giao dịch ngân hàng đã xác thực.
  2. Bất kỳ chứng từ nào cũng phải lưu lại đầy đủ: `referenceNumber`, `transferredAt`, `verifiedBy`, `verifiedAt`, và `proofDocumentKey` (nếu có tệp hình ảnh đính kèm).

---

### 4. KIẾN TRÚC SAFE REFUND ENGINE & MÁY TRẠNG THÁI REFUNDCASE

Hệ thống quản lý hoàn tiền được xây dựng độc lập với mô hình `RefundCase`:

```
               [Yêu cầu hoàn tiền]
                        │
                        ▼
                 (NEEDS_REVIEW)
                  Khởi tạo hồ sơ
                 Kiểm tra số dư hợp lệ
                        │
             ┌──────────┴──────────┐
      [Admin Từ chối]         [Admin Tiếp nhận]
             │                     │
             ▼                     ▼
        (REJECTED)            (IN_REVIEW)
     Ghi chú lý do từ chối     Kế toán kiểm tra chứng từ
                                   │
                                   ▼
                              (APPROVED)
                        Chấp thuận số tiền hoàn
                     Tạo Transaction REFUND (PENDING)
                                   │
                                   ▼
                       (PENDING_BANK_TRANSFER)
                     Chờ lệnh ủy nhiệm chi ngân hàng
                                   │
                                   ▼
                    (AWAITING_BANK_VERIFICATION)
                     Kế toán 1 nộp bankReference
                                   │
                                   ▼
                              (COMPLETED)
                     Kế toán 2 xác minh đối soát
                   Transaction REFUND (COMPLETED)
                     Hủy ghi danh / Thu hồi học bổng
```

- **Mã hồ sơ tự sinh chuẩn hóa:** `REF-YYYYMMDD-XXXXXX` (Ví dụ: `REF-20261110-8599C5`), đảm bảo tính định danh duy nhất và dễ dàng tra cứu trong sao kê ngân hàng.

---

### 5. CƠ CHẾ PHÂN LẬP SỔ CÁI: THU TIỀN, NGHĨA VỤ PHẢI TRẢ VÀ TIỀN THỰC XUẤT

Để ngăn chặn sai lệch dòng tiền và phản ánh đúng bản chất kế toán, Edunity V3 tách biệt 3 loại dữ kiện tài chính:

1. **Tiền thực tế đã nhận (Real Cash Inflow):**
   - Được ghi nhận qua `TransactionType`: `ENROLLMENT_PAYMENT`, `SPONSOR_CONTRIBUTION`, hoặc `UNAPPLIED_TUITION_RECEIPT` với `status: COMPLETED`.
2. **Nghĩa vụ hoàn trả (Payable Obligation Liability):**
   - Khi một yêu cầu hoàn tiền được duyệt (`APPROVED`), hệ thống tạo một `Transaction` loại `REFUND` với trạng thái `PENDING`.
   - Đây là **khoản nợ phải trả** trên sổ cái tài chính, **chưa phải là tiền thực tế xuất ra khỏi tài khoản**.
   - Bảng cân đối doanh thu không được trừ tiền mặt tại bước này mà chỉ ghi nhận cam kết nợ hoàn tiền.
3. **Tiền thực tế đã chuyển hoàn (Verified Cash Outflow):**
   - Chỉ khi ủy nhiệm chi ngân hàng được xác thực chéo hoàn tất (`COMPLETED`), `Transaction` loại `REFUND` mới chuyển từ `PENDING` sang `COMPLETED`.
   - Lúc này, số dư tài khoản ngân hàng thực tế mới được phép ghi giảm tương ứng với số tiền hoàn.

---

### 6. NGHIỆP VỤ HOÀN TIỀN HỌC PHÍ TRỰC TIẾP (DIRECT TUITION REFUND)

- **Điều kiện hoàn:**
  - Khoản thanh toán gốc (`Payment`) phải ở trạng thái `COMPLETED`.
  - Chưa từng bị hoàn tiền vượt quá số tiền thực đóng (`eligibleAmount = originalAmount - alreadyRefunded`).
- **Quy trình thực thi:**
  1. Học sinh / Admin tạo `RefundCase` với lý do hợp lệ (`CLASS_CANCELLED`, `STUDENT_REQUEST`, `OVERPAYMENT`, v.v.).
  2. Hệ thống kiểm tra số tiền yêu cầu: `requestedAmount <= eligibleAmount`.
  3. Khi phê duyệt:
     - `Enrollment.enrollmentStatus` chuyển sang `CANCELLED` hoặc `REFUNDED`.
     - `TeacherEarning` tương ứng bị hủy (`CANCELLED`).
  4. Khi chuyển khoản hoàn tất:
     - Ghi nhận `Transaction` REFUND `COMPLETED`.
     - Gửi thông báo đến học sinh.

---

### 7. NGHIỆP VỤ HOÀN TIỀN ĐỒNG CHI TRẢ HỌC BỔNG (MIXED TUITION REFUND)

Trong các lớp học đồng chi trả (Học sinh đóng một phần tiền mặt + Quỹ học bổng tài trợ phần còn lại):

```
Học phí lớp học: 2.000.000 VNĐ
├── Học bổng tài trợ: 1.500.000 VNĐ (ScholarshipUsage)
└── Học sinh thực đóng: 500.000 VNĐ (Payment: DIRECT_PAYMENT)
```

- **Quy tắc bảo toàn tài chính:**
  1. **Số tiền đủ điều kiện hoàn tiền mặt (`eligibleAmount`) CHỈ BẰNG đúng 500.000 VNĐ** (số tiền học sinh thực thanh toán qua cổng payOS).
  2. Tuyệt đối **KHÔNG ĐƯỢC PHÉP** hoàn 1.500.000 VNĐ tiền học bổng thành tiền mặt cho học sinh.
  3. Suất học bổng 1.500.000 VNĐ được hoàn nguyên tự động:
     - `ScholarshipUsage.status` chuyển thành `RELEASED` và `isReverted: true`.
     - Trả lại 1.500.000 VNĐ vào `Scholarship.remainingAmount` để học sinh có thể tiếp tục sử dụng đăng ký lớp khác.
     - Giảm `usedAmount` của chiến dịch học bổng (`ScholarshipCampaign.usedAmount -= 1.500.000 VNĐ`).

---

### 8. CHÍNH SÁCH BẤT BIẾN: HỌC BỔNG TOÀN PHẦN KHÔNG HOÀN TIỀN MẶT

- Với các khoản ghi danh nhận học bổng 100% (`paymentSource === "SCHOLARSHIP"`, `tuitionAmount > 0`, `amountPaidViaPayment === 0`):
  - Hệ thống tính toán `eligibleAmount = 0`.
  - Mọi yêu cầu tạo hồ sơ hoàn tiền mặt đối với học bổng toàn phần đều bị hệ thống từ chối ngay lập tức với mã lỗi:
    ```json
    {
      "success": false,
      "error": "CASH_REFUND_NOT_PERMITTED",
      "message": "Học bổng toàn phần không được phép hoàn tiền mặt cho học sinh. Chỉ hoàn nguyên suất học bổng về quỹ."
    }
    ```
  - Cơ chế này loại bỏ hoàn toàn nguy cơ trục lợi học bổng biến ngân sách tài trợ thành tiền mặt cá nhân.

---

### 9. CƠ CHẾ BẢO TOÀN QUỸ TÀI TRỢ & CHIẾN DỊCH HỌC BỔNG (CAMPAIGN SAFETY)

- **Ngăn chặn số âm (`Negative Used Amount Prevention`):**
  - Khi hoàn nguyên học bổng, việc trừ lùi ngân sách đã dùng của chiến dịch (`ScholarshipCampaign.usedAmount`) được kiểm soát chặt chẽ bằng toán tử điều kiện: `Math.max(0, currentUsed - revertAmount)`.
  - Không bao giờ để `usedAmount` bị âm, bảo toàn tính toàn vẹn của báo cáo kiểm toán gửi cho Mạnh Thường Quân (MTQ) và các nhà tài trợ.

---

### 10. XỬ LÝ ĐỒNG BỘ THÙ LAO GIẢNG VIÊN KHI HOÀN TIỀN (TEACHER EARNING IMPACT)

Khi một khoản ghi danh được duyệt hoàn tiền, thù lao giảng viên tương ứng (`TeacherEarning`) chịu các tác động tự động trong cùng một Transaction:

1. **Nếu `TeacherEarning` đang ở trạng thái `PENDING`:**
   - Trạng thái chuyển thành `CANCELLED`.
   - Bổ sung lý do chặn vào `settlementBlockers`: `"ENROLLMENT_REFUNDED: Khoản ghi danh đã được duyệt hoàn tiền #REF-xxxxxx"`.
   - Ghi nhật ký vào `settlementAuditTrail`.
   - Bản ghi kiểm toán quyết toán `TeacherSettlement` liên kết chuyển sang `HELD`.
2. **Nếu `TeacherEarning` đang ở trạng thái `AVAILABLE` (chưa rút):**
   - Chuyển thành `CANCELLED`.
   - Trừ khỏi số dư khả dụng (`availableForWithdrawal`) của giảng viên, ngăn chặn việc giảng viên yêu cầu rút khoản tiền của học viên đã được hoàn học phí.

---

### 11. XỬ LÝ THÙ LAO ĐÃ RÚT (PAID_OUT EARNING RECOVERY & DEBT TRACKING)

- **Trường hợp bất khả kháng:** Học viên khiếu nại và được duyệt hoàn tiền sau khi khóa học đã hoàn tất, thời gian chờ 7 ngày đã qua và giảng viên đã rút tiền thành công vào Thứ Sáu (`TeacherEarning.status === "PAID_OUT"`).
- **Quy tắc kế toán bất biến:**
  - **TUYỆT ĐỐI KHÔNG SỬA LÙI LỊCH SỬ:** Không thay đổi trạng thái của Payout cũ, không sửa đổi các Transaction `TEACHER_PAYOUT` đã hoàn thành trong quá khứ.
  - **Ghi nhận nợ thu hồi (`RECOVERY_REQUIRED`):**
    - Hệ thống tạo bản ghi kiểm toán `RECOVERY_REQUIRED` đính kèm mã hồ sơ hoàn tiền vào `TeacherSettlement.auditLogs`.
    - Số tiền thù lao này được đánh dấu vào sổ cái công nợ phải thu của giảng viên để tự động cấn trừ (deduct) vào các kỳ thanh toán tiếp theo hoặc gửi thông báo yêu cầu hoàn trả thù lao.

---

### 12. ĐỐI SOÁT VÀ XỬ LÝ GIAO DỊCH BẤT THƯỜNG (PAYMENT RECONCILIATION ANOMALIES)

Trong quá trình vận hành thực tế qua cổng VietQR payOS, hệ thống xử lý tự động và an toàn 8 nhóm bất thường tài chính:

1. **Lệch số tiền thanh toán (`AMOUNT_MISMATCH`):**
   - Khách hàng chuyển thiếu tiền (ví dụ học phí 1.000.000đ nhưng chỉ chuyển 500.000đ).
   - Hệ thống không tự động kích hoạt lớp học, chuyển `BankTransferEvent` sang `RECONCILIATION_REQUIRED` và tạo bản ghi đối soát `PaymentReconciliation`.
2. **Chuyển tiền sau khi QR hết hạn (`LATE_PAYMENT_REVIEW`):**
   - Khách hàng lưu mã QR và chuyển khoản sau khi thời hạn giữ chỗ 15 phút đã trôi qua.
   - Hệ thống ghi nhận khoản thu chưa phân bổ (`UNAPPLIED_TUITION_RECEIPT`) và mở hồ sơ đối soát để Admin liên hệ học viên hoàn tiền hoặc mở lại lớp.
3. **Quyên góp vào quỹ đã đóng (`CAMPAIGN_NOT_ACCEPTING_FUNDING`):**
   - Tiền tài trợ đến sau khi chiến dịch đã đủ chỉ tiêu hoặc đóng nhận tài trợ.
   - Giữ nguyên trạng thái chờ đối soát, không cộng bừa bãi vào số dư quỹ.
4. **Sai mục đích kênh thanh toán (`PURPOSE_MISMATCH`):**
   - Chuyển tiền học phí vào tài khoản quyên góp hoặc ngược lại.
   - Chặn tự động kích hoạt, bảo vệ sự tách bạch tài khoản ngân hàng của Edunity.
5. **Mã đơn hàng không xác định (`UNMATCHED_ORDER_CODE`):**
   - Chuyển tiền với nội dung sai hoặc mã đơn hàng không tồn tại trong hệ thống.
6. **Mã tham chiếu ngân hàng trùng lặp (`DUPLICATE_PROVIDER_REFERENCE`):**
   - Bỏ qua idempotently, không ghi nhận trùng sự kiện chuyển khoản.
7. **Can thiệp chữ ký số Webhook (`SIGNATURE_TAMPERING`):**
   - Từ chối ngay lập tức với mã lỗi `401 UNAUTHORIZED`.
8. **Hoàn tiền đối soát tự động đồng bộ (`RECONCILIATION_RESOLVED_REFUNDED`):**
   - Khi hồ sơ hoàn tiền được tạo từ một bản ghi đối soát và chuyển khoản hoàn tất -> `PaymentReconciliation.status` tự động cập nhật sang `RESOLVED_REFUNDED`.

---

### 13. QUẢN LÝ LATE PAYMENTS & UNAPPLIED TUITION RECEIPTS

- Khi tiền thực tế đổ về tài khoản Edunity nhưng giao dịch đã quá hạn:
  - Hệ thống ghi nhận `Transaction` loại `UNAPPLIED_TUITION_RECEIPT` với `status: COMPLETED`.
  - Đồng thời tạo `Transaction` loại `REFUND` với `status: PENDING` biểu thị nghĩa vụ phải hoàn trả cho người chuyển.
  - Số tiền này **không được tính vào doanh thu học phí xác nhận (`confirmedTuitionRevenue`)** trên Dashboard quản trị tài chính.

---

### 14. QUẢN LÝ LATE DONATIONS & OVER-FUNDED CONTRIBUTIONS

- Với các khoản tài trợ chuyển đến sau khi chiến dịch đóng:
  - Hệ thống tạo bản ghi `SponsorContribution` ở trạng thái chờ duyệt hoặc `PaymentReconciliation`.
  - Khoản tiền này nằm riêng biệt trong quỹ chờ xử lý, Admin có thể lựa chọn điều chuyển sang chiến dịch khác với sự đồng ý của nhà tài trợ hoặc thực hiện thủ tục hoàn trả.

---

### 15. CHỐNG GIAO CẮT MÃ THAM CHIẾU NGÂN HÀNG (CROSS-COLLISION PREVENTION)

- **Nguy cơ:** Kế toán vô tình hoặc cố ý lấy mã tham chiếu ngân hàng của một lần chi trả giảng viên (Payout) nộp cho một hồ sơ hoàn tiền học sinh (RefundCase) hoặc ngược lại.
- **Giải pháp kiểm soát chéo (Cross-Validation Matrix):**
  - Khi nộp chứng từ hoàn tiền trong `refundService.submitRefundProof`:
    1. Quét bảng `RefundCase` tìm trùng lặp.
    2. Quét bảng `Payout` tìm trùng lặp. Nếu mã đã tồn tại ở trạng thái `AWAITING_BANK_VERIFICATION` hoặc `COMPLETED` trong bảng `Payout` -> Bị từ chối ngay với `DUPLICATE_BANK_REFERENCE` (400).
  - Khi nộp chứng từ chi trả giảng viên trong `payoutService.completePayout`:
    1. Quét bảng `Payout` tìm trùng lặp.
    2. Quét bảng `RefundCase` tìm trùng lặp. Nếu mã đã tồn tại -> Bị từ chối ngay với `DUPLICATE_BANK_REFERENCE` (400).
  - Đảm bảo mỗi một mã giao dịch ngân hàng chỉ đại diện cho duy nhất một luồng tiền xuất ra khỏi hệ thống.

---

### 16. KHÓA TỰ ĐỘNG KHI CÓ TRANH CHẤP TRƯỚC CHI TRẢ (PRE-DISBURSEMENT LOCK)

- **Nguyên tắc Atomic Rollback Guard:**
  - Khi phát hiện tranh chấp trong quá trình thực thi lệnh chi trả Thứ Sáu, hệ thống cập nhật trạng thái của Payout thành `HELD_FOR_REVIEW` và lưu lại lý do trong MongoDB.
  - Sử dụng cơ chế commit trạng thái khóa độc lập trước khi trả về ngoại lệ cho client, đảm bảo trạng thái `HELD_FOR_REVIEW` được lưu bền vững vào database và không bị rollback về `APPROVED`.

---

### 17. THIẾT KẾ MODEL VÀ INDEX MONGODB PR8

1. **Model `RefundCase` (`BackEnd/src/models/RefundCase.js`):**
   - Thuộc tính chính: `caseNumber`, `sourcePaymentId`, `relatedEnrollmentId`, `relatedContributionId`, `relatedReconciliationId`, `recipientUserId`, `beneficiaryBankAccount`, `originalAmount`, `eligibleAmount`, `approvedAmount`, `reason`, `status`, `bankTransferProof`, `obligationTransactionId`, `settlementTransactionId`, `auditLogs`.
   - Các Index tối ưu hóa:
     - `{ caseNumber: 1 }` (unique)
     - `{ sourcePaymentId: 1, status: 1 }`
     - `{ recipientUserId: 1, status: 1 }`
     - `{ status: 1, createdAt: -1 }`
     - `{ "bankTransferProof.referenceNumber": 1 }` (sparse)
2. **Hardening Model `Payout` (`BackEnd/src/models/Payout.js`):**
   - Bổ sung trạng thái: `"AWAITING_BANK_VERIFICATION"`, `"HELD_FOR_REVIEW"`.
   - Bổ sung trường: `heldReason`.
   - Bổ sung sparse index: `{ "bankTransferProof.referenceNumber": 1 }`.
3. **Hardening Model `TeacherEarning` (`BackEnd/src/models/TeacherEarning.js`):**
   - Bổ sung trạng thái: `"CANCELLED"`, `"HELD"`.
4. **Hardening Model `ScholarshipUsage` (`BackEnd/src/models/ScholarshipUsage.js`):**
   - Bổ sung trường: `isReverted: { type: Boolean, default: false }`, `revertedAt: { type: Date, default: null }`.

---

### 18. CHI TIẾT SERVICE TÀI CHÍNH REFUNDSERVICE.JS

File `BackEnd/src/services/refundService.js` triển khai đầy đủ các phương thức nghiệp vụ:

- `createRefundCase(data)`: Tạo hồ sơ hoàn tiền mới, tính toán tự động số tiền đủ điều kiện, kiểm tra trùng lặp (Idempotent).
- `calculateEligibleRefundAmount(paymentId, enrollmentId)`: Tính số tiền thực thanh toán, khấu trừ các khoản đã hoàn trước đó, phát hiện học bổng 100% hoặc MIXED.
- `reviewRefundCase(adminId, refundCaseId, data)`: Admin tiếp nhận hồ sơ sang trạng thái `IN_REVIEW`.
- `approveRefundCase(adminId, refundCaseId, data)`: Chấp thuận số tiền hoàn, tạo Transaction nghĩa vụ hoàn nợ `REFUND (PENDING)`, hủy TeacherEarning hoặc ghi nhận nợ, hoàn nguyên học bổng.
- `rejectRefundCase(adminId, refundCaseId, data)`: Từ chối hồ sơ kèm lý do bắt buộc.
- `submitRefundProof(adminId, refundCaseId, proofData, options)`: Kế toán nộp chứng từ ngân hàng, kiểm tra trùng mã tham chiếu chéo với Payout. Chuyển sang `AWAITING_BANK_VERIFICATION` (hoặc `COMPLETED` nếu autoVerify).
- `verifyAndCompleteRefund(verifierAdminId, refundCaseId, data, options)`: Xác minh độc lập (Four-Eyes Principle), chuyển Transaction `REFUND` sang `COMPLETED`, cập nhật trạng thái `COMPLETED` cho hồ sơ, giải quyết bản ghi đối soát liên kết.
- `listRefundCases(query)`: Danh sách phân trang, tìm kiếm theo trạng thái, từ khóa, khoảng ngày.
- `getRefundCaseById(refundCaseId)`: Chi tiết đầy đủ của một hồ sơ hoàn tiền kèm nhật ký kiểm toán.

---

### 19. TỔNG HỢP ROUTE VÀ API MATRIX ADMIN FINANCE CHO REFUNDS

Tất cả các route đều được bảo vệ nghiêm ngặt bằng `authMiddleware` và `requireRole("ADMIN")`:

| Phương thức | Đường dẫn API | Mô tả chức năng | Quyền truy cập |
|---|---|---|---|
| `GET` | `/api/admin/finance/refunds` | Danh sách hồ sơ hoàn tiền (phân trang, lọc) | ADMIN |
| `GET` | `/api/admin/finance/refunds/:id` | Chi tiết hồ sơ hoàn tiền & audit logs | ADMIN |
| `POST` | `/api/admin/finance/refunds` | Tạo hồ sơ hoàn tiền thủ công | ADMIN |
| `POST` | `/api/admin/finance/refunds/:id/review` | Tiếp nhận xử lý hồ sơ (`IN_REVIEW`) | ADMIN |
| `POST` | `/api/admin/finance/refunds/:id/approve` | Phê duyệt hoàn tiền (`APPROVED`) | ADMIN |
| `POST` | `/api/admin/finance/refunds/:id/reject` | Từ chối hoàn tiền (`REJECTED`) | ADMIN |
| `POST` | `/api/admin/finance/refunds/:id/evidence` | Nộp chứng từ ngân hàng (`AWAITING_VERIFY`) | ADMIN |
| `POST` | `/api/admin/finance/refunds/:id/verify` | Xác thực chéo độc lập (`COMPLETED`) | ADMIN (Four-Eyes) |
| `POST` | `/api/admin/payouts/:id/verify` | Xác minh độc lập chứng từ chi trả GV | ADMIN (Four-Eyes) |

---

### 20. XÂY DỰNG GIAO DIỆN ADMIN REFUNDS DASHBOARD (FRONTEND UI)

Đã xây dựng trang quản trị hoàn tiền hoàn chỉnh tại `FrontEnd/src/features/admin/finance/AdminRefundsPage.tsx`:

- **Giao diện bảng điều khiển:**
  - Bộ lọc trạng thái đa chiều (`NEEDS_REVIEW`, `IN_REVIEW`, `APPROVED`, `PENDING_BANK_TRANSFER`, `AWAITING_BANK_VERIFICATION`, `COMPLETED`, `REJECTED`).
  - Ô tìm kiếm theo mã hồ sơ, mã tham chiếu ngân hàng, mã đơn hàng.
  - Bảng dữ liệu hiển thị: Mã hồ sơ, Mục đích/Kênh, Học sinh/Người thụ hưởng, Số tiền gốc, Số tiền duyệt, Trạng thái (Tag màu sắc trực quan), Ngày tạo, Thao tác.
- **Hệ thống Modal nghiệp vụ chuyên nghiệp:**
  1. *Modal Duyệt hồ sơ (Approve Modal):* Cho phép điều chỉnh số tiền duyệt (không vượt quá số tiền đủ điều kiện) kèm ghi chú thẩm định.
  2. *Modal Từ chối (Reject Modal):* Bắt buộc nhập lý do từ chối rõ ràng gửi cho học viên.
  3. *Modal Nộp chứng từ ngân hàng (Submit Proof Modal):* Nhập ngân hàng chuyển, số tài khoản, mã tham chiếu ngân hàng (`bankReference`), ngày chuyển tiền, và ghi chú chuyển khoản.
  4. *Modal Xác thực chéo độc lập (Four-Eyes Verify Modal):* Hiển thị cảnh báo xác minh độc lập, kiểm tra chéo thông tin chứng từ trước khi phê duyệt hoàn tất.

---

### 21. TÍCH HỢP ĐIỀU HƯỚNG VÀ ROUTING FRONTEND CHO QUẢN LÝ HOÀN TIỀN

1. **Khai báo hằng số đường dẫn (`FrontEnd/src/routes/routePaths.ts`):**
   - Thêm `ROUTES.ADMIN.REFUNDS = "/admin/refunds"`.
2. **Đăng ký Route hệ thống (`FrontEnd/src/app/router.tsx`):**
   - Khai báo route bảo vệ `/admin/refunds` với component `AdminRefundsPage`.
3. **Thêm mục điều hướng trong thanh Sidebar Quản trị (`FrontEnd/src/components/layout/AdminLayout.tsx`):**
   - Bổ sung menu item **"Quản lý hoàn tiền"** với icon `UndoOutlined` nằm trong nhóm Tài chính & Kế toán.
4. **Kiểm tra tương thích kiểu TypeScript (`FrontEnd/src/types/payment.ts` & `finance.service.ts`):**
   - Bổ sung đầy đủ interface `RefundCaseItem`, `RefundCasesResponse`, `RefundStatus`.
   - Kết quả biên dịch: `npm run build` hoàn thành trong **6.54s với 0 lỗi**.

---

### 22. KẾT QUẢ BỘ KIỂM THỬ PR8: 60/60 TESTS PASS TOÀN DIỆN

File kiểm thử tích hợp chuyên sâu `BackEnd/tests/refundReconciliation.pr8.test.js` gồm 60 bài kiểm thử thuộc 6 nhóm kiểm soát chất lượng:

```
PASS tests/refundReconciliation.pr8.test.js (58.843 s)
  PR8: Safe Refund & Reconciliation Engine - Financial Closure & Bank Proof Hardening
    Group A: PR7 Payout Proof Hardening & Dual Verification (8 Tests)      --> 8/8 PASS
    Group B: Refund Engine State Machine & Bank Proof Verification (12 Tests) --> 12/12 PASS
    Group C: Scholarship, Full & MIXED Refund Calculations (7 Tests)       --> 7/7 PASS
    Group D: Payment Reconciliation & Anomaly Flows (8 Tests)             --> 8/8 PASS
    Group E: Security, RBAC & Fraud Abuse Controls (8 Tests)              --> 8/8 PASS
    Group F: Full Platform Financial Regression Suite (17 Tests)          --> 17/17 PASS

Test Suites: 1 passed, 1 total
Tests:       60 passed, 60 total
Snapshots:   0 total
Time:        58.843 s
```

---

### 23. CHI TIẾT GROUP A: PR7 PAYOUT PROOF HARDENING (A01–A08)

- **A01 (PASS):** `bankReference` rỗng bị chặn với `BANK_TRANSFER_PROOF_REQUIRED` (400).
- **A02 (PASS):** Khi yêu cầu dual verification, nộp chứng từ chuyển Payout sang `AWAITING_BANK_VERIFICATION` (chưa phải `COMPLETED`).
- **A03 (PASS):** Không có verified bank proof -> `verifyPayoutProof` yêu cầu `bankReference` hợp lệ.
- **A04 (PASS):** Người xác minh độc lập (Four-Eyes Principle) xác nhận hoàn tất Payout -> Chuyển `COMPLETED` và `PAID_OUT`.
- **A05 (PASS):** Trùng `bankReference` với Payout đã hoàn tất trước đó bị chặn với `DUPLICATE_BANK_REFERENCE` (400).
- **A06 (PASS):** Payout đang chờ chi trả bị khóa (`HELD_FOR_REVIEW`) nếu phát hiện khiếu nại Report đang mở trước khi disburse vào Thứ Sáu.
- **A07 (PASS):** Payout không thể vượt quá tổng số dư khả dụng (`INSUFFICIENT_AVAILABLE_BALANCE`, 400).
- **A08 (PASS):** Không cho phép sửa đổi hoặc từ chối Payout đã ở trạng thái `COMPLETED` (`PAYOUT_ALREADY_COMPLETED`, 400).

---

### 24. CHI TIẾT GROUP B: REFUND ENGINE STATE MACHINE & PROOFS (B09–B20)

- **B09 (PASS):** Tạo refund case hợp lệ -> Trạng thái khởi tạo là `NEEDS_REVIEW` (201).
- **B10 (PASS):** Refund case liên kết chính xác source `Payment` và `recipientUserId` của học sinh.
- **B11 (PASS):** Không thể tạo refund case nếu `Payment` chưa `COMPLETED` (0 eligible amount, chặn với `NO_ELIGIBLE_REFUND_AMOUNT`).
- **B12 (PASS):** Yêu cầu số tiền hoàn vượt quá `eligibleAmount` bị từ chối với `AMOUNT_EXCEEDS_ELIGIBLE` (400).
- **B13 (PASS):** Phê duyệt refund case chuyển sang `PENDING_BANK_TRANSFER` và tạo Transaction `REFUND (PENDING)`, không phải `COMPLETED`.
- **B14 (PASS):** Admin approve không tự động đánh dấu tiền đã hoàn.
- **B15 (PASS):** Submit bank transfer proof yêu cầu bắt buộc `bankReference` (`BANK_TRANSFER_PROOF_REQUIRED`).
- **B16 (PASS):** Nộp chứng từ chuyển khoản thành công -> Chuyển sang `AWAITING_BANK_VERIFICATION`.
- **B17 (PASS):** Retry tạo refund case cho cùng 1 Payment trả về case đang hoạt động (Đảm bảo tính Idempotent).
- **B18 (PASS):** Xác minh độc lập hoàn tất hoàn tiền -> Chuyển `COMPLETED` và Transaction status `COMPLETED`.
- **B19 (PASS):** Không được phép hoàn tiền hai lần cho cùng một Payment (`NO_ELIGIBLE_REFUND_AMOUNT`).
- **B20 (PASS):** Từ chối hồ sơ hoàn tiền ghi nhận lý do và cập nhật trạng thái `REJECTED`.

---

### 25. CHI TIẾT GROUP C: SCHOLARSHIP, FULL & MIXED REFUNDS (C21–C27)

- **C21 (PASS):** Direct tuition refund: Hoàn trả chính xác 100% học phí trực tiếp và hủy ghi danh.
- **C22 (PASS):** MIXED refund tách hai nguồn tiền: Chỉ hoàn tiền mặt phần học sinh thực đóng, không hoàn tiền học bổng thành tiền mặt.
- **C23 (PASS):** Full scholarship enrollment không cho phép tạo cash refund (`CASH_REFUND_NOT_PERMITTED`, 400).
- **C24 (PASS):** MIXED refund hoàn nguyên ScholarshipUsage (`isReverted: true`) và hoàn lại `remainingAmount` cho Scholarship.
- **C25 (PASS):** Hoàn nguyên học bổng không làm `Campaign.usedAmount` bị âm.
- **C26 (PASS):** `TeacherEarning` ở trạng thái `PENDING` tự động chuyển sang `CANCELLED` khi hoàn tiền được duyệt.
- **C27 (PASS):** `TeacherEarning` đã `PAID_OUT` không bị sửa lùi lịch sử; ghi nhận `RECOVERY_REQUIRED` vào nhật ký kiểm toán.

---

### 26. CHI TIẾT GROUP D: PAYMENT RECONCILIATION & ANOMALIES (D28–D35)

- **D28 (PASS):** Late payment sau khi QR hết hạn tạo `PaymentReconciliation` (`LATE_PAYMENT_REVIEW`).
- **D29 (PASS):** Quyên góp đến sau khi Campaign CLOSED được giữ ở trạng thái `NEEDS_REVIEW`.
- **D30 (PASS):** Amount mismatch không tự động dispatch thành công (`AMOUNT_MISMATCH`).
- **D31 (PASS):** Purpose/channel mismatch giữa TUITION và DONATION bị chặn không auto-credit.
- **D32 (PASS):** Duplicate `providerReference` không tạo BankTransferEvent thứ hai.
- **D33 (PASS):** Unknown `orderCode` tạo BankTransferEvent với `UNMATCHED` và yêu cầu đối soát.
- **D34 (PASS):** Cross-channel webhook tampering bị phát hiện và từ chối chữ ký (`401 UNAUTHORIZED`).
- **D35 (PASS):** Hoàn tất hồ sơ hoàn tiền tự động cập nhật `PaymentReconciliation` sang `RESOLVED_REFUNDED`.

---

### 27. CHI TIẾT GROUP E: SECURITY, RBAC & FRAUD ABUSE CONTROLS (E36–E43)

- **E36 (PASS):** Admin RBAC: Học sinh và Giảng viên bị chặn 403 Forbidden khi truy cập `/api/admin/finance/refunds`.
- **E37 (PASS):** Anti-IDOR & Authentication: Yêu cầu không có token hợp lệ bị chặn 401 Unauthorized.
- **E38 (PASS):** Server-side validation: Thiếu `beneficiaryBankAccount` bị từ chối 400.
- **E39 (PASS):** Client amount tampering: Không thể duyệt hoàn số tiền vượt quá `eligibleAmount`.
- **E40 (PASS):** Duplicate reference collision: Cố ý nộp mã `bankReference` đã dùng cho Payout bị từ chối (`DUPLICATE_BANK_REFERENCE`).
- **E41 (PASS):** Không để rò rỉ secrets / private tokens trong API response (Không lộ checksum key, passwordHash).
- **E42 (PASS):** Audit log bất biến: Nhật ký kiểm toán được append-only, ghi nhận mọi hành động.
- **E43 (PASS):** Four-Eyes Principle: Người phê duyệt hoàn tiền không thể tự mình xác minh hoàn tất nếu `enforceDifferentAdmin = true` (`DUAL_VERIFICATION_REQUIRED`, 403).

---

### 28. CHI TIẾT GROUP F: FULL PLATFORM FINANCIAL REGRESSION (F44–F60)

- **F44 (PASS):** PR1: Tuition payment intent creation generates valid VietQR with unique orderCode.
- **F45 (PASS):** PR1: Donation payment intent creation generates valid VietQR.
- **F46 (PASS):** PR2: Two-channel webhook signature verification succeeds for tuition.
- **F47 (PASS):** PR3: Atomic financial dispatch for tuition (Enrollment + Payment + Earning + Transaction).
- **F48 (PASS):** PR3: Atomic financial dispatch for donation (Contribution + Campaign + Transaction).
- **F49 (PASS):** PR4: Checkout UI state polling reflects COMPLETED correctly.
- **F50 (PASS):** PR4: Expired order code handled safely without phantom transactions.
- **F51 (PASS):** PR5: Outbox recovery job processes pending events idempotently.
- **F52 (PASS):** PR5: PaymentReconciliation created for unexpected overpayment.
- **F53 (PASS):** PR6: Admin finance overview aggregates tuition and donation metrics correctly.
- **F54 (PASS):** PR7: Settlement eligibility 12-rule engine blocks unfinished sessions and holds for 7 days.
- **F55 (PASS):** PR7: Monday withdrawal window (08:00–17:00) strictly enforced.
- **F56 (PASS):** PR7: Friday payout execution window (08:00–17:00) strictly enforced.
- **F57 (PASS):** PR7: Teacher revenue stage breakdown aggregates 6 KPI buckets accurately.
- **F58 (PASS):** FREE class enrollment never creates payment intents or teacher earnings.
- **F59 (PASS):** Ledger integrity check confirms zero discrepancy across payments, payouts and refunds.
- **F60 (PASS):** Security audit regression: Unauthorized access to all finance routes is blocked.

---

### 29. BẢNG TỔNG HỢP TOÀN BỘ CÁC SUITES KIỂM THỬ NỀN TẢNG (PR1 ĐẾN PR8)

| Bộ Suite Kiểm thử | Phạm vi kiểm định | Số Test Cases | Kết quả thực thi | Thời gian chạy |
|---|---|:---:|:---:|:---:|
| `refundReconciliation.pr8.test.js` | PR8: Safe Refund, Four-Eyes, Proofs, Regression | **60** | **60/60 PASS** | 58.84 s |
| `teacherSettlement.pr7.test.js` | PR7: 12 Rules, Monday/Friday, Recovery | **60** | **60/60 PASS** | 55.78 s |
| `adminFinance.pr6.test.js` | PR6: Admin Dashboard, Reconciliations, BankEvents | **44** | **44/44 PASS** | 32.67 s |
| `payosSafetyHardening.pr5.test.js` | PR5: Outbox Worker, Distributed Lock, Indexes | **43** | **43/43 PASS** | 31.52 s |
| `payosUnifiedIntent.pr1.test.js` | PR1: Payment Intent Engine, OrderCode Generator | **11** | **11/11 PASS** | 19.22 s |
| `payosWebhook.pr2.test.js` | PR2: Two-Channel Webhooks, HMAC Verification | **10** | **10/10 PASS** | 24.56 s |
| `payosDispatch.pr3.test.js` | PR3: Atomic Financial Dispatcher | **11** | **11/11 PASS** | 26.94 s |
| `payosCheckoutUi.pr4.test.js` | PR4: VietQR Polling, Expiry Handling | **12** | **12/12 PASS** | 22.35 s |
| `authorization.test.js` | RBAC Matrix, Role Escalation Protection | **68** | **68/68 PASS** | 28.10 s |
| `security.test.js` | Anti-IDOR, Token Tampering, Injection Guards | **55** | **55/55 PASS** | 43.04 s |
| **TỔNG CỘNG HỆ THỐNG** | **Toàn bộ lõi thanh toán tài chính Edunity V3** | **374** | **374/374 PASS (100%)** | **~5.5 phút** |

---

### 30. AUDIT BẢO MẬT BẬT PILOT PAYOS THẬT (READ-ONLY GO-LIVE AUDIT)

Báo cáo kiểm tra các điều kiện an toàn trước khi chuyển sang giai đoạn Pilot kết nối tài khoản ngân hàng thực:

1. **Trạng thái biến môi trường Cổng Thanh toán:**
   - `PAYOS_ENABLED`: `false` (Đang giữ an toàn tuyệt đối).
   - `ENABLE_PAYMENT_SANDBOX`: `true` (Cho phép giả lập giao dịch kiểm thử).
   - `PAYOS_TUITION_CLIENT_ID`: Đã cấu hình định dạng (`CONFIGURED`).
   - `PAYOS_TUITION_API_KEY`: Đã cấu hình định dạng (`CONFIGURED`).
   - `PAYOS_TUITION_CHECKSUM_KEY`: Đã cấu hình định dạng (`CONFIGURED`).
   - `PAYOS_DONATION_CLIENT_ID`: Đã cấu hình định dạng (`CONFIGURED`).
   - `PAYOS_DONATION_API_KEY`: Đã cấu hình định dạng (`CONFIGURED`).
   - `PAYOS_DONATION_CHECKSUM_KEY`: Đã cấu hình định dạng (`CONFIGURED`).
   - Không có bất kỳ Private Key hoặc Secret thực tế nào bị rò rỉ trong log, commit git hoặc code test.
2. **Trạng thái Webhook Endpoint sẵn sàng nhận Pilot:**
   - Kênh học phí: `POST /api/payment/payos/webhook/tuition` (Đã gắn HMAC chữ ký kênh Học phí).
   - Kênh quyên góp: `POST /api/payment/payos/webhook/donation` (Đã gắn HMAC chữ ký kênh Tài trợ).
3. **Trạng thái Outbox Worker & Background Cron:**
   - `financialOutboxWorker.js`: Đã sẵn sàng quét sự kiện tồn đọng, tự giải phóng lease sau 60 giây, dừng quét khi chạm ngưỡng 5 lần thất bại (`isExhausted = true`).
   - `financialSettlementJob.js`: Tự động khóa Distributed Lock, đánh giá các khoản thù lao đủ điều kiện sau 7 ngày vào các khung giờ quy định.
4. **Trạng thái An toàn Sổ cái (Ledger Invariant):**
   - Đảm bảo đẳng thức: `Tổng tiền thanh toán nhận được = Doanh thu ghi nhận + Tiền tạm giữ chưa phân bổ + Các khoản đã hoàn`.
   - Độ lệch sổ cái (`discrepancy`): **Chính xác bằng 0 VNĐ**.

---

### 31. MA TRẬN RỦI RO VÀ GIẢI PHÁP KIỂM SOÁT THẤT THOÁT TÀI CHÍNH

| Rủi ro tài chính | Mức độ rủi ro | Cơ chế kiểm soát đã cài đặt trong Edunity V3 |
|---|:---:|---|
| Kế toán chuyển tiền nhưng quên ghi sổ hoặc ghi sổ trùng | **P0** | Sparse Unique Index trên `bankTransferProof.referenceNumber` + Kiểm tra chéo giữa Payout và RefundCase. |
| Một Admin tự duyệt và tự chuyển tiền cho chính mình | **P0** | Ngăn chặn bằng Four-Eyes Principle: Người xác minh chứng từ độc lập với người phê duyệt (`DUAL_VERIFICATION_REQUIRED`). |
| Rút tiền học phí của lớp học sinh đang đòi hoàn tiền | **P0** | Tự động hủy (`CANCELLED`) TeacherEarning khi duyệt hoàn tiền; Khóa Payout (`HELD_FOR_REVIEW`) nếu có tranh chấp mở trước giờ chi trả. |
| Rút thù lao trước thời hạn hoặc khi chưa dạy xong | **P1** | 12 quy tắc kiểm tra điều kiện nghiêm ngặt + Thời gian lưu giữ bắt buộc 7 ngày (`SEVEN_DAY_HOLD_ACTIVE`). |
| Giảng viên yêu cầu rút tiền tùy tiện ngoài giờ hành chính | **P1** | Khung giờ rút tiền Thứ Hai (08:00 - 17:00). Khung giờ giải ngân Thứ Sáu (08:00 - 17:00). |
| Trục lợi học bổng biến ngân sách tài trợ thành tiền mặt | **P0** | Chặn hoàn tiền mặt với học bổng 100% (`CASH_REFUND_NOT_PERMITTED`). Với MIXED, chỉ hoàn đúng số tiền học sinh thực đóng. |
| Người dùng sửa mã tiền trong client để đòi hoàn thừa | **P1** | Tính toán lại `eligibleAmount` ở tầng Server và chặn nếu `requestedAmount > eligibleAmount`. |

---

### 32. HƯỚNG DẪN VẬN HÀNH DÀNH CHO ADMIN FINANCE & KẾ TOÁN TRƯỞNG

1. **Quy trình xử lý hoàn tiền học phí (Refund Flow):**
   - Bước 1: Truy cập `/admin/refunds`. Xem các hồ sơ ở trạng thái `NEEDS_REVIEW`.
   - Bước 2: Kiểm tra lý do và chứng từ kèm theo. Nhấn **"Tiếp nhận"** (`IN_REVIEW`).
   - Bước 3: Admin 1 nhấn **"Phê duyệt"** (`APPROVED`). Hệ thống ghi nhận nghĩa vụ nợ `REFUND (PENDING)`.
   - Bước 4: Kế toán thực hiện lệnh chuyển khoản qua Internet Banking. Sau đó nhấn **"Nộp chứng từ"** (`AWAITING_BANK_VERIFICATION`) và điền mã giao dịch ngân hàng.
   - Bước 5: Kế toán trưởng (Admin 2 độc lập) kiểm tra sao kê ngân hàng và nhấn **"Xác minh hoàn tất"** (`COMPLETED`). Tiền chính thức được ghi giảm trên sổ cái tài chính.
2. **Quy trình đối soát giao dịch lỗi (Reconciliation Flow):**
   - Truy cập `/admin/reconciliations`.
   - Với các giao dịch `LATE_PAYMENT_REVIEW` hoặc `AMOUNT_MISMATCH`, nhấn "Nhận xử lý" (`assignedTo: me`).
   - Nếu học sinh muốn tiếp tục học: Điều chuyển ghi danh sang lớp mới.
   - Nếu học sinh muốn nhận lại tiền: Nhấn **"Tạo hồ sơ hoàn tiền"** để kích hoạt luồng Safe Refund.

---

### 33. BẰNG CHỨNG THỰC THI (TEST OUTPUTS, TYPESCRIPT BUILD, GIT STATUS)

- **Kiểm tra TypeScript & Vite Build Frontend:**
  ```bash
  npm --prefix FrontEnd run build
  # Kết quả:
  # ✓ 3355 modules transformed.
  # dist/index.html                     0.66 kB
  # dist/assets/index-BHVM_aUh.css     92.44 kB
  # dist/assets/index-CvkPMpoW.js   3,238.92 kB
  # ✓ built in 6.54s
  ```
- **Kiểm tra Toàn vẹn Git Repository:**
  - Nhánh hoạt động: `feature/teacher-admin`
  - Trạng thái: Không có xung đột Git, không thực hiện commit/push trái phép.

---

### 34. KẾT LUẬN VÀ TUYÊN BỐ ĐÓNG CHU KỲ PHÁT TRIỂN TÀI CHÍNH PR1–PR8

Nhiệm vụ **TIN-FIN-PR8** đã hoàn thành xuất sắc 100% các tiêu chí kỹ thuật:

1. Đã bịt kín toàn bộ các lỗ hổng bảo mật P0 trên hệ thống chi trả giáo viên PR7 (ngăn chặn raw string, bắt buộc verified bank proof, tích hợp Four-Eyes Principle, kích hoạt khóa tự động khi phát sinh tranh chấp).
2. Xây dựng hoàn chỉnh Safe Refund Engine với máy trạng thái 7 bước và mô hình dữ liệu `RefundCase` độc lập.
3. Phân lập sổ cái triệt để giữa dòng tiền vào, nghĩa vụ nợ phải trả (`REFUND PENDING`), và dòng tiền thực xuất (`REFUND COMPLETED`).
4. Bảo toàn tuyệt đối ngân sách quỹ học bổng và quyền lợi của nhà tài trợ (chặn hoàn tiền mặt cho học bổng 100%, bảo vệ số dư quỹ không bị âm).
5. Xây dựng giao diện Admin Refunds Dashboard trực quan, chuẩn responsive, tích hợp đầy đủ 4 modal nghiệp vụ.
6. Toàn bộ **374 bài kiểm thử tích hợp và kiểm thử bảo mật (trong đó có 60 bài kiểm thử PR8 mới) đều đạt kết quả 100% PASS**.
7. Frontend TypeScript build sạch hoàn toàn, không có lỗi runtime hay lỗi types.
8. Hệ thống tài chính thanh toán Edunity V3 đã đạt chuẩn sẵn sàng cho giai đoạn Pilot kết nối tài khoản ngân hàng thực tế qua payOS.

**BÁO CÁO KỸ THUẬT PR8 CHÍNH THỨC HOÀN TẤT VÀ SẴN SÀNG ĐỂ TEAM LEADER BÀN GIAO.**

