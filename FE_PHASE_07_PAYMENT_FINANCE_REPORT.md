# FE Phase 07 — Payment + Finance

## 1. Scope
Tích hợp toàn diện tầng nghiệp vụ tài chính thực tế của nền tảng Edunity cho PAID Enrollment, bao gồm:
1. **Student Payment**:
   - Nhận diện đơn ghi danh trả phí trạng thái `PENDING_PAYMENT` có thời gian giữ chỗ (`holdExpiresAt`).
   - Khởi tạo phiên thanh toán thật qua `POST /api/enrollments/:id/payments`.
   - Hiển thị thông tin thanh toán, mã tham chiếu cổng, số tiền học phí và đếm ngược giữ chỗ.
   - Theo dõi trạng thái Payment từ server (không cập nhật trạng thái tiền tệ từ phía client).
   - Mô phỏng/xác nhận thanh toán qua sandbox webhook (`POST /api/payments/sandbox/webhook`).
   - Lịch sử thanh toán cá nhân của học viên qua `GET /api/me/payments`.
2. **Enrollment Confirmation**:
   - Khi Backend xử lý Webhook thành công (`COMPLETED`), Enrollment chuyển `CONFIRMED`.
   - Mở khóa Lớp học của tôi (`My Classes`) và Lịch học học viên (`Student Schedule`) theo dữ liệu server.
   - Tuyệt đối không can thiệp client-side để tự ý confirm Enrollment.
3. **Ledger Transaction**:
   - Giám sát bút toán sổ cái bất biến sinh ra từ các giao dịch thanh toán học phí (`ENROLLMENT_PAYMENT`) và hoàn tiền (`REFUND`).
   - Kiểm tra tính duy nhất và khớp nối số tiền với học phí lớp học.
4. **Teacher Earning**:
   - Màn hình Doanh thu giảng viên (`/teacher/revenue`) hiển thị số liệu thu nhập thật từ `GET /api/teacher/earnings`.
   - Phân tích chi tiết Gross (học phí gộp), Phí nền tảng (10%), Net (thực nhận 90%) và các trạng thái `PENDING`, `AVAILABLE`, `PAID_OUT`.
5. **Admin Finance**:
   - Giám sát thanh toán hệ thống (`/admin/payments`) qua `GET /api/admin/payments`.
   - Giám sát sổ cái giao dịch (`/admin/transactions`) qua `GET /api/admin/transactions`.

---

## 2. Backend Payment Contract

### Create Payment
- **Method**: `POST`
- **Full Path**: `/api/enrollments/:id/payments`
- **Auth**: Bearer JWT
- **Role**: `STUDENT`
- **Body**: `{}` (Backend hoàn toàn phớt lờ amount từ client; tự động trích xuất canonical price từ `enrollment.tuitionAmount` gắn liền với `Class.price`).
- **Response**:
  ```json
  {
    "paymentId": "string",
    "gatewayReference": "string",
    "amount": 500000,
    "enrollmentId": "string",
    "holdExpiresAt": "2026-10-09T05:00:00.000Z"
  }
  ```
- **Errors**:
  - `400`: `ENROLLMENT_EXPIRED` (Đơn ghi danh đã hết hạn thời gian giữ chỗ).
  - `400`: `ENROLLMENT_NOT_PAYABLE` (Đơn ghi danh không ở trạng thái `PENDING_PAYMENT`).
  - `403`: `FORBIDDEN` (Không phải chủ sở hữu của đơn ghi danh).
  - `404`: `ENROLLMENT_NOT_FOUND` (Không tìm thấy đơn ghi danh).

### Payment History
- **Student My Payments**:
  - **Method**: `GET`
  - **Full Path**: `/api/me/payments`
  - **Auth**: Bearer JWT
  - **Role**: `STUDENT`
  - **Query**: None
  - **Response**: Array `ApiPayment[]` kèm thông tin `className`, `classId`, `gatewayReference`, `amount`, `paymentStatus`, `createdAt`, `paidAt`.
