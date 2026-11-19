# EDUNITY V3 — ADMIN UI REDESIGN
## BÁO CÁO 05: KIỂM THỬ HỒI QUY CHỨC NĂNG (FUNCTIONAL REGRESSION)

**Mã công việc:** `EDUNITY-V3-ADMIN-FULL-UI-REDESIGN`  
**Ngày thực hiện:** 19/11/2026  
**Chủ sở hữu:** Senior Frontend QA Lead & Integration Architect  
**Nhánh Git:** `feature/teacher-admin`  

---

### I. MỤC TIÊU KIỂM THỬ HỒI QUY

Đảm bảo việc tái thiết kế giao diện (UI Redesign) không làm thay đổi hay suy giảm bất kỳ logic nghiệp vụ, tính toàn vẹn dữ liệu, kiểm soát truy cập (RBAC), hoặc tích hợp API nào của nền tảng EDUNITY V3.

---

### II. MA TRẬN KIỂM THỬ & KẾT QUẢ XÁC MINH

| Hạng Mục Kiểm Thử | Tình Huống / Kịch Bản Thực Hiện | Kết Quả Mong Đợi | Trạng Thái |
| :--- | :--- | :--- | :---: |
| **1. RBAC & Route Guard** | Người dùng chưa đăng nhập hoặc có vai trò `TEACHER`, `STUDENT`, `SPONSOR` cố truy cập `/admin/*` | Hệ thống chặn truy cập, hiển thị thông báo lỗi quyền hạn và chuyển hướng về trang chủ/đăng nhập. | **PASS** |
| **2. Admin Authentication** | Người dùng đăng nhập thành công với vai trò `ADMIN` | Cho phép truy cập toàn bộ 22 routes của Admin, hiển thị đúng tên và email trên Header & Sidebar. | **PASS** |
| **3. Real Queries (No Mock Data)** | Tải trang Dashboard, Users, Verifications, Finance Overview | Gửi request thật đến các endpoint backend (`/api/admin/dashboard`, `/api/admin/users`, `/api/admin/teachers/verifications`, `/api/finance/overview`). Không sử dụng mock data. | **PASS** |
| **4. User Detail Modal (Center)** | Quản trị viên nhấp nút "Chi tiết" tại bảng người dùng | Mở **Centered Modal** chính giữa màn hình (rộng 820px, bo góc 20px, nền mờ backdrop). Không mở Drawer lề phải. | **PASS** |
| **5. Escape Key Close** | Nhấn phím `Esc` khi Modal chi tiết người dùng đang mở | Modal đóng ngay lập tức, giải phóng trạng thái `selectedUserId` về `null`. | **PASS** |
| **6. Copy User ID** | Nhấp biểu tượng sao chép mã người dùng trong Modal | Chuỗi ID được ghi vào clipboard của hệ điều hành, hiển thị toast message thành công. | **PASS** |
| **7. Change User Status** | Đổi trạng thái người dùng sang `SUSPENDED` hoặc `BANNED` | Form yêu cầu bắt buộc nhập lý do (`reason`). Mutation gửi API thành công và tự động làm mới danh sách (invalidateQueries). | **PASS** |
| **8. Teacher Verification Flow** | Thẩm định hồ sơ giáo viên chờ duyệt | Cho phép xem tài liệu định danh CCCD, chứng chỉ chuyên môn, cảnh báo nếu OCR không khớp và gửi quyết định Duyệt/Từ chối. | **PASS** |
| **9. Teacher Payout & Contracts** | Quản lý hợp đồng giảng dạy và yêu cầu rút tiền | Hiển thị chính xác trạng thái PENDING/AVAILABLE từ sổ cái TeacherEarning; gửi hợp đồng điện tử an toàn. | **PASS** |
| **10. Finance Overview Monitoring** | Tải trang Tổng quan Tài chính | Cập nhật tự động chu kỳ 30 giây; hiển thị chuẩn 4 KPI, trạng thái Outbox Worker và hàng đợi đối soát. | **PASS** |
| **11. Non-Admin Isolation** | Kiểm tra các trang Student, Teacher, Sponsor | Giao diện Student/Teacher/Sponsor không bị biến dạng, không nhận nhầm màu Teal của Admin, hoạt động độc lập 100%. | **PASS** |
| **12. Git Safety Preservation** | Kiểm tra các file sửa đổi thuộc task trước | 4 file sửa lỗi thanh toán (`PaymentErrorState.tsx`, `CampaignDetailPage.tsx`, `ClassRegistrationCard.tsx`, `CheckoutPage.tsx`) giữ nguyên 100%. | **PASS** |

---

### III. KẾT LUẬN HỒI QUY
Toàn bộ 12 kịch bản kiểm thử hồi quy đều đạt kết quả **PASS**. Không phát sinh lỗi hồi quy về chức năng hay bảo mật.
