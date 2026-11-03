# 03 — Student Join, Late Threshold & Reconnection Specification (TIN-05D)

## 1. Student Time Thresholds
| Milestone | Offset from `startDatetime` | Rule |
| :--- | :--- | :--- |
| Pre-open Waiting Room | `-10 minutes` | Students may enter waiting room; time before `startDatetime` is recorded in `waitingRoomSeconds` and excluded from official attendance. |
| On-Time Window | `0s` to `300s` (`5m00s`) | `lateArrivalSeconds <= 300` -> `isLate = false` (`PRESENT` if duration `>= 70%`). |
| Late Window | `301s` (`5m01s`) to `1200s` (`20m00s`) | `lateArrivalSeconds > 300` -> `isLate = true` (`LATE` if duration `>= 70%`). |
| First-Join Cutoff | `> 20 minutes` | Unverified students are rejected with `403 JOIN_WINDOW_CLOSED`. |

## 2. Token Abuse Prevention & Verified Reconnection
- Calling `POST /api/sessions/:id/join` alone only issues a short-lived token (`tokenIssuedCount++`) and **never** sets `hasVerifiedConnection = true`.
- For a student without `hasVerifiedConnection === true`, the issued token's `expiresAt` is capped at `min(endDatetime, startDatetime + 20 minutes)` (`firstJoinDeadlineAt`).
- A student's connection is marked `hasVerifiedConnection = true` and `firstVerifiedJoinAt` is persisted only when verified via LiveKit `participant_joined` webhook or classroom presence connect (`POST /api/sessions/:id/presence/connect`) before the 20-minute deadline.
- After minute 20, `POST /api/sessions/:id/join` and `recordParticipantConnected` verify `hasVerifiedConnection === true && firstVerifiedJoinAt <= startDatetime + 20m` from MongoDB, ignoring any client-supplied flags (`hasJoined`, `isReconnect`).

