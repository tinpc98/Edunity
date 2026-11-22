# EDUNITY V3 — BÁO CÁO ĐIỀU HƯỚNG TỰ ĐỘNG SAU THANH TOÁN THÀNH CÔNG

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/02_PAYMENT_CONFIRMATION_REDIRECT.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Chủ trì:** Băng (Frontend Lead) & Tín (Payment Lead)  

---

## 1. MỤC TIÊU & YÊU CẦU

Sau khi học viên hoàn tất chuyển khoản học phí và Backend xác nhận `Payment` trạng thái `COMPLETED` kèm `Enrollment` trạng thái `CONFIRMED`:
- Hệ thống phải tự động điều hướng người dùng trực tiếp đến lớp học vừa đăng ký trong không gian học tập của học viên ("My Learning").
- Đường dẫn điều hướng phải là route thực tế trong React Router, tuyệt đối không hardcode route không tồn tại.
- Nếu học viên không muốn chờ 1.5 giây chuyển trang tự động, có sẵn nút hành động "Vào lớp học của tôi ngay" để chuyển ngay lập tức.
- Nếu thanh toán đã nhận nhưng Enrollment chưa xác nhận xong (hoặc lỗi dispatch), tuyệt đối không redirect thành công giả.

---

## 2. KIỂM THỰC ROUTER & ROUTE CHÍNH XÁC

Kiểm tra cấu hình React Router thực tế tại [FrontEnd/src/app/router.tsx](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/app/router.tsx#L185-L195) và [FrontEnd/src/routes/routePaths.ts](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/routes/routePaths.ts#L33-L48):
- Root Student Layout: `/student` (`ROUTES.STUDENT.HOME`)
- Trang chi tiết buổi học & nội dung lớp đã đăng ký:
  ```typescript
  ROUTES.STUDENT.CLASS_SESSIONS = "/student/classes/:classId"
  ```
  Route được gắn với component `<StudentClassSessionsPage />`.
- Do đó, target URL điều hướng chính xác là:
  ```typescript
  const targetClassRoute = ROUTES.STUDENT.CLASS_SESSIONS.replace(":classId", item.id);
  ```

---

## 3. CƠ CHẾ TRIỂN KHAI TRÊN FRONTEND

### 3.1. Quản lý trạng thái và Invalidation Cache
Trong [DirectTuitionPaymentModal.tsx](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/class/components/DirectTuitionPaymentModal.tsx):
- Hook `usePaymentPolling` chạy ngầm mỗi 3 giây lấy dữ liệu `Payment` và `Enrollment` từ `GET /api/payments/:id`.
- Trạng thái `effectiveUiState` chuyển sang `"COMPLETED"` chỉ khi `Payment.paymentStatus === "COMPLETED"` và `Enrollment.enrollmentStatus === "CONFIRMED"`.
- Ngay khi `isCompleted` kích hoạt:
  1. Invalidate toàn bộ các query cache liên quan:
     - `enrollmentKeys.all`
     - `enrollmentKeys.availability(item.id)`
     - `classKeys.all`
     - `sessionKeys.all`
     - `paymentKeys.all`
     - `["classDetail", item.id]`
     - `["classDiscovery"]`
  2. Kích hoạt timer tự động 1.5 giây (1500ms):
     ```typescript
     const timer = setTimeout(() => {
       onClose();
       navigate(targetClassRoute);
     }, 1500);
     ```
  3. Hiển thị thông báo thành công Mint/Teal: "Thanh toán thành công! Hệ thống đã nhận được học phí và xác nhận ghi danh lớp học cho bạn. Đang tự động chuyển đến lớp học...".
  4. Nút bấm chính "Vào lớp học của tôi ngay" cho phép học viên click chuyển trang tức thì.

### 3.2. Cập nhật Thẻ đăng ký ngoài trang chi tiết
Trong [ClassRegistrationCard.tsx](file:///D:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/class/components/ClassRegistrationCard.tsx):
- Khi `isConfirmed` là `true`:
  - Ẩn toàn bộ nút "Đăng ký ngay", "Thanh toán ngay", "Tiếp tục thanh toán".
  - Hiển thị Alert màu xanh lá: "Bạn đã đăng ký thành công lớp học này. Lớp học đã có trong mục Lớp học của tôi."
  - Nút Primary Action: **"Vào lớp học của tôi"** dẫn thẳng đến `targetClassRoute`.

---

## 4. BẢO ĐẢM AN TOÀN NGHIỆP VỤ

1. **Không điều hướng thành công giả:**
   - Nếu `Payment` là `COMPLETED` nhưng `Enrollment` chưa `CONFIRMED`, `effectiveUiState` không phải là `COMPLETED` mà hiển thị trạng thái chờ kích hoạt ghi danh.
2. **Không vòng lặp chuyển trang (Redirect Loop):**
   - Router student kiểm tra quyền sở hữu qua `StudentLayout` và `authStore`. Học viên đã có bản ghi `Enrollment(CONFIRMED)` trong cơ sở dữ liệu sẽ truy cập lớp học hợp lệ mà không bị Role Guard chặn.
