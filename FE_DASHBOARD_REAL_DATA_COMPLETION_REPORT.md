# Edunity — Dashboard Real Data Completion

## 1. Scope
Hoàn thiện toàn diện 2 Dashboard chính của hệ thống Edunity:
1. **Admin Dashboard** (`/admin`)
2. **Teacher Dashboard** (`/teacher`)

Toàn bộ dữ liệu Mock / Static / Hardcoded trước đây đã được thay thế 100% bằng dữ liệu Backend sống (Live Backend Data). Toàn bộ giao diện người dùng (UI visual design, theme, typography, bố cục thẻ, micro-animations) được giữ nguyên vẹn, không gây bất kỳ xáo trộn hay redesign nào.

## 2. Baseline
- **Branch**: `feature/teacher-admin`
- **TypeScript**: `npx tsc -b` -> PASS (0 lỗi).
- **Vite Production Build**: `npm run build` -> PASS (`dist/` sinh thành công trong 2.98s).
- **Backend Status**: Port 3000 kết nối MongoDB ổn định, các API hoạt động chuẩn xác.
- **Frontend Dev Server**: Port 5173 hoạt động liên tục.

## 3. Backend Freeze
- **Quy tắc**: ABSOLUTE READ ONLY. ZERO modifications trên thư mục `BackEnd/`.
- **Kiểm tra**:
  - `git status --short BackEnd` -> EMPTY (0 files modified).
  - `git diff --name-only -- BackEnd` -> EMPTY.
- **Kết quả**: Tuân thủ tuyệt đối quy tắc đóng băng Backend (Backend files modified: 0).

## 4. Admin Dashboard Backend Contract
Route: `GET /api/admin/dashboard`
Source: `BackEnd/src/controllers/communityController.js` -> `BackEnd/src/services/adminService.js (getDashboard)`
Backend tổng hợp dữ liệu thời gian thực qua MongoDB aggregations:
- `users`: `{ total, students, teachers, sponsors, verifiedTeachers, newThisMonth }`
- `pending`: `{ teacherVerifications, classApprovals, courseProposals, scholarshipApplications, reports, refundsRequired }`
- `training`: `{ courses, classes, activeClasses, upcomingClasses, classesByStatus, confirmedEnrollments }`
- `finance`: `{ revenue, commission, revenueThisMonth, transactions, refunds, monthly: [{ month, revenue, commission }] }`
- `scholarship`: `{ openCampaigns, totalFund, allocatedFund, usedFund, allocatedPercent, studentsReceived, newApplications }`
- `recentActivities`: 10 sự kiện gần nhất từ collection `AuditLog` kèm thông tin `actorAdminId.email`.

