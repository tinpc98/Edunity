# 07 — Teacher Incident Reporting Specification (TIN-05E)

## 1. Supported Incident Types & Requested Actions
- **`incidentType`:** `DEVICE_FAILURE`, `INTERNET_FAILURE`, `POWER_OUTAGE`, `HEALTH_ISSUE`, `PERSONAL_EMERGENCY`, `PLATFORM_FAILURE`, `OTHER`.
- **`requestedAction`:** `EXCUSE_LATE`, `CANCEL_SESSION`, `RESCHEDULE_SESSION`, `EXCUSE_INTERRUPTION`.

## 2. Submission Window & Security Rules
- Teachers can submit an incident report via `POST /api/teacher/sessions/:id/incident-reports` only for sessions they own (`session.teacherId === req.user.id`).
- Submission is allowed `BEFORE_SESSION`, `DURING_SESSION`, or `WITHIN_24H_AFTER` (`now <= session.endDatetime + 24 hours`). Submissions after 24 hours are rejected with `409 INCIDENT_REPORT_WINDOW_EXPIRED`.
- Private evidence files (medical notes, power outage notices, screenshots) are uploaded via `POST /api/uploads/private` with `purpose = "INCIDENT_EVIDENCE"`.
- `storageService.assertOwnedKeys(teacherId, storageKeys)` verifies that all attached `storageKey`s belong to the submitting teacher and exist in private storage. Evidence is never exposed via public `/uploads` URLs and is only served via short-lived signed URLs.

## 3. Appeal Mechanism
- If an incident report is rejected, the teacher can submit an appeal with additional evidence via `POST /api/teacher/incident-reports/:id/appeal`, which records the appeal entry and transitions the linked violation's `appealStatus` to `SUBMITTED`.

