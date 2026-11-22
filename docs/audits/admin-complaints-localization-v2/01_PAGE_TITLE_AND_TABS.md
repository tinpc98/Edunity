# EDUNITY V3 — ADMIN COMPLAINTS & INCIDENTS AUDIT
## Tài liệu 01: Chuẩn hóa Tiêu đề Trang và Cấu trúc Điều hướng Tabs

**Mã tác vụ:** `EDUNITY-ADMIN-COMPLAINTS-LOCALIZATION-V2`  
**Nhánh làm việc:** `feature/teacher-admin`  
**File điều chỉnh:** `FrontEnd/src/features/admin/reports/AdminReportsPage.tsx`  
**Kiểm thử tích hợp:** `BackEnd/tests/adminComplaintsLocalizationV2.test.js`  

---

### 1. Bối cảnh & Vấn đề tồn tại trước khi chỉnh sửa
- **Tiêu đề trang cũ:** "Quản lý Báo cáo & Khiếu nại (Reports & Complaints)", "Trung tâm tiếp nhận khiếu nại và giám sát sự cố học tập".
- **Tabs cũ:** Chứa mã định danh tác vụ nội bộ của lập trình viên:
  - Tab 1: `Khiếu nại người dùng (TIN-05D)`
  - Tab 2: `Sự cố & Kỷ luật lớp học (TIN-05E)`
- **Banner cảnh báo thừa:** Khối banner lớn ở đầu trang với tiêu đề `Cơ chế Bảo vệ Kỷ luật & Tài chính An toàn (Safe Review Workflow)` kèm hàng loạt quy định nội bộ dài dòng gây rối mắt, chiếm diện tích làm việc của Quản trị viên.

---

### 2. Chi tiết thay đổi giao diện (UI Refinement)

#### A. Chuẩn hóa Tiêu đề & Mô tả Header (AdminPageHeader)
Sử dụng chung chuẩn component `AdminPageHeader` theo tông màu Mint/Emerald đồng bộ với hệ thống Admin Finance & Operations:
- **Tiêu đề mới:** `Quản lý khiếu nại và sự cố lớp học`
- **Mô tả phụ:** `Tiếp nhận phản ánh, xử lý sự cố giảng dạy và theo dõi các yêu cầu liên quan đến lớp học.`
- **Tag phụ trợ:** `Vận hành lớp học` (thay vì các mã kỹ thuật).

#### B. Loại bỏ hoàn toàn mã kỹ thuật trên Tabs
Chuyển đổi 2 tab chính sang tiếng Việt tự nhiên, trực quan cho Admin:
- Tab 1: `Khiếu nại người dùng` (loại bỏ tiền tố/hậu tố `TIN-05D`).
- Tab 2: `Sự cố giảng dạy và kỷ luật` (loại bỏ tiền tố/hậu tố `TIN-05E`).

#### C. Xóa bỏ hoàn toàn Banner "Safe Review Workflow"
- Gỡ bỏ thẻ banner cảnh báo tĩnh `Cơ chế Bảo vệ Kỷ luật & Tài chính An toàn`.
- Toàn bộ cơ chế kiểm soát an toàn và tính bất biến tài chính được duy trì ngầm ở tầng backend và business logic trong modal, không cần hiển thị văn bản cảnh báo gây loãng thông tin trên màn hình tác vụ hàng ngày của Admin.

---

### 3. Tương thích kiến trúc & UX
- Tối ưu không gian hiển thị, đưa bộ lọc trạng thái và bảng danh sách dữ liệu lên vùng nhìn trọng tâm (above the fold).
- Không làm ảnh hưởng đến routing (`/admin/reports`), active tab state, hoặc các handler tải dữ liệu từ backend API (`fetchReports`, `fetchSmartOverview`).
