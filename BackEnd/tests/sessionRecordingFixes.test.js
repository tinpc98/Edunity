const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, Enrollment, Notification } = require("../src/models");
const videoProvider = require("../src/services/videoProvider");
const presenceService = require("../src/services/sessionPresenceService");
const { runSessionLifecycleJob } = require("../src/jobs/sessionLifecycleJob");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("Recording & lifecycle fixes (L01-L10)", () => {
  let teacher, student, cls;
  const original = {};

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    original.startRecording = videoProvider.startRecording;
    original.stopRecording = videoProvider.stopRecording;
    original.closeRoom = videoProvider.closeRoom;
    original.isRecordingRequired = videoProvider.isRecordingRequired;

    const passwordHash = hashPassword("password123");
    const admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher", verificationStatus: "VERIFIED" },
    });
    student = await User.create({
      email: "s1@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student" },
    });

    const category = await Category.create({ name: "IT", slug: "it", createdBy: admin._id, status: "ACTIVE" });
    const subject = await Subject.create({
      name: "Programming",
      slug: "prog",
      categoryId: category._id,
      categoryName: category.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    const course = await Course.create({
      title: "Node",
      slug: "node",
      categoryId: category._id,
      categoryName: category.name,
      subjectId: subject._id,
      subjectName: subject.name,
      createdBy: admin._id,
      status: "ACTIVE",
    });
    cls = await Class.create({
      courseId: course._id,
      courseTitle: course.title,
      teacherId: teacher._id,
      teacherName: "Teacher",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Class A",
      classType: "FREE",
      price: 0,
      capacity: 10,
      status: "OPEN",
    });
    await Enrollment.create({
      classId: cls._id,
      courseId: cls.courseId,
      teacherId: teacher._id,
      studentId: student._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "FREE",
    });
  });

  afterEach(() => {
    videoProvider.startRecording = original.startRecording;
    videoProvider.stopRecording = original.stopRecording;
    videoProvider.closeRoom = original.closeRoom;
    videoProvider.isRecordingRequired = original.isRecordingRequired;
  });

  const createLiveSession = () =>
    Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Lesson 1",
      startDatetime: new Date(Date.now() - 60 * 1000),
      endDatetime: new Date(Date.now() + 60 * 60 * 1000),
    });

  const start = (session) => request(app).post(`/api/teacher/sessions/${session._id}/start`).set(as(teacher));

  it("L04: joining the room only opens it; teaching and recording start on 'Bắt đầu buổi học'", async () => {
    const started = [];
    videoProvider.startRecording = async () => {
      started.push(1);
      return `EG_${started.length}`;
    };
    const session = await createLiveSession();

    const join = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(join.status).toBe(200);
    let saved = await Session.findById(session._id).lean();
    expect(saved.status).toBe("WAITING");
    expect(started).toHaveLength(0);

    const res = await start(session);
    expect(res.status).toBe(200);
    saved = await Session.findById(session._id).lean();
    expect(saved.status).toBe("IN_PROGRESS");
    expect(saved.actualStartAt).toBeTruthy();
    expect(saved.recording.status).toBe("RECORDING");
    expect(started).toHaveLength(1);

    const again = await start(session);
    expect(again.status).toBe(409);
    expect(started).toHaveLength(1);
  });

  it("L04: two concurrent starts produce exactly one running Egress", async () => {
    const started = [];
    const stopped = [];
    videoProvider.startRecording = async () => {
      started.push(1);
      await new Promise((r) => setTimeout(r, 30));
      return `EG_${started.length}`;
    };
    videoProvider.stopRecording = async (id) => {
      stopped.push(id);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED" };
    };
    const session = await createLiveSession();
    await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));

    const [a, b] = await Promise.all([start(session), start(session)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    // Any Egress started by the losing request has been stopped again
    expect(started.length - stopped.length).toBe(1);
  });

  it("L05: a mandatory recording that cannot start blocks the start, notifies, and allows a retry", async () => {
    videoProvider.isRecordingRequired = () => true;
    let calls = 0;
    videoProvider.startRecording = async () => {
      calls += 1;
      return calls <= 3 ? null : "EG_RETRY";
    };
    const session = await createLiveSession();
    await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));

    const failed = await start(session);
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe("RECORDING_START_FAILED");
    expect(calls).toBe(3); // bounded retries
    let saved = await Session.findById(session._id).lean();
    expect(saved.status).toBe("WAITING");
    expect(saved.recording.status).toBe("FAILED");
    const notice = await Notification.findOne({ userId: teacher._id, type: "SESSION_RECORDING_START_FAILED" });
    expect(notice).toBeTruthy();

    const retried = await start(session);
    expect(retried.status).toBe(200);
    saved = await Session.findById(session._id).lean();
    expect(saved.status).toBe("IN_PROGRESS");
    expect(saved.recording.providerRecordingId).toBe("EG_RETRY");
  });

  it("L09: a teacher network drop does not stop the recording", async () => {
    videoProvider.startRecording = async () => "EG_KEEP";
    const stopped = [];
    videoProvider.stopRecording = async (id) => {
      stopped.push(id);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED" };
    };
    const session = await createLiveSession();
    await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect((await start(session)).status).toBe(200);

    const connectedAt = new Date();
    await presenceService.recordParticipantConnected({
      sessionId: session._id,
      userId: teacher._id.toString(),
      role: "TEACHER",
      connectionSessionId: "PA_t",
      connectedAt,
      eventId: "evt_c",
      source: "LIVEKIT_WEBHOOK",
    });
    await presenceService.recordParticipantDisconnected({
      sessionId: session._id,
      userId: teacher._id.toString(),
      connectionSessionId: "PA_t",
      disconnectedAt: new Date(connectedAt.getTime() + 1000),
      eventId: "evt_d",
    });

    expect(stopped).toEqual([]);
    const saved = await Session.findById(session._id).lean();
    expect(saved.recording.status).toBe("RECORDING");
  });

  it("L10: egress_ended records duration and makes the recording AVAILABLE", async () => {
    videoProvider.startRecording = async () => "EG_DONE";
    videoProvider.stopRecording = async () => ({ success: true, reason: "STOP_REQUEST_ACCEPTED" });
    videoProvider.closeRoom = async () => true;
    const session = await createLiveSession();
    await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    await start(session);
    await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));

    let saved = await Session.findById(session._id).lean();
    expect(saved.recording.status).toBe("PROCESSING");

    await presenceService.handleLiveKitEvent({
      event: "egress_ended",
      id: "evt_egress",
      egressInfo: { egressId: "EG_DONE", status: 3, fileResults: [{ duration: String(125 * 1e9) }] },
    });
    saved = await Session.findById(session._id).lean();
    expect(saved.recording.status).toBe("AVAILABLE");
    expect(saved.recording.durationSeconds).toBe(125);
    const studentNotice = await Notification.findOne({ userId: student._id, type: "SESSION_RECORDING_AVAILABLE" });
    expect(studentNotice).toBeTruthy();
  });

  it("L02: a started session + participant_joined webhook keeps exactly one Egress", async () => {
    const started = [];
    videoProvider.startRecording = async (roomId) => {
      started.push(roomId);
      return `EG_${started.length}`;
    };
    const session = await createLiveSession();

    const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(res.status).toBe(200);
    expect((await start(session)).status).toBe(200);
    expect(started).toHaveLength(1);

    await presenceService.recordParticipantConnected({
      sessionId: session._id,
      userId: teacher._id.toString(),
      role: "TEACHER",
      connectionSessionId: "PA_teacher_1",
      connectedAt: new Date(),
      eventId: "evt_join_1",
      source: "LIVEKIT_WEBHOOK",
    });

    expect(started).toHaveLength(1);
    const saved = await Session.findById(session._id).lean();
    expect(saved.recording.providerRecordingId).toBe("EG_1");
    expect(saved.recordingSegments).toHaveLength(1);
    expect(saved.recordingSegments[0].providerRecordingId).toBe("EG_1");
  });

  it("L01: ending the session stops the active recording", async () => {
    videoProvider.startRecording = async () => "EG_END";
    const stopped = [];
    videoProvider.stopRecording = async (egressId) => {
      stopped.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED" };
    };
    videoProvider.closeRoom = async () => true;
    const session = await createLiveSession();

    const join = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
    expect(join.status).toBe(200);
    expect((await start(session)).status).toBe(200);

    const end = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(end.status).toBe(200);
    expect(stopped).toEqual(["EG_END"]);

    const saved = await Session.findById(session._id).lean();
    expect(saved.status).toBe("COMPLETED");
    expect(saved.recordingSegments[0].stoppedAt).toBeTruthy();
  });

  it("L08: the owning teacher, an admin and a COMPLETED student can open a recording; others cannot", async () => {
    const session = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Recorded",
      startDatetime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      endDatetime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: "COMPLETED",
      recording: { status: "PROCESSING" },
    });
    const admin = await User.findOne({ role: "ADMIN" });
    const otherTeacher = await User.create({
      email: "other@test.com",
      passwordHash: hashPassword("password123"),
      role: "TEACHER",
      teacherProfile: { fullName: "Other", verificationStatus: "VERIFIED" },
    });
    await Enrollment.updateOne({ studentId: student._id }, { $set: { enrollmentStatus: "COMPLETED" } });

    for (const user of [teacher, admin, student]) {
      const res = await request(app).get(`/api/sessions/${session._id}/recording`).set(as(user));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("PROCESSING");
    }
    const denied = await request(app).get(`/api/sessions/${session._id}/recording`).set(as(otherTeacher));
    expect(denied.status).toBe(403);
  });

  it("L03: a closed-out INTERRUPTED session is no longer picked up by the lifecycle job", async () => {
    const closeCalls = [];
    videoProvider.closeRoom = async (roomId) => {
      closeCalls.push(roomId);
      return true;
    };
    const ended = await Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Old interrupted",
      startDatetime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      endDatetime: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: "INTERRUPTED",
      roomState: "ENDED",
      lifecycleState: "INTERRUPTED",
      endReason: "TEACHER_LEFT_EARLY",
      meetingRoomId: "room_old",
    });

    const result = await runSessionLifecycleJob(new Date());
    expect(result.processedSessionIds).not.toContain(ended._id.toString());
    expect(closeCalls).not.toContain("room_old");

    const join = await request(app).post(`/api/sessions/${ended._id}/join`).set(as(teacher));
    expect(join.status).toBe(409);
  });
});
