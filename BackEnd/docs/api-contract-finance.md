# API Contract - Finance APIs

## 1. GET /api/teacher/earnings
Lấy danh sách doanh thu của giảng viên. (Cần header `x-user-role: TEACHER` hoặc token TEACHER).

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "66f...",
        "classId": "66e...",
        "className": "Physics Mastery",
        "enrollmentId": "...",
        "grossAmount": "200000",
        "commissionRate": 0.2,
        "commissionAmount": "40000",
        "netAmount": "160000",
        "status": "AVAILABLE",
        "createdAt": "2024-10-01T..."
      }
    ],
    "summary": {
      "totalGross": "200000",
      "totalCommission": "40000",
      "totalNet": "160000",
      "pending": "0",
      "available": "160000",
      "paidOut": "0"
    }
  }
}
```

## 2. GET /api/admin/payments
Lấy danh sách các khoản thanh toán. Phân trang, có thể lọc theo `status`. (Chỉ ADMIN)

## 3. GET /api/admin/transactions
Lấy danh sách các giao dịch dòng tiền (nạp/rút/hoàn tiền). Phân trang, có thể lọc theo `type`, `status`. (Chỉ ADMIN)