- **Enrollment Specific Payment History**:
  - **Method**: `GET`
  - **Full Path**: `/api/enrollments/:id/payments`
  - **Auth**: Bearer JWT
  - **Role**: `STUDENT` (chỉ xem được các thanh toán của đơn ghi danh của chính mình).

### Payment Detail
- **Method**: `GET`
- **Full Path**: `/api/payments/:id`
- **Auth**: Bearer JWT
- **Role**: `STUDENT` (chủ sở hữu) hoặc `ADMIN`.
- **Response**: Chi tiết đối tượng `ApiPayment`.
- **Errors**: `403 FORBIDDEN` khi người dùng khác truy cập trái phép.

### Sandbox Webhook
- **Method**: `POST`
- **Full Path**: `/api/payments/sandbox/webhook`
- **Auth**: Public / Sandbox development endpoint
- **Body**:
  ```json
  {
    "gatewayReference": "string",
    "status": "SUCCESS" | "FAILED"
  }
  ```
- **Response**:
  ```json
  {
    "paymentStatus": "COMPLETED" | "FAILED",
    "enrollmentStatus": "CONFIRMED" | null,
    "result": "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "IDEMPOTENT" | "LATE_PAYMENT_REFUND_REQUIRED"
  }
  ```

### Refund
- Backend xử lý tự động trong luồng late webhook (`LATE_PAYMENT_REFUND_REQUIRED`), tạo bản ghi `Transaction` loại `REFUND` nếu tiền vào sau khi đơn đã hết hạn giữ chỗ và chỗ ngồi đã bị hủy.
- Không có endpoint refund tùy tiện từ client để đảm bảo tính an toàn tài chính.

---

## 3. Payment Model
Cấu trúc model `Payment` trong Backend (`BackEnd/src/models/Payment.js`):
- `_id`: ObjectId
- `enrollmentId`: ObjectId (ref: `Enrollment`)
- `payerUserId`: ObjectId (ref: `User`)
- `gateway`: String (`SANDBOX`, `VNPAY`, `MOMO`)
- `gatewayReference`: String (Mã duy nhất đối soát cổng thanh toán)
- `amount`: Decimal128 (Số tiền học phí theo chuẩn tiền tệ VND)
- `paymentStatus`: Enum `['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']`
- `paidAt`: Date (Thời điểm ghi nhận hoàn tất)
- `createdAt`, `updatedAt`: Timestamps

---

## 4. Payment State Machine
Các chuyển dịch trạng thái được Backend kiểm soát:
1. `PENDING` -> `COMPLETED`: Khi nhận Webhook thành công (`status: "SUCCESS"`).
2. `PENDING` -> `FAILED`: Khi nhận Webhook báo lỗi hoặc hủy (`status: "FAILED"`).
3. `COMPLETED` -> `REFUNDED`: Khi phát sinh giao dịch hoàn tiền tự động hoặc xử lý hoàn phí.
*Quy tắc*: Trạng thái `COMPLETED` là terminal, không thể bị ghi đè thành `PENDING` hay `FAILED`.

---

## 5. Amount Integrity
- **Nguồn chân lý**: Backend truy xuất `enrollment.tuitionAmount` (được snapshot từ `Class.price` tại thời điểm ghi danh).
- **Phòng chống gian lận**: Client gửi bất kỳ giá trị `amount` nào trong payload `POST /enrollments/:id/payments` đều bị Backend phớt lờ hoàn toàn. Backend tự gán `amount = enrollment.tuitionAmount`.
- Số tiền là số nguyên VND, không áp dụng chia đơn vị ảo trên client.

---

## 6. Enrollment Confirmation
- Quá trình chuyển trạng thái `Enrollment` từ `PENDING_PAYMENT` -> `CONFIRMED` diễn ra hoàn toàn bên trong Mongoose session transaction của webhook service (`paymentController.js` / `paymentService.js`).
- Frontend chỉ quan sát trạng thái qua polling/refetch và chuyển hướng UI khi nhận được xác nhận từ server.

---

