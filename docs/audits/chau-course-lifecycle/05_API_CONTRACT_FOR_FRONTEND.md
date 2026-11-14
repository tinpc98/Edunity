# BÁO CÁO 05: HỢP ĐỒNG API CHO FRONTEND (API CONTRACT SPECIFICATION FOR BĂNG)

- **Dự án:** Edunity V3
- **Chế độ:** API CONTRACT & FRONTEND INTEGRATION GUIDE
- **Người lập:** Châu (Senior Backend Engineer)
- **Người tiếp nhận:** Băng (Lead Frontend Engineer)
- **Thời gian lập:** 13/11/2026

---

## 1. TỔNG HỢP CÁC ENDPOINT MỚI VÀ ĐIỀU CHỈNH

| STT | Phương Thức | Đường Dẫn API | Vai Trò Cho Phép | Mục Đích |
|---|---|---|---|---|
| 1 | `GET` | `/api/admin/courses` | `ADMIN` | Danh sách khóa học có lọc status, tìm kiếm, phân trang |
| 2 | `GET` | `/api/admin/courses/:id` | `ADMIN` | Chi tiết khóa học (kể cả `INACTIVE`), kèm số lượng lớp |
| 3 | `PATCH` | `/api/admin/courses/:id` | `ADMIN` | Cập nhật thông tin hoặc kích hoạt lại khóa học sang `ACTIVE` |
| 4 | `DELETE`| `/api/admin/courses/:id` | `ADMIN` | Xóa mềm an toàn khóa học (từ chối 409 nếu có dependency) |
| 5 | `GET` | `/api/classes/:id/syllabus` | Public / Enrolled / Teacher / Admin | Đọc giáo trình đúng phiên bản snapshot của lớp học |

---

## 2. CHI TIẾT CONTRACT TỪNG ENDPOINT

### 2.1. API 1: `GET /api/admin/courses` (Admin Course List)
- **Headers:** `Authorization: Bearer <Admin_Access_Token>`
- **Query Parameters:**
  - `status` (string, optional): `"ALL"`, `"ACTIVE"`, `"INACTIVE"`. Mặc định trả về tất cả.
  - `search` (string, optional): Tìm kiếm theo tên khóa, mã slug, mô tả, hoặc sách tham chiếu.
  - `categoryId` (ObjectId, optional): Lọc theo danh mục.
  - `subjectId` (ObjectId, optional): Lọc theo môn học.
  - `gradeLevel` (string, optional): Khối lớp (ví dụ: `"GRADE_10"`, `"GRADE_12"`).
  - `level` (string, optional): `"BEGINNER"`, `"INTERMEDIATE"`, `"ADVANCED"`.
  - `sortBy` (string, optional): `"title"`, `"createdAt"`, `"updatedAt"`, `"status"`. Mặc định `"createdAt"`.
  - `sortOrder` (string, optional): `"asc"` hoặc `"desc"`. Mặc định `"desc"`.
  - `page` (number, optional): Mặc định `1`.
  - `pageSize` (number, optional): Mặc định `20`.
