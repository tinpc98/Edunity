# EDUNITY V3 — TEACHER PAYOUT AUDIT
## Document 04: Admin UI Refactoring & Enhancements

### 1. Tinh gọn giao diện và loại bỏ nội dung kỹ thuật dư thừa

Theo yêu cầu chuẩn hóa giao diện cho đội ngũ vận hành tài chính (Admin Finance), các nội dung giải thích quy tắc kỹ thuật và mã điều khoản nội bộ đã được gỡ bỏ hoàn toàn khỏi trang:
`FrontEnd/src/features/admin/finance/AdminPayoutsPage.tsx`

1. **Tiêu đề và Mô tả mới:**
   - **Tiêu đề:** `Quản lý rút tiền giáo viên`
   - **Mô tả ngắn gọn:** `Theo dõi yêu cầu rút tiền, phê duyệt và chi trả thù lao.`
2. **Loại bỏ nội dung dư thừa:**
   - Đã **BỎ** dòng chữ: *"Quy trình chuẩn: Giảng viên yêu cầu (Thứ Hai) → Admin phê duyệt (Thứ Ba) → Ngân hàng xử lý (Thứ Năm - Thứ Sáu). Xem BR-10 để biết chi tiết."*
   - Đã **BỎ** toàn bộ khung banner cảnh báo: *"Nguyên tắc chi trả thù lao giảng viên (BR-10, BR-11, BR-12)..."*

---

### 2. Thiết kế hệ thống 5 Tab nghiệp vụ trực quan

Thay vì sử dụng một ô thả xuống (`<Select>`) phức tạp và dễ gây sót hồ sơ, giao diện được cấu trúc lại thành 5 Tab nghiệp vụ rõ ràng:

1. **Chờ phê duyệt**:
   - Tương ứng trạng thái backend: `PENDING`.
   - Hiển thị các yêu cầu giảng viên mới gửi lên, sẵn sàng để Admin thẩm định tài khoản và bấm "Phê duyệt" hoặc "Từ chối".
2. **Chờ chuyển tiền**:
   - Tương ứng trạng thái backend: `APPROVED`, `SCHEDULED`, `PENDING_BANK_TRANSFER`, `PROCESSING`.
   - Đây chính là nơi tập trung các khoản đã duyệt (bao gồm khoản 250.000đ của giáo viên Nguyễn Văn Đức) đang chờ Admin/Kế toán thực hiện chuyển tiền ngân hàng.
3. **Đã chi trả**:
   - Tương ứng trạng thái backend: `COMPLETED`.
   - Danh sách các khoản đã chi trả thành công và có mã giao dịch ngân hàng kèm theo.
4. **Không thành công / Từ chối**:
   - Tương ứng trạng thái backend: `REJECTED`, `FAILED`, `CANCELLED`.
   - Lưu trữ các khoản bị từ chối hoặc giao dịch ngân hàng phát sinh lỗi.
5. **Tất cả**:
   - Toàn bộ hồ sơ rút tiền trong hệ thống.

---

### 3. Tìm kiếm và Lọc dữ liệu thông minh

- Tích hợp ô tìm kiếm (`Search Input`) hỗ trợ tìm kiếm nhanh theo:
  - Tên giảng viên
  - Email giảng viên
  - Mã tham chiếu ngân hàng / Mã yêu cầu rút tiền.
- Hỗ trợ phân trang chuẩn xác trên từng Tab.

---

### 4. Sửa lỗi hiển thị nút thao tác và Phân biệt dữ liệu kiểm thử (TEST)

1. **Khắc phục lỗi nút "Từ chối":**
   - Trước đây: Nút "Từ chối" xuất hiện cả ở các hồ sơ đã có trạng thái `APPROVED`.
   - Hiện tại: Nút "Từ chối" chỉ được phép hiển thị khi hồ sơ đang ở trạng thái `PENDING`. Khi hồ sơ chuyển sang `APPROVED`, giao diện chỉ hiển thị nút duy nhất là **"Xác nhận đã chuyển"**.
2. **Đánh dấu bản ghi kiểm thử (`TEST Badge`):**
   - Đối với các bản ghi có cờ `isTestData: true`, giao diện hiển thị huy hiệu nổi bật `[TEST]` bên cạnh tên giảng viên.
   - Khi mở modal xác nhận chuyển tiền đối với bản ghi TEST, giao diện hiển thị cảnh báo an toàn tài chính màu vàng cam và **vô hiệu hóa (disable)** nút xác nhận để ngăn ngừa hoàn tất chi trả nhầm lẫn.
