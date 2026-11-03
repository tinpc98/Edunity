# 12 — Frontend Classroom, Teacher & Admin Integration (TIN-05D + TIN-05E)

## 1. Classroom UI (`ClassroomPage.tsx`, `TeacherAttendanceModal.tsx`, `TeacherIncidentModal.tsx`)
- **Live Status Banner:** Polls `GET /api/sessions/:id/live-status` and displays:
  - Waiting room badge (`Phòng chờ mở sớm 10 phút — Thời gian chờ chưa tính vào điểm danh chính thức`),
  - Official teaching period badge (`Yêu cầu ≥ 70% thời lượng để tính Có mặt`),
  - Overtime grace period badge (`Đang trong 30 phút ân hạn trước khi tự động hoàn tất`),
  - Interrupted session banner (`Buổi học tạm gián đoạn do giảng viên mất kết nối quá 30 phút`),
  - Student live attendance progress (`Đã học: X phút (Y% / 70%)`), late arrival badge (`> 5p`), and reconnection badge (`Reconnected`).
- **Presence Telemetry:** Automatically invokes `POST /api/sessions/:id/presence/connect` upon entering the classroom and `POST /api/sessions/:id/presence/leave` when leaving.
- **First-Join Deadline Error Handling:** Clearly renders `JOIN_WINDOW_CLOSED` (`403`) when a student attempts first entry after minute 20.
- **Teacher Attendance Modal:** Shows each student's `attendancePercentage` progress bar, `scheduledOnlineSeconds` (minutes), and status tags (`PRESENT`, `LATE`, `ABSENT`, `EXCUSED`, `NOT_EVALUATED`).
- **Teacher Incident Modal:** Allows teachers to upload private evidence (`INCIDENT_EVIDENCE` via `POST /api/uploads/private`), select `incidentType` and `requestedAction`, and propose a makeup schedule.

## 2. Teacher Schedule Page (`TeacherSchedulePage.tsx`)
- Displays the **Smart Discipline & Reputation Summary Banner** (`Nhắc nhở Vàng: X/3`, `Vi phạm Đỏ: Y/1`, `Vắng không phép (NO_SHOW): Z/3`) and recent incident report statuses.
- Provides a `"Báo sự cố / Học bù"` action button on every session card.

## 3. Admin Reports & Smart Classroom Review Page (`AdminReportsPage.tsx`)
- Adds the `"Sự cố GV, Dạy bù & Kỷ luật (TIN-05D/E)"` tab allowing Admins to review `TeacherIncidentReport` (with signed private evidence links), approve/reject `SessionRescheduleRequest` (creating makeup sessions), and coordinate `SessionRefundReview` records with the Payment Team.

