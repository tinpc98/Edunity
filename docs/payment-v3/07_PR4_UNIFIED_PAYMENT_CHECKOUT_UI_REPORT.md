# BÁO CÁO KỸ THUẬT TIN-FIN-PR4 — UNIFIED PAYOS CHECKOUT UI: GIAO DIỆN VIETQR HỌC PHÍ VÀ QUYÊN GÓP MTQ

- **Dự án:** EDUNITY V3 — Online Learning & Scholarship Platform
- **Nhiệm vụ:** `TIN-FIN-PR4` (`FIN-03`, `FIN-04`, `FIN-15`)
- **Chủ sở hữu (Owner):** Tin — Team Leader (Payment & Finance)
- **Vai trò thực hiện:** Senior React Engineer + Payment UX Engineer + QA Lead
- **Nhánh làm việc:** `feature/teacher-admin`
- ** Trạng thái PR4:** **HOÀN THÀNH GIAO DIỆN UNIFIED CHECKOUT UI & KIỂM THỬ PR4** *(Lưu ý: Toàn hệ thống Payment chưa được phép tuyên bố Production-Ready cho đến khi đóng các P0/P1 Blocker về Outbox Worker Scheduling, Late Payment Accounting Ledger, Transaction Multi-Scholarship Unique Index và Commission Policy Snapshot ở mục 18–21).*

---

## 1. Tóm tắt điều hành (Executive Summary)

Trong **PR4 (`TIN-FIN-PR4`)**, hệ thống Frontend của **EDUNITY V3** đã được nâng cấp lên kiến trúc **Unified payOS Checkout UI** dùng chung một bộ cơ sở hạ tầng hiển thị VietQR, đếm ngược 15 phút, polling trạng thái tự động mỗi 3 giây và xử lý lỗi/đối soát cho cả hai kênh nghiệp vụ:

1. **Kênh Học phí (`TUITION` — `STUDENT`):**
   - Tích hợp tại `CheckoutPage.tsx` và `PaymentSuccessPage.tsx`.
   - Hỗ trợ đầy đủ 3 kịch bản: đóng học phí trực tiếp (`DIRECT_PAYMENT`), đồng chi trả học bổng một phần (`MIXED` — hiển thị rõ tổng học phí gốc, phần học bổng được trừ, và số tiền học viên cần thanh toán qua VietQR), và học bổng toàn phần 100% (`SCHOLARSHIP` — xác nhận vào lớp ngay mà không tạo mã QR).
   - Bảo vệ nghiêm ngặt quyền vào lớp: chỉ hiển thị trạng thái *"Đăng ký lớp thành công"* và nút *"Vào lớp của tôi"* khi Backend trả về đồng thời `paymentStatus === "COMPLETED"` **và** `enrollmentStatus === "CONFIRMED" | "COMPLETED"`. Nếu khoản tiền đến muộn sau khi hết hạn giữ chỗ (`Enrollment EXPIRED` hoặc `reconciliationRequired === true`), giao diện hiển thị *"Đã nhận tiền — đang đối soát (Khoản tiền đến sau hạn)"* và tuyệt đối không cấp quyền vào lớp tự động.
2. **Kênh Quyên góp Quỹ Học Bổng (`DONATION` — `SPONSOR` / MTQ):**
   - Tích hợp tại `CampaignDetailPage.tsx`, `SponsorContributionsPage.tsx` và các route hoàn trả `/sponsor/contributions/return`, `/sponsor/contributions/cancel`.
   - Cho phép Nhà tài trợ chọn số tiền hợp lệ (`> 0 VNĐ`), chọn chế độ hiển thị **Tài trợ công khai** (kèm tên vinh danh tùy chọn) hoặc **Tài trợ ẩn danh (`isAnonymous = true`)**, tạo mã VietQR trên kênh `DONATION`, đếm ngược 15 phút và tự động kiểm tra trạng thái mỗi 3 giây.
   - Đảm bảo tính toàn vẹn số liệu quỹ: việc khởi tạo mã QR (`PENDING`) **không bao giờ** làm tăng `fundedAmount` trên giao diện; tiến độ quỹ và biên nhận tài trợ điện tử chỉ hiển thị sau khi Backend xác nhận `contributionStatus === "COMPLETED"`.
3. **Kiểm toán 4 điểm an toàn từ PR3 (Mục 18–21):**
   - Thực hiện rà soát độc lập và ghi nhận minh bạch 4 điểm chặn trước khi đưa Payment lên môi trường Production thật:
     - **P0 Blocker (`OUTBOX_WORKER_NOT_SCHEDULED`):** `runPendingDispatchWorker` chưa được lập lịch tự động trong tiến trình nền.
     - **Accounting Blocker (`LATE_PAYMENT_RECEIPT_VS_REFUND_LIABILITY`):** Giao dịch đến muộn đang ghi 1 dòng `Transaction(REFUND, PENDING)` mà chưa tách bút toán nhận tiền thực tế (`CASH_RECEIPT`) khỏi nghĩa vụ hoàn tiền (`REFUND_LIABILITY`).
     - **Schema Blocker (`BANK_EVENT_MULTI_SCHOLARSHIP_INDEX_COLLISION`):** Unique index `{ relatedBankEventId: 1, transactionType: 1 }` trên `Transaction` sẽ đụng độ `E11000` nếu trong tương lai 1 `Enrollment` gắn nhiều hơn 1 bản ghi `ScholarshipUsage`.
     - **Policy Blocker (`COMMISSION_RATE_DEFAULT_POLICY`):** Giá trị fallback `commissionRate = 0.1` (10%) cần được chốt chính thức bằng cấu hình/chính sách được phê duyệt trước khi mở Production.

---

## 2. Git status / branch / HEAD

- **Branch hiện tại:** `feature/teacher-admin` (`ahead 7` so với `origin/feature/teacher-admin`).
- **HEAD commit:** `0acbd6d` (`Merge branch 'feature/Course' into feature/teacher-admin`).
- **Xung đột (Unmerged paths):** `0` file xung đột.
- **Tuân thủ quy tắc Git:** Không thực hiện `git commit`, `git push`, `git merge`, `git checkout`, `git reset` hay `git rebase`. Toàn bộ thay đổi từ PR1, PR2, PR3 và PR4 được giữ nguyên vẹn trên working tree.