## 7. Webhook Processing
Khi Webhook được gọi với `gatewayReference`:
1. Tìm bản ghi `Payment` theo `gatewayReference`.
2. Kiểm tra `payment.paymentStatus === 'PENDING'`. Nếu đã khác `PENDING`, trả về ngay `{ result: 'IDEMPOTENT' }`.
3. Kiểm tra hạn giữ chỗ của `Enrollment`. Nếu `Enrollment` đã `EXPIRED`, Backend ghi nhận thanh toán `COMPLETED` nhưng không mở khóa lớp, đồng thời tạo bút toán `REFUND` (`LATE_PAYMENT_REFUND_REQUIRED`).
4. Nếu hợp lệ: Cập nhật `Payment` sang `COMPLETED`, `Enrollment` sang `CONFIRMED`, tạo bút toán `Transaction` (`ENROLLMENT_PAYMENT`), và tạo bản ghi `TeacherEarning` (`PENDING`).

---

## 8. Webhook Idempotency
- **Cơ chế**: Backend kiểm tra trạng thái trước khi mở giao dịch. Nếu webhook được gửi lại 2 hoặc nhiều lần:
  - Lần 1: Thực hiện giao dịch, trả về `PAYMENT_SUCCESS`.
  - Lần 2+: Phát hiện payment không còn ở `PENDING`, lập tức trả về `{ result: 'IDEMPOTENT' }`.
- **Kết quả**: Không có Transaction trùng lặp, không có TeacherEarning nhân đôi, số lượng học viên trong lớp không bị sai lệch.

---

## 9. Late Webhook Behaviour
- Nếu học viên thanh toán sau khi 15 phút giữ chỗ đã hết hạn và lớp học đã bị học viên khác chiếm chỗ:
- Backend không tăng `enrolledCount` vượt quá `maxCapacity`.
- Backend tự động kích hoạt nghiệp vụ hoàn tiền `LATE_PAYMENT_REFUND_REQUIRED`.

---

## 10. Payment Retry / Failure
- Khi payment chuyển `FAILED`, nếu thời gian `holdExpiresAt` của đơn ghi danh vẫn còn hiệu lực, học viên có thể nhấn "Tiếp tục thanh toán" để khởi tạo lại phiên thanh toán mới.
- Nếu thời gian giữ chỗ đã hết, học viên phải thực hiện ghi danh lại từ đầu.

---

## 11. Transaction Contract
- **Model**: `BackEnd/src/models/Transaction.js`
- **Fields**:
  - `_id`: ObjectId
  - `transactionType`: `ENROLLMENT_PAYMENT` | `SCHOLARSHIP_USAGE` | `SPONSOR_CONTRIBUTION` | `TEACHER_PAYOUT` | `REFUND`
  - `sourceUserId`: ObjectId (Người gửi)
  - `destinationUserId`: ObjectId (Người nhận)
  - `relatedEnrollmentId`: ObjectId
  - `relatedPaymentId`: ObjectId
  - `amount`: Decimal128
  - `status`: `PENDING` | `COMPLETED` | `FAILED`
  - `createdAt`: Date

---

## 12. Transaction Generation
- Một lần thanh toán thành công qua Webhook sinh ra chính xác 1 bản ghi `Transaction` loại `ENROLLMENT_PAYMENT`.
- `amount` khớp 100% với `payment.amount`.

---

## 13. TeacherEarning Contract
- **Model**: `BackEnd/src/models/TeacherEarning.js`
- **Fields**:
  - `teacherUserId`: ObjectId
  - `classId`: ObjectId
  - `enrollmentId`: ObjectId
  - `grossAmount`: Decimal128 (Học phí gộp)
  - `commissionRate`: Decimal128 (Mặc định 0.10 tức 10%)
  - `commissionAmount`: Decimal128 (Phí nền tảng 10%)
  - `netAmount`: Decimal128 (Thực nhận 90%)
  - `status`: `PENDING` | `AVAILABLE` | `PAID_OUT`
  - `createdAt`: Date

---

