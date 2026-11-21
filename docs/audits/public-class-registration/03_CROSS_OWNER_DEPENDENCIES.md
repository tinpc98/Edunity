# BÀN GIAO & PHỤ THUỘC GIỮA CÁC THÀNH VIÊN (CROSS-OWNER DEPENDENCIES)
## TASK ID: EDUNITY-PUBLIC-CLASS-REGISTRATION-V1
**Thời gian:** 2026-11-20  
**Tác giả:** Tín — Payment & Finance Architect / Integration Engineer  

---

### I. PHÂN ĐỊNH PHẠM VI & QUYỀN SỞ HỮU

| Thành viên | Trách nhiệm chính trong EDUNITY V3 | Điểm tiếp giáp với Task này |
|---|---|---|
| **TÍN** | Payment, Transaction, Ledger, Settlement, Tuition Checkout, Frontend tài chính | - Trực tiếp triển khai task này.<br>- Khởi tạo Payment Intent tự động từ `POST /api/enrollments/:id/payments`.<br>- Hiển thị `PaymentQrPanel` và Modal thanh toán `DirectTuitionPaymentModal`.<br>- Đồng bộ thời gian giữ chỗ `holdExpiresAt` và kiểm tra trạng thái thanh toán qua polling. |
| **CHÂU** | Class, Session, Course, Academic Catalog, Curriculum | - Bỏ tab "Lộ trình & Mục tiêu" trên giao diện công khai `ClassDetailPage.tsx` theo yêu cầu product (không xóa dữ liệu `ClassCurriculumTab` hay Course Curriculum).<br>- Điều kiện lọc public `startDate > now` và `status: "OPEN"` trong `catalogService.js`.<br>- Không đụng vào schema `Class.js` hay sửa logic tạo session của Châu. |
| **BẢO** | Auth, Security, Role-based Access, eKYC | - Kiểm tra xác thực (Unauthenticated redirect về `/login?redirect=...`).<br>- Kiểm tra phân quyền: Chỉ role `STUDENT` mới được tạo đơn ghi danh lớp học.<br>- Khóa fail-closed: Các lớp `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED` tuyệt đối không bị lộ ra Public API. |
| **BĂNG** | Frontend chung, Layout, Routing | - Giữ nguyên router `/classes` và `/classes/:classId`.<br>- Cập nhật giao diện `FilterSidebar.tsx`, loại bỏ mục bộ lọc trạng thái để người dùng không bị bối rối.<br>- Nút CTA "Đăng ký ngay" với hiệu ứng loading và giao diện Modal mint/teal/indigo đồng bộ Stitch UI. |

---

### II. NGUYÊN TẮC AN TOÀN TÀI CHÍNH ĐÃ TUÂN THỦ

1. **Tuyệt đối không tạo thanh toán ảo hoặc QR giả khi nghiệm thu:**
   - Khi cổng thật payOS chưa được cấp credentials hoặc chưa bật (503 `PAYMENT_PROVIDER_DISABLED`), hệ thống lập tức thông báo lỗi rõ ràng cho học viên.
   - Không tự động mock thành công hay tự động kích hoạt enrollment thành `CONFIRMED` khi chưa có tiền vào tài khoản thực tế.
2. **Bảo toàn thời gian giữ chỗ (Reservation TTL):**
   - Giữ nguyên logic tính thời hạn giữ chỗ của Backend (`holdExpiresAt`), không tự ý sửa thành 10 phút.
   - Countdown timer trên frontend đọc trực tiếp `holdExpiresAt` từ DTO trả về.
3. **Bảo mật và toàn vẹn dữ liệu học thuật:**
   - Dữ liệu lộ trình học tập (`Curriculum`, `Syllabus`, `Session`) trong MongoDB vẫn được giữ nguyên đầy đủ để phục vụ giảng dạy trong Classroom sau khi học viên ghi danh thành công.
   - Danh sách lớp học công khai luôn bảo toàn tính chính xác của phân trang (`total` và `totalPages`).