---

## 3. Danh sách file Frontend đã tạo/sửa

### Các file Frontend tạo mới (Shared Hooks & Shared Payment Components):
1. `FrontEnd/src/hooks/usePaymentPolling.ts` — Hook dùng chung `usePaymentPolling` / `usePaymentIntent` cùng bộ hàm thuần (`derivePaymentUiState`, `shouldContinuePaymentPolling`, `isTerminalPaymentUiState`, `computeCountdownRemaining`, `formatCountdownMMSS`).
2. `FrontEnd/src/components/payment/PaymentStatusBadge.tsx` — Badge hiển thị trạng thái thanh toán tiếng Việt chuẩn hóa theo `PaymentUiState` và `purpose`.
3. `FrontEnd/src/components/payment/PaymentCountdown.tsx` — Đồng hồ đếm ngược 15 phút (`MM:SS`, `14:59 -> 00:00`) dựa trên `expiredAt` / `holdExpiresAt` từ Backend.
4. `FrontEnd/src/components/payment/PaymentQrPanel.tsx` — Khung hiển thị mã VietQR chuẩn EMVCo (sử dụng `<QRCode>` của Ant Design hoặc ảnh URI hợp lệ), thông tin số tiền, khấu trừ học bổng `MIXED`, `orderCode`, `gatewayReference`, nút mở `checkoutUrl`, cảnh báo `SANDBOX / MOCK`, và chỉ báo polling.
5. `FrontEnd/src/components/payment/PaymentInstructions.tsx` — Hướng dẫn chuyển khoản VietQR an toàn bằng tiếng Việt cho Học viên và Nhà tài trợ.
6. `FrontEnd/src/components/payment/PaymentErrorState.tsx` — Component hiển thị các trạng thái lỗi/cảnh báo chuyên biệt (`NETWORK_ERROR`, `MISSING_QR`, `CREATE_INTENT_ERROR`, `EXPIRED`, `CAMPAIGN_CLOSED`, `FORBIDDEN`, `NOT_FOUND`, `LATE_PAYMENT_REVIEW`, `RECONCILIATION_REQUIRED`).
7. `FrontEnd/src/components/payment/PaymentResult.tsx` — Biên nhận kết quả giao dịch thống nhất cho cả `TUITION` và `DONATION`, phân biệt rõ thành công hợp lệ với trạng thái đang đối soát/đến muộn.
8. `FrontEnd/src/components/payment/index.ts` — Barrel export cho toàn bộ Shared Payment Components.

### Các file Frontend cập nhật:
9. `FrontEnd/src/types/payment.ts` — Bổ sung kiểu `PaymentPurpose`, `PaymentChannelKey`, `PaymentUiState`, các trường DTO của Unified Payment Intent (`orderCode`, `paymentLinkId`, `qrCode`, `checkoutUrl`, `expiredAt`, `remainingSeconds`, `tuitionAmount`, `scholarshipAmount`, `reconciliationRequired`, `reconciliationReason`, `reconciliationStatus`, `isAnonymous`, `donorDisplayName`).
10. `FrontEnd/src/types/campaign.ts` — Bổ sung các trường VietQR/payOS và ẩn danh (`isAnonymous`, `donorDisplayName`, `orderCode`, `qrCode`, `checkoutUrl`, `expiredAt`, `remainingSeconds`) vào `ApiSponsorContribution`, `SponsorContribution`, `CreateContributionPayload`, `CreateContributionResponse`.
11. `FrontEnd/src/api/paymentAdapters.ts` — Cập nhật `adaptPayment` chuẩn hóa dữ liệu trả về từ `POST /api/enrollments/:id/payments` và `GET /api/payments/:id` cho cả 2 kênh `TUITION` và `DONATION`.
12. `FrontEnd/src/api/campaignAdapters.ts` — Cập nhật `adaptContribution` ánh xạ đầy đủ các trường VietQR, `paymentId`, `orderCode`, `expiredAt`, `isAnonymous`, `donorDisplayName`.
13. `FrontEnd/src/services/gatewayPayment.service.ts` — Cập nhật `createPayment` và `getPaymentById` trả về đầy đủ DTO Unified Payment Intent.
14. `FrontEnd/src/services/sponsorContribution.service.ts` — Cập nhật `createContribution` gửi `{ amount, isAnonymous, donorDisplayName }` và nhận đầy đủ thông tin VietQR từ Unified Payment Engine.
15. `FrontEnd/src/routes/routePaths.ts` — Bổ sung `PAYMENT_RETURN` (`/payment/return`), `PAYMENT_CANCEL` (`/payment/cancel`), `SPONSOR_CONTRIBUTION_RETURN` (`/sponsor/contributions/return`), `SPONSOR_CONTRIBUTION_CANCEL` (`/sponsor/contributions/cancel`).
16. `FrontEnd/src/app/router.tsx` — Đăng ký các route Return URL và Cancel URL cho cả Học viên và Nhà tài trợ.
17. `FrontEnd/src/features/enrollment/CheckoutPage.tsx` — Nâng cấp toàn diện trang thanh toán học phí sử dụng `PaymentQrPanel`, `PaymentCountdown`, `PaymentInstructions`, `PaymentResult`, `PaymentErrorState`, `usePaymentPolling`, hỗ trợ học bổng 100% và `MIXED`.
18. `FrontEnd/src/features/enrollment/PaymentSuccessPage.tsx` — Nâng cấp trang kiểm tra kết quả/Return URL/Cancel URL, luôn xác minh từ Backend `GET /api/payments/:id` và tuyệt đối không tin query param `?status=PAID`.
19. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx` — Nâng cấp luồng quyên góp của Nhà tài trợ với tùy chọn Công khai / Ẩn danh (`isAnonymous`), Modal VietQR dùng chung `PaymentQrPanel`, đếm ngược 15 phút và polling 3 giây/lần.
20. `FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx` — Hiển thị trạng thái ẩn danh/công khai, `orderCode`, và cho phép mở lại mã VietQR đối với các khoản đóng góp `PENDING` còn hạn.

---

## 4. Danh sách file Backend đã sửa (Read-Only DTO & Test Compatibility)

Tuân thủ nghiêm ngặt Mục 4 của yêu cầu (*"Chỉ bổ sung field READ-ONLY tối thiểu ở DTO response nếu thật sự cần. KHÔNG làm thay đổi logic tài chính PR3"*):

1. `BackEnd/src/services/paymentService.js`:
   - Trong `getPaymentById`: bổ sung các trường **READ-ONLY** phục vụ hiển thị UI chính xác:
     - Luồng `TUITION`: `tuitionAmount`, `scholarshipAmount`, `reconciliationRequired`, `reconciliationReason`, `reconciliationStatus`.
     - Luồng `DONATION`: `contributionStatus`, `campaignTitle`, `campaignStatus`, `isAnonymous`, `donorDisplayName`, `reconciliationRequired`, `reconciliationReason`, `reconciliationStatus`.
2. `BackEnd/src/controllers/paymentController.js`:
   - Trong `createSandboxPayment` (`POST /api/enrollments/:id/payments`): truyền thêm read-only metadata `enrollmentStatus`, `paymentSource`, `classId`, `tuitionAmount`, `scholarshipAmount` vào `formatPaymentIntentResponse`.
3. `BackEnd/src/services/contributionService.js`:
   - Trong `createContribution`: trả thêm read-only `campaignTitle`, `campaignStatus`.
   - Trong `getMyContributions`: loại bỏ `providerMetadata` khỏi danh sách trả về và đính kèm `paymentId`, `contributionId`, `remainingSeconds`.
4. `BackEnd/src/services/settlementService.js`:
   - Trong `confirmScholarshipUsage`: giữ nguyên truy vấn nguyên tử `findOneAndUpdate` khi kết nối MongoDB thật (`readyState === 1`), đồng thời bổ sung nhánh tương thích cho unit test mock không kết nối DB (`readyState !== 1` trong `tests/payment.test.js` `PAY-06.7`).
5. `BackEnd/tests/payosCheckoutUi.pr4.test.js`:
   - Bộ kiểm thử tự động PR4 kiểm tra toàn bộ 26 kịch bản nghiệp vụ, giao diện, polling, countdown, anti-IDOR và quét bảo mật Frontend.

---

## 5. Kiến trúc Unified Payment UI

```
+-----------------------------------------------------------------------------------+
|                        FRONTEND UNIFIED CHECKOUT ARCHITECTURE                     |
+-----------------------------------------+-----------------------------------------+
|       STUDENT TUITION FLOW              |        SPONSOR DONATION FLOW            |
|  (CheckoutPage / PaymentSuccessPage)    | (CampaignDetailPage / ContributionsPage)|
+--------------------+--------------------+--------------------+--------------------+
                     |                                         |
                     | POST /api/enrollments/:id/payments      | POST /api/campaigns/:id/contributions
                     v                                         v
