# 05 — Teacher Lateness, Early Leave & Brief-Presence Gaming Specification (TIN-05D / TIN-05E)

## 1. Teacher Start-Lateness Escalation
| Milestone | Condition | Action |
| :--- | :--- | :--- |
| `+10 minutes` | Teacher has not connected to teaching period by `startDatetime + 10m` | Records `YELLOW` warning (`TEACHER_LATE_10M`) on canonical `TeacherViolation`; notifies Teacher & Students once. |
| `+20 minutes` | Teacher has not connected by `startDatetime + 20m` | Escalates canonical `TeacherViolation` to `RED` (`TEACHER_LATE_20M`); notifies Teacher, Students & Admins once. |
| `+30 minutes` | Teacher has not connected by `startDatetime + 30m` | Escalates canonical `TeacherViolation` to `NO_SHOW` (`TEACHER_NO_SHOW_30M`); auto-cancels session (`status = CANCELLED`, `endReason = TEACHER_NO_SHOW`); marks students `NOT_EVALUATED`; opens `SessionRefundReview` records. |

## 2. Teacher Mid-Session Continuous Absence (`30 minutes`)
- If the teacher disconnects during `[startDatetime, endDatetime)`, `teacherPresence.currentAbsenceStartedAt` is recorded and the active LiveKit recording segment is stopped.
- If the teacher reconnects within `< 30 minutes`, `currentAbsenceStartedAt` is cleared, session remains `IN_PROGRESS`, and a new recording segment starts.
- If continuous absence reaches `>= 30 minutes`, session transitions to `status = INTERRUPTED` (`endReason = TEACHER_LEFT_EARLY`), a `TeacherViolation` (`EARLY_LEAVE` / `TEACHER_LEFT_EARLY_30M`) is recorded, student attendance is preserved, and `SessionRefundReview` records are opened.

## 3. Anti-Gaming: Brief Teacher Presence (`< 5 minutes`)
- If a teacher connects briefly (`scheduledOnlineSeconds < 300s`) and leaves to avoid a `NO_SHOW`, `finalizeSessionAttendance` flags `teacherPresence.briefPresenceFlaggedAt` and creates a `TeacherViolation` (`ABANDONMENT` / `TEACHER_BRIEF_PRESENCE`, severity `RED`).

