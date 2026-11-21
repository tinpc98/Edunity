# BÁO CÁO CÁC CAN THIỆP MÃ NGUỒN CÓ MỤC TIÊU (TARGETED FIXES)
## Đánh giá & Kết luận Mã nguồn — Task BE-03-FIX

- **Mã task:** `BE-03-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Ngày lập:** 21/11/2026

---

## 1. KẾT LUẬN KIỂM TOÁN MÃ NGUỒN (CODE AUDIT VERDICT)

$$\mathbf{NO\ CODE\ CHANGES\ REQUIRED}$$

*(KHÔNG YÊU CẦU THAY ĐỔI MÃ NGUỒN)*

---

## 2. CĂN CỨ VÀ NGUYÊN TẮC QUYẾT ĐỊNH

Theo chỉ đạo tại Mục 4 của Đặc tả Yêu cầu Task BE-03-FIX:
> **"Implementation Rules:**  
> Chỉ sửa khi:  
> - Có lỗi được chứng minh từ source hoặc test.  
> - Có sai lệch rõ ràng với API contract hiện hành.  
> - Có nguy cơ mất dữ liệu hoặc phá vỡ dependency.  
>  
> Nếu vấn đề chỉ là quyết định nghiệp vụ chưa thống nhất:  
> - Không sửa logic.  
> - Ghi rõ trong báo cáo.  
> - Không tự đưa ra quy tắc mới.  
>  
> Nếu không phát hiện lỗi, ghi rõ NO CODE CHANGES REQUIRED. Không sửa chỉ để có thay đổi code."

### 2.1. Không có lỗi từ Source Code hoặc Test Suites
- Tất cả 22 test cases trong `tests/be03AcademicSoftDelete.test.js` đều vượt qua (100% PASS).
- Tất cả 14 test cases trong `tests/chauSafeDeleteConcurrencyReplSet.test.js` đều vượt qua (100% PASS).
- Không có bất kỳ lỗi cú pháp, unhandled promise rejections, session leaks, race conditions, hay transaction isolation failures nào.

### 2.2. Không có sai lệch với API Contract hiện hành
- API `DELETE /admin/categories/:id`: Hoạt động đúng đặc tả, trả về 401/403 cho quyền hạn không hợp lệ, 404 khi không tìm thấy, 409 khi có Subject/Course/Class/LearningPath/Campaign/PricingPolicy phụ thuộc, và 200 khi soft-delete thành công.
- API `DELETE /admin/subjects/:id`: Hoạt động đúng đặc tả, kiểm tra toàn bộ 6 loại phụ thuộc, trả về 409 tương ứng và 200 khi soft-delete thành công.
- API `DELETE /admin/courses/:id`: Hoạt động đúng đặc tả an toàn cao nhất, kiểm tra Class, Enrollment, SessionRefundReview, Campaign, LearningPath, PricingPolicy; tự động cascade soft-delete SyllabusVersion và CurriculumUnit trong cùng một transaction.

### 2.3. Không có nguy cơ mất dữ liệu hay phá vỡ Dependency
- Việc giữ nguyên điều kiện chặn xóa Course khi có Class (kể cả Class lịch sử đã hoàn thành) và Enrollment là chuẩn mực bắt buộc để bảo vệ tính toàn vẹn hồ sơ học tập và báo cáo thuế/tài chính.
- Việc tự ý nới lỏng điều kiện chặn xóa mà không có phê duyệt chính thức từ Product Owner sẽ tạo ra nguy cơ mồ côi dữ liệu lịch sử (data corruption).

---

## 3. KHUYẾN NGHỊ VẬN HÀNH DÀNH CHO PRODUCT TEAM (PRODUCT RECOMMENDATIONS)

Nếu trong tương lai, ban quản lý sản phẩm (Product Team / Business Analysts) muốn đưa ra tính năng cho phép xóa Course ngay cả khi đã có Class cũ (ví dụ: lớp học nháp bị từ chối `REJECTED` nhưng chưa từng tuyển sinh):
1. Cần ban hành một tài liệu đặc tả Business Rule chính thức xác định rõ:
   - Các trạng thái Class nào được coi là "không có giá trị lịch sử" (ví dụ: chỉ `REJECTED` hoặc `DRAFT` không có enrollment).
   - Cơ chế xử lý các bản ghi Session hoặc Attendance nháp liên quan.
2. Tuyệt đối không nới lỏng điều kiện đối với `Enrollment` và `SessionRefundReview` vì đây là các thực thể tài chính/khiếu nại bắt buộc phải lưu trữ theo luật kế toán và bảo vệ người tiêu dùng.
3. Cho đến khi có văn bản nghiệp vụ chính thức, cơ chế `SET_INACTIVE` hiện tại là giải pháp chuẩn mực, an toàn và đầy đủ nhất cho hệ thống EDUNITY V3.
