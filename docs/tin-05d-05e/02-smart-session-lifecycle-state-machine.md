# 02 — Smart Session Lifecycle State Machine (TIN-05D)

## 1. Session Lifecycle States & Room States
- `status`: `SCHEDULED` | `WAITING` | `IN_PROGRESS` | `INTERRUPTED` | `COMPLETED` | `CANCELLED`
- `roomState`: `NOT_OPEN` | `WAITING` | `LIVE` | `INTERRUPTED` | `GRACE_PERIOD` | `ENDED` | `CANCELLED`
- `lifecycleState`: `SCHEDULED` | `WAITING` | `IN_PROGRESS` | `INTERRUPTED` | `COMPLETED` | `AUTO_COMPLETED` | `CANCELLED` | `RESCHEDULED`
- `endReason`: `TEACHER_ENDED` | `AUTO_COMPLETED` | `TEACHER_NO_SHOW` | `TEACHER_LEFT_EARLY` | `INCIDENT_CANCELLED` | `RESCHEDULED` | `ADMIN_CANCELLED` | `null`

## 2. State Transition Rules
1. **Before `startDatetime - 10 minutes`:**
   - `status = SCHEDULED`, `roomState = NOT_OPEN`.
   - Join requests rejected with `409 SESSION_NOT_JOINABLE`.
2. **Pre-open Waiting Room (`startDatetime - 10m <= now < startDatetime`):**
   - `roomState = WAITING`, `lifecycleState = WAITING`, `preOpenedAt` set.
   - Teacher and enrolled Students can enter waiting room (`meetingRoomId` initialized).
   - Recording is **NOT** started during the waiting room window.
3. **Official Start (`now >= startDatetime`):**
   - When Teacher connects at `now >= startDatetime` (or remained connected from waiting room), `status = IN_PROGRESS`, `roomState = LIVE`, `lifecycleState = IN_PROGRESS`, `actualStartAt` set, and LiveKit recording starts.
4. **Teacher No-Show (`now >= startDatetime + 30m` without teacher teaching join):**
   - `status = CANCELLED`, `roomState = CANCELLED`, `lifecycleState = CANCELLED`, `endReason = TEACHER_NO_SHOW`.
   - Student attendances marked `NOT_EVALUATED`.
5. **Teacher Mid-Session Absence (`>= 30m` continuous disconnect after teaching start):**
   - `status = INTERRUPTED`, `roomState = INTERRUPTED`, `lifecycleState = INTERRUPTED`, `endReason = TEACHER_LEFT_EARLY`.
   - Active recording segment stopped; student attendance preserved.
6. **Post-End Overtime Grace Period (`endDatetime < now <= endDatetime + 30m`):**
   - `roomState = GRACE_PERIOD`; Teacher receives `TEACHER_OVERTIME_REMINDER`.
7. **Auto-Completion (`now > endDatetime + 30m`):**
   - `status = COMPLETED`, `roomState = ENDED`, `lifecycleState = AUTO_COMPLETED`, `endReason = AUTO_COMPLETED`.
   - Open intervals closed, recording stopped, room closed, 70% attendance finalized.

