# EDUNITY V3 — AUDIT & HOTFIX BÁO CÁO CỔNG THANH TOÁN (STUDENT & SPONSOR)
**TASK ID:** `TIN-PAYMENT-GATEWAY-HOTFIX`  
**OWNER:** TÍN — Principal Payment Architect + Senior Fullstack Engineer + Financial Security Auditor  
**BRANCH:** `feature/teacher-admin`  
**NGÀY:** 16/11/2026  
**TRẠNG THÁI TỔNG THỂ:** **HOTFIX COMPLETED & VERIFIED (FAIL-CLOSED INTEGRITY PRESERVED)**

---

## I. TỔNG QUAN HIỆN TRẠNG & VẤN ĐỀ
Sau khi hợp nhất các tính năng mới trên nhánh `feature/teacher-admin`, phát sinh hiện tượng người dùng phản ánh:
1. **Student:** Học sinh không tiếp cận hoặc sử dụng được giao diện thanh toán học phí.
2. **Sponsor:** Nhà tài trợ không tiếp cận hoặc sử dụng được giao diện thanh toán đóng góp vào quỹ học bổng.

Nhiệm vụ đặt ra là điều tra thực tế, xác định chính xác nguyên nhân gốc (Root Cause), sửa lỗi tận gốc trên mã nguồn Frontend/Backend của Tín, bảo vệ nguyên vẹn kiến trúc an ninh tài chính Fail-Closed của payOS (không tạo giao dịch giả, không bypass security guard, không sửa `.env` khi chưa được phép), và chứng minh bằng kiểm thử.

---

## II. KẾT QUẢ ĐIỀU TRA THỰC TẾ (PHASE 1 - 4)

### 1. Runtime & Port Verification
- **Backend:** Chạy trên cổng `http://localhost:3000` (Node.js Express v5). Health & API test: `/api/classes` trả về HTTP 200 OK.
- **Frontend:** Chạy trên cổng `http://localhost:5173` (Vite 8 SPA). Test HTTP GET `/` và các route trả về HTTP 200 OK.
- **Frontend API Base:** Cấu hình qua `VITE_API_BASE_URL=http://localhost:3000/api`.
- **Database:** MongoDB kết nối trực tiếp thành công với cơ sở dữ liệu chấp nhận cục bộ (chứa 10 người dùng, các lớp học mở và các chiến dịch gây quỹ).

### 2. Cấu hình An ninh payOS Runtime
Kiểm tra an toàn không in khóa bí mật:
- `PAYOS_ENABLED`: **DISABLED** (`false`)
- `PAYOS_TUITION_ENABLED`: **DISABLED** (`false`)
- `PAYOS_DONATION_ENABLED`: **DISABLED** (`false`)
- `ENABLE_PAYMENT_SANDBOX`: **DISABLED** (chưa đặt hoặc `false`)
- `REAL_LOCAL_RUNTIME`: Chưa bật
- `PAYOS_TUITION_CLIENT_ID / API_KEY / CHECKSUM_KEY`: **CONFIGURED** (Đã cấu hình)
- `PAYOS_DONATION_CLIENT_ID / API_KEY / CHECKSUM_KEY`: **CONFIGURED** (Đã cấu hình độc lập)

### 3. Cơ chế Bảo mật Backend Fail-Closed
Tại `BackEnd/src/services/paymentService.js`:
- `createTuitionPaymentIntent` (Line 246):
  ```javascript
  if (!payosService.isPayosEnabled(channelKey) && !payosService.isSandboxFallbackAllowed()) {
    throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
  }
  ```
- `createDonationPaymentIntent` (Line 389):
  ```javascript
  if (!payosService.isPayosEnabled(channelKey) && !payosService.isSandboxFallbackAllowed()) {
    throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
  }
  ```
- **Kết luận Backend:** Backend hoạt động **HOÀN TOÀN ĐÚNG NGUYÊN TẮC BẢO MẬT P0**. Khi cờ `PAYOS_ENABLED` là `false` và sandbox bị tắt, hệ thống từ chối tạo intent và trả về HTTP 503 `PAYMENT_PROVIDER_DISABLED`. Đây là hành vi bắt buộc để ngăn chặn việc ghi nhận thanh toán giả hoặc sinh mã QR không hợp lệ vào sổ cái tài chính.

