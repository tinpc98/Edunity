const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  Session,
  SessionAttendance,
  SessionPresenceInterval,
  Enrollment,
  User,
} = require("../models");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { getSetting } = require("../utils/settings");
const videoProvider = require("./videoProvider");
const { notifyOnce, notifyAdminsOnce } = require("./notificationService");
const incidentService = require("./sessionIncidentService");

const PRE_OPEN_BEFORE_MS = 10 * 60 * 1000; // 10 minutes before startDatetime
const STUDENT_LATE_THRESHOLD_SECONDS = 5 * 60; // 5 minutes (300s)
const STUDENT_FIRST_JOIN_DEADLINE_SECONDS = 20 * 60; // 20 minutes (1200s)
const STUDENT_FIRST_JOIN_JITTER_TOLERANCE_SECONDS = 2; // 2s tolerance for HTTP/test boundary jitter
const TEACHER_YELLOW_LATE_MS = 10 * 60 * 1000; // 10 minutes
const TEACHER_RED_LATE_MS = 20 * 60 * 1000; // 20 minutes
const TEACHER_NO_SHOW_CANCEL_MS = 30 * 60 * 1000; // 30 minutes
const TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const getTeacherBriefPresenceMinSeconds = () => {
  const val = getSetting("TEACHER_BRIEF_PRESENCE_MIN_SECONDS");
  return Number.isFinite(val) ? val : 5 * 60;
};
const TEACHER_BRIEF_PRESENCE_MIN_SECONDS = getTeacherBriefPresenceMinSeconds(); // Proposed 5m threshold (configurable, Admin review only)
const POST_END_GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes after endDatetime
const ATTENDANCE_THRESHOLD_PERCENT = 70;

const TRUSTED_PRESENCE_SOURCES = ["LIVEKIT_WEBHOOK", "LIVEKIT_RECONCILED"];

/**
 * Merges overlapping or contiguous intervals [{ startMs, endMs }] so duplicate tabs
 * or repeated events are never double-counted.
 */
const mergeIntervals = (intervals = []) => {
  const valid = intervals
    .filter((i) => i && Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
    .map((i) => ({ startMs: i.startMs, endMs: i.endMs }))
    .sort((a, b) => a.startMs - b.startMs);

  if (!valid.length) return [];

  const merged = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const prev = merged[merged.length - 1];
    if (current.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, current.endMs);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

/**
 * Clips intervals to [windowStartMs, windowEndMs] and merges them.
 */
const clipIntervals = (intervals = [], windowStartMs, windowEndMs) => {
  if (windowEndMs <= windowStartMs) return [];
  const clipped = [];
  for (const item of intervals) {
    if (!item) continue;
    const s = Math.max(item.startMs, windowStartMs);
    const e = Math.min(item.endMs, windowEndMs);
    if (e > s) {
      clipped.push({ startMs: s, endMs: e });
    }
  }
  return mergeIntervals(clipped);
};

/**
 * Intersects two sets of intervals and returns merged intersection intervals.
 */
const intersectIntervals = (intervalsA = [], intervalsB = []) => {
  const a = mergeIntervals(intervalsA);
  const b = mergeIntervals(intervalsB);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const startMs = Math.max(a[i].startMs, b[j].startMs);
    const endMs = Math.min(a[i].endMs, b[j].endMs);
    if (endMs > startMs) {
      result.push({ startMs, endMs });
    }
    if (a[i].endMs < b[j].endMs) {
      i++;
    } else {
      j++;
    }
  }
  return mergeIntervals(result);
};

const sumIntervalsSeconds = (intervals = []) => {
  const merged = mergeIntervals(intervals);
  const totalMs = merged.reduce((sum, item) => sum + (item.endMs - item.startMs), 0);
  return Math.round(totalMs / 1000);
};

/**
 * Starts a LiveKit recording segment only when:
 * - The session is in the official teaching period (now >= startDatetime),
 * - The teacher is present / starting the teaching period,
 * - No active PROCESSING recording segment is currently running.
 */
const RECORDING_START_ATTEMPTS = 3;
const RECORDING_RETRY_DELAY_MS = 200;

// RECORDING is the live state; PROCESSING without stoppedAt is the pre-RECORDING legacy representation
const isActiveRecordingEntry = (entry) =>
  Boolean(entry) && ["RECORDING", "PROCESSING"].includes(entry.status) && !entry.stoppedAt;

/**
 * Starts an Egress with bounded retries. A missing LiveKit configuration is not retried: it cannot succeed.
 * Returns { egressId, error }.
 */
const startEgressWithRetry = async (roomId, storageKey) => {
  let error = null;
  for (let attempt = 1; attempt <= RECORDING_START_ATTEMPTS; attempt++) {
    const egressId = await videoProvider.startRecording(roomId, storageKey);
    if (egressId) return { egressId, error: null };
    error =
      (typeof videoProvider.getLastStartRecordingError === "function" && videoProvider.getLastStartRecordingError()) ||
      "Failed to start LiveKit egress";
    if (error === "LiveKit is not configured") break;
    if (attempt < RECORDING_START_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RECORDING_RETRY_DELAY_MS * attempt));
    }
  }
  return { egressId: null, error };
};

/**
 * Starts a recording segment unless one is already running. Used when the Teacher starts the Session and when a
 * Teacher resumes an INTERRUPTED Session. A failure is never silent: the Teacher and Admins are notified and the
 * caller receives { ok: false, error } to decide whether the Session may proceed.
 */
const startTeachingRecordingSegmentIfNeeded = async (sessionDoc, teacherId) => {
  const segments = Array.isArray(sessionDoc.recordingSegments) ? sessionDoc.recordingSegments : [];
  if (segments.some(isActiveRecordingEntry) || isActiveRecordingEntry(sessionDoc.recording)) {
    return { ok: true, recording: sessionDoc.recording, alreadyRunning: true };
  }

  if (!sessionDoc.meetingRoomId) {
    sessionDoc.meetingRoomId = `room_${sessionDoc._id}`;
  }

  const storageKey = `private/${teacherId}/RECORDING/${crypto.randomUUID()}.mp4`;
  const { egressId, error } = await startEgressWithRetry(sessionDoc.meetingRoomId, storageKey);
  if (!egressId && error === "LiveKit is not configured") {
    // Local/dev deployment without a video provider: there is nothing to record and nothing failed
    return { ok: false, unavailable: true, recording: sessionDoc.recording || null, error };
  }
  const now = new Date();
  const failureReason = egressId ? null : error;

  const newSegment = {
    segmentIndex: segments.length + 1,
    providerRecordingId: egressId || null,
    storageKey,
    status: egressId ? "RECORDING" : "FAILED",
    startedAt: now,
    stoppedAt: egressId ? null : now,
    failureReason,
  };

  // `recording` is what playback reads: it follows the newest segment that actually records, and only falls back
  // to a FAILED entry when there is nothing better to show
  const keepPrevious = !egressId && sessionDoc.recording && sessionDoc.recording.status !== "FAILED";
  const recordingData = keepPrevious
    ? sessionDoc.recording
    : {
        providerRecordingId: egressId || null,
        storageKey,
        status: egressId ? "RECORDING" : "FAILED",
        failureReason,
        startedAt: now,
        stoppedAt: egressId ? null : now,
      };

  await Session.updateOne(
    { _id: sessionDoc._id },
    {
      $set: { recording: recordingData, meetingRoomId: sessionDoc.meetingRoomId },
      $push: { recordingSegments: newSegment },
    }
  );

  sessionDoc.recording = recordingData;
  sessionDoc.recordingSegments = [...segments, newSegment];

  if (!egressId) {
    await notifyOnce(
      sessionDoc.teacherId,
      "Không thể bật ghi hình buổi học",
      `Hệ thống chưa bật được ghi hình cho buổi học "${sessionDoc.title}". Vui lòng thử lại; nếu vẫn lỗi, liên hệ quản trị viên.`,
      "SESSION_RECORDING_START_FAILED",
      `session:${sessionDoc._id}:teacher:recording_start_failed:${newSegment.segmentIndex}`,
      sessionDoc._id
    );
    await notifyAdminsOnce(
      "Lỗi khởi động ghi hình buổi học",
      `Buổi học "${sessionDoc.title}" (${sessionDoc.className}) không bật được ghi hình: ${failureReason}`,
      "ADMIN_RECORDING_START_FAILED",
      `session:${sessionDoc._id}:admin:recording_start_failed:${newSegment.segmentIndex}`,
      sessionDoc._id
    );
  }

  return { ok: Boolean(egressId), recording: recordingData, error: failureReason };
};

/**
 * Stops the active LiveKit recording segment (if any) when the teacher leaves or the session ends.
 */
// How long a Teacher may sit in the room after the start time before the system starts teaching itself
const getAutoStartAfterMs = () => (Number(process.env.SESSION_AUTO_START_AFTER_MINUTES) || 10) * 60 * 1000;

const STARTABLE_STATUSES = ["SCHEDULED", "WAITING"];

/**
 * SCHEDULED/WAITING → IN_PROGRESS, recording first (startSession and the lifecycle auto-start).
 * When recording is mandatory and cannot start, the Session is NOT started: RECORDING_START_FAILED is thrown
 * and the Session stays WAITING so the Teacher can retry. Never reports a recording that is not running.
 */
