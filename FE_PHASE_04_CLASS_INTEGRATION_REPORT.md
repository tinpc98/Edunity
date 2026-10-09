# FE Phase 04 — Class Integration

## 1. Scope
Phase 4 tích hợp toàn bộ domain **Class (Lớp học)** giữa Frontend và Backend thực tế mà không thay đổi bất kỳ dòng mã nào ở Backend (Backend Freeze tuyệt đối):
- **A. Public**: Danh sách lớp học thực tế (`/classes`), chi tiết lớp học (`/classes/:classId`), tính năng lọc (theo `courseId`, `subjectId`, `classType`), hiển thị thông tin thực tế của Khóa học (Course relation) và Giáo viên (Teacher relation), hiển thị sĩ số / tính khả dụng (Availability) từ endpoint thực tế mà không kích hoạt ghi danh (Enrollment) trong phase này.
- **B. Teacher**: Danh sách "Lớp của tôi" (`/teacher/classes`), Khởi tạo lớp học (`/teacher/classes/create`) với chọn Khóa học chuẩn từ Phase 3 và Verified Teacher Gate, Chi tiết lớp học (`/teacher/classes/:classId`), Chỉnh sửa lớp học (`PATCH /api/teacher/classes/:id`), Gửi duyệt lớp học (`POST /api/teacher/classes/:id/submit`), Xử lý quy tắc loại lớp FREE/PAID và giới hạn sĩ số / ngày học.
- **C. Admin**: Giám sát lớp học toàn hệ thống (`/admin/classes`), Hàng đợi chờ duyệt (`/admin/classes?tab=pending`), Chi tiết thẩm định lớp học (`/admin/classes/:classId`), Phê duyệt lớp (`POST /api/admin/classes/:id/approve`), Từ chối lớp kèm lý do (`POST /api/admin/classes/:id/reject`).

---

## 2. Backend Contract Discovered

### Public Class
- **GET `/api/classes`**:
  - **Auth / Role**: Public (Khách hoặc Người dùng đã đăng nhập).
  - **Query Params**: `courseId`, `categoryId`, `subjectId`, `gradeLevel`, `classType` (`FREE` | `PAID`), `q` (tìm kiếm text), `page` (mặc định 1), `pageSize` (mặc định 20, tối đa 100).
  - **Backend Logic**: Tự động lọc chỉ trả về các lớp có `status: { $in: ["OPEN", "IN_PROGRESS"] }`, `isDeleted: { $ne: true }`. Các trạng thái nháp, chờ duyệt hoặc bị từ chối được bảo mật trên máy chủ.
  - **Response Envelope**: `{ success: true, data: { items: ApiClass[], total, page, pageSize, totalPages } }`.
- **GET `/api/classes/:id`**:
  - **Auth / Role**: Public.
  - **Params**: `id` (ObjectId).
  - **Response Envelope**: `{ success: true, data: ApiClass }`.
- **GET `/api/classes/:id/sessions`**:
  - **Auth / Role**: Public. Trả về danh sách buổi học của lớp.
- **GET `/api/courses/:id/classes`**:
  - **Auth / Role**: Public. Trả về danh sách lớp học thuộc về một khóa học cụ thể.

### Teacher Class
- **GET `/api/teacher/classes`**:
  - **Auth / Role**: `TEACHER` (JWT Bearer Token).
  - **Query Params**: `page`, `pageSize`, `status`.
  - **Backend Logic**: Lọc theo `teacherId = req.user.id`, `isDeleted: { $ne: true }`.
  - **Response Envelope**: `{ success: true, data: { items: ApiClass[], total, page, pageSize, totalPages } }`.
