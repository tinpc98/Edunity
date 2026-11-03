# 08 — Admin Incident and Violation Review Specification (TIN-05E)

## 1. Admin Review Endpoints
- `GET /api/admin/smart-classroom/overview`: Paginated incident reports + latest teacher violations, discipline cases, reschedule requests, and refund reviews.
- `POST /api/admin/incident-reports/:id/review`: Review incident report (`APPROVED` | `REJECTED` | `NEEDS_MORE_EVIDENCE`).
- `POST /api/admin/teacher-violations/:id/review`: Directly confirm, waive, or downgrade a `TeacherViolation` (`CONFIRMED` | `WAIVED` | `DOWNGRADED`).
- `POST /api/admin/discipline-cases/:id/review`: Resolve a `TeacherDisciplineCase` (`RESOLVED_APPROVED` | `RESOLVED_WAIVED` | `NEEDS_POLICY_CONFIGURATION`).

## 2. Review Effects & Audit Trail
- **When Admin Approves an Incident Report (`APPROVED`):**
  - Linked `TeacherViolation` is marked `WAIVED` (`countsTowardDiscipline = false`) or `DOWNGRADED` to `YELLOW` if specified.
  - If `requestedAction === "CANCEL_SESSION"`, the session is marked `CANCELLED` (`endReason = "INCIDENT_CANCELLED"`), student attendances become `EXCUSED`, and `SessionRefundReview` records are opened if no makeup session is scheduled.
  - If a linked `SessionRescheduleRequest` is pending, Admin approval automatically approves and creates the linked makeup `Session`.
- **When Admin Rejects an Incident Report (`REJECTED`):**
  - Linked `TeacherViolation` is marked `CONFIRMED` (`countsTowardDiscipline = true`) and `evaluateTeacherDiscipline` is triggered.
- **Audit Logging:** Every submission, appeal, and Admin decision writes an immutable `AuditLog` record with `actorId`, `action`, `targetType`, `targetId`, `reason`, and `metadata`.

