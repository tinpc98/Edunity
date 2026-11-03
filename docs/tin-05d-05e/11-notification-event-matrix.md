# 11 — Notification Event Matrix (TIN-05D + TIN-05E)

## 1. Deduplicated Notification Architecture
- `Notification` includes `sessionId`, `dedupeKey`, `deliveryStatus`, `retryCount`, and `lastError`, with a partial unique index `{ userId: 1, dedupeKey: 1 }`.
- `notificationService.notifyOnce` and `notifyAdminsOnce` use atomic upsert on `{ userId, dedupeKey }` so repeated scheduler runs or webhook retries never spam duplicate notifications.
- Notification failures are caught and logged without breaking the main classroom, attendance, or review transaction.

## 2. Event Matrix
| Event / Milestone | Type | Recipients | Dedupe Key Pattern |
| :--- | :--- | :--- | :--- |
| Teacher late +10m | `TEACHER_WARNING_YELLOW` / `SESSION_TEACHER_LATE_10M` | Teacher, Enrolled Students | `session:<id>:teacher:late_10m` / `session:<id>:student:<uid>:late_10m` |
| Teacher late +20m | `TEACHER_VIOLATION_RED` / `ADMIN_TEACHER_LATE_20M` / `SESSION_TEACHER_LATE_20M` | Teacher, Admins, Enrolled Students | `session:<id>:teacher:late_20m` |
| Teacher No-Show +30m | `TEACHER_NO_SHOW_CANCELLED` / `ADMIN_TEACHER_NO_SHOW` / `SESSION_CANCELLED_TEACHER_NO_SHOW` | Teacher, Admins, Enrolled Students | `session:<id>:teacher:no_show_30m` |
| Teacher Left Early 30m | `TEACHER_LEFT_EARLY_30M` / `ADMIN_TEACHER_LEFT_EARLY` / `SESSION_INTERRUPTED_TEACHER_ABSENT` | Teacher, Admins, Enrolled Students | `session:<id>:teacher:left_early_30m` |
| Teacher Overtime Reminder | `TEACHER_OVERTIME_REMINDER` | Teacher | `session:<id>:teacher:overtime_reminder` |
| Session Auto-Completed | `SESSION_AUTO_COMPLETED` | Teacher | `session:<id>:teacher:auto_completed` |
| Incident Report Submitted | `TEACHER_INCIDENT_REPORT_SUBMITTED` | Admins | `incident:submitted:<reportId>` |
| Incident Report Reviewed | `INCIDENT_REPORT_APPROVED` / `INCIDENT_REPORT_REJECTED` / `INCIDENT_REPORT_NEEDS_EVIDENCE` | Teacher | `incident:<decision>:<reportId>:<seq>` |
| Reschedule Approved | `RESCHEDULE_APPROVED` / `SESSION_RESCHEDULED` | Teacher, Enrolled Students | `reschedule:approved:<reqId>:<uid>` |
| Discipline Case Opened | `TEACHER_DISCIPLINE_CASE` / `ADMIN_DISCIPLINE_CASE_OPENED` | Teacher, Admins | `teacher:<tid>:discipline:<rule>:<count>` |
| Refund Review Created | `SESSION_REFUND_REVIEW_CREATED` | Admins | `session:<id>:refund_review:<reason>` |

