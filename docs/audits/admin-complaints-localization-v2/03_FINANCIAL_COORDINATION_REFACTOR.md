# EDUNITY V3 — ADMIN COMPLAINTS & INCIDENTS AUDIT
## Tài liệu 03: Tái cấu trúc Khối Rà soát Tài chính & Nút Hành động Điều phối

**Mã tác vụ:** `EDUNITY-ADMIN-COMPLAINTS-LOCALIZATION-V2`  
**File thực thi:** `FrontEnd/src/features/admin/reports/AdminReportsPage.tsx`  
**Kiểm thử tích hợp:** `BackEnd/tests/adminComplaintsLocalizationV2.test.js`  

---

### 1. Phân tích Hiện trạng Khối "Châu Payment Coordination"

#### A. Bản chất chuỗi "Châu Payment Coordination"
- **Kiểm tra mã nguồn:** Tìm kiếm trong toàn bộ backend models, routes, controllers không tồn tại bất kỳ thuộc tính hay trường dữ liệu nào mang tên `chauPaymentCoordination`.
- **Kết luận:** Đây là **chuỗi văn bản tĩnh (hardcoded string)** do lập trình viên đặt tạm trong JSX tại `AdminReportsPage.tsx` nhằm đánh dấu luồng bàn giao công việc giữa các thành viên.
- **Xử lý:** Đã gỡ bỏ 100% cụm từ "Châu Payment Coordination" khỏi toàn bộ giao diện và mã nguồn.

#### B. Nguồn gốc con số tĩnh "50"
- **Kiểm tra backend:** Tại `BackEnd/src/services/sessionIncidentService.js`:
  ```javascript
  const refundReviews = await SessionRefundReview.find({})
    .populate('sessionId classId teacherId')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  ```
- Backend chỉ giới hạn lấy tối đa 50 bản ghi gần nhất (`limit(50)`), trong khi bảng `SessionRefundReview` trong cơ sở dữ liệu thực tế có 582 hồ sơ.
- **Xử lý:** 
  - Đổi tiêu đề thẻ thành: **"Rà soát học phí và thù lao"**.
  - Badge đếm số lượng được hiển thị động theo danh sách tải về: `smartOverview?.refundReviews?.length || 0` (thay vì chuỗi cố định `(50)` trong tiêu đề).

---

### 2. Chuẩn hóa Trạng thái & Lý do Rà soát Tài chính

Khối Rà soát học phí và thù lao (`SessionRefundReview`) được chuẩn hóa toàn bộ các mã kỹ thuật sang tiếng Việt:

| Mã Enum Backend | Nhãn cũ | Nhãn mới chuẩn hóa | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `NEEDS_FINANCIAL_REVIEW` | Needs Financial Review | **Cần rà soát tài chính** | Buổi học phát sinh sự cố, cần kiểm tra ảnh hưởng đến học phí và thù lao giảng dạy |
| `TEACHER_NO_SHOW` | Teacher No Show | **Giáo viên vắng mặt** | Giáo viên không vào lớp theo lịch quy định |
| `SESSION_CANCELLED` | Session Cancelled | **Buổi học bị hủy** | Lớp học bị hủy do sự cố bất khả kháng |
| `TECHNICAL_FAILURE` | Technical Failure | **Lỗi kỹ thuật hệ thống** | Hệ thống phòng học trực tuyến gặp sự cố gián đoạn |
| `STUDENT_ABSENT` | Student Absent | **Học viên vắng mặt** | Học viên không tham gia lớp |
| `RESOLVED_MAKEUP` | Resolved Makeup | **Đã học bù** | Lớp đã được tổ chức học bù thành công |
| `RESOLVED_REFUNDED` | Resolved Refunded | **Đã hoàn tiền** | Đã tiến hành hoàn học phí cho học viên |
| `REJECTED` | Rejected | **Đã từ chối rà soát** | Hồ sơ rà soát không đủ căn cứ xử lý |

---

### 3. Chuẩn hóa Nút Hành động (Action Buttons)

Đổi tên các nút thao tác mang tính kỹ thuật/nội bộ sang thuật ngữ tác vụ quản trị chuyên nghiệp:
- **Nút "Chuyển Payment Team"** $\rightarrow$ **"Chuyển kiểm tra tài chính"**: Hành động chuyển hồ sơ sự cố sang hàng đợi rà soát tài chính để kiểm tra khấu trừ thù lao hoặc tính toán quyền lợi hoàn học phí.
- **Nút "Đã học bù"** $\rightarrow$ **"Xác nhận đã học bù"**: Hành động xác nhận buổi học đã được hoàn thành qua lịch học bù, không yêu cầu hoàn tiền hay xử phạt.

---

### 4. Cam kết Tính Bất biến & An toàn Tài chính
- **Không can thiệp logic backend:** Giữ nguyên 100% logic API của `dispatchIncidentToRefundReview` và `confirmMakeupDone`.
- **Dữ liệu tài chính nguyên vẹn:** Toàn bộ đơn hàng mẫu (`Order 100000008`, `Order 100000009`), các hồ sơ đối soát `Reconciliation`, và lịch sử `Payout` được bảo toàn toàn vẹn, không phát sinh bất kỳ thay đổi trạng thái trái phép nào.
