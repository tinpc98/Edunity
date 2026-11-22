# 05_API_CONTRACT.md — Hợp Đồng Giao Tiếp API (API Contract)

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. DANH SÁCH ENDPOINT QUẢN TRỊ ĐÀO TẠO

Dưới đây là các API contracts thực tế đang được Frontend kết nối trực tiếp vào Backend:

### 1.1. Khóa Học Chuẩn (Admin Courses)

#### A. Danh sách khóa học (Hỗ trợ ACTIVE / INACTIVE)
- **Phương thức & URL:** `GET /api/admin/courses`
- **Quyền:** `ADMIN`
- **Query Parameters:**
  - `page`: Số trang (mặc định 1)
  - `pageSize`: Kích thước trang (mặc định 10 hoặc 20)
  - `search`: Từ khóa tìm kiếm (title, slug, description, curriculumReference)
  - `status`: Trạng thái cần lọc (`ACTIVE`, `INACTIVE` hoặc bỏ trống để lấy tất cả)
  - `categoryId`: Lọc theo danh mục
  - `subjectId`: Lọc theo môn học
  - `gradeLevel`: Lọc theo khối lớp (`PRE_PRIMARY`, `GRADE_1` .. `GRADE_12`, `UNIVERSITY`)
  - `level`: Lọc theo cấp độ (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`)
- **Phản hồi mẫu (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "673f8a9e0123456789abcdef",
        "title": "Toán 10 Nâng Cao - Ôn Thi THPT Quốc Gia",
        "slug": "toan-10-nang-cao-on-thi-thpt-quoc-gia",
        "categoryId": "673f8a000000000000000001",
        "categoryName": "Khoa học Tự nhiên",
        "subjectId": "673f8a000000000000000002",
        "subjectName": "Toán học",
        "gradeLevel": "GRADE_10",
        "level": "ADVANCED",
        "curriculumReference": "Cánh Diều",
        "status": "ACTIVE",
        "createdAt": "2026-11-20T08:00:00.000Z",
        "updatedAt": "2026-11-20T08:00:00.000Z"
      },
      {
        "_id": "673f8a9e0123456789abcdeg",
        "title": "Vật Lý 11 Cơ Bản (Tạm ngưng thí điểm)",
        "slug": "vat-ly-11-co-ban-tam-ngung",
        "categoryId": "673f8a000000000000000001",
        "categoryName": "Khoa học Tự nhiên",
        "subjectId": "673f8a000000000000000003",
        "subjectName": "Vật lý",
        "gradeLevel": "GRADE_11",
        "level": "BEGINNER",
        "status": "INACTIVE",
        "createdAt": "2026-11-18T10:00:00.000Z",
        "updatedAt": "2026-11-19T14:30:00.000Z"
      }
    ],
    "total": 24,
    "page": 1,
    "pageSize": 10,
    "totalPages": 3
  }
}
```

#### B. Chi tiết khóa học (Cả ACTIVE và INACTIVE)
- **Phương thức & URL:** `GET /api/admin/courses/:id`
- **Quyền:** `ADMIN`
- **Phản hồi mẫu (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "673f8a9e0123456789abcdeg",
    "title": "Vật Lý 11 Cơ Bản (Tạm ngưng thí điểm)",
    "slug": "vat-ly-11-co-ban-tam-ngung",
    "categoryId": "673f8a000000000000000001",
    "categoryName": "Khoa học Tự nhiên",
    "subjectId": "673f8a000000000000000003",
    "subjectName": "Vật lý",
    "gradeLevel": "GRADE_11",
    "level": "BEGINNER",
    "status": "INACTIVE",
    "openClassCount": 0,
    "totalClassCount": 2,
    "createdAt": "2026-11-18T10:00:00.000Z",
    "updatedAt": "2026-11-19T14:30:00.000Z"
  }
}
```

#### C. Tạo mới khóa học
- **Phương thức & URL:** `POST /api/admin/courses`
- **Body:**
```json
{
  "subjectId": "673f8a000000000000000002",
  "title": "Hóa học 10 Chuyên Sâu",
  "gradeLevel": "GRADE_10",
  "level": "ADVANCED",
  "curriculumReference": "Kết Nối Tri Thức",
  "description": "Luyện đề và thí nghiệm hóa học chuyên sâu..."
}
```

#### D. Cập nhật khóa học & Chuyển đổi trạng thái (ACTIVE <-> INACTIVE)
- **Phương thức & URL:** `PATCH /api/admin/courses/:id`
- **Body:**
```json
{
  "status": "INACTIVE"
}
```

#### E. Chuyển vào Thùng rác (Soft Delete)
- **Phương thức & URL:** `DELETE /api/admin/courses/:id`
- **Body:**
```json
{
  "reason": "Khóa học thử nghiệm đã kết thúc chương trình."
}
```

---

### 1.2. Danh Mục & Môn Học (Categories & Subjects)

- `GET /api/categories`: Lấy danh mục đào tạo hoạt động
- `POST /api/admin/categories`: Tạo danh mục mới
- `PATCH /api/admin/categories/:id`: Cập nhật danh mục
- `DELETE /api/admin/categories/:id`: Xóa mềm danh mục (kiểm tra ràng buộc không có môn học con)
- `GET /api/categories/:id/subjects`: Lấy danh sách môn học thuộc danh mục
- `GET /api/subjects/:id`: Lấy chi tiết môn học kèm danh sách khóa học trực thuộc
- `POST /api/admin/subjects`: Tạo môn học mới
- `PATCH /api/admin/subjects/:id`: Cập nhật môn học
- `DELETE /api/admin/subjects/:id`: Xóa mềm môn học (kiểm tra ràng buộc không có khóa học con)

---

### 1.3. Quản Lý Giáo Trình & Phiên Bản (Syllabus Versions)

- `GET /api/admin/courses/:id/syllabus-versions`: Lấy danh sách các phiên bản giáo trình của khóa học
- `POST /api/admin/courses/:id/syllabus-versions`: Tạo bản nháp mới (hỗ trợ `cloneFromVersionId`)
- `GET /api/admin/courses/:id/syllabus-versions/:versionId`: Xem nội dung phiên bản và các bài học (units)
- `POST /api/admin/courses/:id/syllabus-versions/:versionId/publish`: Công bố phiên bản (chuyển sang `PUBLISHED`, lưu trữ phiên bản trước)
- `POST /api/admin/courses/:id/syllabus-versions/:versionId/archive`: Lưu trữ phiên bản
- `POST /api/admin/courses/:id/syllabus-versions/:versionId/units`: Thêm bài học mới vào phiên bản
- `PUT /api/admin/courses/:id/syllabus-versions/:versionId/units/reorder`: Đổi thứ tự các bài học
