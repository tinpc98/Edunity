# Phase 4 — Ổn định test và lint

## TEST-01

| Ca | Nguyên nhân | Cách xác minh |
| --- | --- | --- |
| Tổng quan tài chính | Assertion kiểm tra `disclaimer` đã bỏ khỏi response. | Kiểm tra `operationsSummary` mà giao diện đang dùng cùng toàn bộ assertions tài chính hiện có. |
| Tìm lớp | Fixture lớp A đã qua mốc khai giảng nên bị loại khỏi tìm kiếm mặc định. | Đặt một lớp trong tương lai cho bài test tìm theo tên, xác nhận đúng ID trả về. |
| Thời hạn giữ chỗ | Fixture chờ 15 phút trong khi thời hạn hiện hành mặc định 10 phút. | Đối chiếu hạn QR với hạn enrollment và cấu hình `SEAT_HOLD_DURATION`, có mốc thời gian trước và sau thao tác đăng ký. |
| Số model | Registry hiện có `TokenRevocationTask`. | Kiểm tra độ dài danh sách kỳ vọng và tên model đã đăng ký trong Mongoose. |

Các fixture yêu cầu lượt giữ chỗ hợp lệ có thêm `holdExpiresAt`. Test lịch học đã hoàn thành dùng mốc truy vấn tường minh để giữ ý nghĩa khi chạy sát nửa đêm. Các unit test danh mục đã cập nhật mock ở tầng Mongoose cho truy vấn danh mục hoạt động. Supertest kiểm tra cùng quy tắc với MongoDB tạm và các bản ghi danh mục bất hoạt, đã xóa, thất lạc. Các assertion nghiệp vụ và phân quyền vẫn chạy.

## TEST-02

14 suite đã thay kết nối từ `.env` bằng MongoMemoryReplSet. Helper yêu cầu `NODE_ENV=test`, tự khởi tạo MongoDB loopback và xác minh tiến trình sở hữu kết nối trước khi dùng fixture, dọn hoặc tạo index. Teardown dừng replica set riêng của suite. Kiểm tra nguồn tại `BackEnd/tests` chỉ còn `mongoose.connect` bên trong helper.

| Suite | Chuẩn bị dữ liệu |
| --- | --- |
| adminFinanceAnalytics | Phân tích tài chính trên DB mới, dùng dữ liệu do ca kiểm thử tạo. |
| adminComplaintsLocalizationV2 | Fixture dữ liệu mẫu của nghiệp vụ tài chính và payout. |
| adminNotificationIntegration | Admin, thông báo đã đọc và chưa đọc, cùng fixture bảo toàn giao dịch. |
| adminPaymentMonitoringV2 | Actor và danh mục hợp lệ cho các ca tạo bank event, payment và đối soát. |
| adminReconciliationQueueV2 | Giao dịch mẫu đã xử lý và chờ đối soát, cùng event riêng của suite. |
| adminReconciliationResolutionV3 | Actor và danh mục hợp lệ, giữ ca khôi phục enrollment chờ đã quá hạn và không có ghế trong bộ đếm lớp. |
| adminRefundManagementV2 | Hồ sơ hoàn tiền có đầy đủ payment, bank event và đối soát liên kết. |
| adminReviewCommentModerationV1 | Giữ fixture tạo user, lớp, enrollment và review của suite. |
| adminTeacherPayoutWorkflowV2 | Bốn payout thử nghiệm theo trạng thái, định danh lấy từ bản ghi fixture. |
| adminTeacherPayoutWorkflowV3 | Payout và chứng từ giao dịch tổng hợp. |
| adminTuitionPaymentsV2 | Học phí xác nhận, thu trùng, thất bại và đang chờ để kiểm tra lọc. |
| softDeleteArchitecture | Catalog riêng và lớp có enrollment thật trên replica set tạm, kiểm tra đúng mã lỗi dependency của endpoint. |
| softDeleteFinalV2 | User và quyền của suite, cùng fixture tài chính đọc để kiểm tra bảo toàn. |
| tuitionReconciliationAdminRefund | Lớp, enrollment, giao dịch sổ cái, thu nhập giảng viên và refund tổng hợp có cùng liên kết. |

Các suite analytics, hàng đợi đối soát, theo dõi thanh toán, giải quyết đối soát, quản lý hoàn tiền, kiểm duyệt review, payout V2 và Thùng rác có thiết lập hoặc ca kiểm thử ghi dữ liệu. Toàn bộ 14 suite cũng có thể ghi fixture trên MongoDB tạm, kể cả khi thao tác được kiểm tra chỉ đọc. Kiểm thử theo nhóm đã đạt 96/96.

## FE-01

Oxlint từ 13 cảnh báo về 0. Bỏ helper xuất mà không có nơi gọi, giữ các hàm dùng nội bộ trong file hiện tại và chuyển logic chia sẻ của form tạo/sửa lớp ra file TypeScript riêng. Checkout và trang tạo lớp đọc thời gian từ hook hiện có. Effect tạo intent khai báo đủ phụ thuộc và dùng cùng khóa chặn gọi lặp. Điều kiện kiểm tra hợp đồng ở Backend tiếp tục được kiểm thử.