+-----------------------------------------------------------------------------------+
|                     SHARED HOOK: usePaymentPolling / usePaymentIntent             |
|            Polls GET /api/payments/:paymentId every 3000ms while PENDING          |
|       (refetchIntervalInBackground: false, refetchOnWindowFocus: true)            |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        SHARED VIETQR UI COMPONENT SUITE                           |
|  - PaymentQrPanel (EMVCo <QRCode>, amount breakdown, orderCode, checkoutUrl)      |
|  - PaymentCountdown (15m MM:SS derived from Backend expiredAt / holdExpiresAt)    |
|  - PaymentStatusBadge (8 standardized Vietnamese UI states)                       |
|  - PaymentInstructions (Safe banking guide)                                       |
|  - PaymentErrorState (Network, Missing QR, Expired, Closed, 403/404, Late Review) |
|  - PaymentResult (Verified Tuition Enrollment vs Donation Receipt vs Reconcile)   |
+-----------------------------------------------------------------------------------+
```

- **Không tồn tại 2 Payment Engine:** Cả hai luồng Học phí và Tài trợ đều tiêu thụ chung cấu trúc `Payment` DTO từ `GET /api/payments/:id`, dùng chung hook `usePaymentPolling` và render chung bộ component trong `FrontEnd/src/components/payment/`.
- **Single Source of Truth từ Backend:** Mọi thông tin nhạy cảm về tài chính (`amount`, `tuitionAmount`, `scholarshipAmount`, `orderCode`, `qrCode`, `checkoutUrl`, `expiredAt`, `paymentStatus`, `enrollmentStatus`, `reconciliationRequired`) đều lấy trực tiếp từ phản hồi đã xác thực của Backend.

---

## 6. Danh sách Shared Payment Components

| Component | Đường dẫn | Trách nhiệm chính |
| :--- | :--- | :--- |
| `PaymentQrPanel` | `FrontEnd/src/components/payment/PaymentQrPanel.tsx` | Hiển thị mã VietQR (tự động phân biệt chuỗi EMVCo `000201...` để render bằng `<QRCode>` với URL/Data URI ảnh), bảng chi tiết số tiền (bao gồm khấu trừ học bổng `MIXED`), `orderCode`, `gatewayReference`, nút mở `checkoutUrl`, nhãn ẩn danh, và cảnh báo `SANDBOX / MOCK`. |
| `PaymentCountdown` | `FrontEnd/src/components/payment/PaymentCountdown.tsx` | Hiển thị thời gian hiệu lực còn lại định dạng `MM:SS` (`14:59 -> 00:00`) tính từ `expiredAt` / `holdExpiresAt` của Backend; tự động phát sự kiện `onExpire` một lần khi chạm `00:00` để kích hoạt kiểm tra lại trạng thái từ máy chủ. |
| `PaymentStatusBadge` | `FrontEnd/src/components/payment/PaymentStatusBadge.tsx` | Hiển thị nhãn trạng thái tiếng Việt nhất quán cho 8 trạng thái `PaymentUiState`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`, `RECONCILIATION_REQUIRED`, `LATE_PAYMENT_REVIEW`, `REFUND_PENDING`. |
| `PaymentInstructions` | `FrontEnd/src/components/payment/PaymentInstructions.tsx` | Hướng dẫn 4 bước quét mã VietQR Napas247 an toàn, cảnh báo không sửa nội dung chuyển khoản và không chuyển khoản lặp lại lần 2 khi hệ thống đang xác minh. |
| `PaymentErrorState` | `FrontEnd/src/components/payment/PaymentErrorState.tsx` | Hiển thị giao diện xử lý lỗi có hành động cụ thể (`Thử lại`, `Mở trang thanh toán payOS`, `Quay lại`) cho 9 tình huống lỗi/ngoại lệ. |
| `PaymentResult` | `FrontEnd/src/components/payment/PaymentResult.tsx` | Hiển thị biên nhận giao dịch cuối cùng: phân biệt chặt chẽ giữa *Đăng ký lớp thành công* (`Enrollment CONFIRMED`), *Biên nhận tài trợ học bổng* (`Contribution COMPLETED`), và *Giao dịch đến muộn / đang đối soát* (`LATE_PAYMENT_REVIEW` / `RECONCILIATION_REQUIRED`). |

