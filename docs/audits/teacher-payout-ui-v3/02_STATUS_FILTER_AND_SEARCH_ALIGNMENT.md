# EDUNITY V3 — ADMIN TEACHER PAYOUT UI AUDIT V3
## Document 02: Status Filter Toolbar & Search Alignment

### 1. Vấn đề bộ lọc trước đây
- Trên màn hình Desktop, bộ lọc trạng thái 5 lựa chọn bị xuống thành 2 dòng lộn xộn:
  - Dòng 1: [Chờ phê duyệt] [Chờ chuyển tiền] [Đã chi trả]
  - Dòng 2: [Không thành công / Từ chối] [Tất cả]
- Chữ nhãn "BỘ LỌC:" bị chèn ép gây xuống hàng vô nghĩa.
- Ô tìm kiếm và các nút bấm bị lệch trục căn chỉnh theo chiều dọc.

---

### 2. Giải pháp tinh gọn Toolbar trên Desktop & Mobile

#### A. Đưa 5 trạng thái về CÙNG MỘT HÀNG trên Desktop
- Bỏ chữ "BỘ LỌC:" vì bản thân các nút trạng thái đã rất rõ nghĩa.
- Rút gọn nhãn: `"Không thành công / Từ chối"` → `"Không thành công"`. Backend vẫn lọc đúng cả 2 trạng thái `["REJECTED", "FAILED"]`.
- Áp dụng `inline-flex whitespace-nowrap` trên `<Radio.Group>`, đảm bảo trên Desktop không bao giờ bị ngắt dòng:
  1. `[Chờ phê duyệt]` (`PENDING`)
  2. `[Chờ chuyển tiền]` (`AWAITING_TRANSFER`)
  3. `[Đã chi trả]` (`COMPLETED`)
  4. `[Không thành công]` (`REJECTED_FAILED`)
  5. `[Tất cả]` (`ALL`)

#### B. Căn chỉnh ô tìm kiếm (Search Box Alignment)
- Trên Desktop (>=1280px / `xl`):
  - Bên trái: 5 trạng thái căn giữa theo chiều dọc.
  - Bên phải: Ô tìm kiếm + nút "Tìm" + nút "Xóa lọc" căn giữa đồng trục.
  - Chiều rộng ô tìm kiếm tối thiểu 360px giúp đọc rõ từ khóa dài.
- Trên màn hình Tablet / Mobile:
  - Thanh 5 trạng thái hỗ trợ cuộn ngang mượt mà (`overflow-x-auto scrollbar-none`), không che mất nút cuối cùng.
  - Khối tìm kiếm tự động xuống hàng riêng có chủ đích, co giãn 100% chiều rộng màn hình, không làm vỡ các nút trạng thái.

---

### 3. Bảo toàn ánh xạ trạng thái (Status Mapping & State Machine)
- Toàn bộ enum trạng thái backend được giữ nguyên 100%:
  - `AWAITING_TRANSFER`: Ánh xạ tới `["APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER", "PROCESSING"]`.
  - `REJECTED_FAILED`: Ánh xạ tới `["REJECTED", "FAILED"]`.
  - `PENDING`: Chỉ lọc các yêu cầu mới gửi đang chờ Admin duyệt.
  - `COMPLETED`: Chỉ lọc các lệnh đã có chứng từ ngân hàng hợp lệ và chi trả thành công.
  - `ALL`: Lấy toàn bộ không phân biệt trạng thái.
