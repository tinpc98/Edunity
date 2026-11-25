# Phase 3 — Kiểm tra tính toàn vẹn dữ liệu

MongoDB MCP ở chế độ read-only đã kiểm tra database `edunity` ngày 25/11/2026. Các truy vấn chỉ lấy khóa liên kết và thông tin nghiệp vụ cần đối chiếu.

## DATA-01

Hai lượt `PENDING_PAYMENT` thiếu thời hạn. Một lượt trỏ tới lớp đã mất và có intent thanh toán `PENDING` cũng thiếu thời hạn. Lượt còn lại trỏ tới lớp vẫn tồn tại với `enrolledCount: 0`, chưa có payment liên kết.

Luồng đăng ký hiện hành giữ chỗ và tạo enrollment trong cùng giao dịch, với thời hạn theo `SEAT_HOLD_DURATION`. Checkout học phí và học bổng yêu cầu thời hạn còn hiệu lực. Job hết hạn chọn thời hạn kiểu Date đã đến mốc, dùng cập nhật có điều kiện cùng giao dịch hoàn chỗ để việc chạy lại an toàn. Mongoose hiện kiểm tra thời hạn khi tạo enrollment hoặc đổi trạng thái/thời hạn của bản ghi đang chờ. Các đường cập nhật nghiệp vụ hiện có chuyển khỏi `PENDING_PAYMENT`.

Fixture đối soát cũ từng kết nối qua `.env` và khai báo trực tiếp `PENDING_PAYMENT` thiếu thời hạn. Tên lớp, mốc tạo và cấu trúc bản ghi trùng với fixture của suite đối soát ở trường hợp 6. Cần nhật ký lần chạy để quy nguồn chính xác cho bản ghi mồ côi.

## DATA-02

Trong 16 lớp `OPEN`, 13 đã qua ngày khai giảng, 14 đã đóng đăng ký và 3 đã qua ngày kết thúc. Các nhóm chồng lấn. Trong 16 lớp, trạng thái buổi học quan sát được chỉ gồm `CANCELLED`, `SCHEDULED` hoặc chưa có buổi. Lifecycle bắt đầu lớp theo sự kiện dạy thực tế. Hoàn thành yêu cầu lớp đang dạy, tất cả buổi đã kết thúc hợp lệ và đã qua mốc kết thúc. Việc hết hạn đăng ký được xử lý riêng ở CTA và API đăng ký.

## DATA-03

Lớp `6b00672b96f1e39bf1221783` lưu khóa Toán 12, có `gradeLevel: null` và danh mục khác khóa hiện tại, cùng môn học. Khóa đã được cập nhật sau khi lớp được tạo. Luồng giáo viên tạo lớp sao chép các trường từ khóa đã được xác thực; dữ liệu hiện tại phù hợp với một fixture đối soát ghi trực tiếp. Chênh lệch snapshot tự nó chưa đủ căn cứ để ghi đè lịch sử.

Một lớp trong Thùng rác, `6b0105058bcb4a14447f1d94`, mất cả khóa học, giáo viên và môn học. Khi xem Thùng rác, thiếu khóa liên kết được hiển thị dưới dạng lý do không thể khôi phục. Backend kiểm tra cả bốn liên kết trước khi khôi phục lớp về `DRAFT`. Thông tin lớp và lưu vết lịch sử vẫn đọc được.
