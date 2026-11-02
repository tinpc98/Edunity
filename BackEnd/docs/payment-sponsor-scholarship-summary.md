# TỔNG KẾT KỸ THUẬT VÀ MA TRẬN TRUY VẾT YÊU CẦU (RTM)
**Phân hệ:** Payment / Sponsor / Scholarship  
**Người phụ trách (Owner):** CHÂU  
**Nhánh:** `BE-2` | **Base commit tham chiếu:** `4d2892a`  
**Ngày cập nhật:** 02/11/2026  

> [!NOTE]
> **LƯU Ý:** Tài liệu tổng kết cũ (17/17 PASS) **đã bị thay thế** bởi bản cập nhật kỹ thuật này ngày 02/11/2026 sau khi rà soát toàn diện và bổ sung bộ test chạy trên `MongoMemoryReplSet` cô lập.

---

## 1. TỔNG QUAN KẾT QUẢ KIỂM THỬ

Toàn bộ kiểm thử được thực thi trong file [BackEnd/tests/payment.test.js](file:///c:/CODE/Edunity/BackEnd/tests/payment.test.js):

- **Tổng số test case:** **52 tests**
  - **Unit tests (Mocking & Isolation):** **44 tests PASS**
  - **Integration & Concurrency tests (MongoMemoryReplSet):** **8 tests PASS**
  - **FAIL:** **0 test**
  - **SKIPPED / BLOCKED:** **0 test**
- **Thời gian chạy thực tế:** ~4.873 giây.
- **Môi trường DB:** `MongoMemoryReplSet` phiên bản `7.0.14` (Storage Engine `wiredTiger`, 100% trong bộ nhớ, hoàn toàn độc lập, không ghi dữ liệu lên DB shared/Atlas/production).

---

## 2. BẢNG CHECKLIST KIỂM THỬ CHI TIẾT (BUG ID / EXPECTED VS ACTUAL / TEST CASE)

| Bug ID | Mô tả lỗi ban đầu | Kỳ vọng xử lý (Expected) | Hiện trạng thực tế (Actual) | Test Case tương ứng | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **PAY-01.1** | Cổng webhook cho qua khi thiếu secret (Fail-Open) | Từ chối ngay lập tức HTTP 401 khi thiếu `PAYMENT_WEBHOOK_SECRET` | Ném `AppError(..., "UNAUTHORIZED", 401)` | `PAY-01.1` | **PASS** |
| **PAY-01.2** | Header `x-webhook-secret` bị thiếu vẫn xử lý | Từ chối HTTP 401 khi request thiếu header secret | Ném `AppError(..., "UNAUTHORIZED", 401)` | `PAY-01.2` | **PASS** |
| **PAY-01.3** | Dùng toán tử `!==` so sánh secret gây Timing Attack | Dùng `crypto.timingSafeEqual` so sánh chuỗi bảo mật an toàn thời gian thực | Băm SHA-256 rồi so sánh qua `timingSafeEqual` | `PAY-01.3` | **PASS** |
| **PAY-01.4** | Payload webhook thiếu tham số bắt buộc không bị validate | Bắt buộc `gatewayReference` (string) và `status` (`SUCCESS` / `FAILED`) | Ném lỗi 400 VALIDATION_ERROR | `PAY-01.4` | **PASS** |
| **PAY-01.5** | Webhook hợp lệ bị từ chối | Webhook có chữ ký đúng và payload hợp lệ được tiếp nhận | Trả về HTTP 200 và chuyển service xử lý | `PAY-01.5` | **PASS** |
| **PAY-02.1** | Sandbox kích hoạt trái phép trên production | Chặn cứng sandbox trên `production` kể cả khi bật cờ | Bị từ chối HTTP 403 FORBIDDEN | `PAY-02.1` | **PASS** |
| **PAY-02.2** | Tạo sandbox payment intent trên production | Chặn `createSandboxPayment` trên `production` | Bị từ chối HTTP 403 FORBIDDEN | `PAY-02.2` | **PASS** |
| **PAY-02.3** | Thiếu cờ `ENABLE_PAYMENT_SANDBOX=true` vẫn chạy sandbox | Bắt buộc cả môi trường cho phép và cờ bật | Bị từ chối HTTP 403 FORBIDDEN | `PAY-02.3` | **PASS** |
| **PAY-02.5** | Sandbox chạy trên môi trường staging | Chặn cứng sandbox trên `staging` | Bị từ chối HTTP 403 FORBIDDEN | `PAY-02.5` | **PASS** |
| **PAY-02.7** | Môi trường dev có cờ sandbox bị chặn | Cho phép chạy sandbox trên `development` khi có cờ | Trả về HTTP 200 thành công | `PAY-02.7` | **PASS** |
| **PAY-03.1** | Webhook gửi lặp lại gây ghi trùng sổ cái | Webhook lặp lại trả về IDEMPOTENT, không ghi trùng DB | Trả về `{ result: "IDEMPOTENT" }`, không ghi thêm Transaction | `PAY-03.1` | **PASS** |
| **PAY-03.2** | Race condition webhook đồng thời (Mock test) | Cập nhật nguyên tử: 1 thành công, 1 idempotent | `findOneAndUpdate` với điều kiện `PENDING` thành công | `PAY-03.2` | **PASS** |
| **PAY-03.3** | 2 webhook SUCCESS song song trên DB thật | Đúng 1 Transaction ENROLLMENT_PAYMENT, 1 Enrollment CONFIRMED, 1 TeacherEarning, 0 REFUND | Kiểm thử trên `MongoMemoryReplSet` thật đạt chuẩn tuyệt đối | `PAY-03.3` | **PASS** |
| **PAY-03.4** | 10 webhook SUCCESS song song trên DB thật | 1 `PAYMENT_SUCCESS`, 9 `IDEMPOTENT`, đúng 1 Transaction ghi sổ | Kiểm thử 10 worker song song trên `MongoMemoryReplSet` đạt chuẩn | `PAY-03.4` | **PASS** |
| **PAY-03.5.1**| 2 & 10 webhook tài trợ song song trên DB thật | Quỹ `fundedAmount` chỉ cộng đúng 1 lần, đúng 1 Transaction | Kiểm thử trên `MongoMemoryReplSet` thật đạt chuẩn tuyệt đối | `PAY-03.5.1` | **PASS** |
| **PAY-04.1** | SUCCESS đến sau FAILED tự động đổi trạng thái Payment | Giữ nguyên Payment FAILED, log cảnh báo audit, gắn cờ review | Trả về `LATE_SUCCESS_FLAGGED_FOR_REVIEW`, không đổi DB | `PAY-04.1` | **PASS** |
| **PAY-04.3** | Giữ chỗ hết hạn vẫn tạo TeacherEarning | Không xác nhận Enrollment, không tạo TeacherEarning | Trả về `LATE_PAYMENT_PENDING_REVIEW`, TeacherEarning = 0 | `PAY-04.3` | **PASS** |
| **PAY-05.1** | Webhook tài trợ sandbox bị trả về 404 | Định tuyến tiền tố `SBX-C-` sang `contributionService` | Định tuyến đúng service, trả về HTTP 200 | `PAY-05.1` | **PASS** |
| **PAY-05.2** | Webhook học phí sandbox bị định tuyến nhầm | Định tuyến tiền tố `SBX-` sang `paymentService` | Định tuyến đúng service, trả về HTTP 200 | `PAY-05.2` | **PASS** |
| **PAY-05.3** | Webhook tài trợ không tồn tại gây crash | Trả về HTTP 404 PAYMENT_NOT_FOUND | Trả về lỗi 404 chuẩn xác | `PAY-05.3` | **PASS** |
| **PAY-05.6** | Webhook tài trợ production (`CONTRIB-`) | Định tuyến sang `contributionService` | Trả về HTTP 200 thành công | `PAY-05.6` | **PASS** |
| **PAY-06.1** | Cho phép tài trợ số tiền âm | Chặn số tiền âm ngay tại controller/service | Ném lỗi 400 VALIDATION_ERROR | `PAY-06.1` | **PASS** |
| **PAY-06.4** | Cho phép số tiền tài trợ vượt ngưỡng an toàn | Chặn số tiền vượt quá 1.000 tỷ | Ném lỗi 400 VALIDATION_ERROR | `PAY-06.4` | **PASS** |
| **PAY-06.6** | Áp dụng học bổng vượt quá quỹ Campaign khả dụng | Kiểm tra quỹ khả dụng nguyên tử trước khi chi trả | Ném lỗi 409 CAMPAIGN_FUND_UNAVAILABLE | `PAY-06.6` | **PASS** |
| **PAY-06.8** | Trừ số dư học bổng gây âm số dư | Dùng `findOneAndUpdate` có điều kiện nguyên tử | Ném lỗi 409 SCHOLARSHIP_NOT_USABLE | `PAY-06.8` | **PASS** |
| **PAY-06.10**| Tạo payment intent với số tiền dư nợ âm hoặc 0 | Từ chối tạo lệnh khi không còn học phí phải trả | Ném lỗi 400 VALIDATION_ERROR | `PAY-06.10` | **PASS** |
| **PAY-OWN.1**| Học viên A đọc được thanh toán của học viên B | Chặn truy cập trái phép qua `GET /api/payments/:id` | Trả về HTTP 404 PAYMENT_NOT_FOUND | `PAY-OWNERSHIP.1` | **PASS** |
| **PAY-OWN.2**| Admin không xem được thanh toán của học viên | Cho phép Admin đọc mọi thanh toán trên sàn | Trả về HTTP 200 thành công | `PAY-OWNERSHIP.2` | **PASS** |
| **PAY-OWN.4**| Học viên A xem lịch sử thanh toán đơn của B | Chặn truy cập qua `GET /api/enrollments/:id/payments` | Trả về HTTP 404 ENROLLMENT_NOT_FOUND | `PAY-OWNERSHIP.4` | **PASS** |
| **PAY-EXC.1**| Hết hạn giữ chỗ trên DB thật | Payment COMPLETED, Enrollment PENDING_PAYMENT, REFUND PENDING, Earning = 0 | Trả về `LATE_PAYMENT_PENDING_REVIEW`, đúng DB state | `PAY-EXCEPT.1` | **PASS** |
| **PAY-EXC.2**| Đơn đã EXPIRED trên DB thật | Payment COMPLETED, Enrollment EXPIRED, REFUND PENDING, Earning = 0 | Trả về `LATE_PAYMENT_PENDING_REVIEW`, đúng DB state | `PAY-EXCEPT.2` | **PASS** |
| **PAY-EXC.3**| Ca SUCCESS sau FAILED do học bổng `updateMany` | Payment giữ FAILED, không ghi sổ Transaction, Earning = 0 | Trả về `LATE_SUCCESS_FLAGGED_FOR_REVIEW` | `PAY-EXCEPT.3` | **PASS** |
| **PAY-EXC.4**| Đóng thiếu tiền khi giữ chỗ còn hạn | Hành vi hiện tại: kích hoạt nhánh else, tạo REFUND PENDING | Trả về `LATE_PAYMENT_PENDING_REVIEW`, Enrollment PENDING | `PAY-EXCEPT.4` | **PASS** |
| **PAY-EXC.5**| Đơn MIXED hết hạn được giải phóng học bổng | `releaseReservation` đổi usage sang RELEASED, hoàn 100% hạn mức | Học bổng được hoàn trả đầy đủ, Enrollment EXPIRED | `PAY-EXCEPT.5` | **PASS** |

---

## 3. MA TRẬN TRUY VẾT YÊU CẦU (REQUIREMENTS TRACEABILITY MATRIX - RTM)

| Mã Yêu Cầu | Hạng Mục / Trọng Tâm | Tình Trạng Hiện Tại | Đánh Giá Kỹ Thuật | Ghi Chú / Rủi Ro Tồn Tại |
| :--- | :--- | :---: | :---: | :--- |
| **PAY-01** | Xác thực Webhook Cổng (Fail-Closed, timingSafeEqual) | **Xong một phần** | Đạt logic sandbox & fail-closed | Cổng thanh toán thật chưa chốt; webhook secret tĩnh hiện tại chưa có cơ chế chống replay attack (cần timestamp/nonce hoặc HMAC raw body từ cổng thật). |
| **PAY-02** | Bảo vệ Endpoint Sandbox (Whitelist env, cờ bật tường minh) | **Đã xong** | Đạt yêu cầu bảo vệ môi trường | Chỉ mở trên dev/test khi bật cờ; chặn cứng trên staging/production. |
| **PAY-03** | Idempotency & An toàn Concurrency đa luồng | **Xong ở tầng ứng dụng** | Đạt concurrency trên ứng dụng & Replica Set | Đã kiểm thử 10 worker song song trên `MongoMemoryReplSet` không sinh trùng sổ cái. Ràng buộc Partial Unique Index ở tầng DB đang chờ DBA/Chủ dự án duyệt và chạy truy vấn dọn bản ghi trùng trước khi đánh index. |
| **PAY-04** | Xử lý Webhook Muộn (Late SUCCESS sau FAILED & Hết hạn) | **Xong một phần (GAP: ReviewQueue)** | Đạt logic code phân nhánh | **RỦI RO P0:** Ca late-SUCCESS hiện chỉ log `console.warn`, chưa có bản ghi DB bền vững (chờ duyệt `PaymentReviewQueue`). Đổi hợp đồng trả về từ `IDEMPOTENT` sang `LATE_SUCCESS_FLAGGED_FOR_REVIEW` (breaking change chờ duyệt). |
| **PAY-05** | Định tuyến Webhook Sandbox & Production | **Đã xong** (Lưu ý tích hợp) | Đạt hiện trạng định tuyến | Tiền tố `SBX-C-` và `CONTRIB-` hoạt động chuẩn xác với bộ sinh mã hiện tại. Khi nối cổng thật trên production, khuyến nghị chuyển sang cơ chế Record Lookup. |
| **PAY-06** | Kiểm soát Hạn Mức Quỹ & Xác Thực Tiền Tệ Biên | **Xong một phần** | Đạt kiểm soát hạn mức quỹ & trừ số dư | Kiểm tra quỹ khả dụng và trừ số dư học bổng nguyên tử bằng `$expr` và `findOneAndUpdate`. Chưa có quy định sàn/trần tiền tài trợ (GAP số tiền tối thiểu) và endpoint tài trợ chưa có `Idempotency-Key` ở mức HTTP header. |
| **PAY-OWN**| Kiểm soát Quyền Sở Hữu Endpoint Tra Cứu Thanh Toán | **Đã xong** | Đạt yêu cầu phân quyền & kiểm soát | Ngăn chặn học viên soi mói dữ liệu tài chính của nhau; Admin có quyền xem đầy đủ. |

---

## 4. DANH SÁCH 6 ĐIỂM CHỜ PHÊ DUYỆT TỪ CHỦ DỰ ÁN

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