const beginTeaching = async (sessionId, { startedBy = "TEACHER", now = new Date() } = {}) => {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  if (!STARTABLE_STATUSES.includes(session.status)) {
    throw new AppError("Only a SCHEDULED or WAITING session can be started", "SESSION_NOT_STARTABLE", 409);
  }
  if (!session.meetingRoomId) session.meetingRoomId = `room_${session._id}`;

  const recording = await startTeachingRecordingSegmentIfNeeded(session, session.teacherId);
  if (!recording.ok && !recording.unavailable && videoProvider.isRecordingRequired()) {
    throw new AppError(
      `Recording could not be started, so the session was not started: ${recording.error || "unknown error"}`,
      "RECORDING_START_FAILED",
      503
    );
  }

  const tp = session.teacherPresence || {};
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, status: { $in: STARTABLE_STATUSES } },
    {
      $set: {
        status: "IN_PROGRESS",
        roomState: now.getTime() > session.endDatetime.getTime() ? "GRACE_PERIOD" : "LIVE",
        lifecycleState: "IN_PROGRESS",
        actualStartAt: session.actualStartAt || now,
        meetingRoomId: session.meetingRoomId,
        "teacherPresence.firstTeachingJoinAt": tp.firstTeachingJoinAt || now,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    // Lost a race against another start/end: the Egress this call started must not keep running on its own
    if (recording.ok && !recording.alreadyRunning) await stopActiveRecordingSegment(session, "START_RACE_LOST");
    throw new AppError("Session has already been started or ended", "SESSION_NOT_STARTABLE", 409);
  }

  return { ...updated, startedBy };
};

/**
 * Stops every running Egress of the Session (end, auto-completion, or interruption). Entries move from RECORDING to
 * PROCESSING; the egress_ended webhook then makes them AVAILABLE or FAILED.
 * The Teacher merely disconnecting does NOT call this: the recording keeps running until the Session ends.
 */
const stopActiveRecordingSegment = async (sessionDoc, stopReason = "SESSION_ENDED") => {
  const current = await Session.findById(sessionDoc._id).lean();
  if (!current) return null;

  const segments = Array.isArray(current.recordingSegments) ? current.recordingSegments : [];
  const egressIds = new Set();
  for (const entry of [current.recording, ...segments]) {
    if (isActiveRecordingEntry(entry) && entry.providerRecordingId) egressIds.add(entry.providerRecordingId);
  }
  for (const egressId of egressIds) {
    try {
      await videoProvider.stopRecording(egressId);
    } catch (err) {
      console.warn(`[Recording] stopRecording failed for ${egressId}:`, err.message);
    }
  }

  const now = new Date();
  const close = (entry) => {
    const durationSeconds = entry.startedAt
      ? Math.max(0, Math.round((now.getTime() - new Date(entry.startedAt).getTime()) / 1000))
      : entry.durationSeconds ?? null;
    return {
      ...entry,
      status: "PROCESSING",
      stoppedAt: now,
      durationSeconds,
      failureReason: stopReason === "TEACHER_LEFT_EARLY" ? "Stopped due to teacher absence" : entry.failureReason,
    };
  };

  const update = {};
  if (segments.some(isActiveRecordingEntry)) {
    update.recordingSegments = segments.map((seg) => (isActiveRecordingEntry(seg) ? close(seg) : seg));
  }
  if (isActiveRecordingEntry(current.recording)) {
    update.recording = close(current.recording);
  }
  if (Object.keys(update).length) {
    await Session.updateOne({ _id: current._id }, { $set: update });
  }

  return true;
};

/**
 * Verifies a client-initiated presence/connect or presence/heartbeat call against trusted LiveKit
 * evidence. Client calls can NEVER create verified participation, set hasVerifiedConnection,
 * satisfy student PRESENT, or satisfy teacher presence unless backed by:
 * 1) An active verified LiveKit interval (from a signed LiveKit webhook), OR
 * 2) Live verification from `videoProvider.verifyParticipantInRoom` (reconciling a missed webhook).
 */
const verifyAndRecordClientPresence = async ({
  sessionId,
  userId,
  role,
  connectionSessionId = null,
  action = "CONNECT",
  now = new Date(),
}) => {
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
    throw new AppError("Invalid session or user ID", "VALIDATION_ERROR", 400);
  }

  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  const isTeacher = session.teacherId.toString() === userId.toString();
  if (!isTeacher && role === "TEACHER") {
    throw FORBIDDEN("Only the assigned teacher can connect as TEACHER");
  }
  if (!isTeacher) {
    const enrolled = await Enrollment.exists({
      studentId: userId,
      classId: session.classId,
      enrollmentStatus: "CONFIRMED",
    });
    if (!enrolled) {
      throw FORBIDDEN("Not enrolled in this class");
    }
  }

  const refNow = now instanceof Date ? now : new Date(now);
  const existingVerifiedOpen = await SessionPresenceInterval.findOne({
    sessionId: session._id,
    userId,
    disconnectedAt: null,
    source: { $in: TRUSTED_PRESENCE_SOURCES },
  });

  const lkVerification =
    typeof videoProvider.verifyParticipantInRoom === "function"
      ? await videoProvider.verifyParticipantInRoom(session.meetingRoomId, String(userId))
      : { verified: false, reason: "PROVIDER_UNAVAILABLE", participant: null };

  // If an open verified interval exists, check that LiveKit hasn't explicitly reported NOT_IN_ROOM
  if (existingVerifiedOpen) {
    if (lkVerification && lkVerification.reason === "NOT_IN_ROOM") {
      await recordParticipantDisconnected({
        sessionId: session._id,
        userId,
        connectionSessionId: existingVerifiedOpen.connectionSessionId,
        disconnectedAt: refNow,
        closeReason: "LIVEKIT_RECONCILED_DISCONNECT",
      });
      throw new AppError(
        "Participant is no longer connected in LiveKit room",
        "UNVERIFIED_LIVEKIT_PRESENCE",
        403
      );
    }

    existingVerifiedOpen.lastHeartbeatAt = refNow;
    await existingVerifiedOpen.save();

    return {
      verified: true,
      deduplicated: true,
      action,
      interval: existingVerifiedOpen.toObject(),
    };
  }

  // No open verified interval in DB -> only allow if trusted LiveKit RoomService confirms active presence
  if (lkVerification && lkVerification.verified) {
    const participant = lkVerification.participant || {};
    const rawJoinedAt = participant.joinedAt;
    const joinedAtDate = rawJoinedAt
      ? new Date(Number(rawJoinedAt) > 1e12 ? Number(rawJoinedAt) : Number(rawJoinedAt) * 1000)
      : refNow;
    const reconciledConnId =
      participant.sid || connectionSessionId || `lk_reconciled_${userId}_${joinedAtDate.getTime()}`;

    const recorded = await recordParticipantConnected({
      sessionId: session._id,
      userId,
      role: isTeacher ? "TEACHER" : "STUDENT",
      connectionSessionId: reconciledConnId,
      connectedAt: joinedAtDate,
      source: "LIVEKIT_RECONCILED",
    });

    return {
      verified: true,
      reconciled: true,
      action,
      ...recorded,
    };
  }

  throw new AppError(
    "Client heartbeat/presence cannot create verified participation without trusted LiveKit evidence",
    "UNVERIFIED_LIVEKIT_PRESENCE",
    403
  );
};

/**
 * Reconciles DB presence state with trusted LiveKit room state (`videoProvider.listRoomParticipants`)
 * when available, recovering missed join or disconnect webhooks.
 */
const reconcileSessionWithLiveKit = async (sessionOrId, now = new Date()) => {
  if (typeof videoProvider.listRoomParticipants !== "function") {
    return { reconciled: false, reason: "PROVIDER_UNAVAILABLE" };
  }

  const session =
    sessionOrId && sessionOrId._id ? sessionOrId : await Session.findById(sessionOrId);
  if (!session || !session.meetingRoomId) {
    return { reconciled: false, reason: "NO_ROOM" };
  }

  const participants = await videoProvider.listRoomParticipants(session.meetingRoomId);
  if (!Array.isArray(participants)) {
    return { reconciled: false, reason: "PROVIDER_UNAVAILABLE" };
  }

  const activeMap = new Map();
  for (const p of participants) {
    if (p && p.identity && p.state !== "DISCONNECTED") {
      activeMap.set(String(p.identity), p);
    }
  }

  // 1. Reconcile missing disconnect events for DB-open intervals no longer in LiveKit room
  // (including when a participant reconnected under a new LiveKit sid after a lost disconnect webhook)
  const openIntervals = await SessionPresenceInterval.find({
    sessionId: session._id,
    disconnectedAt: null,
  }).lean();

  for (const openInt of openIntervals) {
    const uid = openInt.userId.toString();
    const activeP = activeMap.get(uid);
    const isReplacedConnection =
      Boolean(activeP && activeP.sid && openInt.connectionSessionId) &&
      String(activeP.sid) !== String(openInt.connectionSessionId);

    if (!activeP || isReplacedConnection) {
      let disconnectAtDate = now;
      if (isReplacedConnection && activeP.joinedAt) {
        const replacementJoinedAt = new Date(
          Number(activeP.joinedAt) > 1e12
            ? Number(activeP.joinedAt)
            : Number(activeP.joinedAt) * 1000
        );
        if (
          replacementJoinedAt >= new Date(openInt.connectedAt) &&
          replacementJoinedAt <= now
        ) {
          disconnectAtDate = replacementJoinedAt;
        }
      }
      await recordParticipantDisconnected({
        sessionId: session._id,
        userId: openInt.userId,
        connectionSessionId: openInt.connectionSessionId,
        disconnectedAt: disconnectAtDate,
        closeReason: "LIVEKIT_RECONCILED_DISCONNECT",
      });
    }
  }

  // 2. Reconcile missing join events for participants actively in LiveKit room
  for (const [identity, p] of activeMap.entries()) {
    if (!mongoose.isValidObjectId(identity)) continue;
    const hasOpen = await SessionPresenceInterval.exists({
      sessionId: session._id,
      userId: identity,
      disconnectedAt: null,
    });
    if (!hasOpen) {
      const isTeacher = session.teacherId.toString() === identity;
      const isEnrolled = isTeacher
        ? true
        : await Enrollment.exists({
            studentId: identity,
            classId: session.classId,
            enrollmentStatus: "CONFIRMED",
          });
      if (isEnrolled) {
        const joinedAtDate = p.joinedAt
          ? new Date(Number(p.joinedAt) > 1e12 ? Number(p.joinedAt) : Number(p.joinedAt) * 1000)
          : now;
        try {
          await recordParticipantConnected({
            sessionId: session._id,
            userId: identity,
            role: isTeacher ? "TEACHER" : "STUDENT",
            connectionSessionId: p.sid || `lk_reconciled_${identity}`,
            connectedAt: joinedAtDate,
            source: "LIVEKIT_RECONCILED",
          });
        } catch {
          // Ignore join window rejections for unauthorized/late unverified participants
        }
      }
    }
  }

  return { reconciled: true, activeCount: activeMap.size };
};