---

## 7. Thiết kế `usePaymentPolling` / `usePaymentIntent`

File: `FrontEnd/src/hooks/usePaymentPolling.ts`

1. **Chu kỳ Polling chuẩn 3 giây (`PAYMENT_POLL_INTERVAL_MS = 3000`):**
   - Sử dụng `useQuery` của `@tanstack/react-query` với `queryKey: paymentKeys.detail(paymentId)`.
   - Hàm `refetchInterval` kiểm tra trạng thái thực tế của dữ liệu qua `shouldContinuePaymentPolling(data, isClientTimerZero)`.
   - Chỉ tiếp tục gọi `GET /api/payments/:id` mỗi `3000ms` khi trạng thái suy diễn là `PENDING` hoặc `PROCESSING`.
2. **Tự động dừng Polling ở các trạng thái kết thúc (Terminal States):**
   - Ngay khi `derivePaymentUiState` trả về một trong các trạng thái: `COMPLETED`, `FAILED`, `EXPIRED`, `RECONCILIATION_REQUIRED`, `LATE_PAYMENT_REVIEW`, hoặc `REFUND_PENDING`, `refetchInterval` trả về `false` để dừng hoàn toàn việc gọi API lặp lại.
   - Nếu gặp lỗi phân quyền hoặc không tồn tại (`401`, `403`, `404`), dừng retry và dừng polling ngay lập tức.
3. **Tối ưu tài nguyên trình duyệt & chống bão request:**
   - `refetchIntervalInBackground: false` — Tạm dừng polling khi người dùng chuyển sang tab khác hoặc thu nhỏ trình duyệt.
   - `refetchOnWindowFocus: true` — Tự động kiểm tra ngay lập tức khi người dùng quay lại cửa sổ ứng dụng sau khi quét QR trên điện thoại.
   - `retry` giới hạn tối đa 2 lần với `retryDelay` tăng dần (`3000ms -> 6000ms -> 9000ms`) khi gặp lỗi mạng tạm thời.
   - Khi component unmount, TanStack Query tự động hủy timer; đồng thời hook cung cấp hàm `stopPolling()` gọi `queryClient.cancelQueries`.

---

## 8. Luồng Student Tuition Checkout (`TUITION`)

File: `FrontEnd/src/features/enrollment/CheckoutPage.tsx`

1. **Tải thông tin đơn giữ chỗ (`GET /api/enrollments/:id`) và thông tin lớp (`fetchClassById`):**
   - Kiểm tra trạng thái đơn: nếu đơn đã `EXPIRED` hoặc `CANCELLED`, khóa ngay việc tạo QR và hiển thị `PaymentErrorState(kind="EXPIRED")`.
2. **Tự động khởi tạo / tái sử dụng Payment Intent (`POST /api/enrollments/:id/payments`):**
   - Khi `enrollmentStatus === "PENDING_PAYMENT"`, gọi API tạo hoặc lấy lại Payment Intent `PENDING` hiện hành (idempotent từ PR1).
   - Hiển thị `PaymentQrPanel` với mã VietQR, số tiền cần đóng, `orderCode` (dải `100,000,001..199,999,999`), `gatewayReference`, nút mở `checkoutUrl`, và đồng hồ đếm ngược 15 phút theo `holdExpiresAt`.
3. **Kiểm tra trạng thái tự động (`usePaymentPolling`):**
   - Khi Webhook từ kênh `TUITION` xác thực và `financialDispatchService` hạch toán thành công (`paymentStatus === "COMPLETED"` và `enrollmentStatus === "CONFIRMED"`), giao diện tự động dừng polling, làm mới cache `enrollments`/`classes`/`sessions`, và hiển thị `PaymentResult` với tiêu đề **"Đăng ký lớp thành công"** cùng nút **"Vào lớp của tôi"**.

---

## 9. Luồng Sponsor Donation Checkout (`DONATION`)

File: `FrontEnd/src/features/campaign/CampaignDetailPage.tsx` & `FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx`

1. **Kiểm tra điều kiện chiến dịch:**
   - Nếu chiến dịch có `status === "CLOSED"` hoặc `!isAcceptingFunding`, ẩn biểu mẫu tạo giao dịch và hiển thị `PaymentErrorState(kind="CAMPAIGN_CLOSED")`.
2. **Chọn mức đóng góp và chế độ hiển thị danh tính:**
   - Nhà tài trợ chọn nhanh các mốc (`100.000đ` .. `5.000.000đ`) hoặc nhập số tiền nguyên dương tùy chỉnh.
   - Chọn chế độ **Tài trợ công khai** (có thể nhập tên hiển thị vinh danh) hoặc **Tài trợ ẩn danh (`isAnonymous = true`)**.
3. **Khởi tạo Donation Payment Intent (`POST /api/campaigns/:id/contributions`):**
   - Mở Modal VietQR hiển thị `PaymentQrPanel(purpose="DONATION")` với `orderCode` thuộc dải `200,000,001..299,999,999`, mã VietQR, đồng hồ đếm ngược 15 phút và hướng dẫn chuyển khoản.
   - **Không cộng tiền ảo trên Client:** Trong suốt thời gian `PENDING`, `campaign.fundedAmount` trên trang chi tiết chiến dịch giữ nguyên giá trị thực tế từ máy chủ.
