# Phase 3 — Kết quả dry-run MongoDB

Chạy các pipeline trong [auditFullstackData.js](../../BackEnd/scripts/auditFullstackData.js) qua MongoDB MCP read-only trên `edunity` ngày 25/11/2026. Kết quả `proposedWrites: 0`. Các trường hợp bên dưới cần bằng chứng bổ sung hoặc tiếp tục tuân theo lifecycle. Script cũng có thể chạy bằng `node BackEnd/scripts/auditFullstackData.js --db edunity` với `MONGODB_URI` được cấp qua môi trường. Script chỉ chạy aggregate đọc.

| Bản ghi | Kết quả dry-run | Điều kiện để xử lý |
| --- | --- | --- |
| Enrollment `6b0066fdb5fdf704106a5d65` | Giữ nguyên. Class không tồn tại, payment `6b0066fdb5fdf704106a5d66` đang `PENDING` và thiếu mốc hết hạn. | Xác minh giao dịch bằng dữ liệu cổng thanh toán, tìm lại tham chiếu lớp lịch sử và kiểm tra thời hạn áp dụng lúc tạo. |
| Enrollment `6b00672b96f1e39bf1221784` | Giữ nguyên. Lớp còn tồn tại với bộ đếm giữ chỗ bằng 0, không thấy payment. | Xác minh nguồn fixture, đối chiếu lịch sử điều chỉnh chỗ và dữ liệu giao dịch. Việc tự cho hết hạn có thể giảm bộ đếm sai. |
| Class `6b00672b96f1e39bf1221783` | Giữ nguyên snapshot và liên kết. | Cần dữ liệu lúc tạo lớp và quyết định xử lý bản ghi thử nghiệm có liên kết enrollment và payment. |
| Class trong Thùng rác `6b0105058bcb4a14447f1d94` | Giữ trong Thùng rác. Ba liên kết bị mất. | Muốn khôi phục, cần xác định đúng bản ghi gốc và khôi phục các liên kết hợp lệ. |
| Payment có enrollment `EXPIRED` gắn với hồ sơ hoàn tiền và đối soát `NEEDS_REVIEW` | Giữ nguyên giao dịch, không đưa vào danh sách sửa. | Nghiệp vụ đối soát và hoàn tiền xử lý theo quyền hiện có. |

## Các lớp OPEN

Số ghi ở cột cuối lần lượt là enrollment `CONFIRMED` và payment `COMPLETED`, giúp kiểm tra ảnh hưởng trước khi cân nhắc điều chỉnh. Mỗi lớp trong bảng đều được giữ nguyên trạng thái theo bằng chứng hiện tại.

| Class ID | Đề xuất theo trạng thái buổi học và hạn đăng ký | Xác nhận / đã trả |
| --- | --- | --- |
| `6ae9eea27281b039f5b4a907` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 4 / 4 |
| `6ae9eea27281b039f5b4a942` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 7 / 4 |
| `6ae9eea27281b039f5b4a94b` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 10 / 9 |
| `6ae9eea27281b039f5b4a986` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 5 / 3 |
| `6ae9eea27281b039f5b4a9aa` | Qua ngày kết thúc và tất cả buổi bị hủy, cần làm rõ phương án cho học viên. | 9 / 0 |
| `6ae9eea27281b039f5b4a9ac` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 6 / 6 |
| `6ae9eea27281b039f5b4a9df` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 7 / 7 |
| `6ae9eea27281b039f5b4a9fe` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 5 / 5 |
| `6ae9eea27281b039f5b4aa0f` | Qua ngày kết thúc nhưng còn buổi `SCHEDULED`, phải xác minh buổi này và lịch học bù. | 3 / 0 |
| `6ae9eea27281b039f5b4aa1a` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 6 / 6 |
| `6ae9eea27281b039f5b4aa44` | Qua ngày kết thúc và tất cả buổi bị hủy, cần làm rõ phương án cho học viên. | 21 / 0 |
| `6aeb521fb3a365681ce6354e` | Hết hạn đăng ký, có buổi `SCHEDULED`. | 1 / 0 |
| `6aebe26246af2f1aca7e8d81` | Hết hạn đăng ký, chỉ có buổi bị hủy. Đối chiếu kế hoạch cho học viên. | 1 / 0 |
| `6affb0d095b40d0635bf0ad6` | Còn hạn, chưa có buổi. Đối chiếu kế hoạch lớp và giao dịch liên quan. | 2 / 3 |
| `6b00672b96f1e39bf1221783` | Chưa có lịch và không có mốc đăng ký. Cần xác minh nguồn fixture trước khi xử lý. | 0 / 0 |
| `6b054c998e5076158c1a1453` | Hết hạn đăng ký, theo dõi lịch có buổi chưa dạy. | 1 / 1 |

## Backup và rollback cho lần sửa đã được duyệt

Chốt database và danh sách ID kèm giá trị trước và sau. Tạo snapshot có kiểm soát truy cập và lưu bản sao các document liên quan gồm enrollment, class, payment, đối soát và audit log. Kiểm tra khả năng truy xuất bản sao trước khi tiến hành.

Thử bản cập nhật và cách hoàn tác trên bản sao cô lập. Khi triển khai, so khớp giá trị hiện tại với giá trị đã duyệt và kiểm tra lại số ghế, trạng thái giao dịch và liên kết sau từng bước. Nếu cần rollback, chỉ khôi phục trường do lần sửa đó thay đổi và dừng khi phát hiện nghiệp vụ phát sinh sau lần sửa. Lần này chỉ chạy dry-run, danh sách ghi dự kiến trống.