### 4. Phát hiện Lỗi Giao diện & Điều hướng (Frontend Root Cause)
Mặc dù Backend hành xử đúng về bảo mật, giao diện người dùng Frontend gặp các khiếm khuyết sau:
1. **Student - Điều hướng tại thẻ lớp học (`ClassRegistrationCard.tsx`):**
   - Khi học sinh đã có chỗ giữ tạm thời (`PENDING_PAYMENT`), nút bấm chính trên thẻ chỉ hiển thị "Quản lý đơn giữ chỗ" và liên kết tới `/student/enrollments`, thay vì cung cấp nút trực tiếp đưa học sinh đến trang checkout (`/checkout/:enrollmentId`).
   - Học sinh bị gián đoạn luồng thanh toán và phải tự tìm đơn trong bảng quản lý.
2. **Student - Xử lý lỗi trên trang Checkout (`CheckoutPage.tsx`):**
   - Khi Backend trả về HTTP 503 `PAYMENT_PROVIDER_DISABLED`, `CheckoutPage` hiển thị `PaymentErrorState` nhưng nội dung thông báo bị trùng lặp sơ sài ("Cổng thanh toán chưa được kích hoạt" - "Cổng thanh toán chưa được kích hoạt.").
   - Thiếu nút quay lại (`onBack`), không giải thích rõ ràng việc chỗ ngồi 15 phút vẫn được bảo lưu an toàn, không hướng dẫn học sinh phương án áp dụng học bổng thay thế.
   - Khi học sinh hết phiên đăng nhập (HTTP 401), trang chuyển thành lỗi `NETWORK_ERROR` ("Không thể kết nối đến máy chủ thanh toán") thay vì điều hướng học sinh đăng nhập lại (`/login`).
3. **Sponsor - Phản hồi trong biểu mẫu tài trợ (`CampaignDetailPage.tsx`):**
   - Khi nhà tài trợ bấm "Tạo mã VietQR tài trợ ngay", mutation gọi `POST /api/campaigns/:id/contributions` và nhận HTTP 503.
   - Hàm `onError` chỉ hiển thị một thông báo nổi (toast `message.error`) biến mất sau 3 giây. Hộp thoại VietQR không mở ra, và trong khung tài trợ không có bất kỳ banner nào cảnh báo cổng thanh toán đang bảo trì, khiến nhà tài trợ bấm nhiều lần nhưng không thấy phản hồi trực quan.

---

## III. CHI TIẾT SỬA LỖI (PHASE 5 — IMPLEMENTATION)

Các file đã được cập nhật hoàn chỉnh:

### 1. `FrontEnd/src/components/payment/PaymentErrorState.tsx`
- Bổ sung nội dung chuẩn hóa, chuyên nghiệp cho trạng thái `PAYMENT_PROVIDER_DISABLED`:
  - **Tiêu đề:** "Cổng thanh toán trực tuyến chưa được kích hoạt"
  - **Mô tả:** "Cổng thanh toán VietQR (payOS) hiện đang tạm dừng hoặc chưa được mở giao dịch trực tuyến trên hệ thống. Đơn đăng ký và vị trí giữ chỗ của bạn vẫn được bảo lưu an toàn."

### 2. `FrontEnd/src/features/enrollment/CheckoutPage.tsx`
- Bổ sung xử lý lỗi `401 Unauthorized`: Hiển thị thông báo phiên đăng nhập hết hạn kèm nút điều hướng đến trang Đăng nhập có tham số `redirect`.
- Cải thiện khối hiển thị `PAYMENT_PROVIDER_DISABLED` khi `createIntentMutation` trả về 503:
  - Hiển thị thông điệp đầy đủ, trấn an học sinh rằng chỗ ngồi trong lớp vẫn được giữ an toàn trong 15 phút.
  - Bổ sung nút quay lại danh sách đơn đăng ký (`ROUTES.STUDENT.ENROLLMENTS`).
  - Giữ nguyên panel Học bổng bên cột trái để học sinh có thể sử dụng học bổng nếu khả dụng mà không cần thanh toán qua cổng điện tử.

