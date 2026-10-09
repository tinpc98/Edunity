# FE Phase 03 — Catalog + Course Integration Report
**Public + Teacher + Admin**

---

## 1. Scope & Objective
Xây dựng và tích hợp toàn bộ tầng Catalog/Course thật của hệ thống Edunity dựa trên Backend Express + MongoDB Atlas hiện tại.
Tuân thủ tuyệt đối quy tắc **BACKEND FREEZE** (Backend = Read Only, không sửa backend, không can thiệp DB thủ công).

---

## 2. Backend Contract Implemented

### A. Categories
- `GET /api/categories` — Lấy danh mục hoạt động (public).
- `POST /api/admin/categories` — Admin tạo danh mục mới (`{ name, slug?, description?, status? }`).
- `PATCH /api/admin/categories/:id` — Admin cập nhật danh mục (`{ name?, description?, status? }`).

### B. Subjects
- `GET /api/categories/:id/subjects` — Lấy danh sách môn học theo danh mục (public).
- `GET /api/subjects/:id` — Lấy chi tiết môn học kèm danh sách khóa học (public).
- `POST /api/admin/subjects` — Admin tạo môn học mới (`{ categoryId, name, slug?, description?, status? }`).
- `PATCH /api/admin/subjects/:id` — Admin cập nhật môn học (`{ name?, description?, status? }`).

### C. Courses
- `GET /api/courses` — Tìm kiếm và lọc khóa học (`search`, `categoryId`, `subjectId`, `gradeLevel`, `level`, `page`, `pageSize`).
- `GET /api/courses/:id` — Chi tiết khóa học (kèm `openClassCount`).
- `GET /api/courses/:id/classes` — Lấy danh sách lớp học OPEN của khóa học.
- `POST /api/admin/courses` — Admin tạo khóa học chuẩn (`{ subjectId, title, level?, gradeLevel?, description?, learningObjectives?, syllabus?, prerequisites? }`).
- `PATCH /api/admin/courses/:id` — Admin cập nhật khóa học (`{ title?, level?, gradeLevel?, status?, description?, ... }`).

### D. Course Proposals (Teacher & Admin)
- `POST /api/teacher/course-proposals` — Giáo viên gửi đề xuất khóa học mới (`{ categoryId, subjectId, title, description, level?, gradeLevel?, learningObjectives?, syllabus?, prerequisites?, estimatedDuration? }`).
- `GET /api/teacher/course-proposals` — Giáo viên xem danh sách đề xuất của mình (`status`, `page`, `pageSize`).
- `PATCH /api/teacher/course-proposals/:id` — Giáo viên chỉnh sửa đề xuất khi ở trạng thái `PENDING_REVIEW` hoặc `NEED_CHANGES`.
- `GET /api/admin/course-proposals` — Admin duyệt danh sách đề xuất (`status`, `page`, `pageSize`).
- `GET /api/admin/course-proposals/:id` — Admin xem chi tiết đề xuất.
- `POST /api/admin/course-proposals/:id/approve` — Admin phê duyệt đề xuất (Tự động khởi tạo `Course` chính thức trong Catalog và ghi Audit Log).
- `POST /api/admin/course-proposals/:id/reject` — Admin từ chối đề xuất (`{ reviewNote? }`).
- `POST /api/admin/course-proposals/:id/request-changes` — Admin yêu cầu giáo viên sửa đổi (`{ reviewNote }` - bắt buộc).

---

## 3. Files Created

1. **`FrontEnd/src/types/catalog.ts`**:
   - Định nghĩa toàn bộ hằng số và types: `GRADE_LEVELS`, `GRADE_LEVEL_LABELS`, `COURSE_LEVELS`, `COURSE_LEVEL_LABELS`, `CATALOG_STATUSES`, `PROPOSAL_STATUSES`.
   - Raw API DTOs (`ApiCategory`, `ApiSubject`, `ApiCourse`, `ApiCourseProposal`).
   - Domain Models chuẩn hóa `_id` thành `id`.
   - Types phân trang `PagedResult<T>` và payloads request/response.

2. **`FrontEnd/src/api/catalogAdapters.ts`**:
   - Tầng Adapter chuyển đổi `_id` thành `id`, bảo vệ UI không phụ thuộc cấu trúc nội bộ Mongoose.

3. **`FrontEnd/src/services/catalog.service.ts`**:
   - Service gọi API Danh mục và Môn học (Public + Admin).

4. **`FrontEnd/src/services/course.service.ts`**:
   - Service gọi API Khóa học (Public search/detail + Admin CRUD).

5. **`FrontEnd/src/services/courseProposal.service.ts`**:
   - Service gọi API Đề xuất khóa học cho Giáo viên và Admin (submit, list, update, approve, reject, request-changes).