/**
 * Records a verified participant connection (from signed LiveKit webhook or LiveKit room reconciliation).
 * Enforces the 20-minute first-join deadline for unverified students even if they held a pre-issued token.
 * Rejects unverified client sources ("HEARTBEAT", "CLIENT_CONNECT") unless reconciled with LiveKit.
 */
const recordParticipantConnected = async ({
  sessionId,
  userId,
  role,
  connectionSessionId = null,
  connectedAt = new Date(),
  eventId = null,
  source = "LIVEKIT_WEBHOOK",
}) => {
  if (source === "HEARTBEAT" || source === "CLIENT_CONNECT") {
    return verifyAndRecordClientPresence({
      sessionId,
      userId,
      role,
      connectionSessionId,
      action: source,
      now: connectedAt,
    });
  }

  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
    throw new AppError("Invalid session or user ID", "VALIDATION_ERROR", 400);
  }

  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  if (eventId) {
    const duplicateEvent = await SessionPresenceInterval.findOne({
      sessionId: session._id,
      processedEventIds: eventId,
    }).lean();
    if (duplicateEvent) {
      return { deduplicated: true, interval: duplicateEvent };
    }
  }

  const connectTime = connectedAt instanceof Date ? connectedAt : new Date(connectedAt);
  const startMs = session.startDatetime.getTime();
  const endMs = session.endDatetime.getTime();
  const connectMs = connectTime.getTime();

  const normalizedRole =
    role === "HOST" || role === "TEACHER" || session.teacherId.toString() === userId.toString()
      ? "TEACHER"
      : "STUDENT";

  // Enforce Student 20-minute first-join deadline on actual room connection
  if (normalizedRole === "STUDENT") {
    const enrollment = await Enrollment.exists({
      studentId: userId,
      classId: session.classId,
      enrollmentStatus: "CONFIRMED",
    });
    if (!enrollment) {
      throw FORBIDDEN("Not enrolled in this class");
    }

    const existingAttendance = await SessionAttendance.findOne({
      sessionId: session._id,
      studentId: userId,
    }).lean();

    const elapsedSeconds = Math.floor((connectMs - startMs) / 1000);
    const isPastFirstJoinDeadline =
      elapsedSeconds > STUDENT_FIRST_JOIN_DEADLINE_SECONDS + STUDENT_FIRST_JOIN_JITTER_TOLERANCE_SECONDS;

    const hasValidPriorJoin =
      Boolean(existingAttendance?.hasVerifiedConnection) &&
      existingAttendance?.firstVerifiedJoinAt &&
      Math.floor((new Date(existingAttendance.firstVerifiedJoinAt).getTime() - startMs) / 1000) <=
        STUDENT_FIRST_JOIN_DEADLINE_SECONDS + STUDENT_FIRST_JOIN_JITTER_TOLERANCE_SECONDS;

    if (isPastFirstJoinDeadline && !hasValidPriorJoin) {
      throw new AppError(
        "First-join deadline (20 minutes after session start) has passed",
        "JOIN_WINDOW_CLOSED",
        403
      );
    }
  } else if (normalizedRole === "TEACHER") {
    if (session.teacherId.toString() !== userId.toString()) {
      throw FORBIDDEN("Only the assigned teacher can connect as TEACHER");
    }
  }

  const connId = connectionSessionId || `conn_${userId}_${connectMs}`;

  // Upsert interval idempotently
  let interval = await SessionPresenceInterval.findOne({
    sessionId: session._id,
    userId,
    connectionSessionId: connId,
  });

  if (!interval) {
    interval = await SessionPresenceInterval.create({
      sessionId: session._id,
      classId: session.classId,
      userId,
      role: normalizedRole,
      connectionSessionId: connId,
      connectedAt: connectTime,
      disconnectedAt: null,
      source,
      processedEventIds: eventId ? [eventId] : [],
    });
  } else if (eventId && !interval.processedEventIds.includes(eventId)) {
    interval.processedEventIds.push(eventId);
    await interval.save();
  }

  session.presenceTrackingActive = true;

  if (normalizedRole === "STUDENT") {
    const attendance = await SessionAttendance.findOne({
      sessionId: session._id,
      studentId: userId,
    });

    const isPreOpen = connectMs < startMs;
    const effectiveTeachingJoin = isPreOpen ? null : connectTime;
    const priorVerified = Boolean(attendance?.hasVerifiedConnection);

    const updateSet = {
      classId: session.classId,
      hasVerifiedConnection: true,
      lastVerifiedConnect: connectTime,
      isCurrentlyConnected: true,
      leftAt: null,
    };

    if (!attendance?.firstVerifiedJoinAt) {
      updateSet.firstVerifiedJoinAt = connectTime;
    }
    if (isPreOpen && !attendance?.firstPreOpenJoinAt) {
      updateSet.firstPreOpenJoinAt = connectTime;
    }
    if (!isPreOpen && !attendance?.firstValidTeachingJoin) {
      const preOpenSpanningStart = await SessionPresenceInterval.exists({
        sessionId: session._id,
        userId,
        connectedAt: { $lt: session.startDatetime },
        $or: [{ disconnectedAt: null }, { disconnectedAt: { $gt: session.startDatetime } }],
      });
      const teachingJoinAt = preOpenSpanningStart ? session.startDatetime : effectiveTeachingJoin;
      updateSet.firstValidTeachingJoin = teachingJoinAt;
      updateSet.joinedAt = teachingJoinAt;
      const lateSeconds = Math.max(0, Math.floor((teachingJoinAt.getTime() - startMs) / 1000));
      updateSet.lateArrivalSeconds = lateSeconds;
      updateSet.isLate = lateSeconds > STUDENT_LATE_THRESHOLD_SECONDS;
      updateSet.attendanceStatus = updateSet.isLate ? "LATE" : "PRESENT";
    } else if (isPreOpen && !attendance?.joinedAt) {
      updateSet.attendanceStatus = "PRESENT";
    }

    const updateDoc = { $set: updateSet };
    if (priorVerified) {
      updateDoc.$inc = { reconnectionCount: 1 };
    }

    await SessionAttendance.findOneAndUpdate(
      { sessionId: session._id, studentId: userId },
      updateDoc,
      { upsert: true, returnDocument: "after" }
    );
  } else if (normalizedRole === "TEACHER") {
    const tp = session.teacherPresence || {};
    tp.isCurrentlyConnected = true;
    tp.lastConnectedAt = connectTime;

    // Being in the room only opens it: teaching (IN_PROGRESS + recording) starts when the Teacher presses
    // "Bắt đầu buổi học" (startSession) or when the lifecycle job auto-starts it. See startSession.
    if (connectMs < startMs) {
      if (!tp.firstPreOpenJoinAt) tp.firstPreOpenJoinAt = connectTime;
    } else {
      // Lateness milestones are measured from the Teacher's first presence in the room after the start time
      if (!tp.firstTeachingJoinAt) tp.firstTeachingJoinAt = connectTime;
      if (tp.currentAbsenceStartedAt) {
        const absenceSec = Math.max(
          0,
          Math.round((connectMs - new Date(tp.currentAbsenceStartedAt).getTime()) / 1000)
        );
        tp.maxContinuousAbsenceSeconds = Math.max(tp.maxContinuousAbsenceSeconds || 0, absenceSec);
        tp.currentAbsenceStartedAt = null;
      }
    }

    let resumedFromInterruption = false;
    if (session.status === "SCHEDULED" || session.status === "WAITING") {
      session.status = "WAITING";
      session.roomState = "WAITING";
      session.lifecycleState = "WAITING";
      if (!session.preOpenedAt) session.preOpenedAt = connectTime;
    } else if (session.status === "INTERRUPTED" && session.roomState !== "ENDED" && connectMs >= startMs) {
      // A Teacher returning to an INTERRUPTED Session resumes teaching; the interruption stays on record
      session.status = "IN_PROGRESS";
      session.roomState = connectMs > endMs ? "GRACE_PERIOD" : "LIVE";
      session.lifecycleState = "IN_PROGRESS";
      resumedFromInterruption = true;
    } else if (session.status === "IN_PROGRESS") {
      session.roomState = connectMs > endMs ? "GRACE_PERIOD" : "LIVE";
    }

    session.teacherPresence = tp;
    await session.save();

    // The recording of a running Session is stopped only by an interruption: resuming restarts it
    if (resumedFromInterruption) {
      await startTeachingRecordingSegmentIfNeeded(session, userId);
    }
  } else {
    await session.save();
  }

  return { deduplicated: false, interval: interval.toObject() };
};