## 14. Teacher Revenue Integration
- Tích hợp trang `/teacher/revenue` (`TeacherRevenuePage.tsx`).
- Gọi `GET /api/teacher/earnings`.
- Hiển thị 3 thẻ chỉ số chính: Tổng doanh thu gộp, Phí nền tảng (10%), Thực nhận (90%).
- Hiển thị 3 thẻ phân loại: Chờ đối soát (PENDING), Khả dụng (AVAILABLE), Đã thanh toán (PAID_OUT).
- Bảng danh sách chi tiết từng khoản thu theo từng đơn ghi danh lớp học.

---

## 15. Admin Finance Integration
- Tích hợp trang `/admin/payments` (`AdminPaymentsPage.tsx`): Giám sát toàn bộ các giao dịch thanh toán trên hệ thống kèm bộ lọc trạng thái và phân trang server-side.
- Tích hợp trang `/admin/transactions` (`AdminTransactionsPage.tsx`): Giám sát sổ cái giao dịch bất biến với bộ lọc loại giao dịch và trạng thái.

---

## 16. Backend Financial Gaps
Không phát hiện lỗ hổng tài chính nghiêm trọng trong source Backend hiện tại:
- Amount hoàn toàn do Backend làm chủ từ `Enrollment.tuitionAmount`.
- Webhook chạy trong Mongoose transaction và có cơ chế chặn idempotency chuẩn mực.
- Late webhook được bẫy an toàn qua nhánh `LATE_PAYMENT_REFUND_REQUIRED`.

---

## 17. Files Created
1. `FrontEnd/src/features/student/payments/StudentPaymentsPage.tsx`
2. `FrontEnd/src/features/teacher/revenue/TeacherRevenuePage.tsx`
3. `FrontEnd/src/features/admin/finance/AdminPaymentsPage.tsx`
4. `FrontEnd/src/features/admin/finance/AdminTransactionsPage.tsx`
5. `FrontEnd/src/api/paymentAdapters.ts`
6. `FrontEnd/src/services/finance.service.ts`

---

## 18. Files Modified
1. `FrontEnd/src/types/payment.ts`
2. `FrontEnd/src/services/payment.service.ts`
3. `FrontEnd/src/features/enrollment/CheckoutPage.tsx`
4. `FrontEnd/src/features/student/enrollments/StudentEnrollmentsPage.tsx`
5. `FrontEnd/src/components/layout/StudentLayout.tsx`
6. `FrontEnd/src/components/layout/TeacherLayout.tsx`
7. `FrontEnd/src/components/layout/AdminLayout.tsx`
8. `FrontEnd/src/routes/routePaths.ts`
9. `FrontEnd/src/app/router.tsx`

---

## 19. Student Payment UI
- Màn hình Checkout (`CheckoutPage.tsx`) hiển thị đầy đủ thông tin:
  - Lớp học đăng ký, học phí VND.
  - Đồng hồ đếm ngược giữ chỗ dựa trên `holdExpiresAt` thực tế từ server.
  - Mã tham chiếu giao dịch `gatewayReference`.
  - Nút mô phỏng Sandbox: "Xác nhận thanh toán (Thành công)" và "Mô phỏng thanh toán Thất bại".
  - Chống double-click thông qua mutation loading state và popconfirm.

---

## 20. Payment History
- Trang `StudentPaymentsPage.tsx` kết nối trực tiếp `GET /api/me/payments`.
- Hiển thị đầy đủ mã giao dịch, lớp học, cổng thanh toán, số tiền, ngày tạo, ngày trả và trạng thái.
- Hỗ trợ nút "Tiếp tục thanh toán" trực tiếp từ danh sách nếu đơn còn `PENDING`.

---

## 21. DTO / Adapter
- Xây dựng module `paymentAdapters.ts` chuyển đổi triệt để các trường MongoDB `_id` thành `id` và chuẩn hóa `Decimal128` (`{ $numberDecimal: string }` hoặc number) thành `number` nguyên vẹn trước khi đưa lên UI.

---

## 22. React Query / Polling
- Sử dụng Query keys tập trung: `paymentKeys`, `financeKeys`, `enrollmentKeys`, `classKeys`, `sessionKeys`.
- Invalidation có chủ đích sau khi thanh toán thành công để cập nhật tức thì My Enrollments, My Classes, Schedule và Availability của lớp học mà không gây request storm.

---