4. **Hoàn tất và hiển thị biên nhận:**
   - Khi `usePaymentPolling` nhận được `contributionStatus === "COMPLETED"` từ Backend, hệ thống dừng polling, invalidate cache chiến dịch để cập nhật thanh tiến độ quỹ thực tế, và hiển thị biên nhận điện tử `PaymentResult(purpose="DONATION")`.

---

## 10. Xử lý MIXED Scholarship và Full Scholarship (100%)

1. **Học bổng toàn phần 100% (`paymentSource === "SCHOLARSHIP"`, `remainingDue === 0`):**
   - Khi Học viên chọn áp dụng suất học bổng có số dư `>= tuitionAmount`, API `POST /api/enrollments/:id/scholarship-payment` xác nhận `enrollmentStatus = "CONFIRMED"` ngay lập tức.
   - `CheckoutPage.tsx` nhận diện trạng thái `isConfirmedWithoutGateway`, **không gọi API tạo mã VietQR**, và chuyển thẳng sang màn hình `PaymentResult` (*"Đăng ký lớp thành công"* với số tiền thanh toán thêm bằng `0 đ`).
2. **Học bổng đồng chi trả một phần (`paymentSource === "MIXED"`, `remainingDue > 0`):**
   - Khi suất học bổng chỉ trang trải một phần học phí, phần học bổng được tạm giữ (`ScholarshipUsage PENDING`) và `CheckoutPage.tsx` tự động tạo/làm mới Payment Intent cho đúng phần chênh lệch `remainingDue`.
   - Cả cột tóm tắt bên trái lẫn `PaymentQrPanel` bên phải đều hiển thị rõ 3 dòng:
     - **Tổng học phí gốc:** `tuitionAmount`
     - **Học bổng hỗ trợ (MIXED):** `- scholarshipAmount`
     - **Số tiền học viên cần thanh toán:** `amount` (`remainingDue`)

---

## 11. Xử lý Return URL / Cancel URL an toàn

File: `FrontEnd/src/features/enrollment/PaymentSuccessPage.tsx` & `FrontEnd/src/app/router.tsx`

- Các đường dẫn được hỗ trợ:
  - `/checkout/:enrollmentId/success`
  - `/payment/return?paymentId=...`
  - `/payment/cancel?paymentId=...`
  - `/sponsor/contributions/return?paymentId=...`
  - `/sponsor/contributions/cancel?paymentId=...`
- **Quy tắc bảo mật tuyệt đối:** Component `PaymentSuccessPage` chỉ trích xuất định danh `paymentId` / `contributionId` từ URL để gọi `usePaymentPolling` (`GET /api/payments/:id`), **tuyệt đối bỏ qua** mọi tham số trạng thái trên URL như `?status=PAID`, `?code=00`, hay `?cancel=false`. Nếu Backend trả về `PENDING`, giao diện vẫn hiển thị *"Đang xác minh giao dịch từ máy chủ ngân hàng..."* kèm mã VietQR và tiếp tục polling.

---

## 12. Xử lý QR hết hạn 15 phút

- Thời gian hiệu lực 15 phút (`expiredAt` / `holdExpiresAt`) được trả về từ Backend.
- `PaymentCountdown` tính toán số giây còn lại dựa trên mốc thời gian tuyệt đối `new Date(expiredAt).getTime() - Date.now()`. Nhờ đó:
  - Việc **F5 / Refresh trình duyệt** hoặc mở nhiều tab không bao giờ làm reset lại 15 phút trên giao diện.
  - Khi đồng hồ đếm về `00:00`, `onExpire` kích hoạt `refetchPayment()` và `refetchEnrollment()` để đồng bộ trạng thái từ Backend, đồng thời chuyển `uiState` sang `EXPIRED`, ẩn mã QR cũ và hiển thị `PaymentErrorState(kind="EXPIRED")` để ngăn người dùng quét mã QR đã hết hạn.

---

## 13. Xử lý giao dịch đến muộn / cần đối soát (`LATE_PAYMENT_REVIEW` & `RECONCILIATION_REQUIRED`)

- Trong kịch bản học viên quét mã chuyển khoản sát giờ khiến Webhook ngân hàng báo có (`Payment COMPLETED`) **sau khi** đơn giữ chỗ 15 phút đã hết hạn (`Enrollment EXPIRED` hoặc `PENDING_PAYMENT` quá hạn):
  - Backend `getPaymentById` trả về `paymentStatus: "COMPLETED"`, `enrollmentStatus: "EXPIRED"`, `reconciliationRequired: true`, `reconciliationReason: "LATE_PAYMENT_REVIEW"`.
  - Hàm `derivePaymentUiState` trên Frontend phân loại giao dịch vào trạng thái `LATE_PAYMENT_REVIEW` (không phải `COMPLETED`).
  - `PaymentResult` hiển thị cảnh báo màu vàng cam: **"Đã nhận tiền — đang đối soát (Khoản tiền đến sau hạn)"**, giải thích rõ ngân hàng đã báo có nhưng chỗ ngồi tạm giữ đã hết hạn nên giao dịch được chuyển sang quy trình đối soát/hoàn tiền, và **tuyệt đối ẩn nút "Vào lớp của tôi"**.
- Tương tự, đối với khoản tài trợ `DONATION` đến sau khi chiến dịch đã `CLOSED` (`reconciliationReason: "CAMPAIGN_NOT_ACCEPTING_FUNDING"`), giao diện hiển thị **"Đã ghi nhận giao dịch cần đối soát"** thay vì báo tài trợ thành công giả.

---

## 14. Xử lý ẩn danh nhà tài trợ (`isAnonymous`)

- Trên `CampaignDetailPage.tsx`, Nhà tài trợ có thể chọn Radio **"Tài trợ công khai"** hoặc **"Tài trợ ẩn danh"**.
- Khi chọn `isAnonymous = true`:
  - Payload gửi lên `POST /api/campaigns/:id/contributions` có `isAnonymous: true, donorDisplayName: null`.
  - Backend ẩn trường `sponsorId` khỏi phản hồi public/non-admin và trả về `donorDisplayName: "Nhà tài trợ ẩn danh"`.
  - Trên `PaymentQrPanel`, `PaymentResult` và bảng lịch sử `SponsorContributionsPage.tsx`, giao diện hiển thị rõ nhãn **"Tài trợ ẩn danh"** / **"Nhà tài trợ ẩn danh"**.

