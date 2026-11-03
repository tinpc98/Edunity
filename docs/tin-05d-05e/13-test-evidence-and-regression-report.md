# 13 — Test Evidence and Regression Report (TIN-05D + TIN-05E)

## 1. New Automated Test Suite (`BackEnd/tests/smartClassroomAndIncidents.test.js`)
- **A. Pre-open Waiting Room & Official Start Window (`A1–A4`):**
  - Rejects join 11 minutes early (`409 SESSION_NOT_JOINABLE`).
  - Opens waiting room 10 minutes early (`200 OK`, `roomState = "WAITING"`, `status = "SCHEDULED"`) without starting LiveKit recording.
  - Excludes waiting room time (`waitingRoomSeconds`) from official `scheduledOnlineSeconds` and `attendancePercentage`.
- **B. Student Late (5m) and First-Join Cutoff (20m) (`B1–B7`):**
  - `<= 5m00s` (`300s`) -> `PRESENT`; `> 5m00s` -> `LATE`.
  - First join at minute 19 & 20 -> allowed (`200 OK`); first join at minute 21 -> rejected (`403 JOIN_WINDOW_CLOSED`).
  - Token issued at minute 15 without room connection expires at `startDatetime + 20m` (`firstJoinDeadlineAt`) and cannot be used after minute 20.
- **C. Verified Student Reconnection (`C1–C3`):**
  - Student with verified connection before minute 20 can reconnect after minute 20 (`200 OK`, `isReconnect: true`).
  - Forged client flags (`{ hasJoined: true, isReconnect: true }`) without DB-verified prior join are rejected (`403 JOIN_WINDOW_CLOSED`).
- **D. Real-Time Attendance Duration Formula (120-Minute Session) (`D1–D6`):**
  - 84 minutes (`70%`) -> `PRESENT`.
  - Joined at `+8m` (`> 5m`), stayed 90 minutes (`75%`) -> `LATE`.
  - Joined at `+2m`, left after 30 minutes (`25%`) -> `ABSENT`.
  - Multi-interval disconnect & reconnect (`40m + 46m = 86m = 71.67%`) -> `PRESENT`.
  - Multi-interval `< 70%` (`70m = 58.33%`) -> `ABSENT`.
  - Duplicate concurrent browser tabs (`19:00..19:50` + `19:05..19:50`) merged to `50m` (`41.67%`), never double-counted.
- **E. Teacher Lateness Escalation & Auto-Cancellation (`E1–E5`):**
  - `+9m` -> `0` warnings; `+10m` -> `YELLOW` warning; `+20m` -> escalated to `RED`; `+30m` -> escalated to `NO_SHOW` + session `CANCELLED` (`TEACHER_NO_SHOW`), students `NOT_EVALUATED`, `SessionRefundReview` opened.
  - Repeated scheduler executions produce `0` duplicate violations and `0` duplicate notifications.
- **F. Teacher Early Leave (30m Absence) & Brief-Presence Gaming (`F1–F3`):**
  - `< 30m` absence allows teacher reconnect; `>= 30m` continuous absence transitions session to `INTERRUPTED` (`TEACHER_LEFT_EARLY`) and records `EARLY_LEAVE` violation.
  - Brief presence `< 5m` (`60s`) is flagged with `TEACHER_BRIEF_PRESENCE` violation.
- **G & H. Teacher Incident Reporting, Admin Review & Discipline Thresholds (`G1–G4`, `H1–H4`):**
  - Private evidence (`INCIDENT_EVIDENCE`) uploaded and verified via `assertOwnedKeys`.
  - Unauthorized teacher rejected (`403 FORBIDDEN`).
  - Approved incident report waives violation (`WAIVED`, `countsTowardDiscipline = false`).
  - `3 CONFIRMED YELLOW`, `1 CONFIRMED RED`, and `3 CONFIRMED NO_SHOW` open `TeacherDisciplineCase` records with `autoExecutionBlocked = true`.
- **I. Rescheduling, Conflict Detection & Safe Refund Boundary (`I1–I4`):**
  - Schedule conflicts (`409 TEACHER_SCHEDULE_CONFLICT`) and duplicate requests (`409 DUPLICATE_RESCHEDULE_REQUEST`) rejected.
  - Approved reschedule creates linked makeup `Session` (`isMakeupSession = true`) while preserving original `Session` and attendance.
  - Student declining makeup session (`CANNOT_ATTEND`) opens `SessionRefundReview` (`RESCHEDULE_DECLINED_BY_STUDENT`, `NEEDS_FINANCIAL_REVIEW`) without mutating `Payment` or `TeacherEarning`.
- **J. Overtime Grace Period & Safe Auto-Completion (`J1–J2`):**
  - `endDatetime < now <= endDatetime + 30m` -> `roomState = "GRACE_PERIOD"` + teacher overtime reminder.
  - `now > endDatetime + 30m` -> `status = "COMPLETED"`, `lifecycleState = "AUTO_COMPLETED"`, `endReason = "AUTO_COMPLETED"`, attendance finalized.

## 2. Full Backend & Frontend Verification
- **Backend Jest Regression:** `14/14` test suites PASS (`344/344` tests PASS, `0` failures).
- **Frontend TypeScript & Production Build:** `tsc -b && vite build` PASS (`0` errors, built in `6.69s`).

