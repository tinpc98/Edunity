# Hợp đồng API

| API | Trước | Sau | Tương thích |
| --- | --- | --- | --- |
| `GET /api/classes/:id/sessions` | Trả hầu hết document Session với một số trường bị loại. | Chỉ trả `_id`, `id`, `classId`, `className`, `teacherId`, `title`, `description`, `sessionNumber`, `startDatetime`, `endDatetime`, `status` khi có. | Giữ request và dữ liệu lịch công khai. Xem bản ghi dùng endpoint đã xác thực riêng. |
| `GET /api/courses`, `GET /api/catalog/filters` | Khóa đang hoạt động có thể xuất hiện nếu danh mục đã tắt. | Kết quả khóa học được lọc theo trạng thái và sự tồn tại của danh mục. | Giữ cấu trúc response và phân trang hiện có. |
| `GET /api/courses/:id`, `/classes`, `/syllabus` theo khóa | Các điểm vào có kiểm tra công khai thiếu nhất quán. | Khóa bị ẩn hoặc mất danh mục trả 404 `COURSE_NOT_FOUND`. | API admin, truy cập lớp theo ID và giáo trình của lớp tiếp tục theo quyền hiện có. |
| `GET /api/subjects/:id` | Chi tiết môn trả tham chiếu khóa hoạt động. | Tham chiếu công khai có thêm kiểm tra danh mục. Authorization tùy chọn nhận diện Admin và giữ cách xem quản trị cũ. | Request không có token tiếp tục hoạt động. Token đính kèm được xác thực. |
| `GET /api/me/payments` | Dữ liệu dạng mảng, sắp xếp theo ngày. | Dữ liệu dạng mảng khi không phân trang. Khi có `page`, `pageSize` hoặc `limit`, trả `data.items`, `total`, `page`, `pageSize`, `totalPages`. `pageSize` tối đa 100 mỗi lần đọc. | Giữ envelope và API hiện có. `classId` bổ sung khi có thể xác định. Trang Student dùng trang 10 giao dịch, thứ tự `createdAt` rồi `_id` giảm dần. |
| `GET /api/me/sessions` | Mốc ngày mặc định lấy theo timezone máy chạy. | Mốc bắt đầu ngày Việt Nam và mốc 14 ngày sau được chuyển sang UTC. ISO có offset giữ nguyên thời điểm. | NO CONTRACT CHANGE về request và kiểu dữ liệu timestamp. |
| `GET /api/admin/trash/CLASS/:id` và `POST .../restore` | Kiểm tra lớp mất khóa hoặc giáo viên. | Bổ sung kiểm tra môn và danh mục, dùng `canRestore`, `restoreBlockReason` và mã `RESTORE_CONFLICT` hiện có. | Giữ envelope và đích khôi phục `DRAFT`. |
| `POST /api/classes/:id/enrollments` và API khả dụng | Backend kiểm tra trạng thái, thời hạn, số chỗ. | NO CONTRACT CHANGE. CTA dùng các mốc thời gian đã có của lớp, xử lý thêm lý do khóa. | Không thay đổi luồng thanh toán hoặc thời hạn giữ chỗ. |

Mongoose áp dụng validation cho `holdExpiresAt` khi tạo lượt `PENDING_PAYMENT` hoặc đổi trường liên quan. Cấu trúc collection và indexes hiện có tiếp tục được dùng.
