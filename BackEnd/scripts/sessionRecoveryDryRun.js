/**
 * LiveSession recovery — READ-ONLY DRY RUN.
 *
 * Lists the Sessions that can be stuck "LIVE / ĐANG DIỄN RA" (or ended with cleanup left over) and classifies each one:
 *   SAFE_TO_AUTO_END  started by the Teacher, past endDatetime + 30m, nobody confirmed connected
 *   NEEDS_REVIEW      past endDatetime + 30m but someone is still confirmed in the room, or the data contradicts itself
 *   NOT_STARTED       never started by the Teacher (SCHEDULED/WAITING) and past its grace period: never auto-completed
 *   CLEANUP_PENDING   already ended, but a LiveKit room / open presence interval / running recording is left over
 *   HEALTHY           running or waiting within its normal lifecycle
 *
 * It only reads (Mongo finds + LiveKit ListParticipants when LiveKit is configured). It never writes, ends a Session,
 * closes a room or touches attendance/recordings. Applying the rule is the lifecycle job's job: once the fixed backend
 * runs, every SAFE_TO_AUTO_END and NEEDS_REVIEW Session is auto-ended by it — review this list before deploying.
 *
 * Usage (refuses to run without --read-only so it is never started by accident):
 *   node scripts/sessionRecoveryDryRun.js --read-only [--no-livekit] > report.json
 */
const mongoose = require("mongoose");
const { Session, SessionPresenceInterval } = require("../src/models");
const presenceService = require("../src/services/sessionPresenceService");
const videoProvider = require("../src/services/videoProvider");

const GRACE_MS = presenceService.POST_END_GRACE_PERIOD_MS;
const HEARTBEAT_MS = presenceService.PRESENCE_HEARTBEAT_TIMEOUT_MS;
const STARTED = ["IN_PROGRESS", "INTERRUPTED"];
const NOT_STARTED = ["SCHEDULED", "WAITING"];
// Same rule as sessionPresenceService: a recording entry is running until it has been stopped
const isActiveRecording = (r) => Boolean(r) && ["RECORDING", "PROCESSING"].includes(r.status) && !r.stoppedAt;

/** Pure classification of one Session from what was read about it. */
const classifySession = ({ session, openIntervals, freshIntervalCount, liveKitParticipants, now }) => {
  const graceEndMs = new Date(session.endDatetime).getTime() + GRACE_MS;
  const pastGrace = now.getTime() > graceEndMs;
  const final = presenceService.isSessionFinal(session);
  const peopleInRoom = (liveKitParticipants || 0) > 0 || freshIntervalCount > 0;
  const recordingRunning =
    isActiveRecording(session.recording) || (session.recordingSegments || []).some(isActiveRecording);

  if (final) {
    const leftovers = [];
    if (session.roomCleanupPendingAt) leftovers.push("room close failed earlier");
    if ((liveKitParticipants || 0) > 0) leftovers.push("LiveKit room still has participants");
    if (openIntervals.length) leftovers.push(`${openIntervals.length} presence interval(s) still open`);
    if (recordingRunning) leftovers.push("recording still marked running");
    return leftovers.length
      ? { category: "CLEANUP_PENDING", action: "retry room close / close intervals / check recording", reason: leftovers.join("; ") }
      : { category: "HEALTHY", action: "none", reason: "ended and cleaned up" };
  }
  if (NOT_STARTED.includes(session.status)) {
    return pastGrace
      ? { category: "NOT_STARTED", action: "business decision (no auto-complete)", reason: "the Teacher never pressed Start" }
      : { category: "HEALTHY", action: "none", reason: "scheduled / waiting for the Teacher's Start" };
  }
  if (!STARTED.includes(session.status) || !pastGrace) {
    return { category: "HEALTHY", action: "none", reason: "within endDatetime + 30m" };
  }
  if (session.status === "IN_PROGRESS" && !session.actualStartAt) {
    return { category: "NEEDS_REVIEW", action: "check how it became IN_PROGRESS", reason: "IN_PROGRESS without actualStartAt" };
  }
  if (peopleInRoom) {
    return {
      category: "NEEDS_REVIEW",
      action: "contact the Teacher before the auto-end runs",
      reason: `past endDatetime + 30m but ${liveKitParticipants || 0} LiveKit participant(s), ${freshIntervalCount} confirmed connection(s)`,
    };
  }
  return { category: "SAFE_TO_AUTO_END", action: "auto-end (lifecycle job)", reason: "started, past endDatetime + 30m, nobody connected" };
};

