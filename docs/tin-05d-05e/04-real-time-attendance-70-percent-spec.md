# 04 — Real-Time Attendance & 70% Duration Formula Specification (TIN-05D)

## 1. Presence Interval Collection (`SessionPresenceInterval`)
- Every verified connection creates/updates a `SessionPresenceInterval` document keyed by `{ sessionId, userId, connectionSessionId }`.
- Processed LiveKit webhook event IDs are stored in `processedEventIds` to guarantee idempotency against duplicate webhook delivery.

## 2. Interval Merging & Clipping Algorithm (`sessionPresenceService.js`)
1. **Merge Overlapping Intervals (`mergeIntervals`):**
   - Sorts all raw intervals `[connectedAt, disconnectedAt]` by `startMs` ascending and merges overlapping/contiguous intervals so multiple browser tabs or duplicate events are never double-counted.
2. **Waiting Room Clipping:**
   - `waitingRoomSeconds = sumIntervalsSeconds(clipIntervals(mergedRaw, startMs - 10m, startMs))`.
3. **Official Scheduled Duration Clipping:**
   - `scheduledDurationSeconds = (endDatetime - startDatetime) / 1000`.
   - `scheduledOnlineSeconds = sumIntervalsSeconds(clipIntervals(mergedRaw, startMs, endMs))`.
4. **Teacher-Student Overlap:**
   - `teacherStudentOverlapSeconds = sumIntervalsSeconds(intersectIntervals(studentScheduledIntervals, teacherScheduledIntervals))`.

## 3. Final Attendance Classification
- `attendancePercentage = min(100, round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100)`.
- If session cancelled due to `TEACHER_NO_SHOW`: `attendanceStatus = NOT_EVALUATED`.
- If session cancelled/rescheduled due to approved incident (`INCIDENT_CANCELLED` / `RESCHEDULED`): `attendanceStatus = EXCUSED`.
- Otherwise:
  - `attendancePercentage >= 70` and `lateArrivalSeconds <= 300` -> `PRESENT`
  - `attendancePercentage >= 70` and `lateArrivalSeconds > 300` -> `LATE`
  - `attendancePercentage < 70` -> `ABSENT`