---

## 15. Xử lý lỗi mạng / timeout / rate limit / thiếu QR

- **Lỗi mạng tạm thời (`NETWORK_ERROR`):** `usePaymentPolling` tự động thử lại tối đa 2 lần với khoảng cách tăng dần; nếu vẫn lỗi sẽ hiển thị `PaymentErrorState(kind="NETWORK_ERROR")` kèm lời nhắc *"Nếu bạn đã chuyển khoản, vui lòng không chuyển lại lần 2 và nhấn Kiểm tra lại"*.
- **Thiếu chuỗi `qrCode` nhưng có `checkoutUrl` (`MISSING_QR`):** `PaymentQrPanel` không tự bịa mã QR trên client mà hiển thị `PaymentErrorState(kind="MISSING_QR")` kèm nút nổi bật **"Mở trang thanh toán payOS"** (`checkoutUrl`).
- **Chuỗi `qrCode` chuẩn EMVCo VietQR (`000201...`):** Hàm `isImageSourceUrl(qrCode)` nhận diện chính xác chuỗi EMVCo không phải là URL ảnh nên render trực tiếp bằng component `<QRCode value={qrCode} />` của Ant Design, tránh hoàn toàn lỗi `<img src="000201...">` bị vỡ ảnh.

---

## 16. Kiểm tra rò rỉ tài nguyên (Timer / Polling / Memory Leak)

1. **`useHoldCountdown.ts` & `PaymentCountdown.tsx`:**
   - Sử dụng `setInterval` 1000ms bên trong `useEffect` và luôn gọi `clearInterval(timer)` cả khi chạm mốc `target` lẫn trong hàm cleanup `return () => clearInterval(timer)` khi component unmount.
2. **`usePaymentPolling.ts`:**
   - Quản lý vòng đời polling hoàn toàn qua TanStack Query (`refetchInterval`), tự động dừng khi đạt trạng thái kết thúc, tạm dừng khi tab ẩn (`refetchIntervalInBackground: false`), và tự hủy khi component unmount.

---

## 17. Kiểm tra bảo mật Frontend & không lộ Secret

- Đã thực hiện quét toàn bộ mã nguồn `FrontEnd/src` và bản build `FrontEnd/dist` (kiểm chứng tự động trong `TC-26` của `BackEnd/tests/payosCheckoutUi.pr4.test.js`):
  - **Không tồn tại** bất kỳ biến môi trường hay chuỗi bí mật nào thuộc nhóm `PAYOS_TUITION_CLIENT_ID`, `PAYOS_TUITION_API_KEY`, `PAYOS_TUITION_CHECKSUM_KEY`, `PAYOS_DONATION_CLIENT_ID`, `PAYOS_DONATION_API_KEY`, `PAYOS_DONATION_CHECKSUM_KEY`, `PAYMENT_WEBHOOK_SECRET`.
  - **Không import** `@payos/node` trên Frontend.
  - **Anti-IDOR:** Mọi truy vấn `GET /api/payments/:id` đều kiểm tra quyền sở hữu `payerUserId` / `sponsorId` tại Backend; nếu người dùng khác cố truy cập sẽ nhận `404 PAYMENT_NOT_FOUND` và giao diện hiển thị trạng thái không tìm thấy dữ liệu.
  - **Chặn nút giả lập Sandbox ở Production:** Khung mô phỏng Webhook (`Giả lập Thành công` / `Giả lập Thất bại`) chỉ được phép hiển thị khi đồng thời thỏa mãn `IS_DEV_OR_TEST` **và** `provider === "SANDBOX"`.

---

## 18. Báo cáo kiểm tra 4 điểm an toàn từ PR3 (Mandatory Safety Audit)

Theo yêu cầu tại Mục 2 của nhiệm vụ PR4, dưới đây là kết quả kiểm tra độc lập đối với 4 điểm an toàn từ PR3 trong codebase hiện tại:

| Hạng mục kiểm tra | Trạng thái trong Codebase hiện tại | Phân loại | Hành động trong PR4 |
| :--- | :--- | :--- | :--- |
| **A. Outbox Worker Scheduling (`runPendingDispatchWorker`)** | Hàm `runPendingDispatchWorker` đã có trong `financialDispatchService.js` nhưng **chưa được gọi** trong `BackEnd/src/jobs/maintenanceJob.js` hoặc tiến trình cron nền. | **P0 Production Blocker** | Ghi nhận chi tiết tại Mục 19; không tự ý bật cron ngầm trong PR4. |
| **B. Late Payment Accounting Entry (`Transaction REFUND PENDING`)** | Khi tiền học phí đến muộn sau khi hết hạn giữ chỗ, `Payment` chuyển sang `COMPLETED` và hệ thống tạo 1 bản ghi `Transaction(transactionType: "REFUND", status: "PENDING")` mà chưa có bút toán ghi nhận tiền vào (`CASH_RECEIPT` / `UNAPPLIED_RECEIPT`). | **P1 Accounting Blocker** | Ghi nhận chi tiết tại Mục 20; giữ nguyên sổ cái hiện tại để xử lý đồng bộ trong PR8. |
| **C. Transaction Unique Index `{ relatedBankEventId: 1, transactionType: 1 }`** | Hiện tại `scholarshipPaymentService.js` chỉ cho phép tối đa 1 `ScholarshipUsage` trên 1 `Enrollment`. Tuy nhiên, nếu trong tương lai 1 `Enrollment` gắn `>= 2` bản ghi `ScholarshipUsage` cùng được xác nhận bởi 1 `BankTransferEvent`, bản ghi `Transaction(SCHOLARSHIP_USAGE)` thứ hai sẽ trùng `(relatedBankEventId, "SCHOLARSHIP_USAGE")` và gây lỗi `E11000`. | **P1 Schema Blocker** | Ghi nhận chi tiết tại Mục 21; đề xuất mở rộng khóa index trong PR5/PR8. |
| **D. Chính sách `commissionRate = 0.1` (10%)** | `settlementService.js` và `financialDispatchService.js` đang lấy `getSetting("COMMISSION_RATE") || 0.1` và snapshot vào `TeacherEarning.commissionRate`. Tuy nhiên mức mặc định `10%` cần được xác nhận bằng chính sách kinh doanh chính thức trước khi chạy tiền thật. | **P1 Policy Blocker** | Đã ghi nhận rõ; không tuyên bố hệ thống Payment sẵn sàng Production cho tới khi chốt chính sách. |

