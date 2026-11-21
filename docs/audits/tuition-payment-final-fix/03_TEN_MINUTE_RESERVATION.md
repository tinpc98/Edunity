# EDUNITY V3 — BÁO CÁO GIẢM THỜI GIAN GIỮ CHỖ XUỐNG 10 PHÚT (TTL 600S)

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/03_TEN_MINUTE_RESERVATION.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Chủ trì:** Tín (Payment Lead) & Châu (Class Domain Lead)  

---

## 1. MỤC TIÊU & CHÍNH SÁCH MỚI

Theo chỉ đạo mới của dự án EDUNITY V3:
- Thời gian giữ chỗ (Seat Reservation Hold Duration) tối đa giảm từ **15 phút** xuống chính xác **10 PHÚT (600 giây)**.
- Áp dụng thống nhất từ Backend (Source of Truth) đến Frontend và đồng bộ thời gian hết hạn sang cổng thanh toán payOS.
- Tuyệt đối không chỉ sửa hiển thị text/countdown ở Frontend; phải sửa triệt để logic tính toán tại Backend.
- Không hồi tố làm rút ngắn hạn của các đơn thanh toán cũ đã tạo trước đó.
- Không thay đổi chính sách của kênh khác (ví dụ: `DONATION`).

---

## 2. TRIỂN KHAI BACKEND (SINGLE SOURCE OF TRUTH)

### 2.1. Cấu hình Platform Setting
Trong [BackEnd/src/services/platformSettingService.js](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/platformSettingService.js#L7-L15):
```javascript
SEAT_HOLD_MINUTES: {
  key: "SEAT_HOLD_MINUTES",
  valueType: "INTEGER",
  envVar: "SEAT_HOLD_MINUTES",
  defaultValue: 10, // Cập nhật từ 15 thành 10 phút
  min: 1,
  max: 1440,
  description: "Seat reservation hold duration in minutes",
}
```

### 2.2. Dịch vụ Khởi tạo Ghi danh (Enrollment Service)
Trong [BackEnd/src/services/enrollmentService.js](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L132-L135):
```javascript
// BR-38: keep seat for 10 mins (updated from 15 mins)
const seatHoldDuration = getSetting("SEAT_HOLD_DURATION") || 10 * 60 * 1000;
holdExpiresAt = new Date(now.getTime() + seatHoldDuration);
```
- Khi học sinh bấm đăng ký lớp `PAID`, trường `holdExpiresAt` được ghi nhận chính xác `now + 10 phút`.
- Số chỗ ngồi `enrolledCount` tăng thêm 1 qua toán tử nguyên tử `$inc: { enrolledCount: 1 }` với điều kiện `$lt: ["$enrolledCount", "$capacity"]`.

### 2.3. Dịch vụ Khởi tạo Thanh toán (Payment Service)
Trong [BackEnd/src/services/paymentService.js](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L309-L320):
- `expiredAt` của bản ghi `Payment` được gán chính xác bằng `enrollment.holdExpiresAt`.
- Giá trị này được truyền sang `payosService.createPaymentLink`:
  ```javascript
  const expiredAtUnix = Math.floor(expiredAtDate.getTime() / 1000);
  // Truyền expiredAt dạng Unix timestamp sang PayOS SDK
  ```
  Nhờ đó, cổng thanh toán payOS cũng thiết lập đúng 10 phút hết hạn cho mã QR và link thanh toán.

### 2.4. Cron Job Quét Đơn Hết Hạn (Expire Enrollments Worker)
Trong [BackEnd/src/jobs/expireEnrollmentsJob.js](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/jobs/expireEnrollmentsJob.js):
- Quét các đơn `{ holdExpiresAt: { $lte: now }, enrollmentStatus: "PENDING_PAYMENT" }`.
- Khi 10 phút kết thúc:
  - `Enrollment` được chuyển thành `EXPIRED`.
  - Sĩ số lớp được hoàn trả qua `$inc: { enrolledCount: -1 }`.
  - Bất kỳ suất học bổng giữ tạm nào (`SCHOLARSHIP_USAGE`) cũng được hoàn trả an toàn.

---

## 3. TRIỂN KHAI FRONTEND (COUNTDOWN & UI)

Trong [FrontEnd/src/components/payment/PaymentCountdown.tsx](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/components/payment/PaymentCountdown.tsx) và [ClassRegistrationCard.tsx](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/class/components/ClassRegistrationCard.tsx):
- Đồng hồ đếm ngược hook `useHoldCountdown` lấy mốc thời gian `expiredAt` / `holdExpiresAt` do Backend trả về.
- Khi vừa tạo đơn, đồng hồ hiển thị: **`09:59`** và đếm ngược dần về `00:00`.
- Khi hết hạn:
  - Tự động kích hoạt invalidation query để refetch dữ liệu lớp học và đơn đăng ký từ Backend.
  - Giao diện chuyển sang trạng thái: "Đơn đăng ký đã hết hạn. Bạn có thể đăng ký lại nếu lớp học còn chỗ."
  - Ẩn mã QR cũ, không cho phép sử dụng intent đã hết hiệu lực.

---

## 4. XỬ LÝ ĐUA LỆNH (CONCURRENCY & RACE CONDITIONS)

1. **Webhook đến sát giờ hết hạn:**
   - Trong `financialDispatchService.js`, sử dụng MongoDB Session và Transaction với kiểm tra điều kiện nguyên tử:
     - Nếu `holdExpiresAt > now` tại thời điểm xác nhận: `Enrollment` chuyển sang `CONFIRMED`.
     - Sau khi `Enrollment` đã `CONFIRMED`, cron job `expireEnrollmentsJob` quét theo điều kiện `{ enrollmentStatus: "PENDING_PAYMENT" }` nên **tuyệt đối không bao giờ** chuyển đơn đã xác nhận thành `EXPIRED`.
2. **Tiền về sau khi chỗ đã bị hủy:**
   - Nếu tiền vào sau khi 10 phút đã hết và cron đã giải phóng chỗ: Hệ thống ghi nhận kép `UNAPPLIED_TUITION_RECEIPT (COMPLETED)` và `REFUND (PENDING)`, mở hồ sơ `PaymentReconciliation(LATE_PAYMENT_REVIEW)`. Tuyệt đối không cấp chỗ vượt quá `capacity`.
