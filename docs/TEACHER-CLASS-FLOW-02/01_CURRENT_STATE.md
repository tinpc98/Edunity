# 01. Hiện trạng trước khi sửa

Mốc audit: commit `89387a4`, nhánh `BE-2`. Số dòng bên dưới là của commit này.

## Đường đi của luồng

| Bước | API | Service |
|---|---|---|
| Danh sách khóa chuẩn | `GET /api/courses` | `courseCatalogService.searchCourses`, chỉ trả ACTIVE, không xét quyền dạy |
| Tạo DRAFT | `POST /api/teacher/classes` | `teacherClassService.createClass` |
| Sửa DRAFT | `PATCH /api/teacher/classes/:id` | `teacherClassService.updateClass` |
| Gửi duyệt | `POST /api/teacher/classes/:id/submit` | `teacherClassService.submitClass` |
| Yêu cầu sửa | `POST /api/admin/classes/:id/request-changes` | `adminClassService.requestChanges` |
| Phê duyệt | `POST /api/admin/classes/:id/approve` | `adminClassService.approveClass` |
| Từ chối | `POST /api/admin/classes/:id/reject` | `adminClassService.rejectClass` |
| Tự từ chối quá hạn | Cron 5 phút | `maintenanceJob.rejectExpiredPendingClasses` |

## Nguyên nhân chặn

| # | Vị trí | Vấn đề |
|---|---|---|
| G1 | `teacherClassService.js:219` | Tạo DRAFT chạy toàn bộ `validateClassGate`: quyền dạy, giá, hợp đồng |
| G2 | `teacherClassService.js:262` | Sửa DRAFT chạy cùng gate |
| G3 | `teacherClassService.js:333, 342, 349` | Gửi duyệt bị chặn bởi quyền dạy, giá, hợp đồng |
| G4 | `CreateTeacherClassPage.tsx:94, 102` | Chỉ tải và hiển thị khóa khớp quyền APPROVED |
| G5 | `CreateTeacherClassPage.tsx:280, 343, 788` | Không có quyền thì hiện banner, ẩn danh sách, khóa nút Tiếp tục |

API danh sách khóa học không phải nguyên nhân.

## Lỗi có sẵn phát hiện trong cùng luồng

| # | Lỗi | Hệ quả |
|---|---|---|
| D1 | Approve không kiểm tra hạn của BE-02 | Duyệt được lớp đã tới ngày khai giảng trước khi job chạy |
| D2 | Approve và reject ghi AuditLog ngoài transaction | Audit lỗi nhưng lớp đã OPEN hoặc REJECTED |
| D3 | Gửi duyệt không có AuditLog | Không truy vết được |
| D4 | Gửi duyệt không kiểm tra `verifiedUntil` | Giáo viên hết hạn xác minh vẫn gửi được |
| D5 | `updateClass` kiểm tra trạng thái tách khỏi lệnh ghi | Request sửa đang chạy có thể ghi đè lớp vừa OPEN |
| D6 | Approve chỉ so trạng thái khi ghi | Lớp đổi nội dung trong lúc kiểm tra vẫn được mở |
| D7 | `courseId` nhận object toán tử | `{ "$ne": null }` chọn được một khóa bất kỳ |
| D8 | Response gửi duyệt lại chứa `reviewedBy` | Lộ ID Admin cho giáo viên |
| D9 | FE không có trạng thái `NEED_CHANGES` | Không thấy lý do, không sửa và không gửi lại được |
| D10 | `TeacherClassDetailPage.tsx:306, 959` cho sửa REJECTED | Trái BE-01, backend trả 409 |
| D11 | Modal sửa thiếu ngày tuyển sinh và lịch học | DRAFT thiếu các trường này không thể hoàn thiện trên UI |
| D12 | Wizard tự điền hai ca học (`:46`) | Lưu lịch mà giáo viên không nhập |
| D13 | `AdminClassDetailPage.tsx:358` mặc định `'VERIFIED'` | Có thể hiển thị sai trạng thái xác minh |
| D14 | Thông báo từ chối bảo "gửi duyệt lại" | Sai, REJECTED là trạng thái cuối |