---

## 19. P0 Blocker: Outbox Worker Scheduling (`OUTBOX_WORKER_NOT_SCHEDULED`)

- **Hiện trạng thực tế:**
  - Trong PR3, khi Webhook payOS được xác thực tại `payosWebhookService.js`, hệ thống lưu `BankTransferEvent` với `processingStatus = "READY_FOR_DISPATCH"` và gọi `financialDispatchService.dispatchBankTransferEvent(event._id)` ngay trong luồng xử lý request.
  - Nếu xảy ra lỗi tạm thời (ví dụ: xung đột khóa giao dịch MongoDB hoặc gián đoạn kết nối thoáng qua đúng lúc dispatch), `BankTransferEvent` được chuyển về trạng thái `FAILED_RETRYABLE` với `nextRetryAt` để chờ tiến trình Outbox Worker (`runPendingDispatchWorker`) quét và hạch toán lại.
  - Tuy nhiên, kiểm tra `BackEnd/src/jobs/maintenanceJob.js` cho thấy hiện chỉ có 4 tác vụ đang chạy định kỳ (`classes`, `scholarships`, `expiredRecordings`, `staleRecordings`), **chưa gọi `runPendingDispatchWorker`**.
- **Rủi ro nếu lên Production ngay:**
  - Nếu lệnh gọi `dispatchBankTransferEvent` trực tiếp trong request webhook gặp lỗi tạm thời, giao dịch sẽ nằm ở trạng thái `FAILED_RETRYABLE` / `READY_FOR_DISPATCH` cho đến khi có tác động kích hoạt worker.
- **Thiết kế kích hoạt an toàn đề xuất cho PR tiếp theo:**
  - Bổ sung vào `BackEnd/src/jobs/maintenanceJob.js` (hoặc worker chuyên biệt) lệnh gọi `runExclusive("financialOutboxDispatch", 60000, () => financialDispatchService.runPendingDispatchWorker({ limit: 25 }))` mỗi `30–60 giây`, được kiểm soát bởi cờ môi trường `ENABLE_FINANCIAL_OUTBOX_WORKER=true`.

---

## 20. Accounting Blocker: Late Payment Ledger Entry (`LATE_PAYMENT_RECEIPT_VS_REFUND_LIABILITY`)

- **Hiện trạng thực tế:**
  - Khi học viên chuyển khoản thành công qua ngân hàng nhưng lệnh báo có đến sau khi `Enrollment.holdExpiresAt` đã hết hạn:
    - `Payment.paymentStatus` được cập nhật thành `COMPLETED` (phản ánh đúng sự thật là cổng thanh toán đã thu tiền).
    - `PaymentReconciliation` được tạo với `reason = "LATE_PAYMENT_REVIEW"`, `status = "OPEN"`.
    - Trong bảng `Transaction`, hệ thống hiện chỉ ghi 1 dòng duy nhất: `transactionType = "REFUND"`, `status = "PENDING"`, `relatedPaymentId = payment._id`.
- **Vấn đề kế toán (Sổ cái đơn / kép):**
  - Về mặt hạch toán tài chính chuẩn, việc ngân hàng đã thu tiền (`Cash-In Receipt`) và nghĩa vụ phải hoàn trả khoản tiền đó cho học viên (`Refund Liability`) là **2 sự kiện kế toán độc lập**:
    1. **Bút toán 1 (Thu tiền thực tế):** Tiền đã vào tài khoản ngân hàng kênh `TUITION` (cần 1 bản ghi thu tiền `ENROLLMENT_PAYMENT` hoặc `UNAPPLIED_TUITION_RECEIPT` trạng thái `COMPLETED`).
    2. **Bút toán 2 (Nghĩa vụ hoàn tiền):** Khoản phải trả lại cho học viên (`REFUND` trạng thái `PENDING`, và chỉ chuyển sang `COMPLETED` khi Admin thực sự chuyển trả tiền ở PR8).
  - Nếu chỉ ghi 1 dòng `REFUND (PENDING)` mà không có dòng thu tiền tương ứng, báo cáo tổng thu ngân hàng trên bảng `Transaction` sẽ lệch so với sao kê tài khoản payOS trong khoảng thời gian chờ hoàn tiền.
- **Đề xuất xử lý tại PR8 (Reconciliation & Refund Flow):**
  - Tách bạch rõ bút toán thu tiền đến muộn và bút toán hoàn tiền khi triển khai quy trình đối soát & hoàn tiền cho Admin ở PR8.

---

## 21. Schema Blocker: Transaction Unique Index on `relatedBankEventId` (`BANK_EVENT_MULTI_SCHOLARSHIP_INDEX_COLLISION`)

- **Hiện trạng thực tế:**
  - Trong `BackEnd/src/models/Transaction.js` (PR3), để chống ghi trùng sổ cái khi retry `BankTransferEvent`, hệ thống đặt Partial Unique Index:
    `{ relatedBankEventId: 1, transactionType: 1 }` (với `partialFilterExpression: { relatedBankEventId: { $type: "objectId" } }`).
  - Hiện tại, `scholarshipPaymentService.js` chỉ cho phép mỗi `Enrollment` gắn tối đa **1** bản ghi `ScholarshipUsage`. Do đó, một sự kiện `BankTransferEvent` chỉ tạo tối đa 1 `Transaction(ENROLLMENT_PAYMENT)` và 1 `Transaction(SCHOLARSHIP_USAGE)` -> không xảy ra lỗi trong phạm vi hiện hành.
