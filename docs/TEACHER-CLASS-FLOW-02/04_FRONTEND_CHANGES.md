# 04. Thay đổi Frontend

## Teacher

| Màn hình | Thay đổi |
|---|---|
| Tạo lớp, bước 1 | Hiện mọi khóa ACTIVE từ API thật; bỏ lọc, banner và khóa nút theo quyền dạy; mất mạng không còn hiện như danh mục rỗng |
| Tạo lớp, mọi bước | Nút **Lưu nháp**; chống bấm nhiều lần; giữ dữ liệu khi chuyển bước và khi lưu lỗi |
| Tạo lớp, bước 2 | Kiểm tra thứ tự ngày tại ô nhập; các ô xếp dọc trên điện thoại |
| Tạo lớp, bước 3 | Lịch mặc định rỗng, không bắt buộc khi lưu nháp |
| Tạo lớp, bước 4 | Giải thích ngắn điều kiện gửi duyệt và điều kiện Admin kiểm tra |
| Lớp của tôi | Nhãn và tab "Cần chỉnh sửa", hiện lý do của Admin |
| Chi tiết lớp | Thẻ điều kiện; sửa và gửi lại DRAFT, NEED_CHANGES; modal có ngày tuyển sinh và lịch học |
| Chi tiết lớp REJECTED | Không còn nút sửa, gửi, thêm buổi; thông báo đúng là trạng thái cuối |
| Hồ sơ, thẻ Quyền giảng dạy | Sửa câu "phải có quyền mới được tạo lớp" |

## Admin, chi tiết lớp

- Thẻ **Điều kiện phê duyệt** gồm 7 dòng, nêu đúng lý do chưa đạt, có nút "Kiểm tra lại".
- Nút Phê duyệt chỉ bật khi `canApprove`. Backend vẫn kiểm tra lại khi bấm.
- Từ chối và Yêu cầu chỉnh sửa không phụ thuộc các điều kiện.
- Lỗi backend hiện đủ các điều kiện thiếu, không hiện thông báo thành công.
- Không có thao tác tự cấp quyền hay tạo hợp đồng.

## File

| Loại | File (trong `FrontEnd/src`) |
|---|---|
| Mới | `components/common/ClassReadinessCard.tsx` |
| Mới | `features/teacher/classes/components/ScheduleEditor.tsx` (tách từ wizard, dùng chung với modal sửa) |
| Mới | `utils/classForm.ts` |
| Sửa | `features/teacher/classes/create/CreateTeacherClassPage.tsx` |
| Sửa | `features/teacher/classes/detail/TeacherClassDetailPage.tsx` |
| Sửa | `features/teacher/classes/TeacherClassesPage.tsx` |
| Sửa | `features/teacher/profile/TeacherSubjectAuthorizationCard.tsx` |
| Sửa | `features/admin/classes/AdminClassDetailPage.tsx` |
| Sửa | `services/class.service.ts`, `types/class.ts`, `utils/apiErrorMap.ts` |
| Xóa | `utils/teacherCourseAuthorization.ts` (chỉ phục vụ bộ lọc đã bỏ, không còn nơi dùng) |
