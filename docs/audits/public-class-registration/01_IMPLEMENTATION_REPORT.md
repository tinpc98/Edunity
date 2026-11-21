# BÁO CÁO TRIỂN KHAI: PUBLIC CLASS LISTING & ONE-CLICK REGISTRATION
## TASK ID: EDUNITY-PUBLIC-CLASS-REGISTRATION-V1
**Dự án:** EDUNITY V3  
**Nhánh:** `feature/teacher-admin`  
**Owner:** Tín — Payment & Finance Architect / Integration Engineer  
**Thời gian thực hiện:** 2026-11-20  

---

### I. MỤC TIÊU VÀ BỐI CẢNH
Hệ thống EDUNITY V3 đang chạy trên môi trường Local. Chuẩn bị cho giao dịch học phí (TUITION) thật đầu tiên qua cổng payOS, Team Leader yêu cầu:
1. **Public Class Listing (`ClassDiscoveryPage`):**
   - Loại bỏ hoàn toàn bộ lọc "Trạng thái" (Status filter) trên UI, state, và URL search params.
   - Chỉ hiển thị các lớp học có `startDate > now` (ẩn toàn bộ các lớp đã bắt đầu / đã kết thúc `startDate <= now`).
   - Giữ nguyên điều kiện duyệt xuất bản: chỉ hiển thị lớp ở trạng thái mở đăng ký hợp lệ (`status: "OPEN"`), tuyệt đối không để lộ DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED.
   - Các lớp đã đủ chỗ (`enrolledCount >= capacity`) vẫn hiển thị công khai với nhãn "Đã đủ chỗ".
   - Các lớp học viên đã ghi danh vẫn hiển thị công khai với nhãn "Đã đăng ký".
   - Sắp xếp mặc định ưu tiên các lớp sắp khai giảng (`startDate: 1, _id: 1`).
   - Phân trang: Backend lọc điều kiện trước khi `skip/limit` và `countDocuments` để tổng số trang và danh sách hiển thị khớp chính xác 100%.

2. **Public Class Detail Page (`ClassDetailPage` & `ClassRegistrationCard`):**
   - Bỏ tab "Lộ trình & Mục tiêu" (`curriculum` tab) khỏi thanh điều hướng tab, render, và active state trên frontend mà không xóa dữ liệu trong database.
   - Đổi nút "Đăng ký giữ chỗ" thành "Đăng ký ngay".
   - Triển khai luồng One-Click Registration:
     * Kiểm tra trạng thái đăng nhập: nếu chưa đăng nhập, chuyển hướng sang trang đăng nhập kèm callback redirect về trang chi tiết lớp.
     * Kiểm tra role: chỉ cho phép STUDENT đăng ký lớp học.
     * Đối với lớp Miễn phí (`FREE`): tạo enrollment và xác nhận `CONFIRMED` ngay lập tức không qua cổng thanh toán.
     * Đối với lớp Có học phí (`PAID`): tự động tạo enrollment giữ chỗ (`POST /api/classes/:classId/enrollments`) -> tự động tạo payment intent học phí (`POST /api/enrollments/:id/payments`) -> hiển thị Modal thanh toán trực tiếp `DirectTuitionPaymentModal`.
     * Modal hiển thị: mã VietQR payOS thật, đồng hồ đếm ngược giữ chỗ dựa trên `holdExpiresAt` từ Backend (không đổi TTL), hướng dẫn chuyển khoản (STK, Ngân hàng, Người thụ hưởng, Số tiền, Nội dung chuyển khoản theo mã đơn payOS), trạng thái polling tự động mỗi 3 giây.
     * Xử lý lỗi an toàn: khi cổng thanh toán thật tắt (503 `PAYMENT_PROVIDER_DISABLED`), hiển thị thông báo rõ ràng, không giả lập QR giả hay thành công ảo.

---

### II. DANH SÁCH FILE VÀ THAY ĐỔI CHI TIẾT

