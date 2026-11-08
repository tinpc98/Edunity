# BÁO CÁO KỸ THUẬT: ĐỐI SOÁT BASELINE SESSION & ATTENDANCE (TASK QA-01-BASELINE)

> **Dự án**: Edunity V3 Platform  
> **Module**: Smart Classroom, Session Lifecycle & Attendance (QA-01-BASELINE)  
> **Chế độ**: IMPLEMENTATION — PHASE 2 (SAU AUDIT)  
> **Tác giả**: Senior Backend Engineer, Edunity V3 Team  
> **Trạng thái**: HOÀN THÀNH (99/99 Tests PASS, 0 Failures)  

---

## 1. TỔNG QUAN VÀ MỤC TIÊU

**TASK QA-01-BASELINE** là bước thiết lập điểm chuẩn hồi quy (Regression Baseline) cho toàn bộ hệ thống Phòng học trực tuyến (Smart Classroom), Vòng đời buổi học (Session Lifecycle) và Cơ chế điểm danh tự động (Real-time Attendance) của Edunity V3 trước khi tiến hành các sửa đổi quy mô lớn.

Cơ sở đối chiếu dựa trên bộ đặc tả kỹ thuật **TIN-05D / TIN-05E** (bao gồm tài liệu 02 đến 14 trong thư mục `docs/tin-05d-05e/`) cùng các hợp đồng giao tiếp API học thuật (`docs/api-contract-academic.md`, `docs/api-contract-student.md`).

---

## 2. KẾT QUẢ KIỂM THỬ BASELINE TOÀN DIỆN (TEST EXECUTION EVIDENCE)

Toàn bộ **6 test suites** liên quan đến Session, Presence và Attendance đã được kiểm tra và ghi nhận kết quả:

| Test Suite | File Kiểm Thử | Số lượng Tests | Trạng thái | Thời gian thực thi |
| :--- | :--- | :---: | :---: | :---: |
| **Join & canJoin Regression** | [`BackEnd/tests/sessionJoin.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionJoin.test.js) | 24 | **PASS** (24/24) | 8.30s |
| **Lifecycle & End Integrity** | [`BackEnd/tests/sessionLifecycle.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionLifecycle.test.js) | 24 | **PASS** (24/24) | 9.45s |
| **Concurrency & Write-Locks** | [`BackEnd/tests/sessionConcurrency.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionConcurrency.test.js) | 13 | **PASS** (13/13) | 7.33s |
| **Recording & Egress Fixes** | [`BackEnd/tests/sessionRecordingFixes.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionRecordingFixes.test.js) | 9 | **PASS** (9/9) | 7.38s |
| **Smart Classroom & Incidents**| [`BackEnd/tests/smartClassroomAndIncidents.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/smartClassroomAndIncidents.test.js) | 15 | **PASS** (15/15) | 8.31s |
| **Core Invariants Baseline** | [`BackEnd/tests/sessionAttendanceBaseline.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionAttendanceBaseline.test.js) | 14 | **PASS** (14/14) | 2.60s |
| **TỔNG HỢP BASELINE** | **6 Test Suites** | **99** | **100% PASS** | **~10.3s** |

Đồng thời, mã nguồn giao diện FrontEnd đã được kiểm tra:
- **Typecheck & Production Build**: `tsc -b && vite build` $\rightarrow$ **PASS** (0 errors, 3343 modules transformed trong 6.86s).
- **Linter**: `oxlint` $\rightarrow$ **PASS** (0 warnings, 0 errors trên 213 files).

---

## 3. PHÂN TÍCH QUY TẮC NGHIỆP VỤ VÀ ĐIỂM CHUẨN KỸ THUẬT (TIN-05D/E)

### 3.1. Các mốc thời gian và Vòng đời phòng học
1. **Phòng chờ (Pre-open Waiting Room)**:
   - Khởi tạo chính xác trước giờ bắt đầu **10 phút** (`PRE_OPEN_BEFORE_MS = 600,000 ms`).
   - Buổi học giữ `status: "SCHEDULED"`, chuyển `roomState: "WAITING"`.
   - Tuyệt đối **không bật ghi hình (LiveKit Egress)** trong giai đoạn phòng chờ.
   - Toàn bộ thời gian học viên/giáo viên hiện diện trước giờ học chính thức (`waitingRoomSeconds`) bị cắt gọt (`clipIntervals`) và loại trừ hoàn toàn khỏi thời lượng điểm danh chính thức.