/**
 * Records a participant disconnection (from LiveKit webhook, leave endpoint, or session end).
 */
const recordParticipantDisconnected = async ({
  sessionId,
  userId,
  connectionSessionId = null,
  disconnectedAt = new Date(),
  eventId = null,
  closeReason = "PARTICIPANT_LEFT",
}) => {
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
    throw new AppError("Invalid session or user ID", "VALIDATION_ERROR", 400);
  }

  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  if (eventId) {
    const duplicateEvent = await SessionPresenceInterval.findOne({
      sessionId: session._id,
      processedEventIds: eventId,
    }).lean();
    if (duplicateEvent) {
      return { deduplicated: true, interval: duplicateEvent };
    }
  }

  const disconnectTime = disconnectedAt instanceof Date ? disconnectedAt : new Date(disconnectedAt);
  const filter = {
    sessionId: session._id,
    userId,
    disconnectedAt: null,
  };
  if (connectionSessionId) {
    filter.connectionSessionId = connectionSessionId;
  }

  const openIntervals = await SessionPresenceInterval.find(filter).sort({ connectedAt: -1 });
  let updatedInterval = null;

  if (openIntervals.length > 0) {
    for (const interval of openIntervals) {
      const effDisconnect =
        disconnectTime.getTime() >= interval.connectedAt.getTime()
          ? disconnectTime
          : interval.connectedAt;
      interval.disconnectedAt = effDisconnect;
      interval.durationSeconds = Math.max(
        0,
        Math.round((effDisconnect.getTime() - interval.connectedAt.getTime()) / 1000)
      );
      interval.closeReason = closeReason;
      if (eventId && !interval.processedEventIds.includes(eventId)) {
        interval.processedEventIds.push(eventId);
      }
      await interval.save();
      if (!updatedInterval) updatedInterval = interval;
    }
  } else if (connectionSessionId && closeReason !== "LEAVE_API") {
    // An out-of-order webhook disconnect is kept as a zero-length interval. A client "leave" with no open interval
    // (its connect was never verified, or a second leave for the same tab) has nothing to close.
    // Concurrent duplicates hit the unique (sessionId, userId, connectionSessionId) index: that is not an error.
    updatedInterval = await SessionPresenceInterval.create({
      sessionId: session._id,
      classId: session.classId,
      userId,
      role: session.teacherId.toString() === userId.toString() ? "TEACHER" : "STUDENT",
      connectionSessionId,
      connectedAt: disconnectTime,
      disconnectedAt: disconnectTime,
      durationSeconds: 0,
      source: "LIVEKIT_WEBHOOK",
      closeReason: "OUT_OF_ORDER_DISCONNECT",
      processedEventIds: eventId ? [eventId] : [],
    }).catch((err) => {
      if (err?.code === 11000) return null;
      throw err;
    });
  }

  // Check if user still has any other open tab/connection in this session
  const remainingOpen = await SessionPresenceInterval.exists({
    sessionId: session._id,
    userId,
    disconnectedAt: null,
  });

  const isTeacher = session.teacherId.toString() === userId.toString();
  if (!isTeacher) {
    await SessionAttendance.updateOne(
      { sessionId: session._id, studentId: userId },
      {
        $set: {
          lastVerifiedDisconnect: disconnectTime,
          leftAt: remainingOpen ? null : disconnectTime,
          isCurrentlyConnected: Boolean(remainingOpen),
        },
      }
    );
    await calculateAndPersistStudentAttendance(session, userId, disconnectTime);
  } else {
    const tp = session.teacherPresence || {};
    tp.lastDisconnectedAt = disconnectTime;
    tp.isCurrentlyConnected = Boolean(remainingOpen);

    const startMs = session.startDatetime.getTime();
    const discMs = disconnectTime.getTime();

    if (!remainingOpen && discMs >= startMs) {
      if (!tp.currentAbsenceStartedAt) {
        tp.currentAbsenceStartedAt = disconnectTime;
      }
      if (session.status === "IN_PROGRESS") {
        session.roomState = "TEACHER_DISCONNECTED";
      }
    }

    const teacherMetrics = await computeTeacherPresenceMetrics(session, disconnectTime);
    tp.totalOnlineSeconds = teacherMetrics.rawOnlineSeconds;
    tp.scheduledOnlineSeconds = teacherMetrics.scheduledOnlineSeconds;

    session.teacherPresence = tp;
    await session.save();
    // The recording is NOT stopped here: a Teacher's network drop must not split the recording. It stops when the
    // Session ends, is auto-completed, or is INTERRUPTED after 30 minutes of continuous absence.
  }

  return {
    deduplicated: false,
    interval: updatedInterval ? updatedInterval.toObject() : null,
  };
};

const computeTeacherPresenceMetrics = async (session, referenceNow = new Date()) => {
  const startMs = new Date(session.startDatetime).getTime();
  const endMs = new Date(session.endDatetime).getTime();
  const nowMs = referenceNow.getTime();

  const docs = await SessionPresenceInterval.find({
    sessionId: session._id,
    userId: session.teacherId,
  }).lean();

  const rawIntervals = docs.map((d) => ({
    startMs: new Date(d.connectedAt).getTime(),
    endMs: d.disconnectedAt ? new Date(d.disconnectedAt).getTime() : nowMs,
  }));

  const mergedRaw = mergeIntervals(rawIntervals);
  const clippedScheduled = clipIntervals(mergedRaw, startMs, endMs);

  return {
    rawIntervals: mergedRaw,
    scheduledIntervals: clippedScheduled,
    rawOnlineSeconds: sumIntervalsSeconds(mergedRaw),
    scheduledOnlineSeconds: sumIntervalsSeconds(clippedScheduled),
  };
};

/**
 * Computes and updates a single student's attendance metrics from SessionPresenceInterval records.
 */
const calculateAndPersistStudentAttendance = async (
  session,
  studentId,
  referenceNow = new Date(),
  finalize = false
) => {
  const startMs = new Date(session.startDatetime).getTime();
  const endMs = new Date(session.endDatetime).getTime();
  const preOpenStartMs = startMs - PRE_OPEN_BEFORE_MS;
  const nowMs = referenceNow.getTime();
  const scheduledDurationSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));

  const [studentDocs, teacherMetrics, existingAttendance] = await Promise.all([
    SessionPresenceInterval.find({ sessionId: session._id, userId: studentId })
      .sort({ connectedAt: 1 })
      .lean(),
    computeTeacherPresenceMetrics(session, referenceNow),
    SessionAttendance.findOne({ sessionId: session._id, studentId }).lean(),
  ]);

  const rawIntervals = studentDocs.map((d) => ({
    startMs: new Date(d.connectedAt).getTime(),
    endMs: d.disconnectedAt ? new Date(d.disconnectedAt).getTime() : nowMs,
  }));

  const mergedRaw = mergeIntervals(rawIntervals);
  const waitingIntervals = clipIntervals(mergedRaw, preOpenStartMs, startMs);
  const scheduledIntervals = clipIntervals(mergedRaw, startMs, endMs);
  const overlapWithTeacher = intersectIntervals(scheduledIntervals, teacherMetrics.scheduledIntervals);

  const rawOnlineSeconds = sumIntervalsSeconds(mergedRaw);
  const waitingRoomSeconds = sumIntervalsSeconds(waitingIntervals);
  const scheduledOnlineSeconds = sumIntervalsSeconds(scheduledIntervals);
  const teacherStudentOverlapSeconds = sumIntervalsSeconds(overlapWithTeacher);

  const attendancePercentage = Math.min(
    100,
    Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100
  );

  let firstValidTeachingJoin = null;
  if (scheduledIntervals.length > 0) {
    firstValidTeachingJoin = new Date(scheduledIntervals[0].startMs);
  }

  let lateArrivalSeconds = 0;
  let isLate = false;
  if (firstValidTeachingJoin) {
    lateArrivalSeconds = Math.max(0, Math.floor((firstValidTeachingJoin.getTime() - startMs) / 1000));
    isLate = lateArrivalSeconds > STUDENT_LATE_THRESHOLD_SECONDS;
  }

  let attendanceStatus = existingAttendance?.attendanceStatus || "ABSENT";
  let evaluationStatus = existingAttendance?.evaluationStatus || "PENDING";
  let evaluationReason = existingAttendance?.evaluationReason || null;

  if (
    session.status === "CANCELLED" &&
    ["TEACHER_NO_SHOW", "INCIDENT_CANCELLED", "RESCHEDULED"].includes(session.endReason)
  ) {
    attendanceStatus = session.endReason === "TEACHER_NO_SHOW" ? "NOT_EVALUATED" : "EXCUSED";
    evaluationStatus = attendanceStatus;
    evaluationReason = `Session ended with reason ${session.endReason}; students are not penalized`;
  } else if (studentDocs.length > 0 || session.presenceTrackingActive || finalize) {
    if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT) {
      attendanceStatus = isLate ? "LATE" : "PRESENT";
    } else {
      attendanceStatus = "ABSENT";
    }
    if (finalize) {
      evaluationStatus = "FINALIZED";
      evaluationReason =
        attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT
          ? `Attended ${attendancePercentage}% (>= ${ATTENDANCE_THRESHOLD_PERCENT}%)`
          : `Attended ${attendancePercentage}% (< ${ATTENDANCE_THRESHOLD_PERCENT}% required threshold)`;
    }
  }

  const updateFields = {
    classId: session.classId,
    rawOnlineSeconds,
    waitingRoomSeconds,
    scheduledDurationSeconds,
    scheduledOnlineSeconds,
    teacherStudentOverlapSeconds,
    attendancePercentage,
    lateArrivalSeconds,
    isLate,
    attendanceStatus,
    evaluationStatus,
    evaluationReason,
  };

  if (firstValidTeachingJoin) {
    updateFields.firstValidTeachingJoin = firstValidTeachingJoin;
    updateFields.joinedAt = firstValidTeachingJoin;
  }
  if (finalize) {
    updateFields.finalizedAt = referenceNow;
    updateFields.isCurrentlyConnected = false;
    if (mergedRaw.length > 0) {
      updateFields.leftAt = new Date(mergedRaw[mergedRaw.length - 1].endMs);
    }
  }

  const updated = await SessionAttendance.findOneAndUpdate(
    { sessionId: session._id, studentId },
    { $set: updateFields },
    { upsert: true, returnDocument: "after" }
  ).lean();

  return updated;
};