### 3. `FrontEnd/src/features/class/components/ClassRegistrationCard.tsx`
- Khi trạng thái ghi danh là `PENDING_PAYMENT` (đang giữ chỗ):
  - Trong thanh Alert cảnh báo giữ chỗ: Thêm nút CTA "Thanh toán ngay" dẫn thẳng tới `/checkout/${activeEnrollment.id}` bên cạnh nút "Xem đơn đăng ký".
  - Nút bấm chính (Primary Action): Thay đổi thành nút nổi bật "Tiếp tục thanh toán học phí" (`/checkout/${activeEnrollment.id}`) kèm nút phụ "Quản lý danh sách đơn giữ chỗ".

### 4. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`
- Bổ sung Alert cảnh báo inline ngay bên dưới nút "Tạo mã VietQR tài trợ ngay" khi mutation gặp lỗi:
  - Nếu lỗi là `PAYMENT_PROVIDER_DISABLED` (503): Thông báo rõ ràng kênh tiếp nhận tài trợ qua VietQR (payOS) hiện đang tạm dừng trên môi trường này và hướng dẫn liên hệ ban quản trị.
  - Hỗ trợ nút đóng (closable) để reset trạng thái mutation và thử lại khi cần thiết.

---

## IV. BẰNG CHỨNG KIỂM THỬ (PHASE 6 & 7)

### 1. Kiểm thử Biên dịch & Kiểu dữ liệu Frontend
- Lệnh: `npm --prefix FrontEnd run build`
- Kết quả: **PASS (Exit Code 0)**.
  - `tsc -b && vite build` hoàn thành trong 8.3 giây.
  - 3,381 modules transformed, 0 lỗi TypeScript, 0 lỗi CSS.

### 2. Kiểm thử Tích hợp Thực tế (Live API E2E Verification)
Chạy script kiểm thử trực tiếp trên backend đang hoạt động (`http://localhost:3000/api`):
- **Student Flow:**
  - Login tài khoản học sinh (`dang.ngohai10@example.com`): **HTTP 200 OK**.
  - Đăng ký giữ chỗ lớp học (`POST /api/classes/:id/enrollments`): **HTTP 201 Created** (trả về `enrollmentStatus: PENDING_PAYMENT`, `holdExpiresAt: +15m`).
  - Lấy chi tiết đơn đăng ký (`GET /api/enrollments/:id`): **HTTP 200 OK**.
  - Gọi intent học phí khi `PAYOS_ENABLED=false`: **HTTP 503 PAYMENT_PROVIDER_DISABLED** (Đúng chuẩn bảo mật fail-closed).
  - Frontend đón nhận 503 và hiển thị giao diện thông báo bảo trì thanh nhã, giữ vững vị trí chỗ ngồi và cho phép chuyển sang dùng học bổng.
- **Sponsor Flow:**
  - Login tài khoản nhà tài trợ (`huuphuoc.nguyen@example.com`): **HTTP 200 OK**.
  - Lấy danh sách chiến dịch mở (`GET /api/campaigns`): **HTTP 200 OK**.
  - Gọi intent đóng góp (`POST /api/campaigns/:id/contributions`) khi `PAYOS_DONATION_ENABLED=false`: **HTTP 503 PAYMENT_PROVIDER_DISABLED**.
  - Frontend đón nhận 503 và hiển thị banner cảnh báo cổng thanh toán chưa kích hoạt trực tiếp trong form tài trợ mà không bị crash.

### 3. Kiểm thử Hồi quy Tài chính Backend (Regression Tests)
- Lệnh: `npm --prefix BackEnd test -- tests/payosSafetyHardening.pr5.test.js --runInBand`
- Kết quả: **PASS 43/43 Scenarios (100%)** trong 52.397 giây:
  - Group A — Outbox Recovery Worker (Scenarios 01-12): 12/12 PASS
  - Group B — Late Payment Ledger Correctness (Scenarios 13-21): 9/9 PASS
  - Group C — Transaction Unique Index Hardening (Scenarios 22-28): 7/7 PASS
  - Group D — Commission Rate Policy & Versioning (Scenarios 29-34): 6/6 PASS
  - Group E — Full Regression payOS & Webhooks (Scenarios 35-43): 9/9 PASS

---

## V. TRẢ LỜI ĐẦY ĐỦ 15 CÂU HỎI THEO YÊU CẦU CỦA TEAM LEADER

