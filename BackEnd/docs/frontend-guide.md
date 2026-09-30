# Frontend Guide - Edunity (BE-1 APIs Placeholder)

Tài liệu hướng dẫn dành cho FE-1 để gọi các API giả lập/tạm thời trong thời gian chờ BE-1 hoàn thiện.

## 1. Môi trường & Thiết lập
- **Base URL**: `http://localhost:3000/api`
- **Chạy backend local**:
  ```bash
  cd BackEnd
  npm install
  npm run seed  # Xóa db cũ, tạo lại data
  npm start     # Chạy server ở port 3000
  ```
- **CORS**: Đã mở cho `http://localhost:5173`. Nếu bạn dùng port khác, hãy sửa `CORS_ORIGIN` trong `.env`.

## 2. Tài khoản Demo (Seed Data)
Các tài khoản có sẵn password là `password`:
- Học viên 1: `student1@test.com` (Đã đăng ký lớp)
- Học viên 2: `student2@test.com`
- Giảng viên: `teacher@test.com`
- Giảng viên 2: `teacher2@test.com`
- Quản trị viên: `admin@test.com`
- Sponsor: `sponsor@test.com`

*Lưu ý: Header cũ `x-user-id` và `x-user-role` vẫn dùng được ở môi trường test/dev, nhưng BE đã có API login trả về token giả lập.*

## 3. Map FE Service -> BE API

Dưới đây là mapping các hàm trong FrontEnd/src/services sang API thực tế.

| Màn hình FE | Hàm service FE | Endpoint BE tương ứng |
|---|---|---|
| **Auth** | `authService.login` | `POST /auth/dev-login` |
| **Auth** | `authService.register` | `POST /auth/register` |
| **Auth** | `authService.getCurrentUser` | `GET /auth/me` |
| **Home** | `homeService.getFeaturedTeachers` | `GET /teachers?featured=true` |
| **Home** | `homeService.getCategories` | `GET /catalog/categories` |
| **Class Discovery**| `classDiscoveryService.getFilters` | `GET /catalog/filters` |
| **Class Discovery**| `classDiscoveryService.searchClasses` | `GET /classes` |
| **Class Detail** | `classService.getClassById` | `GET /classes/:id` |
| **Class Detail** | `classService.getClassSessions` | `GET /classes/:id/sessions` |
| **Class Detail** | `classService.getTeacherProfile` | `GET /teachers/:id` |
| **Enrollment** | `enrollmentService.createEnrollment` | `POST /classes/:classId/enrollments` |
| **Checkout** | `paymentService.createPayment` | `POST /enrollments/:id/payments` |
| **Student** | `studentService.getMyEnrollments` | `GET /me/enrollments?include=class` |
| **Student** | `studentService.getMySessions` | `GET /me/sessions` |
| **Student** | `studentService.getMyPayments` | `GET /me/payments` |
| **Session** | `studentService.joinSession` | `GET /sessions/:id/join` |
| **Finance** | `financeService.getTeacherEarnings` | `GET /teacher/earnings` |
| **Finance** | `financeService.getAdminPayments` | `GET /admin/payments` |
| **Finance** | `financeService.getAdminTransactions` | `GET /admin/transactions` |

## 4. Những điểm khác biệt / Cần lưu ý khi ghép API

1. **Authentication (Token)**
   Gọi `POST /auth/dev-login` sẽ nhận được `accessToken` dạng `dev-66a00...`.
   FE cần gửi token này trong header: `Authorization: Bearer dev-66a00...`.
   Đồng thời API `/auth/me` cũng cần header này.

2. **Xử lý trùng lặp đăng ký (DUPLICATE_ENROLLMENT)**
   Khi gọi API `POST /classes/:classId/enrollments`, nếu user đã đăng ký lớp này (đang chờ thanh toán hoặc đã thanh toán), BE sẽ trả về HTTP Status **409 Conflict** với body có chứa object `details`:
   ```json
   {
     "success": false,
     "error": "DUPLICATE_ENROLLMENT",
     "message": "Already enrolled",
     "details": {
       "existingEnrollmentId": "66abcd...",
       "enrollmentStatus": "PENDING_PAYMENT"
     }
   }
   ```
   **Hành động của FE**: Bắt lỗi này, đọc `error.response.data.details`, và điều hướng thẳng user sang trang `/checkout/:existingEnrollmentId`.

3. **Tiền tệ (Decimal128)**
   Trong database, giá tiền lưu dưới dạng `Decimal128` nhưng BE đã parse về `string` để tránh sai số. Do đó, trường `price` hay `tuitionAmount` mà BE trả về sẽ là chuỗi (ví dụ `"200000"`). FE có thể dùng `Number(price)` hoặc thư viện format tiền tệ để hiển thị.

4. **Thanh toán 2 bước (Mock Webhook)**
   Luồng thanh toán hiện tại là:
   - Gọi `POST /enrollments/:id/payments` -> lấy được thông tin `paymentId` và `gatewayReference`.
   - Giả lập việc cổng thanh toán callback bằng cách gọi thẳng webhook từ FE:
     `POST /payments/sandbox/webhook` với body `{ "gatewayReference": "SBX-...", "status": "SUCCESS" }`
   - Nhận status 200 từ Webhook là giao dịch hoàn tất.

5. **Lấy dữ liệu Class trong My Enrollments**
   API GET `/me/enrollments` thông thường chỉ trả về thông tin đăng ký. Để lấy thông tin Class hiển thị trên giao diện My Learning, gọi thêm tham số `?include=class`. Item trả về sẽ có object `class` và `nextSession`.

6. **Field `id` thay cho `_id`**
   Mọi response từ backend (nhờ có `serialize.js`) đều sẽ có trường `id` (kiểu chuỗi) đi kèm với `_id` (nếu đó là document Mongoose). FrontEnd nên ưu tiên sử dụng `id`.

## 5. Code mẫu TypeScript cho FE-1

**Ví dụ dùng Axios cho Service Đăng Ký (Enrollment):**
```typescript
import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:3000/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const createEnrollment = async (classId: string) => {
  try {
    const res = await api.post(`/classes/${classId}/enrollments`);
    return res.data;
  } catch (error: any) {
    if (error.response && error.response.status === 409 && error.response.data.error === 'DUPLICATE_ENROLLMENT') {
      // Chuyển tới checkout
      const details = error.response.data.details;
      window.location.href = `/checkout/${details.existingEnrollmentId}`;
    }
    throw error;
  }
};
```
