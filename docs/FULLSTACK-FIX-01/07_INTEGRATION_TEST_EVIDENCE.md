# Bằng chứng kiểm thử tích hợp

## Supertest và MongoDB tạm

HTTP chạy qua Express và Mongoose trên MongoMemoryReplSet. Các lượt ghi nằm trong replica set của suite. Storage dùng thư mục tạm và timezone của tiến trình được đặt rõ khi so sánh lịch.

| Bằng chứng | Kết quả |
| --- | --- |
| `npm test -- --runInBand tests/catalogSearch.test.js tests/syllabusVersion.test.js` | PASS 68/68 ở Phase 2. Có lịch công khai, ba trạng thái danh mục, 102 giao dịch, trường hợp tài khoản khác và giữ response mảng cũ. |
| `npm test -- --runInBand tests/sensitiveAccess.bao12.test.js tests/sessionRecordingFixes.test.js` | PASS 18/18 ở Phase 1. |
| `npm test -- --runInBand tests/catalogSearch.test.js tests/enrollment.test.js` | PASS 52/52 với `TZ=Asia/Ho_Chi_Minh` ở Phase 3. Có chặn restore và kiểm tra dữ liệu sau request. |
| `npm test -- --runInBand tests/enrollment.test.js tests/sessionJoin.test.js tests/sessionLifecycle.test.js tests/payosUnifiedIntent.pr1.test.js tests/schemaInventory.test.js` | PASS 99/99 với `TZ=UTC`. Có thử tranh suất, kiểm tra hết hạn đăng ký, thanh toán sandbox và chặn truy cập khi còn chờ thanh toán. |
| Chạy nhóm 14 suite đã chuyển khỏi `.env` | PASS 96/96 trên các replica set tạm. |
| `npm test -- --runInBand tests/catalogSearch.test.js -t "midnight in Vietnam"` | PASS ca mốc ngày với `TZ=America/New_York`. 40 ca khác ngoài bộ lọc chỉ chạy ở các lượt toàn suite. |
| `npm test -- --maxWorkers=6 --silent --json --outputFile=...` | PASS 1.484/1.484 trên 90 suite, `TZ=UTC`, 203 giây. |

Lượt hồi quy đầy đủ đầu tiên báo 5 lỗi tại fixture enrollment chưa đặt hạn và unit test chưa khai báo truy vấn danh mục mới. Đã cập nhật fixture và giữ assertion nghiệp vụ. Lượt hồi quy đầy đủ cuối cùng đạt toàn bộ.

## Trình duyệt và unit test

Playwright đạt 37/37 ca với bản build Vite trên loopback và Chrome headless. Các ca trình duyệt bắt request API bằng Playwright. Trang lịch sử được kiểm tra từ lỗi HTTP đến nút thử lại rồi trang chứa giao dịch thứ 102. Khách xem lớp đã đóng đăng ký thấy nút bị khóa trên cả danh sách và chi tiết. Kiểm thử helper dùng thời điểm cố định theo giờ Việt Nam để kiểm tra hai mốc biên.

## Dữ liệu thực và kiểm tra ngoài test

MongoDB MCP chạy aggregate chỉ đọc. Kết quả từng bản ghi có ở [dry-run](04_DATA_REPAIR_DRY_RUN.md). Luồng duyệt và ghi giao dịch thật, giao diện kết nối trực tiếp staging, FPT eContract và OCR thật ở trạng thái NOT RUN. Kiểm thử với provider giả lập chỉ là bằng chứng cho luồng ứng dụng trong môi trường test.