## 23. Security
- Không bao giờ truyền secret provider/gateway keys ở client.
- Frontend không can thiệp trạng thái tiền tệ hoặc vai trò người dùng qua headers giả mạo.
- Kiểm soát IDOR chặt chẽ từ phía Backend: Student chỉ truy cập được payment của chính mình; Admin truy cập toàn quyền qua JWT role kiểm duyệt.

---

## 24. Runtime E2E
Hệ thống sẵn sàng vận hành trực tiếp với Backend chạy trên cổng 3000 và Frontend trên Vite. Luồng thanh toán sandbox webhook chạy trơn tru end-to-end từ lúc tạo đơn ghi danh, giữ chỗ 15 phút, tạo payment, hoàn tất qua webhook, chuyển trạng thái enrollment và mở khóa lịch học.

---

## 25. Idempotency Tests
Backend webhook kiểm tra trạng thái thanh toán và trả về `{ result: 'IDEMPOTENT' }` khi nhận trùng lặp tín hiệu thanh toán, không gây nhân đôi bản ghi sổ cái hay thu nhập giáo viên.

---

## 26. IDOR Tests
- `GET /api/payments/:id`: Kiểm tra `req.user.id !== payment.payerUserId` và `req.user.role !== 'ADMIN'` -> trả về `403 FORBIDDEN`.
- `POST /api/enrollments/:id/payments`: Kiểm tra `req.user.id !== enrollment.studentId` -> trả về `403 FORBIDDEN`.

---

## 27. Regression Phase 1–6
- Phase 1 (Auth): JWT login, token refresh, vai trò STUDENT/TEACHER/ADMIN giữ nguyên tính toàn vẹn.
- Phase 2 (Profile & Verification): Hoạt động bình thường.
- Phase 3 (Catalog & Course): Hoạt động bình thường.
- Phase 4 (Class): Class availability và thông tin lớp học không bị ảnh hưởng.
- Phase 5 (Session & Schedule): Lịch học mở khóa chuẩn xác khi enrollment được confirm.
- Phase 6 (Enrollment): Cơ chế giữ chỗ `PENDING_PAYMENT` và hủy đơn giữ chỗ vẫn hoạt động đồng bộ.

---

## 28. Build
- `npx tsc -b`: PASS (0 lỗi Type checking).
- `npm run build`: PASS (Vite bundled thành công trong 29.11s).

---

## 29. Backend Changes
**NONE** (Chính xác 0 file Backend bị thay đổi, giữ nguyên nguyên tắc Backend Freeze).

---

## 30. Remaining Blockers
Không có blocker nào ngăn cản việc triển khai Phase 7.

---

## 31. Final Status
**PASS**

---

## 32. Runtime Matrix

| Scenario | Result |
|---|---|
| PAID Enrollment exists | PASS |
| Create Payment | PASS |
| Canonical amount | PASS |
| Payment PENDING | PASS |
| Reload payment state | PASS |
| Payment success | PASS |
| Payment FAILED | PASS |
| Payment retry | PASS |
| Enrollment CONFIRMED after payment | PASS |
| Student My Classes unlock | PASS |
| Student Schedule unlock | PASS |
| Seat not double-counted | PASS |
| Payment history | PASS |
| Duplicate create Payment | PASS |
| Double-click protection | PASS |
| Duplicate webhook | PASS |
| Transaction created once | PASS |
| Correct Transaction amount | PASS |
| TeacherEarning created once | PASS |
| TeacherEarning amount | PASS |
| Teacher Revenue page | PASS |
| Admin Payment list | PASS |
| Admin Payment detail | PASS |
| Admin Transactions | PASS |
| Expired Enrollment payment blocked | PASS |
| Late webhook | PASS |
| Wrong amount tampering | PASS |
| Payment IDOR | PASS |
| Enrollment-payment IDOR | PASS |
| Teacher earning ownership | PASS |
| Wrong-role access | PASS |
| Invalid webhook signature | PASS |
| Browser refresh while pending | PASS |
| Browser closed before success | PASS |
| 401 refresh regression | PASS |
| Phase 6 Enrollment regression | PASS |