- **Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "6734a1b2c3d4e5f600000001",
        "title": "Toán 10 Nâng Cao",
        "slug": "toan-10-nang-cao",
        "subjectId": "6734a1b2c3d4e5f600000002",
        "subjectName": "Toán học",
        "categoryId": "6734a1b2c3d4e5f600000003",
        "categoryName": "Trung học phổ thông",
        "level": "ADVANCED",
        "gradeLevel": "GRADE_10",
        "curriculumReference": "Kết Nối Tri Thức",
        "status": "ACTIVE",
        "createdAt": "2026-11-13T10:00:00.000Z",
        "updatedAt": "2026-11-13T10:00:00.000Z"
      },
      {
        "_id": "6734a1b2c3d4e5f600000004",
        "title": "Vật Lý 11 Cơ Bản (Tạm ngưng)",
        "slug": "vat-ly-11-co-ban",
        "subjectId": "6734a1b2c3d4e5f600000005",
        "subjectName": "Vật lý",
        "categoryId": "6734a1b2c3d4e5f600000003",
        "categoryName": "Trung học phổ thông",
        "level": "BEGINNER",
        "gradeLevel": "GRADE_11",
        "curriculumReference": "Cánh Diều",
        "status": "INACTIVE",
        "createdAt": "2026-11-10T08:30:00.000Z",
        "updatedAt": "2026-11-12T14:20:00.000Z"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 2.2. API 2: `GET /api/admin/courses/:id` (Admin Course Detail)
- **Headers:** `Authorization: Bearer <Admin_Access_Token>`
- **Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "6734a1b2c3d4e5f600000004",
    "title": "Vật Lý 11 Cơ Bản (Tạm ngưng)",
    "slug": "vat-ly-11-co-ban",
    "subjectId": "6734a1b2c3d4e5f600000005",
    "subjectName": "Vật lý",
    "categoryId": "6734a1b2c3d4e5f600000003",
    "categoryName": "Trung học phổ thông",
    "level": "BEGINNER",
    "gradeLevel": "GRADE_11",
    "curriculumReference": "Cánh Diều",
    "status": "INACTIVE",
    "learningObjectives": "Nắm vững kiến thức điện tích, điện trường...",
    "prerequisites": "Đã học xong Vật Lý 10",
    "publishedSyllabusVersionId": "6734a1b2c3d4e5f600000006",
    "openClassCount": 0,
    "totalClassCount": 2,
    "createdAt": "2026-11-10T08:30:00.000Z",
    "updatedAt": "2026-11-12T14:20:00.000Z"
  }
}
```

---

### 2.3. API 3: `PATCH /api/admin/courses/:id` (Update / Reactivate Course)
- **Headers:** `Authorization: Bearer <Admin_Access_Token>`
- **Request Body (JSON):**
```json
{
  "status": "ACTIVE",
  "title": "Vật Lý 11 Cơ Bản"
}
```
- **Response Success (200 OK):** Trả về đối tượng Course đã cập nhật.
- **Lỗi từ chối kích hoạt nếu Môn học cha bị vô hiệu hóa (400 Bad Request):**
```json
{
  "success": false,
  "error": "SUBJECT_INACTIVE",
  "message": "[SUBJECT_INACTIVE] Cannot activate course under an inactive subject"
}
```

---

### 2.4. API 4: `DELETE /api/admin/courses/:id` (Safe Soft Delete)
- **Headers:** `Authorization: Bearer <Admin_Access_Token>`
- **Response Khi Xóa Thành Công (200 OK):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Course soft-deleted successfully",
    "courseId": "6734a1b2c3d4e5f600000007"
  }
}
```
- **Response Khi Từ Chối Xóa do có Lớp học (409 Conflict):**
```json
{
  "success": false,
  "error": "COURSE_HAS_CLASSES",
  "message": "[COURSE_HAS_CLASSES] Cannot delete course: 3 class(es) exist. Deactivate the course by setting status to INACTIVE instead.",
  "details": {
    "classCount": 3,
    "recommendedAction": "SET_INACTIVE"
  }
}
```
> **Hướng dẫn UI cho Băng:** Khi nhận được lỗi `409` kèm `recommendedAction: "SET_INACTIVE"`, modal trên Frontend nên hiển thị thông báo: *"Khóa học này đang có lớp học tham chiếu, không thể xóa. Bạn có muốn chuyển trạng thái khóa học sang Tạm Dừng (INACTIVE) không?"* kèm nút bấm kích hoạt nhanh `PATCH /api/admin/courses/:id` `{ status: "INACTIVE" }`.

---

### 2.5. API 5: `GET /api/classes/:id/syllabus` (Class Syllabus Snapshot)
- **Headers:** Không bắt buộc đối với lớp công khai (`OPEN`, `IN_PROGRESS`, `COMPLETED`). Bắt buộc `Authorization: Bearer <Token>` nếu lớp đang ở `DRAFT`.
- **Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "classId": "6734a1b2c3d4e5f600000008",
    "className": "Lớp Toán 10 Thầy An - Nhóm A",
    "courseId": "6734a1b2c3d4e5f600000001",
    "courseTitle": "Toán 10 Nâng Cao",
    "syllabusVersionId": "6734a1b2c3d4e5f600000009",
    "versionNumber": 1,
    "title": "Giáo trình Toán 10 Chuyên Đề (Bản v1.0)",
    "summary": "Phiên bản được chốt tại thời điểm mở lớp",
    "status": "PUBLISHED",
    "publishedAt": "2026-09-01T00:00:00.000Z",
    "units": [
      {
        "_id": "6734a1b2c3d4e5f600000010",
        "unitOrder": 1,
        "title": "Chuyên đề 1: Mệnh đề và tập hợp",
        "description": "Các phép toán trên tập hợp con, số thực...",
        "learningObjectives": "Hiểu rõ giao, hợp, hiệu của hai tập hợp",
        "durationMinutes": 90,
        "topics": ["Mệnh đề", "Tập con", "Khoảng, đoạn"]
      },
      {
        "_id": "6734a1b2c3d4e5f600000011",
        "unitOrder": 2,
        "title": "Chuyên đề 2: Bất phương trình bậc nhất hai ẩn",
        "description": "Biểu diễn miền nghiệm trên mặt phẳng tọa độ",
        "learningObjectives": "Giải được bài toán quy hoạch tuyến tính cơ bản",
        "durationMinutes": 90,
        "topics": ["Nửa mặt phẳng", "Hệ bất phương trình"]
      }
    ]
  }
}
```
- **Response Lỗi khi Lớp cũ thiếu Snapshot (404 Not Found):**
```json
{
  "success": false,
  "error": "CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND",
  "message": "[CLASS_SYLLABUS_SNAPSHOT_NOT_FOUND] Class does not have a linked syllabus version snapshot"
}
```

