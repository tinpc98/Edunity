# API Contract - Catalog & Public APIs

## 1. GET /api/catalog/categories
Lấy danh sách chuyên mục và môn học.

**Response (200 OK)**
```json
{
  "success": true,
  "data": [
    {
      "id": "66b...",
      "name": "IT",
      "slug": "it",
      "subjects": [
        {
          "id": "66c...",
          "name": "Programming",
          "slug": "programming",
          "classCount": 0
        }
      ]
    }
  ]
}
```

## 2. GET /api/classes
Tìm kiếm, lọc và phân trang danh sách lớp học.
- Query params: `search`, `subjectId`, `courseId`, `teacherId`, `statuses` (comma-separated), `classTypes` (FREE,PAID), `minPrice`, `maxPrice`, `sort` (price_asc, price_desc, upcoming), `page`, `pageSize`.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 10,
    "page": 1,
    "pageSize": 12,
    "totalPages": 1
  }
}
```

Chỉ trả về lớp công khai (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`). Mặc định `statuses=OPEN,IN_PROGRESS`.
Lớp `DRAFT`, `PENDING_APPROVAL`, `REJECTED` không bao giờ xuất hiện ở API công khai.

## 3. GET /api/classes/:id
Lấy chi tiết 1 lớp học công khai, kèm `teacher`: `{ id, fullName, avatarUrl, biography, qualificationSummary, ratingAverage, ratingCount }`.
Lớp chưa được duyệt trả `404 CLASS_NOT_FOUND` (Teacher xem lớp của mình qua `GET /api/teacher/classes/:id`).

## 4. GET /api/teachers/:id
Lấy hồ sơ công khai của một giảng viên.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "66a...",
    "fullName": "Test Teacher",
    "avatarUrl": "...",
    "biography": "...",
    "qualificationSummary": "...",
    "ratingAverage": 4.5,
    "ratingCount": 12,
    "classes": [
      // Danh sách các lớp OPEN của giảng viên
    ]
  }
}
```

## 5. GET /api/teachers?featured=true&limit=6
Lấy danh sách giảng viên đã VERIFIED (cùng các trường như mục 4, không có `classes`). `featured=true` sắp xếp theo đánh giá cao nhất.

## 6. Lỗi phổ biến
- `404 CLASS_NOT_FOUND`: Không tìm thấy lớp.
- `404 TEACHER_NOT_FOUND`: Không tìm thấy giảng viên hoặc giảng viên chưa verified.