/**
 * Closes all open SessionPresenceInterval records for a session (at session end, auto-completion, or cancellation).
 */
const closeAllOpenIntervalsForSession = async (
  session,
  closeTime = new Date(),
  closeReason = "SESSION_ENDED"
) => {
  const openIntervals = await SessionPresenceInterval.find({
    sessionId: session._id,
    disconnectedAt: null,
  });

  for (const interval of openIntervals) {
    const effClose =
      closeTime.getTime() >= interval.connectedAt.getTime() ? closeTime : interval.connectedAt;
    interval.disconnectedAt = effClose;
    interval.durationSeconds = Math.max(
      0,
      Math.round((effClose.getTime() - interval.connectedAt.getTime()) / 1000)
    );
    interval.closeReason = closeReason;
    await interval.save();
  }
};

/**
 * Finalizes attendance for all confirmed enrollments of a session.
 * Preserves backward compatibility with legacy direct-DB tests that do not create SessionPresenceInterval records,
 * while enforcing the exact 70% attendance + 5-minute late rules whenever intervals exist or forceRecalculate is true.
 */
const finalizeSessionAttendance = async (sessionId, options = {}) => {
  const { now = new Date(), forceRecalculate = false } = options;
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  await closeAllOpenIntervalsForSession(session, now, "SESSION_FINALIZED");

  const [enrollments, intervalCount, existingAttendances] = await Promise.all([
    Enrollment.find({ classId: session.classId, enrollmentStatus: "CONFIRMED" })
      .select("studentId")
      .lean(),
    SessionPresenceInterval.countDocuments({ sessionId: session._id }),
    SessionAttendance.find({ sessionId: session._id }).lean(),
  ]);

  const existingMap = new Map(existingAttendances.map((a) => [a.studentId.toString(), a]));
  const useIntervalEngine = intervalCount > 0 || session.presenceTrackingActive || forceRecalculate;

  const startMs = session.startDatetime.getTime();
  const endMs = session.endDatetime.getTime();
  const scheduledDurationSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));

  const results = [];
  for (const enrollment of enrollments) {
    const studentIdStr = enrollment.studentId.toString();
    const existing = existingMap.get(studentIdStr);

    if (useIntervalEngine) {
      const studentIntervalCount = await SessionPresenceInterval.countDocuments({
        sessionId: session._id,
        userId: enrollment.studentId,
      });

      if (studentIntervalCount > 0) {
        const computed = await calculateAndPersistStudentAttendance(
          session,
          enrollment.studentId,
          now,
          true
        );
        results.push(computed);
        continue;
      }

      if (existing && existing.joinedAt && existing.hasVerifiedConnection) {
        const joinMs = new Date(existing.joinedAt).getTime();
        const leaveMs = existing.leftAt
          ? new Date(existing.leftAt).getTime()
          : Math.min(now.getTime(), endMs);
        const clipped = clipIntervals([{ startMs: joinMs, endMs: leaveMs }], startMs, endMs);
        const scheduledOnlineSeconds = sumIntervalsSeconds(clipped);
        const attendancePercentage = Math.min(
          100,
          Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100
        );
        const firstValidTeachingJoin = clipped.length > 0 ? new Date(clipped[0].startMs) : null;
        const lateArrivalSeconds = firstValidTeachingJoin
          ? Math.max(0, Math.floor((firstValidTeachingJoin.getTime() - startMs) / 1000))
          : 0;
        const isLate = lateArrivalSeconds > STUDENT_LATE_THRESHOLD_SECONDS;

        let attendanceStatus = "ABSENT";
        if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT) {
          attendanceStatus = isLate ? "LATE" : "PRESENT";
        }

        const updated = await SessionAttendance.findOneAndUpdate(
          { sessionId: session._id, studentId: enrollment.studentId },
          {
            $set: {
              classId: session.classId,
              leftAt: existing.leftAt || now,
              scheduledDurationSeconds,
              scheduledOnlineSeconds,
              attendancePercentage,
              lateArrivalSeconds,
              isLate,
              attendanceStatus,
              evaluationStatus: "FINALIZED",
              finalizedAt: now,
              isCurrentlyConnected: false,
            },
          },
          { upsert: true, returnDocument: "after" }
        ).lean();
        results.push(updated);
        continue;
      }
    } else if (existing && existing.joinedAt) {
      // Legacy test compatibility when no intervals were used
      const updated = await SessionAttendance.findOneAndUpdate(
        { sessionId: session._id, studentId: enrollment.studentId },
        {
          $set: {
            leftAt: existing.leftAt || now,
            evaluationStatus: "FINALIZED",
            finalizedAt: now,
            isCurrentlyConnected: false,
          },
        },
        { returnDocument: "after" }
      ).lean();
      results.push(updated);
      continue;
    }

    const isExcusedCancel =
      session.status === "CANCELLED" &&
      ["TEACHER_NO_SHOW", "INCIDENT_CANCELLED", "RESCHEDULED"].includes(session.endReason);
    const statusForAbsent = isExcusedCancel
      ? session.endReason === "TEACHER_NO_SHOW"
        ? "NOT_EVALUATED"
        : "EXCUSED"
      : "ABSENT";

    const updated = await SessionAttendance.findOneAndUpdate(
      { sessionId: session._id, studentId: enrollment.studentId },
      {
        $set: {
          classId: session.classId,
          scheduledDurationSeconds,
          scheduledOnlineSeconds: 0,
          attendancePercentage: 0,
          attendanceStatus: statusForAbsent,
          evaluationStatus: isExcusedCancel ? statusForAbsent : "FINALIZED",
          finalizedAt: now,
          isCurrentlyConnected: false,
        },
      },
      { upsert: true, returnDocument: "after" }
    ).lean();
    results.push(updated);
  }

  // Flag teacher brief-presence gaming (< configurable 5m threshold) for Admin review without auto-penalty
  const teacherMetrics = await computeTeacherPresenceMetrics(session, now);
  const tp = session.teacherPresence || {};
  tp.totalOnlineSeconds = teacherMetrics.rawOnlineSeconds;
  tp.scheduledOnlineSeconds = teacherMetrics.scheduledOnlineSeconds;

  const minBriefPresenceSec = getTeacherBriefPresenceMinSeconds();
  if (
    tp.firstTeachingJoinAt &&
    teacherMetrics.scheduledOnlineSeconds < minBriefPresenceSec &&
    !tp.briefPresenceFlaggedAt &&
    session.status === "COMPLETED"
  ) {
    tp.briefPresenceFlaggedAt = now;
    await incidentService.recordOrEscalateTeacherViolation({
      session,
      violationCategory: "ABANDONMENT",
      violationType: "TEACHER_BRIEF_PRESENCE",
      severity: "RED",
      detectedAt: now,
      absenceDurationSeconds: Math.max(
        0,
        scheduledDurationSeconds - teacherMetrics.scheduledOnlineSeconds
      ),
      note: `Proposed threshold alert (Admin review required, no automatic financial/contract penalty): Teacher was present for only ${teacherMetrics.scheduledOnlineSeconds}s during scheduled session (< ${minBriefPresenceSec}s threshold)`,
    });
  }

  session.teacherPresence = tp;
  session.attendanceFinalizedAt = now;
  await session.save();

  return results;
};

/**
 * Handles signed LiveKit webhook events:
 * - participant_joined
 * - participant_left / participant_disconnected
 * - room_finished
 * - egress_ended
 */
