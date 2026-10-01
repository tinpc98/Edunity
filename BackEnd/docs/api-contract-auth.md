# API Contract - Auth (DEV)

*LƯU Ý: `POST /api/auth/dev-login` và token `dev-<userId>` chỉ dành cho DEV/TEST (production trả 404 / 401).
Đăng nhập thật dùng JWT: `POST /api/auth/login`, `/auth/refresh`, `/auth/logout` — xem `api-contract-platform.md` mục 1.
`/auth/register` và `/auth/me` dùng chung cho cả hai.*

## 1. POST /api/auth/register
Đăng ký tài khoản học viên mới.

**Request Body**
```json
{
  "fullName": "Test Student",
  "email": "test@student.com",
  "password": "password",
  "role": "STUDENT"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "userId": "66a...",
    "status": "ACTIVE",
    "email": "test@student.com",
    "fullName": "Test Student",
    "role": "STUDENT"
  }
}
```

**Lỗi phổ biến:**
- `400 VALIDATION_ERROR`: Thiếu trường bắt buộc hoặc password quá ngắn (<6).
- `409 DUPLICATE_EMAIL`: Email đã tồn tại.

## 2. POST /api/auth/dev-login
Đăng nhập để nhận dev token.

**Request Body**
```json
{
  "email": "test@student.com",
  "password": "password"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "accessToken": "dev-66a...",
    "user": {
      "userId": "66a...",
      "fullName": "Test Student",
      "email": "test@student.com",
      "role": "STUDENT",
      "avatarUrl": "..."
    }
  }
}
```

## 3. GET /api/auth/me
Lấy thông tin profile hiện tại dựa vào token. (Gửi token qua header `Authorization: Bearer dev-...`)

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "userId": "66a...",
    "fullName": "Test Student",
    "email": "test@student.com",
    "role": "STUDENT",
    "avatarUrl": "..."
  }
}
```