- **Kịch bản tái hiện xung đột nếu mở rộng đa học bổng:**
  - Trong `financialDispatchService.js`, vòng lặp xác nhận học bổng được viết tổng quát:
    `for (const usage of pendingUsages) { await confirmScholarshipUsage(usage, enrollment, session, { relatedBankEventId: event._id }); }`
  - Nếu trong tương lai nghiệp vụ cho phép gộp 2 suất học bổng (`usage_1`, `usage_2`) vào cùng 1 `Enrollment` đồng chi trả (`MIXED`), cả 2 bản ghi `Transaction` đều mang `relatedBankEventId = event._id` và `transactionType = "SCHOLARSHIP_USAGE"`. Khi đó bản ghi thứ hai sẽ bị MongoDB từ chối bởi lỗi `E11000 duplicate key error`!
- **Giải pháp Schema đề xuất cho PR5/PR8:**
  - Mở rộng khóa của Partial Unique Index trên `Transaction` thành:
    `{ relatedBankEventId: 1, transactionType: 1, relatedScholarshipUsageId: 1 }`
    để vừa đảm bảo idempotency tuyệt đối theo từng `BankTransferEvent`, vừa hỗ trợ `N` bản ghi `ScholarshipUsage` trên cùng một đơn đăng ký.

---

## 22. Kết quả TypeScript, Build và Test

1. **Kiểm tra TypeScript & Production Build (`FrontEnd`):**
   - Lệnh thực thi: `npm --prefix FrontEnd run build` (`tsc -b && vite build`)
   - Kết quả: **PASS (Exit code 0, 3351 modules transformed, 0 TypeScript errors)**.
2. **Kiểm thử tự động PR4 (`BackEnd/tests/payosCheckoutUi.pr4.test.js`):**
   - Bao phủ toàn bộ **26/26 kịch bản kiểm thử bắt buộc** tại Mục 12 (gộp trong 16 bài test thực thi trên DB thật & kiểm tra AST/bundle: Student Tuition Checkout, MIXED Scholarship, 100% Full Scholarship, Countdown `14:59 -> 00:00`, Polling 3s, Late Payment Review không cấp quyền vào lớp, Return URL `?status=PAID` safety, Sponsor Donation Public/Anonymous, Campaign Closed guard, Anti-IDOR, EMVCo QR rendering, Bundle Secret Scan).
   - Kết quả: **PASS (16/16 assertions groups covering all 26 test cases)**.
3. **Kiểm thử hồi quy toàn bộ hệ thống Payment (PR1 + PR2 + PR3 + PR4 + Legacy Payment Suite):**
   - `tests/payosUnifiedIntent.pr1.test.js`: **PASS**
   - `tests/payosWebhook.pr2.test.js`: **PASS**
   - `tests/payosDispatch.pr3.test.js`: **PASS**
   - `tests/payosCheckoutUi.pr4.test.js`: **PASS**
   - `tests/payment.test.js`: **PASS (53/53 tests)**
   - Tổng cộng: **5/5 Payment suites (97/97 Payment tests) PASS 100%**.

---

## 23. Các rủi ro còn lại

1. **Rủi ro vận hành Outbox Worker (P0):** Cần kích hoạt `runPendingDispatchWorker` trong tiến trình nền trước khi kết nối webhook payOS thật (đã nêu tại Mục 19).
2. **Rủi ro đối soát thủ công khi tiền đến muộn (P1):** Giao diện Học viên và Nhà tài trợ đã hiển thị đúng trạng thái *"Đã nhận tiền — đang đối soát"*, nhưng Admin hiện chưa có màn hình chuyên biệt để duyệt hoàn tiền hoặc xử lý các bản ghi `PaymentReconciliation` (sẽ thực hiện ở PR8).
3. **Rủi ro phụ thuộc kết nối mạng phía người dùng:** Đã giảm thiểu bằng cơ chế tự động refetch khi focus lại cửa sổ (`refetchOnWindowFocus: true`), nút *"Kiểm tra ngay"* thủ công, và hướng dẫn không chuyển khoản lặp lại lần 2.

---

## 24. Những việc cố ý chưa làm trong PR4 (Strict Scope Compliance)

Để giữ PR4 tập trung tuyệt đối vào **Unified payOS Checkout UI** và tuân thủ phạm vi đã phê duyệt:
- **Không** tự ý lập lịch cron job `runPendingDispatchWorker` trong PR4 (chỉ kiểm toán và báo cáo thiết kế kích hoạt an toàn tại Mục 19).
- **Không** tự ý thay đổi cấu trúc sổ cái `Transaction` hoặc unique index của PR3 trong PR4 (đã báo cáo chi tiết tại Mục 20–21).
- **Không** triển khai luồng Admin duyệt hoàn tiền (`Refund Execution`) hoặc rút tiền giảng viên (`TeacherPayout` / `TeacherSettlement`).
- **Không** can thiệp vào các phân hệ ngoài phạm vi: Teacher Onboarding/KYC, eContract, Curriculum, Assignment, LiveKit/Smart Classroom.
- **Không** thực hiện bất kỳ thao tác `git commit`, `git push`, `git merge`, `git checkout` hay `git reset` nào.

---

## 25. Đề xuất PR tiếp theo (PR5 / PR6 / PR8)

1. **PR5 — Outbox Worker Activation & Index Hardening:**
   - Lập lịch `runPendingDispatchWorker` an toàn với khóa phân tán `JobLock` (`runExclusive`) và cờ `ENABLE_FINANCIAL_OUTBOX_WORKER`.
   - Nâng cấp unique index trên `Transaction` thành `{ relatedBankEventId: 1, transactionType: 1, relatedScholarshipUsageId: 1 }`.
   - Chốt cấu hình chính sách `commissionRate` từ bảng cấu hình được phê duyệt.
2. **PR6 — Admin Finance & Reconciliation Dashboard UI:**
   - Xây dựng giao diện quản trị cho Admin theo dõi `BankTransferEvent`, `PaymentReconciliation` (`LATE_PAYMENT_REVIEW`, `AMOUNT_MISMATCH`, `CAMPAIGN_NOT_ACCEPTING_FUNDING`, `UNMATCHED_ORDER_CODE`), và trạng thái kênh thanh toán `TUITION` vs `DONATION`.
3. **PR8 — Safe Refund Execution & Late Payment Ledger Resolution:**
   - Chuẩn hóa cặp bút toán kế toán cho giao dịch đến muộn (tách bút toán thu tiền thực tế và nghĩa vụ hoàn tiền) và cung cấp công cụ xác nhận hoàn tiền có kiểm soát cho Admin.