const handleLiveKitEvent = async (event) => {
  if (!event) return { handled: false };

  const eventType = event.event;
  const eventId = event.id || null;
  const eventTime = event.createdAt
    ? new Date(Number(event.createdAt) > 1e12 ? Number(event.createdAt) : Number(event.createdAt) * 1000)
    : new Date();

  if (
    eventType === "participant_joined" ||
    eventType === "participant_left" ||
    eventType === "participant_disconnected"
  ) {
    const roomName = event.room?.name;
    const participant = event.participant || {};
    const userId = participant.identity;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return { handled: false, reason: "INVALID_PARTICIPANT_IDENTITY" };
    }
    const accountExists = await User.exists({ _id: userId });
    if (!accountExists) {
      return { handled: false, reason: "UNKNOWN_USER_ACCOUNT" };
    }

    const connectionSessionId =
      participant.sid || `lk_${userId}_${eventId || eventTime.getTime()}`;

    let session = null;
    if (roomName) {
      session = await Session.findOne({ meetingRoomId: roomName });
      if (!session && roomName.startsWith("room_")) {
        const possibleId = roomName.replace(/^room_/, "");
        if (mongoose.isValidObjectId(possibleId)) {
          session = await Session.findById(possibleId);
        }
      }
    }
    if (!session) return { handled: false, reason: "SESSION_NOT_FOUND" };

    let role = "STUDENT";
    if (participant.metadata) {
      try {
        const meta = JSON.parse(participant.metadata);
        if (meta.sessionId && String(meta.sessionId) !== String(session._id)) {
          return { handled: false, reason: "SESSION_METADATA_MISMATCH" };
        }
        if (meta.role) role = meta.role;
      } catch {
        // ignore malformed metadata
      }
    }
    if (session.teacherId.toString() === String(userId)) {
      role = "TEACHER";
    }

    if (eventType === "participant_joined") {
      return recordParticipantConnected({
        sessionId: session._id,
        userId,
        role,
        connectionSessionId,
        connectedAt: eventTime,
        eventId,
        source: "LIVEKIT_WEBHOOK",
      });
    }

    return recordParticipantDisconnected({
      sessionId: session._id,
      userId,
      connectionSessionId,
      disconnectedAt: eventTime,
      eventId,
      closeReason: eventType.toUpperCase(),
    });
  }

  if (eventType === "room_finished") {
    const roomName = event.room?.name;
    if (!roomName) return { handled: false };
    const session = await Session.findOne({ meetingRoomId: roomName });
    if (!session) return { handled: false };
    await closeAllOpenIntervalsForSession(session, eventTime, "ROOM_FINISHED");
    return { handled: true };
  }

  if (eventType === "egress_ended" && event.egressInfo) {
    const egressId = event.egressInfo.egressId;
    const status = event.egressInfo.status;
    const error = event.egressInfo.error;

    const session = await Session.findOne({
      $or: [
        { "recording.providerRecordingId": egressId },
        { "recordingSegments.providerRecordingId": egressId },
      ],
    });
    if (!session) return { handled: false };

    const isSuccess = status === 3 || status === "EGRESS_COMPLETE";
    // LiveKit reports the file duration in nanoseconds (as a string or bigint)
    const fileResult = (event.egressInfo.fileResults || [])[0] || event.egressInfo.file || null;
    const durationNs = fileResult && fileResult.duration != null ? Number(fileResult.duration) : NaN;
    const durationSeconds = Number.isFinite(durationNs) && durationNs > 0 ? Math.round(durationNs / 1e9) : null;
    const wasAlreadyFinal = session.recording && ["AVAILABLE", "FAILED", "EXPIRED"].includes(session.recording.status);

    if (session.recording && session.recording.providerRecordingId === egressId) {
      session.recording.stoppedAt = session.recording.stoppedAt || eventTime;
      if (durationSeconds !== null) session.recording.durationSeconds = durationSeconds;
      if (isSuccess) {
        session.recording.status = "AVAILABLE";
        session.recording.availableAt = eventTime;
        session.recording.failureReason = null;
      } else {
        session.recording.status = "FAILED";
        session.recording.failureReason = error || "Egress failed";
      }
    }

    if (Array.isArray(session.recordingSegments)) {
      session.recordingSegments = session.recordingSegments.map((seg) => {
        if (seg.providerRecordingId === egressId) {
          return {
            ...(seg.toObject ? seg.toObject() : seg),
            status: isSuccess ? "AVAILABLE" : "FAILED",
            availableAt: isSuccess ? eventTime : null,
            stoppedAt: seg.stoppedAt || eventTime,
            durationSeconds: durationSeconds ?? seg.durationSeconds ?? null,
            failureReason: isSuccess ? null : error || "Egress failed",
          };
        }
        return seg;
      });
    }

    await session.save();

    const isPlaybackRecording = session.recording && session.recording.providerRecordingId === egressId;
    if (isPlaybackRecording && !wasAlreadyFinal) {
      if (isSuccess) {
        const enrollments = await Enrollment.find({
          classId: session.classId,
          enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
        })
          .select("studentId")
          .lean();
        const recipients = [session.teacherId, ...enrollments.map((e) => e.studentId)];
        await Promise.all(
          recipients.map((userId) =>
            notifyOnce(
              userId,
              "Bản ghi buổi học đã sẵn sàng",
              `Bạn có thể xem lại buổi học "${session.title}".`,
              "SESSION_RECORDING_AVAILABLE",
              `session:${session._id}:recording_available:${egressId}:${userId}`,
              session._id
            )
          )
        );
      } else {
        await notifyOnce(
          session.teacherId,
          "Bản ghi buổi học bị lỗi",
          `Bản ghi của buổi học "${session.title}" xử lý không thành công.`,
          "SESSION_RECORDING_FAILED",
          `session:${session._id}:recording_failed:${egressId}`,
          session._id
        );
        await notifyAdminsOnce(
          "Bản ghi buổi học bị lỗi",
          `Bản ghi buổi "${session.title}" (${session.className}) thất bại: ${error || "Egress failed"}`,
          "ADMIN_RECORDING_FAILED",
          `session:${session._id}:admin:recording_failed:${egressId}`,
          session._id
        );
      }
    }
    return { handled: true };
  }

  return { handled: false };
};

/**
 * Evaluates a single session's lifecycle transitions and teacher lateness/absence milestones at `now`.
 * Designed to be idempotent and safe under concurrent or repeated scheduler invocations.
 */
