# EDUNITY V3 — ADMIN NOTIFICATIONS AUDIT
## Document 01: Root Cause Analysis — 404 Route Not Found

### 1. Hiện tượng báo cáo
Khi Quản trị viên (Admin) bấm vào mục **"Thông báo"** trên Sidebar điều hướng hoặc truy cập đường dẫn:
```
http://localhost:5173/admin/notifications
```
Giao diện hiển thị: **"404 - Trang không tồn tại"**.

---

### 2. Nguyên nhân gốc rễ (Root Cause)

1. **Thiếu Route trong AdminLayout (`FrontEnd/src/app/router.tsx`):**
   - Trong `router.tsx`, nhánh Route dành cho Quản trị viên (`path: ROUTES.ADMIN.HOME`, tương ứng `/admin`) bao gồm các trang con (`users`, `classes`, `catalog`, `payments`, `transactions`, `reconciliations`, `payouts`, `refunds`, `reports`, `trash`).
   - Tuy nhiên, route con `notifications` hoàn toàn **chưa từng được đăng ký** bên trong danh sách `children` của `AdminLayout`.
   - Kết quả: Khi người dùng truy cập `/admin/notifications`, React Router không tìm thấy route khớp và rơi vào route wildcard `{ path: "*", element: <NotFoundPage /> }`.

2. **Bất đồng bộ liên kết giữa Header Bell và Sidebar:**
   - Trong `AdminSidebar.tsx`, nút điều hướng dẫn đến `/admin/notifications`.
   - Trong `NotificationPopover.tsx` (chuông thông báo trên Header), nút "Xem tất cả thông báo" lại điều hướng đến `/notifications` (vốn nằm ngoài `AdminLayout` và thuộc giao diện `PublicLayout` dành cho học viên/khách).
   - Hằng số định tuyến `ROUTES.ADMIN` trong `routePaths.ts` trước đây thiếu thuộc tính `NOTIFICATIONS`.

---

### 3. Giải pháp khắc phục

1. **Bổ sung hằng số Route:** Thêm `NOTIFICATIONS: "/admin/notifications"` vào `ROUTES.ADMIN` trong `FrontEnd/src/routes/routePaths.ts`.
2. **Đăng ký Route con:** Khai báo `{ path: "notifications", element: <AdminNotificationsPage /> }` bên trong `children` của `AdminLayout` tại `FrontEnd/src/app/router.tsx`.
3. **Đồng bộ Header Bell:** Cập nhật `NotificationPopover.tsx` để Quản trị viên khi bấm "Xem tất cả thông báo" được điều hướng trực tiếp đến `ROUTES.ADMIN.NOTIFICATIONS`, duy trì nguyên vẹn trải nghiệm trong Admin Portal.
4. **Đồng bộ Sidebar:** Gắn `ROUTES.ADMIN.NOTIFICATIONS` vào menu item "Thông báo" trong `AdminSidebar.tsx`.
