# EDUNITY V3 — TEACHER PAYOUT AUDIT
## Document 02: Root Cause Analysis

### 1. Tổng hợp nguyên nhân gốc rễ (Root Causes)

Hiện tượng Payout 250.000đ của giáo viên Nguyễn Văn Đức hiển thị "Đã phê duyệt" nhưng biến mất khỏi quy trình tiếp theo xuất phát từ **3 nguyên nhân chính**:

---

### 2. Nguyên nhân 1: Admin UI thiếu tab "Chờ chuyển tiền" & cơ chế lọc không phản ánh đúng quy trình chuyển tiếp

- **Trước khi sửa:**
  - Giao diện Admin (`AdminPayoutsPage.tsx`) chỉ cung cấp một ô lọc đơn lẻ `<Select>` theo từng trạng thái nguyên thủy (`ALL`, `PENDING`, `APPROVED`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`).
  - Mặc định khi Admin vào trang kiểm tra các khoản cần xử lý, danh sách thường được lọc theo `PENDING` ("Chờ phê duyệt").
  - Khi một yêu cầu được phê duyệt sang `APPROVED`, nó ngay lập tức bị loại khỏi danh sách `PENDING`.
  - Admin không có một khu vực hay tab nghiệp vụ chuyên biệt mang tên **"Chờ chuyển tiền"** gom tất cả các trạng thái trung gian (`APPROVED`, `SCHEDULED`, `PENDING_BANK_TRANSFER`, `PROCESSING`).
  - Kết quả: Admin nhầm tưởng yêu cầu biến mất hoặc bị thất lạc sau khi được duyệt.

---

### 3. Nguyên nhân 2: Bất đồng bộ ngôn ngữ và thống kê tại giao diện Giảng viên (Teacher UI & Settlement Service)

- **Ngôn ngữ hiển thị không thân thiện với Giảng viên:**
  - Tại bảng lịch sử rút tiền của Giảng viên (`TeacherPayoutSection.tsx`), trạng thái `APPROVED` được dịch thành `"Đã phê duyệt"`.
  - Về mặt tâm lý người dùng, Giảng viên mong đợi nhìn thấy trạng thái mang tính hành động và kỳ vọng nhận tiền: **"Chờ nhận tiền"** (để biết tiền đang được Admin chuyển qua ngân hàng).
- **Thống kê thù lao đang xử lý (In-flight Withdrawal Calculation):**
  - Trong `settlementService.js` (`getTeacherSettlementSummary`), số tiền "Đang chờ giải ngân / Đang rút" (`inWithdrawalRequest`) được tính bằng cách tổng hợp các `TeacherEarning` có gắn `payoutId`.
  - Đối với các bản ghi kiểm thử (test records) được chèn trực tiếp vào MongoDB mà không gắn `TeacherEarning`, biến này trả về `0đ`.
  - Khi đó, thẻ tổng quan của Giảng viên hiển thị `0đ` chờ giải ngân, khiến Giảng viên tin rằng yêu cầu rút tiền chưa được ghi nhận.

---

### 4. Nguyên nhân 3: Khiếm khuyết Schema Mongoose đối với cờ kiểm thử (`isTestData`)

- **Vấn đề:**
  - File model `BackEnd/src/models/Payout.js` không khai báo các trường `isTestData: { type: Boolean, default: false }` và `testDataTag: { type: String, default: null }`.
  - Theo mặc định của Mongoose (`strict: true`), khi thực hiện truy vấn `Payout.findById()` hoặc `.lean()`, các thuộc tính không có trong schema có thể bị lược bỏ hoặc không được nạp đầy đủ vào Mongoose Document.
  - Điều này dẫn đến nguy cơ các hàm nghiệp vụ phía backend không nhận biết được đây là bản ghi TEST, tạo kẽ hở an toàn tài chính.

---

### 5. Nguyên nhân 4: Nút "Từ chối" hiển thị sai trạng thái nghiệp vụ

- **Hiện tượng:**
  - Trong bảng quản lý Admin trước đây, nút **"Từ chối"** hiển thị đồng thời với nút **"Xác nhận đã chuyển"** ngay cả khi Payout đã ở trạng thái `APPROVED`.
- **Hậu quả:**
  - Vi phạm nguyên tắc State Machine: Một yêu cầu rút tiền đã được phê duyệt hợp lệ thì không thể bị từ chối tùy tiện mà phải qua quy trình xử lý giao dịch ngân hàng thất bại hoặc hủy bỏ có kiểm soát.
  - Gây hoang mang cho người quản trị về thao tác tiếp theo.