const evaluateSessionLifecycleAt = async (sessionId, now = new Date()) => {
  const session = await Session.findById(sessionId);
  if (!session) return null;
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    return session.toObject();
  }
  // INTERRUPTED + ENDED is terminal: attendance is finalized and the room is closed
  if (session.status === "INTERRUPTED" && session.roomState === "ENDED") {
    return session.toObject();
  }

  // Reconcile with trusted LiveKit room state if LiveKit is configured/mocked
  await reconcileSessionWithLiveKit(session, now);

  const nowMs = now.getTime();
  const startMs = session.startDatetime.getTime();
  const endMs = session.endDatetime.getTime();
  const preOpenMs = startMs - PRE_OPEN_BEFORE_MS;
  const graceEndMs = endMs + POST_END_GRACE_PERIOD_MS;
  const scheduledDurationSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));

  const enrollments = await Enrollment.find({
    classId: session.classId,
    enrollmentStatus: "CONFIRMED",
  })
    .select("_id studentId")
    .lean();

  const notifyAllStudents = async (title, content, type, dedupeSuffix) => {
    await Promise.all(
      enrollments.map((e) =>
        notifyOnce(
          e.studentId,
          title,
          content,
          type,
          `session:${session._id}:student:${e.studentId}:${dedupeSuffix}`,
          session._id
        )
      )
    );
  };

  // 1. Pre-open waiting room window (startDatetime - 10 minutes <= now < startDatetime)
  if (nowMs >= preOpenMs && nowMs < startMs) {
    if (session.roomState === "NOT_OPEN" || session.status === "SCHEDULED") {
      if (session.status === "SCHEDULED") session.status = "WAITING";
      session.roomState = "WAITING";
      session.lifecycleState = "WAITING";
      if (!session.preOpenedAt) session.preOpenedAt = now;
      if (!session.meetingRoomId) session.meetingRoomId = `room_${session._id}`;
      await session.save();

      const recordingNotice = videoProvider.isRecordingRequired()
        ? " Buổi học sẽ được ghi hình từ khi giáo viên bắt đầu giảng dạy; bản ghi chỉ dành cho giáo viên, học viên của lớp và quản trị viên."
        : "";
      await notifyOnce(
        session.teacherId,
        "Phòng học đã mở",
        `Phòng học của buổi "${session.title}" đã mở. Bạn có thể vào kiểm tra camera, micro trước giờ học và nhấn "Bắt đầu buổi học" khi sẵn sàng.${recordingNotice}`,
        "SESSION_ROOM_OPENED",
        `session:${session._id}:teacher:room_opened`,
        session._id
      );
      await notifyAllStudents(
        "Buổi học sắp bắt đầu",
        `Phòng học của buổi "${session.title}" đã mở, buổi học bắt đầu sau ít phút nữa.${recordingNotice}`,
        "SESSION_ROOM_OPENED",
        "room_opened"
      );
    }
    return session.toObject();
  }

  // 2. Official start time reached (now >= startDatetime)
  if (nowMs >= startMs) {
    const tp = session.teacherPresence || {};

    // Check actual teacher open interval in SessionPresenceInterval
    const teacherOpenInterval = await SessionPresenceInterval.findOne({
      sessionId: session._id,
      userId: session.teacherId,
      disconnectedAt: null,
      source: { $in: TRUSTED_PRESENCE_SOURCES },
    }).lean();

    const isTeacherActuallyConnected =
      Boolean(teacherOpenInterval) ||
      Boolean(tp.isCurrentlyConnected && !tp.currentAbsenceStartedAt);

    // Teacher in the room but teaching not started: lateness is measured from the room presence; if the Teacher
    // still has not pressed "Bắt đầu buổi học" AUTO_START_AFTER_MS after the start, the system starts it.
    if (
      (session.status === "SCHEDULED" || session.status === "WAITING") &&
      isTeacherActuallyConnected &&
      nowMs <= endMs
    ) {
      if (!tp.firstTeachingJoinAt) {
        tp.firstTeachingJoinAt = session.startDatetime;
        tp.isCurrentlyConnected = true;
        session.teacherPresence = tp;
        await session.save();
      }
      const presentSinceMs = Math.max(startMs, new Date(tp.firstTeachingJoinAt).getTime());
      if (nowMs - presentSinceMs >= getAutoStartAfterMs()) {
        try {
          await beginTeaching(session._id, { startedBy: "SYSTEM", now });
          await notifyOnce(
            session.teacherId,
            "Hệ thống đã tự động bắt đầu buổi học",
            `Buổi học "${session.title}" đã được tự động bắt đầu vì bạn đã ở trong phòng nhưng chưa nhấn "Bắt đầu buổi học".`,
            "SESSION_AUTO_STARTED",
            `session:${session._id}:teacher:auto_started`,
            session._id
          );
        } catch (err) {
          console.error(`[sessionLifecycle] Auto-start failed for session ${session._id}:`, err.message);
        }
        const refreshed = await Session.findById(session._id).lean();
        return refreshed;
      }
    }

    const teacherHasJoinedTeaching = Boolean(tp.firstTeachingJoinAt);

    // 2a. Teacher has NOT joined teaching period yet -> check +10m, +20m, +30m lateness milestones
    if (!teacherHasJoinedTeaching) {
      const lateMs = nowMs - startMs;

      // +10m YELLOW WARNING
      if (lateMs >= TEACHER_YELLOW_LATE_MS && !tp.yellowWarningTriggeredAt && nowMs <= endMs) {
        tp.yellowWarningTriggeredAt = now;
        session.teacherPresence = tp;
        await session.save();

        await incidentService.recordOrEscalateTeacherViolation({
          session,
          violationCategory: "START_LATENESS",
          violationType: "TEACHER_LATE_10M",
          severity: "YELLOW",
          detectedAt: now,
          absenceDurationSeconds: Math.round(lateMs / 1000),
          note: "Teacher has not joined 10 minutes after scheduled start",
        });

        await notifyOnce(
          session.teacherId,
          "Cảnh báo Vàng (YELLOW): Trễ giờ vào lớp 10 phút",
          `Bạn đã trễ 10 phút so với giờ bắt đầu buổi học "${session.title}". Vui lòng vào lớp ngay hoặc gửi báo cáo sự cố.`,
          "TEACHER_WARNING_YELLOW",
          `session:${session._id}:teacher:late_10m`,
          session._id
        );

        await notifyAllStudents(
          "Giáo viên đang vào lớp trễ",
          `Giáo viên của buổi học "${session.title}" hiện chưa vào phòng sau 10 phút. Hệ thống đã gửi nhắc nhở và đang theo dõi.`,
          "SESSION_TEACHER_LATE_10M",
          "late_10m"
        );
      }

      // +20m RED VIOLATION
      if (lateMs >= TEACHER_RED_LATE_MS && !tp.redViolationTriggeredAt && nowMs <= endMs) {
        tp.redViolationTriggeredAt = now;
        session.teacherPresence = tp;
        await session.save();

        await incidentService.recordOrEscalateTeacherViolation({
          session,
          violationCategory: "START_LATENESS",
          violationType: "TEACHER_LATE_20M",
          severity: "RED",
          detectedAt: now,
          absenceDurationSeconds: Math.round(lateMs / 1000),
          note: "Teacher has not joined 20 minutes after scheduled start",
        });

        await notifyOnce(
          session.teacherId,
          "Cảnh báo Đỏ (RED): Trễ giờ vào lớp 20 phút",
          `Bạn đã trễ 20 phút tại buổi học "${session.title}". Nếu không vào lớp trước mốc 30 phút, buổi học sẽ tự động hủy do vắng dạy.`,
          "TEACHER_VIOLATION_RED",
          `session:${session._id}:teacher:late_20m`,
          session._id
        );

        await notifyAdminsOnce(
          "Cảnh báo Đỏ: Giáo viên trễ 20 phút chưa vào lớp",
          `Giáo viên buổi "${session.title}" (${session.className}) đã trễ 20 phút chưa vào lớp.`,
          "ADMIN_TEACHER_LATE_20M",
          `session:${session._id}:admin:late_20m`,
          session._id
        );

        await notifyAllStudents(
          "Cập nhật tình trạng lớp học (20 phút)",
          `Giáo viên vẫn chưa thể kết nối vào buổi học "${session.title}" sau 20 phút. Nếu giáo viên không vào trước mốc 30 phút, buổi học sẽ được hủy và chuyển sang xử lý học bù / hoàn phí.`,
          "SESSION_TEACHER_LATE_20M",
          "late_20m"
        );
      }

      // +30m NO_SHOW AUTO-CANCELLATION
      if (lateMs >= TEACHER_NO_SHOW_CANCEL_MS && !tp.noShowCancelledAt) {
        tp.noShowCancelledAt = now;
        session.status = "CANCELLED";
        session.roomState = "CANCELLED";
        session.lifecycleState = "CANCELLED";
        session.endReason = "TEACHER_NO_SHOW";
        session.actualEndAt = now;
        session.teacherPresence = tp;
        await session.save();

        await incidentService.recordOrEscalateTeacherViolation({
          session,
          violationCategory: "START_LATENESS",
          violationType: "TEACHER_NO_SHOW_30M",
          severity: "NO_SHOW",
          detectedAt: now,
          absenceDurationSeconds: Math.round(lateMs / 1000),
          note: "Teacher did not join within 30 minutes of scheduled start; session auto-cancelled",
        });

        await finalizeSessionAttendance(session._id, { now, forceRecalculate: true });
        await incidentService.createSafeRefundReviewsForSession(session, "TEACHER_NO_SHOW");
        await videoProvider.closeRoom(session.meetingRoomId);

        await notifyOnce(
          session.teacherId,
          "Buổi học đã bị hủy tự động (Vắng dạy 30 phút - NO_SHOW)",
          `Buổi học "${session.title}" đã bị hủy do bạn không vào lớp sau 30 phút. Bạn có 24 giờ để gửi báo cáo sự cố kèm minh chứng nếu có lý do bất khả kháng.`,
          "TEACHER_NO_SHOW_CANCELLED",
          `session:${session._id}:teacher:no_show_30m`,
          session._id
        );

        await notifyAdminsOnce(
          "Buổi học tự động hủy do Giáo viên vắng mặt 30 phút (NO_SHOW)",
          `Buổi học "${session.title}" (${session.className}) đã tự động chuyển sang CANCELLED (TEACHER_NO_SHOW).`,
          "ADMIN_TEACHER_NO_SHOW",
          `session:${session._id}:admin:no_show_30m`,
          session._id
        );

        await notifyAllStudents(
          "Buổi học đã tạm hủy do giáo viên vắng mặt",
          `Buổi học "${session.title}" đã bị hủy tự động sau 30 phút giáo viên không kết nối. Bạn không bị tính vắng mặt và hệ thống đã ghi nhận yêu cầu học bù / rà soát quyền lợi cho bạn.`,
          "SESSION_CANCELLED_TEACHER_NO_SHOW",
          "no_show_30m"
        );

        return session.toObject();
      }
    } else {
      // 2b. Teacher HAS joined earlier.
      // Check if teacher disconnected before endDatetime and has been continuously absent for >= 30 minutes.
      // Must NOT interrupt before the full 30-minute continuous absence has elapsed (even if endDatetime passes first).
      if (!isTeacherActuallyConnected && tp.currentAbsenceStartedAt && !tp.earlyLeaveTriggeredAt) {
        const absenceStartMs = new Date(tp.currentAbsenceStartedAt).getTime();
        const continuousAbsenceMs = nowMs - absenceStartMs;

        if (
          absenceStartMs < endMs &&
          continuousAbsenceMs >= TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS
        ) {
          const teacherMetrics = await computeTeacherPresenceMetrics(session, now);
          const teachingRatio =
            Math.round((teacherMetrics.scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) /
            100;
          const leftNearScheduledEnd = endMs - absenceStartMs <= 15 * 60 * 1000;
          const effectivelyCompletedClass = teachingRatio >= 70 && leftNearScheduledEnd;

          tp.earlyLeaveTriggeredAt = now;
          tp.maxContinuousAbsenceSeconds = Math.max(
            tp.maxContinuousAbsenceSeconds || 0,
            Math.round(continuousAbsenceMs / 1000)
          );
          tp.totalOnlineSeconds = teacherMetrics.rawOnlineSeconds;
          tp.scheduledOnlineSeconds = teacherMetrics.scheduledOnlineSeconds;

          session.status = "INTERRUPTED";
          session.roomState = "INTERRUPTED";
          session.lifecycleState = "INTERRUPTED";
          session.endReason = "TEACHER_LEFT_EARLY";
          session.teacherPresence = tp;
          await session.save();

          await stopActiveRecordingSegment(session, "TEACHER_LEFT_EARLY");

          const violationNote = effectivelyCompletedClass
            ? `Teacher disconnected ${Math.round((endMs - absenceStartMs) / 60000)}m before scheduled end after teaching ${teachingRatio}% of the class and remained absent for 30 continuous minutes; evidence preserved and referred for Admin review (no automatic penalty).`
            : `Teacher left the classroom and did not return for 30 continuous minutes (taught ${teachingRatio}% of scheduled duration); referred for Admin review.`;

          await incidentService.recordOrEscalateTeacherViolation({
            session,
            violationCategory: "EARLY_LEAVE",
            violationType: "TEACHER_LEFT_EARLY_30M",
            severity: "EARLY_LEAVE",
            detectedAt: now,
            absenceDurationSeconds: Math.round(continuousAbsenceMs / 1000),
            note: violationNote,
          });

          if (!effectivelyCompletedClass) {
            await incidentService.createSafeRefundReviewsForSession(session, "TEACHER_LEFT_EARLY");
          }

          await notifyOnce(
            session.teacherId,
            "Buổi học bị gián đoạn (Rời lớp quá 30 phút)",
            `Bạn đã mất kết nối / rời khỏi buổi học "${session.title}" quá 30 phút liên tục. Buổi học được đánh dấu INTERRUPTED (TEACHER_LEFT_EARLY). Vui lòng gửi báo cáo sự cố nếu gặp lỗi kỹ thuật.`,
            "TEACHER_LEFT_EARLY_30M",
            `session:${session._id}:teacher:left_early_30m`,
            session._id
          );

          await notifyAdminsOnce(
            "Giáo viên rời lớp quá 30 phút không quay lại",
            `Buổi học "${session.title}" (${session.className}) chuyển sang trạng thái INTERRUPTED (TEACHER_LEFT_EARLY). Đã lưu bằng chứng hiện diện (${teachingRatio}%) để Admin xem xét.`,
            "ADMIN_TEACHER_LEFT_EARLY",
            `session:${session._id}:admin:left_early_30m`,
            session._id
          );

          await notifyAllStudents(
            "Buổi học bị gián đoạn do giáo viên mất kết nối quá 30 phút",
            `Buổi học "${session.title}" đã tạm dừng do giáo viên rời phòng quá 30 phút. Thời gian bạn đã tham gia vẫn được bảo lưu đầy đủ.`,
            "SESSION_INTERRUPTED_TEACHER_ABSENT",
            "left_early_30m"
          );

          return session.toObject();
        }
      }
    }

    // 3. Past scheduled endDatetime: overtime reminder & safe auto-completion check
    if (nowMs > endMs) {
      if (session.status === "IN_PROGRESS") {
        if (isTeacherActuallyConnected) {
          session.roomState = "GRACE_PERIOD";
        }
        if (!tp.overtimeRemindedAt) {
          tp.overtimeRemindedAt = now;
          session.teacherPresence = tp;
          await notifyOnce(
            session.teacherId,
            "Nhắc nhở: Đã quá giờ kết thúc buổi học theo lịch",
            `Buổi học "${session.title}" đã qua giờ kết thúc theo lịch. Phòng học và ghi hình vẫn đang được duy trì khi bạn còn trong lớp. Vui lòng nhấn Kết thúc buổi học khi hoàn tất giảng dạy.`,
            "TEACHER_OVERTIME_REMINDER",
            `session:${session._id}:teacher:overtime_reminder`,
            session._id
          );
        }
        await session.save();
      }

      // APPROVED BUSINESS RULE (TIN-05D/E-FIX01):
      // NEVER auto-complete a session while the teacher is still actively connected,
      // OR while the teacher's continuous absence is still under the 30-minute grace threshold.
      if (isTeacherActuallyConnected) {
        return session.toObject();
      }

      const disconnectRef = tp.currentAbsenceStartedAt || tp.lastDisconnectedAt;
      if (disconnectRef) {
        const absenceElapsedMs = nowMs - new Date(disconnectRef).getTime();
        if (absenceElapsedMs < TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS) {
          // Respect the full 30-minute continuous teacher absence period before any auto-action
          return session.toObject();
        }
      }

      // Only when past endDatetime + 30m AND teacher is confirmed disconnected for >= 30 continuous minutes:
      if (nowMs > graceEndMs) {
        await stopActiveRecordingSegment(session, "AUTO_COMPLETED");
        await closeAllOpenIntervalsForSession(session, now, "AUTO_COMPLETED");

        if (session.status === "INTERRUPTED") {
          session.roomState = "ENDED";
          session.actualEndAt = session.actualEndAt || now;
          await session.save();
          await finalizeSessionAttendance(session._id, { now, forceRecalculate: true });
          await videoProvider.closeRoom(session.meetingRoomId);
          return session.toObject();
        }

        session.status = "COMPLETED";
        session.roomState = "ENDED";
        session.lifecycleState = "AUTO_COMPLETED";
        session.endReason = session.endReason || "AUTO_COMPLETED";
        session.actualEndAt = now;
        await session.save();

        await finalizeSessionAttendance(session._id, { now, forceRecalculate: true });
        await videoProvider.closeRoom(session.meetingRoomId);

        await notifyOnce(
          session.teacherId,
          "Buổi học đã tự động hoàn tất (AUTO_COMPLETED)",
          `Buổi học "${session.title}" đã tự động đóng và chốt điểm danh sau khi giáo viên đã rời phòng quá 30 phút sau giờ kết thúc.`,
          "SESSION_AUTO_COMPLETED",
          `session:${session._id}:teacher:auto_completed`,
          session._id
        );
      }
    }
  }

  return session.toObject();
};

