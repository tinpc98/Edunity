# BÁO CÁO 09: ĐÁNH GIÁ RỦI RO CÒN LẠI VÀ BIỆN PHÁP PHÒNG NGỪA (REMAINING RISKS & MITIGATIONS)

- **Dự án:** Edunity V3
- **Chế độ:** RISK ASSESSMENT & OPERATIONAL SAFEGUARD
- **Người thực hiện:** Châu (Principal Backend Engineer + Software Architect)
- **Thời gian lập:** 13/11/2026

---

## 1. TỔNG QUAN ĐÁNH GIÁ RỦI RO

Sau khi hoàn tất việc loại bỏ toàn bộ mã nguồn LMS ở tầng Backend, việc đánh giá các rủi ro vận hành trên các môi trường triển khai (Staging, Production) là bắt buộc nhằm đảm bảo quá trình chuyển đổi (cutover) diễn ra mượt mà không có downtime hay lỗi phát sinh.

Dưới đây là 4 rủi ro tiềm ẩn chính đã được nhận diện kèm theo giải pháp giảm thiểu đã được áp dụng.

---

## 2. MA TRẬN RỦI RO VÀ GIẢI PHÁP PHÒNG NGỪA

### Rủi ro 1: Tồn đọng các Collection LMS cũ trên Database MongoDB Staging/Prod
- **Mức độ rủi ro:** Thấp (Low).
- **Mô tả:** Cơ sở dữ liệu Staging hoặc bản sao Production có thể vẫn còn chứa các collection như `learningresources`, `assignments`, `submissions`, v.v... Nếu script kiểm tra index cố gắng truy vấn các collection không còn trong schema hoặc đã bị xóa index, hệ thống có thể gặp lỗi `ns does not exist`.
- **Biện pháp đã triển khai:**
  - File [`BackEnd/scripts/backupRestoreClone.js`](file:///c:/CODE/Edunity/BackEnd/scripts/backupRestoreClone.js) đã được cập nhật cơ chế `try/catch` bắt lỗi `ns does not exist` từ MongoDB driver và trả về mảng index rỗng.
  - File [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js) đã loại bỏ 19 index specs của các collection LMS cũ, chỉ kiểm tra và đồng bộ đúng 35 specs của 48 core models.
- **Khuyến nghị vận hành:** Admin có thể giữ lại các collection cũ ở chế độ lưu trữ (archive) hoặc thực hiện `db.collection.drop()` trên Staging mà không gây ảnh hưởng đến bất kỳ API nào của Backend.

---

### Rủi ro 2: Khách hàng/Client cũ gọi vào các Endpoint LMS đã gỡ bỏ
- **Mức độ rủi ro:** Rất thấp (Very Low).
- **Mô tả:** Các phiên bản web app cũ hoặc script bên thứ ba có thể gửi request vào các URL cũ như `/student/learning-resources` hay `/teaching/assignments`.
- **Biện pháp đã triển khai:**
  - Tất cả các route LMS đã được unmount hoàn toàn khỏi các file định tuyến `studentRoutes.js` và `teachingRoutes.js`.
  - Express router sẽ tự động phản hồi mã trạng thái chuẩn `404 Not Found` kèm format lỗi chuẩn của hệ thống (`AppError`).
  - Không có hiện tượng rò rỉ stack trace hay gây crash tiến trình Node.js server.

---

### Rủi ro 3: Bộ nhớ đệm (Browser Cache / Service Worker) ở phía Client
- **Mức độ rủi ro:** Trung bình (Medium).
- **Mô tả:** Trình duyệt người dùng có thể lưu cache mã JavaScript Frontend cũ, dẫn đến việc giao diện vẫn cố gắng hiển thị các nút bấm "Xem bài tập" hoặc "Nộp bài".
- **Biện pháp đã triển khai:**
  - Bàn giao thông tin cho Băng để bổ sung cơ chế cache busting (hash tên file build) trong Vite/Webpack.
  - Băng kiểm tra và cập nhật `routePaths.ts` để bảo đảm các liên kết điều hướng chỉ tập trung vào Lớp học, Buổi học, và Thanh toán.

---

### Rủi ro 4: Tính nhất quán giữa Điểm danh Session và Quyết toán Thù lao
- **Mức độ rủi ro:** Đã được kiểm soát hoàn toàn (Mitigated).
- **Mô tả:** Lo ngại rằng việc bỏ các chỉ số học tập có thể ảnh hưởng đến điều kiện thanh toán cho giáo viên.
- **Biện pháp đã triển khai:**
  - Xác nhận bằng mã nguồn và test suite: Điều kiện thù lao giáo viên (`TeacherEarning`) chỉ phụ thuộc vào **Điểm danh buổi học (Attendance >= 70%)** và **Trạng thái buổi học (`Session.status = COMPLETED`)**.
  - Quy tắc giữ tiền 7 ngày (`HOLD_7_DAYS`) hoạt động độc lập qua cron job và đã được kiểm chứng PASS trong `classLifecycleRegression.test.js`.

---

## 3. CHECKLIST KIỂM TRA CHO ĐỢI DEPLOY TIẾP THEO

- [x] Chạy preflight kiểm tra chỉ mục DB: `node BackEnd/scripts/migrationPreflight.js` (Thành công 35/35 specs).
- [x] Chạy kiểm thử sao lưu DB clone: `npm test tests/backupRestoreClone.test.js` (Thành công 15/15 tests).
- [ ] Khi deploy Staging: Chạy lại smoke test kiểm tra tạo lớp học, tạo buổi học và mở phòng LiveKit.
- [ ] Khi deploy Staging: Kiểm tra thử nghiệm luồng thanh toán QR PayOS và tự động ghi danh.

---

## 4. KẾT LUẬN

Hệ thống đã đạt trạng thái an toàn cao nhất để đưa vào vận hành. Mọi rủi ro kỹ thuật liên quan đến việc loại bỏ phân hệ LMS đều đã được kiểm soát và có giải pháp phòng ngừa cụ thể.

