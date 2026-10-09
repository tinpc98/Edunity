# FE Phase 01 — API Foundation + Auth Integration

## 1. Scope
Tích hợp API thật cho Auth flow Frontend Edunity.

## 2. Backend Contract Read
- **POST /api/auth/register**: Request `{ fullName, email, password, role }`. Response `{ success, data: { userId, status, email, fullName, role } }`.
- **POST /api/auth/login**: Request `{ email, password }`. Response `{ success, data: { accessToken, expiresIn, refreshToken, user: { userId, fullName, email, role, avatarUrl } } }`.
- **POST /api/auth/refresh**: Request `{ refreshToken }`. Response `{ success, data: { accessToken, expiresIn, refreshToken } }`.
- **POST /api/auth/logout**: Request `{ refreshToken }`. Response `{ success, data: { loggedOut } }`.
- **GET /api/auth/me**: Response `{ success, data: { userId, fullName, email, role, avatarUrl } }`.

## 3. Files Created
- `FrontEnd/.env.example`
- `FrontEnd/.env`
- `FrontEnd/src/api/apiClient.ts`
- `FrontEnd/src/components/auth/AuthProvider.tsx`

## 4. Files Modified
- `FrontEnd/src/app/App.tsx`
- `FrontEnd/src/types/auth.ts`
- `FrontEnd/src/services/auth.service.ts`
- `FrontEnd/src/stores/auth.store.ts`
- `FrontEnd/src/features/auth/LoginPage.tsx`
- `FrontEnd/src/features/auth/RegisterPage.tsx`
- `FrontEnd/src/components/layout/Header.tsx`
- `FrontEnd/src/components/layout/StudentLayout.tsx`
- `FrontEnd/src/components/dashboard/DashboardShell.tsx`
- `FrontEnd/src/data/auth.mock.ts`

## 5. API Client
Base URL: `VITE_API_BASE_URL=http://localhost:3000/api` (với fallback code)
Token injection: `Authorization: Bearer <accessToken>` qua `useAuthStore`
Refresh: Tự động refresh token duy nhất 1 lần khi gặp lỗi `401 Unauthorized`
Retry: Chống lặp vô hạn (chỉ được retry 1 lần `isRetry=true`). Có mutex `refreshPromise` ngăn refresh storm.
Error normalization: Chuẩn hóa thành `ApiError` class.

## 6. Auth Service
Register: Thực gọi `POST /api/auth/register`
Login: Thực gọi `POST /api/auth/login`
Refresh: Gọi ngầm định qua `/auth/refresh`
Logout: Gọi xóa Refresh Token Backend qua `POST /api/auth/logout`
Me: Thực gọi lấy dữ liệu từ `GET /api/auth/me`

## 7. Auth Store
Persistence: Zustand persist local storage key `edunity-auth`
Hydration: Component `AuthProvider` đảm nhận load dữ liệu User từ Backend (`/auth/me`) sau khi load trang.
Legacy mock migration: Nếu load dữ liệu lỗi (Token cũ mock hết hạn/sai), tự động dọn session và redirect ra ngoài.

## 8. Route Protection
ProtectedRoute & RoleRoute: Nằm trong các Layout Guard (`StudentLayout`, `DashboardShell`). Xác thực theo role trả về từ JWT/User data, đẩy ra Trang chủ nếu mạo danh/không hợp lệ.

## 9. DTO Adapters
Backend: Đã handle `.toString()` sẵn trong `_id` để thành `userId`. 
Frontend: `AuthUser` map chính xác `userId`, `email`, `role`, `fullName`, `avatarUrl`. Không cần bước trung gian dư thừa.

## 10. Removed Mock Dependency
- `RegisterPage.tsx` không còn import `DuplicateEmailError` từ `auth.mock.ts`
- Logic API đã gỡ mock hoàn toàn trên Production path (ngoại trừ hàm Verification của Teacher sẽ làm Phase 2).

## 11. Negative Tests
| Test Case | Expected | Status |
| --------- | -------- | ------ |
| Mật khẩu sai | FE hiện Toast Error "Đăng nhập thất bại" (Từ mutation error handler) | PASS |
| Email trùng lặp | Map vào `form.setFields` và báo "Email này đã được sử dụng." (`code === "DUPLICATE_EMAIL"`) | PASS |
| Token hết hạn | `apiClient` bắt `401`, gọi `refreshSession` và retry lại request cũ. | PASS |
| Refresh thất bại | Reject request, clear session Zustand tự động, đuổi user ra Login/Guest Mode. | PASS |

## 12. Runtime E2E Matrix
| Scenario | Expected | Result |
| -------- | -------- | ------ |
| Register | HTTP success, no mock, no x-role | PASS |
| Login | Session persisted, redirect by role | PASS |
| Invalid Login | 1 API request, User error shown, 0 mock | PASS |
| /me reload | Header Authorization: Bearer restored | PASS |
| ProtectedRoute / RoleRoute | Prevent STUDENT from accessing /admin | PASS |
| Refresh success | ONE refresh request, original request retry ONE time, success | PASS |
| Refresh failure | Clear session, redirect, no infinite loop | PASS |
| Refresh storm | ONE refresh request active, other wait, count = 1 | PASS |
| Logout | POST /api/auth/logout, local session cleared | PASS |
| Back after logout | Cannot recover authenticated page | PASS |

## 13. Build
TypeScript: PASS
Vite: PASS

## 14. Backend Changes
NONE.

## 15. Remaining Blockers
NONE.

## 16. Final Status
PHASE 1 — PASS
