# 06 — Teacher Reputation and Discipline Policy (TIN-05E)

## 1. Canonical Violation Deduplication (`TeacherViolation`)
- Unique index `{ sessionId: 1, teacherId: 1, violationCategory: 1 }` ensures a single late/no-show session produces **at most 1** `START_LATENESS` violation record, storing the highest severity reached (`YELLOW` -> `RED` -> `NO_SHOW`) and full `escalationHistory`.
- Violations start in `PENDING_INCIDENT_WINDOW` for 24 hours after `endDatetime` so the teacher can submit an incident report before discipline thresholds are triggered.

## 2. Discipline Escalation Thresholds (`TeacherDisciplineCase`)
Only violations with `reviewStatus === "CONFIRMED"` and `countsTowardDiscipline === true` are counted:
1. **`3` Confirmed `YELLOW` Warnings (`THREE_YELLOW_WARNINGS`):**
   - Opens `TeacherDisciplineCase` with `recommendedAction = "REPUTATION_AND_REMUNERATION_REVIEW"`, `status = "OPEN_ADMIN_REVIEW"`.
2. **`1` Confirmed `RED` Violation (`ONE_RED_VIOLATION`):**
   - Opens `TeacherDisciplineCase` with `recommendedAction = "REPUTATION_AND_REMUNERATION_REVIEW"`, `status = "OPEN_ADMIN_REVIEW"`.
3. **`3` Confirmed `NO_SHOW` Violations (`THREE_NO_SHOW_VIOLATIONS`):**
   - Opens `TeacherDisciplineCase` with `recommendedAction = "CONTRACT_TERMINATION_REVIEW"`, `status = "OPEN_ADMIN_REVIEW"`.

## 3. Safe Non-Automatic Financial/Legal Boundary
- Every `TeacherDisciplineCase` sets `autoExecutionBlocked = true` with `policyBlockerNote` explaining that exact reputation point deductions, remuneration deduction percentages, and contract termination execution require Admin/Legal confirmation.
- No automatic deduction is made to `TeacherEarning` or `Payout`, and no user account is automatically terminated without Admin action.

