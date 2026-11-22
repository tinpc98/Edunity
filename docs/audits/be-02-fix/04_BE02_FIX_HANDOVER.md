# BIÊN BẢN BÀN GIAO KỸ THUẬT — TASK BE-02-FIX
## Tối ưu hóa tính tin cậy của Maintenance Job & Khóa phân tán

- **Mã task:** `BE-02-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Trạng thái:** **READY FOR PRODUCTION / ACCEPTANCE PASSED**
- **Cam kết:** Không commit, không push, không merge theo yêu cầu của chế độ làm việc.

---

## 1. TỔNG KẾT BÀN GIAO

Toàn bộ các rủi ro phát hiện trong đợt audit trước đối với tiến trình tự động từ chối lớp học quá hạn (`rejectExpiredPendingClasses`) và cơ chế khóa bảo trì phân tán (`jobLock.js` / `maintenanceJob.js`) đã được xử lý triệt để:

1. **Tính nguyên tử (Atomicity) 100%:**
   Thao tác chuyển trạng thái lớp học sang `REJECTED` và ghi nhật ký kiểm toán hệ thống `AuditLog` (action: `CLASS_EXPIRED_REJECTED`, actorType: `SYSTEM`) được đặt hoàn toàn trong cùng một MongoDB Transaction Session (`session.withTransaction`). Bất kỳ lỗi nào trong quá trình ghi audit sẽ tự động abort transaction, đưa trạng thái `Class` về `PENDING_APPROVAL`, không phát sinh bản ghi mồ côi và không gửi notification sai.
2. **Khả năng tự phục hồi (Self-Healing Recovery):**
   Khi một lớp học bị rollback do lỗi tạm thời, lần quét định kỳ tiếp theo của maintenance job sẽ tự động tìm thấy và xử lý lại lớp học đó một cách toàn vẹn.
3. **Cách ly lỗi thông báo (Post-Commit Notification Isolation):**
   Thông báo đến giáo viên được gửi nghiêm ngặt sau khi transaction đã commit thành công. Lỗi gửi thông báo (timeout, network) được bọc trong `try/catch` độc lập, không làm rollback giao dịch đã thành công và không làm dừng tiến trình xử lý của job.
4. **Bảo vệ khóa phân tán với Heartbeat tự động:**
   Đã cấu hình `options.heartbeatIntervalMs: 60 * 1000` cho `runExclusive("maintenance", 4 * 60 * 1000, ...)` trong `startMaintenanceJob`. Timer heartbeat tự động gia hạn lease mỗi 1 phút cho lease 4 phút, loại bỏ hoàn toàn nguy cơ hai worker chạy song song khi job kéo dài.
5. **Cơ chế phục hồi sau sự cố sập instance (Crash Recovery):**
   Khi một worker bị crash đột tử (OOM, kill), lease khóa trong DB sẽ tự động hết hạn sau tối đa 4 phút (`lockedUntil <= now`), cho phép instance tiếp theo chiếm quyền chạy bình thường mà không bị kẹt deadlock.
6. **Không phá vỡ kiến trúc (Zero Regression):**
   Không can thiệp frontend, không thay đổi các trạng thái khác của Class (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `NEED_CHANGES`), không tác động đến tài chính, thanh toán hay livekit. Toàn bộ 97 test cases của hệ thống backend liên quan đều đạt 100% PASS.

---

## 2. DANH MỤC TÀI LIỆU VÀ TỆP NGUỒN LIÊN QUAN

- **Phân tích rủi ro & Root Cause:** [01_BE02_FIX_ANALYSIS.md](file:///c:/CODE/Edunity/docs/audits/be-02-fix/01_BE02_FIX_ANALYSIS.md)
- **Báo cáo triển khai kỹ thuật:** [02_BE02_FIX_IMPLEMENTATION.md](file:///c:/CODE/Edunity/docs/audits/be-02-fix/02_BE02_FIX_IMPLEMENTATION.md)
- **Báo cáo kết quả kiểm thử:** [03_BE02_FIX_TEST_RESULTS.md](file:///c:/CODE/Edunity/docs/audits/be-02-fix/03_BE02_FIX_TEST_RESULTS.md)
- **Biên bản bàn giao kỹ thuật:** [04_BE02_FIX_HANDOVER.md](file:///c:/CODE/Edunity/docs/audits/be-02-fix/04_BE02_FIX_HANDOVER.md)
- **Tệp nguồn chính đã sửa:** [maintenanceJob.js](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js)
- **Tệp test suite tích hợp:** [be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)

---

## 3. HƯỚNG DẪN VẬN HÀNH & GIÁM SÁT SẢN PHẨM

1. **Biến môi trường hỗ trợ:**
   - `APP_TZ_OFFSET_MINUTES`: Độ lệch múi giờ tính bằng phút so với UTC (mặc định: `420` tức UTC+7 giờ Việt Nam).
   - Khóa phân tán bảo trì: bảng `JobLocks`, tên khóa `maintenance`.
2. **Theo dõi log kiểm toán:**
   - Truy vấn `AuditLog` với `action: "CLASS_EXPIRED_REJECTED"` và `actorType: "SYSTEM"` để thống kê các lớp học bị từ chối tự động.
3. **Giám sát khóa bảo trì:**
   - Kiểm tra `JobLocks.findOne({ name: "maintenance" })`:
     - Khi job đang chạy: `lockedUntil` được cập nhật tiến về tương lai mỗi 1 phút.
     - Khi job hoàn tất: `lockedUntil` được đặt về `1970-01-01T00:00:00.000Z` (`new Date(0)`).
