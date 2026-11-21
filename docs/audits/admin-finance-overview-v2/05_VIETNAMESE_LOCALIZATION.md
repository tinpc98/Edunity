# VIỆT HÓA TOÀN DIỆN VÀ LOẠI BỎ THUẬT NGỮ KỸ THUẬT — V2
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Nguyên tắc:** 100% Tiếng Việt tự nhiên, chuẩn mực kế toán tài chính, loại bỏ thuật ngữ kỹ thuật backend trực tiếp.  

---

## 1. Bảng Đối Chiếu Thuật Ngữ (Terminology Mapping)

| Thuật ngữ gốc tiếng Anh | Nhãn hiển thị tiếng Việt trên Dashboard | Ghi chú ngữ cảnh |
| :--- | :--- | :--- |
| `Financial Outbox Worker` | **Tiến trình đồng bộ giao dịch** | Thay thế tên kỹ thuật |
| `IDLE` | **Đang chờ tác vụ** | Trạng thái tiến trình |
| `RUNNING` | **Đang hoạt động** | Trạng thái tiến trình |
| `Webhooks` | **Cổng thanh toán & Ngân hàng** | Phân hệ giao tiếp |
| `Ledger` | **Sổ giao dịch tài chính** | Sổ cái kế toán |
| `Pending (Teacher Earnings)` | **Chờ đủ điều kiện chi trả** | Thù lao lớp học chưa kết thúc |
| `Available (Teacher Earnings)` | **Có thể chi trả** | Thù lao đã đủ điều kiện rút |
| `Paid Out (Teacher Earnings)` | **Đã chi trả** | Đã giải ngân cho giáo viên |
| `NEEDS_REVIEW (Reconciliation)` | **Cần kiểm tra** | Giao dịch cần đối soát |
| `IN_REVIEW (Reconciliation)` | **Đang kiểm tra** | Giao dịch đang rà soát |
| `RESOLVED_APPROVED` | **Đã đối soát** | Đã chấp thuận hạch toán |
| `RESOLVED_REFUNDED` | **Đã hoàn tiền** | Đã thực hiện hoàn tiền |
| `RESOLVED_IGNORED` | **Đã đóng theo kết quả xử lý** | Đóng sự vụ đối soát |
| `Unapplied Tuition Receipt` | **Khoản thu tạm giữ** | Tiền đến muộn / thừa |
| `Backlog` | **Hàng đợi chờ hạch toán** | Số lượng sự kiện tồn |
| `Retry exhausted` | **Sự kiện lỗi cần kiểm tra** | Vượt số lần thử lại |
| `Batch Size` | *Đã loại bỏ khỏi UI tổng quan* | Giữ trong màn hình kỹ thuật |

---

## 2. Loại bỏ Hoàn toàn Song Ngữ Thô
Trước đây, giao diện hiển thị các cụm từ song ngữ đóng mở ngoặc như:
- `Tạm giữ (PENDING)`
- `Khả dụng rút (AVAILABLE)`
- `Đã giải ngân (PAID_OUT)`
- `Cần kiểm tra (NEEDS_REVIEW)`
- `Đang xử lý (IN_REVIEW)`
- `Đã chấp thuận (RESOLVED_APPROVED)`
- `Đã hoàn tiền (RESOLVED_REFUNDED)`
- `Đã bỏ qua (RESOLVED_IGNORED)`

Toàn bộ các cụm từ trên đã được thay thế bằng **100% tiếng Việt chuẩn hóa**, hiển thị chuyên nghiệp và trực quan cho người quản trị.
