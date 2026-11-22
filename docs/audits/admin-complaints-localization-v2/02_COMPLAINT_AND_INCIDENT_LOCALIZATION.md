# EDUNITY V3 — ADMIN COMPLAINTS & INCIDENTS AUDIT
## Tài liệu 02: Việt hóa Toàn diện Khiếu nại, Sự cố Giảng dạy và Vai trò Người dùng

**Mã tác vụ:** `EDUNITY-ADMIN-COMPLAINTS-LOCALIZATION-V2`  
**File thực thi:** `FrontEnd/src/features/admin/reports/AdminReportsPage.tsx`  
**Kiểm thử tích hợp:** `BackEnd/tests/adminComplaintsLocalizationV2.test.js`  

---

### 1. Bảng chuẩn hóa Thuật ngữ & Trạng thái Khiếu nại (Complaints)

Giao diện cũ hiển thị kèm mã tiếng Anh trong ngoặc (ví dụ `Chờ xử lý (OPEN)`, `Đang xử lý (IN_REVIEW)`), nay đã được chuẩn hóa thành tiếng Việt 100% tự nhiên:

| Enum Backend (`status`) | Nhãn giao diện cũ | Nhãn giao diện mới chuẩn hóa | Màu sắc Badge | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- |
| `OPEN` | Chờ xử lý (OPEN) | **Chờ tiếp nhận** | Vàng hổ phách (`amber`) | Khiếu nại mới gửi từ học viên/giáo viên, chưa có Admin nhận xử lý |
| `IN_REVIEW` | Đang xử lý (IN_REVIEW) | **Đang xem xét** | Xanh dương (`sky`) | Admin đang kiểm tra thông tin, thu thập chứng cứ và trao đổi |
| `RESOLVED` | Đã giải quyết (RESOLVED) | **Đã giải quyết** | Xanh lục (`emerald`) | Khiếu nại đã có phương án xử lý dứt điểm (hoàn phí, giải thích...) |
| `REJECTED` | Từ chối (REJECTED) | **Đã từ chối** | Xám / Đỏ nhạt (`slate`) | Khiếu nại không hợp lệ, không đủ căn cứ xử lý |

#### Chuẩn hóa Danh mục Khiếu nại (`targetType` / `reason`):
- `COURSE`: Khóa học
- `CLASS`: Lớp học
- `SESSION`: Buổi học
- `USER`: Người dùng
- `OTHER`: Khác
- `SPAM`: Nội dung rác / Không phù hợp
- `HARASSMENT`: Quấy rối / Hành vi không chuẩn mực
- `TECHNICAL_ISSUE`: Lỗi kỹ thuật nền tảng
- `REFUND_REQUEST`: Đề nghị hoàn phí

---

### 2. Chuẩn hóa Báo cáo Sự cố Giảng dạy của Giáo viên (Teacher Incident Reports)

#### A. Phân loại sự cố (`incidentType`):
- `INTERNET_FAILURE`: **Sự cố kết nối Internet** (Sự cố mạng, đứt cáp quang, mất kết nối thiết bị giảng dạy)
- `POWER_OUTAGE`: **Mất điện đột xuất**
- `PLATFORM_TECHNICAL_ISSUE`: **Lỗi nền tảng kỹ thuật**
- `EMERGENCY`: **Trường hợp khẩn cấp cá nhân**
- `OTHER`: **Lý do khác**

#### B. Đề xuất của giáo viên (`requestedAction`) — Làm rõ bản chất `EXCUSE_LATE`:
- Trong schema Mongoose (`TeacherIncidentReport`), `requestedAction` quy định nguyện vọng của giáo viên khi báo cáo sự cố:
  - `EXCUSE_LATE`: **Xin miễn trừ vào muộn** (Giáo viên gặp sự cố mạng hoặc thiết bị nên vào trễ buổi học, làm đơn đề nghị Admin xem xét không tính lỗi vi phạm kỷ luật phòng học). Đây **không phải** là "Nộp giải trình muộn" (`LATE_SUBMISSION`).
  - `CANCEL_SESSION`: **Hủy buổi học**
  - `RESCHEDULE_SESSION`: **Dời lịch dạy / Học bù**
  - `EXCUSE_INTERRUPTION`: **Xin miễn trừ gián đoạn buổi học**

#### C. Trạng thái xét duyệt sự cố (`reviewStatus`):
- `PENDING`: **Chờ xét duyệt** (Huy hiệu cam cảnh báo)
- `APPROVED`: **Đã chấp thuận** (Huy hiệu xanh lá)
- `REJECTED`: **Đã từ chối** (Huy hiệu xám/đỏ)

---

### 3. Chuẩn hóa Vai trò Người dùng (User Roles)

Toàn bộ các thẻ người dùng, avatar và người gửi báo cáo đều được hiển thị nhãn tiếng Việt rõ ràng:
- `STUDENT`: **Học viên**
- `TEACHER`: **Giáo viên**
- `ADMIN`: **Quản trị viên**
- `SPONSOR`: **Nhà tài trợ**

---

### 4. Bảng kiểm tra Không lọt mã kỹ thuật ra UI
- Bộ lọc Tabs trạng thái khiếu nại: Đã bỏ toàn bộ các chuỗi `(OPEN)`, `(IN_REVIEW)`, `(RESOLVED)`, `(REJECTED)`.
- Modal Chi tiết khiếu nại & Modal Duyệt sự cố:
  - 100% tiêu đề, nhãn trường (Người gửi, Đối tượng bị báo cáo, Lý do, Nội dung giải trình, Quyết định xử lý) bằng tiếng Việt.
  - Mã Mongo ID dài 24 ký tự được rút gọn dạng `#...1234` kèm nút sao chép tiện lợi.
