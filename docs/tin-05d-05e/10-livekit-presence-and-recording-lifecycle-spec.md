# 10 — LiveKit Presence and Recording Lifecycle Specification (TIN-05D)

## 1. Trusted Presence Tracking
- **Webhook Verification:** `POST /api/sessions/livekit-webhook` validates the `Authorization` JWT signature and `sha256` raw-body checksum via `videoProvider.processWebhook`.
- **Supported Events:** `participant_joined`, `participant_left`, `participant_disconnected`, `room_finished`, `egress_ended`.
- **Event Deduplication & Out-of-Order Resilience:**
  - `SessionPresenceInterval.processedEventIds` stores processed webhook event IDs so duplicate deliveries are ignored.
  - If a disconnect event arrives before a connect event for a `connectionSessionId`, a zero-duration closed interval is recorded so late delivery cannot leave an orphan open interval.

## 2. Recording Lifecycle & Multi-Segment Support
- **No Waiting Room Recording:** Joining during the 10-minute pre-open window (`now < startDatetime`) opens the waiting room (`roomState = "WAITING"`) without calling `videoProvider.startRecording`.
- **Teaching Period Recording Start:** Recording starts only when `now >= startDatetime` and the Teacher is connected (`status = "IN_PROGRESS"`), using atomic CAS + 3-retry metadata persistence + safe Egress compensation (`stopRecording`).
- **Mid-Session Teacher Disconnect & Reconnect:**
  - When the teacher disconnects, `stopActiveRecordingSegment` stops the active Egress segment and records `stoppedAt` and `durationSeconds` in `session.recordingSegments`.
  - When the teacher reconnects during `[startDatetime, endDatetime]`, `startTeachingRecordingSegmentIfNeeded` starts a new recording segment (`segmentIndex = segments.length + 1`) without overwriting previous segment history.

