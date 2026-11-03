const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "edunity-storage-"),
  );
}

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const {
  User,
  Category,
  Subject,
  Course,
  Class,
  Session,
  SessionAttendance,
  SessionPresenceInterval,
  Enrollment,
  Payment,
  TeacherEarning,
  Notification,
  TeacherViolation,
  TeacherDisciplineCase,
  TeacherIncidentReport,
  SessionRescheduleRequest,
  SessionRefundReview,
  AuditLog,
} = require("../src/models");
const { verifyRoomToken } = require("../src/utils/roomToken");
const videoProvider = require("../src/services/videoProvider");
const presenceService = require("../src/services/sessionPresenceService");
const incidentService = require("../src/services/sessionIncidentService");
const { runSessionLifecycleJob } = require("../src/jobs/sessionLifecycleJob");
const {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
} = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

// Valid 1x1 PNG buffer for private evidence upload
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

let admin;
let teacher;
let otherTeacher;
let student1;
let student2;
let cls;

beforeAll(async () => {
  await connectDB();
  await syncIndexes();
});

afterAll(async () => {
  await disconnectDB();
});

beforeEach(async () => {
  await clearDB();

  admin = await User.create({
    email: "admin@smart.test",
    passwordHash: "x",
    role: "ADMIN",
    status: "ACTIVE",
    adminProfile: { fullName: "Smart Admin" },
  });

  teacher = await User.create({
    email: "teacher@smart.test",
    passwordHash: "x",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Smart Teacher",
      verificationStatus: "VERIFIED",
    },
  });

  otherTeacher = await User.create({
    email: "other.teacher@smart.test",
    passwordHash: "x",
    role: "TEACHER",
    status: "ACTIVE",
    teacherProfile: {
      fullName: "Other Teacher",
      verificationStatus: "VERIFIED",
    },
  });

  student1 = await User.create({
    email: "student1@smart.test",
    passwordHash: "x",
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: { fullName: "Student One" },
  });

  student2 = await User.create({
    email: "student2@smart.test",
    passwordHash: "x",
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: { fullName: "Student Two" },
  });

  const category = await Category.create({
    name: "Smart Category",
    slug: "smart-category",
    createdBy: admin._id,
  });
  const subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: "Smart Subject",
    slug: "smart-subject",
    createdBy: admin._id,
  });
  const course = await Course.create({
    categoryId: category._id,
    categoryName: category.name,
    subjectId: subject._id,
    subjectName: subject.name,
    title: "Smart Course",
    slug: "smart-course",
    createdBy: admin._id,
    status: "ACTIVE",
  });

  cls = await Class.create({
    courseId: course._id,
    courseTitle: course.title,
    categoryId: category._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    teacherName: "Smart Teacher",
    className: "Smart Live Class 12A",
    classType: "PAID",
    price: 1200000,
    capacity: 20,
    status: "IN_PROGRESS",
    startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    endDate: new Date(Date.now() + 60 * 24 * 3600 * 1000),
  });

  await Enrollment.create([
    {
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student1._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
      basePrice: 1200000,
      paidAmount: 1200000,
    },
    {
      classId: cls._id,
      courseId: course._id,
      teacherId: teacher._id,
      studentId: student2._id,
      enrollmentStatus: "CONFIRMED",
      paymentSource: "DIRECT_PAYMENT",
      basePrice: 1200000,
      paidAmount: 1200000,
    },
  ]);
});