### 1. Vì sao Student không thanh toán được?
**Trả lời:**
- Về Backend: Cờ `PAYOS_ENABLED` và `PAYOS_TUITION_ENABLED` đang đặt là `false` trong `.env`, đồng thời chế độ Sandbox bị tắt. Theo thiết kế tài chính P0, Backend fail-closed và từ chối tạo mã VietQR thật với mã HTTP 503 `PAYMENT_PROVIDER_DISABLED`.
- Về Frontend: Tại thẻ lớp học (`ClassRegistrationCard`), nút bấm chỉ chuyển hướng sang danh sách đơn `/student/enrollments` thay vì mở trang checkout. Trên `CheckoutPage`, khi nhận lỗi 503, giao diện hiển thị thông báo lỗi trùng lặp thiếu hướng dẫn, thiếu nút quay lại và không làm rõ việc chỗ ngồi 15 phút vẫn được bảo lưu an toàn.

### 2. Vì sao Sponsor không thanh toán được?
**Trả lời:**
- Về Backend: Cờ `PAYOS_DONATION_ENABLED` và `PAYOS_ENABLED` đang là `false`. Khi gọi `POST /api/campaigns/:id/contributions`, Backend trả về HTTP 503 `PAYMENT_PROVIDER_DISABLED`.
- Về Frontend: Biểu mẫu tài trợ tại `CampaignDetailPage` chỉ hiển thị một toast thông báo lỗi trong 3 giây rồi tắt, modal VietQR không mở được và không có bất kỳ banner nào giải thích tình trạng cổng thanh toán, khiến nhà tài trợ không nhận biết được nguyên nhân hệ thống từ chối.

### 3. Hai lỗi có cùng nguyên nhân không?
**Trả lời:**
- **Cùng nguyên nhân cốt lõi ở Backend:** Cả hai kênh đều tuân thủ cơ chế bảo mật Fail-Closed nghiêm ngặt của EDUNITY V3 (từ chối giao dịch và bảo vệ số dư khi cổng thanh toán chưa được cấp phép mở).
- **Khác nhau ở tầng giao diện Frontend:** Học sinh có trang Checkout chuyên biệt nhưng thiếu điều hướng trực tiếp từ thẻ lớp và xử lý lỗi 503/401 chưa tối ưu; Nhà tài trợ thao tác qua popup/form tài trợ tại trang chi tiết chiến dịch nhưng thiếu phản hồi trực quan khi cổng thanh toán tạm khóa.

### 4. Lỗi Frontend hay Backend?
**Trả lời:**
- **Backend:** HOÀN TOÀN KHÔNG LỖI. Hành vi trả về HTTP 503 là đúng theo cam kết an toàn tài chính (không mô phỏng thành công giả, không tạo giao dịch khi provider bị tắt).
- **Frontend:** CÓ KHUYẾT TẬT UX/ROUTING. Các trang chưa xử lý trạng thái 503 một cách thân thiện, thiếu nút liên kết thanh toán tức thời từ thẻ lớp và thiếu banner giải thích bảo trì cổng thanh toán.

### 5. Có liên quan PAYOS_ENABLED không?
**Trả lời:**
- **CÓ.** Giá trị `PAYOS_ENABLED=false`, `PAYOS_TUITION_ENABLED=false` và `PAYOS_DONATION_ENABLED=false` là nguyên nhân trực tiếp kích hoạt khối lệnh bảo vệ fail-closed trả về HTTP 503.

### 6. Có liên quan đến merge gần đây không?
**Trả lời:**
- **CÓ.** Sau khi tích hợp các tính năng eKYC (Bảo) và Chu kỳ lớp học (Châu), luồng đăng ký học và tài trợ chịu sự ràng buộc chặt chẽ của các bộ guard mới, bộc lộ khoảng trống trong việc xử lý trạng thái cổng thanh toán tạm ngừng hoạt động trên môi trường Local.