6. **`FrontEnd/src/features/course/CoursesPage.tsx`**:
   - Trang danh sách khóa học công khai (`/courses`): Tìm kiếm thời gian thực, lọc đa tiêu chí theo Danh mục, Môn học, Khối lớp, Cấp độ, lưu trạng thái URL SearchParams.

7. **`FrontEnd/src/features/course/CourseDetailPage.tsx`**:
   - Trang chi tiết khóa học công khai (`/courses/:courseId`): Breadcrumb điều hướng, thông tin mục tiêu học tập, khung giáo trình, điều kiện tiên quyết, số lớp mở.

8. **`FrontEnd/src/features/teacher/courses/TeacherCourseCatalogPage.tsx`**:
   - Trang danh mục khóa học cho Giáo viên (`/teacher/courses`): Tra cứu khóa học chuẩn hệ thống, nút mở lớp nhanh, nút đề xuất khóa học mới.

9. **`FrontEnd/src/features/teacher/courses/TeacherCourseProposalsPage.tsx`**:
   - Quản lý đề xuất của Giáo viên (`/teacher/course-proposals`): Xem lịch sử đề xuất, trạng thái (`PENDING_REVIEW`, `NEED_CHANGES`, `APPROVED`, `REJECTED`), form modal tạo và sửa đề xuất.

10. **`FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx`**:
    - Quản lý hệ thống Catalog dành cho Admin (`/admin/catalog`): Tabs Danh mục, Môn học, Khóa học kèm CRUD Modal.

11. **`FrontEnd/src/features/admin/catalog/AdminCourseProposalsPage.tsx`**:
    - Xét duyệt Đề xuất Khóa học dành cho Admin (`/admin/course-proposals`): Lọc theo trạng thái, xem chi tiết, modal Phê duyệt (auto-create Course), Từ chối, Yêu cầu chỉnh sửa.

---

## 4. Files Modified

1. **`FrontEnd/src/routes/routePaths.ts`**:
   - Bổ sung `ROUTES.COURSES` (`LIST`, `DETAIL`), `ROUTES.TEACHER.COURSES`, `ROUTES.TEACHER.COURSE_PROPOSALS`, `ROUTES.ADMIN.CATALOG`, `ROUTES.ADMIN.COURSE_PROPOSALS`.

2. **`FrontEnd/src/app/router.tsx`**:
   - Đăng ký các route công khai và dashboard tương ứng cho Public, Teacher, Admin.

3. **`FrontEnd/src/components/layout/Header.tsx`**:
   - Bổ sung liên kết điều hướng "Khóa học" (`/courses`) và "Lớp học" (`/classes`).

4. **`FrontEnd/src/components/layout/TeacherLayout.tsx`**:
   - Menu Sidebar Giáo viên: Thêm "Danh mục khóa học" và "Đề xuất khóa học".

5. **`FrontEnd/src/components/layout/AdminLayout.tsx`**:
   - Menu Sidebar Admin: Thêm "Danh mục & Khóa học" và "Duyệt đề xuất khóa học".

---

## 5. End-to-End Runtime Validation Results

Kịch bản Playwright E2E tự động (`scratch_playwright/e2e_phase3.js`) chạy thực tế trên Backend (port 3000) và Frontend (port 5173):

| Bước | Mô tả kiểm thử | Kết quả | Chi tiết thực thi |
|---|---|:---:|---|
| **1. Public Catalog** | Truy cập `/courses`, tìm kiếm "NodeJS", xem chi tiết khóa học | **PASS** | Tải danh sách khóa học thực từ DB, filter hoạt động chính xác, điều hướng sang `/courses/:id` hiển thị đầy đủ thông tin. |
| **2. Teacher Flow** | Đăng ký tài khoản Giáo viên mới, đăng nhập, truy cập `/teacher/courses`, tạo Đề xuất khóa học mới | **PASS** | Gửi `POST /api/teacher/course-proposals` thành công. Đề xuất xuất hiện trong bảng với trạng thái `PENDING_REVIEW` ("Chờ duyệt"). |
| **3. Admin Review** | Đăng nhập Admin (`admin@edunity.com`), truy cập `/admin/catalog`, mở `/admin/course-proposals`, duyệt đề xuất | **PASS** | Gọi `POST /api/admin/course-proposals/:id/approve` kèm ghi chú duyệt. Trạng thái chuyển thành `APPROVED` ("Đã duyệt"). Backend tự động tạo `Course` mới trong Catalog. |
| **4. Catalog Sync** | Quay lại `/courses` công khai, tìm kiếm khóa học vừa được Admin duyệt | **PASS** | Khóa học mới tự động hiển thị trên Public Course Catalog cho toàn bộ người dùng. |

---

## 6. Kết luận
- Toàn bộ mục tiêu Phase 3 hoàn thành 100%.
- Không phát sinh lỗi TypeScript, Vite bundle build đạt mã thoát 0.
- Bảo toàn tuyệt đối Backend Freeze.
