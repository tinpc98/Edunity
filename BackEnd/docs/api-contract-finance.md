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

## Rút tiền của Teacher (Payout)

Thu nhập (`TeacherEarning`) là `PENDING` khi học viên thanh toán và chuyển `AVAILABLE` khi lớp `COMPLETED`
(job bảo trì). Duyệt hoàn phí một buổi (`/admin/session-refund-reviews/:id/review` với `APPROVED_FOR_PAYMENT_TEAM`)
tạo giao dịch `REFUND` = học phí / số buổi và trừ tương ứng vào thu nhập chưa chi trả.

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| GET | `/teacher/payouts` | Teacher | Lịch sử yêu cầu rút tiền |
| POST | `/teacher/payouts` | Teacher | `{ bankName, accountNumber, accountHolderName }` → rút toàn bộ thu nhập `AVAILABLE`. `409 PAYOUT_ALREADY_PENDING`, `409 NO_AVAILABLE_EARNINGS` |
| GET | `/admin/payouts?status=` | Admin | Hàng đợi yêu cầu rút tiền |
| POST | `/admin/payouts/:id/complete` | Admin | Đã chuyển khoản → `COMPLETED`, thu nhập `PAID_OUT`, ghi giao dịch `TEACHER_PAYOUT` |
| POST | `/admin/payouts/:id/reject` | Admin | `{ note }` bắt buộc → `REJECTED`, thu nhập được trả lại để yêu cầu lại |