/**
 * Returns live session status & smart attendance summary for Classroom UI, Teacher, and Student.
 */
const getSessionLiveStatus = async (user, sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  }
  const session = await Session.findById(sessionId).lean();
  if (!session) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  if (user.role === "TEACHER" && session.teacherId.toString() !== user.id.toString()) {
    throw FORBIDDEN("You can only view live status of your own sessions");
  }
  if (user.role === "STUDENT") {
    const enrolled = await Enrollment.exists({
      studentId: user.id,
      classId: session.classId,
      enrollmentStatus: "CONFIRMED",
    });
    if (!enrolled) throw FORBIDDEN("Not enrolled in this class");
  }

  const now = new Date();
  if (session.status !== "COMPLETED" && session.status !== "CANCELLED") {
    await reconcileSessionWithLiveKit(session, now);
  }
  const startMs = new Date(session.startDatetime).getTime();
  const endMs = new Date(session.endDatetime).getTime();
  const preOpenAt = new Date(startMs - PRE_OPEN_BEFORE_MS);
  const studentFirstJoinDeadlineAt = new Date(startMs + STUDENT_FIRST_JOIN_DEADLINE_SECONDS * 1000);
  const autoCompleteAt = new Date(endMs + POST_END_GRACE_PERIOD_MS);

  let myAttendance = null;
  if (user.role === "STUDENT") {
    myAttendance = await calculateAndPersistStudentAttendance(session, user.id, now, false);
  }

  const violations = await mongoose
    .model("TeacherViolation")
    .find({ sessionId: session._id })
    .select("violationCategory violationType severity detectedAt reviewStatus")
    .lean();

  return {
    sessionId: session._id.toString(),
    title: session.title,
    className: session.className,
    status: session.status,
    roomState: session.roomState || "NOT_OPEN",
    lifecycleState: session.lifecycleState || session.status,
    endReason: session.endReason || null,
    startDatetime: session.startDatetime,
    endDatetime: session.endDatetime,
    preOpenAt,
    studentFirstJoinDeadlineAt,
    autoCompleteAt,
    isWaitingRoom: now >= preOpenAt && now < session.startDatetime,
    isInTeachingPeriod: now >= session.startDatetime && now <= session.endDatetime,
    isOvertimeGracePeriod: now > session.endDatetime && session.status === "IN_PROGRESS",
    teacherPresence: session.teacherPresence || {},
    recording: session.recording || null,
    recordingSegmentsCount: Array.isArray(session.recordingSegments)
      ? session.recordingSegments.length
      : 0,
    rescheduleMetadata: session.rescheduleMetadata || {},
    myAttendance,
    violations,
  };
};

module.exports = {
  PRE_OPEN_BEFORE_MS,
  STUDENT_LATE_THRESHOLD_SECONDS,
  STUDENT_FIRST_JOIN_DEADLINE_SECONDS,
  STUDENT_FIRST_JOIN_JITTER_TOLERANCE_SECONDS,
  TEACHER_YELLOW_LATE_MS,
  TEACHER_RED_LATE_MS,
  TEACHER_NO_SHOW_CANCEL_MS,
  TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS,
  TEACHER_BRIEF_PRESENCE_MIN_SECONDS,
  getTeacherBriefPresenceMinSeconds,
  POST_END_GRACE_PERIOD_MS,
  ATTENDANCE_THRESHOLD_PERCENT,
  mergeIntervals,
  clipIntervals,
  intersectIntervals,
  sumIntervalsSeconds,
  startTeachingRecordingSegmentIfNeeded,
  beginTeaching,
  stopActiveRecordingSegment,
  verifyAndRecordClientPresence,
  reconcileSessionWithLiveKit,
  recordParticipantConnected,
  recordParticipantDisconnected,
  computeTeacherPresenceMetrics,
  calculateAndPersistStudentAttendance,
  closeAllOpenIntervalsForSession,
  finalizeSessionAttendance,
  handleLiveKitEvent,
  evaluateSessionLifecycleAt,
  getSessionLiveStatus,
};
