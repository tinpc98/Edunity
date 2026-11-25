# Kết luận nghiệm thu

**CODE RELEASE READINESS — GO trong phạm vi FULLSTACK-FIX-01.** Backend đạt 1.484/1.484, Frontend typecheck và build đạt, lint không có cảnh báo và Playwright đạt 37/37. Trạng thái sẵn sàng này dựa trên các suite cô lập, API Express với MongoDB tạm và kiểm thử trình duyệt theo fixture. Tích hợp thật của các nhà cung cấp ở ngoài phạm vi.

**DATA REPAIR READINESS — BLOCKED.** Dry-run đề xuất 0 thao tác ghi. Hai lượt giữ chỗ, một lớp lệch snapshot và một lớp mồ côi cần thêm bằng chứng nguồn và xác minh tác động kinh doanh. Ba lớp qua ngày kết thúc cần quyết định vận hành từng lớp dựa trên buổi học và quyền học viên. Chi tiết theo ID nằm ở [kết quả dry-run](04_DATA_REPAIR_DRY_RUN.md).

| Task ID | Issue | Root Cause | Implementation Status | Test Status | Evidence | Remaining Risk | Final Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Metadata bản ghi trong lịch công khai | Projection loại trừ thiếu trường lồng | Đã áp dụng allowlist | PASS | Supertest kiểm tra toàn bộ DTO, 18 ca quyền và bản ghi | Endpoint xem lại tiếp tục cần quyền phù hợp | PASS |
| CAT-01 | Khóa hiện từ danh mục bị tắt | Chỉ kiểm tra trạng thái khóa | Đã lọc theo danh mục trên luồng công khai | PASS | Ba tình huống danh mục và đường Admin/lớp | Bốn khóa trong dữ liệu vẫn tồn tại để quản lý | PASS |
| ENR-01 | CTA mở sai hạn | Lớp OPEN và còn chỗ chưa đủ xác định được đăng ký | Đã kiểm tra cửa sổ và trạng thái ở hai màn hình | PASS | Mốc biên, test trình duyệt và API từ chối khi ngoài hạn | Thao tác đồng thời vẫn cần quyết định của Backend | PASS |
| PAY-01 | Lịch sử thiếu giao dịch | Chỉ đọc 100 enrollment và bỏ qua lỗi từng phần | Đã dùng API lịch sử trực tiếp có phân trang và retry | PASS | 102 giao dịch, phân quyền, nút thử lại, trang cuối | Giao dịch mới có thể làm dịch các trang offset khi người dùng chuyển trang | PASS |
| SCH-01 | Lịch mặc định lệch ngày | Tính đầu ngày theo máy chủ | Đã chuyển ngày Việt Nam sang UTC ở tầng truy vấn | PASS | Ca giao năm ở UTC, Asia/Ho_Chi_Minh và America/New_York | Kiểm tra UI với dữ liệu staging ở trạng thái NOT RUN | PASS |
| DATA-01 | PENDING_PAYMENT thiếu hạn | Fixture cũ có thể bỏ qua luồng giữ chỗ và schema chưa yêu cầu hạn | Đã chặn bản ghi mới, audit dữ liệu cũ | PASS | Validation, thanh toán, hết hạn, tranh suất, dry-run | Hai bản ghi cần xác minh liên kết và chỗ | PENDING DATA REPAIR APPROVAL |
| DATA-02 | OPEN sau ngày hoặc hạn | Lifecycle dựa trên dạy thực tế, mốc thời gian là dữ liệu riêng | Giữ lifecycle, sửa điều kiện CTA, audit từng lớp | PASS | Suite lifecycle và 16 lớp được đọc | Ba lớp qua mốc kết thúc cần đối chiếu kế hoạch | PASS |
| DATA-03 | Snapshot lệch và liên kết thiếu | Snapshot cũ có thể được ghi trực tiếp, guard restore chỉ kiểm tra một phần | Đã dùng chung guard restore, xác minh mapping tạo mới | PASS | Kiểm tra dữ liệu khóa, lớp và route Thùng rác | Một lớp lệch và một lớp mồ côi cần bằng chứng lúc tạo | PENDING DATA REPAIR APPROVAL |
| TEST-01 | Bốn ca baseline đỏ | Assertion và dữ liệu không còn khớp nghiệp vụ hiện hành | Đã cập nhật fixture và hợp đồng | PASS | Tổng quan, tìm lớp, cấu hình giữ chỗ và registry đều đạt | Không còn lỗi mở trong bốn ca | PASS |
| TEST-02 | 14 suite dùng URI từ `.env` | Dữ liệu mẫu bên ngoài và thiếu cô lập | Đã cấp fixture và xác minh replica set tạm | PASS | 96/96, không có fallback đến `.env` | Máy chạy cần binary MongoDB tương thích cho MongoMemoryReplSet | PASS |
| FE-01 | 13 cảnh báo lint | Export lẫn JSX và logic phụ trợ, purity và dependency | Đã xử lý cả 13 cảnh báo | PASS | Lint, typecheck, build và Playwright | Vite còn cảnh báo bundle có sẵn | PASS |

Phát hiện ngoài phạm vi về cộng số chỗ khi duyệt đối soát thủ công có ghi tại [bàn giao](10_FINAL_HANDOVER.md). Những thay đổi lần này chưa được commit, push hay deploy.
