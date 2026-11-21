const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Class,
  Session,
  Enrollment,
  SessionAttendance,
  SessionPresenceInterval,
  Notification,
} = require("../src/models");
const sessionService = require("../src/services/sessionService");
const presenceService = require("../src/services/sessionPresenceService");
const videoProvider = require("../src/services/videoProvider");
const { runSessionLifecycleJob } = require("../src/jobs/sessionLifecycleJob");
const { classifySession, collectStuckSessionReport } = require("../scripts/sessionRecoveryDryRun");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const MIN = 60 * 1000;
const as = (user) => ({ "x-user-id": user._id.toString() });

describe("LiveSession lifecycle fix: heartbeat presence, connection mapping, LiveKit reconcile, auto-end +30m, recovery", () => {
  let teacher, student, student2, cls;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });
  afterAll(async () => {
    await disconnectDB();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await clearDB();
    teacher = await User.create({
      email: "t@lsfix.test",
      passwordHash: "x",
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher", verificationStatus: "VERIFIED" },
    });
    student = await User.create({ email: "s1@lsfix.test", passwordHash: "x", role: "STUDENT", studentProfile: { fullName: "S1" } });
    student2 = await User.create({ email: "s2@lsfix.test", passwordHash: "x", role: "STUDENT", studentProfile: { fullName: "S2" } });
    const id = () => new mongoose.Types.ObjectId();
    cls = await Class.create({
      courseId: id(),
      courseTitle: "C",
      teacherId: teacher._id,
      teacherName: "Teacher",
      categoryId: id(),
      subjectId: id(),
      className: "K",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "OPEN",
    });
    await Enrollment.create({
      studentId: student._id,
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
  });

  // A Session starting `startOffsetMin` from now, 60 minutes long
  const mk = (startOffsetMin, extra = {}) =>
    Session.create({
      classId: cls._id,
      className: "K",
      teacherId: teacher._id,
      title: "S",
      status: "SCHEDULED",
      startDatetime: new Date(Date.now() + startOffsetMin * MIN),
      endDatetime: new Date(Date.now() + (startOffsetMin + 60) * MIN),
      ...extra,
    });
  const host = () => ({ id: teacher._id.toString(), role: "TEACHER" });
  const fromEnd = (s, minutes) => new Date(new Date(s.endDatetime).getTime() + minutes * MIN);
  const reload = (s) => Session.findById(s._id).lean();

  // LiveKit as seen by the backend: `room` is the mutable list ListParticipants returns
  const mockLiveKit = () => {
    const room = { participants: [] };
    jest.spyOn(videoProvider, "getProviderName").mockReturnValue("LIVEKIT");
    jest.spyOn(videoProvider, "isRecordingRequired").mockReturnValue(false);
    jest.spyOn(videoProvider, "listRoomParticipants").mockImplementation(async () => room.participants);
    jest.spyOn(videoProvider, "verifyParticipantInRoom").mockImplementation(async (roomId, identity) => {
      const p = room.participants.find((x) => x.identity === identity);
      return p ? { verified: true, participant: p } : { verified: false, reason: "NOT_IN_ROOM", participant: null };
    });
    jest.spyOn(videoProvider, "closeRoom").mockResolvedValue(true);
    const enter = (user, sid) =>
      room.participants.push({ identity: user._id.toString(), sid, state: "ACTIVE", joinedAt: Math.floor(Date.now() / 1000) });
    const leave = (user) => {
      room.participants = room.participants.filter((x) => x.identity !== user._id.toString());
    };
    return { room, enter, leave };
  };

  const connect = (user, s, clientId, now = new Date()) =>
    presenceService.verifyAndRecordClientPresence({
      sessionId: s._id,
      userId: user._id,
      role: user.role,
      connectionSessionId: clientId,
      action: "CONNECT",
      now,
    });

  // Teacher in the LiveKit room, presses Start; returns the started Session
  const startLive = async (lk, startOffsetMin = -5) => {
    const s = await mk(startOffsetMin);
    await sessionService.joinSession(host(), s._id.toString());
    lk.enter(teacher, "PA_teacher_1");
    await connect(teacher, s, "client-teacher-1");
    await sessionService.startSession(teacher._id.toString(), s._id.toString());
    return reload(s);
  };

  // ---------------------------------------------------------------- Teacher Start
  describe("Teacher Start", () => {
    it("Teacher Join and opening the room never start the Session; only Start does, exactly once (concurrent Starts)", async () => {
      const s = await mk(-2);
      await sessionService.joinSession(host(), s._id.toString());
      await runSessionLifecycleJob(new Date());
      expect((await reload(s)).status).toBe("WAITING");

      const results = await Promise.allSettled([
        request(app).post(`/api/teacher/sessions/${s._id}/start`).set(as(teacher)),
        request(app).post(`/api/teacher/sessions/${s._id}/start`).set(as(teacher)),
      ]);
      const codes = results.map((r) => r.value.status).sort();
      expect(codes[0]).toBe(200);
      expect(codes[1]).toBe(409);
      const started = await reload(s);
      expect(started.status).toBe("IN_PROGRESS");
      expect(started.roomState).toBe("LIVE");
      expect(started.actualStartAt).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------- Student Join
  describe("Student Join", () => {
    it("is refused for an IN_PROGRESS + LIVE Session past its end even when the scheduler has not run", async () => {
      const s = await mk(-120, { status: "IN_PROGRESS", roomState: "LIVE", actualStartAt: new Date(Date.now() - 120 * MIN) });
      const res = await request(app).post(`/api/sessions/${s._id}/join`).set(as(student));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("SESSION_NOT_JOINABLE");
      expect(res.body.accessToken).toBeUndefined();
    });

    it.each([
      ["COMPLETED", "SESSION_ENDED"],
      ["CANCELLED", "SESSION_CANCELLED"],
    ])("is refused for a %s Session (%s)", async (status, code) => {
      const s = await mk(-5, { status, roomState: status === "COMPLETED" ? "ENDED" : "CANCELLED" });
      const res = await request(app).post(`/api/sessions/${s._id}/join`).set(as(student));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(code);
    });
  });

  // ---------------------------------------------------------------- Presence
  describe("Presence: heartbeat and connection mapping", () => {
    it("connect stores the LiveKit sid + the tab's client id; heartbeat refreshes lastHeartbeatAt", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      const [interval] = await SessionPresenceInterval.find({ sessionId: s._id, userId: teacher._id }).lean();
      expect(interval.connectionSessionId).toBe("PA_teacher_1");
      expect(interval.clientConnectionId).toBe("client-teacher-1");
      expect(interval.lastHeartbeatAt).toBeTruthy();

      const later = new Date(Date.now() + 30 * 1000);
      await presenceService.verifyAndRecordClientPresence({
        sessionId: s._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "client-teacher-1",
        action: "HEARTBEAT",
        now: later,
      });
      const after = await SessionPresenceInterval.findById(interval._id).lean();
      expect(after.lastHeartbeatAt.getTime()).toBe(later.getTime());
    });

    it("leave with the client id closes the interval keyed by the LiveKit sid; a repeated leave changes nothing", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      lk.enter(student, "PA_student_1");
      await connect(student, s, "client-student-1");

      const leftAt = new Date();
      const res = await request(app)
        .post(`/api/sessions/${s._id}/presence/leave`)
        .set(as(student))
        .send({ connectionSessionId: "client-student-1" });
      expect(res.status).toBe(200);
      const closed = await SessionPresenceInterval.findOne({ sessionId: s._id, userId: student._id }).lean();
      expect(closed.disconnectedAt).toBeTruthy();
      expect(closed.closeReason).toBe("LEAVE_API");
      const att1 = await SessionAttendance.findOne({ sessionId: s._id, studentId: student._id }).lean();
      expect(att1.isCurrentlyConnected).toBe(false);

      const again = await presenceService.recordParticipantDisconnected({
        sessionId: s._id,
        userId: student._id,
        connectionSessionId: "client-student-1",
        disconnectedAt: new Date(leftAt.getTime() + 10 * MIN),
        closeReason: "LEAVE_API",
      });
      expect(again.deduplicated).toBe(true);
      const att2 = await SessionAttendance.findOne({ sessionId: s._id, studentId: student._id }).lean();
      expect(att2.leftAt.getTime()).toBe(att1.leftAt.getTime());

      // Student leave never ends the Session
      expect((await reload(s)).status).toBe("IN_PROGRESS");
    });

    it("the leave of one tab does not close another tab's connection", async () => {
      const s = await mk(-5, { status: "IN_PROGRESS", roomState: "LIVE", actualStartAt: new Date() });
      for (const [sid, client] of [["PA_a", "tab-a"], ["PA_b", "tab-b"]]) {
        await presenceService.recordParticipantConnected({
          sessionId: s._id,
          userId: student._id,
          role: "STUDENT",
          connectionSessionId: sid,
          clientConnectionId: client,
          source: "LIVEKIT_WEBHOOK",
        });
      }
      await presenceService.recordParticipantDisconnected({
        sessionId: s._id,
        userId: student._id,
        connectionSessionId: "tab-a",
        closeReason: "LEAVE_API",
      });
      const open = await SessionPresenceInterval.find({ sessionId: s._id, disconnectedAt: null }).lean();
      expect(open.map((i) => i.connectionSessionId)).toEqual(["PA_b"]);
      const att = await SessionAttendance.findOne({ sessionId: s._id, studentId: student._id }).lean();
      expect(att.isCurrentlyConnected).toBe(true);
    });

    it("a connection without heartbeat goes stale and is closed at its last confirmation; the Session keeps running", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk, -10);
      const [interval] = await SessionPresenceInterval.find({ sessionId: s._id, userId: teacher._id }).lean();
      // LiveKit cannot be reached (null = unknown, not "empty") and the tab stopped sending heartbeats
      videoProvider.listRoomParticipants.mockResolvedValue(null);

      await runSessionLifecycleJob(new Date(interval.lastHeartbeatAt.getTime() + 2 * MIN));
      expect((await SessionPresenceInterval.findById(interval._id).lean()).disconnectedAt).toBeNull();

      await runSessionLifecycleJob(new Date(interval.lastHeartbeatAt.getTime() + 4 * MIN));
      const closed = await SessionPresenceInterval.findById(interval._id).lean();
      expect(closed.closeReason).toBe("HEARTBEAT_TIMEOUT");
      expect(closed.disconnectedAt.getTime()).toBe(interval.lastHeartbeatAt.getTime());
      const after = await reload(s);
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.roomState).toBe("TEACHER_DISCONNECTED");
      expect(after.teacherPresence.isCurrentlyConnected).toBe(false);

      // Reconnecting with the same LiveKit connection opens a new interval instead of reusing the timed-out one
      videoProvider.listRoomParticipants.mockImplementation(async () => lk.room.participants);
      await connect(teacher, s, "client-teacher-1");
      const open = await SessionPresenceInterval.find({ sessionId: s._id, userId: teacher._id, disconnectedAt: null }).lean();
      expect(open).toHaveLength(1);
      expect(open[0]._id.toString()).not.toBe(interval._id.toString());
      expect((await reload(s)).roomState).toBe("LIVE");
    });

    it("a late join event for an ended Session does not reopen presence", async () => {
      const s = await mk(-70, { status: "COMPLETED", roomState: "ENDED" });
      const res = await presenceService.recordParticipantConnected({
        sessionId: s._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "PA_late",
        source: "LIVEKIT_WEBHOOK",
      });
      expect(res.ignored).toBe("SESSION_ENDED");
      expect(await SessionPresenceInterval.countDocuments({ sessionId: s._id })).toBe(0);
    });
  });

  // ---------------------------------------------------------------- LiveKit provider
  describe("LiveKit provider: room not found vs errors", () => {
    const env = {};
    beforeEach(() => {
      for (const k of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) env[k] = process.env[k];
      process.env.LIVEKIT_URL = "wss://lk.example.test";
      process.env.LIVEKIT_API_KEY = "key";
      process.env.LIVEKIT_API_SECRET = "secret-secret-secret-secret-secret";
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    const reply = (status, body) => jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

    it.each([
      ["404 not_found (room gone) -> no participants", 404, { code: "not_found", msg: "requested room does not exist" }, []],
      ["404 bad_route (wrong URL) -> unknown", 404, { code: "bad_route" }, null],
      ["401 unauthenticated -> unknown", 401, { code: "unauthenticated" }, null],
      ["503 unavailable -> unknown", 503, { code: "unavailable" }, null],
    ])("listRoomParticipants: %s", async (label, status, body, expected) => {
      reply(status, body);
      expect(await videoProvider.listRoomParticipants("room_x")).toEqual(expected);
    });

    it("listRoomParticipants: network error -> unknown", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNRESET"));
      expect(await videoProvider.listRoomParticipants("room_x")).toBeNull();
    });

    it("closeRoom: a room that no longer exists counts as closed; a server error does not", async () => {
      reply(404, { code: "not_found" });
      expect(await videoProvider.closeRoom("room_x")).toBe(true);
      reply(503, { code: "unavailable" });
      expect(await videoProvider.closeRoom("room_x")).toBe(false);
    });
  });

  // ---------------------------------------------------------------- Auto-end
  describe("Auto-end at endDatetime + 30 minutes", () => {
    it("audit case A: a stale teacherPresence flag (tab closed, no leave) no longer keeps the Session open", async () => {
      const s = await mk(5);
      await sessionService.joinSession(host(), s._id.toString());
      await sessionService.startSession(teacher._id.toString(), s._id.toString());
      await runSessionLifecycleJob(fromEnd(s, 31));
      const after = await reload(s);
      expect(after.status).toBe("COMPLETED");
      expect(after.roomState).toBe("ENDED");
      expect(after.endReason).toBe("AUTO_ENDED_AFTER_GRACE_PERIOD");
    });

    it("audit case C: leave with the client id + LiveKit room deleted -> presence closed, Session closed out", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      lk.leave(teacher); // room deleted by LiveKit: ListParticipants answers not_found -> []
      await request(app)
        .post(`/api/sessions/${s._id}/presence/leave`)
        .set(as(teacher))
        .send({ connectionSessionId: "client-teacher-1" });
      expect(await SessionPresenceInterval.countDocuments({ sessionId: s._id, disconnectedAt: null })).toBe(0);
      expect((await reload(s)).teacherPresence.isCurrentlyConnected).toBe(false);
      // The Teacher left mid-class for 30+ minutes: first INTERRUPTED (early-leave rule), then closed out after +30m
      await runSessionLifecycleJob(fromEnd(s, 3 * 24 * 60));
      await runSessionLifecycleJob(fromEnd(s, 3 * 24 * 60 + 1));
      const after = await reload(s);
      expect(after.status).toBe("INTERRUPTED");
      expect(after.roomState).toBe("ENDED");
      expect(after.attendanceFinalizedAt).toBeTruthy();
    });

    it("does not end before or exactly at +30m, ends right after; repeated runs act once", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      lk.enter(student, "PA_student_1");
      await connect(student, s, "client-student-1");

      await runSessionLifecycleJob(fromEnd(s, 10));
      expect((await reload(s)).status).toBe("IN_PROGRESS");
      await runSessionLifecycleJob(fromEnd(s, 30));
      expect((await reload(s)).status).toBe("IN_PROGRESS");

      // Teacher and student are still in the room: the Session is ended anyway
      const first = await runSessionLifecycleJob(fromEnd(s, 31));
      expect(first.autoEndedSessionIds).toEqual([s._id.toString()]);
      const ended = await reload(s);
      expect(ended.status).toBe("COMPLETED");
      expect(ended.roomState).toBe("ENDED");
      expect(ended.lifecycleState).toBe("AUTO_COMPLETED");
      expect(ended.endReason).toBe("AUTO_ENDED_AFTER_GRACE_PERIOD");
      expect(ended.actualEndAt).toBeTruthy();
      expect(ended.attendanceFinalizedAt).toBeTruthy();
      expect(await SessionPresenceInterval.countDocuments({ sessionId: s._id, disconnectedAt: null })).toBe(0);
      expect(videoProvider.closeRoom).toHaveBeenCalledWith(ended.meetingRoomId);
      const att = await SessionAttendance.findOne({ sessionId: s._id, studentId: student._id }).lean();
      expect(att.evaluationStatus).toBe("FINALIZED");
      const finalizedAt = ended.attendanceFinalizedAt.getTime();

      const second = await runSessionLifecycleJob(fromEnd(s, 40));
      expect(second.autoEndedSessionIds).toEqual([]);
      expect((await reload(s)).attendanceFinalizedAt.getTime()).toBe(finalizedAt);
      expect(await Notification.countDocuments({ userId: teacher._id, type: "SESSION_AUTO_COMPLETED" })).toBe(1);
    });

    it("concurrent evaluations (several instances) end the Session exactly once", async () => {
      const s = await mk(-120, { status: "IN_PROGRESS", roomState: "LIVE", actualStartAt: new Date(Date.now() - 120 * MIN) });
      const now = fromEnd(s, 31);
      const results = await Promise.all([1, 2, 3].map(() => presenceService.evaluateSessionLifecycleAt(s._id, now)));
      expect(results.filter((r) => r.autoEnded)).toHaveLength(1);
      expect(await Notification.countDocuments({ userId: teacher._id, type: "SESSION_AUTO_COMPLETED" })).toBe(1);
    });

    it("a failed room close leaves the Session ended with cleanup pending, retried by the job until it succeeds", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      videoProvider.closeRoom.mockResolvedValue(false);
      await runSessionLifecycleJob(fromEnd(s, 31));
      const pending = await reload(s);
      expect(pending.status).toBe("COMPLETED");
      expect(pending.roomCleanupPendingAt).toBeTruthy();

      const retry1 = await runSessionLifecycleJob(fromEnd(s, 32));
      expect(retry1.roomCleanup).toEqual({ retried: 1, stillPending: 1 });
      expect((await reload(s)).status).toBe("COMPLETED");

      videoProvider.closeRoom.mockResolvedValue(true);
      const retry2 = await runSessionLifecycleJob(fromEnd(s, 33));
      expect(retry2.roomCleanup).toEqual({ retried: 1, stillPending: 0 });
      expect((await reload(s)).roomCleanupPendingAt).toBeNull();
    });

    it("a failed recording stop does not block the end and keeps the recording entry (not deleted)", async () => {
      const s = await mk(-120, {
        status: "IN_PROGRESS",
        roomState: "LIVE",
        actualStartAt: new Date(Date.now() - 120 * MIN),
        recording: { status: "RECORDING", providerRecordingId: "EG_1", startedAt: new Date(Date.now() - 120 * MIN) },
      });
      jest.spyOn(videoProvider, "stopRecording").mockRejectedValue(new Error("egress unreachable"));
      await runSessionLifecycleJob(fromEnd(s, 31));
      const after = await reload(s);
      expect(after.status).toBe("COMPLETED");
      expect(after.recording.providerRecordingId).toBe("EG_1");
      expect(after.recording.stoppedAt).toBeTruthy();
    });

    it("Teacher End with a failed room close: Session COMPLETED + cleanup pending; a second End has no side effect", async () => {
      const lk = mockLiveKit();
      const s = await startLive(lk);
      videoProvider.closeRoom.mockResolvedValue(false);
      const res = await request(app).post(`/api/teacher/sessions/${s._id}/end`).set(as(teacher));
      expect(res.status).toBe(200);
      const ended = await reload(s);
      expect(ended.status).toBe("COMPLETED");
      expect(ended.endReason).toBe("TEACHER_ENDED");
      expect(ended.roomCleanupPendingAt).toBeTruthy();

      const again = await request(app).post(`/api/teacher/sessions/${s._id}/end`).set(as(teacher));
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("SESSION_NOT_IN_PROGRESS");
      expect((await reload(s)).actualEndAt.getTime()).toBe(ended.actualEndAt.getTime());
    });

    it("never auto-ends a Session the Teacher did not start, nor a COMPLETED or CANCELLED one", async () => {
      const waiting = await mk(-120, { status: "WAITING", roomState: "WAITING", meetingRoomId: "room_w", preOpenedAt: new Date() });
      const scheduled = await mk(-120);
      const completed = await mk(-120, { status: "COMPLETED", roomState: "ENDED", endReason: "TEACHER_ENDED" });
      const cancelled = await mk(-120, { status: "CANCELLED", roomState: "CANCELLED", endReason: "ADMIN_CANCELLED" });
      const before = await Promise.all([completed, cancelled].map(reload));

      const result = await runSessionLifecycleJob(fromEnd(waiting, 31));
      expect(result.autoEndedSessionIds).toEqual([]);
      expect((await reload(waiting)).status).toBe("WAITING");
      expect((await reload(scheduled)).status).not.toBe("COMPLETED");
      const after = await Promise.all([completed, cancelled].map(reload));
      expect(after.map((x) => x.updatedAt.getTime())).toEqual(before.map((x) => x.updatedAt.getTime()));

      // Once past its grace period a never-started Session drops out of the job's candidates (no backlog)
      const later = await runSessionLifecycleJob(fromEnd(waiting, 60));
      expect(later.processedSessionIds).not.toContain(waiting._id.toString());
    });

    it("processes the whole backlog: more than 200 stuck Sessions are all ended in one run, newest included", async () => {
      const longAgo = Date.now() - 10 * 24 * 60 * MIN;
      const docs = Array.from({ length: 205 }, (_, i) => ({
        classId: cls._id,
        className: "K",
        teacherId: teacher._id,
        title: `stuck ${i}`,
        status: "IN_PROGRESS",
        roomState: i % 2 ? "LIVE" : "GRACE_PERIOD",
        actualStartAt: new Date(longAgo + i * MIN),
        startDatetime: new Date(longAgo + i * MIN),
        endDatetime: new Date(longAgo + (i + 60) * MIN),
        teacherPresence: { isCurrentlyConnected: true },
      }));
      await Session.insertMany(docs);
      const result = await runSessionLifecycleJob(new Date());
      expect(result.autoEndedSessionIds).toHaveLength(205);
      expect(await Session.countDocuments({ status: "IN_PROGRESS" })).toBe(0);
    }, 300000);
  });

  // ---------------------------------------------------------------- Recovery dry run
  describe("Recovery dry run", () => {
    it("classifies stuck Sessions without writing anything", async () => {
      const longAgo = (h) => new Date(Date.now() - h * 60 * MIN);
      const safe = await mk(-48 * 60, { status: "IN_PROGRESS", roomState: "GRACE_PERIOD", actualStartAt: longAgo(48) });
      const review = await mk(-48 * 60, { status: "IN_PROGRESS", roomState: "LIVE", actualStartAt: longAgo(48) });
      await SessionPresenceInterval.create({
        sessionId: review._id,
        classId: cls._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "PA_still_here",
        connectedAt: longAgo(1),
        lastHeartbeatAt: new Date(),
        source: "LIVEKIT_WEBHOOK",
      });
      const notStarted = await mk(-48 * 60, { status: "WAITING", roomState: "WAITING" });
      const cleanup = await mk(-48 * 60, { status: "COMPLETED", roomState: "ENDED", roomCleanupPendingAt: longAgo(47) });
      const healthy = await mk(-5, { status: "IN_PROGRESS", roomState: "LIVE", actualStartAt: new Date() });

      const snapshot = async () => ({
        sessions: (await Session.find().sort({ _id: 1 }).lean()).map((x) => [String(x._id), x.updatedAt.getTime()]),
        intervals: (await SessionPresenceInterval.find().lean()).map((x) => [String(x._id), x.updatedAt.getTime()]),
      });
      const before = await snapshot();
      const report = await collectStuckSessionReport({ checkLiveKit: false });
      expect(await snapshot()).toEqual(before);

      const category = (s) => report.records.find((r) => r.sessionId === String(s._id))?.category;
      expect(category(safe)).toBe("SAFE_TO_AUTO_END");
      expect(category(review)).toBe("NEEDS_REVIEW");
      expect(category(notStarted)).toBe("NOT_STARTED");
      expect(category(cleanup)).toBe("CLEANUP_PENDING");
      expect(category(healthy)).toBe("HEALTHY");
      expect(report.readOnly).toBe(true);
    });

    it("flags IN_PROGRESS without actualStartAt for review", () => {
      const now = new Date();
      const session = { status: "IN_PROGRESS", roomState: "LIVE", endDatetime: new Date(now.getTime() - 5 * 60 * MIN) };
      expect(classifySession({ session, openIntervals: [], freshIntervalCount: 0, liveKitParticipants: null, now }).category).toBe(
        "NEEDS_REVIEW"
      );
    });
  });
});
