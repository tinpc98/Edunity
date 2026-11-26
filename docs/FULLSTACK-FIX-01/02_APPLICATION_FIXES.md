# Phase 1–2 — Sửa ứng dụng

| Mục | Thay đổi | Kiểm tra |
| --- | --- | --- |
| SEC-01 | Lịch lớp công khai dùng danh sách trường cho phép. Route xem lại của người có quyền tiếp tục dùng kiểm tra quyền riêng. | Hợp đồng JSON của lịch lớp và bản ghi tổng hợp vẫn còn trong fixture. 18 test truy cập nhạy cảm và bản ghi đạt. |
| CAT-01 | Lọc danh mục hợp lệ ở tìm kiếm, chi tiết, danh sách lớp theo khóa, giáo trình công khai, bộ lọc và danh sách khóa đính kèm môn. Admin có thể xem dữ liệu để quản lý. | Ba ca kiểm tra danh mục tắt, đã xóa và thất lạc. Kiểm tra đồng thời dữ liệu admin và chi tiết lớp. |
| ENR-01 | Thẻ lớp và trang chi tiết hiển thị lý do khóa CTA theo trạng thái, thời hạn và số chỗ. Cửa sổ đăng ký gồm hai mốc biên. Thẻ tự cập nhật ở mốc chuyển trạng thái, trang chi tiết kiểm tra lại API khi cần. | Kiểm thử giờ trước, tại và sau mốc đăng ký, lớp đầy và lớp đã kết thúc. Backend quyết định nguyên tử khi đăng ký. |
| PAY-01 | Trang lịch sử lấy trang giao dịch từ API hiện có. Sắp xếp ổn định và phân quyền theo người trả tiền, hiển thị lỗi và nút thử lại. | Kiểm tra 102 giao dịch, trang cuối, mã giao dịch duy nhất, tài khoản khác và response dạng mảng cũ. |
| SCH-01 | Tính mốc ngày mặc định theo Asia/Ho_Chi_Minh bằng tiện ích hiện có. Timestamp có múi giờ tiếp tục chỉ cùng một thời điểm. | Kiểm tra thời điểm giao năm, 00:00, 23:59 và khoảng thời gian truy vấn rõ ràng. |

Hai suite Backend kiểm tra danh mục và giáo trình đạt 68/68 với TZ=UTC. Frontend build thành công, còn cảnh báo đóng gói có sẵn.