/** Reads everything and returns the report. `checkLiveKit` false skips the provider call. */
const collectStuckSessionReport = async ({ now = new Date(), checkLiveKit = true } = {}) => {
  const openIntervalSessionIds = await SessionPresenceInterval.distinct("sessionId", { disconnectedAt: null });
  const sessions = await Session.find({
    $or: [
      { status: { $in: [...STARTED, ...NOT_STARTED] }, roomState: { $ne: "ENDED" }, startDatetime: { $lte: now } },
      { roomCleanupPendingAt: { $ne: null } },
      { _id: { $in: openIntervalSessionIds } },
      { "recording.status": "RECORDING", status: { $in: ["COMPLETED", "CANCELLED"] } },
    ],
  })
    .select(
      "classId teacherId status roomState lifecycleState startDatetime endDatetime actualStartAt actualEndAt endReason meetingRoomId teacherPresence recording recordingSegments roomCleanupPendingAt"
    )
    .sort({ endDatetime: 1 })
    .lean();

  const useLiveKit = checkLiveKit && videoProvider.getProviderName() === "LIVEKIT";
  const freshSince = new Date(now.getTime() - HEARTBEAT_MS);
  const records = [];
  for (const session of sessions) {
    const openIntervals = await SessionPresenceInterval.find({ sessionId: session._id, disconnectedAt: null })
      .select("userId role connectionSessionId connectedAt lastHeartbeatAt source")
      .lean();
    const freshIntervalCount = openIntervals.filter(
      (i) => new Date(i.lastHeartbeatAt || i.connectedAt).getTime() >= freshSince.getTime()
    ).length;
    let liveKitParticipants = null;
    let liveKitRoom = useLiveKit ? "UNKNOWN" : "NOT_CHECKED";
    if (useLiveKit && session.meetingRoomId) {
      const participants = await videoProvider.listRoomParticipants(session.meetingRoomId);
      if (Array.isArray(participants)) {
        liveKitParticipants = participants.filter((p) => p && p.state !== "DISCONNECTED").length;
        liveKitRoom = liveKitParticipants > 0 ? "HAS_PARTICIPANTS" : "EMPTY_OR_GONE";
      }
    }
    const verdict = classifySession({ session, openIntervals, freshIntervalCount, liveKitParticipants, now });
    const lastHeartbeatAt = openIntervals.reduce(
      (max, i) => (i.lastHeartbeatAt && (!max || i.lastHeartbeatAt > max) ? i.lastHeartbeatAt : max),
      null
    );
    records.push({
      sessionId: String(session._id),
      classId: String(session.classId),
      teacherId: String(session.teacherId),
      status: session.status,
      roomState: session.roomState,
      startDatetime: session.startDatetime,
      endDatetime: session.endDatetime,
      actualStartAt: session.actualStartAt || null,
      actualEndAt: session.actualEndAt || null,
      endReason: session.endReason || null,
      lastHeartbeatAt,
      teacherFlagIsCurrentlyConnected: Boolean(session.teacherPresence?.isCurrentlyConnected),
      openIntervals: openIntervals.map((i) => ({ userId: String(i.userId), role: i.role, connectedAt: i.connectedAt, lastHeartbeatAt: i.lastHeartbeatAt || null })),
      meetingRoomId: session.meetingRoomId || null,
      liveKitRoom,
      liveKitParticipants,
      recordingStatus: session.recording?.status || null,
      overdueMinutes: Math.max(0, Math.round((now.getTime() - new Date(session.endDatetime).getTime() - GRACE_MS) / 60000)),
      ...verdict,
    });
  }
  const summary = records.reduce((acc, r) => ({ ...acc, [r.category]: (acc[r.category] || 0) + 1 }), {});
  return { generatedAt: now, readOnly: true, liveKitChecked: useLiveKit, summary, records };
};

if (require.main === module) {
  if (!process.argv.includes("--read-only")) {
    console.error("Refusing to run: pass --read-only to confirm this dry run (it never writes).");
    process.exit(2);
  }
  require("dotenv").config();
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    try {
      const report = await collectStuckSessionReport({ checkLiveKit: !process.argv.includes("--no-livekit") });
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch((err) => {
    console.error("Dry run failed:", err.message);
    process.exit(1);
  });
}

module.exports = { classifySession, collectStuckSessionReport };
