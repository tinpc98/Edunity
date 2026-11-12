# TÀI LIỆU YÊU CẦU PHỐI HỢP LIÊN NHÓM VÀ BÀN GIAO KỸ THUẬT
**Dự án:** EDUNITY  
**Phạm vi phụ trách (Owner):** CHÂU (Backend Payment / Sponsor / Scholarship)  
**Nhánh làm việc:** `BE-2` | **Base commit tham chiếu:** `4d2892a`  
**Ngày cập nhật:** 02/11/2026  

---

## MỤC LỤC
1. [Yêu cầu phối hợp gửi BẢO (Auth, Security, App Core)](#1-yêu-cầu-phối-hợp-gửi-bảo)
2. [Yêu cầu phối hợp gửi CHỦ DỰ ÁN & DATA ARCHITECT](#2-yêu-cầu-phối-hợp-gửi-chủ-dự-án--data-architect)
3. [Yêu cầu phối hợp gửi TIN (Student, Catalog, Cron)](#3-yêu-cầu-phối-hợp-gửi-tin)
4. [API Contract gửi BĂNG (FrontEnd)](#4-api-contract-gửi-băng-frontend)
5. [Hai phát hiện kỹ thuật mới từ Source Code](#5-hai-phát-hiện-kỹ-thuật-mới-từ-source-code)
6. [Báo cáo bàn giao kỹ thuật đợt sửa lỗi PAY-01 đến PAY-06](#6-báo-cáo-bàn-giao-kỹ-thuật-đợt-sửa-lỗi)
7. [Phụ lục: Danh sách 6 điểm chờ phê duyệt liên nhóm](#7-phụ-lục-danh-sách-6-điểm-chờ-phê-duyệt-liên-nhóm)

---

## 1. YÊU CẦU PHỐI HỢP GỬI BẢO

### 1.1. Raw Body phục vụ HMAC / Chữ ký số trong `app.js`
- **Hiện trạng:** Webhook Sandbox hiện tại xác thực qua header `x-webhook-secret` bằng thuật toán an toàn thời gian thực `crypto.timingSafeEqual` (đã hoàn thành trong PAY-01).
- **Yêu cầu khi tích hợp Gateway thật (VNPay, MoMo, Stripe, PayOS):**
  - Các cổng thanh toán thực tế yêu cầu kiểm tra chữ ký số HMAC-SHA256, HMAC-SHA512 hoặc RSA dựa trên **chuỗi raw bytes nguyên bản của request body**.
  - Trong `BackEnd/src/app.js`, middleware `app.use(express.json())` đang parse body thành object. Việc chuyển đổi ngược lại qua `JSON.stringify(req.body)` làm thay đổi thứ tự key và khoảng trắng, gây sai lệch chữ ký (`Invalid Signature`).
- **Đề xuất phối hợp:** Khi triển khai cổng thanh toán chính thức, Bảo hỗ trợ cấu hình tùy chọn `verify` trong [app.js](file:///c:/CODE/Edunity/BackEnd/src/app.js) (Châu tuyệt đối không tự ý sửa file `app.js` của Bảo):
  ```javascript
  // Đề xuất sửa trong BackEnd/src/app.js (do Bảo quản lý)
  app.use(
    express.json({
      verify: (req, res, buf) => {
        if (req.originalUrl.startsWith("/api/payments/webhook")) {
          req.rawBody = buf;
        }
      }
    })
  );
  ```

### 1.2. Startup Guard: Kiểm tra biến môi trường khi khởi động server
- **Hiện trạng:** Controller thanh toán đã áp dụng cơ chế **Fail-Closed** (từ chối 401 nếu thiếu secret).
- **Yêu cầu:** Để tránh trường hợp server Production khởi động thành công nhưng không thể nhận thanh toán do quên cấu hình `.env`, đề xuất Bảo bổ sung bước kiểm tra trong [server.js](file:///c:/CODE/Edunity/BackEnd/src/server.js) hoặc file bootstrap:
  - Nếu `NODE_ENV === "production"` và thiếu biến `PAYMENT_WEBHOOK_SECRET`: Dừng khởi động ứng dụng (`process.exit(1)`) kèm log lỗi cấu hình bắt buộc.
  - Nếu ở môi trường `development` hoặc `test`: Ghi cảnh báo `console.warn` để nhà phát triển nhận biết.

### 1.3. Định dạng và sinh Secret mẫu cho Staging / Production
- **Quy chuẩn:** Tuyệt đối không lưu secret thật trong kho mã nguồn git.
- **Khuyến nghị sinh secret an toàn (CSPRNG):**
  ```bash
  # Sinh chuỗi hex ngẫu nhiên 32 bytes (256-bit entropy)
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Cấu hình mẫu cho `.env.example`:**
  ```env
  PAYMENT_WEBHOOK_SECRET=your_32_bytes_hex_secret_here
  ENABLE_PAYMENT_SANDBOX=false
  ```

### 1.4. Phối hợp cập nhật môi trường kiểm thử tích hợp tại `platform.test.js`
- **Hiện trạng sở hữu file:** Suite kiểm thử tích hợp toàn sàn [platform.test.js](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) **chưa có owner trong bảng sở hữu, cần chủ dự án chỉ định** (hiện thuộc phạm vi dùng chung/core toàn sàn).
- **Ba nguyên nhân gốc khiến 6 test tích hợp bị fail trên nhánh `BE-2`:**
  1. **Sandbox bị tắt mặc định (`ENABLE_PAYMENT_SANDBOX`):** Theo yêu cầu PAY-02, sandbox bị tắt mặc định để đảm bảo an toàn sản phẩm. Dòng 508 gọi `POST /api/enrollments/:id/payments` bị trả về HTTP 403 Forbidden.
  2. **Webhook chuyển sang Fail-Closed (`PAYMENT_WEBHOOK_SECRET`):** Theo yêu cầu PAY-01, webhook không còn cho phép đi qua khi thiếu secret (khắc phục lỗ hổng fail-open cũ). Các dòng 513, 646, 648, 833, 838 bị từ chối HTTP 401 Unauthorized do thiếu biến môi trường và header `x-webhook-secret`.
  3. **Thay đổi hợp đồng hành vi late-SUCCESS (dòng 791):** Tại dòng 791 của `platform.test.js`, test cũ khẳng định một Payment đã bị chuyển sang `FAILED` (do học bổng đóng trước) khi nhận webhook late-SUCCESS sẽ trả về kết quả `"IDEMPOTENT"`. Tuy nhiên, code chuẩn PAY-04 hiện tại trả về `"LATE_SUCCESS_FLAGGED_FOR_REVIEW"`. Đây là **thay đổi hợp đồng hành vi (breaking change)** cần Chủ dự án / PO phê duyệt.
- **Hiện trạng xử lý và file Patch:**
  - Châu đã tạo worktree ngoài repo (`..\Edunity-patch`), chỉnh sửa và chạy kiểm thử `platform.test.js` đạt **13/13 PASS (100% xanh)**.
  - Châu đã xuất diff ra file patch độc lập: `..\platform-test-fix.patch` và chạy kiểm tra thử trong repo chính bằng lệnh `git apply --check ..\platform-test-fix.patch` (kết quả khớp hoàn toàn, không xung đột).
  - Tuân thủ nghiêm ngặt quy tắc ranh giới quyền sở hữu, **Châu KHÔNG tự ý sửa file `platform.test.js` trong repo chính**. File patch `..\platform-test-fix.patch` được đính kèm bàn giao để người được Chủ dự án chỉ định áp dụng.

---

## 2. YÊU CẦU PHỐI HỢP GỬI CHỦ DỰ ÁN & DATA ARCHITECT

### 2.1. Tình trạng môi trường kiểm thử Multi-Document Transaction (Đã giải quyết)
- **Tình trạng:** Bộ kiểm thử concurrency và transaction của Payment (`PAY-03.3`, `PAY-03.4`, `PAY-03.5.1` và `PAY-EXCEPT.1..5`) đã được triển khai hoàn chỉnh bằng `MongoMemoryReplSet` phiên bản `7.0.14` có sẵn trong [tests/helpers/db.js](file:///c:/CODE/Edunity/BackEnd/tests/helpers/db.js).
- **Kết luận:** **Không còn cần yêu cầu cấp URI MongoDB Replica Set cô lập (`ISOLATED_TEST_REPLSET_URI`)** từ bên ngoài. Mọi test song song đa worker đều chạy 100% trong bộ nhớ, độc lập, an toàn và đạt 52/52 PASS.

### 2.2. Phê duyệt đề xuất lưu bản ghi Review bền vững cho các giao dịch ngoại lệ (PAY-04)
- **Vấn đề cốt lõi (RỦI RO P0):**
  - Khi ca `LATE_SUCCESS_AFTER_FAILED` xảy ra (ví dụ: học viên chuyển tiền thành công nhưng trước đó hệ thống đã đánh dấu Payment là FAILED do áp dụng học bổng), code hiện tại chỉ ghi log qua `console.warn`.
  - **Database hoàn toàn không có bản ghi nào được lưu trữ.** Nếu log hệ thống bị trôi hoặc xoay vòng (log rotation), tiền đã vào tài khoản ngân hàng của Edunity nhưng kế toán không hề biết để đối soát hay kích hoạt khóa học.
- **Biện pháp vận hành và đối soát tạm thời:**
  - Định dạng log cảnh báo có cấu trúc rõ ràng: `{ event: "LATE_SUCCESS_AFTER_FAILED", paymentId, gatewayReference, timestamp }`.
  - Thiết lập cảnh báo giám sát log tự động (Alerting) đẩy về kênh quản trị khi xuất hiện log này.
  - **Quy trình đối soát tạm của Kế toán:** Bộ phận kế toán thực hiện đối soát thủ công hằng ngày giữa sao kê hoặc báo cáo của cổng thanh toán với **MỌI Payment (không chỉ Payment COMPLETED)**, vì trong ca `late-SUCCESS`, trạng thái Payment trên hệ thống vẫn là `FAILED`. Bất kỳ mã tham chiếu nào ghi nhận `SUCCESS` ở cổng thanh toán mà Payment trên hệ thống không ở trạng thái `COMPLETED` đều phải được đưa vào danh sách xem xét đặc biệt để xử lý thủ công (kích hoạt ghi danh hoặc hoàn tiền).
- **Đề xuất dài hạn:** Tạo mới Collection `PaymentReviewQueue` khi được phê duyệt:
  ```javascript
  const paymentReviewQueueSchema = new Schema({
    itemType: { type: String, enum: ["PAYMENT", "CONTRIBUTION"], required: true },
    itemId: { type: Schema.Types.ObjectId, required: true },
    gatewayReference: { type: String, required: true, index: true },
    discrepancyType: {
      type: String,
      enum: ["LATE_SUCCESS_AFTER_FAILED", "HOLD_EXPIRED_UNCONFIRMED"],
      required: true
    },
    originalStatus: { type: String, required: true },
    gatewayStatus: { type: String, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    reviewStatus: {
      type: String,
      enum: ["PENDING_MANUAL_REVIEW", "RESOLVED_MANUAL_ENROLL", "RESOLVED_REFUNDED", "DISMISSED"],
      default: "PENDING_MANUAL_REVIEW",
      index: true
    },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 }
  }, { timestamps: true });

  paymentReviewQueueSchema.index({ reviewStatus: 1, createdAt: -1 });
  paymentReviewQueueSchema.index({ gatewayReference: 1, discrepancyType: 1 }, { unique: true });
  ```
- **Xử lý chống lỗi Duplicate Key khi Webhook Retry:**
  - Sử dụng cơ chế `upsert: true` và `$setOnInsert` kết hợp `$inc: { retryCount: 1 }` để idempotent an toàn khi nhận trùng webhook muộn.

### 2.3. Phê duyệt Partial Unique Index chống trùng lặp sổ cái `Transaction` (PAY-03)
- **Phiên bản MongoDB mục tiêu:** MongoDB 6.0+ / MongoDB Atlas (driver `mongodb: 7.5.0`, `mongoose: ^9.10.1`).
- **Đề xuất:** Tạo Partial Unique Index trên `Transaction`:
  ```javascript
  transactionSchema.index(
    { relatedPaymentId: 1, transactionType: 1 },
    {
      unique: true,
      partialFilterExpression: {
        relatedPaymentId: { $type: "objectId" }
      }
    }
  );
  ```
- **Lý do dùng Partial Index:** Vì `relatedPaymentId` có giá trị `null` đối với học bổng (`SCHOLARSHIP_USAGE`) và tài trợ (`SPONSOR_CONTRIBUTION`).
- **Hiện trạng code:** Code hiện tại vẫn tạo bản ghi `Transaction` `{ transactionType: "REFUND", status: "PENDING" }` khi giữ chỗ hết hạn. Việc duy trì hay bỏ bút toán này đang chờ quyết định chính thức từ Chủ dự án và Kế toán.
- **Cơ sở quy tắc BR-34:** Nguyên tắc "completed records must never be hard-deleted" được quy định rõ trong source code [Transaction.js:4](file:///c:/CODE/Edunity/BackEnd/src/models/Transaction.js#L4) và tài liệu kiến trúc [database-design-mongodb.md:526](file:///c:/CODE/Edunity/docs/database-design-mongodb.md#L526).

### 2.4. Truy vấn chỉ đọc cho Kế toán phát hiện giao dịch bất thường (Pre-Queue Audit Queries)
Trước khi `PaymentReviewQueue` được triển khai, Kế toán chạy 2 script truy vấn sau để phát hiện các trường hợp bất thường:

#### Truy vấn 1: Payment COMPLETED nhưng học viên chưa vào lớp (Giữ chỗ hết hạn / Lỗi ghi danh)
> [!NOTE]
> Truy vấn này **chỉ quét Payment đã ở trạng thái COMPLETED**, do đó **KHÔNG bắt được ca `late-SUCCESS`** (vì ở ca late-SUCCESS, Payment vẫn mang trạng thái `FAILED`).
```javascript
db.payments.aggregate([
  { $match: { paymentStatus: "COMPLETED" } },
  {
    $lookup: {
      from: "enrollments",
      localField: "enrollmentId",
      foreignField: "_id",
      as: "enrollment"
    }
  },
  { $unwind: "$enrollment" },
  { $match: { "enrollment.enrollmentStatus": { $nin: ["CONFIRMED", "COMPLETED"] } } },
  {
    $project: {
      _id: 1,
      gatewayReference: 1,
      amount: 1,
      paidAt: 1,
      payerUserId: 1,
      enrollmentId: 1,
      enrollmentStatus: "$enrollment.enrollmentStatus",
      holdExpiresAt: "$enrollment.holdExpiresAt"
    }
  }
]);
```

#### Truy vấn 2: Quét toàn bộ bút toán Hoàn tiền treo (`REFUND` `PENDING`)
> [!NOTE]
> **Xác minh từ source code:** Đã đọc toàn bộ source code của dự án, nhánh `else` tại [paymentService.js:205](file:///c:/CODE/Edunity/BackEnd/src/services/paymentService.js#L205) là **nơi duy nhất trong toàn hệ thống** tạo bản ghi `Transaction` có `transactionType: "REFUND"` và `status: "PENDING"`.
```javascript
db.transactions.find({
  transactionType: "REFUND",
  status: "PENDING"
}).sort({ createdAt: -1 });
```

---

## 3. YÊU CẦU PHỐI HỢP GỬI TIN

### 3.1. Hỗ trợ hiển thị trạng thái thanh toán của Học viên tại `studentRoutes.js`
- **File phụ trách của Tin:** [studentRoutes.js:8](file:///c:/CODE/Edunity/BackEnd/src/routes/studentRoutes.js#L8), `studentController.js`, `studentService.js`.
- **Endpoint:** `GET /api/me/payments`
- **Đề xuất phối hợp:**
  - Để đảm bảo ranh giới module sạch sẽ, Tin không nên truy vấn trực tiếp model review của Châu.
  - Châu đề xuất export một hàm helper từ `paymentService`: `getPaymentReviewFlags(paymentIds: ObjectId[])`.
  - **Quy ước tạm cho Frontend khi chưa có ReviewQueue:** Nếu `paymentStatus === "COMPLETED"` mà `Enrollment.enrollmentStatus` không thuộc `["CONFIRMED", "COMPLETED"]`, Frontend hiển thị nhãn: *"Đang chờ kế toán đối soát"*.

### 3.2. Đơn ghi danh và Tự động giải phóng học bổng (Không còn GAP)
- **Xác nhận từ source code:** Đã xác minh rằng [expireEnrollmentsJob.js:48](file:///c:/CODE/Edunity/BackEnd/src/jobs/expireEnrollmentsJob.js#L48) chạy mỗi phút gọi `releaseReservation` ([reservationService.js:49-63](file:///c:/CODE/Edunity/BackEnd/src/services/reservationService.js#L49-L63)). Hàm này đã tự động chuyển `ScholarshipUsage` trạng thái `PENDING` sang `RELEASED` và hoàn trả số dư `Scholarship.remainingAmount` cho học viên.
- **Kết luận:** **GAP học bổng MIXED bị giam hạn mức khi hết hạn giữ chỗ chính thức KHÔNG CÒN TỒN TẠI.** Đã có test thực tế `PAY-EXCEPT.5` chứng minh luồng giải phóng này hoạt động chuẩn xác 100%.
- **Kiến nghị Ban dự án:** Chỉ định rõ ràng một Owner duy nhất chịu trách nhiệm cho module `enrollmentRoutes.js` / `enrollmentService.js` (hiện đang nằm giữa Tin và Bảo).

---

## 4. API CONTRACT GỬI BĂNG (FRONTEND)

### 4.1. Các kết quả trả về của Webhook Endpoint (Server-to-Server)
- Tuyến `POST /api/payments/webhook` và `POST /api/payments/sandbox/webhook` là **giao tiếp Server-to-Server giữa Cổng thanh toán và Edunity Backend**.
- **Response Format gửi Cổng thanh toán:**
  ```json
  {
    "success": true,
    "data": {
      "paymentStatus": "COMPLETED | FAILED",
      "enrollmentStatus": "CONFIRMED | PENDING_PAYMENT | EXPIRED | CANCELLED | null",
      "result": "PAYMENT_SUCCESS | PAYMENT_FAILED | IDEMPOTENT | LATE_PAYMENT_PENDING_REVIEW | LATE_SUCCESS_FLAGGED_FOR_REVIEW"
    }
  }
  ```
- **Ý nghĩa các mã `result`:**
  - `PAYMENT_SUCCESS`: Giao dịch thành công lần đầu, khóa học đã được kích hoạt (`CONFIRMED`).
  - `PAYMENT_FAILED`: Cổng báo giao dịch thất bại.
  - `IDEMPOTENT`: Webhook lặp lại của giao dịch đã hoàn tất trước đó. Trả về HTTP 200 để cổng ngừng retry.
  - `LATE_PAYMENT_PENDING_REVIEW`: Webhook thành công nhưng giữ chỗ lớp học đã hết hạn (`holdExpiresAt <= now`) hoặc Enrollment không ở PENDING_PAYMENT, hoặc tổng tiền chưa đủ học phí. Hệ thống tạo Transaction `REFUND` `PENDING`.
  - `LATE_SUCCESS_FLAGGED_FOR_REVIEW`: Webhook thành công đến sau khi Payment đã bị FAILED trước đó (ví dụ do học viên đổi sang dùng học bổng và hệ thống chủ động đóng FAILED lệnh thanh toán cũ).
    > [!WARNING]
    > **Breaking Change cần thống nhất:** Đối với Payment đã bị học bổng đóng FAILED, kết quả webhook trả về đổi từ `"IDEMPOTENT"` sang `"LATE_SUCCESS_FLAGGED_FOR_REVIEW"`. Trạng thái Payment giữ nguyên `FAILED`, không tạo `TeacherEarning` và không tự động kích hoạt khóa học. Cần FrontEnd và Core thống nhất mã này.

### 4.2. Danh sách Enum chuẩn từ Source Code Backend
1. **`Payment.paymentStatus` ([Payment.js](file:///c:/CODE/Edunity/BackEnd/src/models/Payment.js)):**
   - `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`.
2. **`Enrollment.enrollmentStatus` ([Enrollment.js](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js)):**
   - `PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`.
3. **`Enrollment.paymentSource`:**
   - `FREE`, `DIRECT_PAYMENT`, `SCHOLARSHIP`, `MIXED`.
4. **`Transaction.transactionType` ([Transaction.js](file:///c:/CODE/Edunity/BackEnd/src/models/Transaction.js)):**
   - `ENROLLMENT_PAYMENT`, `SCHOLARSHIP_USAGE`, `SPONSOR_CONTRIBUTION`, `TEACHER_PAYOUT`, `REFUND`.

### 4.3. Định dạng dữ liệu trả về từ Endpoint tra cứu (Serialize Format)
> [!NOTE]
> Toàn bộ dữ liệu trả về đều đi qua `serializeDecimal128` ([serialize.js](file:///c:/CODE/Edunity/BackEnd/src/utils/serialize.js)). Do đó:
> - Các trường tiền tệ (như `amount`) luôn là **kiểu chuỗi (string)**, ví dụ `"1000000"`, không phải kiểu number.
> - Các trường `_id` được convert thành string và tự động sinh thêm thuộc tính alias `id: string`.
> - Dưới đây là cấu trúc thật, giá trị minh họa:

```json
// GET /api/enrollments/:id/payments — Lịch sử thanh toán của đơn ghi danh
{
  "success": true,
  "data": [
    {
      "id": "6724a1b2c3d4e5f6a7b8c9d0",
      "_id": "6724a1b2c3d4e5f6a7b8c9d0",
      "enrollmentId": "6724a1b2c3d4e5f6a7b8c9a1",
      "payerUserId": "6724a1b2c3d4e5f6a7b8c9a2",
      "gateway": "SANDBOX",
      "gatewayReference": "SBX-12345678-abcd",
      "amount": "1000000",
      "paymentStatus": "COMPLETED",
      "paidAt": "2026-11-01T10:00:00.000Z",
      "createdAt": "2026-11-01T09:55:00.000Z",
      "updatedAt": "2026-11-01T10:00:00.000Z"
    }
  ]
}
```

---

## 5. HAI PHÁT HIỆN KỸ THUẬT MỚI TỪ SOURCE CODE

1. **Nguồn thực tế gây ra FAILED trước khi webhook SUCCESS đến:**
   - Tại [scholarshipPaymentService.js:146-150](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L146-L150), khi học viên đã tạo lệnh thanh toán học phí trước đó (Payment ở `PENDING`), sau đó chuyển sang áp dụng học bổng, hệ thống chủ động gọi:
     ```javascript
     await Payment.updateMany(
       { enrollmentId: enrollment._id, paymentStatus: "PENDING" },
       { $set: { paymentStatus: "FAILED" } },
       { session }
     );
     ```
   - Nếu học viên đã chuyển khoản hoặc quét mã QR trước đó tại ứng dụng ngân hàng, webhook SUCCESS từ cổng sẽ gửi đến cho Payment mang trạng thái FAILED này. Đây chính là nguồn thực tế sinh ra ca `LATE_SUCCESS_AFTER_FAILED`.
2. **Nhánh `else` trong `paymentService.processWebhook` rộng hơn mô tả:**
   - Tại [paymentService.js:141-157 và 202-221](file:///c:/CODE/Edunity/BackEnd/src/services/paymentService.js#L141-L221), nhánh `else` được kích hoạt khi `updateRes.modifiedCount !== 1`.
   - Ngoài việc giữ chỗ hết hạn (`holdExpiresAt <= now`) và đơn bị hủy/hết hạn, nhánh này còn chạy khi **tổng tiền thanh toán chưa đủ học phí** (`totalPaid < tuitionAmount`) ngay cả khi thời gian giữ chỗ vẫn còn hiệu lực.
   - Khi đó, code hiện tại vẫn tạo bút toán `REFUND` `PENDING` và trả về `LATE_PAYMENT_PENDING_REVIEW`. Tên mã kết quả này chưa phản ánh chính xác trường hợp đóng thiếu tiền khi hạn giữ chỗ vẫn còn (đây là điểm đề xuất chờ Ban dự án xem xét, Châu không tự ý đổi mã API).

---

## 6. BÁO CÁO BÀN GIAO KỸ THUẬT ĐỢT SỬA LỖI

### 6.1. Trạng thái PAY-05 & GAP Idempotency-Key
- **PAY-05 (Định tuyến Webhook):** Hạ từ GAP xuống **"Lưu ý khi tích hợp cổng thật"**. Hiện tại hệ thống tự sinh mã tham chiếu tài trợ mang tiền tố `SBX-C-` ([contributionService.js:35](file:///c:/CODE/Edunity/BackEnd/src/services/contributionService.js#L35)) và chưa nối cổng thật. Do đó định tuyến theo tiền tố hoạt động hoàn toàn chính xác. Khi gắn cổng thật trong tương lai, khuyến nghị chuyển sang cơ chế **Record Lookup**.
- **Khôi phục GAP (Tài trợ):** Endpoint `POST /api/campaigns/:id/contributions` hiện chưa hỗ trợ header `Idempotency-Key` ở mức HTTP request. Nếu Sponsor bấm nút thanh toán nhiều lần trên mạng chập chờn, hệ thống có thể tạo ra nhiều Payment Intent PENDING khác nhau.

### 6.2. Kết quả kiểm thử thực tế
- File test: [BackEnd/tests/payment.test.js](file:///c:/CODE/Edunity/BackEnd/tests/payment.test.js)
- **Kết quả đo thực tế:** **52 PASS / 0 FAIL / 0 SKIPPED** (100% xanh).
- **Thời gian chạy thực tế:** ~4.873 giây.
- Bao gồm 44 unit mock tests và 8 integration/concurrency tests chạy trên `MongoMemoryReplSet` cô lập.

---

## 7. PHỤ LỤC: DANH SÁCH 6 ĐIỂM CHỜ PHÊ DUYỆT LIÊN NHÓM

| STT | Nội dung đề xuất phê duyệt | Người duyệt chịu trách nhiệm | Hậu quả nếu không phê duyệt / trì hoãn |
| :---: | :--- | :--- | :--- |
| **1** | **Cổng thanh toán thật & Cơ chế xác thực chữ ký (HMAC / Raw Body, chống replay attack)** | **PO / Bảo (Lead Security & App Core)** | Khi kết nối cổng thanh toán thật (VNPay, MoMo, PayOS), hệ thống không thể xác thực chữ ký số do thiếu raw body (lỗi `Invalid Signature`), hoặc có nguy cơ bị tấn công replay webhook do secret tĩnh không có nonce/timestamp. |
| **2** | **Quy định sàn/trần tiền tài trợ và Idempotency-Key cho API đóng góp tài trợ** | **PO / Kế toán / Châu (BE-2)** | Nhà tài trợ có thể gửi số tiền dưới chi phí giao dịch (ví dụ: 1.000 VNĐ), hoặc khi mạng chập chờn nhấn nhiều lần sẽ tạo nhiều Intent PENDING rác trên database. |
| **3** | **Dọn sạch bản ghi `Transaction` trùng lặp trước khi đánh Partial Unique Index** | **Data Architect / DBA / Chủ dự án** | Lệnh tạo Index trên MongoDB Production / Atlas sẽ bị lỗi (`Index creation failed: E11000 duplicate key error`) và làm gián đoạn triển khai migration nếu dữ liệu lịch sử đã có bản ghi trùng lặp.<br>*(Kèm query kiểm tra bên dưới)* |
| **4** | **Chỉ định một Owner duy nhất cho phân hệ Ghi danh (`enrollment*`)** | **PO / Chủ dự án** | Ranh giới trách nhiệm mập mờ giữa Tin và Bảo dẫn đến tình trạng đùn đẩy trách nhiệm, thiếu kiểm soát thống nhất khi xử lý vòng đời đơn giữ chỗ, thanh toán và hủy ghi danh. |
| **5** | **Duyệt hợp đồng `LATE_SUCCESS_FLAGGED_FOR_REVIEW` và áp dụng patch `platform.test.js`** | **PO / Lead / Core (Bảo hoặc Chủ dự án)** | Suite test toàn sàn `platform.test.js` trong repo chính vẫn bị fail 6 test do test cũ kỳ vọng hành vi cũ (`IDEMPOTENT`, sandbox bật sẵn, secret mở); pipeline CI/CD kiểm thử toàn sàn không thể xanh. |
| **6** | **Chuẩn hóa mã kết quả API cho trường hợp đóng thiếu tiền học phí (`totalPaid < tuitionAmount`)** | **PO / Băng (FrontEnd)** | Hệ thống tiếp tục trả về mã `LATE_PAYMENT_PENDING_REVIEW` khiến học viên và màn hình FrontEnd hiểu nhầm là thanh toán muộn mặc dù thời hạn giữ chỗ của đơn vẫn còn hiệu lực. |

#### Script tự kiểm tra bản ghi Transaction trùng lặp trước khi đánh Index (Mục 3):
```javascript
db.transactions.aggregate([
  { $match: { relatedPaymentId: { $ne: null } } },
  {
    $group: {
      _id: {
        relatedPaymentId: "$relatedPaymentId",
        transactionType: "$transactionType"
      },
      count: { $sum: 1 }
    }
  },
  { $match: { count: { $gt: 1 } } }
]);
```
*(Nếu kết quả trả về rỗng: Dữ liệu sạch, sẵn sàng đánh Partial Unique Index an toàn).*

---

## 8. BÀN GIAO KỸ THUẬT PHASE 2: `CUR-09` — SNAPSHOT GIÁO TRÌNH & CHÍNH SÁCH HỌC PHÍ TRÊN `Class` / `Enrollment` (GỬI TIN)

### 8.1. Phạm vi & Ranh giới sở hữu
- **Châu đã triển khai (`Class.js`, `classCreationGateService.js`, `coursePricingPolicyService.js`, `teacherClassService.js`, `adminClassService.js`):**
  - Bổ sung các trường snapshot trên [`Class`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js):
    - `syllabusVersionId`, `syllabusVersionNumber`
    - `pricingPolicyId`, `pricingPolicyKey`, `pricingPolicyVersion`, `pricingPolicySnapshot` (`policyId`, `policyKey`, `version`, `scopeType`, `classType`, `allowFree`, `minPrice`, `maxPrice`, `minSessions`, `maxSessions`, `effectiveFrom`, `effectiveTo`, `capturedAt`)
  - Bổ sung sẵn các trường snapshot tương ứng (nullable `default: null`, tương thích ngược 100%) trên [`Enrollment`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js).
  - Lớp học tự động ghi snapshot tại `createClass`, `updateClass`, `submitClass` và khóa snapshot cuối cùng khi Admin `approveClass` (`PENDING_APPROVAL -> OPEN`). Việc xuất bản `SyllabusVersion` mới hoặc tạo `CoursePricingPolicy` v2 sau thời điểm này **không** làm thay đổi snapshot của lớp đã mở.
- **Tin cần bổ sung trong `BackEnd/src/services/enrollmentService.js` (Châu KHÔNG tự ý sửa file của Tin):**
  1. Import helper chuẩn từ `coursePricingPolicyService` (hoặc `classCreationGateService`):
     ```javascript
     const { buildEnrollmentSnapshotFromClass } = require("./coursePricingPolicyService");
     ```
  2. Trong `createEnrollment` (sau khi fetch `targetClass` trong transaction, ngay trước `new Enrollment({ ... })`), gắn snapshot vào document `Enrollment`:
     ```javascript
     const cur09Snapshot = buildEnrollmentSnapshotFromClass(targetClass);
     const enrollmentDoc = new Enrollment({
       classId: targetClass._id,
       courseId: targetClass.courseId,
       teacherId: targetClass.teacherId,
       studentId,
       enrollmentStatus,
       paymentSource,
       tuitionAmount,
       enrolledAt: now,
       holdExpiresAt,
       ...cur09Snapshot,
     });
     ```
  3. **Quy tắc bất biến:** Không cập nhật lại `Enrollment.syllabusVersionId` / `Enrollment.pricingPolicySnapshot` sau khi đơn ghi danh được tạo, ngay cả khi khóa học gốc chỉnh sửa hoặc archive phiên bản giáo trình/chính sách sau này.