describe("TIN-05D + TIN-05E: Smart Classroom Lifecycle, Attendance, Teacher Discipline & Incident Management", () => {
  // =========================================================================
  // A. PRE-OPEN AND START WINDOW (10-MINUTE WAITING ROOM)
  // =========================================================================
  describe("A. Pre-open Waiting Room & Official Start Window", () => {
    it("A1-A4: Rejects join 11m early, opens waiting room 10m early without starting recording, and excludes waiting room time from official attendance", async () => {
      let recordingStartedCount = 0;
      const origStartRec = videoProvider.startRecording;
      videoProvider.startRecording = async () => {
        recordingStartedCount++;
        return "egress_should_not_start_in_waiting_room";
      };

      try {
        // A1: Session starts in 11 minutes -> rejected with 409 SESSION_NOT_JOINABLE
        const sessionEarly = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: "Session 11m Early",
          status: "SCHEDULED",
          startDatetime: new Date(Date.now() + 11 * 60 * 1000),
          endDatetime: new Date(Date.now() + 131 * 60 * 1000),
        });

        const res11m = await request(app)
          .post(`/api/sessions/${sessionEarly._id}/join`)
          .set(as(student1));
        expect(res11m.statusCode).toBe(409);
        expect(res11m.body.error).toBe("SESSION_NOT_JOINABLE");

        // A2 & A4: Session starts in 9 minutes (inside 10m pre-open waiting room) -> allowed, WAITING roomState, NO recording started
        const startIn9m = new Date(Date.now() + 9 * 60 * 1000);
        const endIn129m = new Date(startIn9m.getTime() + 120 * 60 * 1000);
        const sessionWait = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: "Waiting Room Session",
          status: "SCHEDULED",
          startDatetime: startIn9m,
          endDatetime: endIn129m,
        });

        const teacherWaitJoin = await request(app)
          .post(`/api/sessions/${sessionWait._id}/join`)
          .set(as(teacher));
        expect(teacherWaitJoin.statusCode).toBe(200);
        expect(teacherWaitJoin.body.data.isWaitingRoom).toBe(true);
        expect(teacherWaitJoin.body.data.roomState).toBe("WAITING");
        expect(recordingStartedCount).toBe(0);

        const studentWaitJoin = await request(app)
          .post(`/api/sessions/${sessionWait._id}/join`)
          .set(as(student1));
        expect(studentWaitJoin.statusCode).toBe(200);
        expect(studentWaitJoin.body.data.isWaitingRoom).toBe(true);

        const reloadedWait = await Session.findById(sessionWait._id).lean();
        expect(reloadedWait.status).toBe("SCHEDULED");
        expect(reloadedWait.roomState).toBe("WAITING");
        expect(reloadedWait.recording).toBeNull();

        // A3: Student connects during 10m waiting room and disconnects at startDatetime -> 0% official attendance (ABSENT)
        const baseStart = new Date("2026-05-01T12:00:00.000Z");
        const baseEnd = new Date("2026-05-01T14:00:00.000Z");
        const sessionWaitOnly = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: "Waiting Room Only Test",
          status: "IN_PROGRESS",
          startDatetime: baseStart,
          endDatetime: baseEnd,
        });

        await presenceService.recordParticipantConnected({
          sessionId: sessionWaitOnly._id,
          userId: student1._id,
          role: "STUDENT",
          connectionSessionId: "wait_conn_1",
          connectedAt: new Date("2026-05-01T11:50:00.000Z"),
        });
        await presenceService.recordParticipantDisconnected({
          sessionId: sessionWaitOnly._id,
          userId: student1._id,
          connectionSessionId: "wait_conn_1",
          disconnectedAt: new Date("2026-05-01T12:00:00.000Z"),
        });

        const finalized = await presenceService.finalizeSessionAttendance(
          sessionWaitOnly._id,
          {
            now: baseEnd,
            forceRecalculate: true,
          },
        );
        const s1Att = finalized.find(
          (a) => a.studentId.toString() === student1._id.toString(),
        );
        expect(s1Att.waitingRoomSeconds).toBe(600); // 10m in waiting room
        expect(s1Att.scheduledOnlineSeconds).toBe(0); // 0s in official teaching window
        expect(s1Att.attendancePercentage).toBe(0);
        expect(s1Att.attendanceStatus).toBe("ABSENT");
      } finally {
        videoProvider.startRecording = origStartRec;
      }
    });
  });

  // =========================================================================
  // B. STUDENT LATE (5 MIN) AND FIRST-JOIN CUTOFF (20 MIN)
  // =========================================================================
  describe("B. Student Late (5m) and First-Join Cutoff (20m)", () => {
    it("B1-B7: Enforces 5-minute late threshold and 20-minute first-join deadline including token expiry at 20m", async () => {
      // B1 & B2: Join at 0m and 5m00s -> PRESENT
      const session5m = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "5m Boundary Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 5 * 60 * 1000),
        endDatetime: new Date(Date.now() + 115 * 60 * 1000),
      });
      const res5m = await request(app)
        .post(`/api/sessions/${session5m._id}/join`)
        .set(as(student1));
      expect(res5m.statusCode).toBe(200);
      const att5m = await SessionAttendance.findOne({
        sessionId: session5m._id,
        studentId: student1._id,
      });
      expect(att5m.attendanceStatus).toBe("PRESENT");
      expect(att5m.isLate).toBe(false);

      // B3: Join at 5m05s -> LATE
      const sessionLate = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "5m05s Late Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 6 * 60 * 1000),
        endDatetime: new Date(Date.now() + 115 * 60 * 1000),
      });
      const resLate = await request(app)
        .post(`/api/sessions/${sessionLate._id}/join`)
        .set(as(student1));
      expect(resLate.statusCode).toBe(200);
      const attLate = await SessionAttendance.findOne({
        sessionId: sessionLate._id,
        studentId: student1._id,
      });
      expect(attLate.attendanceStatus).toBe("LATE");
      expect(attLate.isLate).toBe(true);

      // B4 & B5: Join at 19m and 20m -> allowed (200 OK)
      const session19m = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "19m Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 19 * 60 * 1000),
        endDatetime: new Date(Date.now() + 101 * 60 * 1000),
      });
      const res19m = await request(app)
        .post(`/api/sessions/${session19m._id}/join`)
        .set(as(student1));
      expect(res19m.statusCode).toBe(200);

      // B6: First join at 21m -> rejected with 403 JOIN_WINDOW_CLOSED
      const session21m = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "21m Cutoff Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 21 * 60 * 1000),
        endDatetime: new Date(Date.now() + 99 * 60 * 1000),
      });
      const res21m = await request(app)
        .post(`/api/sessions/${session21m._id}/join`)
        .set(as(student1));
      expect(res21m.statusCode).toBe(403);
      expect(res21m.body.error).toBe("JOIN_WINDOW_CLOSED");

      // B7: Student requests join token at minute 15, never connects to room, tries to use token or call /join at minute 21 -> rejected!
      const sessionTokenOnly = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Token Abuse Prevention Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 15 * 60 * 1000),
        endDatetime: new Date(Date.now() + 105 * 60 * 1000),
      });

      const tokenAt15mRes = await request(app)
        .post(`/api/sessions/${sessionTokenOnly._id}/join`)
        .set(as(student1));
      expect(tokenAt15mRes.statusCode).toBe(200);
      expect(tokenAt15mRes.body.data.firstJoinDeadlineAt).toBeTruthy();

      // Verify token's exp is capped at startDatetime + 20m (not endDatetime)
      const decodedToken = verifyRoomToken(tokenAt15mRes.body.data.accessToken);
      const expectedDeadlineSec = Math.floor(
        (sessionTokenOnly.startDatetime.getTime() + 20 * 60 * 1000) / 1000,
      );
      expect(decodedToken.exp).toBe(expectedDeadlineSec);

      // Move session startDatetime back so current time is minute 22 without verified connection
      await Session.updateOne(
        { _id: sessionTokenOnly._id },
        { $set: { startDatetime: new Date(Date.now() - 22 * 60 * 1000) } },
      );

      const retryAt22m = await request(app)
        .post(`/api/sessions/${sessionTokenOnly._id}/join`)
        .set(as(student1));
      expect(retryAt22m.statusCode).toBe(403);
      expect(retryAt22m.body.error).toBe("JOIN_WINDOW_CLOSED");

      // Also verify LiveKit participant_joined webhook after minute 20 for unverified student is rejected
      await expect(
        presenceService.recordParticipantConnected({
          sessionId: sessionTokenOnly._id,
          userId: student1._id,
          role: "STUDENT",
          connectionSessionId: "late_unverified_conn",
          connectedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "JOIN_WINDOW_CLOSED", statusCode: 403 });
    });
  });

  // =========================================================================
  // C. STUDENT RECONNECTION AFTER MINUTE 20
  // =========================================================================
  describe("C. Verified Student Reconnection after Minute 20", () => {
    it("C1-C3: Allows reconnection after minute 20 ONLY if student had a verified connection within first 20m; rejects forged client flags", async () => {
      const startAt = new Date(Date.now() - 35 * 60 * 1000); // currently at minute 35
      const endAt = new Date(Date.now() + 85 * 60 * 1000);

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Reconnection Session",
        status: "IN_PROGRESS",
        startDatetime: startAt,
        endDatetime: endAt,
      });

      // Student 1 had a verified connection at minute 3 (start + 3m) and disconnected at minute 25
      const joinAt3m = new Date(startAt.getTime() + 3 * 60 * 1000);
      const leaveAt25m = new Date(startAt.getTime() + 25 * 60 * 1000);
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "s1_conn_1",
        connectedAt: joinAt3m,
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: session._id,
        userId: student1._id,
        connectionSessionId: "s1_conn_1",
        disconnectedAt: leaveAt25m,
      });

      // C1: Student 1 reconnects at minute 35 -> ALLOWED (200 OK, isReconnect: true)
      const reconnectRes = await request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(student1));
      expect(reconnectRes.statusCode).toBe(200);
      expect(reconnectRes.body.data.isReconnect).toBe(true);

      // C3: Student 2 never joined before minute 20, sends forged { hasJoined: true, isReconnect: true } at minute 35 -> REJECTED (403)
      const forgedRes = await request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(student2))
        .send({
          hasJoined: true,
          isReconnect: true,
          hasVerifiedConnection: true,
        });
      expect(forgedRes.statusCode).toBe(403);
      expect(forgedRes.body.error).toBe("JOIN_WINDOW_CLOSED");
    });
  });

  // =========================================================================
  // D. ATTENDANCE DURATION FORMULA (70% OF SCHEDULED DURATION)
  // =========================================================================
  describe("D. Real-Time Attendance Duration Formula (120-Minute Session)", () => {
    it("D1-D6: Accurately computes 70% threshold, LATE vs PRESENT vs ABSENT, multi-interval summation, and duplicate-tab interval merging", async () => {
      const start = new Date("2026-06-01T19:00:00.000Z");
      const end = new Date("2026-06-01T21:00:00.000Z"); // 120 minutes = 7200s (70% = 84m = 5040s)

      const create120mSession = async (title) =>
        Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title,
          status: "IN_PROGRESS",
          startDatetime: start,
          endDatetime: end,
        });

      // D1: Student 1 stays 84m (19:00 -> 20:24) = 70% -> PRESENT
      // D2: Student 2 joins at 19:08 (>5m late), stays 90m (19:08 -> 20:38) = 75% -> LATE
      const sD12 = await create120mSession("D1 & D2 Session");
      await presenceService.recordParticipantConnected({
        sessionId: sD12._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "d1_conn",
        connectedAt: new Date("2026-06-01T19:00:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD12._id,
        userId: student1._id,
        connectionSessionId: "d1_conn",
        disconnectedAt: new Date("2026-06-01T20:24:00.000Z"),
      });

      await presenceService.recordParticipantConnected({
        sessionId: sD12._id,
        userId: student2._id,
        role: "STUDENT",
        connectionSessionId: "d2_conn",
        connectedAt: new Date("2026-06-01T19:08:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD12._id,
        userId: student2._id,
        connectionSessionId: "d2_conn",
        disconnectedAt: new Date("2026-06-01T20:38:00.000Z"),
      });

      const resD12 = await presenceService.finalizeSessionAttendance(sD12._id, {
        now: end,
        forceRecalculate: true,
      });
      const attD1 = resD12.find(
        (a) => a.studentId.toString() === student1._id.toString(),
      );
      const attD2 = resD12.find(
        (a) => a.studentId.toString() === student2._id.toString(),
      );
      expect(attD1.attendancePercentage).toBe(70);
      expect(attD1.attendanceStatus).toBe("PRESENT");
      expect(attD2.attendancePercentage).toBe(75);
      expect(attD2.attendanceStatus).toBe("LATE");

      // D3: Student 1 joins at 19:02, leaves at 19:32 (30m = 25% < 70%) -> ABSENT
      // D4: Student 2 joins at 19:04..19:44 (40m), disconnects 10m, reconnects 19:54..20:40 (46m) -> total 86m (71.67%) -> PRESENT
      const sD34 = await create120mSession("D3 & D4 Session");
      await presenceService.recordParticipantConnected({
        sessionId: sD34._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "d3_conn",
        connectedAt: new Date("2026-06-01T19:02:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD34._id,
        userId: student1._id,
        connectionSessionId: "d3_conn",
        disconnectedAt: new Date("2026-06-01T19:32:00.000Z"),
      });

      await presenceService.recordParticipantConnected({
        sessionId: sD34._id,
        userId: student2._id,
        role: "STUDENT",
        connectionSessionId: "d4_conn_1",
        connectedAt: new Date("2026-06-01T19:04:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD34._id,
        userId: student2._id,
        connectionSessionId: "d4_conn_1",
        disconnectedAt: new Date("2026-06-01T19:44:00.000Z"),
      });
      await presenceService.recordParticipantConnected({
        sessionId: sD34._id,
        userId: student2._id,
        role: "STUDENT",
        connectionSessionId: "d4_conn_2",
        connectedAt: new Date("2026-06-01T19:54:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD34._id,
        userId: student2._id,
        connectionSessionId: "d4_conn_2",
        disconnectedAt: new Date("2026-06-01T20:40:00.000Z"),
      });

      const resD34 = await presenceService.finalizeSessionAttendance(sD34._id, {
        now: end,
        forceRecalculate: true,
      });
      const attD3 = resD34.find(
        (a) => a.studentId.toString() === student1._id.toString(),
      );
      const attD4 = resD34.find(
        (a) => a.studentId.toString() === student2._id.toString(),
      );
      expect(attD3.attendancePercentage).toBe(25);
      expect(attD3.attendanceStatus).toBe("ABSENT");
      expect(attD4.scheduledOnlineSeconds).toBe(86 * 60);
      expect(attD4.attendancePercentage).toBeCloseTo(71.67, 1);
      expect(attD4.attendanceStatus).toBe("PRESENT");

      // D5: Student 1 disconnects repeatedly, total 70m (58.33% < 70%) -> ABSENT
      // D6: Student 2 opens two overlapping browser tabs from 19:00 to 19:50 (50m each, NOT 100m!) -> 41.67% -> ABSENT
      const sD56 = await create120mSession("D5 & D6 Session");
      await presenceService.recordParticipantConnected({
        sessionId: sD56._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "d5_conn_1",
        connectedAt: new Date("2026-06-01T19:10:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD56._id,
        userId: student1._id,
        connectionSessionId: "d5_conn_1",
        disconnectedAt: new Date("2026-06-01T19:50:00.000Z"),
      });
      await presenceService.recordParticipantConnected({
        sessionId: sD56._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "d5_conn_2",
        connectedAt: new Date("2026-06-01T20:10:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD56._id,
        userId: student1._id,
        connectionSessionId: "d5_conn_2",
        disconnectedAt: new Date("2026-06-01T20:40:00.000Z"),
      });

      // Overlapping tabs for student2 (both 19:00 -> 19:50)
      await presenceService.recordParticipantConnected({
        sessionId: sD56._id,
        userId: student2._id,
        role: "STUDENT",
        connectionSessionId: "tab_1",
        connectedAt: new Date("2026-06-01T19:00:00.000Z"),
      });
      await presenceService.recordParticipantConnected({
        sessionId: sD56._id,
        userId: student2._id,
        role: "STUDENT",
        connectionSessionId: "tab_2",
        connectedAt: new Date("2026-06-01T19:05:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD56._id,
        userId: student2._id,
        connectionSessionId: "tab_1",
        disconnectedAt: new Date("2026-06-01T19:50:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sD56._id,
        userId: student2._id,
        connectionSessionId: "tab_2",
        disconnectedAt: new Date("2026-06-01T19:50:00.000Z"),
      });

      const resD56 = await presenceService.finalizeSessionAttendance(sD56._id, {
        now: end,
        forceRecalculate: true,
      });
      const attD5 = resD56.find(
        (a) => a.studentId.toString() === student1._id.toString(),
      );
      const attD6 = resD56.find(
        (a) => a.studentId.toString() === student2._id.toString(),
      );
      expect(attD5.scheduledOnlineSeconds).toBe(70 * 60);
      expect(attD5.attendanceStatus).toBe("ABSENT");
      expect(attD6.scheduledOnlineSeconds).toBe(50 * 60); // merged to 50m, NOT double-counted as 95m
      expect(attD6.attendanceStatus).toBe("ABSENT");
    });
  });

  // =========================================================================
  // E. TEACHER LATENESS (+10M YELLOW, +20M RED, +30M NO_SHOW) & IDEMPOTENCY
  // =========================================================================
  describe("E. Teacher Lateness Escalation & Auto-Cancellation", () => {
    it("E1-E5: Escalates 10m YELLOW -> 20m RED -> 30m NO_SHOW on a single canonical TeacherViolation without duplicates across repeated scheduler runs", async () => {
      const start = new Date("2026-07-01T19:00:00.000Z");
      const end = new Date("2026-07-01T21:00:00.000Z");

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Teacher Lateness Escalation Session",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      // E1: At 19:09 -> no warning
      await runSessionLifecycleJob(new Date("2026-07-01T19:09:00.000Z"));
      expect(
        await TeacherViolation.countDocuments({ sessionId: session._id }),
      ).toBe(0);

      // E2: At 19:10 (and repeated run at 19:11) -> 1 YELLOW warning, deduplicated notifications
      await runSessionLifecycleJob(new Date("2026-07-01T19:10:00.000Z"));
      await runSessionLifecycleJob(new Date("2026-07-01T19:11:00.000Z"));

      let violations = await TeacherViolation.find({
        sessionId: session._id,
      }).lean();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe("YELLOW");
      expect(violations[0].violationType).toBe("TEACHER_LATE_10M");

      const yellowNotifs = await Notification.countDocuments({
        userId: teacher._id,
        type: "TEACHER_WARNING_YELLOW",
      });
      expect(yellowNotifs).toBe(1);

      // E3: At 19:20 (and repeated run at 19:21) -> escalated to RED on the SAME canonical violation
      await runSessionLifecycleJob(new Date("2026-07-01T19:20:00.000Z"));
      await runSessionLifecycleJob(new Date("2026-07-01T19:21:00.000Z"));

      violations = await TeacherViolation.find({
        sessionId: session._id,
      }).lean();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe("RED");
      expect(violations[0].violationType).toBe("TEACHER_LATE_20M");
      expect(violations[0].escalationHistory.length).toBe(2);

      // E4 & E5: At 19:30 (and repeated run at 19:31) -> auto-cancelled with TEACHER_NO_SHOW, escalated to NO_SHOW
      await runSessionLifecycleJob(new Date("2026-07-01T19:30:00.000Z"));
      await runSessionLifecycleJob(new Date("2026-07-01T19:31:00.000Z"));

      const cancelledSession = await Session.findById(session._id).lean();
      expect(cancelledSession.status).toBe("CANCELLED");
      expect(cancelledSession.endReason).toBe("TEACHER_NO_SHOW");

      violations = await TeacherViolation.find({
        sessionId: session._id,
      }).lean();
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe("NO_SHOW");
      expect(violations[0].violationType).toBe("TEACHER_NO_SHOW_30M");
      expect(violations[0].escalationHistory.length).toBe(3);

      // Students are NOT penalized as ABSENT when teacher no-shows (marked NOT_EVALUATED)
      const attendances = await SessionAttendance.find({
        sessionId: session._id,
      }).lean();
      expect(attendances.length).toBe(2);
      expect(
        attendances.every((a) => a.attendanceStatus === "NOT_EVALUATED"),
      ).toBe(true);

      // Safe refund review records created for both confirmed enrollments
      const refundReviews = await SessionRefundReview.find({
        sessionId: session._id,
      }).lean();
      expect(refundReviews.length).toBe(2);
      expect(refundReviews[0].triggerReason).toBe("TEACHER_NO_SHOW");
      expect(refundReviews[0].status).toBe("NEEDS_FINANCIAL_REVIEW");
    });
  });

  // =========================================================================
  // F. TEACHER EARLY LEAVE (30M CONTINUOUS ABSENCE) & BRIEF PRESENCE GAMING
  // =========================================================================
  describe("F. Teacher Early Leave (30m Absence) & Brief-Presence Gaming", () => {
    it("F1-F3: Allows <30m teacher reconnect with multi-segment recording, interrupts session after 30m absence, and flags <5m brief-presence gaming", async () => {
      const start = new Date("2026-07-02T19:00:00.000Z");
      const end = new Date("2026-07-02T21:00:00.000Z");

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Teacher Mid-Session Absence Test",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      // Teacher connects at 19:00 -> session becomes IN_PROGRESS
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "t_seg_1",
        connectedAt: new Date("2026-07-02T19:00:00.000Z"),
      });

      // F1: Teacher disconnects at 19:20, reconnects at 19:30 (10m absence < 30m) -> session stays IN_PROGRESS
      await presenceService.recordParticipantDisconnected({
        sessionId: session._id,
        userId: teacher._id,
        connectionSessionId: "t_seg_1",
        disconnectedAt: new Date("2026-07-02T19:20:00.000Z"),
      });
      await runSessionLifecycleJob(new Date("2026-07-02T19:29:00.000Z"));
      let sAfter10m = await Session.findById(session._id).lean();
      expect(sAfter10m.status).toBe("IN_PROGRESS");

      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "t_seg_2",
        connectedAt: new Date("2026-07-02T19:30:00.000Z"),
      });

      // F2: Teacher disconnects at 19:40 and does NOT return by 20:10 (30 continuous minutes) -> INTERRUPTED / TEACHER_LEFT_EARLY
      await presenceService.recordParticipantDisconnected({
        sessionId: session._id,
        userId: teacher._id,
        connectionSessionId: "t_seg_2",
        disconnectedAt: new Date("2026-07-02T19:40:00.000Z"),
      });

      await runSessionLifecycleJob(new Date("2026-07-02T20:10:00.000Z"));
      const sInterrupted = await Session.findById(session._id).lean();
      expect(sInterrupted.status).toBe("INTERRUPTED");
      expect(sInterrupted.endReason).toBe("TEACHER_LEFT_EARLY");

      const earlyLeaveViolation = await TeacherViolation.findOne({
        sessionId: session._id,
        violationCategory: "EARLY_LEAVE",
      }).lean();
      expect(earlyLeaveViolation).toBeTruthy();
      expect(earlyLeaveViolation.violationType).toBe("TEACHER_LEFT_EARLY_30M");

      // F3: Brief-presence gaming (< 5 minutes total online in teaching period) is flagged on completion
      const gamingSession = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Brief Presence Gaming Session",
        status: "IN_PROGRESS",
        startDatetime: start,
        endDatetime: end,
      });
      await presenceService.recordParticipantConnected({
        sessionId: gamingSession._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "gaming_conn",
        connectedAt: new Date("2026-07-02T19:00:00.000Z"),
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: gamingSession._id,
        userId: teacher._id,
        connectionSessionId: "gaming_conn",
        disconnectedAt: new Date("2026-07-02T19:01:00.000Z"), // only 60s (< 300s)
      });
      await Session.updateOne(
        { _id: gamingSession._id },
        { $set: { status: "COMPLETED" } },
      );
      await presenceService.finalizeSessionAttendance(gamingSession._id, {
        now: end,
        forceRecalculate: true,
      });

      const gamingViolation = await TeacherViolation.findOne({
        sessionId: gamingSession._id,
        violationCategory: "ABANDONMENT",
      }).lean();
      expect(gamingViolation).toBeTruthy();
      expect(gamingViolation.violationType).toBe("TEACHER_BRIEF_PRESENCE");
    });
  });

  // =========================================================================
  // G & H. TEACHER INCIDENT REPORTING, ADMIN REVIEW & DISCIPLINE THRESHOLDS
  // =========================================================================
  describe("G & H. Teacher Incident Reporting, Admin Review & Discipline Thresholds", () => {
    it("G1-G4 & H1-H4: Handles private evidence upload, incident approval waiving violations, rejection confirming violations, and 3 YELLOW / 1 RED / 3 NO_SHOW discipline cases", async () => {
      // Upload private evidence file as teacher
      const uploadRes = await request(app)
        .post("/api/uploads/private")
        .set(as(teacher))
        .field("purpose", "INCIDENT_EVIDENCE")
        .attach("file", TINY_PNG, "medical_note.png");
      expect(uploadRes.statusCode).toBe(201);
      const evidenceKey = uploadRes.body.data.storageKey;

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Incident Review Session",
        status: "IN_PROGRESS",
        startDatetime: new Date(Date.now() - 25 * 60 * 1000),
        endDatetime: new Date(Date.now() + 95 * 60 * 1000),
      });

      // Trigger a RED lateness violation first
      await incidentService.recordOrEscalateTeacherViolation({
        session,
        violationCategory: "START_LATENESS",
        violationType: "TEACHER_LATE_20M",
        severity: "RED",
        detectedAt: new Date(),
        absenceDurationSeconds: 1200,
      });

      // G2: Other teacher cannot submit incident report for teacher's session -> 403
      const forbiddenRes = await request(app)
        .post(`/api/teacher/sessions/${session._id}/incident-reports`)
        .set(as(otherTeacher))
        .send({
          incidentType: "HEALTH_ISSUE",
          description: "Attempting unauthorized report",
          requestedAction: "EXCUSE_LATE",
        });
      expect(forbiddenRes.statusCode).toBe(403);

      // G1: Owning teacher submits valid incident report with private evidence
      const reportRes = await request(app)
        .post(`/api/teacher/sessions/${session._id}/incident-reports`)
        .set(as(teacher))
        .send({
          incidentType: "HEALTH_ISSUE",
          description:
            "Đau ốm đột xuất phải nhập viện kiểm tra, có giấy xác nhận y tế đính kèm.",
          requestedAction: "EXCUSE_LATE",
          evidenceFiles: [
            {
              storageKey: evidenceKey,
              originalName: "medical_note.png",
              mimeType: "image/png",
            },
          ],
        });
      expect(reportRes.statusCode).toBe(201);
      const reportId = reportRes.body.data._id;
      expect(reportRes.body.data.evidenceFiles[0].url).toContain(
        "/api/files/download?",
      );

      const vUnderReview = await TeacherViolation.findOne({
        sessionId: session._id,
      }).lean();
      expect(vUnderReview.reviewStatus).toBe("UNDER_INCIDENT_REVIEW");

      // G3 & H4: Admin approves incident report -> violation WAIVED, does NOT trigger RED discipline case
      const approveRes = await request(app)
        .post(`/api/admin/incident-reports/${reportId}/review`)
        .set(as(admin))
        .send({
          decision: "APPROVED",
          note: "Minh chứng y tế hợp lệ, miễn trừ cảnh báo Đỏ.",
        });
      expect(approveRes.statusCode).toBe(200);

      const vWaived = await TeacherViolation.findOne({
        sessionId: session._id,
      }).lean();
      expect(vWaived.reviewStatus).toBe("WAIVED");
      expect(vWaived.countsTowardDiscipline).toBe(false);
      expect(
        await TeacherDisciplineCase.countDocuments({ teacherId: teacher._id }),
      ).toBe(0);

      // Verify AuditLog was written
      const auditLogs = await AuditLog.find({
        targetId: String(reportId),
      }).lean();
      expect(auditLogs.length).toBeGreaterThanOrEqual(2);

      // H1: 3 confirmed YELLOW warnings -> opens THREE_YELLOW_WARNINGS discipline case
      for (let i = 1; i <= 3; i++) {
        const sYellow = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: `Yellow Session ${i}`,
          status: "COMPLETED",
          startDatetime: new Date(Date.now() - (i + 2) * 86400000),
          endDatetime: new Date(Date.now() - (i + 2) * 86400000 + 7200000),
        });
        const v = await incidentService.recordOrEscalateTeacherViolation({
          session: sYellow,
          violationCategory: "START_LATENESS",
          violationType: "TEACHER_LATE_10M",
          severity: "YELLOW",
        });
        await request(app)
          .post(`/api/admin/teacher-violations/${v._id}/review`)
          .set(as(admin))
          .send({ reviewStatus: "CONFIRMED", note: `Confirmed Yellow #${i}` });
      }

      const yellowCase = await TeacherDisciplineCase.findOne({
        teacherId: teacher._id,
        triggerRule: "THREE_YELLOW_WARNINGS",
      }).lean();
      expect(yellowCase).toBeTruthy();
      expect(yellowCase.recommendedAction).toBe(
        "REPUTATION_AND_REMUNERATION_REVIEW",
      );
      expect(yellowCase.autoExecutionBlocked).toBe(true);

      // H2: 1 confirmed RED violation -> opens ONE_RED_VIOLATION discipline case
      const sRed = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Confirmed Red Session",
        status: "COMPLETED",
        startDatetime: new Date(Date.now() - 86400000),
        endDatetime: new Date(Date.now() - 86400000 + 7200000),
      });
      const vRed = await incidentService.recordOrEscalateTeacherViolation({
        session: sRed,
        violationCategory: "START_LATENESS",
        violationType: "TEACHER_LATE_20M",
        severity: "RED",
      });
      await request(app)
        .post(`/api/admin/teacher-violations/${vRed._id}/review`)
        .set(as(admin))
        .send({ reviewStatus: "CONFIRMED", note: "Confirmed Red violation" });

      const redCase = await TeacherDisciplineCase.findOne({
        teacherId: teacher._id,
        triggerRule: "ONE_RED_VIOLATION",
      }).lean();
      expect(redCase).toBeTruthy();

      // H3: 3 confirmed NO_SHOW violations -> opens THREE_NO_SHOW_VIOLATIONS contract termination review case
      for (let i = 1; i <= 3; i++) {
        const sNoShow = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: `NoShow Session ${i}`,
          status: "CANCELLED",
          startDatetime: new Date(Date.now() - (i + 10) * 86400000),
          endDatetime: new Date(Date.now() - (i + 10) * 86400000 + 7200000),
        });
        const vNs = await incidentService.recordOrEscalateTeacherViolation({
          session: sNoShow,
          violationCategory: "START_LATENESS",
          violationType: "TEACHER_NO_SHOW_30M",
          severity: "NO_SHOW",
        });
        await request(app)
          .post(`/api/admin/teacher-violations/${vNs._id}/review`)
          .set(as(admin))
          .send({ reviewStatus: "CONFIRMED", note: `Confirmed No-Show #${i}` });
      }

      const noShowCase = await TeacherDisciplineCase.findOne({
        teacherId: teacher._id,
        triggerRule: "THREE_NO_SHOW_VIOLATIONS",
      }).lean();
      expect(noShowCase).toBeTruthy();
      expect(noShowCase.recommendedAction).toBe("CONTRACT_TERMINATION_REVIEW");
      expect(noShowCase.autoExecutionBlocked).toBe(true);
    });
  });

  // =========================================================================
  // I. RESCHEDULING, CONFLICT DETECTION & SAFE REFUND COORDINATION
  // =========================================================================
  describe("I. Rescheduling, Conflict Detection & Safe Refund Boundary", () => {
    it("I1-I4: Rejects conflicting/duplicate reschedule requests, creates linked makeup Session on approval, and opens safe SessionRefundReview if a student cannot attend", async () => {
      const origStart = new Date(Date.now() + 2 * 86400000);
      const origEnd = new Date(origStart.getTime() + 2 * 3600000);
      const originalSession = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Original Session To Reschedule",
        status: "SCHEDULED",
        startDatetime: origStart,
        endDatetime: origEnd,
      });

      const busyStart = new Date(Date.now() + 4 * 86400000);
      const busyEnd = new Date(busyStart.getTime() + 2 * 3600000);
      await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Existing Busy Session",
        status: "SCHEDULED",
        startDatetime: busyStart,
        endDatetime: busyEnd,
      });

      // I2: Conflicting proposed schedule -> rejected with 409 TEACHER_SCHEDULE_CONFLICT
      const conflictRes = await request(app)
        .post(
          `/api/teacher/sessions/${originalSession._id}/reschedule-requests`,
        )
        .set(as(teacher))
        .send({
          proposedStartDatetime: new Date(
            busyStart.getTime() + 30 * 60000,
          ).toISOString(),
          proposedEndDatetime: new Date(
            busyEnd.getTime() + 30 * 60000,
          ).toISOString(),
          reason: "Conflict test",
        });
      expect(conflictRes.statusCode).toBe(409);
      expect(conflictRes.body.error).toBe("TEACHER_SCHEDULE_CONFLICT");

      // Valid makeup time (6 days from now)
      const makeupStart = new Date(Date.now() + 6 * 86400000);
      const makeupEnd = new Date(makeupStart.getTime() + 2 * 3600000);

      const reqRes = await request(app)
        .post(
          `/api/teacher/sessions/${originalSession._id}/reschedule-requests`,
        )
        .set(as(teacher))
        .send({
          proposedStartDatetime: makeupStart.toISOString(),
          proposedEndDatetime: makeupEnd.toISOString(),
          proposedTitle: "Buổi học bù Toán 12A",
          reason: "Bận công tác đột xuất tại trường, xin dạy bù vào cuối tuần",
        });
      expect(reqRes.statusCode).toBe(201);
      const requestId = reqRes.body.data._id;

      // I3: Duplicate active reschedule request for the same session -> rejected with 409
      const dupRes = await request(app)
        .post(
          `/api/teacher/sessions/${originalSession._id}/reschedule-requests`,
        )
        .set(as(teacher))
        .send({
          proposedStartDatetime: new Date(
            Date.now() + 8 * 86400000,
          ).toISOString(),
          proposedEndDatetime: new Date(
            Date.now() + 8 * 86400000 + 7200000,
          ).toISOString(),
          reason: "Duplicate test",
        });
      expect(dupRes.statusCode).toBe(409);
      expect(dupRes.body.error).toBe("DUPLICATE_RESCHEDULE_REQUEST");

      // I1: Admin approves reschedule request -> creates linked makeup Session and preserves original Session
      const approveRes = await request(app)
        .post(`/api/admin/reschedule-requests/${requestId}/review`)
        .set(as(admin))
        .send({
          decision: "APPROVED",
          note: "Chấp thuận lịch dạy bù cho lớp",
        });
      expect(approveRes.statusCode).toBe(200);
      const makeupSessionId = approveRes.body.data.makeupSessionId;
      expect(makeupSessionId).toBeTruthy();

      const [reloadedOriginal, makeupSession] = await Promise.all([
        Session.findById(originalSession._id).lean(),
        Session.findById(makeupSessionId).lean(),
      ]);
      expect(reloadedOriginal).toBeTruthy(); // original session preserved!
      expect(reloadedOriginal.lifecycleState).toBe("RESCHEDULED");
      expect(
        reloadedOriginal.rescheduleMetadata.rescheduledToSessionId.toString(),
      ).toBe(String(makeupSessionId));
      expect(makeupSession.status).toBe("SCHEDULED");
      expect(makeupSession.rescheduleMetadata.isMakeupSession).toBe(true);
      expect(
        makeupSession.rescheduleMetadata.rescheduledFromSessionId.toString(),
      ).toBe(originalSession._id.toString());

      // I4: Student 1 accepts makeup session; Student 2 cannot attend -> creates safe SessionRefundReview for Student 2
      const s1Confirm = await request(app)
        .post(`/api/student/reschedule-requests/${requestId}/respond`)
        .set(as(student1))
        .send({ status: "ACCEPTED", note: "Em tham gia được ạ" });
      expect(s1Confirm.statusCode).toBe(200);

      const s2Decline = await request(app)
        .post(`/api/student/reschedule-requests/${requestId}/respond`)
        .set(as(student2))
        .send({ status: "CANNOT_ATTEND", note: "Em bị trùng lịch thi học kỳ" });
      expect(s2Decline.statusCode).toBe(200);

      const refundReviews = await SessionRefundReview.find({
        sessionId: originalSession._id,
        studentId: student2._id,
      }).lean();
      expect(refundReviews.length).toBe(1);
      expect(refundReviews[0].triggerReason).toBe(
        "RESCHEDULE_DECLINED_BY_STUDENT",
      );
      expect(refundReviews[0].status).toBe("NEEDS_FINANCIAL_REVIEW");

      // Confirm Payment & TeacherEarning tables were not mutated directly
      expect(await Payment.countDocuments({})).toBe(0);
      expect(await TeacherEarning.countDocuments({})).toBe(0);
    });
  });

  // =========================================================================
  // J. OVERTIME REMINDER & 30-MINUTE GRACE PERIOD AUTO-COMPLETION
  // =========================================================================
  describe("J. Overtime Grace Period & Safe Auto-Completion", () => {
    it("J1-J2: Enters GRACE_PERIOD with teacher overtime reminder after endDatetime, and safely auto-completes at endDatetime + 30m", async () => {
      const start = new Date("2026-08-01T19:00:00.000Z");
      const end = new Date("2026-08-01T21:00:00.000Z");

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Overtime Auto-Complete Session",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      // Teacher & Student 1 connect at 19:00 and stay through 21:00
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "t_overtime",
        connectedAt: start,
      });
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "s1_overtime",
        connectedAt: start,
      });

      // J1: At 21:05 (5 minutes past endDatetime, inside 30m grace period) -> stays IN_PROGRESS, roomState = GRACE_PERIOD, teacher reminded
      await runSessionLifecycleJob(new Date("2026-08-01T21:05:00.000Z"));
      const inGrace = await Session.findById(session._id).lean();
      expect(inGrace.status).toBe("IN_PROGRESS");
      expect(inGrace.roomState).toBe("GRACE_PERIOD");
      expect(inGrace.teacherPresence.overtimeRemindedAt).toBeTruthy();

      const overtimeNotifs = await Notification.countDocuments({
        userId: teacher._id,
        type: "TEACHER_OVERTIME_REMINDER",
      });
      expect(overtimeNotifs).toBe(1);

      // J2: At 21:31 (past endDatetime + 30m grace period) -> transitions to COMPLETED / AUTO_COMPLETED and finalizes attendance
      // Teacher disconnects at 21:00 (after finishing scheduled teaching) without clicking End Session;
      // 30+ continuous minutes later at 21:31 -> transitions to COMPLETED / AUTO_COMPLETED
      await presenceService.recordParticipantDisconnected({
        sessionId: session._id,
        userId: teacher._id,
        connectionSessionId: "t_overtime",
        disconnectedAt: new Date("2026-08-01T21:00:30.000Z"),
      });
      await runSessionLifecycleJob(new Date("2026-08-01T21:31:00.000Z"));
      const autoCompleted = await Session.findById(session._id).lean();
      expect(autoCompleted.status).toBe("COMPLETED");
      expect(autoCompleted.lifecycleState).toBe("AUTO_COMPLETED");
      expect(autoCompleted.endReason).toBe("AUTO_COMPLETED");
      expect(autoCompleted.roomState).toBe("ENDED");

      const s1Att = await SessionAttendance.findOne({
        sessionId: session._id,
        studentId: student1._id,
      }).lean();
      expect(s1Att.attendancePercentage).toBe(100); // clipped to [19:00, 21:00] = 100%
      expect(s1Att.attendanceStatus).toBe("PRESENT");
      expect(s1Att.evaluationStatus).toBe("FINALIZED");

      const s2Att = await SessionAttendance.findOne({
        sessionId: session._id,
        studentId: student2._id,
      }).lean();
      expect(s2Att.attendanceStatus).toBe("ABSENT");
    });
  });

  // =========================================================================
  // K. TIN-05D/E-FIX01 TARGETED REGRESSION SUITE (SCENARIOS A - L)
  // =========================================================================
  describe("K. TIN-05D/E-FIX01: Overtime Protection, Teacher Disconnection Grace & LiveKit Presence Security (A-L)", () => {
    it("FIX01-A & FIX01-B: Does NOT auto-complete session when teacher and students are still online 30m and 60m after scheduled end", async () => {
      const origStartRec = videoProvider.startRecording;
      videoProvider.startRecording = async () => "egress_overtime_active_1";

      try {
        const start = new Date("2026-09-01T19:00:00.000Z");
        const end = new Date("2026-09-01T21:00:00.000Z");

        const session = await Session.create({
          classId: cls._id,
          className: cls.className,
          teacherId: teacher._id,
          title: "Active Overtime Session (A & B)",
          status: "SCHEDULED",
          startDatetime: start,
          endDatetime: end,
        });

        await presenceService.recordParticipantConnected({
          sessionId: session._id,
          userId: teacher._id,
          role: "TEACHER",
          connectionSessionId: "lk_teacher_active_ot",
          connectedAt: start,
          source: "LIVEKIT_WEBHOOK",
        });
        await presenceService.recordParticipantConnected({
          sessionId: session._id,
          userId: student1._id,
          role: "STUDENT",
          connectionSessionId: "lk_student1_active_ot",
          connectedAt: start,
          source: "LIVEKIT_WEBHOOK",
        });

        // Scenario A: 30 minutes after scheduled end (21:30) while teacher & student are still online
        await runSessionLifecycleJob(new Date("2026-09-01T21:30:00.000Z"));
        const at30m = await Session.findById(session._id).lean();
        expect(at30m.status).toBe("IN_PROGRESS");
        expect(at30m.roomState).toBe("GRACE_PERIOD");
        expect(at30m.recording.status).toBe("PROCESSING");
        expect(at30m.recordingSegments[0].stoppedAt).toBeNull();
        expect(at30m.attendanceFinalizedAt).toBeNull();

        const attAt30m = await SessionAttendance.findOne({
          sessionId: session._id,
          studentId: student1._id,
        }).lean();
        expect(attAt30m.evaluationStatus).toBe("PENDING");
        expect(attAt30m.finalizedAt).toBeNull();

        // Scenario B: 60 minutes after scheduled end (22:00) while teacher & student are still online
        await runSessionLifecycleJob(new Date("2026-09-01T22:00:00.000Z"));
        const at60m = await Session.findById(session._id).lean();
        expect(at60m.status).toBe("IN_PROGRESS");
        expect(at60m.recording.status).toBe("PROCESSING");
        expect(at60m.recordingSegments[0].stoppedAt).toBeNull();
        expect(at60m.attendanceFinalizedAt).toBeNull();

        const attAt60m = await SessionAttendance.findOne({
          sessionId: session._id,
          studentId: student1._id,
        }).lean();
        expect(attAt60m.evaluationStatus).toBe("PENDING");
        expect(attAt60m.finalizedAt).toBeNull();
      } finally {
        videoProvider.startRecording = origStartRec;
      }
    });

    it("FIX01-C & FIX01-D: Teacher leaves 5m before scheduled end (20:55) -> NOT interrupted at 21:00 or 21:20; reconnecting at 21:24 (29m) cancels absence countdown", async () => {
      const start = new Date("2026-09-02T19:00:00.000Z");
      const end = new Date("2026-09-02T21:00:00.000Z");

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Teacher Leaves 5m Early & Reconnects At 29m (C & D)",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "lk_t_cd_1",
        connectedAt: start,
        source: "LIVEKIT_WEBHOOK",
      });
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: student1._id,
        role: "STUDENT",
        connectionSessionId: "lk_s_cd_1",
        connectedAt: start,
        source: "LIVEKIT_WEBHOOK",
      });

      // C: Teacher leaves 5 minutes before scheduled end (20:55)
      await presenceService.recordParticipantDisconnected({
        sessionId: session._id,
        userId: teacher._id,
        connectionSessionId: "lk_t_cd_1",
        disconnectedAt: new Date("2026-09-02T20:55:00.000Z"),
      });

      // At 21:00 (5m absent): DO NOT mark INTERRUPTED or COMPLETED
      await runSessionLifecycleJob(new Date("2026-09-02T21:00:00.000Z"));
      const at2100 = await Session.findById(session._id).lean();
      expect(at2100.status).toBe("IN_PROGRESS");
      expect(await TeacherViolation.countDocuments({ sessionId: session._id })).toBe(0);

      // At 21:20 (25m absent): DO NOT mark INTERRUPTED or COMPLETED
      await runSessionLifecycleJob(new Date("2026-09-02T21:20:00.000Z"));
      const at2120 = await Session.findById(session._id).lean();
      expect(at2120.status).toBe("IN_PROGRESS");
      expect(await TeacherViolation.countDocuments({ sessionId: session._id })).toBe(0);

      // D: Teacher returns after 29 minutes (at 21:24) -> cancels absence countdown
      await presenceService.recordParticipantConnected({
        sessionId: session._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "lk_t_cd_2",
        connectedAt: new Date("2026-09-02T21:24:00.000Z"),
        source: "LIVEKIT_WEBHOOK",
      });

      const afterReconnect = await Session.findById(session._id).lean();
      expect(afterReconnect.teacherPresence.isCurrentlyConnected).toBe(true);
      expect(afterReconnect.teacherPresence.currentAbsenceStartedAt).toBeNull();
      expect(afterReconnect.teacherPresence.maxContinuousAbsenceSeconds).toBe(29 * 60);

      // Even at 21:25 and 21:35, session stays IN_PROGRESS and has 0 violations
      await runSessionLifecycleJob(new Date("2026-09-02T21:25:00.000Z"));
      const at2125 = await Session.findById(session._id).lean();
      expect(at2125.status).toBe("IN_PROGRESS");
      expect(await TeacherViolation.countDocuments({ sessionId: session._id })).toBe(0);
    });

    it("FIX01-E & FIX01-F: Evaluates 30-minute continuous absence at 21:25 (referring near-complete session to Admin review), and does NOT sum separate disconnect intervals", async () => {
      const start = new Date("2026-09-03T19:00:00.000Z");
      const end = new Date("2026-09-03T21:00:00.000Z");

      // Scenario E: Teacher leaves at 20:55 and remains absent for 30 continuous minutes (at 21:25)
      const sessionE = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Teacher Absent 30m From 20:55 (E)",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      await presenceService.recordParticipantConnected({
        sessionId: sessionE._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "lk_t_e_1",
        connectedAt: start,
        source: "LIVEKIT_WEBHOOK",
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sessionE._id,
        userId: teacher._id,
        connectionSessionId: "lk_t_e_1",
        disconnectedAt: new Date("2026-09-03T20:55:00.000Z"),
      });

      // At 21:24:59 (29m59s) -> still IN_PROGRESS
      await runSessionLifecycleJob(new Date("2026-09-03T21:24:59.000Z"));
      expect((await Session.findById(sessionE._id).lean()).status).toBe("IN_PROGRESS");

      // At 21:25:00 (30m00s continuous absence) -> triggers 30m threshold, preserves 95.83% evidence, refers to Admin review
      await runSessionLifecycleJob(new Date("2026-09-03T21:25:00.000Z"));
      const interruptedE = await Session.findById(sessionE._id).lean();
      expect(interruptedE.status).toBe("INTERRUPTED");
      expect(interruptedE.endReason).toBe("TEACHER_LEFT_EARLY");
      expect(interruptedE.teacherPresence.scheduledOnlineSeconds).toBe(115 * 60);

      const violationE = await TeacherViolation.findOne({ sessionId: sessionE._id }).lean();
      expect(violationE).toBeTruthy();
      expect(violationE.violationType).toBe("TEACHER_LEFT_EARLY_30M");
      expect(violationE.reviewStatus).toBe("PENDING_INCIDENT_WINDOW");
      expect(violationE.countsTowardDiscipline).toBe(false);
      expect(violationE.escalationHistory[0].note).toContain("Admin review");

      // Scenario F: Teacher disconnects twice (20m + 20m = 40m cumulative, but <30m each) with a reconnection in between
      const sessionF = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Two Separate 20m Disconnects (F)",
        status: "SCHEDULED",
        startDatetime: start,
        endDatetime: end,
      });

      // Connect 19:00 -> Disconnect #1 at 19:10
      await presenceService.recordParticipantConnected({
        sessionId: sessionF._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "lk_t_f_1",
        connectedAt: start,
        source: "LIVEKIT_WEBHOOK",
      });
      await presenceService.recordParticipantDisconnected({
        sessionId: sessionF._id,
        userId: teacher._id,
        connectionSessionId: "lk_t_f_1",
        disconnectedAt: new Date("2026-09-03T19:10:00.000Z"),
      });

      // Reconnect at 19:30 (20m absence < 30m)
      await runSessionLifecycleJob(new Date("2026-09-03T19:29:00.000Z"));
      await presenceService.recordParticipantConnected({
        sessionId: sessionF._id,
        userId: teacher._id,
        role: "TEACHER",
        connectionSessionId: "lk_t_f_2",
        connectedAt: new Date("2026-09-03T19:30:00.000Z"),
        source: "LIVEKIT_WEBHOOK",
      });

      // Disconnect #2 at 19:40 -> checked at 20:00 (another 20m absence < 30m; cumulative 40m but separate intervals!)
      await presenceService.recordParticipantDisconnected({
        sessionId: sessionF._id,
        userId: teacher._id,
        connectionSessionId: "lk_t_f_2",
        disconnectedAt: new Date("2026-09-03T19:40:00.000Z"),
      });
      await runSessionLifecycleJob(new Date("2026-09-03T20:00:00.000Z"));

      const afterSecond20m = await Session.findById(sessionF._id).lean();
      expect(afterSecond20m.status).toBe("IN_PROGRESS");
      expect(await TeacherViolation.countDocuments({ sessionId: sessionF._id })).toBe(0);
    });

    it("FIX01-G, FIX01-H & FIX01-K: Rejects forged heartbeat and forged presence/connect without trusted LiveKit evidence; blocks student 20m bypass and fake teacher presence", async () => {
      const start = new Date(Date.now() - 10 * 60 * 1000);
      const end = new Date(Date.now() + 110 * 60 * 1000);

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Anti-Spoofing Presence Session (G, H, K)",
        status: "SCHEDULED",
        meetingRoomId: "room_antispoof_1",
        startDatetime: start,
        endDatetime: end,
      });

      // Scenario G: Student sends forged heartbeat without real LiveKit connection -> 403 UNVERIFIED_LIVEKIT_PRESENCE
      const forgedHeartbeat = await request(app)
        .post(`/api/sessions/${session._id}/presence/heartbeat`)
        .set(as(student1))
        .send({ connectionSessionId: "forged_hb_1", hasVerifiedConnection: true });
      expect(forgedHeartbeat.statusCode).toBe(403);
      expect(forgedHeartbeat.body.error).toBe("UNVERIFIED_LIVEKIT_PRESENCE");

      // Scenario H: Student & Teacher send forged presence/connect without real LiveKit connection -> 403 UNVERIFIED_LIVEKIT_PRESENCE
      const forgedStudentConnect = await request(app)
        .post(`/api/sessions/${session._id}/presence/connect`)
        .set(as(student1))
        .send({ connectionSessionId: "forged_conn_1", source: "LIVEKIT_WEBHOOK" });
      expect(forgedStudentConnect.statusCode).toBe(403);
      expect(forgedStudentConnect.body.error).toBe("UNVERIFIED_LIVEKIT_PRESENCE");

      const forgedTeacherConnect = await request(app)
        .post(`/api/sessions/${session._id}/presence/connect`)
        .set(as(teacher))
        .send({ connectionSessionId: "forged_teacher_1" });
      expect(forgedTeacherConnect.statusCode).toBe(403);
      expect(forgedTeacherConnect.body.error).toBe("UNVERIFIED_LIVEKIT_PRESENCE");

      // Verify 0 intervals were created and teacher presence was NOT satisfied by fake presence
      expect(await SessionPresenceInterval.countDocuments({ sessionId: session._id })).toBe(0);
      const reloadSession = await Session.findById(session._id).lean();
      expect(reloadSession.teacherPresence?.firstTeachingJoinAt).toBeFalsy();
      expect(reloadSession.teacherPresence?.isCurrentlyConnected).toBe(false);

      // Finalizing attendance gives student1 ABSENT (0s online), proving fake heartbeats cannot yield PRESENT
      const finalized = await presenceService.finalizeSessionAttendance(session._id, {
        now: end,
        forceRecalculate: true,
      });
      const s1Final = finalized.find((a) => a.studentId.toString() === student1._id.toString());
      expect(s1Final.scheduledOnlineSeconds).toBe(0);
      expect(s1Final.attendanceStatus).toBe("ABSENT");
      expect(s1Final.hasVerifiedConnection).toBe(false);

      // Scenario K: Move session start to 25 minutes ago -> student1 (whose forged connect was blocked) cannot bypass 20m deadline
      await Session.updateOne(
        { _id: session._id },
        { $set: { startDatetime: new Date(Date.now() - 25 * 60 * 1000), status: "IN_PROGRESS" } }
      );
      const bypassJoin = await request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(student1))
        .send({ hasVerifiedConnection: true, isReconnect: true });
      expect(bypassJoin.statusCode).toBe(403);
      expect(bypassJoin.body.error).toBe("JOIN_WINDOW_CLOSED");

      // Verify reconciliation works when trusted LiveKit RoomService confirms participant is in the room
      const origListParticipants = videoProvider.listRoomParticipants;
      videoProvider.listRoomParticipants = async () => [
        { identity: String(teacher._id), sid: "PA_trusted_teacher", state: "ACTIVE", joinedAt: Math.floor(Date.now() / 1000) },
      ];
      try {
        const reconciledRes = await request(app)
          .post(`/api/sessions/${session._id}/presence/connect`)
          .set(as(teacher))
          .send({ connectionSessionId: "PA_trusted_teacher" });
        expect(reconciledRes.statusCode).toBe(200);
        expect(reconciledRes.body.data.verified).toBe(true);
        expect(reconciledRes.body.data.reconciled).toBe(true);
      } finally {
        videoProvider.listRoomParticipants = origListParticipants;
      }
    });

    it("FIX01-I, FIX01-J & FIX01-L: Deduplicates duplicate LiveKit events, merges multi-tab intervals without double-counting, and refers <5m brief teacher presence to Admin review without auto-penalty", async () => {
      const start = new Date("2026-09-05T19:00:00.000Z");
      const end = new Date("2026-09-05T21:00:00.000Z");

      const session = await Session.create({
        classId: cls._id,
        className: cls.className,
        teacherId: teacher._id,
        title: "Deduplication, Multi-Tab & Brief Presence Session (I, J, L)",
        status: "IN_PROGRESS",
        meetingRoomId: "room_ijl_1",
        startDatetime: start,
        endDatetime: end,
      });

      // Scenario I: Duplicate LiveKit webhook events with the same eventId / sid
      const firstJoinEvt = await presenceService.handleLiveKitEvent({
        id: "evt_dup_join_1",
        event: "participant_joined",
        createdAt: Math.floor(new Date("2026-09-05T19:00:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(student1._id), sid: "PA_s1_tab1" },
      });
      expect(firstJoinEvt.deduplicated).toBe(false);

      const dupJoinEvt = await presenceService.handleLiveKitEvent({
        id: "evt_dup_join_1",
        event: "participant_joined",
        createdAt: Math.floor(new Date("2026-09-05T19:00:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(student1._id), sid: "PA_s1_tab1" },
      });
      expect(dupJoinEvt.deduplicated).toBe(true);
      expect(
        await SessionPresenceInterval.countDocuments({ sessionId: session._id, userId: student1._id })
      ).toBe(1);

      // Scenario J: Student opens a second browser tab (PA_s1_tab2) from 19:10 to 19:40 while tab1 is open 19:00 to 19:40
      await presenceService.handleLiveKitEvent({
        id: "evt_tab2_join",
        event: "participant_joined",
        createdAt: Math.floor(new Date("2026-09-05T19:10:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(student1._id), sid: "PA_s1_tab2" },
      });

      // Tab 2 disconnects at 19:30 -> Tab 1 is still open, so student1 remains connected
      await presenceService.handleLiveKitEvent({
        id: "evt_tab2_leave",
        event: "participant_left",
        createdAt: Math.floor(new Date("2026-09-05T19:30:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(student1._id), sid: "PA_s1_tab2" },
      });
      const attMid = await SessionAttendance.findOne({
        sessionId: session._id,
        studentId: student1._id,
      }).lean();
      expect(attMid.isCurrentlyConnected).toBe(true);

      // Tab 1 disconnects at 19:40 -> merged union [19:00, 19:40] = 40m (2400s), never 40m + 20m = 60m!
      await presenceService.handleLiveKitEvent({
        id: "evt_tab1_leave",
        event: "participant_left",
        createdAt: Math.floor(new Date("2026-09-05T19:40:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(student1._id), sid: "PA_s1_tab1" },
      });

      // Scenario L: Teacher connects for only 2 minutes (120s < 300s threshold) and disconnects without teaching
      await presenceService.handleLiveKitEvent({
        id: "evt_teacher_brief_join",
        event: "participant_joined",
        createdAt: Math.floor(new Date("2026-09-05T19:00:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(teacher._id), sid: "PA_t_brief" },
      });
      await presenceService.handleLiveKitEvent({
        id: "evt_teacher_brief_leave",
        event: "participant_left",
        createdAt: Math.floor(new Date("2026-09-05T19:02:00.000Z").getTime() / 1000),
        room: { name: "room_ijl_1" },
        participant: { identity: String(teacher._id), sid: "PA_t_brief" },
      });

      await Session.updateOne({ _id: session._id }, { $set: { status: "COMPLETED" } });
      await presenceService.finalizeSessionAttendance(session._id, {
        now: end,
        forceRecalculate: true,
      });

      const s1After = await SessionAttendance.findOne({
        sessionId: session._id,
        studentId: student1._id,
      }).lean();
      expect(s1After.scheduledOnlineSeconds).toBe(2400); // 40m exact union

      const briefViolation = await TeacherViolation.findOne({
        sessionId: session._id,
        violationType: "TEACHER_BRIEF_PRESENCE",
      }).lean();
      expect(briefViolation).toBeTruthy();
      expect(briefViolation.reviewStatus).toBe("PENDING_INCIDENT_WINDOW");
      expect(briefViolation.countsTowardDiscipline).toBe(false);
      // Confirm no automatic discipline/financial/contract penalty case was created prior to Admin confirmation
      expect(await TeacherDisciplineCase.countDocuments({ teacherId: teacher._id })).toBe(0);
    });
  });
});
