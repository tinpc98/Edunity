# API CONTRACT SPECIFICATION — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Cập nhật Endpoint: Cập nhật trạng thái người dùng

`PATCH /api/admin/users/:id/status`

### Quyền truy cập
- **Roles:** `ADMIN` duy nhất (Bảo vệ qua `authMiddleware` + `requireRole("ADMIN")`).

### Request Headers
- `Authorization: Bearer <ADMIN_JWT_ACCESS_TOKEN>`
- `Content-Type: application/json`

### Request Body
```json
{
  "status": "SUSPENDED", // "ACTIVE" | "SUSPENDED" | "BANNED"
  "reason": "Vi phạm quy chế giảng dạy: hủy lớp không báo trước 3 lần liên tiếp" // Bắt buộc khi SUSPENDED hoặc BANNED, tối đa 500 ký tự. Bỏ qua khi ACTIVE.
}
```

### Response
#### Thành công: HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "id": "673f1234567890abcdef1234",
    "email": "teacher.smith@edunity.vn",
    "role": "TEACHER",
    "status": "SUSPENDED",
    "statusReason": "Vi phạm quy chế giảng dạy: hủy lớp không báo trước 3 lần liên tiếp",
    "statusChangedAt": "2026-11-21T10:30:00.000Z",
    "statusChangedBy": {
      "id": "673f9876543210fedcba4321",
      "email": "admin@edunity.vn",
      "fullName": "System Administrator"
    },
    "fullName": "John Smith",
    "verificationStatus": "VERIFIED",
    "createdAt": "2026-09-01T08:00:00.000Z",
    "updatedAt": "2026-11-21T10:30:00.000Z"
  }
}
```

#### Các lỗi nghiệp vụ
- **HTTP 400 VALIDATION_ERROR:**
  - Thiếu `reason` hoặc `reason` chỉ chứa khoảng trắng khi chuyển sang `SUSPENDED` hoặc `BANNED`.
  - `reason` dài quá 500 ký tự.
  - Trạng thái `status` không nằm trong enum cho phép.
  - Admin cố tình tự thay đổi trạng thái của chính mình: `"You cannot change the status of your own account"`.
- **HTTP 403 FORBIDDEN:**
  - Token không mang role `ADMIN`.
  - Cố tình khóa hoặc tạm ngưng tài khoản `ADMIN` khác: `"Admin accounts cannot be suspended or banned here"`.
- **HTTP 404 USER_NOT_FOUND:**
  - `id` không phải ObjectId hợp lệ hoặc không tìm thấy người dùng.
- **HTTP 409 CONCURRENT_UPDATE_CONFLICT:**
  - Phát hiện race condition khi 2 Admin cùng cập nhật trạng thái User đồng thời.

---

## 2. Cập nhật Endpoint: Chi tiết người dùng

`GET /api/admin/users/:id`

### Quyền truy cập
- **Roles:** `ADMIN` duy nhất.

### Response
#### Thành công: HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "id": "673f1234567890abcdef1234",
    "email": "teacher.smith@edunity.vn",
    "role": "TEACHER",
    "status": "SUSPENDED",
    "statusReason": "Vi phạm quy chế giảng dạy: hủy lớp không báo trước 3 lần liên tiếp",
    "statusChangedAt": "2026-11-21T10:30:00.000Z",
    "statusChangedBy": {
      "id": "673f9876543210fedcba4321",
      "email": "admin@edunity.vn",
      "fullName": "System Administrator"
    },
    "fullName": "John Smith",
    "verificationStatus": "VERIFIED",
    "profile": {
      "fullName": "John Smith",
      "verificationStatus": "VERIFIED"
    },
    "activity": {
      "classes": 3,
      "students": 45,
      "reportsAgainst": 1
    },
    "createdAt": "2026-09-01T08:00:00.000Z",
    "updatedAt": "2026-11-21T10:30:00.000Z"
  }
}
```
*Lưu ý bảo mật:* Không chứa `passwordHash`, `tokenVersion`, số thẻ ngân hàng thô, hay số CCCD thô.

---

## 3. Endpoint mới: Lịch sử thay đổi trạng thái

`GET /api/admin/users/:id/status-history`

### Quyền truy cập
- **Roles:** `ADMIN` duy nhất.

### Query Parameters
- `page`: Số trang (mặc định: `1`, tối thiểu: `1`).
- `pageSize` hoặc `limit`: Số bản ghi mỗi trang (mặc định: `20`, tối đa: `100`).

### Response
#### Thành công: HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "673faaaa567890abcdef9999",
        "action": "USER_SUSPENDED",
        "fromStatus": "ACTIVE",
        "toStatus": "SUSPENDED",
        "reason": "Tạm ngưng do phát sinh khiếu nại tài chính",
        "performedBy": {
          "id": "673f9876543210fedcba4321",
          "email": "admin@edunity.vn",
          "fullName": "System Administrator"
        },
        "performedAt": "2026-11-21T10:30:00.000Z"
      },
      {
        "id": "673fbbbb567890abcdef8888",
        "action": "USER_ACTIVE",
        "fromStatus": "BANNED",
        "toStatus": "ACTIVE",
        "reason": null,
        "performedBy": {
          "id": "673f9876543210fedcba4321",
          "email": "admin@edunity.vn",
          "fullName": "System Administrator"
        },
        "performedAt": "2026-10-15T09:00:00.000Z"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### Xử lý lỗi
- **HTTP 401 UNAUTHORIZED:** Không có token hoặc token không hợp lệ.
- **HTTP 403 FORBIDDEN:** Role không phải là `ADMIN`.
- **HTTP 404 USER_NOT_FOUND:** `id` không phải ObjectId hợp lệ hoặc user không tồn tại trong hệ thống.