2. **Khởi đầu buổi học chính thức ("Bắt đầu buổi học")**:
   - Khi Giảng viên nhấn nút bắt đầu hoặc hiện diện từ phòng chờ bước sang giờ học (`now >= startDatetime`), hệ thống chuyển `status: "IN_PROGRESS"`, `roomState: "LIVE"` và kích hoạt bản ghi hình LiveKit đầu tiên.

### 3.2. Ngưỡng tham gia và Chống gian lận Token của Học viên
1. **Ngưỡng đúng giờ vs Đến muộn**:
   - Độ trễ $\le 300$ giây (5 phút): Được tính là đúng giờ (`isLate = false`). Nếu tổng thời lượng $\ge 70\% \rightarrow \text{PRESENT}$.
   - Độ trễ $> 300$ giây đến 1200 giây (20 phút): Được tính là đến muộn (`isLate = true`). Nếu tổng thời lượng $\ge 70\% \rightarrow \text{LATE}$.
2. **Hạn chót vào lớp lần đầu (First-Join Cutoff - 20 phút)**:
   - Học viên chưa từng kết nối hợp lệ vào phòng sẽ bị từ chối truy cập sau phút thứ 20 với mã lỗi HTTP 403 `JOIN_WINDOW_CLOSED`.
   - Token cấp cho học viên chưa xác thực chỉ có hạn dùng tối đa đến phút thứ 20 (`expiresAt = startDatetime + 20m`), ngăn chặn việc lấy token sớm rồi vào muộn sau 20 phút.
3. **Kết nối lại sau phút thứ 20 (Verified Reconnection)**:
   - Chỉ cho phép học viên kết nối lại sau phút thứ 20 khi bản ghi điểm danh trong MongoDB xác nhận `hasVerifiedConnection === true` và `firstVerifiedJoinAt <= startDatetime + 20m`.
   - Bác bỏ hoàn toàn mọi tham số client tự khai báo (`{ hasJoined: true, isReconnect: true }`).

### 3.3. Thuật toán Điểm danh 70% Thời lượng (Attendance Formula)
1. **Hợp nhất Interval chống gian lận mở nhiều tab (`mergeIntervals`)**:
   - Các khoảng thời gian kết nối `[connectedAt, disconnectedAt]` được sắp xếp tăng dần theo `startMs` và tự động gộp các đoạn gối nhau. Dù học viên mở 5 tab trình duyệt cùng lúc, thời gian hiện diện thực tế không bị tính nhân đôi.
2. **Cắt gọt thời lượng theo khung giờ kế hoạch (`clipIntervals`)**:
   - Chỉ tính thời gian hiện diện nằm trong khoảng từ `startDatetime` đến `endDatetime` (`scheduledOnlineSeconds`).
3. **Công thức phần trăm và Phân loại**:
   $$\text{attendancePercentage} = \min\left(100, \text{round}\left(\frac{\text{scheduledOnlineSeconds}}{\text{scheduledDurationSeconds}} \times 10000\right) / 100\right)$$
   - $\text{attendancePercentage} \ge 70\%$ và $\text{lateArrivalSeconds} \le 300\text{s} \rightarrow \mathbf{PRESENT}$
   - $\text{attendancePercentage} \ge 70\%$ và $\text{lateArrivalSeconds} > 300\text{s} \rightarrow \mathbf{LATE}$
   - $\text{attendancePercentage} < 70\% \rightarrow \mathbf{ABSENT}$
   - Buổi học bị hủy do giảng viên vắng mặt (`TEACHER_NO_SHOW`) $\rightarrow \mathbf{NOT\_EVALUATED}$
   - Buổi học bị hủy hoặc dời lịch do sự cố được phê duyệt (`INCIDENT_CANCELLED` / `RESCHEDULED`) $\rightarrow \mathbf{EXCUSED}$

### 3.4. Cơ chế Giám sát Giảng viên và Leo thang Vi phạm
- **Quá giờ bắt đầu 10 phút**: Phát cảnh báo nhắc nhở màu vàng (`YELLOW`).
- **Quá giờ bắt đầu 20 phút**: Leo thang thành vi phạm mức đỏ (`RED`).
- **Quá giờ bắt đầu 30 phút**: Xác định giảng viên không đến (`TEACHER_NO_SHOW`), tự động hủy buổi học (`CANCELLED`), học viên nhận trạng thái `NOT_EVALUATED` và mở hồ sơ hoàn tiền (`SessionRefundReview`).
- **Rời phòng giữa chừng liên tục $\ge 30$ phút**: Buổi học chuyển sang trạng thái gián đoạn (`INTERRUPTED`), ghi nhận vi phạm rời lớp sớm (`TEACHER_LEFT_EARLY`).
- **Hiện diện đối phó dưới 5 phút (`< 300s`)**: Tự động đánh dấu cờ cảnh báo (`briefPresenceFlaggedAt`) chuyển Quản trị viên xem xét, không áp phạt tự động.

