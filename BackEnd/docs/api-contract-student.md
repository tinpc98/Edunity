# API Contract - Student APIs

## 1. GET /api/me/enrollments
Lấy danh sách các lớp học đã đăng ký của Student.
- Query params: `include=class` (trả về thêm object `class` và `nextSession`), `page`, `limit`.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "66abc...",
        "classId": "66e000...",
        "enrollmentStatus": "CONFIRMED",
        "tuitionAmount": "200000",
        "class": {
          "id": "66e000...",
          "className": "Paid NodeJS Class",
          "courseTitle": "NodeJS Mastery",
          "teacherName": "Test Teacher",
          "subjectName": "Programming",
          "coverImage": "url",
          "startDate": "...",
          "endDate": "...",
          "status": "OPEN"
        },
        "nextSession": {
          "id": "66abc...",
          "title": "Session 1",
          "startDatetime": "...",
          "endDatetime": "...",
          "status": "SCHEDULED"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

## 2. GET /api/me/sessions
Lấy danh sách các buổi học (Session) thuộc các lớp mà Student đã đăng ký thành công (CONFIRMED).
- Query params: `from` (mặc định hôm nay), `to` (mặc định 14 ngày sau).

**Response (200 OK)**
```json
{
  "success": true,
  "data": [
    {
      "id": "66def...",
      "classId": "66e000...",
      "title": "Session 1",
      "startDatetime": "2024-10-01T08:00:00.000Z",
      "endDatetime": "2024-10-01T10:00:00.000Z",
      "canJoin": true
    }
  ]
}
```
*(canJoin = true nếu hiện tại nằm trong khoảng từ 15 phút trước giờ bắt đầu đến lúc kết thúc).*

## 3. GET /api/sessions/:id/join
Lấy thông tin vào lớp. Chỉ lấy được khi `canJoin = true` và `enrollmentStatus = CONFIRMED`.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "sessionId": "66def...",
    "roomId": "room-66def...",
    "joinUrl": "https://meet.edunity.com/room-66def...",
    "expiresAt": "2024-10-01T10:00:00.000Z"
  }
}
```
**Lỗi phổ biến:**
- `403 NOT_ENROLLED`: Chưa đăng ký hoặc chưa thanh toán xong.
- `409 SESSION_NOT_JOINABLE`: Ngoài khung giờ cho phép vào lớp.

## 4. GET /api/me/payments
Lấy lịch sử giao dịch (Payment) của Student.

**Response (200 OK)**
```json
{
  "success": true,
  "data": [
    {
      "id": "66ghi...",
      "gatewayReference": "SBX-12345",
      "amount": "200000",
      "paymentStatus": "COMPLETED",
      "paidAt": "...",
      "className": "Paid NodeJS Class",
      "enrollmentStatus": "CONFIRMED"
    }
  ]
}
```
