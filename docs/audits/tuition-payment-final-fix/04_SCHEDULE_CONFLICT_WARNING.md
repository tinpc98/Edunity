# EDUNITY V3 — BÁO CÁO CƠ CHẾ CẢNH BÁO TRÙNG LỊCH HỌC

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/04_SCHEDULE_CONFLICT_WARNING.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Chủ trì:** Châu (Academic Domain Lead) & Băng (Frontend Lead)  

---

## 1. MỤC TIÊU NGHIỆP VỤ

Theo chỉ đạo sản phẩm EDUNITY V3:
- Khi học sinh bấm đăng ký một lớp học có thời gian học bị trùng với bất kỳ lớp học nào mà học sinh đã ghi danh trước đó:
  - **KHÔNG TỰ ĐỘNG CHẶN ĐĂNG KÝ.**
  - Phải hiển thị modal cảnh báo rõ ràng trước khi tạo đơn đăng ký hoặc giữ chỗ.
  - Học sinh có quyền chủ động quyết định:
    - **"Hủy"**: Đóng modal, không tạo bất kỳ đơn đăng ký hay Payment Intent nào.
    - **"Vẫn đăng ký"**: Học sinh chấp nhận việc trùng lịch, hệ thống tiếp tục tiến hành giữ chỗ và mở cổng thanh toán VietQR như bình thường.

---

## 2. THUẬT TOÁN PHÁT HIỆN TRÙNG LỊCH (CONFLICT DETECTION ALGORITHM)

Thuật toán được xây dựng độc lập và toàn vẹn tại [FrontEnd/src/utils/scheduleConflict.ts](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/utils/scheduleConflict.ts):

Hai lớp học `Class A` (lớp sắp đăng ký) và `Class B` (lớp học sinh đã đăng ký `CONFIRMED` / `COMPLETED`) được coi là trùng lịch khi và chỉ khi thỏa mãn **CẢ 3 ĐIỀU KIỆN**:

1. **Giao nhau về thời gian khóa học (Course Term Overlap):**
   - Khoảng thời gian từ `startDate` đến `endDate` của Lớp A và Lớp B có phần giao nhau:
     $$\max(startDate_A, startDate_B) \le \min(endDate_A, endDate_B)$$
   - Nếu một trong hai lớp chưa có ngày bắt đầu/kết thúc cụ thể, thuật toán mặc định xét tiếp các buổi trong tuần.

2. **Trùng ngày học trong tuần (Day of Week Match):**
   - Tồn tại ít nhất một khung giờ $Slot_A$ trong lịch học của Lớp A và $Slot_B$ trong lịch học của Lớp B có:
     $$Slot_A.dayOfWeek = Slot_B.dayOfWeek$$
     *(Với quy ước: 0 = Chủ nhật, 1 = Thứ 2, 2 = Thứ 3, ..., 6 = Thứ 7)*.

3. **Giao nhau về khung giờ học trong ngày (Time Range Intersection):**
   - Chuyển đổi giờ học dạng `"HH:mm"` sang tổng số phút trong ngày:
     $$StartMinutes = HH \times 60 + mm$$
   - Hai khoảng thời gian giao nhau khi và chỉ khi:
     $$Slot_A.startTime < Slot_B.endTime \quad \text{VÀ} \quad Slot_B.startTime < Slot_A.endTime$$
   - Không báo trùng nếu cùng ngày nhưng học khác giờ (ví dụ: một lớp học 17:30–19:00, một lớp học 19:30–21:00).

---

## 3. THIẾT KẾ GIAO DIỆN CẢNH BÁO (WARNING MODAL)

Khi phát hiện có lịch trùng, hệ thống kích hoạt modal cảnh báo dạng popup:
- **Tiêu đề:** `⚠️ Lịch học bị trùng`
- **Nội dung hướng dẫn:**
  > "Lớp học này có thời gian học trùng với một lớp bạn đã đăng ký. Bạn vẫn có thể đăng ký, nhưng có thể không tham gia được đầy đủ các buổi học. Bạn có muốn tiếp tục đăng ký không?"
- **Danh sách chi tiết các lịch bị trùng:**
  Hiển thị danh sách thẻ thông tin gồm:
  - Tên lớp học đã đăng ký gây trùng.
  - Thứ và khung giờ trùng: *Ví dụ: "Thứ 2: Lớp mới (19:30 - 21:00) trùng với lớp đã đăng ký (19:30 - 21:00)"*.
- **Hai nút điều khiển:**
  1. Nút phụ: **"Hủy"** (`secondary button`) -> Đóng modal, không tạo reservation, không giữ chỗ, không trừ sĩ số.
  2. Nút chính: **"Vẫn đăng ký"** (`primary teal button`) -> Đóng modal và thực thi `executeRegistration()` bình thường.

---

## 4. TÍCH HỢP DỮ LIỆU BACKEND

Để Frontend có đầy đủ lịch học của các lớp đã ghi danh:
- Tại [BackEnd/src/services/enrollmentService.js](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L225-L245), hàm `getMyEnrollments` khi gọi với tham số `include=class` đã được bổ sung populate trường `schedule` từ `Class`:
  ```javascript
  .populate("classId", "... schedule ...")
  ```
- Dữ liệu `schedule` được trả về trong object `item.class.schedule` của từng đơn ghi danh, giúp Frontend kiểm tra tức thì mà không cần thêm API request phụ.
