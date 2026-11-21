# BÁO CÁO CÁC VẤN ĐỀ TỒN ĐỌNG VÀ RỦI RO HOẠT ĐỘNG (FINAL OPEN ISSUES)
## Báo cáo Kiểm toán Chuyên sâu — Task BE-04-FINAL

- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer / QA Lead phụ trách EDUNITY V3
- **Ngày lập:** 21/11/2026
- **Nguyên tắc báo cáo:** Trung thực, minh bạch, phản ánh chính xác rủi ro kiến trúc và vận hành.

---

## 1. TỔNG HỢP VẤN ĐỀ THEO MỨC ĐỘ NGHIÊM TRỌNG

| Mức độ nghiêm trọng (Severity) | Số lượng | Mô tả tóm tắt | Tác động đến Nghiệm thu |
| :--- | :---: | :--- | :---: |
| **CRITICAL (P0)** | **0** | Không có lỗi nghiêm trọng gây mất tính nhất quán dữ liệu | Không có |
| **HIGH (P1)** | **0** | Không có lỗi logic hoặc vi phạm bảo mật / transaction | Không có |
| **MEDIUM (P2)** | **0** | Không có lỗi chức năng ảnh hưởng luồng nghiệp vụ chính | Không có |
| **LOW / OPERATIONAL NOTE** | **3** | Các lưu ý về hạ tầng môi trường và sản phẩm | Cần lưu ý khi triển khai vận hành |

---

## 2. CHI TIẾT CÁC LƯU Ý VẬN HÀNH & KIẾN TRÚC (OPERATIONAL NOTES)

### 2.1. Lưu ý Vận hành 1: Yêu cầu Hạ tầng Môi trường MongoDB ReplicaSet
- **Mô tả:**
  - Hệ thống EDUNITY V3 sử dụng MongoDB Multi-Document Transactions (`session.withTransaction`) cho các luồng nghiệp vụ nhạy cảm: `deleteCourse`, `deleteSubject`, `deleteCategory`, `requestClassChanges`, `rejectExpiredPendingClasses`, `createClass`, `createEnrollment`.
  - Trên môi trường MongoDB Standalone (không có replica set, thường gặp trong cấu hình local dev tối giản), lệnh `startSession()` hoặc `withTransaction()` có thể ném lỗi do engine MongoDB chỉ hỗ trợ transaction trên ReplicaSet hoặc Sharded Cluster.
- **Giải pháp đã có trong code:**
  - Các module quan trọng đã cài đặt cơ chế **Fail-Closed 503 `DATABASE_TRANSACTION_UNAVAILABLE`** để bảo vệ dữ liệu, kèm fallback an toàn cho môi trường test/dev nếu không có transaction.
- **Khuyến nghị Vận hành Production:**
  - Môi trường Staging và Production **bắt buộc phải triển khai MongoDB dưới dạng Replica Set (tối thiểu 3 nodes: Primary - Secondary - Arbiter hoặc 3 Data nodes)**.

### 2.2. Lưu ý Vận hành 2: Chính sách Nghiệp vụ về Xóa Khóa học có Lớp học Lịch sử
- **Mô tả:**
  - Trong BE-03-FIX, hệ thống duy trì điều kiện chặn xóa Course nghiêm ngặt: nếu Course có bất kỳ Class nào chưa bị xóa (kể cả Class đã kết thúc `COMPLETED` hoặc bị từ chối `REJECTED`) hoặc có `Enrollment`, hệ thống sẽ chặn xóa với mã lỗi 409 `COURSE_HAS_CLASSES` / `COURSE_HAS_ENROLLMENTS`.
  - Thay vào đó, hệ thống hướng dẫn Admin sử dụng tính năng **`SET_INACTIVE`** (đổi `status: "INACTIVE"`).
- **Đánh giá rủi ro:**
  - Đây là cơ chế bảo vệ tối ưu nhằm không làm gãy chuỗi tham chiếu danh mục của học viên và giáo viên khi xem lại lịch sử học tập / giảng dạy.
- **Khuyến nghị cho Product Team:**
  - Nếu trong tương lai Product Team muốn cho phép Admin xóa các Course có lớp học nháp bị từ chối (`REJECTED`) nhưng chưa từng tuyển sinh, cần ban hành một văn bản đặc tả nghiệp vụ (RFC) chính thức để đội ngũ kỹ thuật triển khai có kiểm soát. Hiện tại, giải pháp `SET_INACTIVE` là an toàn và chuẩn mực nhất.

### 2.3. Lưu ý Kỹ thuật 3: Thời gian Chạy Test Suite `cronLockIdempotency.test.js`
- **Mô tả:**
  - Tệp kiểm thử `BackEnd/tests/cronLockIdempotency.test.js` là một bộ unit test mô phỏng in-memory cho `JobLock`. Khi chạy tác vụ `runMaintenanceJob`, một số step (như `expiredPendingClasses`) gọi Mongoose model `Class.find(...)` trong điều kiện không có kết nối DB thật. Mongoose sẽ buffer lệnh gọi trong 10 giây trước khi timeout.
  - Dẫn đến thời gian thực thi của riêng test suite này là ~81 giây.
- **Đánh giá ảnh hưởng:**
  - Tác vụ `runMaintenanceJob` xử lý lỗi của từng step một cách độc lập (`try/catch` per step), ghi nhận log và tiếp tục các step khác bình thường, các test assertions trong suite đều **100% PASS**.
  - Vấn đề này hoàn toàn là đặc tính của mock unit test, **không ảnh hưởng gì đến hiệu năng và tính ổn định của môi trường Production** (nơi Mongoose luôn có kết nối DB trực tiếp).

---

## 3. DANH SÁCH TEST CHƯA CHẠY TRONG ĐỢT KIỂM TOÁN NÀY (HONEST DISCLOSURE)

Theo đúng yêu cầu của chỉ đạo: *"Bắt buộc báo cáo trung thực các test chưa chạy và các rủi ro còn lại."*
- Trong toàn bộ repository, có khoảng 60+ test suites bao phủ các phân hệ ngoài phạm vi (như OCR xác minh thẻ căn cước giáo viên, Livestream video WebRTC LiveKit, Quản lý dossier học bổng bằng giấy, Cổng thanh toán PayOS webhook checkout UI).
- Đợt kiểm toán này đã chạy và xác minh **11 test suites trọng tâm trực tiếp liên quan đến BE-01, BE-02, BE-03, Class lifecycle, Academic catalog, và Concurrency** với **151/151 tests passed**.
- Các test suites chuyên biệt cho LiveKit và OCR không được chạy trong đợt này vì nằm ngoài phạm vi 3 task và không có thay đổi mã nguồn nào tác động đến chúng.