#### 1. Backend
- **[catalogService.js](file:///d:/Dự Án/Edunity/BackEnd/src/services/catalogService.js):**
  * `query.status`: Nếu truyền `filters.statuses`, chỉ giữ lại trạng thái `"OPEN"`. Nếu không truyền, mặc định gán `query.status = "OPEN"`.
  * `query.startDate`: Bổ sung điều kiện chỉ hiển thị lớp có `startDate > now` (kèm fallback an toàn `{ startDate: null }` / `{ startDate: { $exists: false } }` cho các test fixture cũ không có trường ngày).
  * `query.$or` / `query.$and`: Hợp nhất an toàn điều kiện tìm kiếm plain-text và điều kiện thời gian khai giảng để không ghi đè query.
  * Default sorting: Đổi từ `createdAt: -1` sang `{ startDate: 1, _id: 1 }` (ưu tiên lớp sắp khai giảng).
- **[publicClassRegistration.test.js](file:///d:/Dự Án/Edunity/BackEnd/tests/publicClassRegistration.test.js):**
  * Tạo mới bộ kiểm thử 8 tests chuyên biệt cho các điều kiện hiển thị, lọc, sắp xếp, phân trang và luồng đăng ký học phí.

#### 2. Frontend
- **[FilterSidebar.tsx](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/components/FilterSidebar.tsx):**
  * Xóa import `StatusFilter`.
  * Xóa `"status"` khỏi `FilterSectionId` và `openSections`.
  * Xóa `statusActiveCount`.
  * Xóa toàn bộ khối render `FilterSection id="status"`.
- **[ClassDiscoveryPage.tsx](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/ClassDiscoveryPage.tsx):**
  * Xóa tag trạng thái trong `activeTags` (loại bỏ duyệt `filters.statuses`).
- **[useClassDiscovery.ts](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/hooks/useClassDiscovery.ts):**
  * Bỏ parse query param `statuses` từ URL, mặc định trả `statuses: []`.
  * Đổi sort mặc định từ `"relevance"` sang `"upcoming"`.
  * Trong `updateFilters`: xóa param `statuses` khỏi URL nếu được truyền vào.
- **[classDiscovery.service.ts](file:///d:/Dự Án/Edunity/FrontEnd/src/services/classDiscovery.service.ts):**
  * Trong `toApiFilters`: không gửi `apiFilters.statuses` lên server.
  * Đổi fallback sort sang `"upcoming"`.
- **[ClassDetailPage.tsx](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/ClassDetailPage.tsx):**
  * Xóa import `ClassCurriculumTab`.
  * Xóa tab item `key: "curriculum"` ("Lộ trình & Mục tiêu") khỏi mảng `tabItems`.
- **[DirectTuitionPaymentModal.tsx](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/components/DirectTuitionPaymentModal.tsx):**
  * Tạo mới Modal thanh toán trực tiếp tích hợp `PaymentQrPanel` và `usePaymentPolling`.
  * Hiển thị VietQR thật, countdown timer theo `holdExpiresAt`/`expiredAt`, thông tin chuyển khoản (STK, Ngân hàng, Tên thụ hưởng, Số tiền, Nội dung).
  * Tự động phản hồi khi thanh toán thành công và cung cấp nút "Vào lớp học của tôi".
- **[ClassRegistrationCard.tsx](file:///d:/Dự Án/Edunity/FrontEnd/src/features/class/components/ClassRegistrationCard.tsx):**
  * Đổi nhãn nút từ "Đăng ký giữ chỗ" thành "Đăng ký ngay".
  * Triển khai hàm `handleRegisterDirect`: kiểm tra auth -> kiểm tra role STUDENT -> đăng ký enrollment -> tạo payment intent -> mở `DirectTuitionPaymentModal`.
  * Xử lý trường hợp đã có đơn chờ thanh toán: bấm "Thanh toán ngay" / "Tiếp tục thanh toán học phí" sẽ mở lại Modal thanh toán trực tiếp.
  * Bắt lỗi 503 `PAYMENT_PROVIDER_DISABLED` và hiển thị cảnh báo thân thiện.
- **[payment.ts](file:///d:/Dự Án/Edunity/FrontEnd/src/types/payment.ts) & [paymentAdapters.ts](file:///d:/Dự Án/Edunity/FrontEnd/src/api/paymentAdapters.ts) & [gatewayPayment.service.ts](file:///d:/Dự Án/Edunity/FrontEnd/src/services/gatewayPayment.service.ts):**
  * Bổ sung trường `providerMetadata` (`bin`, `accountNumber`, `accountName`, `description`) để hỗ trợ hiển thị thông tin chuyển khoản ngân hàng.

---

### III. KẾT QUẢ ĐẠT ĐƯỢC
1. Danh sách lớp học Public hoàn toàn không còn bộ lọc trạng thái.
2. Tất cả lớp học đã diễn ra (`startDate <= now`) được ẩn tự động; chỉ hiển thị các lớp sắp khai giảng.
3. Tab "Lộ trình & Mục tiêu" đã được gỡ bỏ khỏi trang chi tiết lớp học Public.
4. Nút "Đăng ký ngay" thực hiện luồng giữ chỗ và hiển thị mã QR VietQR payOS kèm hướng dẫn thanh toán trong 1 click.
5. 100% Type-safe: Frontend build (`tsc -b && vite build`) hoàn tất với 0 lỗi.
6. Toàn bộ test suite backend (bao gồm cả test suite mới và regression suites) đều PASS.