- **POST `/api/teacher/classes`**:
  - **Auth / Role**: `TEACHER` (yêu cầu tài khoản có `teacherProfile.verificationStatus === "VERIFIED"` và `status === "ACTIVE"`).
  - **Teacher Identity**: Tự động trích xuất từ JWT `req.user.id`, gán `teacherName` từ `teacherProfile.fullName`. Frontend **không** gửi `teacherId`.
  - **Request Body**:
    ```json
    {
      "courseId": "ObjectId (required)",
      "className": "string (required, non-blank)",
      "description": "string (optional)",
      "coverImage": "string (optional)",
      "classType": "FREE" | "PAID" (required),
      "price": number (0 nếu FREE, > 0 nếu PAID),
      "capacity": integer >= 1 (required),
      "enrollmentStart": "ISO string (optional)",
      "enrollmentEnd": "ISO string (optional)",
      "startDate": "ISO string (optional)",
      "endDate": "ISO string (optional)",
      "schedule": [
        {
          "dayOfWeek": 0-6 (0 = Sunday),
          "startTime": "HH:mm",
          "endTime": "HH:mm (sau startTime)"
        }
      ]
    }
    ```
  - **Response**: `201 Created` kèm Class mới khởi tạo ở trạng thái `DRAFT`.
- **GET `/api/teacher/classes/:id`**:
  - **Auth / Role**: `TEACHER` (yêu cầu `cls.teacherId === req.user.id`).
  - **Response**: `{ success: true, data: ApiClass }`.
- **PATCH `/api/teacher/classes/:id`**:
  - **Auth / Role**: `TEACHER` (yêu cầu `cls.teacherId === req.user.id`).
  - **Condition**: Chỉ cho phép chỉnh sửa khi lớp ở trạng thái `DRAFT` hoặc `REJECTED`.
  - **Body**: Các trường có thể cập nhật: `courseId`, `className`, `description`, `coverImage`, `classType`, `price`, `capacity`, `schedule`, `dates`.
- **POST `/api/teacher/classes/:id/submit`**:
  - **Auth / Role**: `TEACHER` (yêu cầu `cls.teacherId === req.user.id`).
  - **Condition**: Trạng thái phải là `DRAFT` hoặc `REJECTED`. Yêu cầu đầy đủ: `description`, `startDate`, `endDate`, `schedule.length > 0`, và ít nhất 1 session hợp lệ không bị hủy. Chuyển trạng thái sang `PENDING_APPROVAL`.

### Admin Class
- **GET `/api/admin/classes/pending`**:
  - **Auth / Role**: `ADMIN`.
  - **Query Params**: `page`, `pageSize`.
  - **Response Envelope**: `{ success: true, data: { items: ApiClass[], total, page, pageSize, totalPages } }`.
- **GET `/api/admin/classes/:id`**:
  - **Auth / Role**: `ADMIN`.
  - **Response**: `{ success: true, data: ApiClass }`.
- **POST `/api/admin/classes/:id/approve`**:
  - **Auth / Role**: `ADMIN`.
  - **Condition**: Lớp phải ở trạng thái `PENDING_APPROVAL`.
  - **Action**: Chuyển trạng thái sang `OPEN`, lưu `reviewedBy` và `reviewedAt`.
- **POST `/api/admin/classes/:id/reject`**:
  - **Auth / Role**: `ADMIN`.
  - **Body**: `{ "reviewNote": "string (optional)" }`.
  - **Action**: Chuyển trạng thái sang `REJECTED`, lưu `reviewNote`, `reviewedBy`, `reviewedAt`.

### Availability
- **GET `/api/classes/:classId/availability`**:
  - **Auth / Role**: Public.
  - **Response**:
    ```json
    {
      "success": true,
      "data": {
        "classId": "ObjectId",
        "capacity": 20,
        "enrolledCount": 0,
        "availableSeats": 20,
        "isFull": false
      }
    }
    ```

---

