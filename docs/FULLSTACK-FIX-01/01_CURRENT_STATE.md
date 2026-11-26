# Hiện trạng trước khi triển khai

Baseline là commit `badccfe`, working tree sạch khi bắt đầu. Repository dùng Express, Mongoose, MongoDB replica set, React, Vite, TanStack Query và Jest. Không tìm thấy `AGENTS.md` áp dụng cho hai thư mục ứng dụng.

Baseline đã chạy trên chính commit này trong cuộc rà soát trước. Typecheck và production build đạt, Playwright API giả lập đạt 34/34, Oxlint có 13 cảnh báo. Nhóm backend tự tạo fixture đạt 1.372/1.376, nhóm test đọc cấu hình kết nối đạt 53/96 trên MongoDB tạm. Các nhóm test ghi dữ liệu được chạy cách ly.

| Task | Phân loại ban đầu | Bằng chứng, nguyên nhân và phạm vi |
|---|---|---|
| SEC-01 | CONFIRMED | `catalogService.getClassSessions` lọc loại trừ bản ghi chính nhưng để qua `recordingSegments`. Route playback riêng kiểm tra vai trò, người sở hữu và đăng ký học. Giao diện công khai dùng tiêu đề và giờ buổi học. |
| CAT-01 | CONFIRMED | `searchCourses`, `getCourse` và bộ lọc công khai chỉ kiểm tra trạng thái Course. Audit trước xác nhận bốn khóa hoạt động thuộc danh mục tạm ngưng. |
| ENR-01 | CONFIRMED | `adaptClassModelToDiscoveryItem` kiểm tra OPEN và chỗ trống, còn `createEnrollment` kiểm tra cửa sổ đăng ký. Trang chi tiết có API availability. |
| PAY-01 | CONFIRMED | `gatewayPaymentService.getMyPayments` đọc một trang 100 lượt đăng ký và bỏ kết quả request thất bại. `GET /api/me/payments` đã là điểm đọc theo học viên, cần giữ DTO dùng trong lịch sử. |
| SCH-01 | CONFIRMED | `studentService.getMySessions` tính đầu ngày bằng `setHours` của máy chủ. `utils/timezone.js` có sẵn chuyển đổi giờ địa phương sang UTC. |
| DATA-01 | CONFIRMED | Luồng đăng ký trả phí bình thường đặt thời hạn giữ chỗ. Schema vẫn chấp nhận bản ghi mới PENDING_PAYMENT không có hạn. Job chỉ quét bản ghi có hạn đã tới. |
| DATA-02 | PARTIALLY FIXED | Lifecycle đã chuyển trạng thái dựa trên buổi học thực tế. Ngày khai giảng hoặc hạn đăng ký riêng lẻ không đủ để xác định trạng thái sai. CTA cần kiểm tra hạn đăng ký. |
| DATA-03 | PARTIALLY FIXED | Luồng giáo viên đã chép và kiểm tra tham chiếu khi tạo lớp. Restore mới kiểm tra khóa và giáo viên, chưa kiểm tra môn và danh mục của bản ghi. |
| TEST-01 | CONFIRMED | Bốn lỗi baseline trong tổng quan tài chính, fixture tìm lớp, thời hạn giữ chỗ và registry model. |
| TEST-02 | CONFIRMED | Mười bốn suite đọc URI cấu hình, trong số đó có ca ghi và phụ thuộc dữ liệu mẫu. |
| FE-01 | CONFIRMED | Oxlint có 8 cảnh báo fast refresh, 2 purity, 2 preserve-manual-memoization và 1 exhaustive-deps. |

Các vị trí đầu mối ở commit baseline `badccfe` gồm `BackEnd/src/services/catalogService.js:226` (lịch công khai), `courseCatalogService.js:597` (tìm khóa), `studentService.js:5` (lịch học), `adminClassService.js:372` (khôi phục), `classLifecycleService.js:16` (bắt đầu lớp), `BackEnd/src/models/Enrollment.js:46` (hạn giữ chỗ), `FrontEnd/src/api/classAdapters.ts:188` (CTA), và `FrontEnd/src/services/gatewayPayment.service.ts:81` (lịch sử thanh toán).
