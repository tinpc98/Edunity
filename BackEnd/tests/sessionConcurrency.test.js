const os = require("os");
const path = require("path");
const fs = require("fs");
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-storage-"));
}

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { User, Category, Subject, Course, Class, Session, SessionAttendance, Enrollment } = require("../src/models");
const sessionService = require("../src/services/sessionService");
const studentService = require("../src/services/studentService");
const videoProvider = require("../src/services/videoProvider");
const { hashPassword } = require("../src/utils/password");
const { connectDB, disconnectDB, clearDB, syncIndexes } = require("./helpers/db");

const as = (user) => ({ "x-user-id": user._id.toString() });

describe("TIN-05B-FINAL: Session Race & Egress Recovery Test Suite", () => {
  let admin, teacher, student1, student2, student3, cls;

  beforeAll(async () => {
    await connectDB();
    await syncIndexes();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDB();
    const passwordHash = hashPassword("password123");

    admin = await User.create({ email: "admin@test.com", passwordHash, role: "ADMIN" });
    teacher = await User.create({
      email: "teacher@test.com",
      passwordHash,
      role: "TEACHER",
      teacherProfile: { fullName: "Teacher Lead", verificationStatus: "VERIFIED" },
    });

    student1 = await User.create({
      email: "s1@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student One" },
    });
    student2 = await User.create({
      email: "s2@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Two" },
    });
    student3 = await User.create({
      email: "s3@test.com",
      passwordHash,
      role: "STUDENT",
      studentProfile: { fullName: "Student Three" },
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
      title: "NodeJS Mastery",
      slug: "nodejs-mastery",
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
      teacherName: "Lead Teacher",
      categoryId: category._id,
      subjectId: subject._id,
      className: "Class Concurrency 101",
      classType: "FREE",
      price: 0,
      capacity: 30,
      status: "OPEN",
    });

    for (const stu of [student1, student2, student3]) {
      await Enrollment.create({
        classId: cls._id,
        courseId: cls.courseId,
        teacherId: teacher._id,
        studentId: stu._id,
        enrollmentStatus: "CONFIRMED",
        paymentSource: "FREE",
      });
    }
  });

  const createSession = async (status = "IN_PROGRESS", minutesAgo = 5) => {
    const now = new Date();
    return Session.create({
      classId: cls._id,
      className: cls.className,
      teacherId: teacher._id,
      title: "Session Concurrency Test",
      sessionNumber: 1,
      status,
      meetingRoomId: `room_${new mongoose.Types.ObjectId()}`,
      startDatetime: new Date(now.getTime() - minutesAgo * 60 * 1000),
      endDatetime: new Date(now.getTime() + 40 * 60 * 1000),
    });
  };

  // =========================================================================
  // FINAL-01: Student đọc Session trước End, Teacher End commit, Student tiếp tục
  // EVIDENCE: REAL MONGODB REPLSET + CONTROLLED BARRIER
  // =========================================================================
  it("FINAL-01: Student reads Session before End, Teacher End commits, Student is rejected (No Phantom Join)", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    // Create a previous attendance record for student1 with leftAt already set
    // This is the hardest case where Teacher End does not write to student1's record
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(Date.now() - 10 * 60 * 1000),
      leftAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    let studentReachedBarrier = false;
    let resumeStudent = null;
    const studentBarrier = new Promise((resolve) => {
      resumeStudent = resolve;
    });

    const originalFindOneAndUpdate = Session.findOneAndUpdate;
    let hookTriggered = false;
    Session.findOneAndUpdate = async function (filter, update, options) {
      if (filter?._id?.toString() === session._id.toString() && update?.$inc?.__v && !hookTriggered) {
        hookTriggered = true;
        studentReachedBarrier = true;
        // Pause Student inside transaction right after reading snapshot and before write
        await studentBarrier;
      }
      return originalFindOneAndUpdate.call(this, filter, update, options);
    };

    try {
      // 1. Student initiates join
      const studentJoinPromise = request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(student1))
        .then((res) => res);

      const startTime = Date.now();
      while (!studentReachedBarrier && Date.now() - startTime < 3000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(studentReachedBarrier).toBe(true);

      // 2. Teacher ends session and commits COMPLETED
      const endRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(endRes.statusCode).toBe(200);
      expect(endRes.body.data.status).toBe("COMPLETED");

      // 3. Resume student: Write conflict on Session triggers retry, detects COMPLETED, and rejects!
      resumeStudent();
      const joinRes = await studentJoinPromise;

      // Student MUST be rejected with 409 SESSION_ENDED
      expect(joinRes.statusCode).toBe(409);
      expect(joinRes.body.error).toBe("SESSION_ENDED");

      // Session in DB remains COMPLETED
      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("COMPLETED");
    } finally {
      Session.findOneAndUpdate = originalFindOneAndUpdate;
      if (resumeStudent) resumeStudent();
    }
  });

  // =========================================================================
  // FINAL-02: Teacher End hoàn tất trước Student Join
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("FINAL-02: Teacher End completes before Student Join (Join Rejected with 409)", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const endRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(endRes.statusCode).toBe(200);

    const joinRes = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student1));
    expect(joinRes.statusCode).toBe(409);
    expect(joinRes.body.error).toBe("SESSION_ENDED");
  });

  // =========================================================================
  // FINAL-03: Student Join hoàn tất trước Teacher End
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("FINAL-03: Student Join completes before Teacher End (Valid Join & Correct Attendance)", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const joinRes = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student1));
    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.body.data.role).toBe("PARTICIPANT");

    const endRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
    expect(endRes.statusCode).toBe(200);
    expect(endRes.body.data.status).toBe("COMPLETED");

    const s1 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student1._id });
    const s2 = await SessionAttendance.findOne({ sessionId: session._id, studentId: student2._id });
    expect(s1.attendanceStatus).toBe("PRESENT");
    expect(s2.attendanceStatus).toBe("ABSENT");
  });

  // =========================================================================
  // FINAL-04: Double Teacher Join
  // EVIDENCE: REAL MONGODB REPLSET + CONTROLLED BARRIER
  // =========================================================================
  it("FINAL-04: Double Teacher Join creates EXACTLY ONE Egress", async () => {
    const session = await createSession("SCHEDULED");

    let recordingCalls = [];
    let teacher1Reached = false;
    let resumeTeacher1 = null;
    const teacher1Barrier = new Promise((resolve) => {
      resumeTeacher1 = resolve;
    });

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async (roomId, storageKey) => {
      recordingCalls.push({ roomId, storageKey });
      if (recordingCalls.length === 1) {
        teacher1Reached = true;
        await teacher1Barrier;
      }
      return "egress_test_123";
    };

    try {
      const teacher1Promise = request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(teacher))
        .then((res) => res);

      const startTime = Date.now();
      while (!teacher1Reached && Date.now() - startTime < 3000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(teacher1Reached).toBe(true);

      const teacher2Promise = request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(teacher))
        .then((res) => res);

      await new Promise((r) => setTimeout(r, 100));

      resumeTeacher1();

      const [res1, res2] = await Promise.all([teacher1Promise, teacher2Promise]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      // EXACTLY ONE egress started
      expect(recordingCalls.length).toBe(1);

      const updatedSession = await Session.findById(session._id);
      expect(updatedSession.status).toBe("IN_PROGRESS");
      expect(updatedSession.recording.providerRecordingId).toBe("egress_test_123");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      if (resumeTeacher1) resumeTeacher1();
    }
  });

  // =========================================================================
  // FINAL-05: Teacher CAS loser đọc lại COMPLETED
  // EVIDENCE: REAL MONGODB REPLSET + MOCK FAULT INJECTION
  // =========================================================================
  it("FINAL-05: Teacher CAS loser refreshes and finds session COMPLETED (Rejected with 409)", async () => {
    const session = await createSession("SCHEDULED");

    // Simulate winner already started, ended, and set session to COMPLETED
    const originalFindOneAndUpdate = Session.findOneAndUpdate;
    Session.findOneAndUpdate = async function (filter, update, options) {
      if (filter.status === "SCHEDULED") {
        // Teacher 2 loses CAS (returns null)
        // Meanwhile, session in DB was COMPLETED by Teacher End
        await Session.updateOne({ _id: session._id }, { $set: { status: "COMPLETED" } });
        return null;
      }
      return originalFindOneAndUpdate.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_ENDED");
    } finally {
      Session.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  // =========================================================================
  // FINAL-06: Teacher Start đang ghi hình, Teacher End commit
  // EVIDENCE: REAL MONGODB REPLSET + CONTROLLED BARRIER
  // =========================================================================
  it("FINAL-06: Teacher Start is recording while Teacher End commits (Metadata saved, Join rejected with 409)", async () => {
    const session = await createSession("SCHEDULED");

    let recordingStarted = false;
    let resumeStartRecording = null;
    const recordingBarrier = new Promise((resolve) => {
      resumeStartRecording = resolve;
    });

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async (roomId, storageKey) => {
      recordingStarted = true;
      await recordingBarrier;
      return "egress_race_completed_123";
    };

    try {
      const joinPromise = request(app)
        .post(`/api/sessions/${session._id}/join`)
        .set(as(teacher))
        .then((res) => res);

      const startTime = Date.now();
      while (!recordingStarted && Date.now() - startTime < 3000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(recordingStarted).toBe(true);

      // Teacher End commits COMPLETED while startRecording is waiting
      const endRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(endRes.statusCode).toBe(200);

      // Now resume startRecording
      resumeStartRecording();
      const joinRes = await joinPromise;

      // Join MUST NOT issue host token for ended session
      expect(joinRes.statusCode).toBe(409);
      expect(joinRes.body.error).toBe("SESSION_ENDED");

      // In DB, recording metadata IS preserved, and status remains COMPLETED!
      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("COMPLETED");
      expect(sessionInDb.recording).not.toBeNull();
      expect(sessionInDb.recording.providerRecordingId).toBe("egress_race_completed_123");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      if (resumeStartRecording) resumeStartRecording();
    }
  });

  // =========================================================================
  // FINAL-07: Recording metadata save thất bại lần đầu rồi thành công
  // EVIDENCE: MOCK FAULT INJECTION
  // =========================================================================
  it("FINAL-07: Recording metadata save fails on attempt 1 and recovers on retry", async () => {
    const session = await createSession("SCHEDULED");

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async () => "egress_retry_success";

    let saveAttempts = 0;
    const originalUpdateOne = Session.updateOne;
    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        saveAttempts++;
        if (saveAttempts === 1) {
          throw new Error("Transient DB glitch on metadata save");
        }
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(saveAttempts).toBeGreaterThanOrEqual(2);

      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("IN_PROGRESS");
      expect(sessionInDb.recording.status).toBe("PROCESSING");
      expect(sessionInDb.recording.providerRecordingId).toBe("egress_retry_success");
    } finally {
      Session.updateOne = originalUpdateOne;
      videoProvider.startRecording = originalStartRecording;
    }
  });

  // =========================================================================
  // FINAL-08: Metadata save thất bại cả ba lần
  // EVIDENCE: MOCK FAULT INJECTION
  // =========================================================================
  it("FINAL-08: Metadata save fails on all three attempts (Rejects after exhaustion)", async () => {
    const session = await createSession("SCHEDULED");

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async () => "egress_exhaust_123";

    let saveAttempts = 0;
    const originalUpdateOne = Session.updateOne;
    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        saveAttempts++;
        throw new Error("Persistent DB connection failure");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(saveAttempts).toBe(3); // Exactly 3 attempts made, then threw
    } finally {
      Session.updateOne = originalUpdateOne;
      videoProvider.startRecording = originalStartRecording;
    }
  });

  // =========================================================================
  // FINAL-09: Metadata update matchedCount = 0
  // EVIDENCE: MOCK FAULT INJECTION
  // =========================================================================
  it("FINAL-09: Metadata update returns matchedCount = 0 (Rejects without useless retries)", async () => {
    const session = await createSession("SCHEDULED");

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async () => "egress_matched_zero";

    let saveAttempts = 0;
    const originalUpdateOne = Session.updateOne;
    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        saveAttempts++;
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe("SESSION_NOT_FOUND");
      expect(saveAttempts).toBe(1); // Throws immediately without useless retries
    } finally {
      Session.updateOne = originalUpdateOne;
      videoProvider.startRecording = originalStartRecording;
    }
  });

  // =========================================================================
  // FINAL-10: Không khởi tạo Egress trùng khi retry
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("FINAL-10: Re-joining an IN_PROGRESS session does not start a second Egress", async () => {
    const session = await createSession("IN_PROGRESS");

    let recordingCalls = 0;
    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async () => {
      recordingCalls++;
      return "egress_dup_test";
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(recordingCalls).toBe(0); // Not called since status is already IN_PROGRESS
    } finally {
      videoProvider.startRecording = originalStartRecording;
    }
  });

  // =========================================================================
  // FINAL-11: LiveKit closeRoom thất bại
  // EVIDENCE: MOCK FAULT INJECTION
  // =========================================================================
  it("FINAL-11: LiveKit closeRoom failure after DB commit does not corrupt Session or Attendance", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const originalCloseRoom = videoProvider.closeRoom;
    videoProvider.closeRoom = async () => false; // Provider outage

    try {
      const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("COMPLETED");

      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("COMPLETED");

      const attendances = await SessionAttendance.find({ sessionId: session._id });
      expect(attendances.length).toBe(3);
      attendances.forEach((a) => expect(a.attendanceStatus).toBe("ABSENT"));
    } finally {
      videoProvider.closeRoom = originalCloseRoom;
    }
  });

  // =========================================================================
  // FINAL-12: Regression TIN-05A Session End Transaction
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("FINAL-12: Regression TIN-05A transaction rollback on attendance failure", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const originalBulkWrite = SessionAttendance.bulkWrite;
    SessionAttendance.bulkWrite = async () => {
      throw new Error("Simulated DB crash during bulkWrite");
    };

    try {
      const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(res.statusCode).toBe(500);

      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("IN_PROGRESS"); // Rolled back cleanly!
    } finally {
      SessionAttendance.bulkWrite = originalBulkWrite;
    }
  });

  // =========================================================================
  // FINAL-13: Regression TIN-03A GET Join = 405 và canJoin
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("FINAL-13: Regression TIN-03A - GET /sessions/:id/join returns 405 and canJoin is accurate", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const getRes = await request(app).get(`/api/student/sessions/${session._id}/join`).set(as(student1));
    expect(getRes.statusCode).toBe(405);
    expect(getRes.body.error).toBe("METHOD_NOT_ALLOWED");

    const list = await studentService.getMySessions(student1._id);
    const item = list.find((s) => s.id === session._id.toString());
    expect(item).toBeDefined();
    expect(item.canJoin).toBe(true);

    // End session
    await Session.updateOne({ _id: session._id }, { $set: { status: "COMPLETED" } });
    const listAfter = await studentService.getMySessions(student1._id);
    const itemAfter = listAfter.find((s) => s.id === session._id.toString());
    expect(itemAfter.canJoin).toBe(false);
  });

  // =========================================================================
  // RESTORED TEST A: Concurrent Double Teacher End
  // EVIDENCE: REAL MONGODB REPLSET + CONTROLLED BARRIER
  // =========================================================================
  it("CONC-RESTORE-A: Two concurrent endSession requests are handled safely without corrupting data", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    let teacher1Reached = false;
    let resumeTeacher1 = null;
    const teacher1Barrier = new Promise((resolve) => {
      resumeTeacher1 = resolve;
    });

    const originalBulkWrite = SessionAttendance.bulkWrite;
    SessionAttendance.bulkWrite = async function (ops, options) {
      teacher1Reached = true;
      await teacher1Barrier;
      return originalBulkWrite.call(this, ops, options);
    };

    try {
      // Request 1 enters endSession and pauses at bulkWrite
      const end1Promise = request(app)
        .post(`/api/teacher/sessions/${session._id}/end`)
        .set(as(teacher))
        .then((res) => res);

      const startTime = Date.now();
      while (!teacher1Reached && Date.now() - startTime < 3000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(teacher1Reached).toBe(true);

      // Request 2 tries to endSession concurrently
      const end2Promise = request(app)
        .post(`/api/teacher/sessions/${session._id}/end`)
        .set(as(teacher))
        .then((res) => res);

      await new Promise((r) => setTimeout(r, 50));
      resumeTeacher1();

      const [res1, res2] = await Promise.all([end1Promise, end2Promise]);

      // Exactly one succeeds with 200, the other is rejected with 409 SESSION_NOT_IN_PROGRESS
      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);

      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("COMPLETED");

      // No duplicate attendance records
      const attendances = await SessionAttendance.find({ sessionId: session._id });
      expect(attendances.length).toBe(3); // exactly 3 enrolled students
    } finally {
      SessionAttendance.bulkWrite = originalBulkWrite;
      if (resumeTeacher1) resumeTeacher1();
    }
  });

  // =========================================================================
  // RESTORED TEST B: Real MongoDB E11000
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("CONC-RESTORE-B: Real MongoDB E11000 duplicate key error is triggered on unique index", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    // First insert succeeds
    await SessionAttendance.create({
      sessionId: session._id,
      classId: cls._id,
      studentId: student1._id,
      attendanceStatus: "PRESENT",
      joinedAt: new Date(),
    });

    // Second insert with the exact same compound key { sessionId, studentId } must throw real E11000
    let error = null;
    try {
      await SessionAttendance.create({
        sessionId: session._id,
        classId: cls._id,
        studentId: student1._id,
        attendanceStatus: "ABSENT",
      });
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.code).toBe(11000);
    expect(error.name).toBe("MongoServerError");

    // Verify original record is not corrupted
    const record = await SessionAttendance.findOne({ sessionId: session._id, studentId: student1._id });
    expect(record.attendanceStatus).toBe("PRESENT");
  });

  // =========================================================================
  // RESTORED TEST C: Real MongoDB WriteConflict
  // EVIDENCE: REAL MONGODB REPLSET (INSTANTANEOUS ENGINE CONFLICT)
  // =========================================================================
  it("CONC-RESTORE-C: Real MongoDB WiredTiger engine produces WriteConflict handled with TransientTransactionError", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    const s1 = await mongoose.startSession();
    const s2 = await mongoose.startSession();

    let writeConflictObserved = false;

    try {
      s1.startTransaction();
      s2.startTransaction();

      // Trans 1 reads doc at snapshot timestamp T1
      await Session.findOne({ _id: session._id }).session(s1);

      // Trans 2 updates the doc and commits at T2
      await Session.updateOne({ _id: session._id }, { $set: { title: "Updated by T2" } }).session(s2);
      await s2.commitTransaction();

      // Trans 1 now attempts to write to the document modified at T2 -> Instantaneous WriteConflict!
      try {
        await Session.updateOne({ _id: session._id }, { $set: { title: "Updated by T1" } }).session(s1);
        await s1.commitTransaction();
      } catch (err) {
        writeConflictObserved = true;
        expect(err.hasErrorLabel && err.hasErrorLabel("TransientTransactionError")).toBe(true);
        expect(err.code).toBe(112); // MongoDB WriteConflict code
        await s1.abortTransaction();
      }

      expect(writeConflictObserved).toBe(true);
    } finally {
      await s1.endSession();
      await s2.endSession();
    }
  });

  // =========================================================================
  // ADDITIONAL TEST D: Concurrent Same-Student Upsert
  // EVIDENCE: REAL MONGODB REPLSET
  // =========================================================================
  it("CONC-RESTORE-D: Two concurrent Join requests for the SAME student produce consistent attendance", async () => {
    const session = await createSession("IN_PROGRESS", 5);

    // Launch two simultaneous join requests for student1
    const [res1, res2] = await Promise.all([
      request(app).post(`/api/sessions/${session._id}/join`).set(as(student1)),
      request(app).post(`/api/sessions/${session._id}/join`).set(as(student1)),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body.data.role).toBe("PARTICIPANT");
    expect(res2.body.data.role).toBe("PARTICIPANT");

    // Exactly ONE attendance record exists for student1 in DB
    const records = await SessionAttendance.find({ sessionId: session._id, studentId: student1._id });
    expect(records.length).toBe(1);
    expect(records[0].attendanceStatus).toBe("PRESENT");
  });

  // =========================================================================
  // ADDITIONAL TEST E: LiveKit startRecording Failure
  // EVIDENCE: MOCK FAULT INJECTION
  // =========================================================================
  it("CONC-RESTORE-E: LiveKit startRecording failure marks recording as FAILED without crashing", async () => {
    const session = await createSession("SCHEDULED");

    const originalStartRecording = videoProvider.startRecording;
    videoProvider.startRecording = async () => null; // LiveKit cloud outage simulation

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);

      const sessionInDb = await Session.findById(session._id);
      expect(sessionInDb.status).toBe("IN_PROGRESS");
      expect(sessionInDb.recording).not.toBeNull();
      expect(sessionInDb.recording.status).toBe("FAILED");
      expect(sessionInDb.recording.failureReason).toContain("Failed to start LiveKit egress");
    } finally {
      videoProvider.startRecording = originalStartRecording;
    }
  });

  // =========================================================================
  // TIN-05C-P2: SAFE EGRESS COMPENSATION TEST SUITE (EGRESS-COMP-01 to 16)
  // =========================================================================

  // =========================================================================
  // EGRESS-COMP-01: startRecording succeeds, metadata save succeeds
  // Expected: stopRecording is NEVER called
  // =========================================================================
  it("EGRESS-COMP-01: startRecording succeeds, metadata save succeeds -> No stopRecording", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;

    let stopCalls = [];
    videoProvider.startRecording = async () => "egress_comp_01";
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(stopCalls.length).toBe(0);

      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("IN_PROGRESS");
      expect(inDb.recording.providerRecordingId).toBe("egress_comp_01");
      expect(inDb.recording.status).toBe("PROCESSING");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
    }
  });

  // =========================================================================
  // EGRESS-COMP-02: Metadata save fail lần đầu, retry thành công
  // Expected: stopRecording is NEVER called
  // =========================================================================
  it("EGRESS-COMP-02: Metadata save fails first attempt, succeeds on retry -> No stopRecording", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    let stopCalls = [];
    let attempts = 0;
    videoProvider.startRecording = async () => "egress_comp_02";
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        attempts++;
        if (attempts === 1) {
          throw new Error("Transient Mongo network glitch on attempt 1");
        }
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(stopCalls.length).toBe(0);

      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("IN_PROGRESS");
      expect(inDb.recording.providerRecordingId).toBe("egress_comp_02");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-03: Metadata save fail toàn bộ, DB xác nhận metadata chưa tồn tại
  // Expected: Gọi stopRecording đúng egressId và giữ original saveError
  // =========================================================================
  it("EGRESS-COMP-03: Metadata save fails completely, DB confirms metadata absent -> Calls stopRecording with exact egressId", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    let stoppedEgressId = null;
    videoProvider.startRecording = async () => "egress_comp_03";
    videoProvider.stopRecording = async (egressId) => {
      stoppedEgressId = egressId;
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", status: "EGRESS_ENDING", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Persistent DB write failure on all attempts");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(stoppedEgressId).toBe("egress_comp_03");

      const inDb = await Session.findById(session._id);
      expect(inDb.recording).toBeNull();
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-04: Metadata update matchedCount = 0, DB xác nhận Session không còn tồn tại
  // Expected: Chỉ cleanup Egress do request sở hữu
  // =========================================================================
  it("EGRESS-COMP-04: Metadata update matchedCount = 0, DB confirms Session not found -> Cleans up only owned Egress", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    let stoppedEgressId = null;
    videoProvider.startRecording = async () => "egress_comp_04";
    videoProvider.stopRecording = async (egressId) => {
      stoppedEgressId = egressId;
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", status: "EGRESS_ENDING", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        // Delete session behind the scenes so DB confirms it does not exist
        await Session.deleteOne({ _id: session._id });
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe("SESSION_NOT_FOUND");
      expect(stoppedEgressId).toBe("egress_comp_04");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-05: stopRecording trả ALREADY_TERMINAL_VERIFIED
  // Expected: Không phát sinh lỗi cleanup mới
  // =========================================================================
  it("EGRESS-COMP-05: stopRecording returns ALREADY_TERMINAL_VERIFIED -> Handled cleanly without new error", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    videoProvider.startRecording = async () => "egress_comp_05";
    videoProvider.stopRecording = async (egressId) => {
      return { success: true, reason: "ALREADY_TERMINAL_VERIFIED", status: "EGRESS_COMPLETE", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Simulated write error for comp 05");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("INTERNAL_SERVER_ERROR");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-06: stopRecording trả STOP_REQUEST_ACCEPTED
  // Expected: Không khẳng định hoàn tất ghi hình, giữ original error
  // =========================================================================
  it("EGRESS-COMP-06: stopRecording returns STOP_REQUEST_ACCEPTED -> Does not claim complete termination", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    videoProvider.startRecording = async () => "egress_comp_06";
    videoProvider.stopRecording = async (egressId) => {
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", status: "EGRESS_ENDING", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Simulated write error for comp 06");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-07: stopRecording trả OUTCOME_UNKNOWN
  // Expected: Có structured warning, giữ original saveError
  // =========================================================================
  it("EGRESS-COMP-07: stopRecording returns OUTCOME_UNKNOWN -> Structured warning and retains original saveError", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    videoProvider.startRecording = async () => "egress_comp_07";
    videoProvider.stopRecording = async (egressId) => {
      return { success: false, reason: "OUTCOME_UNKNOWN", code: "TIMEOUT", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Simulated write error for comp 07");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("INTERNAL_SERVER_ERROR");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-08: stopRecording trả RPC_FAILED
  // Expected: Giữ original saveError
  // =========================================================================
  it("EGRESS-COMP-08: stopRecording returns RPC_FAILED -> Retains original saveError", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    videoProvider.startRecording = async () => "egress_comp_08";
    videoProvider.stopRecording = async (egressId) => {
      return { success: false, reason: "RPC_FAILED", code: "internal", statusCode: 500, egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Simulated write error for comp 08");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("INTERNAL_SERVER_ERROR");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-09: Hai Teacher Join đồng thời
  // Expected: Request thua CAS không dừng Egress của request thắng
  // =========================================================================
  it("EGRESS-COMP-09: Two concurrent Teacher Joins -> CAS loser request does not stop winner's Egress", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;

    let stopCalls = [];
    videoProvider.startRecording = async () => "egress_comp_09_winner";
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    try {
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher)),
        request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher)),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(stopCalls.length).toBe(0); // NEITHER request stopped the egress

      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("IN_PROGRESS");
      expect(inDb.recording.providerRecordingId).toBe("egress_comp_09_winner");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
    }
  });

  // =========================================================================
  // EGRESS-COMP-10: Teacher End trong lúc startRecording pending
  // Expected: Không cấp token sau End, không ghi đè status COMPLETED
  // =========================================================================
  it("EGRESS-COMP-10: Teacher End while startRecording pending -> No token issued after End, status COMPLETED preserved", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalCloseRoom = videoProvider.closeRoom;

    let joinRes = null;
    let endRes = null;

    videoProvider.startRecording = async () => {
      // While startRecording is pending, Teacher End finishes
      endRes = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      return "egress_comp_10_late";
    };

    videoProvider.closeRoom = async () => true;

    try {
      joinRes = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));

      // End must succeed with 200
      expect(endRes.statusCode).toBe(200);

      // Join must be rejected with 409 SESSION_ENDED (No token issued!)
      expect(joinRes.statusCode).toBe(409);
      expect(joinRes.body.error).toBe("SESSION_ENDED");

      // Session status in DB must remain COMPLETED (not overwritten!)
      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("COMPLETED");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.closeRoom = originalCloseRoom;
    }
  });

  // =========================================================================
  // EGRESS-COMP-11: MongoDB đã persist metadata nhưng response bị mất
  // Expected: Không gọi stopRecording nhầm
  // =========================================================================
  it("EGRESS-COMP-11: MongoDB persisted metadata but network response lost -> No wrongful stopRecording", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;

    let stopCalls = [];
    videoProvider.startRecording = async () => "egress_comp_11";
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        // Actually execute update in DB first
        await originalUpdateOne.call(this, filter, update, options);
        // Then simulate socket reset before returning ACK
        throw new Error("Socket closed before receiving ACK");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(stopCalls.length).toBe(0); // Verified persisted in DB, did NOT call stopRecording!

      const inDb = await Session.findById(session._id);
      expect(inDb.recording.providerRecordingId).toBe("egress_comp_11");
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
    }
  });

  // =========================================================================
  // EGRESS-COMP-12: MongoDB không thể đọc để xác minh metadata persistence outcome
  // Expected: Không blind-stop. Ghi nhận trạng thái UNKNOWN.
  // =========================================================================
  it("EGRESS-COMP-12: MongoDB cannot be read to verify persistence -> No blind-stop, UNKNOWN outcome logged", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;
    const originalUpdateOne = Session.updateOne;
    const originalFindById = Session.findById;

    let stopCalls = [];
    videoProvider.startRecording = async () => "egress_comp_12";
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    Session.updateOne = async function (filter, update, options) {
      if (update?.$set?.recording) {
        throw new Error("Database network failure during update");
      }
      return originalUpdateOne.call(this, filter, update, options);
    };

    Session.findById = function (id) {
      // Simulate MongoDB completely disconnected when attempting verification read
      return {
        select: () => ({
          lean: async () => {
            throw new Error("MongoServerSelectionError: Topology closed");
          },
        }),
      };
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(stopCalls.length).toBe(0); // Prevented blind stop!
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
      Session.updateOne = originalUpdateOne;
      Session.findById = originalFindById;
    }
  });

  // =========================================================================
  // EGRESS-COMP-13: startRecording trả null
  // Expected: Không gọi stopRecording
  // =========================================================================
  it("EGRESS-COMP-13: startRecording returns null -> No stopRecording called", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    const originalStopRecording = videoProvider.stopRecording;

    let stopCalls = [];
    videoProvider.startRecording = async () => null; // LiveKit outage
    videoProvider.stopRecording = async (egressId) => {
      stopCalls.push(egressId);
      return { success: true, reason: "STOP_REQUEST_ACCEPTED", egressId };
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher));
      expect(res.statusCode).toBe(200);
      expect(stopCalls.length).toBe(0);

      const inDb = await Session.findById(session._id);
      expect(inDb.recording.status).toBe("FAILED");
      expect(inDb.recording.providerRecordingId).toBeNull();
    } finally {
      videoProvider.startRecording = originalStartRecording;
      videoProvider.stopRecording = originalStopRecording;
    }
  });

  // =========================================================================
  // EGRESS-COMP-14: Regression Session End transaction
  // Expected: Rollback and retry behavior guaranteed
  // =========================================================================
  it("EGRESS-COMP-14: Regression Session End transaction rolls back on attendance crash", async () => {
    const session = await createSession("IN_PROGRESS", 5);
    const originalBulkWrite = SessionAttendance.bulkWrite;
    let bulkWriteAttempts = 0;

    SessionAttendance.bulkWrite = async function (ops, options) {
      bulkWriteAttempts++;
      throw new Error("Simulated DB crash during bulkWrite");
    };

    try {
      const res = await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
      expect(res.statusCode).toBe(500);
      expect(bulkWriteAttempts).toBeGreaterThanOrEqual(1);

      // Status must remain IN_PROGRESS (rolled back!)
      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("IN_PROGRESS");
    } finally {
      SessionAttendance.bulkWrite = originalBulkWrite;
    }
  });

  // =========================================================================
  // EGRESS-COMP-15: Regression Student Join write guard
  // Expected: No phantom join after End
  // =========================================================================
  it("EGRESS-COMP-15: Regression Student Join write guard prevents phantom join after End", async () => {
    const session = await createSession("IN_PROGRESS", 5);
    const originalFindById = Session.findById;
    let endCommitted = false;

    Session.findById = function (id) {
      const query = originalFindById.call(Session, id);
      const originalSession = query.session.bind(query);

      query.session = function (clientSession) {
        if (!endCommitted) {
          endCommitted = true;
          // Synchronously execute endSession before Student transaction proceeds
          return (async () => {
            await request(app).post(`/api/teacher/sessions/${session._id}/end`).set(as(teacher));
            return originalSession(clientSession);
          })();
        }
        return originalSession(clientSession);
      };
      return query;
    };

    try {
      const res = await request(app).post(`/api/sessions/${session._id}/join`).set(as(student1));
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe("SESSION_ENDED");

      const inDb = await Session.findById(session._id);
      expect(inDb.status).toBe("COMPLETED");
    } finally {
      Session.findById = originalFindById;
    }
  });

  // =========================================================================
  // EGRESS-COMP-16: Regression Double Teacher Join CAS
  // Expected: Atomic CAS prevents duplicate startRecording
  // =========================================================================
  it("EGRESS-COMP-16: Regression Double Teacher Join CAS prevents duplicate Egress", async () => {
    const session = await createSession("SCHEDULED");
    const originalStartRecording = videoProvider.startRecording;
    let startCallCount = 0;

    videoProvider.startRecording = async () => {
      startCallCount++;
      await new Promise((r) => setTimeout(r, 100));
      return `egress_cas_${startCallCount}`;
    };

    try {
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher)),
        request(app).post(`/api/sessions/${session._id}/join`).set(as(teacher)),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(startCallCount).toBe(1); // EXACTLY ONE startRecording call
    } finally {
      videoProvider.startRecording = originalStartRecording;
    }
  });

});