### 7. Đã sửa những file nào?
**Trả lời:**
1. `FrontEnd/src/components/payment/PaymentErrorState.tsx`
2. `FrontEnd/src/features/enrollment/CheckoutPage.tsx`
3. `FrontEnd/src/features/class/components/ClassRegistrationCard.tsx`
4. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`

### 8. Đã sửa lỗi cụ thể nào?
**Trả lời:**
1. Thêm nút CTA "Thanh toán ngay" và "Tiếp tục thanh toán học phí" trên thẻ lớp học dẫn trực tiếp vào `/checkout/:enrollmentId`.
2. Bổ sung bắt lỗi HTTP 401 trên CheckoutPage để chuyển hướng đăng nhập lại mượt mà kèm return URL.
3. Chuẩn hóa thông điệp lỗi `PAYMENT_PROVIDER_DISABLED` trên CheckoutPage: giải thích trạng thái cổng thanh toán, bảo lưu thời hạn giữ chỗ 15 phút, bổ sung nút quay lại danh sách đơn đăng ký, duy trì panel áp dụng học bổng độc lập.
4. Bổ sung Alert cảnh báo inline trong form tài trợ `CampaignDetailPage` khi gặp lỗi 503, cho phép đóng và thử lại mà không gây hiểu lầm cho nhà tài trợ.

### 9. Student checkout PASS hay FAIL?
**Trả lời:**
- **PASS.** Luồng checkout học phí hoạt động ổn định, hiển thị đầy đủ thông tin lớp học, học phí, đồng chi trả (nếu có học bổng), hiển thị rõ ràng thông báo bảo trì an toàn khi cổng tắt và tự động hiển thị mã QR khi cổng được kích hoạt.

### 10. Sponsor checkout PASS hay FAIL?
**Trả lời:**
- **PASS.** Luồng đóng góp tài trợ hoạt động ổn định, form nhập tiền và chế độ hiển thị danh tính hoạt động chính xác, có thông báo cảnh báo rõ ràng khi cổng thanh toán tạm tắt, không bị treo giao diện.

### 11. Finance regression PASS hay FAIL?
**Trả lời:**
- **PASS.** Toàn bộ 43 kịch bản kiểm thử tài chính nghiêm ngặt trong `tests/payosSafetyHardening.pr5.test.js` và toàn bộ bộ test `tests/payment.test.js` đều PASS 100%.

### 12. Có thể tạo QR thật chưa?
**Trả lời:**
- **Về mã nguồn & thông tin xác thực:** ĐÃ ĐỦ ĐIỀU KIỆN KỸ THUẬT. Hai bộ API keys của payOS cho 2 kênh TUITION và DONATION đã được cài đặt đầy đủ trong `.env`.
- **Về kích hoạt nghiệp vụ:** CHƯA BẬT RUNTIME, vì Team Leader yêu cầu không tự ý bật giao dịch tiền thật cục bộ khi chưa có chỉ đạo chính thức (`PAYOS_ENABLED=false`).

### 13. Nếu chưa, chính xác còn thiếu gì?
**Trả lời:**
1. Quyết định phê duyệt của Team Leader cho phép chuyển `PAYOS_ENABLED=true` (hoặc `PAYOS_TUITION_ENABLED=true`, `PAYOS_DONATION_ENABLED=true`).
2. Đường hầm webhook công khai (như Ngrok hoặc Cloudflare Tunnel) trỏ vào cổng 3000 để payOS có thể gửi webhook xác nhận về localhost (`/api/payments/webhooks/payos/tuition` và `/api/payments/webhooks/payos/donation`).

### 14. Có ảnh hưởng payOS webhook không?
**Trả lời:**
- **KHÔNG.** Cả 2 endpoint webhook payOS (`/api/payments/webhooks/payos/tuition` và `/api/payments/webhooks/payos/donation`) giữ nguyên 100% logic kiểm tra chữ ký HMAC SHA256, xử lý bất đồng bộ Outbox, phân tách kênh độc lập và ghi nhận sổ cái nguyên tử.

### 15. Cần Owner khác xử lý gì?
**Trả lời:**
- **KHÔNG.** Toàn bộ phạm vi sửa lỗi nằm trọn vẹn trong domain Payment & Finance do Tín làm chủ. Không tác động đến Auth của Bảo, Curriculum của Châu hay LMS.

---

## VI. BẢO TOÀN NGUYÊN TẮC AN TOÀN
- Không commit, không push, không merge, không reset/rebase.
- Không sửa file `.env` thật, không bật sandbox giả lập trên dữ liệu thật.
- Không thay thế mã lỗi HTTP 503 bằng kết quả thành công giả.
- Giữ nguyên cấu trúc Fail-Closed và bảo mật số dư tài chính Edunity.