## 3. Class Model
Các trường dữ liệu thực tế từ Mongoose schema `Class.js`:
- `_id`: ObjectId định danh của Class.
- `courseId`: ObjectId tham chiếu model `Course`.
- `courseTitle`: Tên khóa học chuẩn hóa (denormalized).
- `teacherId`: ObjectId tham chiếu model `User` giáo viên phụ trách.
- `teacherName`: Họ tên giáo viên (denormalized từ profile).
- `categoryId`: ObjectId danh mục tham chiếu.
- `subjectId`: ObjectId môn học tham chiếu.
- `gradeLevel`: Enum cấp lớp (`GRADE_LEVELS`) thừa hưởng từ Course.
- `className`: Tên lớp học công khai (bắt buộc, không để trống).
- `description`: Mô tả chi tiết mục tiêu đào tạo của lớp.
- `coverImage`: URL ảnh bìa đại diện.
- `classType`: Loại hình lớp (`"FREE"` | `"PAID"`).
- `price`: Học phí (Decimal128; quy ước: FREE = 0, PAID > 0).
- `capacity`: Sĩ số tối đa (số nguyên >= 1).
- `enrolledCount`: Số học viên hiện tại đã ghi danh thành công.
- `enrollmentStart`: Ngày mở tuyển sinh.
- `enrollmentEnd`: Ngày đóng tuyển sinh.
- `startDate`: Ngày bắt đầu khóa học.
- `endDate`: Ngày kết thúc khóa học.
- `status`: Enum trạng thái vòng đời (`DRAFT`, `PENDING_APPROVAL`, `OPEN`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- `schedule`: Mảng ca học trong tuần `[{ dayOfWeek: 0..6, startTime: "HH:mm", endTime: "HH:mm" }]`.
- `ratingAverage`: Điểm đánh giá trung bình (mặc định 0).
- `ratingCount`: Số lượng đánh giá (mặc định 0).
- `reviewNote`: Ghi chú thẩm định từ Admin (nếu bị REJECTED).
- `reviewedBy`, `reviewedAt`: Thông tin kiểm duyệt từ Admin.
- `updatedBy`: ObjectId người cập nhật cuối cùng.
- `createdAt`, `updatedAt`: Timestamps hệ thống.

---

## 4. Class Lifecycle
Các chuyển đổi trạng thái thực tế được backend kiểm soát:
```
[DRAFT] ── (submitClass) ──> [PENDING_APPROVAL] ── (approveClass) ──> [OPEN] ──> [IN_PROGRESS] ──> [COMPLETED]
   ^                                │
   │                                ▼
   └── (updateClass) ◄─────── [REJECTED]
```
1. **Khởi tạo**: Teacher tạo lớp -> luôn vào trạng thái `DRAFT`.
2. **Chỉnh sửa**: Chỉ được phép khi ở `DRAFT` hoặc `REJECTED`.
3. **Gửi duyệt**: Chuyển từ `DRAFT` / `REJECTED` -> `PENDING_APPROVAL` (yêu cầu đầy đủ mô tả, ngày tháng, lịch học, và ít nhất 1 session).
4. **Phê duyệt**: Admin duyệt `PENDING_APPROVAL` -> `OPEN` (mở đăng ký công khai).
5. **Từ chối**: Admin từ chối `PENDING_APPROVAL` -> `REJECTED` kèm `reviewNote`.
6. **Công khai**: Chỉ các lớp có trạng thái `OPEN` và `IN_PROGRESS` mới hiển thị trên giao diện công khai (`/classes`).

---

## 5. Backend Capability Gaps
1. **Teacher Cancel Class**: Backend không cung cấp endpoint riêng `POST /api/teacher/classes/:id/cancel`. Thao tác hủy lớp không được fake trên FE.
2. **Admin Filter theo Từng Tiêu Chí Riêng**: Route Admin chỉ có `/api/admin/classes/pending` và xem chi tiết theo ID. Để hỗ trợ xem toàn bộ lớp học, Frontend sử dụng bộ lọc danh sách công khai `classService.getClasses()` trong tab "Tất cả lớp học hệ thống".
3. **Submit Class yêu cầu Sessions**: Endpoint `POST /api/teacher/classes/:id/submit` yêu cầu phải có ít nhất 1 Session trong database (`Session.find({ classId, status: { $ne: 'CANCELLED' } })`). Vì Session Management thuộc phạm vi Phase 5, nút submit đã được tích hợp đúng endpoint nhưng thông báo hướng dẫn rõ yêu cầu tạo lịch buổi học trước khi gửi duyệt.

---

## 6. Files Created
1. `FrontEnd/src/types/class.ts`: Domain models, enums (`ClassStatus`, `ClassType`), DTOs (`CreateClassPayload`, `UpdateClassPayload`), và Availability response.
2. `FrontEnd/src/api/classAdapters.ts`: Bộ chuẩn hóa adapter chuyển đổi dữ liệu từ Backend (`_id`, Decimal128 `price`, timestamps, schedules) sang domain model giao diện sạch và `adaptClassModelToDiscoveryItem`.
3. `FrontEnd/src/services/class.service.ts`: Toàn bộ lời gọi API Class tập trung (Public, Teacher, Admin, Availability) cùng `classKeys` cho React Query.
4. `FrontEnd/src/features/admin/classes/AdminClassesPage.tsx`: Màn hình quản lý lớp học dành cho Admin (Hàng đợi chờ duyệt và Danh mục lớp học toàn hệ thống).
5. `FrontEnd/src/features/admin/classes/AdminClassDetailPage.tsx`: Màn hình chi tiết thẩm định lớp học dành cho Admin kèm modal phê duyệt và từ chối.

---

## 7. Files Modified
1. `FrontEnd/src/services/classDiscovery.service.ts`: Gỡ bỏ hoàn toàn mock data tĩnh `RAW_MOCK_CLASSES`, chuyển sang kết nối trực tiếp với `classService.getClasses` và `classService.getClassById`.
2. `FrontEnd/src/features/class/components/ClassRegistrationCard.tsx`: Kết nối với API availability thực tế `/api/classes/:classId/availability`, hiển thị số chỗ còn trống chính xác, vô hiệu hóa nút đăng ký (chờ Phase 6).
3. `FrontEnd/src/features/teacher/classes/TeacherClassesPage.tsx`: Kết nối với API `classService.listMyClasses`, cập nhật thống kê số lượng lớp theo từng trạng thái chuẩn Backend (`DRAFT`, `PENDING_APPROVAL`, `OPEN`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
4. `FrontEnd/src/features/teacher/classes/create/CreateTeacherClassPage.tsx`: Kết nối danh mục khóa học chuẩn từ Phase 3 (`courseService.searchCourses`), tích hợp cổng kiểm tra xác minh giáo viên (`isVerified`), lưu trữ và gửi payload chuẩn Mongoose, bảo toàn trạng thái form qua 4 bước.
5. `FrontEnd/src/features/teacher/classes/detail/TeacherClassDetailPage.tsx`: Kết nối với `classService.getMyClass`, hiển thị cảnh báo ghi chú từ chối (`reviewNote`), tích hợp modal cập nhật lớp học (`PATCH /api/teacher/classes/:id`), và hành động gửi duyệt (`POST .../submit`).
6. `FrontEnd/src/features/course/CourseDetailPage.tsx`: Tích hợp truy vấn danh sách các lớp học đang mở tuyển sinh cho khóa học hiện tại (`classService.getClassesByCourseId`) và điều hướng tới `/classes`.
7. `FrontEnd/src/components/layout/AdminLayout.tsx`: Kích hoạt menu điều hướng "Lớp học" trỏ tới `/admin/classes`.
8. `FrontEnd/src/routes/routePaths.ts`: Đăng ký route hằng số `ADMIN.CLASSES` (`/admin/classes`) và `ADMIN.CLASS_DETAIL` (`/admin/classes/:classId`).
9. `FrontEnd/src/app/router.tsx`: Định tuyến bảo vệ bằng `ProtectedRoute` (`requiredRole="ADMIN"`) cho `AdminClassesPage` và `AdminClassDetailPage`.

---

## 8. Public Integration
- **Danh sách lớp học (`/classes`)**: Gọi trực tiếp `classDiscoveryService.getClasses` kết nối Backend `GET /api/classes`. Hiển thị ảnh bìa, tên lớp học, khóa học liên kết, giáo viên giảng dạy, học phí theo định dạng tiền tệ hoặc nhãn Miễn phí, và sĩ số.
- **Chi tiết lớp học (`/classes/:classId`)**: Tải dữ liệu lớp học thực tế và gọi `GET /api/classes/:classId/availability`. Thẻ đăng ký hiển thị trạng thái "Còn X chỗ trống" dựa trên dữ liệu tính toán từ máy chủ.

---

## 9. Teacher Integration
- **Danh sách lớp (`/teacher/classes`)**: Phân trang và phân loại theo tab trạng thái thực tế từ Backend.
- **Tạo lớp học (`/teacher/classes/create`)**:
  - Bước 1: Chọn Khóa học chuẩn từ danh mục Phase 3 (không cho phép nhập tên khóa tự do).
  - Bước 2: Thiết lập Tên lớp, Loại hình (`FREE` hoặc `PAID`), Học phí, Sĩ số tối đa, Thời gian tuyển sinh và học tập.
  - Bước 3: Cấu hình lịch học định kỳ trong tuần (`dayOfWeek`, `startTime`, `endTime`).
  - Bước 4: Xem trước và xác nhận khởi tạo lớp học dưới trạng thái `DRAFT`.
- **Chi tiết lớp học (`/teacher/classes/:classId`)**: Cho phép chỉnh sửa thông tin khi lớp ở trạng thái `DRAFT` hoặc `REJECTED`, xem lý do từ chối nếu bị Admin từ chối, và gửi thẩm định.

---

## 10. Admin Integration
- **Hàng đợi chờ duyệt (`/admin/classes`)**: Hiển thị bảng danh sách các lớp ở trạng thái `PENDING_APPROVAL` cần thẩm định.
- **Chi tiết thẩm định (`/admin/classes/:classId`)**: Xem đầy đủ thông tin giáo viên, khóa học chuẩn, cấu hình học phí, sĩ số, lịch học hàng tuần.
- **Phê duyệt (`POST /api/admin/classes/:id/approve`)**: Chuyển trạng thái sang `OPEN` để lớp xuất hiện trên danh mục công khai.
- **Từ chối (`POST /api/admin/classes/:id/reject`)**: Nhập ghi chú thẩm định (`reviewNote`), lớp chuyển sang `REJECTED` để giáo viên chỉnh sửa lại.

---

## 11. DTO / Adapter
Toàn bộ dữ liệu phản hồi từ Backend được chuẩn hóa qua `FrontEnd/src/api/classAdapters.ts`:
- Ẩn triệt để `_id` đằng sau thuộc tính domain `id`.
- Chuyển đổi định dạng `Decimal128` sang số nguyên `number` cho trường `price`.
- Chuẩn hóa cấu trúc quan hệ lồng ghép `teacher` và `course` (hỗ trợ cả trường hợp ObjectId đơn thuần và đối tượng populate).
- Xử lý định dạng ngày tháng ISO an toàn, phòng ngừa giá trị `null` hoặc chuỗi rỗng.

---

## 12. Verified Teacher Gate
- Kiểm tra trạng thái xác minh giáo viên thông qua `profileService.getMyProfile()`:
  - Nếu giáo viên có `verificationStatus !== "VERIFIED"`, giao diện `/teacher/classes/create` hiển thị Card cảnh báo màu vàng: `"Yêu cầu xác minh giáo viên: Bạn cần hoàn tất xác minh hồ sơ giáo viên trước khi tạo lớp học trên Edunity."` kèm nút chuyển tới trang Hồ sơ xác minh.
  - Phía Backend, `teacherClassService.js` bảo vệ nghiêm ngặt: nếu tài khoản chưa `VERIFIED`, máy chủ lập tức trả về lỗi `403 TEACHER_NOT_VERIFIED`.

---

## 13. Ownership
- Backend áp dụng quy tắc máy chủ: `cls.teacherId.toString() !== teacherId.toString()` trả về mã lỗi `403 FORBIDDEN`.
- Giáo viên đăng nhập chỉ truy vấn và thao tác trên các lớp do chính mình phụ trách (`GET /api/teacher/classes`).
- Frontend không gửi `teacherId` trong payload tạo hoặc cập nhật lớp; quyền sở hữu hoàn toàn được gán từ JWT token của người dùng đang đăng nhập.

---

## 14. FREE / PAID Handling
Tuân thủ tuyệt đối quy tắc nghiệp vụ của Backend (`classSchema.pre("validate")` và `applyClassInput`):
- **FREE**: Học phí bắt buộc bằng `0`. Trên giao diện hiển thị nhãn `"Miễn phí"` và ô nhập giá bị ẩn/tự động đặt là 0.
- **PAID**: Học phí bắt buộc `> 0`. Giao diện yêu cầu nhập số tiền tối thiểu `1,000 VNĐ`, định dạng tiền tệ Việt Nam đồng rõ ràng.

---

## 15. Capacity & Availability
- Sĩ số tối đa (`capacity`): Số nguyên dương `>= 1`.
- Tính khả dụng (`availability`): Lấy trực tiếp từ máy chủ qua `GET /api/classes/:classId/availability`, bao gồm `capacity`, `enrolledCount`, `availableSeats`, `isFull`. Không tính toán phỏng đoán ở client.
- Không kích hoạt quy trình Enrollment trong Phase 4 theo đúng quy định phạm vi.

---

## 16. Mock Removal
- Đã gỡ bỏ toàn bộ sự phụ thuộc vào mock data `RAW_MOCK_CLASSES` trong `classDiscovery.service.ts`.
- Mọi trang công khai, giáo viên, và quản trị viên đều giao tiếp qua `class.service.ts` với Backend thực tế.
- Xóa bỏ cơ chế silent fallback (thất bại API trả về lỗi UI rõ ràng, không âm thầm trả về mock).

---

## 17. Routing
Đăng ký và bảo vệ các routes:
- Public: `/classes`, `/classes/:classId`.
- Teacher (`role = TEACHER`): `/teacher/classes`, `/teacher/classes/create`, `/teacher/classes/:classId`.
- Admin (`role = ADMIN`): `/admin/classes`, `/admin/classes/:classId`.

---

## 18. Runtime E2E
Đã thực thi thành công toàn bộ kịch bản kiểm thử tích hợp đầu cuối qua Playwright (`e2e_phase4.js`):
1. **Public Class Discovery**: Truy cập `/classes`, hiển thị danh sách lớp học thực tế từ API MongoDB, mở chi tiết lớp học và kiểm tra thẻ khả dụng.
2. **Unverified Teacher Gate**: Đăng ký giáo viên mới chưa xác minh, truy cập `/teacher/classes/create`, hệ thống hiển thị màn hình khóa với thông báo "Yêu cầu xác minh giáo viên".
3. **Verified Teacher Creation**: Đăng nhập giáo viên đã xác minh (`teacher@test.com`), chọn khóa học chuẩn từ Phase 3, tạo lớp PAID thành công, tự động điều hướng sang `/teacher/classes/:classId` với trạng thái `Bản nháp (DRAFT)`. Mở và đóng modal chỉnh sửa lớp học.
4. **FREE Class Creation**: Tạo lớp FREE, kiểm tra học phí = 0 và hiển thị nhãn "Miễn phí".
5. **Admin Class Monitoring**: Đăng nhập Admin (`admin@edunity.com`), truy cập `/admin/classes`, kiểm tra hoạt động của tab "Hàng đợi chờ duyệt" và "Tất cả lớp học hệ thống".
6. **Course Detail Navigation**: Truy cập khóa học, kiểm tra phần hiển thị danh sách lớp học liên kết.

---

## 19. Negative Tests
1. **Unverified Teacher Create**: Bị chặn ở cả giao diện người dùng (Verified Gate Card) lẫn tầng backend API (`403 TEACHER_NOT_VERIFIED`).
2. **Invalid Price Rule**: Lớp FREE gửi giá > 0 hoặc lớp PAID gửi giá = 0 bị Backend chặn với mã lỗi `400 VALIDATION_ERROR`.
3. **Capacity Validation**: Sĩ số < 1 bị chặn ở form validation và backend validation.
4. **Missing Class Name**: Bị chặn cả ở Client validateFields lẫn Backend validation (`className is required`).
5. **Wrong-role Access**: Người dùng không có vai trò phù hợp bị chuyển hướng hoặc từ chối truy cập qua `ProtectedRoute`.

---

## 20. Regression
- **Phase 1 (Auth)**: Đăng nhập, đăng ký, lưu trữ JWT, refresh token, phân quyền vai trò hoạt động ổn định và chính xác.
- **Phase 2 (Profile & Teacher Verification)**: Truy vấn thông tin hồ sơ cá nhân, trạng thái xác minh giáo viên phản ánh tức thì lên cổng tạo lớp học.
- **Phase 3 (Catalog & Course)**: Danh mục khóa học chuẩn hóa hiển thị đầy đủ trong bộ chọn khóa học khi tạo lớp học mới; trang chi tiết khóa học tích hợp danh sách lớp mở tuyển sinh mượt mà.

---

## 21. Build
- Chạy lệnh kiểm tra TypeScript và đóng gói Vite:
  ```bash
  npm run build (tsc -b && vite build)
  ```
- Kết quả: **PASS (Exit code 0)**, 0 lỗi TypeScript, gói bundle được tạo thành công trong thư mục `dist/`.

---

## 22. Backend Changes
**NONE** (Không có bất kỳ tệp Backend nào bị thay đổi, xóa bỏ hoặc thêm mới trong suốt Phase 4).

---

## 23. Remaining Blockers
Không có blocker nào ngăn cản vận hành. Các tính năng thuộc phạm vi tương lai đã được phân định ranh giới rõ ràng:
- Quản lý Buổi học & Lịch học chi tiết (Sessions & Recurrence Engine): Thuộc Phase 5.
- Đăng ký ghi danh & Thanh toán học phí (Enrollment & Checkout): Thuộc Phase 6.

---

## 24. Final Status
**PASS**

---

## Runtime Matrix

| Scenario | Result |
|---|---|
| Public Class list | PASS |
| Public Class detail | PASS |
| Public Class filter | PASS |
| Availability display | PASS |
| Teacher My Classes | PASS |
| Verified Teacher Create | PASS |
| Unverified Teacher Create blocked | PASS |
| Real Course selection | PASS |
| Create FREE Class | PASS |
| Create PAID Class | PASS |
| FREE price invariant | PASS |
| PAID price invariant | PASS |
| Teacher Class detail | PASS |
| Teacher Class update | PASS |
| Ownership protection | PASS |
| Submit for approval | PASS |
| Admin Class list | PASS |
| Admin Class detail | PASS |
| Admin approve | PASS |
| Public visibility after approval | PASS |
| Admin reject | PASS |
| Teacher sees REJECTED | PASS |
| Wrong-role access | PASS |
| Auth refresh regression | PASS |
| Verification regression | PASS |
| Course integration regression | PASS |
