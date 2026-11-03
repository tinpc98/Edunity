# 09 — Session Rescheduling and Refund Coordination Specification (TIN-05E)

## 1. Rescheduling Architecture (`SessionRescheduleRequest`)
- Teachers can submit a reschedule request via `POST /api/teacher/sessions/:id/reschedule-requests` or via `TeacherIncidentReport` (`requestedAction = "RESCHEDULE_SESSION"`).
- **Conflict Prevention (`assertNoScheduleConflict`):** Rejects proposed schedules that overlap any non-cancelled session of the same teacher (`409 TEACHER_SCHEDULE_CONFLICT`) or the same class (`409 CLASS_SCHEDULE_CONFLICT`).
- **Duplicate Prevention:** Partial unique index `{ originalSessionId: 1 }` for `status in ["PENDING_ADMIN_APPROVAL", "APPROVED"]` prevents duplicate active reschedule requests (`409 DUPLICATE_RESCHEDULE_REQUEST`).
- **Original History Preservation:** When Admin approves a reschedule request (`POST /api/admin/reschedule-requests/:id/review`), a new makeup `Session` is created (`rescheduleMetadata.rescheduledFromSessionId = originalSession._id`, `isMakeupSession = true`), while the original `Session` (`lifecycleState = "RESCHEDULED"`, `rescheduleMetadata.rescheduledToSessionId = makeupSession._id`), its `SessionAttendance` records, `SessionPresenceInterval` logs, and `recordingSegments` are preserved intact.

## 2. Student Confirmation & Safe Refund Boundary (`SessionRefundReview`)
- Enrolled students can respond to an approved makeup schedule via `POST /api/student/reschedule-requests/:id/respond` (`ACCEPTED` | `CANNOT_ATTEND`).
- When a session is cancelled due to `TEACHER_NO_SHOW`, `TEACHER_LEFT_EARLY`, `INCIDENT_CANCELLED_NO_MAKEUP`, or when a student responds `CANNOT_ATTEND` (`RESCHEDULE_DECLINED_BY_STUDENT`), `createSafeRefundReviewsForSession` upserts a `SessionRefundReview` record per `(sessionId, enrollmentId)` with `status = "NEEDS_FINANCIAL_REVIEW"` and `earningReconciliationStatus = "HOLD_RECOMMENDED"`.
- If a makeup session is subsequently approved, pending `SessionRefundReview` records for the original session transition to `RESCHEDULED_WAIVED` (`CLEARED_AFTER_MAKEUP`).
- **Cross-Team Safety:** `SessionRefundReview` never directly mutates Châu's `Payment`, `Transaction`, or `TeacherEarning` collections, preventing unapproved gateway refunds or broken course-level financial invariants.

