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

## 3. GET /api/classes/:id
Lấy chi tiết 1 lớp học. (bao gồm thông tin giảng viên)

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
    "classes": [
      // Danh sách các lớp OPEN của giảng viên
    ]
  }
}
```

## 5. GET /api/teachers?featured=true&limit=6
Lấy danh sách giảng viên tiêu biểu.

## 6. Lỗi phổ biến
- `404 CLASS_NOT_FOUND`: Không tìm thấy lớp.
- `404 TEACHER_NOT_FOUND`: Không tìm thấy giảng viên hoặc giảng viên chưa verified.