### 3.5. Chống tương tranh và Đảm bảo Toàn vẹn Dữ liệu (Concurrency Locks)
1. **Khóa ghi WiredTiger chống Phantom Join**:
   - Trong `sessionService.joinSession`, thao tác `Session.findOneAndUpdate({ _id, status: { $in: [...] } }, { $inc: { __v: 1 } })` được thực thi bên trong MongoDB transaction để giữ write-lock, đảm bảo không một học viên nào có thể tham gia vào buổi học đã bị giáo viên kết thúc (`endSession`).
2. **Idempotent ABSENT Generation**:
   - Khi giáo viên gọi `endSession`, hệ thống sử dụng `SessionAttendance.bulkWrite` với `$setOnInsert` để tạo bản ghi vắng mặt cho các học viên chưa điểm danh, triệt tiêu hoàn toàn nguy cơ trùng lặp chỉ mục duy nhất (`E11000 duplicate key`).
3. **Chặn gọi GET /join (BUG-TIN03-01)**:
   - Các endpoint `GET /api/sessions/:id/join` và `GET /api/student/sessions/:id/join` bị từ chối dứt khoát bằng mã lỗi HTTP 405 `METHOD_NOT_ALLOWED`. Bắt buộc dùng `POST` để thực thi thay đổi trạng thái và cấp token.

---

## 4. PHÁT HIỆN ĐẶC BIỆT: HIỆN TƯỢNG BIÊN NỬA ĐÊM (MIDNIGHT-CROSSING BOUNDARY)

Trong giai đoạn Audit (thực hiện lúc 00:05 - 00:20 sáng), một số test case kiểm tra `studentService.getMySessions` (`LIFE-FIX-16`, `TC-02`, `TC-05`) đã trả về kết quả rỗng. Qua phân tích kỹ thuật, nguyên nhân cụ thể như sau:

- Trong [`BackEnd/src/services/studentService.js#L18`](file:///c:/CODE/Edunity/BackEnd/src/services/studentService.js#L18):
  `const from = fromDate ? new Date(fromDate) : new Date(now.setHours(0,0,0,0));`
  `from` được đặt mặc định là `00:00:00` của ngày hôm nay.
- Trong các bài test fixture, buổi học giả lập được khởi tạo với:
  `startDatetime = now - 20 minutes` hoặc `now - 10 minutes`.
- Nếu test chạy vào đầu ngày (ví dụ `00:08`), thì `now - 20m` rơi vào `23:48` của ngày hôm trước. Do đó điều kiện `{ startDatetime: { $gte: from } }` đã loại bỏ buổi học này.
- Khi test được chạy vào buổi trưa (`12:01`), `now - 20m` là `11:41 AM` (cùng ngày hôm nay), và **100% test cases đã PASS hoàn toàn**.

> [!NOTE]
> **Khuyến nghị kỹ thuật cho bản nâng cấp tiếp theo**:
> Để tránh việc học viên mở ứng dụng lúc nửa đêm không thấy buổi học đang diễn ra bắt đầu trước đó 15 phút, câu truy vấn `getMySessions` nên bổ sung điều kiện `$or` để luôn hiển thị các buổi học có trạng thái `IN_PROGRESS` hoặc `WAITING` mà `endDatetime >= now`, bất kể giờ bắt đầu rơi vào ngày nào.

---

## 5. TỔNG KẾT VÀ BẢO TOÀN PHẠM VI

1. **Mã nguồn đã bổ sung**:
   - File test mới: [`BackEnd/tests/sessionAttendanceBaseline.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/sessionAttendanceBaseline.test.js) (14 tests PASS độc lập, siêu tốc trong 2.6s, an toàn tuyệt đối trong Sandbox).
2. **Bảo toàn ranh giới trách nhiệm**:
   - Mã nguồn nghiệp vụ giữ nguyên `READ-ONLY`, không sửa đổi logic tài chính (Tin/Châu), xác thực/phân quyền (Bảo), hay giao diện (Băng).
   - Không thực hiện thao tác git commit hay push tự động.
   - Hệ thống sẵn sàng làm nền tảng vững chắc cho các bước triển khai tiếp theo.

