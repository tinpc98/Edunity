# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 05: Xác thực và Cơ chế Khôi phục Dữ liệu An toàn (Restore Validation)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**Endpoint:** `POST /api/admin/trash/:type/:id/restore`  
**Nhánh làm việc:** `feature/teacher-admin`  

---

### 1. Nguyên tắc Khôi phục Dữ liệu An toàn

1. **Không tự động công khai (Safe Initial State):**
   - Danh mục (`Category`), Môn học (`Subject`), Khóa học (`Course`) khi khôi phục được đưa về trạng thái **`INACTIVE`** (Không hoạt động). Quản trị viên phải chủ động kiểm tra nội dung trước khi kích hoạt `ACTIVE`.
   - Lớp học (`Class`) khi khôi phục được đưa về trạng thái **`DRAFT`** (Bản nháp), tuân thủ quy trình kiểm duyệt lịch dạy và mở lớp.
2. **Không tái tạo dữ liệu tài chính:**
   - Khôi phục không tạo lại `Enrollment`, không sinh thêm `Payment`, không tính lại `TeacherEarning`.
3. **Tính Idempotent:**
   - Nếu gọi khôi phục trên bản ghi đã active (`isDeleted: false`), hệ thống trả về bản ghi an toàn mà không chỉnh sửa bất kỳ dữ liệu nào khác.

---

### 2. Chuỗi Kiểm tra Ràng buộc Trước khi Khôi phục (Pre-Flight Checks)

#### A. Khôi phục Danh mục (`Category`):
- **Kiểm tra xung đột Slug:** Nếu mã `slug` của danh mục đã bị một danh mục khác đang hoạt động sử dụng $\rightarrow$ Ném lỗi `RESTORE_CONFLICT` (409) kèm thông báo: *"Slug đang bị trùng lặp với một danh mục đang hoạt động."*

#### B. Khôi phục Môn học (`Subject`):
- **Kiểm tra Danh mục cha:** Bắt buộc danh mục cha (`categoryId`) phải đang tồn tại và chưa bị xóa mềm (`isDeleted: { $ne: true }`). Nếu danh mục cha đã bị xóa $\rightarrow$ Chặn khôi phục: *"Danh mục cha của môn học này đã bị xóa hoặc không hoạt động. Cần khôi phục danh mục cha trước."*
- **Kiểm tra trùng Slug:** Kiểm tra slug trong phạm vi các môn học đang hoạt động.

#### C. Khôi phục Khóa học (`Course`):
- **Kiểm tra Danh mục và Môn học:** Cả Category cha và Subject cha đều phải đang hoạt động. Nếu một trong hai đã bị xóa $\rightarrow$ Chặn khôi phục.
- **Cascade Khôi phục Giáo trình:** Tự động khôi phục lại các phiên bản giáo trình `SyllabusVersion` và bài học `CurriculumUnit` đã xóa kèm theo khóa học này.

#### D. Khôi phục Lớp học (`Class`):
- **Kiểm tra Khóa học:** Khóa học cha phải đang tồn tại và chưa bị xóa.
- **Kiểm tra Giảng viên:** Tài khoản giáo viên phụ trách (`teacherId`) phải đang ở trạng thái `ACTIVE` và chưa bị xóa/khóa tài khoản.

---

### 3. Trải nghiệm Người dùng trên Giao diện
- Khi Quản trị viên mở Modal "Chi tiết" hoặc bấm "Khôi phục":
  - Hệ thống tự động gửi yêu cầu pre-flight `GET /api/admin/trash/:type/:id`.
  - Nếu `canRestore === false`: Hiển thị khung cảnh báo đỏ rõ ràng nguyên nhân xung đột (ví dụ: *"Danh mục cha đã bị xóa..."*) và **vô hiệu hóa nút Khôi phục**.
  - Nếu `canRestore === true`: Hiển thị khung xanh lá *"Sẵn sàng khôi phục"*, nút "Khôi phục" sẵn sàng cho phép thực thi.
