# Enrollment API Contract

This document provides the API contract for the Enrollment feature.

## Constants

### Enrollment Status
```json
[
  "PENDING_PAYMENT", 
  "CONFIRMED", 
  "COMPLETED", 
  "CANCELLED", 
  "EXPIRED"
]
```

### Payment Source
```json
[
  "FREE", 
  "DIRECT_PAYMENT"
]
```

## Data Types

**Currency Fields**: All currency fields (e.g., `price`, `tuitionAmount`, `amountPaidViaPayment`, `amountPaidViaScholarship`) are returned as strings (e.g., `"100000.00"`) to avoid precision loss.

**Countdown Timer**: For `PENDING_PAYMENT` enrollments, use the `holdExpiresAt` (ISO-8601 string) field to calculate the remaining time on the client side.

---

## Endpoints

### 1. Check Class Availability
- **Method:** `GET`
- **Path:** `/api/classes/:classId/availability`
- **Auth:** Public
- **Status:** Đã có test tích hợp

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "capacity": 20,
    "enrolledCount": 5,
    "remaining": 15,
    "enrollmentOpen": true,
    "classType": "PAID",
    "price": "500000.00"
  }
}
```
**Response Error (404 Not Found):**
```json
{
  "success": false,
  "error": "CLASS_NOT_FOUND",
  "message": "Class not found"
}
```

### 2. Enroll in a Class
- **Method:** `POST`
- **Path:** `/api/classes/:classId/enrollments`
- **Auth:** Required (Role: `STUDENT`)
- **Status:** Đã có test tích hợp

**Response Success (201 Created):**
```json
{
  "success": true,
  "data": {
    "_id": "60d0fe4f5311236168a109ca",
    "studentId": "60d0fe4f5311236168a109c1",
    "classId": "60d0fe4f5311236168a109c2",
    "courseId": "60d0fe4f5311236168a109c3",
    "teacherId": "60d0fe4f5311236168a109c4",
    "enrollmentStatus": "PENDING_PAYMENT",
    "paymentSource": "DIRECT_PAYMENT",
    "tuitionAmount": "500000.00",
    "enrolledAt": "2024-01-01T10:00:00.000Z",
    "holdExpiresAt": "2024-01-01T10:15:00.000Z"
  }
}
```

**Common Errors:**
- `400 Bad Request`: `CLASS_NOT_OPEN` (Class is not in OPEN status)
- `400 Bad Request`: `ENROLLMENT_CLOSED` (Outside of enrollment window)
- `403 Forbidden`: `FORBIDDEN` (Only STUDENT role can enroll)
- `404 Not Found`: `CLASS_NOT_FOUND`
- `409 Conflict`: `CLASS_FULL` (Capacity reached)
- `409 Conflict`: `DUPLICATE_ENROLLMENT` (User is already enrolled)

### 3. Get My Enrollments
- **Method:** `GET`
- **Path:** `/api/me/enrollments`
- **Auth:** Required (Role: `STUDENT`)
- **Query Params:** `page` (default 1), `limit` (default 20, max 100)
- **Status:** Đã có test tích hợp

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "60d0fe4f5311236168a109ca",
        "classId": {
          "_id": "60d0fe4f5311236168a109c2",
          "className": "Learn React",
          "classType": "PAID",
          "price": "500000.00",
          "status": "OPEN",
          "capacity": 20,
          "enrolledCount": 5
        },
        "enrollmentStatus": "PENDING_PAYMENT",
        "tuitionAmount": "500000.00"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### 4. Get Enrollment By ID
- **Method:** `GET`
- **Path:** `/api/enrollments/:id`
- **Auth:** Required (Role: `STUDENT`)
- **Status:** Đã có test tích hợp

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "60d0fe4f5311236168a109ca",
    "classId": {
      "_id": "60d0fe4f5311236168a109c2",
      "className": "Learn React",
      "classType": "PAID"
    },
    "enrollmentStatus": "PENDING_PAYMENT",
    "tuitionAmount": "500000.00"
  }
}
```
**Response Error (404 Not Found):**
- `404 Not Found`: `ENROLLMENT_NOT_FOUND`

### 5. Cancel Enrollment
- **Method:** `POST`
- **Path:** `/api/enrollments/:id/cancel`
- **Auth:** Required (Role: `STUDENT`, Owner of enrollment)
- **Status:** Đã có test tích hợp

**Response Success (200 OK):**
```json
{
  "success": true,
  "message": "Enrollment cancelled successfully"
}
```

**Common Errors:**
- `404 Not Found`: `ENROLLMENT_NOT_FOUND`
- `409 Conflict`: `ENROLLMENT_NOT_CANCELLABLE` (Enrollment is not in PENDING_PAYMENT status)