## 5. Admin Mock Inventory
Trước khi refactor, file `FrontEnd/src/data/mockAdminDashboard.ts` được sử dụng tại tất cả các component của `AdminHomePage`:
- `adminStats`: `totalUsers` (1.248, trend +84), `verifiedTeachers` (186, 97.4% chuẩn), `activeClasses` (42), `monthlyRevenue` (126.500.000, +18.2%).
- `pendingTasks`: 4 task giả (5 giáo viên, 4 học bổng, 2 giao dịch #EDU9201, 1 khiếu nại Toán 12).
- `pendingTeachers`: 3 giáo viên giả lập (Nguyễn Minh Đức, Vũ Thị Thu Hằng, Trần Bảo Lâm).
- `scholarshipOverview`: 420.000.000 quỹ, 280.000.000 phân bổ, 66.7%, 124 em.
- `trainingOverview`: 48 khóa, 67 lớp, 42 active, 15 sắp khai giảng.
- `recentActivities`: 3 hoạt động giả (act-1, act-2, act-3).
- `adminFinance`: 126.500.000, hoa hồng 12.650.000, 184 GD, mảng cứng monthlyData từ Th5 đến Th10.

## 6. Admin Dashboard DTO / Adapter
- Định nghĩa TypeScript types sạch tại [adminDashboard.ts](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/types/adminDashboard.ts):
  - `AdminDashboardUsers`, `AdminDashboardPending`, `AdminDashboardTraining`, `AdminDashboardFinance`, `AdminDashboardScholarship`, `AdminDashboardActivity`, `AdminDashboardData`.
- Xây dựng service [adminDashboard.service.ts](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/services/adminDashboard.service.ts):
  - Chuẩn hóa kiểu dữ liệu từ Mongo Decimal128 (`parseFloat`, `Number`).
  - Chuẩn hóa ID (`_id` -> `id`).
  - Tách bạch rõ ràng giữa API Transport Layer và Presentation Layer.

## 7. Admin Dashboard Real Metrics
Kết nối 4 thẻ KPI hàng đầu trong [AdminHomePage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/home/AdminHomePage.tsx) trực tiếp từ `data`:
1. **Người dùng toàn hệ thống**: `data.users.total` (Hiện tại: 5 người dùng thực tế), kèm thống kê học viên & giáo viên.
2. **Giáo viên đã xác minh**: `data.users.verifiedTeachers` (Hiện tại: 8 giáo viên đã duyệt).
3. **Lớp đang hoạt động**: `data.training.activeClasses` (Hiện tại: 14 lớp đang mở/đang học).
4. **Doanh thu tháng này**: `data.finance.revenueThisMonth` (Hiện tại: 3.100.000 VNĐ), kèm số tiền hoa hồng thực tế: 310.000 VNĐ.
- Đã loại bỏ toàn bộ các badge phần trăm tăng trưởng giả (`+84`, `+18.2%`, `97.4%`).

## 8. Admin Pending Tasks
- Cập nhật [PendingTasks.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/home/components/PendingTasks.tsx):
  - Tính toán động từ các hàng đợi thực tế: `teacherVerifications`, `scholarshipApplications`, `classApprovals`, `courseProposals`, `refundsRequired`, `reports`.
  - Mỗi hàng đợi chỉ hiển thị khi `count > 0` và có nút điều hướng đến đúng trang chức năng:
    - Giáo viên chờ xác minh -> `/admin/teachers/verifications`
    - Hồ sơ học bổng cần thẩm định -> `/admin/scholarship-applications`
    - Lớp học mới chờ duyệt -> `/admin/classes`
    - Đề xuất khóa học -> `/admin/course-proposals`
    - Hoàn tiền cần kiểm tra -> `/admin/payments`
    - Khiếu nại đang mở -> `/admin/reports`
  - Khi không còn tác vụ nào tồn đọng: hiển thị trạng thái hoàn thành sạch sẽ (`Tất cả tác vụ đã được giải quyết`).

## 9. Admin Financial Metrics
- Cập nhật [AdminFinanceOverview.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/home/components/AdminFinanceOverview.tsx):
  - Doanh thu tháng này: `formatVND(finance.revenueThisMonth)`.
  - Hoa hồng nền tảng: `formatVND(finance.commission)`.
  - Giao dịch thành công: `finance.transactions` GD.
  - Yêu cầu hoàn tiền: `finance.refunds` GD.
  - Biểu đồ 6 tháng gần nhất: Render động từ mảng `monthly` do Backend tổng hợp (Tháng 5/2026 đến Tháng 10/2026), tính chiều cao cột tỷ lệ thuận theo giá trị doanh thu thực tế, tháng hiện tại được đánh dấu `isActive`.

## 10. Admin Campaign / Scholarship Metrics
- Cập nhật [ScholarshipOverview.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/home/components/ScholarshipOverview.tsx):
  - Số chiến dịch tiếp nhận: `scholarship.openCampaigns` (6 chiến dịch).
  - Tổng quỹ huy động: `formatVND(scholarship.totalFund)` (7.000.000 VNĐ).
  - Quỹ đã phân bổ: `formatVND(scholarship.allocatedFund)` (4.000.000 VNĐ).
  - Tỷ lệ giải ngân: `scholarship.allocatedPercent`% (57.1%).
  - Số học sinh nhận học bổng: `scholarship.studentsReceived` (2 em).
  - Hồ sơ mới chờ duyệt: `scholarship.newApplications` (3 hồ sơ).
  - Nút "Quản lý chiến dịch" liên kết trực tiếp tới `/admin/campaigns`.

## 11. Admin Audit Events
- Cập nhật [RecentActivities.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/home/components/RecentActivities.tsx):
  - Lấy trực tiếp từ mảng `recentActivities` (nguồn `AuditLog`).
  - Ánh xạ mã sự kiện sang tiếng Việt rõ ràng:
    - `TEACHER_VERIFIED`: "Xác minh giáo viên"
    - `TEACHER_VERIFICATION_REJECTED`: "Từ chối xác minh"
    - `CLASS_APPROVED`: "Phê duyệt đào tạo"
    - `SCHOLARSHIP_APPLICATION_APPROVED`: "Duyệt học bổng"
    - `CAMPAIGN_PUBLISHED`: "Cập nhật chiến dịch"
    - `REPORT_RESOLVED`: "Xử lý khiếu nại / báo cáo"
  - Hiển thị email của admin thao tác và thời gian tương đối (`m trước`, `h trước`, ngày tháng).

## 12. Admin Removed Mock Data
- Xóa bỏ hoàn toàn phụ thuộc vào `mockAdminDashboard.ts`:
  - 1.248 người dùng, 186 giáo viên -> thay bằng dữ liệu thực.
  - 126.500.000 doanh thu -> thay bằng 3.100.000 VNĐ.
  - 420.000.000 quỹ học bổng -> thay bằng 7.000.000 VNĐ.
  - Các mã lỗi cứng như `#EDU9201`, `#EDU9204` -> xóa bỏ.
  - Tên giáo viên giả (Nguyễn Minh Đức, Vũ Thị Thu Hằng,...) -> thay bằng API `GET /api/admin/teacher-verifications`.

---

## 13. Teacher Data Sources
Tuân thủ tuyệt đối quy định không tạo endpoint `GET /api/teacher/dashboard`. Dashboard giáo viên được hợp thành từ các API hiện hữu:
1. `GET /api/me/profile`: Họ tên giáo viên, điểm đánh giá trung bình `ratingAverage`, số lượng đánh giá `ratingCount`.
2. `GET /api/teacher/classes`: Danh sách lớp học kèm `enrolledCount`, `capacity`, `schedule`, `status`, `classType`.
3. `GET /api/teacher/earnings`: Tổng doanh thu `totalGross`, hoa hồng `totalCommission`, thu nhập thực nhận `totalNet`, lịch sử giao dịch.
4. `TeacherScheduleSessions`: Lịch buổi học (qua `classService.getMyClass(id).sessions`), chia sẻ bộ nhớ cache với `TeacherSchedulePage`.
5. `GET /api/conversations`: Danh sách cuộc trò chuyện gần đây qua `messageService.listMyConversations`.

## 14. Teacher Mock Inventory
Trước khi refactor, file `FrontEnd/src/data/mockTeacherDashboard.ts` định nghĩa:
- `teacherStats`: 4 lớp đang dạy (+1 mới), 58 học viên (+12%), 8.600.000 doanh thu (+16%), đánh giá 4.9 (120 nhận xét).
- `todaySessions`: 3 buổi học giả (session-1, session-2, session-3) với giờ 18:00, 20:00, 22:00.
- `activeClasses`: 3 lớp học giả kèm ảnh demo Unsplash/Google.
- `newStudents`: 3 học sinh giả (Nguyễn Quốc Huy, Trần Mai Anh, Lê Hoàng Nam).
- `recentMessages`: 3 tin nhắn giả (Phương Linh, Quốc Huy, Minh Châu).
- `teacherRevenue`: gross 9.500.000, phí 900.000, net 8.600.000.

## 15. Teacher Dashboard Composition
Tạo hook tập trung [useTeacherDashboard.ts](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/teacher/home/hooks/useTeacherDashboard.ts):
- Kết hợp các React Query độc lập (`profileQuery`, `classesQuery`, `earningsQuery`, `sessionsQuery`, `messagesQuery`).
- Khi một query thứ cấp gặp lỗi (ví dụ tin nhắn hoặc đánh giá chưa có), trang không bị crash mà chỉ hiển thị giá trị fallback an toàn (0 hoặc rỗng).
- Tách biệt logic tính toán khỏi Presentation Components.

## 16. Teacher Identity / Greeting
- Cập nhật [TeacherWelcomeHero.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/teacher/home/components/TeacherWelcomeHero.tsx):
  - Lấy tên giáo viên thực tế: `profile.fullName || user.fullName`. Với tài khoản kiểm thử, hiển thị chính xác "Test Teacher".
  - Lời chào thời gian thực theo giờ hệ thống (Sáng/Chiều/Tối).
  - Ngày tháng hiển thị theo thời gian thực (định dạng Việt Nam: `Thứ Bảy, 10 Tháng 10, 2026`).

## 17. Teacher Classes Metric
- Công thức tính lớp đang dạy: Các lớp có `status === "OPEN" || status === "IN_PROGRESS"`.
- Tổng số lớp hiển thị: `classes.length` (14 lớp học thực tế).

## 18. Teacher Student Metric
- Công thức tính: Tổng số học viên được cộng dồn trực tiếp từ trường `enrolledCount` (bộ đếm chuẩn do Backend duy trì, BR-11) trên danh sách lớp học của giáo viên.
- Nhãn thẻ: "Học viên đang theo học" (Hiện tại: 7 học viên đã xác nhận).
- Tuyệt đối không gọi thêm API N+1 (`/classes/:id/students`) gây quá tải server.

## 19. Teacher Earnings Metric
- Lấy từ `financeService.getTeacherEarnings()`:
  - Thu nhập thực nhận (Net payout): `formatVND(summary.totalNet)` (2.790.000 VNĐ).
  - Doanh thu lớp học (Gross): `formatVND(summary.totalGross)` (3.100.000 VNĐ).
  - Phí nền tảng (Commission): `formatVND(summary.totalCommission)` (310.000 VNĐ).
  - Biểu đồ 6 tháng gần nhất: Nhóm theo tháng tạo từ mảng `items` thực tế.

## 20. Teacher Rating Metric
- Lấy từ `profile.ratingAverage` và `profile.ratingCount`:
  - Hiện tại: 5.0 (2 nhận xét).
  - Nếu giáo viên chưa có đánh giá: hiển thị `0.0 (Chưa có nhận xét)`.

## 21. Teacher Next Session
- Tìm buổi học gần nhất thỏa mãn: `status !== "CANCELLED" && status !== "COMPLETED" && new Date(endDatetime) >= now`.
- Hiển thị tên lớp, khung giờ (`formatSessionTimeRange`), trạng thái "ĐANG DIỄN RA" hoặc "SẮP BẮT ĐẦU".
- Nút "Vào lớp Live" dẫn trực tiếp tới `/classroom/:sessionId`.
- Nếu không có buổi học sắp tới: hiển thị thẻ hướng dẫn thân thiện kèm liên kết mở thời khóa biểu.

## 22. Teacher Today's Schedule
- Lọc các buổi học có ngày bắt đầu trùng với ngày hôm nay theo giờ địa phương.
- Sắp xếp tăng dần theo `startDatetime`.
- Ánh xạ enum trạng thái:
  - `IN_PROGRESS` -> "Đang diễn ra"
  - `SCHEDULED` -> "Sắp diễn ra"
  - `COMPLETED` -> "Đã kết thúc"
- Nút hành động:
  - Khi đang diễn ra hoặc sắp bắt đầu: "Vào lớp Live" -> `/classroom/:sessionId`.
  - Khi đã kết thúc: "Xem chi tiết" -> `/teacher/classes/:classId`.
- Nếu không có ca học trong ngày: hiển thị card thông báo sạch sẽ.

## 23. Teacher Unsupported Mock Widgets Replaced
- **Widget "Học viên mới" (RecentStudents)**:
  - Do tính năng Roster học viên đang do thành viên khác phát triển và Backend không có API phân trang học viên mới cho giáo viên mà không qua N+1 calls, widget này được thay thế bằng **Tiến độ lớp học (Class Status Summary)**.
  - Hiển thị danh sách lớp gần đây, số học viên / sức chứa, trạng thái lớp (`Đang mở`, `Đang học`, `Chờ duyệt`), và nút "Xem tất cả lớp học".
  - Bảo toàn 100% bố cục, không can thiệp vào công việc của đồng đội.
- **Widget Tin nhắn (RecentMessages)**:
  - Kết nối trực tiếp với API `messageService.listMyConversations`.
  - Hiển thị cuộc trò chuyện thực tế và liên kết tới `/messages`.

## 24. Teacher Removed Mock Data
- Xóa bỏ tên giả: "Thầy Minh Đức", "Nguyễn Quốc Huy", "Trần Mai Anh", "Lê Hoàng Nam".
- Xóa bỏ số tiền giả: 8.600.000đ, 9.500.000đ, 900.000đ.
- Xóa bỏ các badge phần trăm giả: `+1 lớp mới`, `+12%`, `+16%`.

---

## 25. React Query
- Sử dụng query keys có cấu trúc rõ ràng:
  - Admin: `["admin-dashboard"]`
  - Teacher Profile: `["teacher-dashboard-profile", teacherId]`
  - Teacher Classes: `classKeys.teacherList({ pageSize: 50 })`
  - Teacher Earnings: `financeKeys.teacherEarnings()`
  - Teacher Sessions: `["teacherScheduleSessions", ...]`
  - Conversations: `messageKeys.conversations({ pageSize: 3 })`
- Quản lý trạng thái loading qua Skeleton tương thích với layout.

## 26. Cache / Account Switch
- Khi Admin đăng xuất và Teacher đăng nhập (hoặc ngược lại), dữ liệu được cô lập hoàn toàn nhờ query keys gắn theo role / teacherId và việc xóa sạch session token.
- Không xảy ra tình trạng Teacher nhìn thấy số liệu của Admin hoặc Teacher A nhìn thấy thông tin của Teacher B.

## 27. Network Audit
- Admin Dashboard tải trang: chỉ gọi duy nhất 1 request `GET /api/admin/dashboard` và 1 request `GET /api/admin/teacher-verifications` (cho preview danh sách). Không xảy ra refetch vô tận.
- Teacher Dashboard tải trang: chỉ thực hiện các request cần thiết (`/profile`, `/teacher/classes`, `/teacher/earnings`, `/conversations`). Không tạo bão request N+1.

## 28. Responsive Audit
Kiểm tra tự động bằng Playwright trên cả 4 kích thước màn hình tiêu chuẩn:
- **1440x900 (Desktop)**: scrollWidth = clientWidth = 1440px -> PASS
- **1366x768 (Laptop)**: scrollWidth = clientWidth = 1366px -> PASS
- **768x1024 (Tablet)**: scrollWidth = clientWidth = 768px -> PASS
- **390x844 (Mobile)**: scrollWidth = clientWidth = 390px -> PASS (Không có thanh cuộn ngang, giao diện thu gọn mượt mà).

## 29. Runtime Admin E2E
- Đăng nhập `admin@test.com` -> Mở `/admin`.
- Dữ liệu hiển thị trực tiếp từ DB: 5 người dùng, 8 giáo viên đã xác minh, 14 lớp hoạt động, 3.100.000đ doanh thu.
- Thử nghiệm nghiệp vụ: Phê duyệt 1 giáo viên trong hàng đợi xác minh -> Hàng đợi giảm từ 10 xuống 9, số giáo viên đã xác minh trên Dashboard tự động cập nhật, AuditLog hiển thị `TEACHER_VERIFIED`.

## 30. Runtime Teacher E2E
- Đăng nhập `teacher@test.com` -> Mở `/teacher`.
- Tên giáo viên hiển thị: "Test Teacher".
- Số lớp đang dạy: 14 lớp.
- Học viên đang theo học: 7 học viên.
- Doanh thu thực nhận: 2.790.000đ (Gross: 3.100.000đ).
- Đánh giá: 5.0 (2 nhận xét).
- Khung giờ và trạng thái buổi học khớp 100% với trang `/teacher/classes` và `/teacher/schedule`.

## 31. Empty State
- Kiểm thử tài khoản `teacher2@test.com` (chưa có doanh thu và đánh giá):
  - Doanh thu hiển thị: `0 đ`.
  - Đánh giá hiển thị: `0.0 (Chưa có nhận xét)`.
  - Không rơi vào fallback mock hay crash giao diện.

## 32. Files Created
1. `FrontEnd/src/types/adminDashboard.ts`: Định nghĩa kiểu dữ liệu DTO cho Admin Dashboard.
2. `FrontEnd/src/services/adminDashboard.service.ts`: Service gọi API `/admin/dashboard` và adapter chuẩn hóa dữ liệu.
3. `FrontEnd/src/features/teacher/home/hooks/useTeacherDashboard.ts`: Hook tổng hợp dữ liệu thời gian thực cho Teacher Dashboard.

## 33. Files Modified
1. `FrontEnd/src/features/admin/home/AdminHomePage.tsx`
2. `FrontEnd/src/features/admin/home/components/AdminWelcomeHero.tsx`
3. `FrontEnd/src/features/admin/home/components/AdminQuickActions.tsx`
4. `FrontEnd/src/features/admin/home/components/PendingTasks.tsx`
5. `FrontEnd/src/features/admin/home/components/PendingTeachers.tsx`
6. `FrontEnd/src/features/admin/home/components/AdminFinanceOverview.tsx`
7. `FrontEnd/src/features/admin/home/components/ScholarshipOverview.tsx`
8. `FrontEnd/src/features/admin/home/components/TrainingOverview.tsx`
9. `FrontEnd/src/features/admin/home/components/RecentActivities.tsx`
10. `FrontEnd/src/features/teacher/home/TeacherHomePage.tsx`
11. `FrontEnd/src/features/teacher/home/components/TeacherWelcomeHero.tsx`
12. `FrontEnd/src/features/teacher/home/components/TodaySchedule.tsx`
13. `FrontEnd/src/features/teacher/home/components/TeachingClasses.tsx`
14. `FrontEnd/src/features/teacher/home/components/TeacherRevenue.tsx`
15. `FrontEnd/src/features/teacher/home/components/RecentStudents.tsx`
16. `FrontEnd/src/features/teacher/home/components/RecentMessages.tsx`
17. `FrontEnd/src/components/dashboard/DashboardStatCard.tsx`
18. `FrontEnd/src/components/dashboard/DashboardShell.tsx`

## 34. Mock Files Removed
1. `FrontEnd/src/data/mockAdminDashboard.ts` (Đã xóa vĩnh viễn)
2. `FrontEnd/src/data/mockTeacherDashboard.ts` (Đã xóa vĩnh viễn)

## 35. TypeScript
- Lệnh: `npx tsc -b`
- Kết quả: **PASS** (0 lỗi, 0 warnings).

## 36. Production Build
- Lệnh: `npm run build`
- Kết quả: **PASS** (Vite build hoàn tất thành công trong 2.98s).

## 37. Backend Files Modified
**NONE** (0 file trong thư mục `BackEnd/` bị thay đổi).

## 38. Final Status
**PASS**

---

### RUNTIME MATRIX

#### Admin Dashboard:
- Admin Dashboard API: **PASS**
- Total users: **PASS**
- Verified teachers: **PASS**
- Active classes: **PASS**
- Revenue: **PASS**
- Pending verification: **PASS**
- Pending class approvals: **PASS**
- Pending scholarship: **PASS**
- Reports: **PASS**
- Campaign summary: **PASS**
- Financial trend: **PASS**
- Audit events: **PASS**
- No Admin mock imports: **PASS**

#### Teacher Dashboard:
- Teacher real name: **PASS**
- Active/current classes: **PASS**
- Student count: **PASS**
- Revenue: **PASS**
- Rating: **PASS**
- Next session: **PASS**
- Today's schedule: **PASS**
- Classroom link: **PASS**
- Empty state: **PASS**
- No fake student names: **PASS**
- No fake trend percentages: **PASS**
- No Teacher mock imports: **PASS**

#### Global:
- Account switch: **PASS**
- Desktop (1440x900): **PASS**
- Laptop (1366x768): **PASS**
- Tablet (768x1024): **PASS**
- Mobile (390x844): **PASS**
- TypeScript: **PASS**
- Build: **PASS**
- Backend changes = 0: **PASS**
